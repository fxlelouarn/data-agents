import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { getDatabaseServiceSync } from '../services/database'
import { asyncHandler, createError } from '../middleware/error-handler'
import { requireAuth, optionalAuth } from '../middleware/auth.middleware'
import pLimit from 'p-limit'
import type { Proposal, ProposalApplication, Prisma } from '@data-agents/database'
import { notifyProposalValidatedById } from '../services/slack/SlackNotificationService'
import { settingsService } from '../config/settings'

const router = Router()
const db = getDatabaseServiceSync()

// Validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw createError(400, 'Validation failed', 'VALIDATION_ERROR')
  }
  next()
}

// GET /api/proposals/eligible-count - Compte les propositions éligibles pour l'auto-validation
// IMPORTANT: Cette route doit être AVANT /:id pour éviter le conflit
router.get('/eligible-count', asyncHandler(async (req: Request, res: Response) => {
  // Trouver l'agent FFA Scraper par agentType
  const ffaAgents = await db.prisma.agent.findMany({
    where: {
      config: {
        path: ['agentType'],
        equals: 'FFA_SCRAPER'
      }
    }
  })
  const ffaAgent = ffaAgents.length > 0 ? ffaAgents[0] : null

  if (!ffaAgent) {
    return res.json({
      success: true,
      data: { count: 0, message: 'FFA Scraper agent not found' }
    })
  }

  // Compter les propositions EDITION_UPDATE PENDING de l'agent FFA
  const count = await db.prisma.proposal.count({
    where: {
      status: 'PENDING',
      type: 'EDITION_UPDATE',
      agentId: ffaAgent.id
    }
  })

  res.json({
    success: true,
    data: { count }
  })
}))

// POST /api/proposals - Create a manual proposal
router.post('/', [
  body('eventId').optional().isString(),
  body('editionId').optional().isString(),
  body('raceId').optional().isString(),
  body('fieldName').isString().notEmpty(),
  body('fieldValue').exists(),
  body('type').isIn(['NEW_EVENT', 'EVENT_UPDATE', 'EDITION_UPDATE', 'RACE_UPDATE']),
  body('propagateToRaces').optional().isBoolean(),
  body('justification').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { eventId, editionId, raceId, fieldName, fieldValue, type, propagateToRaces, justification } = req.body

  // Validate that we have the right combination of IDs for the proposal type
  if (type === 'NEW_EVENT' && (eventId || editionId || raceId)) {
    throw createError(400, 'NEW_EVENT proposals should not have eventId, editionId, or raceId', 'INVALID_PROPOSAL_TYPE')
  }
  if (type === 'EVENT_UPDATE' && !eventId) {
    throw createError(400, 'EVENT_UPDATE proposals require eventId', 'INVALID_PROPOSAL_TYPE')
  }
  if (type === 'EDITION_UPDATE' && !editionId) {
    throw createError(400, 'EDITION_UPDATE proposals require editionId', 'INVALID_PROPOSAL_TYPE')
  }
  if (type === 'RACE_UPDATE' && !raceId) {
    throw createError(400, 'RACE_UPDATE proposals require raceId', 'INVALID_PROPOSAL_TYPE')
  }

  // Create a manual agent if it doesn't exist
  let manualAgent = await db.prisma.agent.findFirst({
    where: { name: 'Manual Input Agent' }
  })

  if (!manualAgent) {
    manualAgent = await db.prisma.agent.create({
      data: {
        name: 'Manual Input Agent',
        description: 'Agent for manually created proposals',
        type: 'SPECIFIC_FIELD',
        isActive: true,
        frequency: '0 0 * * *', // Daily at midnight (not used for manual)
        config: {}
      }
    })
  }

  // Prepare the changes object
  let changes: Record<string, any>

  if (type === 'NEW_EVENT' && fieldName === 'completeEvent') {
    // For complete event creation, structure the data properly
    changes = fieldValue
  } else {
    // Standard single field change
    changes = {
      [fieldName]: {
        old: null,
        new: fieldValue,
        confidence: 1.0 // Manual input has 100% confidence
      }
    }
  }

  // For edition startDate changes with propagation to races
  // Note: propagation would require querying Miles Republic for races
  if (type === 'EDITION_UPDATE' && fieldName === 'startDate' && propagateToRaces && editionId) {
    // TODO: Implement propagation by querying Miles Republic if needed
    console.warn('Race propagation not yet implemented without cache')
  }

  // Create justification
  const proposalJustification = [{
    type: 'text' as const,
    content: justification || `Manuel changement de ${fieldName} à ${fieldValue}`,
    metadata: {
      manual: true,
      fieldName,
      fieldValue,
      timestamp: new Date().toISOString()
    }
  }]

  // Create the proposal
  const proposal = await db.prisma.proposal.create({
    data: {
      agentId: manualAgent.id,
      type,
      status: 'PENDING',
      eventId: eventId || undefined,
      editionId: editionId || undefined,
      raceId: raceId || undefined,
      changes,
      justification: proposalJustification,
      confidence: 1.0
    },
    include: {
      agent: {
        select: { name: true, type: true }
      }
    }
  })

  // Log the manual creation
  await db.createLog({
    agentId: manualAgent.id,
    level: 'INFO',
    message: `Manual proposal created for ${type}: ${fieldName} = ${fieldValue}`,
    data: {
      proposalId: proposal.id,
      eventId,
      editionId,
      raceId,
      fieldName,
      fieldValue,
      propagateToRaces,
      justification
    }
  })

  res.status(201).json({
    success: true,
    data: proposal,
    message: 'Manual proposal created successfully'
  })
}))

// POST /api/proposals/manual - Create a complete manual NEW_EVENT proposal
router.post('/manual', [
  body('type').equals('NEW_EVENT'),
  body('changes').isObject(),
  body('userModifiedChanges').isObject(),
  body('userModifiedRaceChanges').isObject(),
  body('races').isArray(),
  body('justification').isArray(),
  body('autoValidate').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const {
    changes,
    userModifiedChanges,
    userModifiedRaceChanges,
    races,
    justification,
    autoValidate = false
  } = req.body

  // Create or get manual agent
  let manualAgent = await db.prisma.agent.findFirst({
    where: { name: 'Manual Input Agent' }
  })

  if (!manualAgent) {
    manualAgent = await db.prisma.agent.create({
      data: {
        name: 'Manual Input Agent',
        description: 'Agent for manually created proposals',
        type: 'SPECIFIC_FIELD',
        isActive: true,
        frequency: '0 0 * * *',
        config: {}
      }
    })
  }

  // Structure the changes in the expected format
  const structuredChanges: Record<string, any> = {}

  // Add event fields
  Object.entries(userModifiedChanges).forEach(([key, value]) => {
    if (!['year', 'startDate', 'endDate', 'timeZone', 'calendarStatus', 'registrationOpeningDate', 'registrationClosingDate'].includes(key)) {
      structuredChanges[key] = {
        old: null,
        new: value,
        confidence: 1.0
      }
    }
  })

  // Add edition nested structure
  const editionFields = ['year', 'startDate', 'endDate', 'timeZone', 'calendarStatus', 'registrationOpeningDate', 'registrationClosingDate']
  const editionData: Record<string, any> = {}
  editionFields.forEach(field => {
    if (userModifiedChanges[field] !== undefined) {
      editionData[field] = userModifiedChanges[field]
    }
  })

  if (Object.keys(editionData).length > 0) {
    structuredChanges.edition = {
      old: null,
      new: editionData,
      confidence: 1.0
    }

    // Add races to edition
    if (races.length > 0) {
      editionData.races = races.map((race: any) => {
        const raceData = userModifiedRaceChanges[race.id] || {}
        return {
          name: raceData.name || '',
          distance: raceData.distance || null,
          elevationGain: raceData.elevationGain || null,
          startDate: raceData.startDate || null,
          categoryLevel1: raceData.categoryLevel1 || null,
          categoryLevel2: raceData.categoryLevel2 || null
        }
      })
    }
  }

  // Determine initial status
  const status = autoValidate ? 'APPROVED' : 'PENDING'

  // Create the proposal
  const proposal = await db.prisma.proposal.create({
    data: {
      agentId: manualAgent.id,
      type: 'NEW_EVENT',
      status,
      changes: structuredChanges,
      userModifiedChanges,
      justification,
      confidence: 1.0,
      approvedBlocks: autoValidate ? {
        event: true,
        edition: true,
        organizer: userModifiedChanges.organizer ? true : undefined,
        races: races.length > 0 ? true : undefined
      } : {}
    },
    include: {
      agent: {
        select: { name: true, type: true }
      }
    }
  })

  // Log the manual creation
  await db.createLog({
    agentId: manualAgent.id,
    level: 'INFO',
    message: `Complete manual proposal created: ${userModifiedChanges.name || 'Unknown Event'}`,
    data: {
      proposalId: proposal.id,
      eventName: userModifiedChanges.name,
      city: userModifiedChanges.city,
      year: userModifiedChanges.year,
      racesCount: races.length,
      autoValidated: autoValidate
    }
  })

  res.status(201).json({
    success: true,
    data: proposal,
    message: autoValidate
      ? 'Manual proposal created and validated successfully'
      : 'Manual proposal created successfully'
  })
}))

/**
 * Enriches a proposal with contextual information from Miles Republic database
 *
 * Behavior by proposal type:
 * - EVENT_UPDATE: Adds eventName, eventCity, eventStatus from the Event table
 * - EDITION_UPDATE/NEW_EVENT: Adds previous edition info (calendarStatus, year, startDate) and eventStatus
 * - Other types: Returns proposal unchanged
 *
 * @param proposal - The proposal to enrich
 * @returns Enriched proposal with additional context fields
 */
// Singleton DatabaseManager instance for enrichProposal - INIT MODULE LEVEL
let enrichProposalDbManager: any = null
let milesRepublicConnectionId: string | null = null
let milesRepublicConnection: any = null // Cache de la connexion Prisma réutilisable

// Limiter la concurrence des requêtes DB pour éviter "too many clients"
// Dev local : 20 | Production : 10 (selon config PostgreSQL max_connections)
const enrichLimit = pLimit(process.env.NODE_ENV === 'production' ? 10 : 20)

// Cache persistant pour enrichissement (survit à travers plusieurs requêtes HTTP)
// La raison : si l'utilisateur rafraîchit la page ou si React Query refetch rapidement,
// on bénéficie du cache au lieu de refaire les mêmes requêtes SQL.
const enrichmentCache = new Map<string, any>()

// Nettoyage périodique (toutes les 10 minutes) pour éviter l'accumulation en mémoire
setInterval(() => {
  enrichmentCache.clear()
}, 10 * 60 * 1000)

export async function enrichProposal(proposal: any) {
  const startTime = Date.now()
  const proposalId = proposal.id

  // EVENT_UPDATE: Enrich with event name, city and status
  if (proposal.type === 'EVENT_UPDATE' && proposal.eventId) {
    try {
      const initStart = Date.now()
      // Lazy load and cache Miles Republic connection (une seule fois au démarrage)
      if (!milesRepublicConnection) {
        const connStart = Date.now()
        const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
          where: { type: 'MILES_REPUBLIC', isActive: true }
        })
        if (!milesRepublicConn) return proposal
        milesRepublicConnectionId = milesRepublicConn.id

        // Lazy load DatabaseManager singleton
        const importStart = Date.now()
        const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
        const logger = createConsoleLogger('API', 'proposals-api')
        enrichProposalDbManager = DatabaseManager.getInstance(logger)

        // Obtenir et cacher la connexion Prisma
        const getConnStart = Date.now()
        milesRepublicConnection = await enrichProposalDbManager.getConnection(milesRepublicConnectionId)
      } else {
      }

      const connection = milesRepublicConnection

      const numericEventId = typeof proposal.eventId === 'string' && /^\d+$/.test(proposal.eventId)
        ? parseInt(proposal.eventId)
        : proposal.eventId

      // ⚡ Cache: Éviter requêtes dupliquées pour le même événement
      const cacheKey = `event:${numericEventId}`
      let event = enrichmentCache.get(cacheKey)

      if (!event) {
        const queryStart = Date.now()
        event = await connection.event.findUnique({
          where: { id: numericEventId },
          select: {
            name: true,
            city: true,
            status: true,
            slug: true,
            isFeatured: true  // ✅ Nécessaire pour alerter si Event featured
          }
        })
        if (event) enrichmentCache.set(cacheKey, event)
      } else {
      }

      if (event) {
        return {
          ...proposal,
          eventName: event.name,
          eventCity: event.city,
          eventStatus: event.status,
          eventSlug: event.slug,
          isFeatured: event.isFeatured  // ✅ Alerter si Event featured
        }
      }
    } catch (error) {
      console.warn(`[ENRICH] ${proposalId} EVENT_UPDATE - Error: ${error}. Total time: ${Date.now() - startTime}ms`)
    }
    return proposal
  }

  // Pour les EDITION_UPDATE et NEW_EVENT
  if (proposal.type === 'EDITION_UPDATE' || proposal.type === 'NEW_EVENT') {
    try {
      const initStart = Date.now()
      // Lazy load and cache Miles Republic connection (une seule fois au démarrage)
      if (!milesRepublicConnection) {
        const connStart = Date.now()
        const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
          where: { type: 'MILES_REPUBLIC', isActive: true }
        })
        if (!milesRepublicConn) return proposal
        milesRepublicConnectionId = milesRepublicConn.id

        // Lazy load DatabaseManager singleton
        const importStart = Date.now()
        const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
        const logger = createConsoleLogger('API', 'proposals-api')
        enrichProposalDbManager = DatabaseManager.getInstance(logger)

        // Obtenir et cacher la connexion Prisma
        const getConnStart = Date.now()
        milesRepublicConnection = await enrichProposalDbManager.getConnection(milesRepublicConnectionId)
      } else {
      }

      const connection = milesRepublicConnection

      let numericEventId: number | undefined
      let editionYear: number | undefined

      // Pour EDITION_UPDATE, récupérer l'eventId depuis l'édition
      if (proposal.type === 'EDITION_UPDATE' && proposal.editionId) {
        const numericEditionId = typeof proposal.editionId === 'string' && /^\d+$/.test(proposal.editionId)
          ? parseInt(proposal.editionId)
          : proposal.editionId

        // ⚡ Cache: Édition
        const editionCacheKey = `edition:${numericEditionId}`
        let edition = enrichmentCache.get(editionCacheKey)

        if (!edition) {
          const queryStart = Date.now()
          edition = await connection.edition.findUnique({
            where: { id: numericEditionId },
            select: {
              eventId: true,
              year: true
            }
          })
          if (edition) enrichmentCache.set(editionCacheKey, edition)
        } else {
        }

        if (edition) {
          numericEventId = edition.eventId
          editionYear = parseInt(edition.year)
        }
      } else if (proposal.eventId) {
        // Pour NEW_EVENT ou si eventId est déjà fourni
        numericEventId = typeof proposal.eventId === 'string' && /^\d+$/.test(proposal.eventId)
          ? parseInt(proposal.eventId)
          : proposal.eventId
        editionYear = proposal.editionYear
      }

      if (!numericEventId) return proposal

      // Récupérer les infos de l'événement (nom, ville, statut, slug)
      // ⚡ Cache: Événement
      const eventCacheKey = `event:${numericEventId}`
      let event = enrichmentCache.get(eventCacheKey)

      if (!event) {
        const queryStart = Date.now()
        event = await connection.event.findUnique({
          where: { id: numericEventId },
            select: {
              name: true,
              city: true,
              status: true,
              slug: true,
              isFeatured: true  // ✅ Nécessaire pour alerter si Event featured
            }
        })
        if (event) enrichmentCache.set(eventCacheKey, event)
      } else {
      }

      // Base enrichment avec event info
      const enriched = {
        ...proposal,
        eventName: event?.name,
        eventCity: event?.city,
        eventStatus: event?.status,
        eventSlug: event?.slug,
        isFeatured: event?.isFeatured,  // ✅ Alerter si Event featured
        editionYear: editionYear
      }

      // Si on a editionYear, récupérer aussi l'édition précédente
      if (editionYear && typeof editionYear === 'number' && !isNaN(editionYear)) {
        const previousEditionYear = editionYear - 1

        // ⚡ Cache: Édition précédente
        const prevEditionCacheKey = `edition:${numericEventId}:${previousEditionYear}`
        let previousEdition = enrichmentCache.get(prevEditionCacheKey)

        if (!previousEdition) {
          const queryStart = Date.now()
          previousEdition = await connection.edition.findFirst({
            where: {
              eventId: numericEventId,
              year: String(previousEditionYear)
            },
            select: {
              calendarStatus: true,
              year: true,
              startDate: true
            }
          })
          if (previousEdition) enrichmentCache.set(prevEditionCacheKey, previousEdition)
        } else {
        }

        if (previousEdition) {
          enriched.previousEditionCalendarStatus = previousEdition.calendarStatus
          enriched.previousEditionYear = previousEdition.year
          enriched.previousEditionStartDate = previousEdition.startDate
        }
      }

      // Pour EDITION_UPDATE, récupérer les courses existantes de l'édition
      if (proposal.type === 'EDITION_UPDATE' && proposal.editionId) {
        const numericEditionId = typeof proposal.editionId === 'string' && /^\d+$/.test(proposal.editionId)
          ? parseInt(proposal.editionId)
          : proposal.editionId

        // ⚡ Cache: Courses existantes (PLUS GROS GAIN)
        const racesCacheKey = `races:${numericEditionId}`
        let existingRaces = enrichmentCache.get(racesCacheKey)

        if (!existingRaces) {
          const queryStart = Date.now()
          existingRaces = await connection.race.findMany({
            where: { editionId: numericEditionId },
            select: {
              id: true,
              name: true,
              runDistance: true,
              walkDistance: true,
              swimDistance: true,
              bikeDistance: true,
              runPositiveElevation: true,
              startDate: true,
              categoryLevel1: true,
              categoryLevel2: true
            },
            orderBy: { name: 'asc' }
          })
          enrichmentCache.set(racesCacheKey, existingRaces)
        } else {
        }

        // Extraire racesToUpdate de la proposition (si existe)
        const racesToUpdate = proposal.changes?.racesToUpdate?.new || []
        // ✅ FIX 2025-11-17: Convertir raceId en number pour matcher avec race.id
        // raceId dans racesToUpdate est un string ("142078") mais race.id est un number
        const raceUpdatesMap = new Map(
          racesToUpdate.map((update: any) => [
            typeof update.raceId === 'string' ? parseInt(update.raceId) : update.raceId,
            update.updates
          ])
        )

        // ✅ FIX 2025-11-18: Créer un map race.id -> currentData complet pour enrichissement
        const raceDataMap = new Map(
          existingRaces.map((race: any) => [
            race.id,
            {
              name: race.name,
              runDistance: race.runDistance,
              walkDistance: race.walkDistance,
              swimDistance: race.swimDistance,
              bikeDistance: race.bikeDistance,
              runPositiveElevation: race.runPositiveElevation,
              startDate: race.startDate,
              categoryLevel1: race.categoryLevel1,
              categoryLevel2: race.categoryLevel2
            }
          ])
        )

        // ✅ FIX 2025-11-18: Enrichir racesToUpdate avec currentData si absent
        const enrichedRacesToUpdate = racesToUpdate.map((update: any) => {
          const raceId = typeof update.raceId === 'string' ? parseInt(update.raceId) : update.raceId
          const currentData = raceDataMap.get(raceId)

          // Si currentData est déjà présent (agent récent), le garder
          // Sinon, injecter les données depuis existingRaces
          return {
            ...update,
            currentData: update.currentData || currentData || null
          }
        })

        // Mettre à jour la proposition avec les données enrichies
        if (enriched.changes?.racesToUpdate && enrichedRacesToUpdate.length > 0) {
          enriched.changes = {
            ...enriched.changes,
            racesToUpdate: {
              ...enriched.changes.racesToUpdate,
              new: enrichedRacesToUpdate
            }
          }
        }

        enriched.existingRaces = existingRaces.map((race: any) => {
          const updates = raceUpdatesMap.get(race.id) as any

          return {
            id: race.id,
            name: race.name,
            distance: (race.runDistance || 0) + (race.walkDistance || 0) + (race.swimDistance || 0) + (race.bikeDistance || 0),
            elevation: race.runPositiveElevation,
            // Appliquer la mise à jour proposée si elle existe
            startDate: updates?.startDate?.new || race.startDate,
            categoryLevel1: race.categoryLevel1,
            categoryLevel2: race.categoryLevel2,
            // Garder aussi les valeurs actuelles pour comparaison
            _current: {
              startDate: race.startDate
            },
            // Indiquer si cette course a une mise à jour proposée
            _hasUpdate: !!updates
          }
        })
      }

      return enriched
    } catch (error) {
      console.warn(`[ENRICH] ${proposalId} ${proposal.type} - Error: ${error}. Total time: ${Date.now() - startTime}ms`)
    }
  }

  return proposal
}

// GET /api/proposals - List proposals with filters
router.get('/', [
  query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']),
  query('type').optional().isIn(['NEW_EVENT', 'EVENT_UPDATE', 'EDITION_UPDATE', 'RACE_UPDATE']),
  query('eventId').optional().isString(),
  query('editionId').optional().isString(),
  query('agentName').optional().isString(),
  query('categoryLevel1').optional().isString(),
  query('categoryLevel2').optional().isString(),
  query('search').optional().isString(),
  query('sort').optional().isIn(['date-asc', 'date-desc', 'created-desc']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
const { status, type, eventId, editionId, agentName, categoryLevel1, categoryLevel2, search, sort = 'created-desc', limit = 20, offset = 0 } = req.query

  const routeStart = Date.now()

  // Déterminer l'ordre de tri selon le paramètre
  let orderBy: any
  switch (sort) {
    case 'date-asc':
      // proposedStartDate croissant, nulls à la fin
      orderBy = [
        { proposedStartDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' }  // Secondaire pour départager
      ]
      break
    case 'date-desc':
      // proposedStartDate décroissant, nulls à la fin
      orderBy = [
        { proposedStartDate: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' }
      ]
      break
    case 'created-desc':
    default:
      orderBy = { createdAt: 'desc' }
      break
  }

  // Construire le filtre de base Prisma
  const searchTerm = (search as string | undefined)?.trim()
  const baseWhere: any = {
    status: (status as string | undefined) ? (status as any) : undefined,
    type: (type as string | undefined) ? (type as any) : undefined,
    eventId: (eventId as string | undefined) || undefined,
    editionId: (editionId as string | undefined) || undefined,
    // Filtre par nom d'agent via relation
    ...(agentName ? { agent: { name: agentName as string } } : {})
  }

  // Ajouter la recherche textuelle si présente (Prisma)
  if (searchTerm) {
    baseWhere.OR = [
      { eventName: { contains: searchTerm, mode: 'insensitive' } },
      { eventCity: { contains: searchTerm, mode: 'insensitive' } },
      { editionYear: !isNaN(parseInt(searchTerm)) ? parseInt(searchTerm) : undefined }
    ].filter(condition => {
      // Filtrer les conditions invalides (editionYear undefined)
      const values = Object.values(condition)
      return values.every(v => v !== undefined)
    })
  }

  // Si on filtre par catégorie ou recherche, on doit utiliser une requête SQL brute
  // car Prisma ne supporte pas les requêtes JSONB imbriquées
  const hasCategoryFilter = categoryLevel1 || categoryLevel2
  const hasSearchFilter = !!searchTerm

  let proposals: any[]
  let total: number

  const findStart = Date.now()

  if (hasCategoryFilter) {
    // Requête SQL brute pour filtrer par catégorie dans le JSONB
    // Les catégories peuvent être dans plusieurs emplacements :
    // - NEW_EVENT: changes->'edition'->'new'->'races'
    // - EDITION_UPDATE: changes->'racesToAdd'->'new' ou changes->'racesToUpdate'->'new'

    const categoryConditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Conditions de base
    const baseConditions: string[] = []
    if (status) {
      // Cast explicite pour l'enum PostgreSQL
      baseConditions.push(`status = $${paramIndex}::"ProposalStatus"`)
      params.push(status)
      paramIndex++
    }
    if (type) {
      // Cast explicite pour l'enum PostgreSQL
      baseConditions.push(`type = $${paramIndex}::"ProposalType"`)
      params.push(type)
      paramIndex++
    }
    if (eventId) {
      baseConditions.push(`"eventId" = $${paramIndex}`)
      params.push(eventId)
      paramIndex++
    }
    if (editionId) {
      baseConditions.push(`"editionId" = $${paramIndex}`)
      params.push(editionId)
      paramIndex++
    }

    // Filtre par nom d'agent (jointure avec table agents)
    if (agentName) {
      baseConditions.push(`EXISTS (SELECT 1 FROM agents a WHERE a.id = p."agentId" AND a.name = $${paramIndex})`)
      params.push(agentName)
      paramIndex++
    }

    // Condition pour categoryLevel1
    if (categoryLevel1) {
      categoryConditions.push(`(
        EXISTS (SELECT 1 FROM jsonb_array_elements(changes->'edition'->'new'->'races') AS race WHERE race->>'categoryLevel1' = $${paramIndex})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(changes->'racesToAdd'->'new') AS race WHERE race->>'categoryLevel1' = $${paramIndex})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(changes->'racesToUpdate'->'new') AS race WHERE race->'updates'->'categoryLevel1'->>'new' = $${paramIndex})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(changes->'races'->'new') AS race WHERE race->>'categoryLevel1' = $${paramIndex})
      )`)
      params.push(categoryLevel1)
      paramIndex++
    }

    // Condition pour categoryLevel2
    if (categoryLevel2) {
      categoryConditions.push(`(
        EXISTS (SELECT 1 FROM jsonb_array_elements(changes->'edition'->'new'->'races') AS race WHERE race->>'categoryLevel2' = $${paramIndex})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(changes->'racesToAdd'->'new') AS race WHERE race->>'categoryLevel2' = $${paramIndex})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(changes->'racesToUpdate'->'new') AS race WHERE race->'updates'->'categoryLevel2'->>'new' = $${paramIndex})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(changes->'races'->'new') AS race WHERE race->>'categoryLevel2' = $${paramIndex})
      )`)
      params.push(categoryLevel2)
      paramIndex++
    }

    // Condition pour la recherche textuelle
    if (searchTerm) {
      const searchConditions = [`"eventName" ILIKE $${paramIndex}`, `"eventCity" ILIKE $${paramIndex}`]
      // Ajouter la recherche par année si c'est un nombre
      if (!isNaN(parseInt(searchTerm))) {
        searchConditions.push(`"editionYear" = ${parseInt(searchTerm)}`)
      }
      categoryConditions.push(`(${searchConditions.join(' OR ')})`)
      params.push(`%${searchTerm}%`)
      paramIndex++
    }

    const allConditions = [...baseConditions, ...categoryConditions]
    const whereClause = allConditions.length > 0 ? `WHERE ${allConditions.join(' AND ')}` : ''

    // Déterminer ORDER BY pour SQL
    let orderByClause: string
    switch (sort) {
      case 'date-asc':
        orderByClause = 'ORDER BY "proposedStartDate" ASC NULLS LAST, "createdAt" DESC'
        break
      case 'date-desc':
        orderByClause = 'ORDER BY "proposedStartDate" DESC NULLS LAST, "createdAt" DESC'
        break
      case 'created-desc':
      default:
        orderByClause = 'ORDER BY "createdAt" DESC'
        break
    }

    // Ajouter limit et offset
    params.push(parseInt(String(limit)))
    const limitParam = paramIndex++
    params.push(parseInt(String(offset)))
    const offsetParam = paramIndex++

    const query = `
      SELECT p.*,
             json_build_object('name', a.name, 'type', a.type) as agent
      FROM proposals p
      LEFT JOIN agents a ON p."agentId" = a.id
      ${whereClause}
      ${orderByClause}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `

    const countQuery = `
      SELECT COUNT(*) as count
      FROM proposals
      ${whereClause}
    `


    proposals = await db.prisma.$queryRawUnsafe(query, ...params)
    const countResult = await db.prisma.$queryRawUnsafe(countQuery, ...params.slice(0, -2)) as any[]
    total = parseInt(countResult[0].count)

  } else {
    // Requête Prisma standard (sans filtre catégorie)
    proposals = await db.prisma.proposal.findMany({
      where: baseWhere,
      include: {
        agent: {
          select: { name: true, type: true }
        }
      },
      orderBy,
      take: parseInt(String(limit)),
      skip: parseInt(String(offset))
    })

    total = await db.prisma.proposal.count({ where: baseWhere })
  }


  // Enrichir chaque proposition avec les infos contextuelles (concurrence limitée)
  const enrichStart = Date.now()
  const enrichedProposals = await Promise.all(
    proposals.map((p, idx) => {
      return enrichLimit(() => enrichProposal(p))
    })
  )

// ⚡ Cache conservé entre les requêtes pour performance (cleanup périodique en tâche de fond)

  res.json({
    success: true,
    data: enrichedProposals,
    meta: {
      total,
      limit: parseInt(String(limit)),
      offset: parseInt(String(offset)),
      hasMore: (parseInt(String(offset)) + parseInt(String(limit))) < total
    }
  })
}))

// GET /api/proposals/group/:groupKey - Get proposals by group key
router.get('/group/:groupKey', [
  param('groupKey').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { groupKey } = req.params

  let proposals: any[]

  // Check if it's a new event group
  if (groupKey.startsWith('new-event-')) {
    const proposalId = groupKey.replace('new-event-', '')
    const proposal = await db.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        agent: {
          select: { name: true, type: true }
        },
        applications: {
          select: { id: true, blockType: true, status: true }
        }
      }
    })

    proposals = proposal ? [proposal] : []
  } else {
    // Parse eventId-editionId format (ou eventId-only pour propositions sans editionId)
    const parts = groupKey.split('-')
    const eventId = parts[0]
    const editionId = parts[1] // Peut être undefined si format "eventId-only"

    if (!eventId || eventId === 'unknown') {
      throw createError(400, 'Invalid group key format', 'INVALID_GROUP_KEY')
    }

    // Get all proposals for this event/edition combination
    // ⚠️ FIX 2025-12-10: Exclure les propositions ARCHIVED et REJECTED pour éviter
    // qu'elles soient réapprouvées lors de la validation groupée
    // ⚠️ FIX 2025-12-15: Supporter les propositions sans editionId (editionId-only groupKey)
    const whereClause: any = {
      eventId,
      status: { notIn: ['ARCHIVED', 'REJECTED'] }
    }

    // Si editionId est fourni et valide, filtrer par editionId
    // Sinon, chercher les propositions avec editionId NULL (propositions EVENT_UPDATE ou EDITION_UPDATE sans édition cible)
    if (editionId && editionId !== 'undefined' && editionId !== 'null' && editionId !== 'unknown') {
      whereClause.editionId = editionId
    } else {
      // Propositions sans editionId (null)
      whereClause.editionId = null
    }

    proposals = await db.prisma.proposal.findMany({
      where: whereClause,
      include: {
        agent: {
          select: { name: true, type: true }
        },
        applications: {
          select: { id: true, blockType: true, status: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // Enrichir chaque proposition avec les infos contextuelles (concurrence limitée)
  const enrichedProposals = await Promise.all(
    proposals.map(p => enrichLimit(() => enrichProposal(p)))
  )

  // ⚡ Nettoyer le cache après l'enrichissement
  enrichmentCache.clear()

  res.json({
    success: true,
    data: enrichedProposals,
    meta: {
      total: enrichedProposals.length,
      groupKey
    }
  })
}))

// GET /api/proposals/:id - Get proposal details
router.get('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const proposal = await db.prisma.proposal.findUnique({
    where: { id },
    include: {
      agent: {
        select: { id: true, name: true, type: true }
      }
    }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  // Get related proposals for same event/edition/race
  const relatedProposals = await db.prisma.proposal.findMany({
    where: {
      id: { not: id },
      OR: [
        { eventId: proposal.eventId },
        { editionId: proposal.editionId },
        { raceId: proposal.raceId }
      ].filter(condition => Object.values(condition)[0] !== null)
    },
    include: {
      agent: {
        select: { name: true, type: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Enrichir la proposition avec les infos contextuelles (nom event, ville, année édition, etc.)
  const enrichedProposal = await enrichProposal(proposal)

  res.json({
    success: true,
    data: {
      ...enrichedProposal,
      relatedProposals
    }
  })
}))

// PUT /api/proposals/:id - Update proposal (approve, reject, archive)
router.put('/:id', requireAuth, [
  param('id').isString().notEmpty(),
  body('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']),
  body('reviewedBy').optional().isString(),
  body('appliedChanges').optional().isObject(),
  body('userModifiedChanges').optional().isObject(),
  body('modificationReason').optional().isString(),
  body('modifiedBy').optional().isString(),
  body('block').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { status, reviewedBy, appliedChanges, userModifiedChanges, modificationReason, modifiedBy, block } = req.body

  // Récupérer l'utilisateur connecté
  const userId = req.user!.userId

  // Récupérer la proposition actuelle pour gérer les blocs
  const currentProposal = await db.prisma.proposal.findUnique({
    where: { id }
  })

  if (!currentProposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  const updates: any = {}

  // Si un bloc spécifique est fourni et qu'on approuve
  if (status === 'APPROVED' && block) {
    const approvedBlocks = (currentProposal.approvedBlocks as Record<string, boolean>) || {}
    approvedBlocks[block] = true
    updates.approvedBlocks = approvedBlocks

    // On met le status général à APPROVED seulement si tous les blocs sont approuvés
    // Pour l'instant, on marque comme approuvé dès qu'un bloc est approuvé
    updates.status = status
    updates.reviewedAt = new Date()
    updates.reviewedBy = reviewedBy || userId  // ✅ Enregistrer qui a validé
  } else if (status) {
    // Approbation/rejet global standard
    updates.status = status
    updates.reviewedAt = new Date()
    updates.reviewedBy = reviewedBy || userId  // ✅ Enregistrer qui a validé
  }

  // Gérer les modifications utilisateur
  if (userModifiedChanges) {
    updates.userModifiedChanges = userModifiedChanges
    updates.modificationReason = modificationReason
    updates.modifiedBy = modifiedBy || reviewedBy
    updates.modifiedAt = new Date()
  }

  const proposal = await db.updateProposal(id, updates)

  // If approved, create a ProposalApplication but don't apply yet
  let createdApplication = null
  if (status === 'APPROVED') {
    // Check if application already exists for this proposal
    const existingApp = await db.prisma.proposalApplication.findFirst({
      where: { proposalId: id }
    })

    if (!existingApp) {
      // Check if there's an existing PENDING application with identical changes
      // This avoids creating duplicate updates for grouped proposals
      const proposalChanges = JSON.stringify(proposal.changes)
      const allPendingApplications = await db.prisma.proposalApplication.findMany({
        where: { status: 'PENDING' },
        include: { proposal: true }
      })

      const duplicateApp = allPendingApplications.find((app: ProposalApplication & { proposal: Proposal }) => {
        // Check if same type and same target (event/edition/race)
        if (app.proposal.type !== proposal.type) return false
        if (app.proposal.eventId !== proposal.eventId) return false
        if (app.proposal.editionId !== proposal.editionId) return false
        if (app.proposal.raceId !== proposal.raceId) return false

        // Check if changes are identical
        const appChanges = JSON.stringify(app.proposal.changes)
        return appChanges === proposalChanges
      })

      if (duplicateApp) {
        // Don't create a new application - reuse the existing one
        await db.createLog({
          agentId: proposal.agentId,
          level: 'INFO',
          message: `Proposal ${id} approved - Identical update already pending (${duplicateApp.id})`,
          data: {
            proposalId: id,
            existingApplicationId: duplicateApp.id,
            reason: 'duplicate_changes'
          }
        })
      } else {
        // Create a new application
        createdApplication = await db.prisma.proposalApplication.create({
          data: {
            proposalId: id,
            status: 'PENDING'
          }
        })

        await db.createLog({
          agentId: proposal.agentId,
          level: 'INFO',
          message: `Proposal ${id} approved - Application created and ready for deployment`,
          data: {
            proposalId: id,
            applicationId: createdApplication.id
          }
        })
      }
    } else {
      await db.createLog({
        agentId: proposal.agentId,
        level: 'INFO',
        message: `Proposal ${id} approved - Application already exists`,
        data: {
          proposalId: id,
          existingApplicationId: existingApp.id
        }
      })
    }
  }

  // 🔔 Notification Slack si la proposition est approuvée (fire-and-forget)
  if (status === 'APPROVED') {
    const validatedBlocks = block ? [block] : ['all']
    notifyProposalValidatedById(id, validatedBlocks, userId)
      .catch(err => console.error('❌ Erreur notification Slack:', err))
  }

  res.json({
    success: true,
    data: proposal,
    createdApplication,
    message: `Proposal ${status?.toLowerCase() || 'updated'} successfully${createdApplication ? ' - Application created and ready for deployment' : ''}`
  })
}))

// ✅ Utility function to filter changes by block type
// This ensures each ProposalApplication only stores changes relevant to its block
function filterChangesByBlock(changes: Record<string, any>, blockType: string): Record<string, any> {
  const blockFields: Record<string, string[]> = {
    event: ['name', 'city', 'country', 'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl',
            'countrySubdivisionNameLevel1', 'countrySubdivisionNameLevel2',
            'countrySubdivisionDisplayCodeLevel1', 'countrySubdivisionDisplayCodeLevel2',
            'fullAddress', 'latitude', 'longitude', 'coverImage', 'images',
            'peyceReview', 'isPrivate', 'isFeatured', 'isRecommended', 'toUpdate', 'dataSource'],
    edition: ['year', 'startDate', 'endDate', 'timeZone', 'registrationOpeningDate', 'registrationClosingDate',
              'calendarStatus', 'clientStatus', 'status', 'currency', 'medusaVersion', 'customerType',
              'registrantsNumber', 'whatIsIncluded', 'clientExternalUrl', 'bibWithdrawalFullAddress',
              'volunteerCode', 'confirmedAt'],
    organizer: ['organizer', 'organizerId'],
    races: ['races', 'racesToUpdate', 'racesToAdd', 'raceEdits', 'racesToDelete', 'racesToAddFiltered', 'consolidatedRaces']
  }

  const fields = blockFields[blockType] || []
  const filtered: Record<string, any> = {}

  // ✅ FIX: Pour NEW_EVENT, les données edition/races/organizer sont dans changes.edition.new
  const editionData = changes.edition?.new || changes.edition || {}

  // Filter fields for the specified block
  fields.forEach(field => {
    // D'abord chercher au niveau racine
    if (changes[field] !== undefined) {
      filtered[field] = changes[field]
    }
    // ✅ Pour edition, races et organizer : chercher aussi dans edition.new (structure NEW_EVENT)
    else if (blockType === 'edition' && editionData[field] !== undefined) {
      filtered[field] = { new: editionData[field], confidence: changes.edition?.confidence || 1 }
    }
    else if (blockType === 'organizer' && field === 'organizer' && editionData.organizer !== undefined) {
      filtered[field] = { new: editionData.organizer, confidence: changes.edition?.confidence || 1 }
    }
    else if (blockType === 'races' && field === 'races' && editionData.races !== undefined) {
      filtered[field] = { new: editionData.races, confidence: changes.edition?.confidence || 1 }
    }
  })

  // Handle race_* prefixed fields for the races block
  if (blockType === 'races') {
    Object.keys(changes).forEach(key => {
      if (key.startsWith('race_')) {
        filtered[key] = changes[key]
      }
    })
  }

  return filtered
}

// POST /api/proposals/validate-block-group - Validate a block for multiple proposals (grouped mode)
router.post('/validate-block-group', requireAuth, [
  body('proposalIds').isArray().withMessage('proposalIds must be an array'),
  body('proposalIds.*').isString().withMessage('Each proposalId must be a string'),
  body('block').isString().notEmpty().withMessage('block is required'),
  body('changes').isObject().withMessage('changes must be an object'),
  // ✅ Two-Panes: primaryProposalId optionnel - si fourni, utiliser ses changes uniquement (pas de merge)
  body('primaryProposalId').optional().isString().withMessage('primaryProposalId must be a string'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { proposalIds, block, changes, primaryProposalId } = req.body
  const userId = req.user!.userId

  // Log pour debug
  console.log('\ud83d\udce6 validate-block-group appelé avec:', {
    proposalIds,
    block,
    changesKeys: Object.keys(changes),
    primaryProposalId: primaryProposalId || 'none (legacy merge mode)'
  })

  // Vérifier que les propositions existent et sont du même groupe
  const allProposals = await db.prisma.proposal.findMany({
    where: { id: { in: proposalIds } }
  })

  if (allProposals.length !== proposalIds.length) {
    throw createError(404, 'Some proposals not found', 'PROPOSALS_NOT_FOUND')
  }

  // ⚠️ FIX 2025-12-10: Filtrer les propositions ARCHIVED et REJECTED
  // Elles ne doivent pas être réapprouvées lors de la validation groupée
  const proposals = allProposals.filter((p: Proposal) =>
    p.status !== 'ARCHIVED' && p.status !== 'REJECTED'
  )

  if (proposals.length === 0) {
    throw createError(400, 'No valid proposals to validate (all are archived or rejected)', 'NO_VALID_PROPOSALS')
  }

  // Mettre à jour proposalIds pour ne garder que les valides
  const validProposalIds = proposals.map((p: Proposal) => p.id)

  if (validProposalIds.length < proposalIds.length) {
    console.log(`⚠️ validate-block-group: Filtered out ${proposalIds.length - validProposalIds.length} ARCHIVED/REJECTED proposals`)
  }

  // Vérifier la cohérence du groupe selon le type
  const proposalTypes = [...new Set(proposals.map((p: Proposal) => p.type))]

  // NEW_EVENT : Pas besoin d'editionId (pas encore créée)
  if (proposalTypes.includes('NEW_EVENT')) {
    // Pour NEW_EVENT, on peut avoir plusieurs propositions du même événement
    // ou des événements différents (validation moins stricte)
    console.log('✅ NEW_EVENT détecté - Pas de validation editionId requise')
  } else {
    // EDITION_UPDATE, EVENT_UPDATE, RACE_UPDATE : Doivent cibler la même édition
    const editionIds = [...new Set(proposals.map((p: Proposal) => p.editionId).filter(Boolean))]
    if (editionIds.length !== 1) {
      throw createError(400, 'Proposals must target the same edition', 'INVALID_PROPOSAL_GROUP')
    }
  }

  // Construire le payload consolidé depuis 'changes'
  // Le frontend envoie déjà les changements consolidés (sélectionnés + modifiés)
  const approvedBlocks = { [block]: true }

  // ✅ PHASE 1: Construire le payload final (agent + user merged)
  // ✅ Two-Panes 2025-12-28: Si primaryProposalId est fourni, utiliser UNIQUEMENT ses changes (pas de merge)
  const baseChanges: Record<string, any> = {}
  
  if (primaryProposalId) {
    // ✅ Mode Two-Panes: Utiliser uniquement les changes de la proposition prioritaire
    const primaryProposal = proposals.find((p: Proposal) => p.id === primaryProposalId)
    if (!primaryProposal) {
      throw createError(400, `Primary proposal ${primaryProposalId} not found in group`, 'PRIMARY_PROPOSAL_NOT_FOUND')
    }
    
    const proposalChanges = primaryProposal.changes as Record<string, any>
    Object.entries(proposalChanges).forEach(([key, value]) => {
      baseChanges[key] = value
    })
    
    console.log('✅ Two-Panes: Utilisation des changes de la proposition prioritaire uniquement:', {
      primaryProposalId,
      baseChangesKeys: Object.keys(baseChanges)
    })
  } else {
    // ⚠️ Mode legacy: Fusionner les changes de TOUTES les propositions du groupe
    // Ce mode est conservé pour rétrocompatibilité mais sera progressivement abandonné
    console.log('⚠️ Legacy mode: Fusion des changes de toutes les propositions')
    
    for (const proposal of proposals) {
      const proposalChanges = proposal.changes as Record<string, any>
      Object.entries(proposalChanges).forEach(([key, value]) => {
        // Pour les tableaux (racesToUpdate, racesExisting, racesToAdd), fusionner
        if (key === 'racesToUpdate' || key === 'racesExisting' || key === 'racesToAdd') {
          const existingArr = baseChanges[key]?.new || baseChanges[key] || []
          const newArr = value?.new || value || []
          if (Array.isArray(existingArr) && Array.isArray(newArr)) {
            // Fusionner en évitant les doublons par raceId
            const merged = [...existingArr]
            const existingRaceIds = new Set(existingArr.map((r: any) => r.raceId?.toString()))
            newArr.forEach((race: any) => {
              if (race.raceId && !existingRaceIds.has(race.raceId.toString())) {
                merged.push(race)
              } else if (!race.raceId) {
                merged.push(race) // Nouvelles courses sans raceId
              }
            })
            baseChanges[key] = value?.new ? { new: merged, confidence: value.confidence || 1 } : merged
          } else {
            baseChanges[key] = value
          }
        } else if (!(key in baseChanges)) {
          // Pour les autres champs, prendre la première valeur trouvée
          baseChanges[key] = value
        }
      })
    }
  }

  // Garder une référence à la proposition principale pour les logs et l'agentId
  // ✅ Two-Panes: Utiliser primaryProposal si fourni, sinon première proposition
  const firstProposal = primaryProposalId 
    ? proposals.find((p: Proposal) => p.id === primaryProposalId) || proposals[0]
    : proposals[0]

  // ✅ FIX: Lire raceEdits depuis 'changes' envoyé par le frontend
  // Le frontend envoie déjà userModifiedRaceChanges dans changes.raceEdits
  const raceEdits = changes.raceEdits || {}

  console.log('🔧 Construction payload final:', {
    block,
    baseChangesKeys: Object.keys(baseChanges),
    changesKeys: Object.keys(changes),
    hasRaceEdits: !!raceEdits,
    raceEditsKeys: Object.keys(raceEdits)
  })

  // 1. Merger changes envoyé par le frontend avec baseChanges
  Object.entries(changes).forEach(([key, value]) => {
    if (key !== 'raceEdits') {
      baseChanges[key] = value
    }
  })

  // 2. ✅ Construire racesToDelete depuis raceEdits._deleted
  if (block === 'races' && Object.keys(raceEdits).length > 0) {
    const racesToDelete: Array<{ raceId: number | string, raceName: string }> = []

    // Essayer d'extraire existingRaces depuis les changes (racesToUpdate OU racesExisting)
    const racesToUpdateArr = baseChanges.racesToUpdate?.new || baseChanges.racesToUpdate || []
    const racesExistingArr = baseChanges.racesExisting?.new || baseChanges.racesExisting || []
    const existingRacesFromChanges = [
      ...(Array.isArray(racesToUpdateArr) ? racesToUpdateArr : []),
      ...(Array.isArray(racesExistingArr) ? racesExistingArr : [])
    ]

    // ✅ FIX 2025-12-11: Construire un index par raceId pour lookup rapide
    // ✅ FIX 2025-12-15: Inclure aussi racesExisting (propositions manuelles)
    const racesByRaceId: Record<string, any> = {}
    existingRacesFromChanges.forEach((race: any) => {
      if (race.raceId) {
        racesByRaceId[race.raceId.toString()] = race
      }
    })

    Object.entries(raceEdits).forEach(([key, mods]: [string, any]) => {
      if (mods._deleted === true) {
        if (key.startsWith('existing-')) {
          // Course existante supprimée (ancien format)
          const index = parseInt(key.replace('existing-', ''))
          const race = existingRacesFromChanges[index]
          if (race) {
            racesToDelete.push({
              raceId: race.raceId || race.id || key,
              raceName: race.raceName || race.name || `Course ${index}`
            })
          } else {
            // Fallback si pas trouvé
            racesToDelete.push({
              raceId: key,
              raceName: `Course existing-${index}`
            })
          }
        } else if (key.startsWith('new-')) {
          // Nouvelle course supprimée avant application
          const index = parseInt(key.replace('new-', ''))
          racesToDelete.push({
            raceId: key,
            raceName: `Nouvelle course ${index}`
          })
        } else if (/^\d+$/.test(key)) {
          // ✅ FIX 2025-12-11: Nouveau format - clé est le vrai raceId
          const race = racesByRaceId[key]
          if (race) {
            racesToDelete.push({
              raceId: parseInt(key),
              raceName: race.raceName || race.name || `Course ${key}`
            })
          } else {
            racesToDelete.push({
              raceId: parseInt(key),
              raceName: `Course ${key}`
            })
          }
        }
      }
    })

    if (racesToDelete.length > 0) {
      baseChanges.racesToDelete = racesToDelete
      console.log('🗑️ Courses à supprimer:', racesToDelete.map(r => `${r.raceName} (${r.raceId})`))
    }

    // ✅ FIX 2025-12-11: Construire racesToAddFiltered pour éviter de créer puis supprimer des courses
    // Collecter les indices des nouvelles courses (new-X) marquées comme supprimées
    const racesToAddFiltered: number[] = []
    Object.entries(raceEdits).forEach(([key, mods]: [string, any]) => {
      if (mods._deleted === true && key.startsWith('new-')) {
        const index = parseInt(key.replace('new-', ''))
        if (!isNaN(index) && index < 1000000) { // Exclure les courses ajoutées manuellement (timestamp)
          racesToAddFiltered.push(index)
        }
      }
    })

    if (racesToAddFiltered.length > 0) {
      baseChanges.racesToAddFiltered = racesToAddFiltered
      console.log('🚫 Nouvelles courses à ne PAS créer (indices):', racesToAddFiltered)
    }
  }

  // 3. ✅ Merger modifications utilisateur dans racesToUpdate
  if (block === 'races' && Object.keys(raceEdits).length > 0) {
    // Gérer racesToUpdate (nouvelle structure)
    if (baseChanges.racesToUpdate) {
      const racesToUpdate = baseChanges.racesToUpdate.new || baseChanges.racesToUpdate
      if (Array.isArray(racesToUpdate)) {
        racesToUpdate.forEach((race: any, index: number) => {
          // ✅ FIX 2025-12-11: Le frontend envoie maintenant les vrais raceId comme clés
          // Chercher d'abord par raceId, puis fallback sur existing-{index} (rétro-compatibilité)
          const raceId = race.raceId?.toString()
          const userEdits = raceEdits[raceId] || raceEdits[`existing-${index}`]

          if (userEdits && !userEdits._deleted) {
            if (!race.updates) race.updates = {}
            // Appliquer modifications utilisateur
            Object.entries(userEdits).forEach(([field, value]) => {
              if (field !== '_deleted') {
                race.updates[field] = {
                  new: value,
                  old: race.currentData?.[field]
                }
              }
            })
          }
        })
      }
    }

    // Gérer racesToAdd (nouvelles courses)
    if (baseChanges.racesToAdd) {
      const racesToAdd = baseChanges.racesToAdd.new || baseChanges.racesToAdd
      if (Array.isArray(racesToAdd)) {
        racesToAdd.forEach((race: any, index: number) => {
          const key = `new-${index}`
          const userEdits = raceEdits[key]

          if (userEdits && !userEdits._deleted) {
            // Appliquer modifications utilisateur sur nouvelles courses
            Object.entries(userEdits).forEach(([field, value]) => {
              if (field !== '_deleted') {
                // ✅ Vérifier si race[field] est déjà un objet {new, old}
                if (race[field] && typeof race[field] === 'object' && 'new' in race[field]) {
                  // Déjà au bon format, juste mettre à jour .new
                  race[field].new = value
                } else {
                  // Soit undefined, soit une valeur simple (string, number, etc.)
                  // Créer la structure {new, old}
                  race[field] = {
                    new: value,
                    old: race[field] || null  // Préserver l'ancienne valeur si elle existe
                  }
                }
              }
            })
          }
        })
      }
    }

    // ✅ FIX 2025-12-14: Gérer racesExisting - convertir en racesToUpdate si modifiées
    // Les courses dans racesExisting sont des courses DB non matchées, sans propositions de changement
    // Si l'utilisateur les modifie, on doit les transformer en racesToUpdate
    if (baseChanges.racesExisting) {
      const racesExisting = baseChanges.racesExisting.new || baseChanges.racesExisting
      if (Array.isArray(racesExisting)) {
        // Initialiser racesToUpdate si pas déjà présent
        if (!baseChanges.racesToUpdate) {
          baseChanges.racesToUpdate = { new: [], confidence: baseChanges.racesExisting.confidence || 0.75 }
        }
        const racesToUpdate = baseChanges.racesToUpdate.new || baseChanges.racesToUpdate

        racesExisting.forEach((race: any) => {
          const raceId = race.raceId?.toString()
          const userEdits = raceEdits[raceId]

          if (userEdits && !userEdits._deleted) {
            // Cette course existante a des modifications utilisateur
            // La transformer en racesToUpdate
            const raceUpdate: any = {
              raceId: race.raceId,
              raceName: race.raceName,
              currentData: race.currentData || {
                name: race.raceName,
                runDistance: race.runDistance,
                walkDistance: race.walkDistance,
                bikeDistance: race.bikeDistance,
                swimDistance: race.swimDistance,
                runPositiveElevation: race.runPositiveElevation,
                categoryLevel1: race.categoryLevel1,
                categoryLevel2: race.categoryLevel2,
                startDate: race.startDate
              },
              updates: {}
            }

            // Appliquer les modifications utilisateur
            Object.entries(userEdits).forEach(([field, value]) => {
              if (field !== '_deleted') {
                raceUpdate.updates[field] = {
                  new: value,
                  old: raceUpdate.currentData[field]
                }
              }
            })

            // Ajouter à racesToUpdate seulement s'il y a des updates
            if (Object.keys(raceUpdate.updates).length > 0) {
              racesToUpdate.push(raceUpdate)
            }
          }
        })
      }
    }
  }

  // ✅ FIX: Merger baseChanges (agent) + changes (user) au lieu de choisir l'un ou l'autre
  const finalPayload = { ...baseChanges, ...changes }

  // Ajouter raceEdits si non vide (pour compatibilité backend)
  if (Object.keys(raceEdits).length > 0) {
    finalPayload.raceEdits = raceEdits
  }

  console.log('📦 Payload final construit:', {
    block,
    payloadKeys: Object.keys(finalPayload),
    racesToUpdate: finalPayload.racesToUpdate?.length || finalPayload.racesToUpdate?.new?.length || 0,
    racesToAdd: finalPayload.racesToAdd?.length || finalPayload.racesToAdd?.new?.length || 0,
    racesToDelete: finalPayload.racesToDelete?.length || 0,
    hasRaceEdits: !!finalPayload.raceEdits
  })

  // ✅ FIX 2025-12-11: Construire userModifiedChanges à partir de finalPayload (pas juste changes)
  // Cela inclut racesToAddFiltered et racesToDelete construits à partir de raceEdits
  const userModifiedChangesToSave = { ...changes }
  if (baseChanges.racesToAddFiltered) {
    userModifiedChangesToSave.racesToAddFiltered = baseChanges.racesToAddFiltered
  }
  if (baseChanges.racesToDelete) {
    userModifiedChangesToSave.racesToDelete = baseChanges.racesToDelete
  }

  // Mettre à jour les propositions valides avec le même payload
  const updatedProposals = await Promise.all(
    validProposalIds.map(async (proposalId: string) => {
      const proposal = proposals.find((p: Proposal) => p.id === proposalId)!
      const existingApprovedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}
      const existingUserModifiedChanges = (proposal.userModifiedChanges as Record<string, any>) || {}

      return db.updateProposal(proposalId, {
        approvedBlocks: { ...existingApprovedBlocks, ...approvedBlocks },
        userModifiedChanges: { ...existingUserModifiedChanges, ...userModifiedChangesToSave },
        modifiedAt: new Date(),
        modifiedBy: userId
      })
    })
  )

  // Vérifier si tous les blocs ATTENDUS sont validés pour marquer les propositions comme APPROVED
  // On détermine les blocs attendus depuis le contenu de changes
  const updatedFirstProposal = updatedProposals[0]
  const approvedBlocksObj = updatedFirstProposal.approvedBlocks as Record<string, boolean>

  // ✅ Déterminer les blocs ATTENDUS en analysant les changes
  const expectedBlocks = new Set<string>()
  const proposalChanges = updatedFirstProposal.changes as Record<string, any>

  // Analyser les champs pour déterminer les blocs nécessaires
  const eventFields = ['name', 'city', 'country', 'countrySubdivisionNameLevel1',
    'countrySubdivisionNameLevel2', 'fullAddress', 'latitude', 'longitude',
    'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl']
  const editionFields = ['year', 'startDate', 'endDate', 'calendarStatus', 'timeZone',
    'registrationStartDate', 'registrationEndDate', 'registrantsNumber']

  Object.keys(proposalChanges).forEach(field => {
    if (eventFields.includes(field)) {
      expectedBlocks.add('event')
    } else if (editionFields.includes(field)) {
      expectedBlocks.add('edition')
    } else if (field === 'organizer') {
      expectedBlocks.add('organizer')
    } else if (field === 'races' || field === 'racesToAdd' || field === 'racesToUpdate') {
      expectedBlocks.add('races')
    }
  })

  // Pour NEW_EVENT, on attend toujours les blocs: event, edition, races (organizer optionnel)
  if (updatedFirstProposal.type === 'NEW_EVENT') {
    expectedBlocks.add('event')
    expectedBlocks.add('edition')
    // races optionnel pour NEW_EVENT
  }

  // Tous les blocs attendus doivent être validés
  const allBlocksValidated = expectedBlocks.size > 0 &&
    Array.from(expectedBlocks).every(blockKey => approvedBlocksObj[blockKey] === true)

  console.log('🔍 Vérification blocs:', {
    expectedBlocks: Array.from(expectedBlocks),
    approvedBlocksObj,
    allBlocksValidated,
    willApprove: allBlocksValidated
  })

  // ✅ NOUVEAU : Créer une application PAR BLOC validé
  // Vérifier si une application PENDING existe déjà pour CE bloc spécifique
  // ⚠️ FIX 2025-12-08 : Ne PAS chercher les applications APPLIED, sinon on les met à jour
  // au lieu de créer une nouvelle application pour la proposition courante
  const existingPendingApp = await db.prisma.proposalApplication.findFirst({
    where: {
      proposalId: { in: validProposalIds },
      blockType: block,
      status: 'PENDING'  // ✅ FIX: Seulement PENDING, pas APPLIED
    }
  })

  if (existingPendingApp) {
    console.log(`ℹ️ Application PENDING existante pour bloc "${block}":`, {
      applicationId: existingPendingApp.id,
      validProposalIds,
      block
    })

    // ✅ Mettre à jour appliedChanges avec le payload FILTRÉ par bloc
    const filteredPayload = filterChangesByBlock(finalPayload, block)

    console.log(`🔍 Filtrage appliedChanges pour bloc "${block}":`, {
      originalKeys: Object.keys(finalPayload),
      filteredKeys: Object.keys(filteredPayload)
    })

    await db.prisma.proposalApplication.update({
      where: { id: existingPendingApp.id },
      data: {
        appliedChanges: filteredPayload,
        updatedAt: new Date()
      }
    })

    console.log('✅ appliedChanges mis à jour avec payload filtré')

    await db.createLog({
      agentId: firstProposal.agentId,
      level: 'INFO',
      message: `Block "${block}" PENDING application updated with final payload for proposals [${validProposalIds.join(', ')}]`,
      data: {
        validProposalIds,
        block,
        existingApplicationId: existingPendingApp.id,
        payloadKeys: Object.keys(finalPayload)
      }
    })
  } else {
    // ✅ Créer une nouvelle application pour CE bloc uniquement
    const applicationId = `cmapp${Date.now()}${Math.random().toString(36).substr(2, 9)}`

    // ✅ Filtrer le payload pour ne garder que les champs du bloc
    const filteredPayload = filterChangesByBlock(finalPayload, block)

    console.log(`🔍 Filtrage appliedChanges pour bloc "${block}":`, {
      originalKeys: Object.keys(finalPayload),
      filteredKeys: Object.keys(filteredPayload)
    })

    // Utiliser Prisma create au lieu de executeRaw pour pouvoir passer appliedChanges (JSONB)
    await db.prisma.proposalApplication.create({
      data: {
        id: applicationId,
        proposalId: validProposalIds[0],
        proposalIds: validProposalIds,
        blockType: block,
        status: 'PENDING',
        appliedChanges: filteredPayload,  // ✅ Payload FILTRÉ par bloc
        logs: []
      }
    })

    await db.createLog({
      agentId: firstProposal.agentId,
      level: 'INFO',
      message: `Application created for block "${block}" with final payload - proposals [${validProposalIds.join(', ')}]`,
      data: {
        validProposalIds,
        applicationId,
        block,
        payloadKeys: Object.keys(finalPayload)
      }
    })

    console.log(`✅ Application créée pour bloc "${block}" avec appliedChanges:`, applicationId)
  }

  // ✅ Déterminer le statut selon les blocs validés
  if (allBlocksValidated) {
    // Tous les blocs validés → APPROVED
    const approvedProposals = await Promise.all(
      validProposalIds.map((proposalId: string) =>
        db.updateProposal(proposalId, {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedBy: userId
        })
      )
    )

    console.log('✅ Tous les blocs validés - Statut mis à jour à APPROVED:', {
      validProposalIds,
      statuses: approvedProposals.map(p => ({ id: p.id, status: p.status }))
    })
  } else {
    // Au moins un bloc validé, mais pas tous → PARTIALLY_APPROVED
    const validatedBlocksCount = Object.values(approvedBlocksObj).filter(Boolean).length

    if (validatedBlocksCount > 0) {
      const partiallyApprovedProposals = await Promise.all(
        validProposalIds.map((proposalId: string) =>
          db.updateProposal(proposalId, {
            status: 'PARTIALLY_APPROVED',
            reviewedAt: new Date(),
            reviewedBy: userId
          })
        )
      )

      console.log(`🔶 ${validatedBlocksCount} bloc(s) validé(s) - Statut mis à jour à PARTIALLY_APPROVED:`, {
        validProposalIds,
        validatedBlocks: Object.keys(approvedBlocksObj).filter(k => approvedBlocksObj[k]),
        statuses: partiallyApprovedProposals.map(p => ({ id: p.id, status: p.status }))
      })
    }
  }

  // Récupérer les propositions finales avec le statut mis à jour
  // On doit recharger depuis la DB car le statut a été changé après updatedProposals
  const finalProposals = await db.prisma.proposal.findMany({
    where: { id: { in: validProposalIds } }
  })

  console.log('✅ Propositions mises à jour:', finalProposals.map((p: Proposal) => ({ id: p.id, status: p.status })))

  // ✅ AUTO-ARCHIVAGE : Archiver les autres propositions PENDING du même groupe
  // Quand une proposition est validée, les autres du même groupe deviennent obsolètes
  let archivedCount = 0
  if (firstProposal.eventId && firstProposal.editionId) {
    const otherPendingProposals = await db.prisma.proposal.findMany({
      where: {
        eventId: firstProposal.eventId,
        editionId: firstProposal.editionId,
        id: { notIn: proposalIds },
        status: 'PENDING'
      }
    })

    if (otherPendingProposals.length > 0) {
      await db.prisma.proposal.updateMany({
        where: {
          id: { in: otherPendingProposals.map(p => p.id) }
        },
        data: {
          status: 'ARCHIVED',
          reviewedAt: new Date(),
          reviewedBy: 'system-auto-archive',
          modificationReason: `Auto-archived: superseded by validated proposals [${proposalIds.join(', ')}]`
        }
      })

      archivedCount = otherPendingProposals.length

      console.log(`🗄️ Auto-archivage: ${archivedCount} proposition(s) PENDING archivée(s):`, {
        archivedIds: otherPendingProposals.map(p => p.id),
        reason: 'superseded by validated proposals'
      })

      await db.createLog({
        agentId: firstProposal.agentId,
        level: 'INFO',
        message: `Auto-archived ${archivedCount} PENDING proposal(s) superseded by validation`,
        data: {
          validatedProposalIds: proposalIds,
          archivedProposalIds: otherPendingProposals.map(p => p.id),
          eventId: firstProposal.eventId,
          editionId: firstProposal.editionId
        }
      })
    }
  }

  // 🔔 Notification Slack (fire-and-forget, ne bloque pas la réponse)
  // Notifier uniquement la première proposition du groupe (pour éviter les doublons)
  const validatedBlocks = Object.keys(approvedBlocksObj).filter(k => approvedBlocksObj[k])
  notifyProposalValidatedById(validProposalIds[0], validatedBlocks, userId)
    .catch(err => console.error('❌ Erreur notification Slack:', err))

  res.json({
    success: true,
    data: finalProposals,
    message: `Block "${block}" validated for ${validProposalIds.length} proposals${allBlocksValidated ? ' - Proposals approved' : ''}${archivedCount > 0 ? ` - ${archivedCount} other proposal(s) auto-archived` : ''}`
  })
}))

// POST /api/proposals/:id/compare - Compare proposal with existing data
router.post('/:id/compare', [
  param('id').isString().notEmpty(),
  body('existingEventId').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { existingEventId } = req.body

  const proposal = await db.prisma.proposal.findUnique({
    where: { id }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  // Comparaison désactivée - nécessiterait de requêter Miles Republic
  res.json({
    success: true,
    data: {
      proposal: proposal.changes,
      existing: null,
      message: 'Comparison temporarily unavailable - cache removed'
    }
  })
}))

// POST /api/proposals/:id/apply - Manually apply an approved proposal
router.post('/:id/apply', requireAuth, [
  param('id').isString().notEmpty(),
  body('selectedChanges').isObject().withMessage('selectedChanges must be an object'),
  body('force').optional().isBoolean().withMessage('force must be a boolean'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { selectedChanges, force = false } = req.body

  // Récupérer l'utilisateur connecté
  const userId = req.user!.userId

  // Vérifier que la proposition existe et est approuvée
  const proposal = await db.prisma.proposal.findUnique({
    where: { id },
    include: { agent: true }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  if (!force && proposal.status !== 'APPROVED') {
    throw createError(400, 'Proposal must be approved to be applied', 'PROPOSAL_NOT_APPROVED')
  }

  try {
    // Enregistrer qui applique la proposition
    await db.updateProposal(id, {
      appliedBy: userId  // ✅ Enregistrer qui a appliqué
    })

    // Appliquer la proposition
    const applicationResult = await db.applyProposal(id, selectedChanges)

    // Logger le résultat
    await db.createLog({
      agentId: proposal.agentId,
      level: applicationResult.success ? 'INFO' : 'ERROR',
      message: applicationResult.success
        ? `Manual application of proposal ${id} successful`
        : `Manual application of proposal ${id} failed`,
      data: {
        proposalId: id,
        selectedChanges,
        applicationResult,
        force
      }
    })

    if (!applicationResult.success) {
      return res.status(400).json({
        success: false,
        data: applicationResult,
        message: 'Application failed with errors'
      })
    }

    res.json({
      success: true,
      data: applicationResult,
      message: 'Proposal applied successfully'
    })
  } catch (error) {
    await db.createLog({
      agentId: proposal.agentId,
      level: 'ERROR',
      message: `Critical error during manual application of proposal ${id}`,
      data: {
        proposalId: id,
        selectedChanges,
        error: error instanceof Error ? error.message : 'Unknown error',
        force
      }
    })

    throw createError(
      500,
      `Failed to apply proposal: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'PROPOSAL_APPLICATION_ERROR'
    )
  }
}))

// POST /api/proposals/:id/unapprove - Cancel an approval and revert to PENDING
router.post('/:id/unapprove', requireAuth, [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const proposal = await db.prisma.proposal.findUnique({
    where: { id },
    include: {
      applications: true,
      agent: true
    }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  // Si la proposition n'est pas approuvée, retourner succès silencieux
  // (elle peut avoir été déjà annulée par un autre bloc)
  if (proposal.status !== 'APPROVED') {
    return res.json({
      success: true,
      message: 'Proposal is already not approved',
      data: {
        proposalId: id,
        currentStatus: proposal.status,
        alreadyUnapproved: true
      }
    })
  }

  // Supprimer les applications PENDING
  const pendingApplications = proposal.applications.filter((app: ProposalApplication) => app.status === 'PENDING')

  await db.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Supprimer les applications en attente
    if (pendingApplications.length > 0) {
      await tx.proposalApplication.deleteMany({
        where: {
          id: { in: pendingApplications.map((app: ProposalApplication) => app.id) }
        }
      })
    }

    // Remettre la proposition à PENDING et réinitialiser approvedBlocks
    await tx.proposal.update({
      where: { id },
      data: {
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        approvedBlocks: {} // Réinitialiser tous les blocs approuvés
      }
    })
  })

  await db.createLog({
    agentId: proposal.agentId,
    level: 'INFO',
    message: `Proposal ${id} approval cancelled - reverted to PENDING`,
    data: {
      proposalId: id,
      deletedApplications: pendingApplications.length
    }
  })

  res.json({
    success: true,
    message: 'Proposal approval cancelled successfully',
    data: {
      proposalId: id,
      newStatus: 'PENDING',
      deletedApplications: pendingApplications.length
    }
  })
}))

// POST /api/proposals/:id/convert-to-edition-update - Convert NEW_EVENT to EDITION_UPDATE
router.post('/:id/convert-to-edition-update', [
  param('id').isString().notEmpty(),
  body('eventId').isInt().withMessage('eventId must be an integer'),
  body('editionId').isInt().withMessage('editionId must be an integer'),
  body('eventName').isString().notEmpty().withMessage('eventName is required'),
  body('eventSlug').isString().notEmpty().withMessage('eventSlug is required'),
  body('editionYear').isString().notEmpty().withMessage('editionYear is required'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { eventId, editionId, eventName, eventSlug, editionYear } = req.body

  // 1. Récupérer la proposition NEW_EVENT originale
  const originalProposal = await db.prisma.proposal.findUnique({
    where: { id },
    include: { agent: true }
  })

  if (!originalProposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  if (originalProposal.type !== 'NEW_EVENT') {
    throw createError(400, 'Can only convert NEW_EVENT proposals', 'INVALID_PROPOSAL_TYPE')
  }

  if (originalProposal.status !== 'PENDING') {
    throw createError(400, 'Can only convert PENDING proposals', 'INVALID_PROPOSAL_STATUS')
  }

  // 2. Récupérer l'édition existante depuis Miles Republic
  const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
    where: { type: 'MILES_REPUBLIC', isActive: true }
  })

  if (!milesRepublicConn) {
    throw createError(500, 'Miles Republic connection not found', 'DATABASE_CONNECTION_NOT_FOUND')
  }

  // Lazy load DatabaseManager
  const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
  const logger = createConsoleLogger('API', 'convert-proposal')
  const dbManager = DatabaseManager.getInstance(logger)
  const sourceDb = await dbManager.getConnection(milesRepublicConn.id)

  // Récupérer l'édition avec ses données complètes
  const existingEdition = await sourceDb.edition.findUnique({
    where: { id: editionId },
    include: {
      organization: true,
      races: {
        where: { isArchived: false }
      }
    }
  })

  if (!existingEdition) {
    throw createError(404, 'Edition not found in Miles Republic', 'EDITION_NOT_FOUND')
  }

  // 3. Transformer les changes de NEW_EVENT vers EDITION_UPDATE avec old/new
  const originalChanges = originalProposal.changes as Record<string, any>
  const editionChanges: Record<string, any> = {}

  // Extraire les champs d'édition depuis les changes
  if (originalChanges.edition?.new) {
    const editionData = originalChanges.edition.new
    const confidence = originalChanges.edition.confidence || 0.9

    // Copier les champs d'édition avec valeurs actuelles
    if (editionData.startDate) {
      editionChanges.startDate = {
        old: existingEdition.startDate?.toISOString() || null,
        new: editionData.startDate,
        confidence
      }
    }
    if (editionData.endDate) {
      editionChanges.endDate = {
        old: existingEdition.endDate?.toISOString() || null,
        new: editionData.endDate,
        confidence
      }
    }
    if (editionData.timeZone) {
      editionChanges.timeZone = {
        old: existingEdition.timeZone || null,
        new: editionData.timeZone,
        confidence
      }
    }
    if (editionData.calendarStatus) {
      editionChanges.calendarStatus = {
        old: existingEdition.calendarStatus || null,
        new: editionData.calendarStatus,
        confidence
      }
    }
    if (editionData.year) {
      editionChanges.year = {
        old: existingEdition.year || null,
        new: editionData.year,
        confidence
      }
    }

    // Organisateur
    if (editionData.organizer) {
      editionChanges.organizer = {
        old: existingEdition.organization ? {
          name: existingEdition.organization.name,
          email: existingEdition.organization.email,
          phone: existingEdition.organization.phone,
          websiteUrl: existingEdition.organization.websiteUrl,
          facebookUrl: existingEdition.organization.facebookUrl,
          instagramUrl: existingEdition.organization.instagramUrl
        } : null,
        new: editionData.organizer,
        confidence
      }
    }

    // Courses : Matcher avec l'édition existante (algorithme hybride distance + nom)
    if (editionData.races && editionData.races.length > 0) {
      const ffaRaces = editionData.races
      const existingRaces = existingEdition.races || []

      // Importer la fonction de matching hybride depuis agent-framework
      const { matchRacesByDistanceAndName } = await import('@data-agents/agent-framework')

      // Utiliser l'algorithme de matching hybride avec tolérance 5% par défaut
      // TODO: Récupérer la tolérance depuis la config de l'agent si disponible
      const matchingResult = matchRacesByDistanceAndName(ffaRaces, existingRaces, logger, 0.05)

      logger.info(`  📊 Matching result: ${matchingResult.matched.length} matched, ${matchingResult.unmatched.length} unmatched`)

      const racesToAdd: any[] = []
      const racesToUpdate: any[] = []
      const racesExisting: any[] = [] // ✅ Courses matchées SANS changement

      // Courses non matchées → Nouvelles courses
      for (const ffaRace of matchingResult.unmatched) {
        racesToAdd.push(ffaRace)
      }

      // Courses matchées → Vérifier les différences
      for (const { ffa: ffaRace, db: matchingRace } of matchingResult.matched) {
        const raceUpdates: any = {}

        // Vérifier l'élévation
        if (ffaRace.runPositiveElevation &&
            (!matchingRace.runPositiveElevation ||
             Math.abs(matchingRace.runPositiveElevation - ffaRace.runPositiveElevation) > 10)) {
          raceUpdates.runPositiveElevation = {
            old: matchingRace.runPositiveElevation,
            new: ffaRace.runPositiveElevation,
            confidence
          }
        }

        // Vérifier la date/heure de départ
        if (ffaRace.startDate) {
          const ffaStartDate = new Date(ffaRace.startDate)
          const dbStartDate = matchingRace.startDate ? new Date(matchingRace.startDate) : null

          if (!dbStartDate || Math.abs(ffaStartDate.getTime() - dbStartDate.getTime()) > 3600000) {
            raceUpdates.startDate = {
              old: dbStartDate?.toISOString() || null,
              new: ffaRace.startDate,
              confidence
            }
          }
        }

        // Si des mises à jour sont nécessaires, les ajouter
        if (Object.keys(raceUpdates).length > 0) {
          racesToUpdate.push({
            raceId: matchingRace.id,
            raceName: matchingRace.name,
            // ✅ Inclure tous les champs FFA pour affichage dans l'interface
            runDistance: ffaRace.runDistance,
            runPositiveElevation: ffaRace.runPositiveElevation,
            categoryLevel1: ffaRace.categoryLevel1,
            categoryLevel2: ffaRace.categoryLevel2,
            startDate: ffaRace.startDate,
            updates: raceUpdates
          })
        } else {
          // ✅ Course matchée SANS changement → Affichage informatif avec currentData
          const startDateIso = matchingRace.startDate
            ? (matchingRace.startDate instanceof Date
                ? matchingRace.startDate.toISOString()
                : matchingRace.startDate)
            : null

          racesExisting.push({
            raceId: matchingRace.id,
            raceName: matchingRace.name,
            // ✅ Toutes les valeurs actuelles (pour colonne "Valeur actuelle")
            currentData: {
              name: matchingRace.name,
              runDistance: matchingRace.runDistance,
              walkDistance: matchingRace.walkDistance,
              bikeDistance: matchingRace.bikeDistance,
              swimDistance: matchingRace.swimDistance,
              runPositiveElevation: matchingRace.runPositiveElevation,
              categoryLevel1: matchingRace.categoryLevel1,
              categoryLevel2: matchingRace.categoryLevel2,
              startDate: startDateIso
            },
            // ✅ Dupliquer au niveau racine pour compatibilité hook
            runDistance: matchingRace.runDistance,
            walkDistance: matchingRace.walkDistance,
            bikeDistance: matchingRace.bikeDistance,
            swimDistance: matchingRace.swimDistance,
            runPositiveElevation: matchingRace.runPositiveElevation,
            categoryLevel1: matchingRace.categoryLevel1,
            categoryLevel2: matchingRace.categoryLevel2,
            startDate: startDateIso
          })
        }
      }

      // ✅ FIX: Ajouter les courses DB non matchées dans racesExisting
      // Ces courses existent dans Miles Republic mais n'ont pas de correspondance FFA
      const matchedDbIds = new Set(matchingResult.matched.map(m => m.db.id))
      for (const dbRace of existingRaces) {
        if (!matchedDbIds.has(dbRace.id)) {
          const startDateIso = dbRace.startDate
            ? (dbRace.startDate instanceof Date
                ? dbRace.startDate.toISOString()
                : dbRace.startDate)
            : null

          racesExisting.push({
            raceId: dbRace.id,
            raceName: dbRace.name,
            currentData: {
              name: dbRace.name,
              runDistance: dbRace.runDistance,
              walkDistance: dbRace.walkDistance,
              bikeDistance: dbRace.bikeDistance,
              swimDistance: dbRace.swimDistance,
              runPositiveElevation: dbRace.runPositiveElevation,
              categoryLevel1: dbRace.categoryLevel1,
              categoryLevel2: dbRace.categoryLevel2,
              startDate: startDateIso
            },
            runDistance: dbRace.runDistance,
            walkDistance: dbRace.walkDistance,
            bikeDistance: dbRace.bikeDistance,
            swimDistance: dbRace.swimDistance,
            runPositiveElevation: dbRace.runPositiveElevation,
            categoryLevel1: dbRace.categoryLevel1,
            categoryLevel2: dbRace.categoryLevel2,
            startDate: startDateIso
          })
        }
      }

      // Ajouter les courses non matchées
      if (racesToAdd.length > 0) {
        editionChanges.racesToAdd = { new: racesToAdd, confidence }
      }

      // Ajouter les mises à jour de courses
      if (racesToUpdate.length > 0) {
        editionChanges.racesToUpdate = { new: racesToUpdate, confidence }
      }

      // ✅ Ajouter les courses existantes sans changement (affichage informatif)
      if (racesExisting.length > 0) {
        // Format avec marqueur pour que le frontend les reconnaisse
        const racesExistingWithMarker = racesExisting.map(race => ({
          ...race,
          _isExistingUnchanged: true
        }))
        editionChanges.racesExisting = { new: racesExistingWithMarker, confidence }
      }

      // Logger le résultat
      logger.info(`  🏁 Races summary: ${racesToAdd.length} to add, ${racesToUpdate.length} to update, ${racesExisting.length} existing unchanged (incl. unmatched DB)`)
    }
  }

  // 4. Créer la nouvelle proposition EDITION_UPDATE
  const newProposal = await db.prisma.proposal.create({
    data: {
      agentId: originalProposal.agentId,
      type: 'EDITION_UPDATE',
      status: 'PENDING',
      eventId: eventId.toString(),
      editionId: editionId.toString(),
      changes: editionChanges,
      justification: [
        {
          type: 'text',
          content: `Converti depuis la proposition NEW_EVENT ${id} - Événement existant détecté par l'utilisateur: ${eventName}`,
          metadata: {
            originalProposalId: id,
            convertedFrom: 'NEW_EVENT',
            selectedEventId: eventId,
            selectedEventName: eventName,
            selectedEventSlug: eventSlug,
            selectedEditionId: editionId,
            selectedEditionYear: editionYear,
            manualSelection: true,
            timestamp: new Date().toISOString()
          }
        },
        ...(originalProposal.justification as any[] || [])
      ],
      confidence: originalProposal.confidence,
      eventName,
      eventCity: originalProposal.eventCity,
      editionYear: parseInt(editionYear)
    }
  })

  // 5. Archiver la proposition originale
  await db.prisma.proposal.update({
    where: { id },
    data: {
      status: 'ARCHIVED',
      reviewedAt: new Date()
    }
  })

  // 6. Logger l'action
  await db.createLog({
    agentId: originalProposal.agentId,
    level: 'INFO',
    message: `Proposal ${id} converted from NEW_EVENT to EDITION_UPDATE ${newProposal.id}`,
    data: {
      originalProposalId: id,
      newProposalId: newProposal.id,
      eventId,
      editionId,
      eventName,
      editionYear,
      timestamp: new Date().toISOString()
    }
  })

  res.status(201).json({
    success: true,
    data: {
      originalProposal: {
        id: originalProposal.id,
        status: 'ARCHIVED'
      },
      newProposal: {
        id: newProposal.id,
        type: newProposal.type,
        status: newProposal.status,
        eventId: newProposal.eventId,
        editionId: newProposal.editionId,
        eventName: newProposal.eventName,
        editionYear: newProposal.editionYear
      }
    },
    message: `Proposal converted successfully - New EDITION_UPDATE proposal created for ${eventName}`
  })
}))

// GET /api/proposals/:id/check-existing-event
// Vérifie si un événement correspondant existe maintenant dans Miles Republic
// Utilisé pour détecter si un événement a été créé après la proposition NEW_EVENT
// Réutilisable par un futur agent de détection de doublons
router.get('/:id/check-existing-event', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const similarityThreshold = parseFloat(req.query.similarityThreshold as string) || 0.75

  // 1. Récupérer la proposition
  const proposal = await db.prisma.proposal.findUnique({ where: { id } })
  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }
  if (proposal.type !== 'NEW_EVENT') {
    throw createError(400, 'Only for NEW_EVENT proposals', 'INVALID_PROPOSAL_TYPE')
  }
  if (proposal.status !== 'PENDING') {
    throw createError(400, 'Only for PENDING proposals', 'INVALID_PROPOSAL_STATUS')
  }

  // 2. Extraire les données de matching depuis changes
  const changes = proposal.changes as any
  const eventName = changes.name?.new
  const eventCity = changes.city?.new
  // ✅ FIX 2025-12-14: Support des deux formats de département (Slack vs FFA)
  const eventDepartment = changes.countrySubdivisionDisplayCodeLevel2?.new
    || changes.department?.new  // Format Slack: "Ille-et-Vilaine"
    || changes.countrySubdivisionNameLevel2?.new  // Format alternatif
  const editionData = changes.edition?.new

  // Données insuffisantes pour le matching
  if (!eventName || !eventCity || !editionData?.startDate) {
    return res.json({
      hasMatch: false,
      proposalData: {
        eventName: eventName || null,
        eventCity: eventCity || null,
        eventDepartment: eventDepartment || null,
        editionYear: editionData?.year ? parseInt(editionData.year) : null,
        editionDate: editionData?.startDate || null
      }
    })
  }

  // 3. Connexion Miles Republic
  const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
    where: { type: 'MILES_REPUBLIC', isActive: true }
  })
  if (!milesRepublicConn) {
    throw createError(500, 'Miles Republic connection not found', 'CONNECTION_NOT_FOUND')
  }

  const { DatabaseManager, createConsoleLogger, matchEvent } = await import('@data-agents/agent-framework')
  const logger = createConsoleLogger('API', 'check-existing-event')
  const dbManager = DatabaseManager.getInstance(logger)
  const sourceDb = await dbManager.getConnection(milesRepublicConn.id)

  // 4. Préparer la config de matching avec Meilisearch si disponible
  let meilisearchConfig: { url: string; apiKey: string; indexName?: string } | undefined
  if (await settingsService.isMeilisearchConfigured()) {
    const url = await settingsService.getMeilisearchUrl()
    const apiKey = await settingsService.getMeilisearchApiKey()
    if (url && apiKey) {
      meilisearchConfig = { url, apiKey }
      logger.info('Meilisearch configured for matching')
    }
  }

  // 5. Appeler matchEvent
  const result = await matchEvent(
    {
      eventName,
      eventCity,
      eventDepartment,
      editionDate: new Date(editionData.startDate),
      editionYear: parseInt(editionData.year)
    },
    sourceDb,
    { similarityThreshold, meilisearch: meilisearchConfig },
    logger
  )

  // 6. Construire la réponse
  const proposalData = {
    eventName,
    eventCity,
    eventDepartment,
    editionYear: parseInt(editionData.year),
    editionDate: editionData.startDate
  }

  if (result.type === 'NO_MATCH') {
    return res.json({ hasMatch: false, proposalData })
  }

  // 7. Vérifier si l'événement trouvé est différent des rejectedMatches
  // et a un score supérieur au meilleur rejectedMatch
  const justification = proposal.justification as any[] | null
  const rejectedMatchesJustif = justification?.find(
    (j: any) => j.type === 'rejected_matches' || j.type === 'text'
  )
  const rejectedMatches = rejectedMatchesJustif?.metadata?.rejectedMatches || []

  if (rejectedMatches.length > 0) {
    const foundEventId = result.event!.id

    // Vérifier si l'événement trouvé est dans les rejectedMatches
    const isInRejectedMatches = rejectedMatches.some(
      (rm: any) => rm.eventId === foundEventId
    )

    // Trouver le meilleur score parmi les rejectedMatches
    const bestRejectedScore = Math.max(...rejectedMatches.map((rm: any) => rm.matchScore || 0))

    // Ne pas afficher l'alerte si:
    // - L'événement est déjà dans rejectedMatches (même eventId)
    // - OU le score est inférieur ou égal au meilleur score rejeté
    if (isInRejectedMatches || result.confidence <= bestRejectedScore) {
      return res.json({ hasMatch: false, proposalData })
    }
  }

  return res.json({
    hasMatch: true,
    match: {
      type: result.type,
      eventId: result.event!.id,
      eventName: result.event!.name,
      eventSlug: result.event!.slug || '',
      eventCity: result.event!.city,
      editionId: result.edition?.id,
      editionYear: result.edition?.year,
      confidence: result.confidence
    },
    proposalData
  })
}))

// POST /api/proposals/:id/change-target - Change the target event/edition of an EDITION_UPDATE proposal
router.post('/:id/change-target', [
  param('id').isString().notEmpty(),
  body('eventId').isInt().withMessage('eventId must be an integer'),
  body('editionId').isInt().withMessage('editionId must be an integer'),
  body('eventName').isString().notEmpty().withMessage('eventName is required'),
  body('eventSlug').isString().notEmpty().withMessage('eventSlug is required'),
  body('editionYear').isString().notEmpty().withMessage('editionYear is required'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { eventId, editionId, eventName, eventSlug, editionYear } = req.body

  // 1. Récupérer la proposition
  const proposal = await db.prisma.proposal.findUnique({
    where: { id },
    include: { agent: true }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  // Seulement pour EDITION_UPDATE (pour NEW_EVENT, utiliser convert-to-edition-update)
  if (proposal.type !== 'EDITION_UPDATE') {
    throw createError(400, 'Can only change target for EDITION_UPDATE proposals. Use convert-to-edition-update for NEW_EVENT.', 'INVALID_PROPOSAL_TYPE')
  }

  if (proposal.status !== 'PENDING' && proposal.status !== 'PARTIALLY_APPROVED') {
    throw createError(400, 'Can only change target for PENDING or PARTIALLY_APPROVED proposals', 'INVALID_PROPOSAL_STATUS')
  }

  // 2. Stocker les anciennes valeurs pour la justification
  const previousEventId = proposal.eventId
  const previousEditionId = proposal.editionId
  const previousEventName = proposal.eventName

  // 3. Mettre à jour la proposition avec la nouvelle cible
  const updatedProposal = await db.prisma.proposal.update({
    where: { id },
    data: {
      eventId: eventId.toString(),
      editionId: editionId.toString(),
      eventName,
      editionYear: parseInt(editionYear),
      // Réinitialiser les blocs validés car la cible a changé
      approvedBlocks: {},
      status: 'PENDING',
      reviewedAt: null,
      reviewedBy: null,
      // Ajouter une justification expliquant le changement
      justification: [
        {
          type: 'text',
          content: `Cible modifiée manuellement : ${previousEventName} → ${eventName}`,
          metadata: {
            action: 'change_target',
            previousEventId,
            previousEditionId,
            previousEventName,
            newEventId: eventId,
            newEditionId: editionId,
            newEventName: eventName,
            newEventSlug: eventSlug,
            newEditionYear: editionYear,
            timestamp: new Date().toISOString()
          }
        },
        ...(proposal.justification as any[] || [])
      ]
    },
    include: { agent: true }
  })

  // 4. Supprimer les ProposalApplications PENDING existantes (car la cible a changé)
  const deletedApps = await db.prisma.proposalApplication.deleteMany({
    where: {
      proposalId: id,
      status: 'PENDING'
    }
  })

  // 5. Logger l'action
  await db.createLog({
    agentId: proposal.agentId,
    level: 'INFO',
    message: `Proposal ${id} target changed: ${previousEventName} → ${eventName}`,
    data: {
      proposalId: id,
      previousEventId,
      previousEditionId,
      previousEventName,
      newEventId: eventId,
      newEditionId: editionId,
      newEventName: eventName,
      newEditionYear: editionYear,
      deletedApplications: deletedApps.count,
      timestamp: new Date().toISOString()
    }
  })

  res.json({
    success: true,
    data: updatedProposal,
    message: `Cible modifiée : ${previousEventName} → ${eventName}`
  })
}))

// POST /api/proposals/edition-update-complete - Create a complete EDITION_UPDATE proposal with current values
router.post('/edition-update-complete', [
  body('editionId').isString().notEmpty().withMessage('editionId is required'),
  body('userModifiedChanges').optional().isObject().withMessage('userModifiedChanges must be an object'),
  body('userModifiedRaceChanges').optional().isObject().withMessage('userModifiedRaceChanges must be an object'),
  body('justification').optional().isString(),
  body('autoValidate').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { editionId, userModifiedChanges = {}, userModifiedRaceChanges = {}, justification, autoValidate = false } = req.body

  // Connexion à Miles Republic
  const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
    where: { type: 'MILES_REPUBLIC', isActive: true }
  })

  if (!milesRepublicConn) {
    throw createError(500, 'Miles Republic connection not configured', 'CONFIG_ERROR')
  }

  const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
  const logger = createConsoleLogger('API', 'proposals-api')
  const dbManager = DatabaseManager.getInstance(logger)
  const connection = await dbManager.getConnection(milesRepublicConn.id)

  // Récupérer l'édition et l'événement associé
  const numericEditionId = typeof editionId === 'string' && /^\d+$/.test(editionId)
    ? parseInt(editionId)
    : editionId

  const edition = await connection.edition.findUnique({
    where: { id: numericEditionId },
    include: {
      event: true,
      races: {
        orderBy: { runDistance: 'asc' }
      }
    }
  })

  if (!edition) {
    throw createError(404, `Edition ${editionId} not found in Miles Republic`, 'EDITION_NOT_FOUND')
  }

  const event = edition.event
  if (!event) {
    throw createError(404, `Event not found for edition ${editionId}`, 'EVENT_NOT_FOUND')
  }

  logger.info(`Creating EDITION_UPDATE proposal for edition ${edition.id} (${event.name} ${edition.year})`)

  // Structure: changes = valeurs actuelles, userModifiedChanges = modifications utilisateur
  const changes: Record<string, any> = {}

  // Ajouter toutes les valeurs actuelles de l'édition
  const editionFields = [
    'year', 'startDate', 'endDate', 'timeZone', 'calendarStatus',
    'registrationOpeningDate', 'registrationClosingDate', 'registrantsNumber', 'currency'
  ]

  editionFields.forEach(field => {
    const currentValue = (edition as any)[field]
    const proposedValue = userModifiedChanges[field] !== undefined
      ? userModifiedChanges[field]
      : currentValue

    if (currentValue !== null || proposedValue !== null) {
      changes[field] = {
        old: currentValue,
        new: proposedValue,
        confidence: userModifiedChanges[field] !== undefined ? 1.0 : 1.0
      }
    }
  })

  // Ajouter toutes les valeurs actuelles de l'événement
  const eventFields = [
    'name', 'city', 'country', 'countrySubdivisionNameLevel1', 'countrySubdivisionNameLevel2',
    'fullAddress', 'latitude', 'longitude',
    'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl'
  ]

  eventFields.forEach(field => {
    const currentValue = (event as any)[field]
    const proposedValue = userModifiedChanges[field] !== undefined
      ? userModifiedChanges[field]
      : currentValue

    if (currentValue !== null || proposedValue !== null) {
      changes[field] = {
        old: currentValue,
        new: proposedValue,
        confidence: userModifiedChanges[field] !== undefined ? 1.0 : 1.0
      }
    }
  })

  // ✅ Transformer toutes les courses existantes en racesToUpdate éditables
  // Chaque champ a une structure { old, new } où old = new (par défaut)
  const racesToUpdate = edition.races.map((race: any, index: number) => {
    const startDateIso = race.startDate
      ? (race.startDate instanceof Date
          ? race.startDate.toISOString()
          : race.startDate)
      : null

    // ✅ Créer un objet updates avec TOUS les champs au format { old, new }
    const updates: Record<string, any> = {}
    const fields = [
      { key: 'name', dbKey: 'name' },
      { key: 'startDate', value: startDateIso },
      { key: 'runDistance', dbKey: 'runDistance' },
      { key: 'walkDistance', dbKey: 'walkDistance' },
      { key: 'bikeDistance', dbKey: 'bikeDistance' },
      { key: 'swimDistance', dbKey: 'swimDistance' },
      { key: 'runPositiveElevation', dbKey: 'runPositiveElevation' },
      { key: 'categoryLevel1', dbKey: 'categoryLevel1' },
      { key: 'categoryLevel2', dbKey: 'categoryLevel2' }
    ]

    fields.forEach(field => {
      const value = field.value !== undefined ? field.value : race[field.dbKey || field.key]
      updates[field.key] = {
        old: value,
        new: value, // Par défaut, new = old (éditable par l'utilisateur)
        confidence: 1.0
      }
    })

    return {
      raceId: race.id,
      raceName: race.name || '',
      // ✅ currentData pour afficher les valeurs actuelles
      currentData: {
        name: race.name || '',
        runDistance: race.runDistance,
        walkDistance: race.walkDistance,
        bikeDistance: race.bikeDistance,
        swimDistance: race.swimDistance,
        runPositiveElevation: race.runPositiveElevation,
        categoryLevel1: race.categoryLevel1,
        categoryLevel2: race.categoryLevel2,
        startDate: startDateIso
      },
      // ✅ updates contient tous les champs au format { old, new }
      updates
    }
  })

  // ✅ Ajouter racesToUpdate pour que toutes les courses soient éditables
  if (racesToUpdate.length > 0) {
    changes.racesToUpdate = {
      new: racesToUpdate,
      confidence: 1.0
    }
  }

  // Créer ou récupérer l'agent manuel
  let manualAgent = await db.prisma.agent.findFirst({
    where: { name: 'Manual Input Agent' }
  })

  if (!manualAgent) {
    manualAgent = await db.prisma.agent.create({
      data: {
        name: 'Manual Input Agent',
        description: 'Agent for manually created proposals',
        type: 'SPECIFIC_FIELD',
        isActive: true,
        frequency: '0 0 * * *',
        config: {}
      }
    })
  }

  // Créer la justification
  const proposalJustification = [
    {
      type: 'manual_creation',
      message: justification || `Modification manuelle de l'édition ${event.name} ${edition.year}`,
      metadata: {
        manual: true,
        eventId: event.id,
        editionId: edition.id,
        timestamp: new Date().toISOString()
      }
    }
  ]

  // Déterminer le statut initial
  const status = autoValidate ? 'APPROVED' : 'PENDING'

  // Créer la proposition
  const newProposal = await db.prisma.proposal.create({
    data: {
      agentId: manualAgent.id,
      type: 'EDITION_UPDATE',
      status,
      eventId: event.id.toString(),
      editionId: edition.id.toString(),
      eventName: event.name,
      eventCity: event.city,
      editionYear: typeof edition.year === 'string' ? parseInt(edition.year) : edition.year,
      changes,
      userModifiedChanges,
      justification: proposalJustification,
      confidence: 1.0,
      approvedBlocks: autoValidate ? {
        edition: true,
        races: true
      } : {}
    },
    include: {
      agent: {
        select: { name: true, type: true }
      }
    }
  })

  // Logger la création
  await db.createLog({
    agentId: manualAgent.id,
    level: 'INFO',
    message: `Manual EDITION_UPDATE proposal created for ${event.name} ${edition.year}`,
    data: {
      proposalId: newProposal.id,
      eventId: event.id,
      editionId: edition.id,
      racesToUpdate: racesToUpdate.length,
      autoValidated: autoValidate
    }
  })

  res.status(201).json({
    success: true,
    data: {
      proposal: {
        id: newProposal.id,
        type: newProposal.type,
        status: newProposal.status,
        eventId: newProposal.eventId,
        editionId: newProposal.editionId,
        eventName: newProposal.eventName,
        editionYear: newProposal.editionYear
      }
    },
    message: autoValidate
      ? `EDITION_UPDATE proposal created and validated for ${event.name} ${edition.year}`
      : `EDITION_UPDATE proposal created for ${event.name} ${edition.year}`
  })
}))

// POST /api/proposals/:id/unapprove-block - Cancel approval of a specific block
router.post('/:id/unapprove-block', [
  param('id').isString().notEmpty(),
  body('block').isString().notEmpty().withMessage('block must be specified'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { block } = req.body

  const proposal = await db.prisma.proposal.findUnique({
    where: { id },
    include: {
      applications: true,
      agent: true
    }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  // Vérifier si CE BLOC SPÉCIFIQUE a déjà été appliqué
  // Un bloc appliqué ne peut plus être annulé (les changements sont déjà en base)
  const appliedBlockApplication = proposal.applications.find(
    (app: ProposalApplication) => app.status === 'APPLIED' && app.blockType === block
  )
  if (appliedBlockApplication) {
    throw createError(400, `Cannot unapprove block "${block}" that has already been applied`, 'BLOCK_ALREADY_APPLIED')
  }

  const approvedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}

  // Si ce bloc n'est pas approuvé, retourner succès silencieux
  if (!approvedBlocks[block]) {
    return res.json({
      success: true,
      message: `Block "${block}" is already not approved`,
      data: {
        proposalId: id,
        block,
        currentStatus: proposal.status,
        approvedBlocks,
        alreadyUnapproved: true
      }
    })
  }

  // Retirer ce bloc des blocs approuvés
  delete approvedBlocks[block]

  // Si plus aucun bloc approuvé, remettre la proposition à PENDING
  const hasRemainingApprovedBlocks = Object.values(approvedBlocks).some(v => v === true)
  const newStatus = hasRemainingApprovedBlocks ? 'APPROVED' : 'PENDING'

  await db.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Si on repasse à PENDING, supprimer les applications en attente
    if (newStatus === 'PENDING') {
      const pendingApplications = proposal.applications.filter((app: ProposalApplication) => app.status === 'PENDING')

      if (pendingApplications.length > 0) {
        await tx.proposalApplication.deleteMany({
          where: {
            id: { in: pendingApplications.map((app: ProposalApplication) => app.id) }
          }
        })
      }
    }

    // Mettre à jour la proposition
    await tx.proposal.update({
      where: { id },
      data: {
        status: newStatus,
        approvedBlocks,
        reviewedAt: newStatus === 'PENDING' ? null : proposal.reviewedAt,
        reviewedBy: newStatus === 'PENDING' ? null : proposal.reviewedBy
      }
    })
  })

  await db.createLog({
    agentId: proposal.agentId,
    level: 'INFO',
    message: `Proposal ${id} - Block "${block}" approval cancelled`,
    data: {
      proposalId: id,
      block,
      newStatus,
      remainingApprovedBlocks: Object.keys(approvedBlocks).filter(k => approvedBlocks[k])
    }
  })

  res.json({
    success: true,
    message: `Block "${block}" approval cancelled successfully`,
    data: {
      proposalId: id,
      block,
      newStatus,
      approvedBlocks,
      hasRemainingApprovedBlocks
    }
  })
}))

// GET /api/proposals/:id/approved-blocks - Get approved blocks info (debug)
router.get('/:id/approved-blocks', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const proposal = await db.prisma.proposal.findUnique({
    where: { id }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  const approvedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}
  const changes = proposal.changes as Record<string, any>

  // Categorize changes by block
  const changesByBlock: Record<string, string[]> = {}
  for (const field of Object.keys(changes)) {
    let block = 'edition'
    if (field === 'organizer' || field === 'organizerId') {
      block = 'organizer'
    } else if (field === 'racesToAdd' || field === 'racesToUpdate' || field === 'races' || field.startsWith('race_')) {
      block = 'races'
    }

    if (!changesByBlock[block]) {
      changesByBlock[block] = []
    }
    changesByBlock[block].push(field)
  }

  res.json({
    success: true,
    data: {
      proposalId: id,
      approvedBlocks,
      changesByBlock,
      summary: Object.entries(changesByBlock).map(([block, fields]) => ({
        block,
        isApproved: approvedBlocks[block] === true,
        fieldCount: fields.length,
        fields
      }))
    }
  })
}))

// POST /api/proposals/:id/preview - Preview what changes would be applied
router.post('/:id/preview', [
  param('id').isString().notEmpty(),
  body('selectedChanges').isObject().withMessage('selectedChanges must be an object'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { selectedChanges } = req.body

  const proposal = await db.prisma.proposal.findUnique({
    where: { id }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  // Créer un aperçu des changements qui seraient appliqués
  const preview = {
    proposalType: proposal.type,
    targetId: proposal.eventId || proposal.editionId || proposal.raceId,
    selectedChanges,
    summary: {
      totalChanges: Object.keys(selectedChanges).length,
      changeTypes: Object.keys(selectedChanges).reduce((acc, key) => {
        const category = categorizeField(key)
        acc[category] = (acc[category] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    },
    warnings: [] as string[]
  }

  // Vérifications et avertissements
  if (proposal.type === 'NEW_EVENT' && (!selectedChanges.name || !selectedChanges.city)) {
    preview.warnings.push('Un nouvel événement nécessite au minimum un nom et une ville')
  }

  if (proposal.type === 'EDITION_UPDATE' && selectedChanges.startDate) {
    const startDate = new Date(selectedChanges.startDate)
    if (startDate < new Date()) {
      preview.warnings.push('La date de début est dans le passé')
    }
  }

  res.json({
    success: true,
    data: preview
  })
}))

// Helper function to categorize fields
function categorizeField(fieldName: string): string {
  if (['name', 'city', 'country'].includes(fieldName)) return 'basic_info'
  if (fieldName.includes('Date')) return 'dates'
  if (['price', 'currency'].includes(fieldName)) return 'pricing'
  if (fieldName.includes('Distance') || fieldName.includes('Elevation')) return 'course_details'
  if (['websiteUrl', 'facebookUrl', 'instagramUrl'].includes(fieldName)) return 'social_media'
  return 'other'
}

// Bulk operations
router.post('/bulk-approve', [
  body('proposalIds').isArray().withMessage('proposalIds must be an array'),
  body('proposalIds.*').isString().notEmpty(),
  body('reviewedBy').optional().isString(),
  body('block').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { proposalIds, reviewedBy, block } = req.body

  // Use transaction to approve proposals and create applications atomically
  const result = await db.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // First, get all pending proposals that will be approved
    const pendingProposals = await tx.proposal.findMany({
      where: {
        id: { in: proposalIds },
        status: 'PENDING'
      }
    })

    // Si un bloc spécifique est fourni, mettre à jour les approvedBlocks de chaque proposition
    if (block) {
      for (const proposal of pendingProposals) {
        const approvedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}
        approvedBlocks[block] = true

        await tx.proposal.update({
          where: { id: proposal.id },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedBy: reviewedBy || undefined,
            approvedBlocks
          }
        })
      }
    } else {
      // Approbation globale standard
      await tx.proposal.updateMany({
        where: {
          id: { in: pendingProposals.map((p: Proposal) => p.id) }
        },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedBy: reviewedBy || undefined
        }
      })
    }

    // Create ProposalApplication for each approved proposal (only if not exists and not duplicate)
    // Group proposals by identical changes to avoid duplicate updates
    const applicationsToCreate = []
    const processedChanges = new Set<string>()

    for (const proposal of pendingProposals) {
      const existingApp = await tx.proposalApplication.findFirst({
        where: { proposalId: proposal.id }
      })

      if (existingApp) continue // Already has an application

      // Create a unique key based on type, target, and changes
      const changeKey = JSON.stringify({
        type: proposal.type,
        eventId: proposal.eventId,
        editionId: proposal.editionId,
        raceId: proposal.raceId,
        changes: proposal.changes
      })

      // Skip if we've already processed this exact change in this batch
      if (processedChanges.has(changeKey)) {
        continue
      }

      // Check if there's already a PENDING application with identical changes
      const allPendingApplications = await tx.proposalApplication.findMany({
        where: { status: 'PENDING' },
        include: { proposal: true }
      })

      const duplicateApp = allPendingApplications.find((app: ProposalApplication & { proposal: Proposal }) => {
        if (app.proposal.type !== proposal.type) return false
        if (app.proposal.eventId !== proposal.eventId) return false
        if (app.proposal.editionId !== proposal.editionId) return false
        if (app.proposal.raceId !== proposal.raceId) return false

        const appChanges = JSON.stringify(app.proposal.changes)
        const proposalChanges = JSON.stringify(proposal.changes)
        return appChanges === proposalChanges
      })

      if (!duplicateApp) {
        // No duplicate found - create new application
        applicationsToCreate.push({
          proposalId: proposal.id,
          status: 'PENDING' as const
        })
        processedChanges.add(changeKey)
      }
    }

    const applications = await tx.proposalApplication.createMany({
      data: applicationsToCreate
    })

    return {
      approvedCount: pendingProposals.length,
      applicationsCreated: applications.count
    }
  })

  res.json({
    success: true,
    data: {
      updated: result.approvedCount,
      applicationsCreated: result.applicationsCreated
    },
    message: `${result.approvedCount} proposals approved and ${result.applicationsCreated} applications created successfully`
  })
}))

router.post('/bulk-reject', [
  body('proposalIds').isArray().withMessage('proposalIds must be an array'),
  body('proposalIds.*').isString().notEmpty(),
  body('reviewedBy').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { proposalIds, reviewedBy } = req.body

  const results = await db.prisma.proposal.updateMany({
    where: {
      id: { in: proposalIds },
      status: 'PENDING'
    },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedBy: reviewedBy || undefined
    }
  })

  res.json({
    success: true,
    data: { updated: results.count },
    message: `${results.count} proposals rejected successfully`
  })
}))

router.post('/bulk-archive', [
  body('proposalIds').isArray().withMessage('proposalIds must be an array'),
  body('proposalIds.*').isString().notEmpty(),
  body('reviewedBy').optional().isString(),
  body('archiveReason').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { proposalIds, reviewedBy, archiveReason } = req.body

  const results = await db.prisma.proposal.updateMany({
    where: {
      id: { in: proposalIds },
      status: 'PENDING'
    },
    data: {
      status: 'ARCHIVED',
      reviewedAt: new Date(),
      reviewedBy: reviewedBy || undefined
    }
  })

  // Log the archiving action for audit trail
  if (results.count > 0) {
    // Get the first proposal's agentId for logging purposes
    const firstProposal = await db.prisma.proposal.findFirst({
      where: { id: { in: proposalIds } },
      select: { agentId: true }
    })

    if (firstProposal) {
      await db.createLog({
        agentId: firstProposal.agentId,
        level: 'INFO',
        message: `Bulk archived ${results.count} grouped proposals`,
        data: {
          proposalIds,
          reviewedBy,
          archiveReason,
          timestamp: new Date().toISOString()
        }
      })
    }
  }

  res.json({
    success: true,
    data: { updated: results.count },
    message: `${results.count} proposals archived successfully`
  })
}))

// DELETE /api/proposals/:id - Permanently delete a single proposal
router.delete('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { id } = req.params

  // Check if proposal exists
  const proposal = await db.prisma.proposal.findUnique({
    where: { id },
    select: { id: true, agentId: true }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  // Log the deletion for audit trail
  await db.createLog({
    agentId: proposal.agentId,
    level: 'INFO',
    message: `Proposal ${id} permanently deleted`,
    data: { proposalId: id, action: 'DELETE', timestamp: new Date().toISOString() }
  })

  // Permanently delete the proposal
  await db.prisma.proposal.delete({
    where: { id }
  })

  res.json({
    success: true,
    message: 'Proposal permanently deleted'
  })
}))

// POST /api/proposals/bulk-delete - Permanently delete multiple proposals
router.post('/bulk-delete', [
  body('proposalIds').isArray().withMessage('proposalIds must be an array'),
  body('proposalIds.*').isString().notEmpty(),
  body('reviewedBy').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { proposalIds, reviewedBy } = req.body

  // Get proposal data before deletion for logging
  const proposalsToDelete = await db.prisma.proposal.findMany({
    where: { id: { in: proposalIds } },
    select: { id: true, agentId: true }
  })

  if (proposalsToDelete.length === 0) {
    throw createError(404, 'No proposals found to delete', 'PROPOSALS_NOT_FOUND')
  }

  // Log the bulk deletion for audit trail
  if (proposalsToDelete.length > 0) {
    const firstProposal = proposalsToDelete[0]
    await db.createLog({
      agentId: firstProposal.agentId,
      level: 'INFO',
      message: `Bulk deleted ${proposalsToDelete.length} proposals`,
      data: {
        proposalIds: proposalsToDelete.map((p: any) => p.id),
        reviewedBy,
        action: 'BULK_DELETE',
        timestamp: new Date().toISOString()
      }
    })
  }

  // Permanently delete all proposals
  const results = await db.prisma.proposal.deleteMany({
    where: { id: { in: proposalIds } }
  })

  res.json({
    success: true,
    data: { deleted: results.count },
    message: `${results.count} proposals permanently deleted`
  })
}))

// Helper functions
function calculateEventSimilarity(proposedData: any, existingEvent: any): number {
  let score = 0
  let comparisons = 0

  if (proposedData.name && existingEvent.name) {
    const stringSimilarity = require('string-similarity')
    score += stringSimilarity.compareTwoStrings(
      proposedData.name.toLowerCase(),
      existingEvent.name.toLowerCase()
    )
    comparisons++
  }

  if (proposedData.city && existingEvent.city) {
    const stringSimilarity = require('string-similarity')
    score += stringSimilarity.compareTwoStrings(
      proposedData.city.toLowerCase(),
      existingEvent.city.toLowerCase()
    )
    comparisons++
  }

  return comparisons > 0 ? score / comparisons : 0
}

function compareData(existing: any, proposed: any): any {
  const changes: any = {}

  for (const [key, value] of Object.entries(proposed)) {
    if (existing && existing[key] !== undefined) {
      if (existing[key] !== (value as any).new) {
        changes[key] = {
          current: existing[key],
          proposed: (value as any).new,
          confidence: (value as any).confidence
        }
      }
    } else {
      changes[key] = {
        current: null,
        proposed: (value as any).new,
        confidence: (value as any).confidence
      }
    }
  }

  return changes
}

// ============================================================================
// POST /api/proposals/merge - Créer une proposition de fusion d'événements
// ============================================================================
router.post('/merge', [
  body('keepEventId').isInt({ min: 1 }).withMessage('keepEventId doit être un entier positif'),
  body('duplicateEventId').isInt({ min: 1 }).withMessage('duplicateEventId doit être un entier positif'),
  body('newEventName').optional().isString().trim(),
  body('reason').optional().isString().trim(),
  body('forceOverwrite').optional().isBoolean(),
  body('copyMissingEditions').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { keepEventId, duplicateEventId, newEventName, reason, forceOverwrite, copyMissingEditions = true } = req.body

  // Valider que les deux IDs sont différents
  if (keepEventId === duplicateEventId) {
    throw createError(400, 'Les deux événements doivent être différents', 'SAME_EVENT_ERROR')
  }

  // Récupérer la connexion Miles Republic
  const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
    where: { type: 'MILES_REPUBLIC', isActive: true }
  })

  if (!milesRepublicConn) {
    throw createError(500, 'Connexion Miles Republic non trouvée', 'DB_CONNECTION_ERROR')
  }

  // Charger DatabaseManager
  const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
  const logger = createConsoleLogger('API', 'proposals-merge')
  const dbManager = DatabaseManager.getInstance(logger)
  const sourceDb = await dbManager.getConnection(milesRepublicConn.id)

  // Récupérer les deux événements avec leurs éditions
  const keepEvent = await sourceDb.event.findUnique({
    where: { id: keepEventId },
    include: {
      editions: {
        orderBy: { year: 'desc' },
        select: { id: true, year: true, startDate: true, status: true }
      }
    }
  })

  const duplicateEvent = await sourceDb.event.findUnique({
    where: { id: duplicateEventId },
    include: {
      editions: {
        orderBy: { year: 'desc' },
        select: { id: true, year: true, startDate: true, status: true }
      }
    }
  })

  if (!keepEvent) {
    throw createError(404, `Événement à conserver non trouvé (ID: ${keepEventId})`, 'EVENT_NOT_FOUND')
  }

  if (!duplicateEvent) {
    throw createError(404, `Événement doublon non trouvé (ID: ${duplicateEventId})`, 'EVENT_NOT_FOUND')
  }

  // Vérifier si l'événement à conserver a déjà un oldSlugId
  let existingRedirectInfo: { oldSlugId: number; eventExists: boolean; eventName?: string } | null = null

  if (keepEvent.oldSlugId) {
    // Vérifier si cet oldSlugId correspond à un événement existant
    const existingRedirectEvent = await sourceDb.event.findUnique({
      where: { id: keepEvent.oldSlugId },
      select: { id: true, name: true, status: true }
    })

    existingRedirectInfo = {
      oldSlugId: keepEvent.oldSlugId,
      eventExists: !!existingRedirectEvent,
      eventName: existingRedirectEvent?.name
    }

    // Si l'événement existe et qu'on n'a pas le flag force, bloquer
    if (existingRedirectEvent && !forceOverwrite) {
      throw createError(400,
        `L'événement "${keepEvent.name}" (ID: ${keepEventId}) a déjà une redirection vers "${existingRedirectEvent.name}" (ID: ${keepEvent.oldSlugId}). Utilisez forceOverwrite: true pour écraser.`,
        'ALREADY_HAS_REDIRECT',
        {
          existingRedirect: existingRedirectInfo,
          canForce: true
        }
      )
    }

    // Si l'événement n'existe pas (oldSlugId orphelin), on peut écraser sans problème
    if (!existingRedirectEvent) {
      logger.info(`[EVENT_MERGE] oldSlugId ${keepEvent.oldSlugId} ne correspond à aucun événement existant, écrasement autorisé`)
    } else {
      logger.warn(`[EVENT_MERGE] Écrasement forcé de oldSlugId ${keepEvent.oldSlugId} (${existingRedirectEvent.name})`)
    }
  }

  // Récupérer ou créer l'agent "Manual Actions"
  let manualAgent = await db.prisma.agent.findFirst({
    where: { name: 'Manual Actions' }
  })

  if (!manualAgent) {
    manualAgent = await db.prisma.agent.create({
      data: {
        name: 'Manual Actions',
        description: 'Agent pour les actions manuelles effectuées via le dashboard',
        type: 'EXTRACTOR',
        isActive: true,
        frequency: {},
        config: { agentType: 'MANUAL' }
      }
    })
  }

  // Calculer les éditions qui seront copiées (si l'option est activée)
  const keepEventYears = new Set(keepEvent.editions.map((e: { year: string }) => e.year))
  const editionsToCopy = copyMissingEditions
    ? duplicateEvent.editions
        .filter((e: { year: string }) => !keepEventYears.has(e.year))
        .map((e: { id: number; year: string; startDate: Date | null; status: string }) => ({
          id: e.id,
          year: e.year,
          startDate: e.startDate,
          status: e.status
        }))
    : []

  // Préparer les listes d'éditions pour l'affichage dans le détail
  const keepEventEditions = keepEvent.editions.map((e: { id: number; year: string }) => ({
    id: e.id,
    year: e.year
  }))
  const duplicateEventEditions = duplicateEvent.editions.map((e: { id: number; year: string }) => ({
    id: e.id,
    year: e.year
  }))

  // Construire les changes
  const changes = {
    merge: {
      keepEventId,
      keepEventName: keepEvent.name,
      keepEventCity: keepEvent.city,
      keepEventEditionsCount: keepEvent.editions.length,
      keepEventEditions,
      duplicateEventId,
      duplicateEventName: duplicateEvent.name,
      duplicateEventCity: duplicateEvent.city,
      duplicateEventEditionsCount: duplicateEvent.editions.length,
      duplicateEventEditions,
      newEventName: newEventName || null,
      // Info sur l'écrasement d'une redirection existante
      previousOldSlugId: existingRedirectInfo?.oldSlugId || null,
      previousOldSlugIdEventExists: existingRedirectInfo?.eventExists || false,
      previousOldSlugIdEventName: existingRedirectInfo?.eventName || null,
      forceOverwrite: forceOverwrite || false,
      // Options de copie des éditions
      copyMissingEditions,
      editionsToCopy: editionsToCopy.length > 0 ? editionsToCopy : null
    }
  }

  // Créer la proposition
  const proposal = await db.prisma.proposal.create({
    data: {
      agentId: manualAgent.id,
      type: 'EVENT_MERGE',
      status: 'PENDING',
      eventId: keepEventId.toString(),
      changes,
      justification: [{
        type: 'user_action',
        message: reason || 'Fusion manuelle d\'événements doublons',
        metadata: {
          keepEvent: { id: keepEventId, name: keepEvent.name, city: keepEvent.city },
          duplicateEvent: { id: duplicateEventId, name: duplicateEvent.name, city: duplicateEvent.city }
        }
      }],
      confidence: 1.0,
      eventName: keepEvent.name,
      eventCity: keepEvent.city
    }
  })

  const editionsCopyMessage = editionsToCopy.length > 0
    ? ` (${editionsToCopy.length} édition(s) seront copiées: ${editionsToCopy.map((e: { year: string }) => e.year).join(', ')})`
    : ''

  res.json({
    success: true,
    data: {
      proposal,
      editionsToCopy: editionsToCopy.length > 0 ? editionsToCopy : undefined,
      copyMissingEditions
    },
    message: `Proposition de fusion créée: "${duplicateEvent.name}" sera fusionné dans "${keepEvent.name}"${editionsCopyMessage}`
  })
}))

export { router as proposalRouter }
