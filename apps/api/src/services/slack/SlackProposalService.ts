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
  inferRaceCategories,
  getTimezoneFromLocation,
  getDefaultTimezone,
} from '@data-agents/database'
import {
  matchEvent,
  matchRaces,
  calculateNewEventConfidence,
  calculateAdjustedConfidence,
  EventMatchInput,
  EventMatchResult,
  RaceMatchInput,
  DbRace,
  DEFAULT_MATCHING_CONFIG,
  createConsoleLogger,
  ConnectionManager,
  DatabaseManager,
  PrismaClientType
} from '@data-agents/agent-framework'
import { zonedTimeToUtc } from 'date-fns-tz'
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
 * Enrichit une course avec les catégories inférées si non fournies
 */
function enrichRaceWithCategories(race: ExtractedRace): ExtractedRace {
  // Si les catégories sont déjà définies, ne pas les écraser
  if (race.categoryLevel1) {
    return race
  }

  // Inférer les catégories depuis le nom et la distance
  const distanceKm = race.distance ? race.distance / 1000 : undefined
  const [categoryLevel1, categoryLevel2] = inferRaceCategories(race.name, distanceKm)

  return {
    ...race,
    categoryLevel1,
    categoryLevel2,
  }
}

/**
 * Calcule la date de départ d'une course avec heure et timezone
 *
 * @param editionDate - Date de l'édition (format YYYY-MM-DD)
 * @param startTime - Heure de départ (format HH:mm)
 * @param timeZone - Timezone IANA
 * @returns Date UTC ou undefined
 */
function calculateRaceStartDate(
  editionDate: string | undefined,
  startTime: string | undefined,
  timeZone: string
): Date | undefined {
  if (!editionDate) {
    return undefined
  }

  // Si on a une heure de départ
  if (startTime) {
    const [hours, minutes] = startTime.split(':').map(Number)
    const localDateStr = `${editionDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    return zonedTimeToUtc(localDateStr, timeZone)
  }

  // Sinon, minuit local
  const localMidnight = `${editionDate}T00:00:00`
  return zonedTimeToUtc(localMidnight, timeZone)
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
 * Construit les changements pour une proposition NEW_EVENT
 * Enrichit automatiquement les courses avec catégories et dates/heures
 *
 * Structure alignée sur le FFA Scraper :
 * - Champs event au niveau racine avec { new, confidence }
 * - Edition imbriquée dans edition.new avec races et organizer
 */
function buildNewEventChanges(data: ExtractedEventData) {
  // Déterminer la timezone depuis la localisation
  const timeZone = getTimezoneFromLocation({
    department: data.eventDepartment,
    country: data.eventCountry,
  })

  // Normaliser l'année depuis editionYear ou editionDate
  const normalizedYear = normalizeEditionYear(data)
  const confidence = data.confidence || 0.5

  // Calculer les dates de l'édition avec timezone
  let editionStartDate: Date | undefined
  let editionEndDate: Date | undefined

  // Helper pour trouver l'heure la plus tôt/tard parmi les courses
  const racesWithTime = data.races?.filter(r => r.startTime) || []
  const sortedTimes = racesWithTime
    .map(r => r.startTime!)
    .sort((a, b) => a.localeCompare(b))
  const earliestTime = sortedTimes[0] || '00:00'
  const latestTime = sortedTimes[sortedTimes.length - 1] || '23:59'

  if (data.editionDate) {
    // Trouver l'heure de course la plus tôt du jour
    editionStartDate = calculateRaceStartDate(data.editionDate, earliestTime, timeZone)
  }

  if (data.editionEndDate || data.editionDate) {
    const endDateStr = data.editionEndDate || data.editionDate
    // Trouver l'heure de course la plus tard du dernier jour
    editionEndDate = calculateRaceStartDate(endDateStr, latestTime, timeZone)
  }

  // Construire l'objet edition.new (contient races et organizer)
  const editionNew: any = {
    year: normalizedYear?.toString(),
    startDate: editionStartDate,
    endDate: editionEndDate,
    timeZone
  }

  // Ajouter les courses dans edition.new.races - avec enrichissement
  if (data.races && data.races.length > 0) {
    editionNew.races = data.races.map(race => {
      // Enrichir avec les catégories si non définies
      const enrichedRace = enrichRaceWithCategories(race)

      // Calculer la date de départ avec heure et timezone
      const startDate = calculateRaceStartDate(data.editionDate, race.startTime, timeZone)

      return {
        name: enrichedRace.name,
        startDate, // Date complète avec heure et timezone
        startTime: enrichedRace.startTime, // Garder aussi l'heure locale pour référence
        runDistance: enrichedRace.distance ? enrichedRace.distance / 1000 : undefined, // Convertir en km
        runPositiveElevation: enrichedRace.elevation,
        categoryLevel1: enrichedRace.categoryLevel1,
        categoryLevel2: enrichedRace.categoryLevel2,
        timeZone
      }
    })
  }

  // Ajouter l'organisateur dans edition.new.organizer
  if (data.organizerName || data.organizerEmail || data.organizerWebsite) {
    editionNew.organizer = {
      name: data.organizerName,
      email: data.organizerEmail,
      phone: data.organizerPhone,
      websiteUrl: data.organizerWebsite
    }
  }

  // Ajouter l'URL d'inscription
  if (data.registrationUrl) {
    editionNew.registrationUrl = data.registrationUrl
  }

  // Structure alignée sur FFA Scraper : champs au niveau racine avec { new, confidence }
  const changes: any = {
    name: { new: data.eventName, confidence },
    city: { new: data.eventCity, confidence },
    country: { new: data.eventCountry || 'France', confidence },
    edition: { new: editionNew, confidence }
  }

  // Ajouter le département si présent
  if (data.eventDepartment) {
    changes.department = { new: data.eventDepartment, confidence }
  }

  return changes
}

/**
 * Construit les changements pour une proposition EDITION_UPDATE
 * Enrichit automatiquement les courses avec catégories et dates/heures
 * Utilise matchRaces() pour séparer racesToUpdate (courses existantes) et racesToAdd (nouvelles courses)
 */
function buildEditionUpdateChanges(
  data: ExtractedEventData,
  matchResult: EventMatchResult,
  existingRaces: DbRace[]
) {
  const changes: any = {}

  // Déterminer la timezone depuis la localisation
  const timeZone = getTimezoneFromLocation({
    department: data.eventDepartment,
    country: data.eventCountry,
  })

  // Helper pour trouver l'heure la plus tôt/tard parmi les courses
  const racesWithTime = data.races?.filter(r => r.startTime) || []
  const sortedTimes = racesWithTime
    .map(r => r.startTime!)
    .sort((a, b) => a.localeCompare(b))
  const earliestTime = sortedTimes[0] || '00:00'
  const latestTime = sortedTimes[sortedTimes.length - 1] || '23:59'

  // Mettre à jour la date si différente (avec timezone)
  if (data.editionDate) {
    // Trouver l'heure de course la plus tôt du jour
    const startDate = calculateRaceStartDate(data.editionDate, earliestTime, timeZone)

    changes.startDate = {
      old: matchResult.edition?.startDate,
      new: startDate
    }
  }

  if (data.editionEndDate) {
    // Trouver l'heure de course la plus tard du dernier jour
    const endDate = calculateRaceStartDate(data.editionEndDate, latestTime, timeZone)

    changes.endDate = {
      old: null,
      new: endDate
    }
  }

  // Ajouter la timezone
  changes.timeZone = {
    old: null,
    new: timeZone
  }

  // Matcher les courses extraites avec les courses existantes
  if (data.races && data.races.length > 0) {
    // Convertir les courses extraites au format RaceMatchInput
    const raceInputs: RaceMatchInput[] = data.races.map(race => ({
      name: race.name,
      distance: race.distance ? race.distance / 1000 : undefined, // Convertir m → km pour le matching
      startTime: race.startTime
    }))

    // Effectuer le matching
    const { matched, unmatched } = matchRaces(raceInputs, existingRaces, logger)

    logger.info(`Race matching: ${matched.length} matched, ${unmatched.length} new`, {
      matched: matched.map(m => `"${m.input.name}" → "${m.db.name}"`),
      unmatched: unmatched.map(u => u.name)
    })

    // Construire racesToUpdate pour les courses matchées
    if (matched.length > 0) {
      changes.racesToUpdate = {
        old: null,
        new: matched.map(({ input, db }) => {
          // Retrouver la course originale extraite pour les données complètes
          const originalRace = data.races!.find(r => r.name === input.name)!
          const enrichedRace = enrichRaceWithCategories(originalRace)
          const startDate = calculateRaceStartDate(data.editionDate, originalRace.startTime, timeZone)

          // Construire l'objet de mise à jour avec les différences
          const updates: any = {}

          // Comparer et ajouter les champs modifiés
          if (startDate) {
            updates.startDate = { old: db.startDate, new: startDate }
          }
          if (enrichedRace.distance && enrichedRace.distance / 1000 !== db.runDistance) {
            updates.runDistance = { old: db.runDistance, new: enrichedRace.distance / 1000 }
          }
          if (enrichedRace.elevation && enrichedRace.elevation !== db.runPositiveElevation) {
            updates.runPositiveElevation = { old: db.runPositiveElevation, new: enrichedRace.elevation }
          }
          if (enrichedRace.categoryLevel1) {
            updates.categoryLevel1 = { old: (db as any).categoryLevel1, new: enrichedRace.categoryLevel1 }
          }
          if (enrichedRace.categoryLevel2) {
            updates.categoryLevel2 = { old: (db as any).categoryLevel2, new: enrichedRace.categoryLevel2 }
          }

          return {
            raceId: db.id,
            raceName: db.name,
            updates,
            currentData: {
              id: db.id,
              name: db.name,
              startDate: db.startDate,
              runDistance: db.runDistance,
              runPositiveElevation: db.runPositiveElevation,
              categoryLevel1: (db as any).categoryLevel1,
              categoryLevel2: (db as any).categoryLevel2
            }
          }
        })
      }
    }

    // Construire racesToAdd pour les nouvelles courses
    if (unmatched.length > 0) {
      changes.racesToAdd = {
        old: null,
        new: unmatched.map(unmatchedInput => {
          // Retrouver la course originale extraite
          const originalRace = data.races!.find(r => r.name === unmatchedInput.name)!
          const enrichedRace = enrichRaceWithCategories(originalRace)
          const startDate = calculateRaceStartDate(data.editionDate, originalRace.startTime, timeZone)

          return {
            name: enrichedRace.name,
            startDate,
            startTime: enrichedRace.startTime,
            runDistance: enrichedRace.distance ? enrichedRace.distance / 1000 : undefined,
            runPositiveElevation: enrichedRace.elevation,
            categoryLevel1: enrichedRace.categoryLevel1,
            categoryLevel2: enrichedRace.categoryLevel2,
            timeZone
          }
        })
      }
    }
  }

  // Ajouter l'organisateur si présent
  if (data.organizerName || data.organizerEmail || data.organizerWebsite) {
    changes.organizer = {
      old: null,
      new: {
        name: data.organizerName,
        email: data.organizerEmail,
        phone: data.organizerPhone,
        websiteUrl: data.organizerWebsite
      }
    }
  }

  // URL d'inscription
  if (data.registrationUrl) {
    changes.registrationUrl = {
      old: null,
      new: data.registrationUrl
    }
  }

  return changes
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

    // 3. Effectuer le matching
    const matchResult = await matchEvent(
      matchInput,
      sourceDb,
      DEFAULT_MATCHING_CONFIG,
      logger
    )

    logger.info(`Match result: ${matchResult.type}`, { confidence: matchResult.confidence })

    // 4. Récupérer l'agent Slack pour l'ID (par agentType, pas par nom)
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

    // 5. Déterminer le type de Proposal
    let proposalType: ProposalType
    let changes: any
    let confidence: number

    const hasOrganizerInfo = !!(extractedData.organizerEmail || extractedData.organizerWebsite)
    const raceCount = extractedData.races?.length || 0

    if (matchResult.type === 'NO_MATCH' || matchResult.confidence < DEFAULT_MATCHING_CONFIG.similarityThreshold) {
      // Pas de match ou match trop faible → NEW_EVENT
      proposalType = ProposalType.NEW_EVENT
      changes = buildNewEventChanges(extractedData)
      confidence = calculateNewEventConfidence(
        extractedData.confidence, // Base sur confiance extraction
        matchResult,
        hasOrganizerInfo,
        raceCount
      )
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

      changes = buildEditionUpdateChanges(extractedData, matchResult, existingRaces)
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
