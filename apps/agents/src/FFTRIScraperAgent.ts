/**
 * Agent de scraping du calendrier FFTRI (Fédération Française de Triathlon)
 *
 * Cet agent scrape automatiquement le calendrier FFTRI pour:
 * - Extraire les événements de triathlon/multisport par ligues et par mois
 * - Matcher les événements avec les événements existants dans Miles Republic
 * - Créer des propositions de création/modification d'événements, éditions et courses
 *
 * Architecture calquée sur FFAScraperAgent mais simplifiée:
 * - Pas d'inferRaceCategories() -> utilise mapFFTRISportToCategory()
 * - Pas de matching complexe de courses par distance -> categoryLevel2 + format
 * - Pas de normalizeFFARaceName() -> noms générés depuis sport type + format
 * - Pas de LLM extraction -> données structurées directement depuis le HTML
 */

import { AGENT_VERSIONS, FFTRIScraperAgentConfigSchema, getAgentName } from '@data-agents/types'
import type { ProposalInput, ProposalRaceInput } from '@data-agents/types'
import {
  BaseAgent, AgentContext, AgentRunResult, ProposalData, ProposalType, AgentType,
  MeilisearchMatchingConfig, LLMMatchingConfig, LLMMatchingService,
  reviewEditionUpdateConfidence, cleanEventNameWithLLM,
  getDepartmentName, normalizeDepartmentCode
} from '@data-agents/agent-framework'
import {
  buildNewEventChanges as sharedBuildNewEventChanges,
  buildEditionUpdateChanges as sharedBuildEditionUpdateChanges
} from '@data-agents/agent-framework'
import pLimit from 'p-limit'

import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'

// FFTRI modules
import {
  FFTRIScraperConfig,
  FFTRIEventDetails,
  FFTRIScrapingProgress,
  FFTRIMatchResult,
  FFTRI_LIGUES,
  convertFFTRILigueToRegionName,
  convertFFTRILigueToDisplayCode,
  mapFFTRISportToCategory
} from './fftri/types'
import {
  fetchAllEventsForLigueMonth,
  fetchEventDetails,
  generateMonthsToScrape,
  formatMonthKey,
  humanDelay
} from './fftri/scraper'
import { matchFFTRIEvent, calculateAdjustedConfidence, calculateNewEventConfidence } from './fftri/matcher'
import { getStandardDistances } from './fftri/distances'
import { hasIdenticalPendingProposal, filterNewChanges } from './fftri/deduplication'

// Version exportée pour compatibilité
export const FFTRI_SCRAPER_AGENT_VERSION = AGENT_VERSIONS.FFTRI_SCRAPER_AGENT

// ============================================================================
// HELPERS
// ============================================================================

const SPORT_NAMES: Record<string, string> = {
  'TRI': 'Triathlon',
  'DUA': 'Duathlon',
  'X-DUA': 'Cross Duathlon',
  'AQUA': 'Aquathlon',
  'X-TRI': 'Cross Triathlon',
  'S&R': 'Swim & Run',
  'S&B': 'Swim & Bike',
  'B&R': 'Bike & Run',
  'RAID': 'Raid',
}

/**
 * Generate a readable race name from sport type and format.
 * e.g. "Triathlon S", "Duathlon M", "Cross Triathlon XS"
 */
function generateRaceName(sportType: string, format: string): string {
  const sportName = SPORT_NAMES[sportType] || sportType
  // Strip -OP, -EQ, -CLM, -OPEN suffixes from format for display
  const cleanFormat = format.replace(/-(OP|EQ|CLM|OPEN)$/i, '').replace(/-OP-.*$/i, '')
  return `${sportName} ${cleanFormat}`
}

/**
 * Strip " (XX)" department suffix from FFTRI event names.
 * e.g. "Triathlon de Nice (06)" -> "Triathlon de Nice"
 */
function cleanFFTRIEventName(name: string): string {
  return name.replace(/\s*\(\d{2,3}\)\s*$/, '').trim()
}

// ============================================================================
// AGENT
// ============================================================================

export class FFTRIScraperAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma
  private meilisearchConfig?: MeilisearchMatchingConfig
  private llmConfig?: LLMMatchingConfig

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'fftri-scraper-agent',
      name: config.name || getAgentName('FFTRI_SCRAPER'),
      description: `Agent qui scrape le calendrier FFTRI pour extraire les événements de triathlon/multisport (v${FFTRI_SCRAPER_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 */12 * * *',
      isActive: config.isActive ?? true,
      config: {
        version: FFTRI_SCRAPER_AGENT_VERSION,
        sourceDatabase: config.sourceDatabase || config.config?.sourceDatabase,
        liguesPerRun: config.liguesPerRun || config.config?.liguesPerRun || 2,
        monthsPerRun: config.monthsPerRun || config.config?.monthsPerRun || 1,
        scrapingWindowMonths: config.scrapingWindowMonths || config.config?.scrapingWindowMonths || 6,
        rescanDelayDays: config.rescanDelayDays || config.config?.rescanDelayDays || 30,
        humanDelayMs: config.humanDelayMs || config.config?.humanDelayMs || 2000,
        similarityThreshold: config.similarityThreshold || config.config?.similarityThreshold || 0.75,
        distanceTolerancePercent: config.distanceTolerancePercent || config.config?.distanceTolerancePercent || 0.1,
        confidenceBase: config.confidenceBase || config.config?.confidenceBase || 0.9,
        maxEventsPerMonth: config.maxEventsPerMonth || config.config?.maxEventsPerMonth || 200,
        configSchema: FFTRIScraperAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  // --------------------------------------------------------------------------
  // Database connection
  // --------------------------------------------------------------------------

  private async initializeSourceConnection(config: FFTRIScraperConfig): Promise<void> {
    if (!this.sourceDb) {
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
    }
  }

  // --------------------------------------------------------------------------
  // LLM API key
  // --------------------------------------------------------------------------

  private async getLLMApiKeyFromSettings(): Promise<string | undefined> {
    try {
      const settings = await this.prisma.settings.findFirst()
      if (settings?.enableLlmMatching && settings?.llmMatchingApiKey) {
        return settings.llmMatchingApiKey
      }
    } catch {
      // Settings table may not exist or be accessible
    }
    return undefined
  }

  // --------------------------------------------------------------------------
  // Progress management
  // --------------------------------------------------------------------------

  private async loadProgress(): Promise<FFTRIScrapingProgress> {
    const progress = await this.stateService.getState<FFTRIScrapingProgress>(
      this.config.id,
      'progress'
    )

    if (progress) {
      return progress
    }

    // Initial state
    const firstMonth = generateMonthsToScrape(1)[0]
    return {
      currentLigue: FFTRI_LIGUES[0],
      currentMonth: formatMonthKey(firstMonth),
      currentPage: 0,
      completedLigues: [],
      completedMonths: {},
      totalEventsScraped: 0
    }
  }

  private async saveProgress(progress: FFTRIScrapingProgress): Promise<void> {
    await this.stateService.setState(this.config.id, 'progress', progress)
  }

  // --------------------------------------------------------------------------
  // Target selection (ligue/month rotation)
  // --------------------------------------------------------------------------

  private getNextTargets(
    progress: FFTRIScrapingProgress,
    config: FFTRIScraperConfig
  ): { ligues: string[], months: string[] } {
    // Generate all months in window
    const allMonthTargets = generateMonthsToScrape(config.scrapingWindowMonths)
    const allMonths = allMonthTargets.map(formatMonthKey)

    // Check if full cycle is complete
    const allLiguesCompleted = FFTRI_LIGUES.every(ligue => {
      const completedMonthsForLigue = progress.completedMonths[ligue] || []
      return allMonths.every(month => completedMonthsForLigue.includes(month))
    })

    if (allLiguesCompleted && progress.lastCompletedAt) {
      const daysSinceLastComplete =
        (Date.now() - new Date(progress.lastCompletedAt).getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceLastComplete < config.rescanDelayDays) {
        this.logger.info(`⏸️  Cooldown actif: ${Math.ceil(daysSinceLastComplete)}/${config.rescanDelayDays} jours écoulés depuis le dernier cycle complet`)
        return { ligues: [], months: [] }
      }

      this.logger.info(`🔄 Cooldown terminé (${Math.ceil(daysSinceLastComplete)} jours), redémarrage d'un nouveau cycle complet`)
      progress.completedMonths = {}
      progress.currentLigue = FFTRI_LIGUES[0]
      progress.currentMonth = allMonths[0]
    }

    // Determine current month index
    let currentMonthIndex = allMonths.indexOf(progress.currentMonth)

    if (currentMonthIndex === -1) {
      this.logger.info(`⚠️  Mois actuel ${progress.currentMonth} expiré, redémarrage au mois: ${allMonths[0]}`)
      currentMonthIndex = 0
      progress.currentMonth = allMonths[0]
    }

    // Months for this run
    const months: string[] = []
    for (let i = 0; i < config.monthsPerRun && currentMonthIndex + i < allMonths.length; i++) {
      months.push(allMonths[currentMonthIndex + i])
    }

    // Ligues for this run
    const currentLigueIndex = FFTRI_LIGUES.indexOf(progress.currentLigue as any)
    const ligues: string[] = []

    for (let i = currentLigueIndex; i < FFTRI_LIGUES.length && ligues.length < config.liguesPerRun; i++) {
      const ligue = FFTRI_LIGUES[i]
      const completedForLigue = progress.completedMonths[ligue] || []
      const needsProcessing = months.some(month => !completedForLigue.includes(month))

      if (needsProcessing) {
        ligues.push(ligue)
      } else {
        this.logger.debug?.(`⏭️  Ligue ${ligue} déjà complétée pour les mois [${months.join(', ')}], skip`)
      }
    }

    // If all ligues completed for these months, advance to next months
    if (ligues.length === 0 && months.length > 0) {
      const nextMonthIndex = currentMonthIndex + config.monthsPerRun

      if (nextMonthIndex < allMonths.length) {
        this.logger.info(`✅ Tous les mois [${months.join(', ')}] complétés pour toutes les ligues, passage aux mois suivants`)
        progress.currentMonth = allMonths[nextMonthIndex]
        progress.currentLigue = FFTRI_LIGUES[0]
        return this.getNextTargets(progress, config)
      }
    }

    // Update currentLigue if we skipped completed ones
    if (ligues.length > 0 && ligues[0] !== progress.currentLigue) {
      this.logger.info(`⏭️  Avance à la ligue ${ligues[0]} (${progress.currentLigue} déjà complétée pour ces mois)`)
      progress.currentLigue = ligues[0] as typeof FFTRI_LIGUES[number]
    }

    return { ligues, months }
  }

  // --------------------------------------------------------------------------
  // Timezone
  // --------------------------------------------------------------------------

  private getTimezoneIANA(ligue: string): string {
    const ligueTimezones: Record<string, string> = {
      'GP': 'America/Guadeloupe',
      'MQ': 'America/Martinique',
      'RE': 'Indian/Reunion',
      'NC': 'Pacific/Noumea',
      'PF': 'Pacific/Tahiti',
    }

    return ligueTimezones[ligue] || 'Europe/Paris'
  }

  // --------------------------------------------------------------------------
  // Scraping
  // --------------------------------------------------------------------------

  private async scrapeLigueMonth(
    ligue: string,
    monthKey: string,
    config: FFTRIScraperConfig,
    context: AgentContext
  ): Promise<FFTRIEventDetails[]> {
    // Parse monthKey "YYYY-MM" to get year and month number
    const [yearStr, monthStr] = monthKey.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)

    context.logger.info(`🔍 Scraping FFTRI ${ligue} - ${monthKey}...`)

    // Fetch all events for this ligue/month
    const events = await fetchAllEventsForLigueMonth(
      ligue,
      month,
      year,
      config.humanDelayMs
    )

    context.logger.info(`📊 ${events.length} événements trouvés pour ${ligue} - ${monthKey}`)

    // Limit per month if configured
    const limitedEvents = config.maxEventsPerMonth
      ? events.slice(0, config.maxEventsPerMonth)
      : events

    // Fetch details for each event with concurrency limit
    const limit = pLimit(3)
    const detailsPromises = limitedEvents.map(event =>
      limit(() => fetchEventDetails(event))
    )

    const details = await Promise.all(detailsPromises)

    return details.filter((d): d is FFTRIEventDetails => d !== null)
  }

  // --------------------------------------------------------------------------
  // ProposalInput conversion
  // --------------------------------------------------------------------------

  /**
   * Convert FFTRIEventDetails to a ProposalInput.
   *
   * For FFTRI, races have separate swim/bike/run distances from the reference table.
   * Since ProposalRaceInput only has a single `distance` field, we don't set it.
   * Instead, we patch individual distance fields after the builder runs.
   */
  private toProposalInput(eventDetails: FFTRIEventDetails, ligue?: string): ProposalInput {
    const resolvedLigue = ligue || eventDetails.event.ligue
    const timeZone = this.getTimezoneIANA(resolvedLigue)
    const editionDate = eventDetails.startDate

    // Convert FFTRI races to ProposalRaceInput[]
    const races: ProposalRaceInput[] = []

    for (const race of eventDetails.event.races) {
      const category = mapFFTRISportToCategory(race.sportType, race.format)
      if (!category) continue // Skip ignored disciplines (CYCL)

      races.push({
        name: generateRaceName(race.sportType, race.format),
        categoryLevel1: category.categoryLevel1,
        categoryLevel2: category.categoryLevel2,
        // No single 'distance' -- we set swim/bike/run separately after builder runs
      })
    }

    // Clean event name: strip " (XX)" department suffix
    const cleanedName = cleanFFTRIEventName(eventDetails.event.name)

    // Build organizer info
    const organizer = eventDetails.organizerName ? {
      name: eventDetails.organizerName,
      websiteUrl: eventDetails.organizerWebsite,
    } : undefined

    return {
      eventName: cleanedName,
      eventCity: eventDetails.event.city,
      eventCountry: 'France',
      eventDepartment: eventDetails.event.department,
      countrySubdivisionNameLevel1: convertFFTRILigueToRegionName(resolvedLigue),
      countrySubdivisionDisplayCodeLevel1: convertFFTRILigueToDisplayCode(resolvedLigue),
      countrySubdivisionNameLevel2: getDepartmentName(eventDetails.event.department),
      countrySubdivisionDisplayCodeLevel2: normalizeDepartmentCode(eventDetails.event.department),
      editionYear: editionDate.getFullYear(),
      editionDate: `${editionDate.getUTCFullYear()}-${String(editionDate.getUTCMonth() + 1).padStart(2, '0')}-${String(editionDate.getUTCDate()).padStart(2, '0')}`,
      editionEndDate: eventDetails.endDate
        ? `${eventDetails.endDate.getUTCFullYear()}-${String(eventDetails.endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(eventDetails.endDate.getUTCDate()).padStart(2, '0')}`
        : undefined,
      timeZone,
      calendarStatus: 'CONFIRMED',
      dataSource: 'FEDERATION',
      races,
      organizer,
      websiteUrl: eventDetails.organizerWebsite,
      confidence: 0.9,
      source: 'fftri',
    }
  }

  /**
   * Patch swim/bike/run distances from the FFTRI reference table
   * into the race objects within the changes object.
   *
   * The shared builder doesn't know about separate disciplines,
   * so we add swimDistance/bikeDistance/runDistance after it runs.
   */
  private patchDistancesIntoChanges(
    changes: Record<string, any>,
    eventDetails: FFTRIEventDetails
  ): void {
    // For NEW_EVENT: races are in changes.edition.new.races
    const editionRaces = changes.edition?.new?.races
    if (!editionRaces || !Array.isArray(editionRaces)) return

    // Build a mapping of race index to FFTRI race (skipping CYCL)
    const validRaces = eventDetails.event.races.filter(
      r => mapFFTRISportToCategory(r.sportType, r.format) !== null
    )

    for (let i = 0; i < editionRaces.length && i < validRaces.length; i++) {
      const fftriRace = validRaces[i]
      const distances = getStandardDistances(fftriRace.sportType, fftriRace.format)

      if (distances) {
        // swimDistance in DB is in meters (per CLAUDE.md)
        if (distances.swimDistance !== undefined) {
          editionRaces[i].swimDistance = distances.swimDistance
        }
        // bikeDistance and runDistance in DB are in km
        if (distances.bikeDistance !== undefined) {
          editionRaces[i].bikeDistance = distances.bikeDistance
        }
        if (distances.runDistance !== undefined) {
          editionRaces[i].runDistance = distances.runDistance
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Compare FFTRI data with existing edition (for EDITION_UPDATE)
  // --------------------------------------------------------------------------

  private async compareFFTRIWithEdition(
    eventDetails: FFTRIEventDetails,
    edition: any,
    event: any,
    confidence: number
  ): Promise<{ changes: any, justifications: any[] }> {
    const justifications: any[] = []
    const existingRaces = edition.races || []

    const proposalInput = this.toProposalInput(eventDetails)
    proposalInput.confidence = confidence

    // Build a matchResult-like object for the builder
    const builderMatchResult = {
      edition: {
        ...edition,
        startDate: edition.startDate,
        endDate: edition.endDate,
        timeZone: edition.timeZone,
        calendarStatus: edition.calendarStatus,
        editionPartners: edition.editionPartners || [],
      },
      event: event
    }

    // Use LLM race matching if available
    const llmRaceContext = this.llmConfig ? {
      llmService: new LLMMatchingService(this.llmConfig, this.logger),
      eventName: eventDetails.event.name,
      editionYear: eventDetails.startDate.getFullYear(),
      eventCity: eventDetails.event.city,
    } : undefined

    const changes = await sharedBuildEditionUpdateChanges(
      proposalInput,
      builderMatchResult,
      existingRaces,
      undefined, // No pre-matched races -- let the builder match
      llmRaceContext
    )

    // Build justifications based on changes
    if (changes.startDate) {
      justifications.push({
        type: 'text',
        content: `Date FFTRI différente: ${changes.startDate.new?.toISOString()} vs ${changes.startDate.old?.toISOString()}`,
        metadata: {
          fftriDate: changes.startDate.new?.toISOString(),
          dbDate: changes.startDate.old?.toISOString(),
          source: eventDetails.event.detailUrl
        }
      })
    }

    if (changes.timeZone) {
      justifications.push({
        type: 'text',
        content: `TimeZone FFTRI: ${changes.timeZone.new} (ligue ${eventDetails.event.ligue})`,
        metadata: {
          oldTimeZone: changes.timeZone.old,
          newTimeZone: changes.timeZone.new,
          ligue: eventDetails.event.ligue,
          source: eventDetails.event.detailUrl
        }
      })
    }

    if (changes.calendarStatus) {
      justifications.push({
        type: 'text',
        content: `Confirmation depuis FFTRI (source officielle)`,
        metadata: {
          oldStatus: changes.calendarStatus.old,
          source: eventDetails.event.detailUrl
        }
      })
    }

    if (changes.organizer) {
      justifications.push({
        type: 'text',
        content: `Organisateur FFTRI: ${eventDetails.organizerName}`,
        metadata: {
          oldOrganizer: changes.organizer.old?.name,
          newOrganizer: changes.organizer.new?.name,
          source: eventDetails.event.detailUrl
        }
      })
    }

    if (changes.racesToAdd) {
      justifications.push({
        type: 'text',
        content: `${changes.racesToAdd.new.length} nouvelle(s) course(s) FFTRI détectée(s)`,
        metadata: {
          races: changes.racesToAdd.new.map((r: any) => r.name),
          source: eventDetails.event.detailUrl
        }
      })
    }

    if (changes.racesToUpdate) {
      justifications.push({
        type: 'text',
        content: `${changes.racesToUpdate.new.length} course(s) à mettre à jour`,
        metadata: {
          races: changes.racesToUpdate.new.map((r: any) => ({ name: r.raceName, updates: r.updates })),
          source: eventDetails.event.detailUrl
        }
      })
    }

    if (changes.racesExisting) {
      const racesWithDateCascade = changes.racesExisting.new.filter((r: any) => {
        const original = existingRaces.find((er: any) => er.id === r.raceId)
        if (!original || !original.startDate || !r.startDate) return false
        return new Date(original.startDate).getTime() !== new Date(r.startDate).getTime()
      })
      if (racesWithDateCascade.length > 0) {
        justifications.push({
          type: 'text',
          content: `${racesWithDateCascade.length} course(s) existante(s) non matchée(s) - Mise à jour vers nouvelle date d'édition`,
          metadata: {
            unmatchedRaces: racesWithDateCascade.map((r: any) => r.raceName),
            source: eventDetails.event.detailUrl
          }
        })
      }
    }

    return { changes, justifications }
  }

  // --------------------------------------------------------------------------
  // Proposal creation
  // --------------------------------------------------------------------------

  private async createProposalsForCompetition(
    eventDetails: FFTRIEventDetails,
    matchResult: FFTRIMatchResult,
    config: FFTRIScraperConfig,
    context: AgentContext,
    proposalsCache?: Map<string, Set<string>>
  ): Promise<ProposalData[]> {
    const proposals: ProposalData[] = []

    // Calculate confidence
    let confidence: number
    if (matchResult.type === 'NO_MATCH') {
      confidence = matchResult.llmNewEventConfidence ??
        calculateNewEventConfidence(config.confidenceBase, eventDetails, matchResult)
    } else {
      confidence = calculateAdjustedConfidence(config.confidenceBase, eventDetails, matchResult)
    }

    if (matchResult.type === 'NO_MATCH') {
      // Build NEW_EVENT proposal via shared builder
      const proposalInput = this.toProposalInput(eventDetails)
      proposalInput.confidence = confidence

      // Clean event name via LLM if available
      if (matchResult.llmCleanedEventName) {
        proposalInput.eventName = matchResult.llmCleanedEventName
      } else if (this.llmConfig?.apiKey) {
        proposalInput.eventName = await cleanEventNameWithLLM(
          proposalInput.eventName,
          { apiKey: this.llmConfig.apiKey }
        )
      }

      const changes = sharedBuildNewEventChanges(proposalInput)

      // Patch individual swim/bike/run distances into race objects
      this.patchDistancesIntoChanges(changes, eventDetails)

      proposals.push({
        type: ProposalType.NEW_EVENT,
        changes,
        confidence,
        justification: [{
          type: 'text',
          content: `Nouvel événement FFTRI: ${eventDetails.event.name}`,
          metadata: {
            eventName: eventDetails.event.name,
            eventCity: eventDetails.event.city,
            editionYear: eventDetails.startDate.getFullYear(),
            fftriId: eventDetails.event.fftriId,
            confidence,
            matchScore: matchResult.confidence,
            source: eventDetails.event.detailUrl,
            rejectedMatches: matchResult.rejectedMatches || [],
            llmNewEventConfidence: matchResult.llmNewEventConfidence,
            llmReason: matchResult.llmReason,
          }
        }]
      })
    } else if (matchResult.type === 'FUZZY_MATCH' || matchResult.type === 'EXACT_MATCH') {
      // Check if event is featured (should not be modified)
      const eventData = await this.sourceDb.event.findUnique({
        where: { id: parseInt(matchResult.event!.id, 10) },
        select: { isFeatured: true }
      })

      if (eventData?.isFeatured) {
        context.logger.info(`⚠️  Événement featured ignoré: ${matchResult.event!.name} (${matchResult.event!.id})`)
        return proposals
      }

      // Propose updates for the existing edition
      if (matchResult.edition) {
        const fullEdition = await this.sourceDb.edition.findUnique({
          where: { id: parseInt(matchResult.edition.id, 10) },
          include: {
            organization: true,
            editionPartners: true,
            races: {
              include: { raceInfo: true },
              where: { isArchived: false }
            },
            editionInfo: {
              include: {
                editionServices: {
                  include: { editionService: true }
                }
              }
            }
          }
        })

        if (!fullEdition) {
          context.logger.warn(`⚠️  Édition ${matchResult.edition.id} non trouvée lors du chargement complet`)
        } else {
          context.logger.info(`🔍 Analyse édition ${fullEdition.id} (${matchResult.event!.name})...`)
          const { changes, justifications } = await this.compareFFTRIWithEdition(
            eventDetails,
            fullEdition,
            matchResult.event!,
            confidence
          )

          if (Object.keys(changes).length === 0) {
            context.logger.info(`✓ Édition ${fullEdition.id} (${matchResult.event!.name}) déjà à jour`)
          }

          // Deduplication checks
          if (Object.keys(changes).length > 0) {
            // Check for identical pending proposals in DB
            const pendingProposals = await this.prisma.proposal.findMany({
              where: {
                editionId: matchResult.edition.id.toString(),
                status: 'PENDING',
                type: ProposalType.EDITION_UPDATE
              },
              select: {
                id: true, type: true, eventId: true, editionId: true,
                raceId: true, changes: true, status: true, createdAt: true
              }
            })

            if (hasIdenticalPendingProposal(changes, pendingProposals)) {
              context.logger.info(`⏭️  Proposition identique déjà en attente pour édition ${matchResult.edition.id}, skip`)
              return proposals
            }

            // Check intra-run cache
            if (proposalsCache) {
              const changeHash = require('crypto').createHash('sha256')
                .update(JSON.stringify(changes))
                .digest('hex')
              const cacheKey = matchResult.edition.id.toString()

              if (!proposalsCache.has(cacheKey)) {
                proposalsCache.set(cacheKey, new Set())
              }

              if (proposalsCache.get(cacheKey)!.has(changeHash)) {
                context.logger.info(`⏭️  Proposition identique déjà créée dans ce run pour édition ${matchResult.edition.id}, skip`)
                return proposals
              }

              proposalsCache.get(cacheKey)!.add(changeHash)
            }

            // Filter to keep only new information
            const filteredChanges = filterNewChanges(changes, fullEdition, pendingProposals)

            if (Object.keys(filteredChanges).length === 0) {
              context.logger.info(`⏭️  Aucune nouvelle information pour édition ${matchResult.edition.id}, skip`)
              return proposals
            }

            if (Object.keys(filteredChanges).length < Object.keys(changes).length) {
              context.logger.info(`🔍 Filtrage des changements pour ${matchResult.event!.name}:`, {
                original: Object.keys(changes).length,
                filtered: Object.keys(filteredChanges).length,
                removed: Object.keys(changes).filter(k => !filteredChanges[k])
              })
            }

            context.logger.info(`📝 Proposition EDITION_UPDATE pour ${matchResult.event!.name} (édition ${matchResult.edition.id})`, {
              changesCount: Object.keys(filteredChanges).length,
              changeTypes: Object.keys(filteredChanges)
            })

            // Enrich justifications with context metadata
            const enrichedJustifications = justifications.map((justif, index) => {
              if (index === 0) {
                return {
                  ...justif,
                  metadata: {
                    ...justif.metadata,
                    eventName: matchResult.event!.name,
                    eventCity: matchResult.event!.city,
                    editionYear: fullEdition.year ? parseInt(fullEdition.year) : undefined
                  }
                }
              }
              return justif
            })

            // LLM confidence review if available
            let reviewedConfidence = confidence
            if (this.llmConfig?.apiKey) {
              try {
                const editionYear = fullEdition.year ? parseInt(fullEdition.year) : undefined
                const review = await reviewEditionUpdateConfidence(
                  { eventName: matchResult.event!.name, eventCity: matchResult.event!.city, editionYear, changes: filteredChanges },
                  { apiKey: this.llmConfig.apiKey }
                )
                reviewedConfidence = review.score
                enrichedJustifications.push({
                  type: 'llm_confidence_review',
                  content: review.reason,
                  metadata: {
                    reviewedAt: new Date().toISOString(),
                    score: review.score,
                    issues: review.issues,
                  },
                })
                context.logger.info(`🤖 LLM confidence review: ${review.score.toFixed(2)}${review.issues.length ? ` [${review.issues.length} issues]` : ''}`)
              } catch (err: any) {
                context.logger.warn(`⚠️ LLM confidence review failed: ${err.message}`)
              }
            }

            proposals.push({
              type: ProposalType.EDITION_UPDATE,
              eventId: matchResult.event!.id.toString(),
              editionId: matchResult.edition.id.toString(),
              changes: filteredChanges,
              justification: enrichedJustifications,
              confidence: reviewedConfidence,
            })
          }
        }
      }
    }

    return proposals
  }

  // --------------------------------------------------------------------------
  // Main run loop
  // --------------------------------------------------------------------------

  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as FFTRIScraperConfig

    try {
      context.logger.info(`🚀 Démarrage FFTRI Scraper Agent v${FFTRI_SCRAPER_AGENT_VERSION}`, {
        version: FFTRI_SCRAPER_AGENT_VERSION,
        liguesPerRun: config.liguesPerRun,
        monthsPerRun: config.monthsPerRun,
        sourceDatabase: config.sourceDatabase,
        timestamp: new Date().toISOString()
      })

      // Initialize source connection
      await this.initializeSourceConnection(config)

      if (!this.sourceDb) {
        throw new Error(`Échec de la connexion à la base de données source: ${config.sourceDatabase}`)
      }

      context.logger.info('✅ Connexion à la base source établie', {
        sourceDatabase: config.sourceDatabase
      })

      // Initialize Meilisearch config
      const meilisearchUrl = process.env.MEILISEARCH_URL
      const meilisearchApiKey = process.env.MEILISEARCH_API_KEY
      if (meilisearchUrl && meilisearchApiKey) {
        this.meilisearchConfig = { url: meilisearchUrl, apiKey: meilisearchApiKey }
        context.logger.info('🔍 Meilisearch configuré pour le matching')
      }

      // Initialize LLM config
      const llmApiKey = process.env.LLM_MATCHING_API_KEY || await this.getLLMApiKeyFromSettings()
      if (llmApiKey) {
        this.llmConfig = {
          apiKey: llmApiKey,
          model: process.env.LLM_MATCHING_MODEL,
          enabled: process.env.LLM_MATCHING_ENABLED !== 'false',
          shadowMode: process.env.LLM_MATCHING_SHADOW_MODE === 'true',
        }
        context.logger.info('🤖 LLM configuré pour matching')
      }

      // Load progress and determine targets
      const progress = await this.loadProgress()
      context.logger.info('📊 Progression chargée', { progress })

      const { ligues, months } = this.getNextTargets(progress, config)
      context.logger.info(`🎯 Traitement: ${ligues.length} ligues × ${months.length} mois`)

      const allProposals: ProposalData[] = []
      let totalEvents = 0

      // Intra-run deduplication cache
      const proposalsCache = new Map<string, Set<string>>()

      // Scrape each ligue/month combination
      for (const ligue of ligues) {
        for (const month of months) {
          const eventDetailsList = await this.scrapeLigueMonth(ligue, month, config, context)
          totalEvents += eventDetailsList.length

          let matchedCount = 0
          let proposalsFromMatches = 0

          for (const eventDetails of eventDetailsList) {
            // Match against existing events
            const matchResult = await matchFFTRIEvent(
              eventDetails,
              this.sourceDb,
              config,
              this.logger,
              this.meilisearchConfig,
              this.llmConfig
            )

            // Create proposals
            const proposals = await this.createProposalsForCompetition(
              eventDetails,
              matchResult,
              config,
              context,
              proposalsCache
            )

            if (matchResult.type !== 'NO_MATCH') {
              matchedCount++
              if (proposals.length > 0) {
                proposalsFromMatches++
              }
            }

            // Save proposals immediately
            for (const proposal of proposals) {
              try {
                const proposalConfidence = proposal.confidence ?? proposal.justification?.[0]?.metadata?.confidence ?? 0.7
                await this.createProposal(
                  proposal.type,
                  proposal.changes,
                  proposal.justification,
                  proposal.eventId?.toString(),
                  proposal.editionId?.toString(),
                  proposal.raceId?.toString(),
                  proposalConfidence
                )
                allProposals.push(proposal)
              } catch (error) {
                context.logger.error(`Erreur lors de la création d'une proposition`, {
                  type: proposal.type,
                  error: String(error)
                })
              }
            }
          }

          context.logger.info(`📊 Stats: ${matchedCount} matches (${proposalsFromMatches} avec propositions)`)

          // Mark month as completed for this ligue
          if (!progress.completedMonths[ligue]) {
            progress.completedMonths[ligue] = []
          }
          if (!progress.completedMonths[ligue].includes(month)) {
            progress.completedMonths[ligue].push(month)
          }

          await this.saveProgress(progress)
          context.logger.info(`💾 Progression sauvegardée: ${ligue} - ${month}`)

          await humanDelay(config.humanDelayMs)
        }
      }

      // Calculate next scraping position
      const allMonthTargets = generateMonthsToScrape(config.scrapingWindowMonths)
      const allMonths = allMonthTargets.map(formatMonthKey)
      const currentMonthIndex = allMonths.indexOf(months[0])
      const lastProcessedLigue = ligues[ligues.length - 1]
      const lastLigueIndex = FFTRI_LIGUES.indexOf(lastProcessedLigue as any)

      if (lastLigueIndex + 1 < FFTRI_LIGUES.length) {
        progress.currentLigue = FFTRI_LIGUES[lastLigueIndex + 1]
        progress.currentMonth = months[0]
      } else {
        const nextMonthIndex = currentMonthIndex + config.monthsPerRun
        if (nextMonthIndex < allMonths.length) {
          progress.currentMonth = allMonths[nextMonthIndex]
          progress.currentLigue = FFTRI_LIGUES[0]
        } else {
          progress.currentLigue = FFTRI_LIGUES[0]
          progress.currentMonth = allMonths[0]
          progress.lastCompletedAt = new Date()
        }
      }

      progress.totalEventsScraped += totalEvents
      await this.saveProgress(progress)

      context.logger.info(`✅ Scraping terminé: ${totalEvents} événements, ${allProposals.length} propositions sauvegardées`)

      return {
        success: true,
        message: `Scraped ${totalEvents} events, created ${allProposals.length} proposals`,
        proposals: allProposals
      }
    } catch (error) {
      context.logger.error('❌ Erreur lors du scraping FFTRI', { error: String(error) })
      throw error
    }
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  async validate(): Promise<boolean> {
    const config = this.config.config as FFTRIScraperConfig

    if (!config.sourceDatabase) {
      this.logger.error('sourceDatabase est requis dans la configuration')
      return false
    }

    if (config.liguesPerRun < 1 || config.liguesPerRun > FFTRI_LIGUES.length) {
      this.logger.error(`liguesPerRun doit être entre 1 et ${FFTRI_LIGUES.length}`)
      return false
    }

    return true
  }
}

export default FFTRIScraperAgent
