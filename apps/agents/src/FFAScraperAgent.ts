/**
 * Agent de scraping du calendrier FFA (Fédération Française d'Athlétisme)
 *
 * Cet agent scrape automatiquement le calendrier FFA pour:
 * - Extraire les compétitions de course à pied par ligues et par mois
 * - Matcher les compétitions avec les événements existants dans Miles Republic
 * - Créer des propositions de création/modification d'événements, éditions et courses
 */

import { AGENT_VERSIONS, FFAScraperAgentConfigSchema, getAgentName } from '@data-agents/types'
import type { ProposalInput, ProposalRaceInput } from '@data-agents/types'
import { BaseAgent, AgentContext, AgentRunResult, ProposalData, ProposalType, AgentType, MeilisearchMatchingConfig, LLMMatchingConfig, LLMMatchingService, LLMEventExtractor, reviewEditionUpdateConfidence } from '@data-agents/agent-framework'
import { buildNewEventChanges as sharedBuildNewEventChanges, buildEditionUpdateChanges as sharedBuildEditionUpdateChanges } from '@data-agents/agent-framework'

// Version exportée pour compatibilité
export const FFA_SCRAPER_AGENT_VERSION = AGENT_VERSIONS.FFA_SCRAPER_AGENT
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import {
  FFAScraperConfig,
  FFACompetitionDetails,
  FFARace,
  ScrapingProgress,
  FFA_LIGUES,
  MatchResult,
  convertFFALigueToRegionName,
  convertFFALigueToDisplayCode
} from './ffa/types'
import {
  fetchAllCompetitionsForPeriod,
  fetchCompetitionDetails,
  getMonthBounds,
  generateMonthsToScrape,
  humanDelay
} from './ffa/scraper'
import { normalizeFFARaceName } from './ffa/parser'
import { matchCompetition, calculateAdjustedConfidence, calculateNewEventConfidence } from './ffa/matcher'
import { getDepartmentName, normalizeDepartmentCode } from '@data-agents/agent-framework'
import { hasIdenticalPendingProposal, filterNewChanges } from './ffa/deduplication'

/**
 * Convert a local date/time in a given timezone to UTC.
 * Uses Intl.DateTimeFormat to compute the real offset — works correctly
 * regardless of server TZ and handles DST transitions properly.
 */
function localToUtcRobust(year: number, month: number, day: number, hours: number, minutes: number, timeZone: string): Date {
  // Guard against invalid values
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
    return new Date(NaN)
  }

  // Create a UTC date with the local time values
  const utcGuess = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0))

  // Get what this UTC instant looks like in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(utcGuess)
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10)

  // Compute offset: what's the difference between UTC and the timezone at this moment?
  const zonedHour = get('hour') === 24 ? 0 : get('hour')
  const zonedMinute = get('minute')
  const zonedDay = get('day')

  // Offset in minutes = (local - UTC) for this instant
  let offsetMinutes = (zonedHour * 60 + zonedMinute) - (hours * 60 + minutes)

  // Handle day boundary
  if (zonedDay !== day) {
    if (zonedDay > day || (zonedDay === 1 && day > 27)) {
      offsetMinutes += 24 * 60  // timezone is ahead, crossed into next day
    } else {
      offsetMinutes -= 24 * 60  // timezone is behind
    }
  }

  // The actual UTC time = local time - offset
  return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0) - offsetMinutes * 60 * 1000)
}

export class FFAScraperAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma
  private meilisearchConfig?: MeilisearchMatchingConfig
  private llmConfig?: LLMMatchingConfig
  private extractor?: LLMEventExtractor

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'ffa-scraper-agent',
      name: config.name || getAgentName('FFA_SCRAPER'),
      description: `Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied (v${FFA_SCRAPER_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 */12 * * *', // Toutes les 12 heures par défaut
      isActive: config.isActive ?? true,
      config: {
        version: FFA_SCRAPER_AGENT_VERSION,
        sourceDatabase: config.sourceDatabase || config.config?.sourceDatabase,
        liguesPerRun: config.liguesPerRun || config.config?.liguesPerRun || 2,
        monthsPerRun: config.monthsPerRun || config.config?.monthsPerRun || 1,
        levels: config.levels || config.config?.levels || ['Départemental', 'Régional'],
        scrapingWindowMonths: config.scrapingWindowMonths || config.config?.scrapingWindowMonths || 6,
        rescanDelayDays: config.rescanDelayDays || config.config?.rescanDelayDays || 30,
        humanDelayMs: config.humanDelayMs || config.config?.humanDelayMs || 2000,
        similarityThreshold: config.similarityThreshold || config.config?.similarityThreshold || 0.75,
        distanceTolerancePercent: config.distanceTolerancePercent || config.config?.distanceTolerancePercent || 0.1,
        confidenceBase: config.confidenceBase || config.config?.confidenceBase || 0.9,
        maxCompetitionsPerMonth: config.maxCompetitionsPerMonth || config.config?.maxCompetitionsPerMonth || 500,
        configSchema: FFAScraperAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
    // Note: dbManager est maintenant dans BaseAgent
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  /**
   * Initialise la connexion à la base de données Miles Republic
   * @deprecated Cette méthode utilise maintenant connectToSource() de BaseAgent
   */
  private async initializeSourceConnection(config: FFAScraperConfig): Promise<void> {
    this.logger.debug('🔍 [DEBUG] initializeSourceConnection appelée', {
      hasSourceDb: !!this.sourceDb,
      sourceDatabase: config.sourceDatabase
    })

    if (!this.sourceDb) {
      this.logger.debug('🔍 [DEBUG] Appel de connectToSource...')
      this.sourceDb = await this.connectToSource(config.sourceDatabase)

      this.logger.debug('🔍 [DEBUG] Résultat de connectToSource', {
        sourceDbDefined: !!this.sourceDb,
        sourceDbType: typeof this.sourceDb,
        hasEventModel: this.sourceDb && typeof this.sourceDb.event !== 'undefined',
        hasEventModelCapital: this.sourceDb && typeof this.sourceDb.Event !== 'undefined',
        sourceDbKeys: this.sourceDb ? Object.keys(this.sourceDb).slice(0, 10) : []
      })
    }
  }

  /**
   * Read LLM API key from DB settings (fallback when env var is not set)
   */
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

  /**
   * Charge l'état de progression depuis AgentState
   */
  private async loadProgress(): Promise<ScrapingProgress> {
    const progress = await this.stateService.getState<ScrapingProgress>(
      this.config.id,
      'progress'
    )

    if (progress) {
      return progress
    }

    // État initial
    return {
      currentLigue: FFA_LIGUES[0],
      currentMonth: generateMonthsToScrape(1)[0],
      currentPage: 0,
      completedLigues: [],
      completedMonths: {},
      totalCompetitionsScraped: 0
    }
  }

  /**
   * Sauvegarde l'état de progression
   */
  private async saveProgress(progress: ScrapingProgress): Promise<void> {
    await this.stateService.setState(this.config.id, 'progress', progress)
  }

  /**
   * Détermine les prochaines ligues/mois à scraper
   * Respecte le cooldown global (rescanDelayDays) avant de recommencer un cycle complet
   */
  private getNextTargets(
    progress: ScrapingProgress,
    config: FFAScraperConfig
  ): { ligues: string[], months: string[] } {
    // Générer la liste des mois dans la fenêtre
    const allMonths = generateMonthsToScrape(config.scrapingWindowMonths)

    // Vérifier si on a terminé un cycle complet (toutes les ligues)
    const allLiguesCompleted = FFA_LIGUES.every(ligue => {
      const completedMonthsForLigue = progress.completedMonths[ligue] || []
      // Une ligue est complète si elle a scanné tous les mois de la fenêtre
      return allMonths.every(month => completedMonthsForLigue.includes(month))
    })

    if (allLiguesCompleted && progress.lastCompletedAt) {
      // Calculer le temps écoulé depuis le dernier cycle complet
      const daysSinceLastComplete =
        (Date.now() - new Date(progress.lastCompletedAt).getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceLastComplete < config.rescanDelayDays) {
        this.logger.info(`⏸️  Cooldown actif: ${Math.ceil(daysSinceLastComplete)}/${config.rescanDelayDays} jours écoulés depuis le dernier cycle complet`)
        this.logger.info(`⏭️  Prochain scan dans ${Math.ceil(config.rescanDelayDays - daysSinceLastComplete)} jours`)
        // Retourner des listes vides pour indiquer qu'il faut attendre
        return { ligues: [], months: [] }
      }

      // Le cooldown est écoulé, recommencer un nouveau cycle
      this.logger.info(`🔄 Cooldown terminé (${Math.ceil(daysSinceLastComplete)} jours), redémarrage d'un nouveau cycle complet`)
      progress.completedMonths = {}
      progress.currentLigue = FFA_LIGUES[0]
      progress.currentMonth = allMonths[0]
    }

    // NOUVELLE LOGIQUE: Parcourir toutes les ligues pour un ensemble de mois,
    // puis passer aux mois suivants
    // Ordre: [L1,L2,L3 pour M1,M2] → [L4,L5,L6 pour M1,M2] → ... → [L1,L2,L3 pour M3,M4] → ...

    // Déterminer le mois actuel
    let currentMonthIndex = allMonths.indexOf(progress.currentMonth)

    // Si le mois actuel n'est plus dans la fenêtre (expiré), recommencer au premier mois
    if (currentMonthIndex === -1) {
      this.logger.info(`⚠️  Mois actuel ${progress.currentMonth} expiré, redémarrage au mois: ${allMonths[0]}`)
      currentMonthIndex = 0
      progress.currentMonth = allMonths[0]
    }

    // Déterminer les mois à traiter (fenêtre fixe pour ce run)
    const months: string[] = []
    for (let i = 0; i < config.monthsPerRun && currentMonthIndex + i < allMonths.length; i++) {
      months.push(allMonths[currentMonthIndex + i])
    }

    // Déterminer les ligues à traiter
    const currentLigueIndex = FFA_LIGUES.indexOf(progress.currentLigue as any)
    let ligues: string[] = []

    // Chercher les prochaines ligues qui n'ont pas complété les mois actuels
    for (let i = currentLigueIndex; i < FFA_LIGUES.length && ligues.length < config.liguesPerRun; i++) {
      const ligue = FFA_LIGUES[i]
      const completedForLigue = progress.completedMonths[ligue] || []

      // Vérifier si cette ligue a besoin de traiter au moins un des mois
      const needsProcessing = months.some(month => !completedForLigue.includes(month))

      if (needsProcessing) {
        ligues.push(ligue)
      } else {
        this.logger.debug?.(`⏭️  Ligue ${ligue} déjà complétée pour les mois [${months.join(', ')}], skip`)
      }
    }

    // Si toutes les ligues ont complété ces mois, passer aux mois suivants
    if (ligues.length === 0 && months.length > 0) {
      const nextMonthIndex = currentMonthIndex + config.monthsPerRun

      if (nextMonthIndex < allMonths.length) {
        // Avancer aux prochains mois et recommencer avec la première ligue
        this.logger.info(`✅ Tous les mois [${months.join(', ')}] complétés pour toutes les ligues, passage aux mois suivants`)
        progress.currentMonth = allMonths[nextMonthIndex]
        progress.currentLigue = FFA_LIGUES[0]
        // Récursion pour obtenir les vraies prochaines cibles
        return this.getNextTargets(progress, config)
      }
    }

    // Mettre à jour currentLigue si on a sauté des ligues déjà complétées
    if (ligues.length > 0 && ligues[0] !== progress.currentLigue) {
      this.logger.info(`⏭️  Avance à la ligue ${ligues[0]} (${progress.currentLigue} déjà complétée pour ces mois)`)
      progress.currentLigue = ligues[0] as typeof FFA_LIGUES[number]
    }

    return { ligues, months }
  }

  /**
   * Scrape une ligue pour un mois donné
   */
  private async scrapeLigueMonth(
    ligue: string,
    month: string,
    config: FFAScraperConfig,
    context: AgentContext
  ): Promise<FFACompetitionDetails[]> {
    const { startDate, endDate } = getMonthBounds(month)

    context.logger.info(`🔍 Scraping ${ligue} - ${month}...`)

    // Récupérer les compétitions
    const competitions = await fetchAllCompetitionsForPeriod(
      ligue,
      startDate,
      endDate,
      config.levels,
      config.humanDelayMs,
      50 // Max 50 pages
    )

    context.logger.info(`📊 ${competitions.length} compétitions trouvées pour ${ligue} - ${month}`)

    // Limiter au max par mois si configuré
    const limitedCompetitions = config.maxCompetitionsPerMonth
      ? competitions.slice(0, config.maxCompetitionsPerMonth)
      : competitions

    // Récupérer les détails de chaque compétition
    const detailsPromises = limitedCompetitions.map(comp =>
      fetchCompetitionDetails(comp, this.extractor)
    )

    const details = await Promise.all(detailsPromises)

    return details.filter(d => d !== null) as FFACompetitionDetails[]
  }

  /**
   * Compare les données FFA avec une édition existante
   * Utilise le builder partagé pour la construction des changements,
   * mais conserve le matching de courses FFA custom (category-aware, multi-day, distance tolerance)
   */
  private async compareFFAWithEdition(
    ffaData: FFACompetitionDetails,
    edition: any,
    event: any,
    confidence: number
  ): Promise<{ changes: any, justifications: any[] }> {
    const justifications: any[] = []
    const existingRaces = edition.races || []

    // =========================================================================
    // FFA Custom Race Matching (kept as-is — more advanced than shared matchRaces)
    // =========================================================================
    const matched: Array<{ ffaRace: FFARace; dbRace: any }> = []
    const unmatchedFFA: FFARace[] = []

    if (ffaData.races.length > 0) {
      // Convertir les distances DB (qui sont en km) en mètres pour comparaison
      const existingRacesWithMeters = existingRaces.map((r: any) => ({
        ...r,
        runDistanceMeters: (r.runDistance || 0) * 1000,
        walkDistanceMeters: (r.walkDistance || 0) * 1000,
        swimDistanceMeters: (r.swimDistance || 0) * 1000,
        bikeDistanceMeters: (r.bikeDistance || 0) * 1000,
        totalDistanceMeters: ((r.runDistance || 0) + (r.walkDistance || 0) + (r.swimDistance || 0) + (r.bikeDistance || 0)) * 1000
      }))

      this.logger.info(`📋 Édition ${edition.id} : ${existingRaces.length} course(s) existante(s)`, {
        races: existingRacesWithMeters.map((r: any) => ({
          name: r.name,
          distanceKm: r.runDistance,
          distanceMeters: r.totalDistanceMeters
        }))
      })
      this.logger.info(`📋 FFA : ${ffaData.races.length} course(s) à comparer`, {
        races: ffaData.races.map(r => ({ name: r.name, distance: r.distance }))
      })

      // FIX: Set pour tracker les courses DB déjà matchées
      const matchedDbRaceIds = new Set<number>()

      for (const ffaRace of ffaData.races) {
        // Inférer la catégorie de la course FFA pour un meilleur matching
        const [ffaCategoryLevel1] = this.inferRaceCategories(
          ffaRace.name,
          ffaRace.distance ? ffaRace.distance / 1000 : undefined
        )

        // Calculer la date de la course FFA (pour événements multi-jours)
        const ffaRaceDate = this.calculateRaceStartDate(ffaData, ffaRace)
        if (isNaN(ffaRaceDate.getTime())) {
          this.logger.warn(`⚠️ Date invalide pour ${ffaRace.name}, skip matching par date`)
          unmatchedFFA.push(ffaRace)
          continue
        }
        const ffaRaceDayStr = ffaRaceDate.toISOString().split('T')[0]

        const matchingRace = existingRacesWithMeters.find((dbRace: any) => {
          // FIX: Ignorer les courses déjà matchées
          if (matchedDbRaceIds.has(dbRace.id)) {
            return false
          }

          // Utiliser la distance totale déjà convertie en mètres
          const totalDistance = dbRace.totalDistanceMeters

          // Si la course FFA a une distance, matcher sur distance + catégorie + date
          if (ffaRace.distance && ffaRace.distance > 0) {
            const tolerancePercent = (this.config.config as FFAScraperConfig).distanceTolerancePercent
            const tolerance = ffaRace.distance * tolerancePercent
            const distanceDiff = Math.abs(totalDistance - ffaRace.distance)

            if (distanceDiff > tolerance) {
              return false
            }

            // FIX: Pour les événements multi-jours, vérifier aussi la catégorie
            if (dbRace.categoryLevel1 && ffaCategoryLevel1) {
              const categoryMatch = dbRace.categoryLevel1 === ffaCategoryLevel1
              if (!categoryMatch) {
                if (dbRace.startDate) {
                  const dbRaceDayStr = dbRace.startDate.toISOString().split('T')[0]
                  if (dbRaceDayStr !== ffaRaceDayStr) {
                    return false
                  }
                }
              }
            }

            // FIX: Pour les événements multi-jours, vérifier la date
            if (dbRace.startDate) {
              const dbRaceDayStr = dbRace.startDate.toISOString().split('T')[0]
              const sameDayRaceExists = existingRacesWithMeters.some((otherRace: any) => {
                if (otherRace.id === dbRace.id || matchedDbRaceIds.has(otherRace.id)) return false
                const otherDistanceDiff = Math.abs(otherRace.totalDistanceMeters - (ffaRace.distance || 0))
                if (otherDistanceDiff > tolerance) return false
                if (!otherRace.startDate) return false
                const otherDayStr = otherRace.startDate.toISOString().split('T')[0]
                if (otherRace.categoryLevel1 && ffaCategoryLevel1 && otherRace.categoryLevel1 !== ffaCategoryLevel1) {
                  return false
                }
                return otherDayStr === ffaRaceDayStr
              })

              if (dbRaceDayStr !== ffaRaceDayStr && sameDayRaceExists) {
                return false
              }
            }

            return true
          }

          // Si pas de distance FFA, fallback sur le matching de nom
          const nameMatch = dbRace.name?.toLowerCase().includes(ffaRace.name.toLowerCase()) ||
                            ffaRace.name.toLowerCase().includes(dbRace.name?.toLowerCase())
          return nameMatch
        })

        // FIX: Marquer cette course DB comme matchée pour éviter les doublons
        if (matchingRace) {
          matchedDbRaceIds.add(matchingRace.id)
          this.logger.info(`✅ Course FFA matchée: ${ffaRace.name} (${ffaRace.distance}m) ↔ ${matchingRace.name} (${matchingRace.totalDistanceMeters}m)`)
          matched.push({ ffaRace, dbRace: matchingRace })
        } else {
          if (!ffaRace.distance || ffaRace.distance <= 0) {
            this.logger.info(`⚠️  Course FFA sans distance ignorée: ${ffaRace.name} - pas de proposition sans distance`)
          } else {
            this.logger.info(`➡️  Course FFA non matchée: ${ffaRace.name} (${ffaRace.distance}m) - sera ajoutée`)
            unmatchedFFA.push(ffaRace)
          }
        }
      }
    }

    // =========================================================================
    // Convert FFA matching results to shared builder format
    // =========================================================================
    const proposalInput = this.toProposalInput(ffaData)
    proposalInput.confidence = confidence

    // Convert matched races to the builder's pre-matched format
    // The builder uses input.name to find the full ProposalRaceInput
    const preMatchedResult = {
      matched: matched.map(m => {
        // Find the corresponding ProposalRaceInput by matching the original FFA race
        const [categoryLevel1, categoryLevel2] = this.inferRaceCategories(
          m.ffaRace.name,
          m.ffaRace.distance ? m.ffaRace.distance / 1000 : undefined
        )
        const normalizedName = normalizeFFARaceName(
          m.ffaRace.name,
          categoryLevel1,
          categoryLevel2,
          m.ffaRace.distance ? m.ffaRace.distance / 1000 : undefined
        )
        return {
          input: { name: normalizedName },
          db: m.dbRace
        }
      }),
      unmatched: unmatchedFFA.map(r => {
        const [categoryLevel1, categoryLevel2] = this.inferRaceCategories(
          r.name,
          r.distance ? r.distance / 1000 : undefined
        )
        const normalizedName = normalizeFFARaceName(
          r.name,
          categoryLevel1,
          categoryLevel2,
          r.distance ? r.distance / 1000 : undefined
        )
        return { name: normalizedName }
      })
    }

    // Build a matchResult-like object for the builder (wrapping the full edition)
    const builderMatchResult = {
      edition: {
        ...edition,
        startDate: edition.startDate,
        endDate: edition.endDate,
        timeZone: edition.timeZone,
        calendarStatus: edition.calendarStatus,
        registrationClosingDate: edition.registrationClosingDate,
        editionPartners: edition.editionPartners || [],
      },
      event: event
    }

    // Call the shared builder with pre-matched races
    // Use LLM race matching if available, otherwise fall back to pre-matched result
    const llmRaceContext = this.llmConfig ? {
      llmService: new LLMMatchingService(this.llmConfig, this.logger),
      eventName: ffaData.competition.name,
      editionYear: ffaData.competition.date.getFullYear(),
      eventCity: ffaData.competition.city,
    } : undefined

    const changes = await sharedBuildEditionUpdateChanges(
      proposalInput,
      builderMatchResult,
      existingRaces,
      llmRaceContext ? undefined : preMatchedResult,  // Skip pre-match if LLM is available
      llmRaceContext
    )

    // =========================================================================
    // Build justifications based on changes produced by the builder
    // =========================================================================
    if (changes.startDate) {
      justifications.push({
        type: 'text',
        content: `Date FFA différente: ${changes.startDate.new?.toISOString()} vs ${changes.startDate.old?.toISOString()}`,
        metadata: {
          ffaDate: changes.startDate.new?.toISOString(),
          dbDate: changes.startDate.old?.toISOString(),
          source: ffaData.competition.detailUrl
        }
      })
    }

    if (changes.timeZone) {
      justifications.push({
        type: 'text',
        content: `TimeZone FFA: ${changes.timeZone.new} (ligue ${ffaData.competition.ligue})`,
        metadata: {
          oldTimeZone: changes.timeZone.old,
          newTimeZone: changes.timeZone.new,
          ligue: ffaData.competition.ligue,
          source: ffaData.competition.detailUrl
        }
      })
    }

    if (changes.calendarStatus) {
      justifications.push({
        type: 'text',
        content: `Confirmation depuis FFA (source officielle)`,
        metadata: {
          oldStatus: changes.calendarStatus.old,
          source: ffaData.competition.detailUrl
        }
      })
    }

    if (changes.registrationClosingDate) {
      justifications.push({
        type: 'text',
        content: `Date de clôture FFA: ${changes.registrationClosingDate.new?.toISOString()}`,
        metadata: {
          oldDate: changes.registrationClosingDate.old?.toISOString(),
          newDate: changes.registrationClosingDate.new?.toISOString(),
          source: ffaData.competition.detailUrl
        }
      })
    }

    if (changes.organizer) {
      justifications.push({
        type: 'text',
        content: `Organisateur FFA: ${ffaData.organizerName}`,
        metadata: {
          oldOrganizer: changes.organizer.old?.name,
          newOrganizer: changes.organizer.new?.name,
          source: ffaData.competition.detailUrl
        }
      })
    }

    if (changes.racesToAdd) {
      justifications.push({
        type: 'text',
        content: `${changes.racesToAdd.new.length} nouvelle(s) course(s) FFA détectée(s)`,
        metadata: {
          races: changes.racesToAdd.new.map((r: any) => r.name),
          source: ffaData.competition.detailUrl
        }
      })
    }

    if (changes.racesToUpdate) {
      justifications.push({
        type: 'text',
        content: `${changes.racesToUpdate.new.length} course(s) à mettre à jour`,
        metadata: {
          races: changes.racesToUpdate.new.map((r: any) => ({ name: r.raceName, updates: r.updates })),
          source: ffaData.competition.detailUrl
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
          content: `${racesWithDateCascade.length} course(s) existante(s) non matchée(s) avec la FFA - Mise à jour vers nouvelle date d'édition`,
          metadata: {
            unmatchedRaces: racesWithDateCascade.map((r: any) => r.raceName),
            source: ffaData.competition.detailUrl
          }
        })
      }
    }

    // =========================================================================
    // Fields NOT handled by the shared builder — keep FFA-specific logic
    // =========================================================================

    // Services/équipements
    if (ffaData.services && ffaData.services.length > 0) {
      changes.services = {
        old: edition.editionInfo?.editionServices?.map((s: any) => s.editionService?.type) || [],
        new: ffaData.services,
        confidence: confidence * 0.7
      }
      justifications.push({
        type: 'text',
        content: `Services FFA: ${ffaData.services.join(', ')}`,
        metadata: {
          services: ffaData.services,
          source: ffaData.competition.detailUrl
        }
      })
    }

    // Informations additionnelles
    if (ffaData.additionalInfo && ffaData.additionalInfo.trim().length > 10) {
      const existingInfo = edition.editionInfo?.whatIsIncluded || ''
      if (!existingInfo || existingInfo.length < ffaData.additionalInfo.length) {
        changes.additionalInfo = {
          old: existingInfo,
          new: ffaData.additionalInfo,
          confidence: confidence * 0.6
        }
        justifications.push({
          type: 'text',
          content: `Informations additionnelles FFA disponibles`,
          metadata: {
            preview: ffaData.additionalInfo.substring(0, 200),
            source: ffaData.competition.detailUrl
          }
        })
      }
    }

    return { changes, justifications }
  }

  /**
   * Récupère le timezone IANA (ex: "Europe/Paris", "America/Guadeloupe") selon la ligue
   */
  private getTimezoneIANA(ligue: string): string {
    const ligueTimezones: Record<string, string> = {
      // DOM-TOM
      'GUA': 'America/Guadeloupe',
      'GUY': 'America/Cayenne',
      'MAR': 'America/Martinique',
      'MAY': 'Indian/Mayotte',
      'N-C': 'Pacific/Noumea',
      'P-F': 'Pacific/Tahiti',
      'REU': 'Indian/Reunion',
      'W-F': 'Pacific/Wallis'
    }

    // Si c'est un DOM-TOM, retourner sa timezone spécifique
    if (ligue in ligueTimezones) {
      return ligueTimezones[ligue]
    }

    // Sinon, c'est la métropole
    return 'Europe/Paris'
  }


  /**
   * Infère les catégories de course depuis le nom et les distances
   * Basé sur les données réelles de Miles Republic (82 combinaisons trouvées)
   * @param raceName Nom de la course
   * @param runDistance Distance course en km (optionnel)
   * @param bikeDistance Distance vélo en km (optionnel)
   * @param swimDistance Distance nage en km (optionnel)
   * @param walkDistance Distance marche en km (optionnel)
   * @returns Tuple [categoryLevel1, categoryLevel2 | undefined]
   */
  private inferRaceCategories(
    raceName: string,
    runDistance?: number,
    bikeDistance?: number,
    swimDistance?: number,
    walkDistance?: number
  ): [string, string | undefined] {
    const lowerName = this.normalizeRaceName(raceName)

    // 1. TRIATHLON ET VARIANTS - Prioritaire car très distinctifs
    if (lowerName.includes('swim') && lowerName.includes('run')) return ['TRIATHLON', 'SWIM_RUN']
    if (lowerName.includes('swim') && lowerName.includes('bike')) return ['TRIATHLON', 'SWIM_BIKE']
    if (lowerName.includes('run') && lowerName.includes('bike')) return ['TRIATHLON', 'RUN_BIKE']
    if (lowerName.includes('aquathlon')) return ['TRIATHLON', 'AQUATHLON']
    if (lowerName.includes('duathlon')) return ['TRIATHLON', 'DUATHLON']
    if (lowerName.includes('cross triathlon') || lowerName.includes('cross-triathlon')) {
      return ['TRIATHLON', 'CROSS_TRIATHLON']
    }
    if (lowerName.includes('ultra triathlon')) return ['TRIATHLON', 'ULTRA_TRIATHLON']
    if (lowerName.includes('triathlon')) {
      // Déduire la taille du triathlon
      if (lowerName.includes('enfant') || lowerName.includes('kids')) return ['TRIATHLON', 'TRIATHLON_KIDS']
      if (lowerName.includes('xs')) return ['TRIATHLON', 'TRIATHLON_XS']
      if (lowerName.match(/\bm\b/)) return ['TRIATHLON', 'TRIATHLON_M']
      if (lowerName.match(/\bl\b/)) return ['TRIATHLON', 'TRIATHLON_L']
      if (lowerName.includes('xxl') || lowerName.includes('ultra')) return ['TRIATHLON', 'TRIATHLON_XXL']
      if (lowerName.match(/\bs\b/)) return ['TRIATHLON', 'TRIATHLON_S']  // Après les autres pour éviter matchage partiel
      // Si distances détectées, classifier par tailles standard
      if (swimDistance && bikeDistance && runDistance) {
        if (swimDistance <= 0.75 && bikeDistance <= 20 && runDistance <= 5) return ['TRIATHLON', 'TRIATHLON_XS']
        if (swimDistance <= 1.5 && bikeDistance <= 40 && runDistance <= 10) return ['TRIATHLON', 'TRIATHLON_S']
        if (swimDistance <= 2 && bikeDistance <= 90 && runDistance <= 21) return ['TRIATHLON', 'TRIATHLON_M']
        if (swimDistance <= 3 && bikeDistance <= 180 && runDistance <= 42) return ['TRIATHLON', 'TRIATHLON_L']
      }
      return ['TRIATHLON', undefined]
    }

    // 2. CYCLING - Vélo
    if (lowerName.includes('gravel')) {
      return lowerName.includes('race') ? ['CYCLING', 'GRAVEL_RACE'] : ['CYCLING', 'GRAVEL_RIDE']
    }
    if (lowerName.includes('gran fondo') || lowerName.includes('granfondo')) return ['CYCLING', 'GRAN_FONDO']
    if (lowerName.includes('enduro') && (lowerName.includes('vtt') || lowerName.includes('mountain'))) {
      return ['CYCLING', 'ENDURO_MOUNTAIN_BIKE']
    }
    if (lowerName.includes('xc') && (lowerName.includes('vtt') || lowerName.includes('mountain'))) {
      return ['CYCLING', 'XC_MOUNTAIN_BIKE']
    }
    if ((lowerName.includes('vtt') || lowerName.includes('mountain')) && !lowerName.includes('triathlon')) {
      return ['CYCLING', 'MOUNTAIN_BIKE_RIDE']
    }
    if (lowerName.includes('bikepacking') || lowerName.includes('bike packing')) return ['CYCLING', 'BIKEPACKING']
    if (lowerName.includes('ultra cycling') || (lowerName.includes('ultra') && bikeDistance && bikeDistance > 200)) {
      return ['CYCLING', 'ULTRA_CYCLING']
    }
    if (lowerName.includes('contre-la-montre') || lowerName.includes('clm') || lowerName.includes('time trial') || /\btt\b/.test(lowerName)) {
      return ['CYCLING', 'TIME_TRIAL']
    }
    if (lowerName.includes('touring') || lowerName.includes('cyclo')) return ['CYCLING', 'CYCLE_TOURING']
    if (lowerName.includes('vélo') || lowerName.includes('velo') || lowerName.includes('cyclisme') || lowerName.includes('cycling')) {
      // Fallback par distance si disponible
      if (bikeDistance && bikeDistance > 100) return ['CYCLING', 'GRAN_FONDO']
      return ['CYCLING', 'ROAD_CYCLING_TOUR']
    }

    // 3. TRAIL - Trails pédestres
    if (lowerName.includes('trail')) {
      // Classifier par distance
      if (runDistance) {
        if (runDistance <= 21) return ['TRAIL', 'DISCOVERY_TRAIL']
        if (runDistance <= 41) return ['TRAIL', 'SHORT_TRAIL']
        if (runDistance <= 80) return ['TRAIL', 'LONG_TRAIL']
        if (runDistance > 80) return ['TRAIL', 'ULTRA_TRAIL']
      }
      // Si "km" dans le nom avec nombre
      if (lowerName.includes('km')) {
        const kmMatch = lowerName.match(/(\d+)\s*km/)
        if (kmMatch) {
          const km = parseInt(kmMatch[1])
          if (km <= 5) return ['TRAIL', 'KM5']
          if (km <= 10) return ['TRAIL', 'KM10']
          if (km <= 15) return ['TRAIL', 'KM15']
          if (km <= 20) return ['TRAIL', 'KM20']
        }
      }
      return ['TRAIL', 'DISCOVERY_TRAIL']  // Défaut trail
    }

    // 4. WALK - Marches et randonnées
    if (lowerName.includes('marche nordique') || lowerName.includes('nordic walk')) return ['WALK', 'NORDIC_WALK']
    if (lowerName.includes('ski de fond') || lowerName.includes('cross country skiing')) return ['WALK', 'CROSS_COUNTRY_SKIING']
    if (lowerName.includes('randonnée') || lowerName.includes('rando') || lowerName.includes('hiking')) {
      return ['WALK', 'HIKING']
    }
    if (lowerName.includes('marche')) return ['WALK', 'HIKING']  // Défaut marche

    // 5. FUN - Courses fun
    if (lowerName.includes('color')) return ['FUN', 'COLOR_RUN']
    if (lowerName.includes('obstacle')) return ['FUN', 'OBSTACLE_RACE']
    if (lowerName.includes('spartan')) return ['FUN', 'SPARTAN_RACE']
    if (lowerName.includes('mud')) return ['FUN', 'MUD_DAY']

    // 6. OTHER - Autres sports
    if (lowerName.includes('canicross')) return ['OTHER', 'CANICROSS']
    if (lowerName.includes('orienteering') || lowerName.includes('orientation')) return ['OTHER', 'ORIENTEERING']
    if (lowerName.includes('raid') && !lowerName.includes('triathlon')) return ['OTHER', 'RAID']
    if (lowerName.includes('biathlon')) return ['OTHER', 'BIATHLON']
    if (lowerName.includes('natation') || lowerName.includes('swimming')) return ['OTHER', 'SWIMMING']
    if (lowerName.includes('vol libre') || lowerName.includes('free flight')) return ['OTHER', 'FREE_FLIGHT']
    if (lowerName.includes('yoga')) return ['OTHER', 'YOGA']

    // 7. RUNNING - Courses à pied (fallback par défaut)
    if (lowerName.includes('vertical') || lowerName.includes('vertical km')) return ['RUNNING', 'VERTICAL_KILOMETER']
    if (lowerName.includes('cross')) return ['RUNNING', 'CROSS']
    if (lowerName.includes('ekiden')) return ['RUNNING', 'EKIDEN']
    if (lowerName.includes('marathon')) {
      if (lowerName.includes('semi') || lowerName.includes('half') || lowerName.includes('1/2')) {
        return ['RUNNING', 'HALF_MARATHON']
      }
      return ['RUNNING', 'MARATHON']
    }
    if (lowerName.includes('corrida')) return ['RUNNING', undefined]

    // Classifier par distance si fournie (RUNNING)
    if (runDistance) {
      if (runDistance < 5) return ['RUNNING', 'LESS_THAN_5_KM']
      if (runDistance < 7.5) return ['RUNNING', 'KM5']
      if (runDistance < 12.5) return ['RUNNING', 'KM10']
      if (runDistance < 17.5) return ['RUNNING', 'KM15']
      if (runDistance < 30) return ['RUNNING', 'KM20']
      if (runDistance < 35) return ['RUNNING', 'HALF_MARATHON']
      if (runDistance < 50) return ['RUNNING', 'MARATHON']
      if (runDistance >= 50) return ['RUNNING', 'ULTRA_RUNNING']
    }

    // Par défaut : RUNNING
    return ['RUNNING', undefined]
  }

  /**
   * Normalise le nom d'une course pour comparaison
   * Supprime accents, met en minuscules, normalise les espaces
   */
  private normalizeRaceName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // Supprime les accents
      .replace(/\s+/g, ' ')             // Normalise les espaces multiples
      .trim()
  }

  /**
   * Calcule la date/heure de départ d'une course spécifique
   * Convertit l'heure locale (selon la ligue) en UTC en utilisant date-fns-tz
   */
  private calculateRaceStartDate(ffaData: FFACompetitionDetails, race: FFARace): Date {
    // Déterminer la date de base
    let baseDate: Date

    // Si la course a une date spécifique (format "28/02" pour événements multi-jours)
    if (race.raceDate) {
      // Parser le format "DD/MM"
      const [dayStr, monthStr] = race.raceDate.split('/')
      const raceDay = parseInt(dayStr, 10)
      const raceMonth = parseInt(monthStr, 10) - 1 // JavaScript months are 0-indexed

      // Déterminer l'année : utiliser startDate de l'événement
      const year = ffaData.startDate.getUTCFullYear()

      // Vérifier si c'est un changement d'année (décembre -> janvier)
      // Si le mois de la course est janvier (0) et que startDate est en décembre,
      // alors la course est l'année suivante
      const startMonth = ffaData.startDate.getUTCMonth()
      const adjustedYear = (raceMonth === 0 && startMonth === 11) ? year + 1 : year

      baseDate = new Date(Date.UTC(adjustedYear, raceMonth, raceDay, 0, 0, 0, 0))

      this.logger.debug(`📅 Course avec date spécifique: ${race.raceDate} -> ${baseDate.toISOString().split('T')[0]}`)
    } else {
      // Utiliser la date de début de l'événement (startDate)
      baseDate = ffaData.startDate
    }

    // Guard against invalid dates (e.g. LLM returned unparseable editionDate)
    if (!baseDate || isNaN(baseDate.getTime())) {
      this.logger.warn(`⚠️ Date de base invalide pour la course ${race.name}, utilisation de la date de compétition`)
      baseDate = ffaData.competition.date
      if (!baseDate || isNaN(baseDate.getTime())) {
        this.logger.error(`❌ Aucune date valide pour la course ${race.name}`)
        return new Date(NaN)
      }
    }

    const year = baseDate.getUTCFullYear()
    const month = baseDate.getUTCMonth()
    const day = baseDate.getUTCDate()

    // Récupérer le timezone IANA de la ligue
    const ligue = ffaData.competition.ligue
    const timeZone = this.getTimezoneIANA(ligue)

    if (race.startTime) {
      // Parser l'heure locale (format HH:MM)
      const [hours, minutes] = race.startTime.split(':').map(Number)

      // Convertir heure locale → UTC en utilisant l'offset réel du timezone à cette date
      const utcDate = localToUtcRobust(year, month, day, hours, minutes, timeZone)

      if (isNaN(utcDate.getTime())) {
        this.logger.warn(`⚠️ Conversion timezone échouée pour ${race.name} (${race.startTime}), fallback minuit`)
        return localToUtcRobust(year, month, day, 0, 0, timeZone)
      }

      this.logger.info(`🕐 Conversion timezone: ${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} ${race.startTime} ${timeZone} -> ${utcDate.toISOString()} (course: ${race.name})`)

      return utcDate
    }

    // Sinon, minuit heure locale (00:00 local time)
    const utcDate = localToUtcRobust(year, month, day, 0, 0, timeZone)

    this.logger.info(`🕐 Minuit locale ${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} ${timeZone} -> ${utcDate.toISOString()}`)

    return utcDate
  }

  /**
   * Calcule la date de début d'une édition en utilisant la première heure réelle (non-minuit)
   * de la date chronologique la plus précoce
   * Convertit l'heure locale (selon la ligue) en UTC avec date-fns-tz
   *
   * Stratégie:
   * 1. Déterminer le premier jour chronologique (startDate ou plus ancien raceDate)
   * 2. Chercher la première heure >= 01:00 de ce jour
   * 3. Si aucune heure vraie, utiliser minuit locale
   */
  /**
   * Converts FFA competition data to the shared ProposalInput format.
   * FFA races have distance in meters; ProposalRaceInput also expects meters.
   */
  private toProposalInput(competition: FFACompetitionDetails, ligue?: string): ProposalInput {
    const resolvedLigue = ligue || competition.competition.ligue
    const timeZone = this.getTimezoneIANA(resolvedLigue)
    const editionDate = competition.startDate

    // Convert FFA races to ProposalRaceInput[]
    const races: ProposalRaceInput[] = competition.races.map(race => {
      // Infer categories for the race name normalization
      const [categoryLevel1, categoryLevel2] = this.inferRaceCategories(
        race.name,
        race.distance ? race.distance / 1000 : undefined
      )

      // Normalize the race name
      const normalizedName = normalizeFFARaceName(
        race.name,
        categoryLevel1,
        categoryLevel2,
        race.distance ? race.distance / 1000 : undefined
      )

      return {
        name: normalizedName,
        distance: race.distance || undefined,  // Already in meters
        elevation: race.positiveElevation,
        startTime: race.startTime,
        raceDate: race.raceDate,
        price: race.price,
        categoryLevel1,
        categoryLevel2: categoryLevel2 ?? undefined,
      }
    })

    // Build organizer info
    const organizer = competition.organizerName ? {
      name: competition.organizerName,
      email: competition.organizerEmail,
      phone: competition.organizerPhone,
      websiteUrl: competition.organizerWebsite,
    } : undefined

    return {
      eventName: competition.competition.name,
      eventCity: competition.competition.city,
      eventCountry: 'France',
      eventDepartment: competition.competition.department,
      countrySubdivisionNameLevel1: convertFFALigueToRegionName(resolvedLigue),
      countrySubdivisionDisplayCodeLevel1: convertFFALigueToDisplayCode(resolvedLigue),
      countrySubdivisionNameLevel2: getDepartmentName(competition.competition.department),
      countrySubdivisionDisplayCodeLevel2: normalizeDepartmentCode(competition.competition.department),
      editionYear: competition.competition.date.getFullYear(),
      editionDate: `${editionDate.getUTCFullYear()}-${String(editionDate.getUTCMonth() + 1).padStart(2, '0')}-${String(editionDate.getUTCDate()).padStart(2, '0')}`,
      timeZone,
      calendarStatus: 'CONFIRMED',
      dataSource: 'FEDERATION',
      registrationClosingDate: competition.registrationClosingDate?.toISOString(),
      races,
      organizer,
      websiteUrl: competition.organizerWebsite,
      confidence: 0.9,
      source: 'ffa',
    }
  }

  /**
   * Crée les propositions pour une compétition
   */
  private async createProposalsForCompetition(
    competition: FFACompetitionDetails,
    matchResult: MatchResult,
    config: FFAScraperConfig,
    context: AgentContext,
    proposalsCache?: Map<string, Set<string>> // FIX 1: Cache optionnel pour déduplication intra-run
  ): Promise<ProposalData[]> {
    const proposals: ProposalData[] = []

    // Calculer la confiance selon le type de proposition
    // Pour NEW_EVENT: logique inversée (pas de match = confiance haute)
    // Pour UPDATE: logique classique (bon match = confiance haute)
    let confidence: number
    if (matchResult.type === 'NO_MATCH') {
      // Use LLM confidence if available, otherwise fall back to heuristic
      confidence = matchResult.llmNewEventConfidence ??
        calculateNewEventConfidence(config.confidenceBase, competition, matchResult)
    } else {
      confidence = calculateAdjustedConfidence(config.confidenceBase, competition, matchResult)
    }

    if (matchResult.type === 'NO_MATCH') {
      // Créer un nouvel événement via le builder partagé
      const proposalInput = this.toProposalInput(competition)
      proposalInput.confidence = confidence
      const changes = sharedBuildNewEventChanges(proposalInput)

      proposals.push({
        type: ProposalType.NEW_EVENT,
        changes,
        justification: [{
          type: 'text',
          content: `Nouvelle compétition FFA: ${competition.competition.name}`,
          metadata: {
            eventName: competition.competition.name,
            eventCity: competition.competition.city,
            editionYear: competition.competition.date.getFullYear(),
            ffaId: competition.competition.ffaId,
            confidence,
            matchScore: matchResult.confidence,  // Score du meilleur match trouvé (0 si aucun)
            source: competition.competition.detailUrl,
            level: competition.competition.level,
            organizerEmail: competition.organizerEmail,
            rejectedMatches: matchResult.rejectedMatches || [],  // Top 3 matches rejetés
            llmNewEventConfidence: matchResult.llmNewEventConfidence,
            llmReason: matchResult.llmReason,
          }
        }]
      })
    } else if (matchResult.type === 'FUZZY_MATCH' || matchResult.type === 'EXACT_MATCH') {
      // Vérifier si l'événement est featured (ne doit pas être modifié)
      // Note: matchResult.event.id est un string (type MatchResult), Prisma attend un Int
      const eventData = await this.sourceDb.event.findUnique({
        where: { id: parseInt(matchResult.event!.id, 10) },
        select: { isFeatured: true }
      })

      if (eventData?.isFeatured) {
        context.logger.info(`⚠️  Événement featured ignoré: ${matchResult.event!.name} (${matchResult.event!.id})`)
        return proposals
      }

      // Proposer des mises à jour pour l'édition existante
      if (matchResult.edition) {
        // Charger les données complètes de l'édition depuis la base
        // Note: matchResult.edition.id est un string (type MatchResult), Prisma attend un Int
        const fullEdition = await this.sourceDb.edition.findUnique({
          where: { id: parseInt(matchResult.edition.id, 10) },
          include: {
            organization: true,
            editionPartners: true,
            races: {
              include: {
                raceInfo: true
              },
              where: { isArchived: false }
            },
            editionInfo: {
              include: {
                editionServices: {
                  include: {
                    editionService: true
                  }
                }
              }
            }
          }
        })

        if (!fullEdition) {
          context.logger.warn(`⚠️  Édition ${matchResult.edition.id} non trouvée lors du chargement complet`)
        } else {
          context.logger.info(`🔍 Analyse édition ${fullEdition.id} (${matchResult.event!.name})...`)
          const { changes, justifications } = await this.compareFFAWithEdition(
            competition,
            fullEdition,
            matchResult.event!,
            confidence
          )

          // Log pour comprendre pourquoi aucun changement
          if (Object.keys(changes).length === 0) {
            context.logger.info(`✓ Édition ${fullEdition.id} (${matchResult.event!.name}) déjà à jour`, {
              ffaDate: competition.competition.date.toISOString(),
              dbDate: fullEdition.startDate?.toISOString(),
              calendarStatus: fullEdition.calendarStatus,
              hasOrganization: !!fullEdition.organization,
              racesCount: fullEdition.races?.length || 0,
              ffaRacesCount: competition.races.length
            })
          }

          // Si on a des changements, vérifier la déduplication
          if (Object.keys(changes).length > 0) {
            // Récupérer les propositions en attente pour cette édition
            const pendingProposals = await this.prisma.proposal.findMany({
              where: {
                editionId: matchResult.edition.id.toString(),
                status: 'PENDING',
                type: ProposalType.EDITION_UPDATE
              },
              select: {
                id: true,
                type: true,
                eventId: true,
                editionId: true,
                raceId: true,
                changes: true,
                status: true,
                createdAt: true
              }
            })

            // Vérifier si une proposition identique existe déjà en DB
            if (hasIdenticalPendingProposal(changes, pendingProposals)) {
              context.logger.info(`⏭️  Proposition identique déjà en attente pour édition ${matchResult.edition.id} (${matchResult.event!.name}), skip`, {
                pendingCount: pendingProposals.length,
                changesHash: require('crypto').createHash('sha256').update(JSON.stringify(changes)).digest('hex').substring(0, 8)
              })
              return proposals // Ne pas créer de nouvelle proposition
            }

            // FIX 1: Vérifier si une proposition identique a déjà été créée dans ce run
            if (proposalsCache) {
              const changeHash = require('crypto').createHash('sha256')
                .update(JSON.stringify(changes))
                .digest('hex')
              const cacheKey = matchResult.edition.id.toString()

              if (!proposalsCache.has(cacheKey)) {
                proposalsCache.set(cacheKey, new Set())
              }

              if (proposalsCache.get(cacheKey)!.has(changeHash)) {
                context.logger.info(`⏭️  Proposition identique déjà créée dans ce run pour édition ${matchResult.edition.id} (${matchResult.event!.name}), skip`, {
                  changeHash: changeHash.substring(0, 8)
                })
                return proposals
              }

              // Ajouter ce hash au cache
              proposalsCache.get(cacheKey)!.add(changeHash)
            }

            // Filtrer pour ne garder que les nouvelles informations
            const filteredChanges = filterNewChanges(changes, fullEdition, pendingProposals)

            if (Object.keys(filteredChanges).length === 0) {
              context.logger.info(`⏭️  Aucune nouvelle information pour édition ${matchResult.edition.id} (${matchResult.event!.name}), skip`, {
                originalChangesCount: Object.keys(changes).length,
                pendingProposalsCount: pendingProposals.length
              })
              return proposals
            }

            // Log si on a filtré des changements
            if (Object.keys(filteredChanges).length < Object.keys(changes).length) {
              context.logger.info(`🔍 Filtrage des changements pour ${matchResult.event!.name}:`, {
                original: Object.keys(changes).length,
                filtered: Object.keys(filteredChanges).length,
                removed: Object.keys(changes).filter(k => !filteredChanges[k])
              })
            }

            context.logger.info(`📝 Proposition EDITION_UPDATE pour ${matchResult.event!.name} (édition ${matchResult.edition.id})`, {
              changesCount: Object.keys(filteredChanges).length,
              changeTypes: Object.keys(filteredChanges),
              pendingProposalsChecked: pendingProposals.length
            })

            // Ajouter les métadonnées de contexte dans la justification
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

            // LLM confidence review if API key is available
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

  /**
   * Méthode principale d'exécution
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as FFAScraperConfig

    try {
      context.logger.info(`🚀 Démarrage FFA Scraper Agent v${FFA_SCRAPER_AGENT_VERSION}`, {
        version: FFA_SCRAPER_AGENT_VERSION,
        liguesPerRun: config.liguesPerRun,
        monthsPerRun: config.monthsPerRun,
        levels: config.levels,
        sourceDatabase: config.sourceDatabase,
        timestamp: new Date().toISOString()
      })

      // Initialiser la connexion source
      await this.initializeSourceConnection(config)

      // Vérifier que la connexion a été établie
      if (!this.sourceDb) {
        throw new Error(`Échec de la connexion à la base de données source: ${config.sourceDatabase}`)
      }

      context.logger.info('✅ Connexion à la base source établie', {
        sourceDatabase: config.sourceDatabase
      })

      // Initialiser la config Meilisearch depuis les variables d'environnement
      const meilisearchUrl = process.env.MEILISEARCH_URL
      const meilisearchApiKey = process.env.MEILISEARCH_API_KEY
      if (meilisearchUrl && meilisearchApiKey) {
        this.meilisearchConfig = { url: meilisearchUrl, apiKey: meilisearchApiKey }
        context.logger.info('🔍 Meilisearch configuré pour le matching')
      } else {
        context.logger.debug('Meilisearch non configuré, utilisation du fallback SQL')
      }

      // Initialize LLM config from env vars or DB settings
      const llmApiKey = process.env.LLM_MATCHING_API_KEY || await this.getLLMApiKeyFromSettings()
      if (llmApiKey) {
        this.llmConfig = {
          apiKey: llmApiKey,
          model: process.env.LLM_MATCHING_MODEL,
          enabled: process.env.LLM_MATCHING_ENABLED !== 'false',
          shadowMode: process.env.LLM_MATCHING_SHADOW_MODE === 'true',
        }
        this.extractor = new LLMEventExtractor({
          apiKey: llmApiKey,
          model: process.env.LLM_MATCHING_MODEL,
          logger: this.logger,
        })
        context.logger.info('🤖 LLM configuré pour matching + extraction FFA')
      } else {
        context.logger.debug('LLM non configuré (ni env LLM_MATCHING_API_KEY, ni settings DB)')
      }

      // Charger la progression
      const progress = await this.loadProgress()
      context.logger.info('📊 Progression chargée', { progress })

      // Déterminer les cibles
      const { ligues, months } = this.getNextTargets(progress, config)
      context.logger.info(`🎯 Traitement: ${ligues.length} ligues × ${months.length} mois`)

      const allProposals: ProposalData[] = []
      let totalCompetitions = 0

      // FIX 1: Cache en mémoire pour déduplication intra-run
      // Map<editionId, Set<changeHash>> pour éviter les propositions identiques dans le même run
      const proposalsCache = new Map<string, Set<string>>()

      // Scraper chaque combinaison ligue/mois
      for (const ligue of ligues) {
        for (const month of months) {
          const competitions = await this.scrapeLigueMonth(ligue, month, config, context)
          totalCompetitions += competitions.length

          // Matcher et créer des propositions
          let matchedCount = 0
          let proposalsFromMatches = 0

          for (const competition of competitions) {
            const matchResult = await matchCompetition(
              competition,
              this.sourceDb,
              config,
              this.logger,
              this.meilisearchConfig,
              this.llmConfig
            )

            const proposals = await this.createProposalsForCompetition(
              competition,
              matchResult,
              config,
              context,
              proposalsCache // FIX 1: Passer le cache à la méthode
            )

            if (matchResult.type !== 'NO_MATCH') {
              matchedCount++
              if (proposals.length > 0) {
                proposalsFromMatches++
              }
            }

            allProposals.push(...proposals)
          }

          context.logger.info(`📊 Stats: ${matchedCount} matches (${proposalsFromMatches} avec propositions)`)

          // Marquer le mois comme complété pour cette ligue
          if (!progress.completedMonths[ligue]) {
            progress.completedMonths[ligue] = []
          }
          if (!progress.completedMonths[ligue].includes(month)) {
            progress.completedMonths[ligue].push(month)
          }

          // FIX 2: Sauvegarder la progression après chaque mois complété
          // Évite de refaire la dernière combinaison en cas de crash
          await this.saveProgress(progress)
          context.logger.info(`💾 Progression sauvegardée: ${ligue} - ${month}`)

          await humanDelay(config.humanDelayMs)
        }
      }

      // Calculer la prochaine position de scraping
      // NOUVELLE LOGIQUE: Parcourir toutes les ligues pour les mêmes mois,
      // puis passer aux mois suivants
      const allMonths = generateMonthsToScrape(config.scrapingWindowMonths)
      const currentMonthIndex = allMonths.indexOf(months[0]) // Premier mois traité
      const lastProcessedLigue = ligues[ligues.length - 1]
      const lastLigueIndex = FFA_LIGUES.indexOf(lastProcessedLigue as any)

      // Avancer à la ligue suivante, ou aux mois suivants si toutes les ligues sont traitées
      if (lastLigueIndex + 1 < FFA_LIGUES.length) {
        // Il reste des ligues à traiter pour ces mois
        progress.currentLigue = FFA_LIGUES[lastLigueIndex + 1]
        // Garder les mêmes mois
        progress.currentMonth = months[0]
        context.logger.info(`⏭️  Prochaine position: ${progress.currentLigue} - ${progress.currentMonth}`, {
          liguesTraitees: ligues,
          moisTraites: months,
          prochaineLigue: progress.currentLigue
        })
      } else {
        // Toutes les ligues traitées pour ces mois, passer aux mois suivants
        const nextMonthIndex = currentMonthIndex + config.monthsPerRun
        if (nextMonthIndex < allMonths.length) {
          progress.currentMonth = allMonths[nextMonthIndex]
          progress.currentLigue = FFA_LIGUES[0] // Recommencer à la première ligue
          context.logger.info(`⏭️  Mois complétés pour toutes les ligues, passage à: ${progress.currentLigue} - ${progress.currentMonth}`)
        } else {
          // Tous les mois et toutes les ligues complétés, cycle terminé
          progress.currentLigue = FFA_LIGUES[0]
          progress.currentMonth = allMonths[0]
          context.logger.info(`🔄 Cycle complet terminé, redémarrage: ${progress.currentLigue} - ${progress.currentMonth}`)
        }
      }

      // Mettre à jour les statistiques finales
      progress.totalCompetitionsScraped += totalCompetitions
      progress.lastCompletedAt = new Date()
      // FIX 2: Sauvegarde finale pour les statistiques (progression déjà sauvegardée après chaque mois)
      await this.saveProgress(progress)

      // Sauvegarder les propositions en base de données
      context.logger.info(`💾 Sauvegarde de ${allProposals.length} propositions...`)
      for (const proposal of allProposals) {
        try {
          // Use explicit confidence if set (e.g. from LLM review), otherwise extract from justification
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
        } catch (error) {
          context.logger.error(`Erreur lors de la création d'une proposition`, {
            type: proposal.type,
            error: String(error)
          })
        }
      }

      context.logger.info(`✅ Scraping terminé: ${totalCompetitions} compétitions, ${allProposals.length} propositions sauvegardées`)

      return {
        success: true,
        message: `Scraped ${totalCompetitions} competitions, created ${allProposals.length} proposals`,
        proposals: allProposals
      }
    } catch (error) {
      context.logger.error('❌ Erreur lors du scraping FFA', { error: String(error) })
      throw error
    }
  }

  /**
   * Validation de la configuration
   */
  async validate(): Promise<boolean> {
    const config = this.config.config as FFAScraperConfig

    if (!config.sourceDatabase) {
      this.logger.error('sourceDatabase est requis dans la configuration')
      return false
    }

    if (config.liguesPerRun < 1 || config.liguesPerRun > FFA_LIGUES.length) {
      this.logger.error(`liguesPerRun doit être entre 1 et ${FFA_LIGUES.length}`)
      return false
    }

    return true
  }
}

export default FFAScraperAgent
