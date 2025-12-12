/**
 * Service de création de Proposals depuis les données Slack
 * 
 * Phase 3 de l'agent Slack:
 * - Match les données extraites avec Miles Republic
 * - Crée des Proposals (NEW_EVENT ou EDITION_UPDATE)
 * - Stocke les métadonnées Slack dans sourceMetadata
 */

import { prisma, ProposalType, ProposalStatus } from '@data-agents/database'
import {
  matchEvent,
  calculateNewEventConfidence,
  calculateAdjustedConfidence,
  EventMatchInput,
  EventMatchResult,
  DEFAULT_MATCHING_CONFIG,
  createConsoleLogger,
  ConnectionManager,
  DatabaseManager,
  PrismaClientType
} from '@data-agents/agent-framework'
import { ExtractedEventData } from './extractors/types'

/**
 * Métadonnées source Slack stockées dans la Proposal
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
 * Récupère la connexion à la base Miles Republic via ConnectionManager
 * Utilise le pattern standard des agents du framework
 */
async function getSourceDatabase(): Promise<PrismaClientType> {
  const dbManager = DatabaseManager.getInstance(logger)
  
  // L'ID 'miles-republic' doit correspondre à la configuration en base
  // Si pas trouvé, on essaie avec l'ID par défaut des agents
  const sourceDbId = 'miles-republic'
  
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
 */
function buildNewEventChanges(data: ExtractedEventData) {
  const changes: any = {
    event: {
      name: data.eventName,
      city: data.eventCity,
      country: data.eventCountry || 'France',
      department: data.eventDepartment
    },
    edition: {
      year: data.editionYear?.toString() || new Date().getFullYear().toString(),
      startDate: data.editionDate,
      endDate: data.editionEndDate || data.editionDate
    }
  }
  
  // Ajouter les courses si présentes
  if (data.races && data.races.length > 0) {
    changes.races = data.races.map(race => ({
      name: race.name,
      runDistance: race.distance ? race.distance / 1000 : undefined, // Convertir en km
      runPositiveElevation: race.elevation,
      startTime: race.startTime,
      categoryLevel1: race.categoryLevel1,
      categoryLevel2: race.categoryLevel2
    }))
  }
  
  // Ajouter l'organisateur si présent
  if (data.organizerName || data.organizerEmail || data.organizerWebsite) {
    changes.organizer = {
      name: data.organizerName,
      email: data.organizerEmail,
      phone: data.organizerPhone,
      websiteUrl: data.organizerWebsite
    }
  }
  
  // Ajouter l'URL d'inscription si présente
  if (data.registrationUrl) {
    changes.edition.registrationUrl = data.registrationUrl
  }
  
  return changes
}

/**
 * Construit les changements pour une proposition EDITION_UPDATE
 */
function buildEditionUpdateChanges(
  data: ExtractedEventData,
  matchResult: EventMatchResult
) {
  const changes: any = {}
  
  // Mettre à jour la date si différente
  if (data.editionDate) {
    changes.startDate = {
      old: matchResult.edition?.startDate,
      new: new Date(data.editionDate)
    }
  }
  
  if (data.editionEndDate) {
    changes.endDate = {
      old: null,
      new: new Date(data.editionEndDate)
    }
  }
  
  // Ajouter les courses si présentes
  if (data.races && data.races.length > 0) {
    changes.racesToAdd = {
      old: null,
      new: data.races.map(race => ({
        name: race.name,
        runDistance: race.distance ? race.distance / 1000 : undefined,
        runPositiveElevation: race.elevation,
        startTime: race.startTime,
        categoryLevel1: race.categoryLevel1,
        categoryLevel2: race.categoryLevel2
      }))
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
 * 
 * Note: Les infos de source Slack sont stockées dans sourceMetadata (champ dédié).
 * On ne duplique plus dans justification pour éviter la redondance.
 * Le dashboard utilisera sourceMetadata pour afficher les infos Slack.
 */
function buildJustifications(
  data: ExtractedEventData,
  matchResult: EventMatchResult,
  sourceMetadata: SlackSourceMetadata
) {
  const justifications: any[] = []
  
  // Si on a une URL source
  if (sourceMetadata.sourceUrl) {
    justifications.push({
      type: 'url_source',
      content: `Source: ${sourceMetadata.sourceUrl}`,
      metadata: {
        url: sourceMetadata.sourceUrl
      }
    })
  }
  
  // Si matching avec événement existant
  if (matchResult.type !== 'NO_MATCH' && matchResult.event) {
    justifications.push({
      type: 'matching',
      content: `Match ${matchResult.type} avec "${matchResult.event.name}"`,
      metadata: {
        matchType: matchResult.type,
        matchedEventId: matchResult.event.id,
        matchedEventName: matchResult.event.name,
        similarity: matchResult.event.similarity,
        matchedEditionId: matchResult.edition?.id,
        matchedEditionYear: matchResult.edition?.year
      }
    })
  }
  
  // Top 3 des matches rejetés (pour NEW_EVENT)
  if (matchResult.rejectedMatches && matchResult.rejectedMatches.length > 0) {
    justifications.push({
      type: 'rejected_matches',
      content: `Top ${matchResult.rejectedMatches.length} événements similaires trouvés mais rejetés`,
      metadata: {
        rejectedMatches: matchResult.rejectedMatches
      }
    })
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
    
    // 4. Récupérer l'agent Slack pour l'ID
    const agent = await prisma.agent.findFirst({
      where: { name: 'Slack Event Agent' }
    })
    
    if (!agent) {
      return {
        success: false,
        confidence: matchResult.confidence,
        error: 'Slack Event Agent not found'
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
      changes = buildEditionUpdateChanges(extractedData, matchResult)
      confidence = calculateAdjustedConfidence(
        extractedData.confidence,
        matchResult,
        hasOrganizerInfo,
        raceCount
      )
    }
    
    // 6. Construire les justifications (sans doublon slack_source)
    const justifications = buildJustifications(extractedData, matchResult, sourceMetadata)
    
    // 7. Créer la Proposal
    const proposal = await prisma.proposal.create({
      data: {
        agentId: agent.id,
        type: proposalType,
        status: ProposalStatus.PENDING,
        eventId: matchResult.event?.id?.toString(),
        editionId: matchResult.edition?.id?.toString(),
        eventName: extractedData.eventName,
        eventCity: extractedData.eventCity,
        editionYear: extractedData.editionYear,
        changes,
        justification: justifications,
        confidence,
        sourceMetadata: sourceMetadata as any
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
