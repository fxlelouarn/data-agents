/**
 * Service de création de Proposals depuis les données Slack
 *
 * Phase 3 de l'agent Slack:
 * - Match les données extraites avec Miles Republic
 * - Crée des Proposals (NEW_EVENT ou EDITION_UPDATE)
 * - Stocke les métadonnées Slack dans sourceMetadata
 * - Enrichit les courses avec catégories et dates/heures
 */

import {
  prisma,
  ProposalType,
  ProposalStatus,
  // Types contrats
  SourceMetadata,
  Justification,
  RejectedMatch,
  createSourceMetadata,
  createRejectedMatchesJustification,
  createUrlSourceJustification,
  createMatchingJustification,
  // Services partagés
  getTimezoneFromLocation,
  getDefaultTimezone,
  normalizeRaceName,
} from '@data-agents/database'
import {
  matchEvent,
  calculateNewEventConfidence,
  calculateAdjustedConfidence,
  EventMatchInput,
  EventMatchResult,
  DbRace,
  DEFAULT_MATCHING_CONFIG,
  createConsoleLogger,
  ConnectionManager,
  DatabaseManager,
  PrismaClientType,
  MeilisearchMatchingConfig,
  LLMMatchingService,
  buildNewEventChanges as sharedBuildNewEventChanges,
  buildEditionUpdateChanges as sharedBuildEditionUpdateChanges,
} from '@data-agents/agent-framework'
import type { ProposalInput } from '@data-agents/types'
import { settingsService } from '../../config/settings'
import { ExtractedEventData, ExtractedRace } from './extractors/types'

/**
 * Métadonnées source Slack stockées dans la Proposal
 * @deprecated Utiliser SourceMetadata de @data-agents/database
 */
export interface SlackSourceMetadata {
  type: 'SLACK'
  workspaceId: string
  workspaceName: string
  channelId: string
  channelName: string
  messageTs: string
  threadTs?: string
  userId: string
  userName: string
  messageLink: string
  sourceUrl?: string
  imageUrls?: string[]
  extractedAt: string
}

/**
 * Résultat de la création de Proposal
 */
export interface CreateProposalResult {
  success: boolean
  proposalId?: string
  proposalType?: 'NEW_EVENT' | 'EDITION_UPDATE'
  matchedEvent?: {
    id: number
    name: string
    city: string
  }
  matchedEdition?: {
    id: number
    year: string
  }
  confidence: number
  error?: string
}

// Logger utilisant le framework agent-framework
const logger = createConsoleLogger('SlackProposalService', 'slack-proposal-service')

// ConnectionManager pour gérer les connexions aux bases sources
const connectionManager = new ConnectionManager()

/**
 * Convertit les données extraites Slack en ProposalInput générique pour le shared builder
 */
function toProposalInput(data: ExtractedEventData): ProposalInput {
  return {
    eventName: data.eventName,
    eventCity: data.eventCity,
    eventCountry: data.eventCountry || 'France',
    eventDepartment: data.eventDepartment,
    editionYear: data.editionYear,
    editionDate: data.editionDate,
    editionEndDate: data.editionEndDate,
    timeZone: getTimezoneFromLocation({
      department: data.eventDepartment,
      country: data.eventCountry,
    }),
    races: data.races?.map(r => ({
      name: r.name,
      distance: r.distance,
      elevation: r.elevation,
      startTime: r.startTime,
      price: r.price,
      categoryLevel1: r.categoryLevel1,
      categoryLevel2: r.categoryLevel2,
    })),
    organizer: (data.organizerName || data.organizerEmail || data.organizerWebsite) ? {
      name: data.organizerName,
      email: data.organizerEmail,
      phone: data.organizerPhone,
      websiteUrl: data.organizerWebsite,
    } : undefined,
    registrationUrl: data.registrationUrl,
    confidence: data.confidence || 0.5,
    source: 'slack',
  }
}

/**
 * Convertit les données source Slack en SourceMetadata générique
 */
function convertToSourceMetadata(slackMetadata: SlackSourceMetadata): SourceMetadata {
  return createSourceMetadata('SLACK', {
    url: slackMetadata.sourceUrl,
    imageUrls: slackMetadata.imageUrls,
    extractedAt: slackMetadata.extractedAt,
    extra: {
      workspaceId: slackMetadata.workspaceId,
      channelId: slackMetadata.channelId,
      messageLink: slackMetadata.messageLink,
      userId: slackMetadata.userId,
      userName: slackMetadata.userName,
    },
  })
}

/**
 * Récupère l'ID de la base source depuis la config de l'agent Slack
 */
async function getSlackAgentSourceDatabaseId(): Promise<string> {
  const slackAgent = await prisma.agent.findFirst({
    where: {
      config: { path: ['agentType'], equals: 'SLACK_EVENT' }
    },
    select: { config: true }
  })

  if (!slackAgent?.config) {
    throw new Error('Agent Slack non trouvé ou config manquante')
  }

  const config = slackAgent.config as Record<string, any>
  const sourceDbId = config.sourceDatabase

  if (!sourceDbId) {
    throw new Error('sourceDatabase non configuré dans l\'agent Slack')
  }

  return sourceDbId
}

/**
 * Récupère la connexion à la base Miles Republic via ConnectionManager
 * Utilise le pattern standard des agents du framework
 */
async function getSourceDatabase(): Promise<PrismaClientType> {
  const dbManager = DatabaseManager.getInstance(logger)

  // Récupérer l'ID depuis la config de l'agent Slack (comme les autres agents)
  const sourceDbId = await getSlackAgentSourceDatabaseId()

  try {
    const sourceDb = await connectionManager.connectToSource(
      sourceDbId,
      dbManager,
      logger
    )
    return sourceDb
  } catch (error: any) {
    logger.error('Erreur connexion Miles Republic via ConnectionManager', {
      error: error.message,
      sourceDbId
    })
    throw new Error(`Failed to connect to Miles Republic: ${error.message}`)
  }
}

/**
 * Normalise l'année d'édition depuis les données extraites
 * Priorité : editionYear explicite > dérivé de editionDate > undefined
 */
function normalizeEditionYear(data: ExtractedEventData): number | undefined {
  if (data.editionYear) {
    return data.editionYear
  }
  if (data.editionDate) {
    const date = new Date(data.editionDate)
    if (!isNaN(date.getTime())) {
      return date.getFullYear()
    }
  }
  return undefined
}

/**
 * Convertit les données extraites en input pour le matcher
 */
function extractedDataToMatchInput(data: ExtractedEventData): EventMatchInput | null {
  if (!data.eventName) {
    return null
  }

  // Parser la date d'édition
  let editionDate: Date
  if (data.editionDate) {
    editionDate = new Date(data.editionDate)
  } else if (data.editionYear) {
    // Si on a seulement l'année, utiliser le 1er janvier
    editionDate = new Date(`${data.editionYear}-01-01`)
  } else {
    // Pas de date = on ne peut pas matcher
    return null
  }

  return {
    eventName: data.eventName,
    eventCity: data.eventCity || '',
    eventDepartment: data.eventDepartment,
    editionDate,
    editionYear: data.editionYear || editionDate.getFullYear()
  }
}

/**
 * Construit les justifications pour la Proposal
 * Utilise les helpers du contrat standardisé
 *
 * Note: Les infos de source Slack sont stockées dans sourceMetadata (champ dédié).
 * On ne duplique plus dans justification pour éviter la redondance.
 * Le dashboard utilisera sourceMetadata pour afficher les infos Slack.
 */
function buildJustifications(
  data: ExtractedEventData,
  matchResult: EventMatchResult,
  sourceMetadata: SlackSourceMetadata
): Justification[] {
  const justifications: Justification[] = []

  // Si on a une URL source
  if (sourceMetadata.sourceUrl) {
    justifications.push(createUrlSourceJustification(sourceMetadata.sourceUrl))
  }

  // Si matching avec événement existant
  if (matchResult.type !== 'NO_MATCH' && matchResult.event) {
    justifications.push(
      createMatchingJustification(
        matchResult.type as 'EXACT' | 'FUZZY_MATCH' | 'NO_MATCH',
        {
          id: typeof matchResult.event.id === 'number' ? matchResult.event.id : parseInt(matchResult.event.id),
          name: matchResult.event.name,
          similarity: matchResult.event.similarity,
        },
        matchResult.edition
          ? {
              id: typeof matchResult.edition.id === 'number' ? matchResult.edition.id : parseInt(matchResult.edition.id),
              year: matchResult.edition.year,
            }
          : undefined
      )
    )
  }

  // Top 3 des matches rejetés (pour NEW_EVENT) - FORMAT CONTRAT OBLIGATOIRE
  if (matchResult.rejectedMatches && matchResult.rejectedMatches.length > 0) {
    // Convertir les rejectedMatches au format standardisé RejectedMatch
    const standardizedRejectedMatches: RejectedMatch[] = matchResult.rejectedMatches.map(
      (rm: any) => ({
        eventId: rm.eventId,
        eventName: rm.eventName,
        eventSlug: rm.eventSlug || '',
        eventCity: rm.eventCity || '',
        eventDepartment: rm.eventDepartment || '',
        editionId: rm.editionId,
        editionYear: rm.editionYear,
        matchScore: rm.matchScore || rm.score || 0,
        nameScore: rm.nameScore || 0,
        cityScore: rm.cityScore || 0,
        departmentMatch: rm.departmentMatch ?? false,
        dateProximity: rm.dateProximity || 0,
      })
    )

    justifications.push(createRejectedMatchesJustification(standardizedRejectedMatches))
  }

  return justifications
}

/**
 * Crée une Proposal à partir des données Slack extraites
 */
export async function createProposalFromSlack(
  extractedData: ExtractedEventData,
  sourceMetadata: SlackSourceMetadata
): Promise<CreateProposalResult> {
  try {
    // 1. Convertir en input pour le matcher
    const matchInput = extractedDataToMatchInput(extractedData)

    if (!matchInput) {
      return {
        success: false,
        confidence: 0,
        error: 'Données insuffisantes pour le matching (nom ou date manquant)'
      }
    }

    // 2. Récupérer la connexion à la base source via ConnectionManager
    const sourceDb = await getSourceDatabase()

    // 3. Préparer la config de matching avec Meilisearch si disponible
    let meilisearchConfig: MeilisearchMatchingConfig | undefined
    if (await settingsService.isMeilisearchConfigured()) {
      const url = await settingsService.getMeilisearchUrl()
      const apiKey = await settingsService.getMeilisearchApiKey()
      if (url && apiKey) {
        meilisearchConfig = { url, apiKey }
        logger.info('Meilisearch configured for matching')
      }
    }

    // 3b. Préparer la config LLM matching si disponible
    const llmConfig = await settingsService.getLLMMatchingConfig()
    const llmService = llmConfig ? new LLMMatchingService(llmConfig, {
      info: (msg: string) => logger.info(msg),
      debug: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
    }) : undefined

    // 4. Effectuer le matching
    const matchResult = await matchEvent(
      matchInput,
      sourceDb,
      { ...DEFAULT_MATCHING_CONFIG, meilisearch: meilisearchConfig, llm: llmConfig, llmService },
      logger
    )

    logger.info(`Match result: ${matchResult.type}`, { confidence: matchResult.confidence })

    // 5. Récupérer l'agent Slack pour l'ID (par agentType, pas par nom)
    const agents = await prisma.agent.findMany({
      where: {
        config: {
          path: ['agentType'],
          equals: 'SLACK_EVENT'
        }
      }
    })
    const agent = agents.length > 0 ? agents[0] : null

    if (!agent) {
      return {
        success: false,
        confidence: matchResult.confidence,
        error: 'Agent with agentType "SLACK_EVENT" not found'
      }
    }

    // 6. Déterminer le type de Proposal
    let proposalType: ProposalType
    let changes: any
    let confidence: number

    const hasOrganizerInfo = !!(extractedData.organizerEmail || extractedData.organizerWebsite)
    const raceCount = extractedData.races?.length || 0

    if (matchResult.type === 'NO_MATCH' || matchResult.confidence < DEFAULT_MATCHING_CONFIG.similarityThreshold || !matchResult.edition) {
      // Pas de match, match trop faible, ou événement trouvé sans édition → NEW_EVENT
      proposalType = ProposalType.NEW_EVENT
      const proposalInput = toProposalInput(extractedData)
      changes = sharedBuildNewEventChanges(proposalInput)
      confidence = calculateNewEventConfidence(
        extractedData.confidence, // Base sur confiance extraction
        matchResult,
        hasOrganizerInfo,
        raceCount
      )

      if (matchResult.event && !matchResult.edition) {
        logger.info(`Event "${matchResult.event.name}" found but no edition for searched year → creating NEW_EVENT`)
      }
    } else {
      // Match trouvé → EDITION_UPDATE
      proposalType = ProposalType.EDITION_UPDATE

      // Récupérer les courses existantes de l'édition pour le matching
      let existingRaces: DbRace[] = []
      if (matchResult.edition?.id) {
        const editionId = typeof matchResult.edition.id === 'number'
          ? matchResult.edition.id
          : parseInt(matchResult.edition.id)

        existingRaces = await sourceDb.race.findMany({
          where: { editionId },
          select: {
            id: true,
            name: true,
            runDistance: true,
            walkDistance: true,
            swimDistance: true,
            bikeDistance: true,
            startDate: true,
            runPositiveElevation: true,
            categoryLevel1: true,
            categoryLevel2: true
          }
        })

        logger.info(`Found ${existingRaces.length} existing races for edition ${editionId}`)
      }

      const proposalInputForUpdate = toProposalInput(extractedData)
      changes = await sharedBuildEditionUpdateChanges(proposalInputForUpdate, matchResult, existingRaces, undefined, {
        llmService,
        eventName: extractedData.eventName,
        editionYear: normalizeEditionYear(extractedData),
        eventCity: extractedData.eventCity,
      })

      // FIX 5: Deduplicate racesToAdd against existing PENDING proposals for same event/edition
      if (changes.racesToAdd?.new?.length > 0 && matchResult.event?.id && matchResult.edition?.id) {
        const pendingProposals = await prisma.proposal.findMany({
          where: {
            eventId: matchResult.event.id.toString(),
            editionId: matchResult.edition.id.toString(),
            status: 'PENDING'
          },
          select: { changes: true }
        })

        // Collect race names already proposed in other PENDING proposals
        const pendingRaceNames = new Set<string>()
        for (const pending of pendingProposals) {
          const pendingChanges = pending.changes as any
          const racesToAdd = pendingChanges?.racesToAdd?.new || []
          racesToAdd.forEach((r: any) => {
            if (r.name) {
              pendingRaceNames.add(normalizeRaceName(r.name))
            }
          })
        }

        // Filter out races already proposed
        if (pendingRaceNames.size > 0) {
          const originalCount = changes.racesToAdd.new.length
          changes.racesToAdd.new = changes.racesToAdd.new.filter(
            (r: any) => !pendingRaceNames.has(normalizeRaceName(r.name))
          )
          const filteredCount = originalCount - changes.racesToAdd.new.length
          if (filteredCount > 0) {
            logger.info(`Deduplicated ${filteredCount} race(s) already in PENDING proposals`)
          }
          // Remove racesToAdd entirely if empty
          if (changes.racesToAdd.new.length === 0) {
            delete changes.racesToAdd
          }
        }
      }

      confidence = calculateAdjustedConfidence(
        extractedData.confidence,
        matchResult,
        hasOrganizerInfo,
        raceCount
      )
    }

    // 6. Construire les justifications (sans doublon slack_source)
    const justifications = buildJustifications(extractedData, matchResult, sourceMetadata)

    // 7. Convertir sourceMetadata au format générique (contrat)
    const genericSourceMetadata = convertToSourceMetadata(sourceMetadata)

    // 8. Créer la Proposal
    // Pour NEW_EVENT, on ne stocke PAS eventId/editionId car c'est un nouvel événement
    const isNewEvent = proposalType === ProposalType.NEW_EVENT

    const proposal = await prisma.proposal.create({
      data: {
        agentId: agent.id,
        type: proposalType,
        status: ProposalStatus.PENDING,
        eventId: isNewEvent ? undefined : matchResult.event?.id?.toString(),
        editionId: isNewEvent ? undefined : matchResult.edition?.id?.toString(),
        eventName: extractedData.eventName,
        eventCity: extractedData.eventCity,
        editionYear: normalizeEditionYear(extractedData),
        changes,
        justification: justifications as any,
        confidence,
        sourceMetadata: genericSourceMetadata as any
      }
    })

    logger.info(`Proposal created: ${proposal.id}`, { type: proposalType })

    return {
      success: true,
      proposalId: proposal.id,
      proposalType: proposalType === ProposalType.NEW_EVENT ? 'NEW_EVENT' : 'EDITION_UPDATE',
      matchedEvent: matchResult.event ? {
        id: typeof matchResult.event.id === 'number' ? matchResult.event.id : parseInt(matchResult.event.id),
        name: matchResult.event.name,
        city: matchResult.event.city
      } : undefined,
      matchedEdition: matchResult.edition ? {
        id: typeof matchResult.edition.id === 'number' ? matchResult.edition.id : parseInt(matchResult.edition.id),
        year: matchResult.edition.year
      } : undefined,
      confidence
    }

  } catch (error: any) {
    logger.error('Error creating proposal', { error: error.message })
    return {
      success: false,
      confidence: 0,
      error: error.message
    }
  }
}

/**
 * Récupère une Proposal par son ID avec ses métadonnées Slack
 */
export async function getProposalWithSlackMetadata(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      agent: true
    }
  })

  if (!proposal) {
    return null
  }

  const sourceMetadata = proposal.sourceMetadata as SlackSourceMetadata | null

  return {
    ...proposal,
    isFromSlack: sourceMetadata?.type === 'SLACK',
    slackMetadata: sourceMetadata?.type === 'SLACK' ? sourceMetadata : null
  }
}
