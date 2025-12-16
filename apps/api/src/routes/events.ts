import { Router, Request, Response } from 'express'
import { query, validationResult } from 'express-validator'
import { getMeilisearchService, MeilisearchEvent } from '@data-agents/database'
import { getDatabaseServiceSync } from '../services/database'
import { asyncHandler, createError } from '../middleware/error-handler'
import { settingsService } from '../config/settings'

const router = Router()
const db = getDatabaseServiceSync()

// Validation middleware
const validateRequest = (req: Request, res: Response, next: Function) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw createError(400, 'Validation failed', 'VALIDATION_ERROR')
  }
  next()
}

/**
 * GET /api/events/search
 * Recherche d'événements via Meilisearch avec autocomplétion
 */
router.get('/search', [
  query('q').isString().notEmpty().withMessage('Query parameter q is required'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0'),
  query('filters').optional().isString().withMessage('Filters must be a string'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { q, limit = 10, offset = 0, filters } = req.query

  // Vérifier que Meilisearch est configuré
  if (!(await settingsService.isMeilisearchConfigured())) {
    return res.status(503).json({
      success: false,
      message: 'Meilisearch is not configured. Please configure URL and API key in settings.',
      error: 'MEILISEARCH_NOT_CONFIGURED'
    })
  }

  try {
    // Obtenir l'instance du service Meilisearch avec la configuration actuelle
    const meilisearchService = getMeilisearchService(
      (await settingsService.getMeilisearchUrl())!,
      (await settingsService.getMeilisearchApiKey())!
    )

    // Effectuer la recherche
    const searchResult = await meilisearchService.searchEvents({
      query: q as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      filters: filters as string | undefined,
      attributesToRetrieve: ['objectID', 'name', 'city', 'country', 'startDate', 'endDate', 'year', 'slug', 'websiteUrl'],
      attributesToHighlight: ['name', 'city']
    })

    res.json({
      success: true,
      data: {
        query: searchResult.query,
        hits: searchResult.hits,
        meta: {
          processingTimeMs: searchResult.processingTimeMs,
          limit: searchResult.limit,
          offset: searchResult.offset,
          estimatedTotalHits: searchResult.estimatedTotalHits,
          hasMore: (searchResult.offset + searchResult.limit) < searchResult.estimatedTotalHits
        }
      }
    })

  } catch (error) {
    console.error('Meilisearch search error:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to search events',
      error: error instanceof Error ? error.message : 'Unknown search error'
    })
  }
}))

/**
 * GET /api/events/autocomplete
 * Autocomplétion rapide pour les événements (optimisée pour les formulaires)
 */
router.get('/autocomplete', [
  query('q').isString().notEmpty().withMessage('Query parameter q is required'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { q, limit = 10 } = req.query

  // Vérifier que Meilisearch est configuré
  if (!(await settingsService.isMeilisearchConfigured())) {
    return res.status(503).json({
      success: false,
      message: 'Meilisearch is not configured',
      data: { events: [], configured: false }
    })
  }

  try {
    // Obtenir l'instance du service Meilisearch
    const meilisearchService = getMeilisearchService(
      (await settingsService.getMeilisearchUrl())!,
      (await settingsService.getMeilisearchApiKey())!
    )

    // Recherche optimisée pour l'autocomplétion
    const events = await meilisearchService.searchEventsAutocomplete(
      q as string,
      parseInt(limit as string)
    )

    res.json({
      success: true,
      data: {
        events,
        configured: true,
        query: q
      }
    })

  } catch (error) {
    console.error('Meilisearch autocomplete error:', error)

    // En cas d'erreur, retourner une réponse vide mais pas d'erreur HTTP
    // pour ne pas casser l'expérience utilisateur de l'autocomplétion
    res.json({
      success: false,
      message: 'Search temporarily unavailable',
      data: {
        events: [],
        configured: true,
        query: q,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
}))

/**
 * POST /api/events/test-meilisearch
 * Teste la connexion à Meilisearch
 */
router.post('/test-meilisearch', asyncHandler(async (req: Request, res: Response) => {
  if (!(await settingsService.isMeilisearchConfigured())) {
    return res.status(400).json({
      success: false,
      message: 'Meilisearch is not configured. Please set URL and API key in settings.'
    })
  }

  try {
    const meilisearchService = getMeilisearchService(
      (await settingsService.getMeilisearchUrl())!,
      (await settingsService.getMeilisearchApiKey())!
    )

    const testResult = await meilisearchService.testConnection()

    res.json({
      success: testResult.success,
      data: {
        configured: true,
        connected: testResult.success,
        message: testResult.message,
        url: await settingsService.getMeilisearchUrl(),
        // Ne pas retourner la clé API pour des raisons de sécurité
        hasApiKey: !!(await settingsService.getMeilisearchApiKey())
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to test Meilisearch connection',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}))

/**
 * Fonction utilitaire pour mettre en cache un événement Meilisearch
 */
async function cacheEventFromMeilisearch(meilisearchEvent: MeilisearchEvent) {
  // Note: Cette fonction est obsolète mais conservée pour compatibilité
  return meilisearchEvent
}

// Routes pour interroger Miles Republic directement

/**
 * GET /api/events
 * Liste les événements
 */
router.get('/', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { limit = 50, search } = req.query

  try {
    // Trouver la connexion Miles Republic
    const milesRepublicConnection = await db.prisma.databaseConnection.findFirst({
      where: {
        type: 'MILES_REPUBLIC',
        isActive: true
      }
    })

    if (!milesRepublicConnection) {
      return res.status(404).json({
        success: false,
        message: 'Miles Republic database connection not found'
      })
    }

    // Obtenir la connexion via DatabaseManager
    const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
    const logger = createConsoleLogger('API', 'events-api')
    const dbManager = DatabaseManager.getInstance(logger)
    const connection = await dbManager.getConnection(milesRepublicConnection.id)

    // Construire la clause where
    let whereClause: any = {}
    if (search) {
      whereClause.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } }
      ]
    }

    const events = await connection.event.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        city: true,
        country: true,
        _count: {
          select: { editions: true }
        }
      },
      orderBy: { name: 'asc' },
      take: parseInt(String(limit))
    })

    res.json({
      success: true,
      data: events.map((event: any) => ({
        id: event.id.toString(),
        name: event.name,
        city: event.city,
        country: event.country,
        _count: { editions: event._count.editions }
      }))
    })
  } catch (error) {
    console.error('Error fetching events from Miles Republic:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching events from Miles Republic database'
    })
  }
}))

/**
 * GET /api/events/editions
 * Liste les éditions
 */
router.get('/editions', [
  query('eventId').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { eventId, limit = 50 } = req.query

  try {
    const milesRepublicConnection = await db.prisma.databaseConnection.findFirst({
      where: {
        type: 'MILES_REPUBLIC',
        isActive: true
      }
    })

    if (!milesRepublicConnection) {
      return res.status(404).json({
        success: false,
        message: 'Miles Republic database connection not found'
      })
    }

    const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
    const logger = createConsoleLogger('API', 'events-api')
    const dbManager = DatabaseManager.getInstance(logger)
    const connection = await dbManager.getConnection(milesRepublicConnection.id)

    let whereClause: any = {}
    if (eventId) {
      const numericEventId = typeof eventId === 'string' && /^\d+$/.test(eventId)
        ? parseInt(eventId)
        : eventId
      whereClause.eventId = numericEventId
    }

    const editions = await connection.edition.findMany({
      where: whereClause,
      select: {
        id: true,
        year: true,
        startDate: true,
        calendarStatus: true,
        eventId: true,
        event: {
          select: {
            name: true,
            city: true
          }
        },
        _count: {
          select: { races: true }
        }
      },
      orderBy: [
        { year: 'desc' },
        { startDate: 'desc' }
      ],
      take: parseInt(String(limit))
    })

    res.json({
      success: true,
      data: editions.map((edition: any) => ({
        id: edition.id ? edition.id.toString() : null,
        year: edition.year ? (typeof edition.year === 'string' ? parseInt(edition.year) : edition.year) : null,
        startDate: edition.startDate?.toISOString() || null,
        calendarStatus: edition.calendarStatus || null,
        eventId: edition.eventId ? edition.eventId.toString() : null,
        event: {
          name: edition.event?.name || null,
          city: edition.event?.city || null
        },
        _count: { races: edition._count?.races || 0 }
      }))
    })
  } catch (error) {
    console.error('Error fetching editions from Miles Republic:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching editions from Miles Republic database',
      error: error instanceof Error ? error.message : String(error)
    })
  }
}))

/**
 * GET /api/events/races
 * Liste les courses
 */
router.get('/races', [
  query('editionId').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { editionId, limit = 50 } = req.query

  try {
    const milesRepublicConnection = await db.prisma.databaseConnection.findFirst({
      where: {
        type: 'MILES_REPUBLIC',
        isActive: true
      }
    })

    if (!milesRepublicConnection) {
      return res.status(404).json({
        success: false,
        message: 'Miles Republic database connection not found'
      })
    }

    const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
    const logger = createConsoleLogger('API', 'events-api')
    const dbManager = DatabaseManager.getInstance(logger)
    const connection = await dbManager.getConnection(milesRepublicConnection.id)

    let whereClause: any = {}
    if (editionId) {
      const numericEditionId = typeof editionId === 'string' && /^\d+$/.test(editionId)
        ? parseInt(editionId)
        : editionId
      whereClause.editionId = numericEditionId
    }

    const races = await connection.race.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        startDate: true,
        price: true,
        runDistance: true,
        editionId: true,
        edition: {
          select: {
            year: true,
            event: {
              select: {
                name: true,
                city: true
              }
            }
          }
        }
      },
      orderBy: [
        { startDate: 'desc' },
        { name: 'asc' }
      ],
      take: parseInt(String(limit))
    })

    res.json({
      success: true,
      data: races.map((race: any) => ({
        id: race.id.toString(),
        name: race.name,
        startDate: race.startDate?.toISOString() || null,
        price: race.price,
        runDistance: race.runDistance,
        editionId: race.editionId.toString(),
        edition: {
          year: parseInt(race.edition.year),
          event: {
            name: race.edition.event.name,
            city: race.edition.event.city
          }
        }
      }))
    })
  } catch (error) {
    console.error('Error fetching races from Miles Republic:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching races from Miles Republic database'
    })
  }
}))

/**
 * POST /api/events/:eventId/kill
 * Rejette les propositions en attente et crée une ProposalApplication pour mettre l'événement à DEAD
 */
router.post('/:eventId/kill', asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = req.params
  const { reason } = req.body

  try {
    // 0. S'assurer qu'un agent "manual" existe
    let manualAgent = await db.prisma.agent.findUnique({
      where: { id: 'manual' }
    })

    if (!manualAgent) {
      manualAgent = await db.prisma.agent.create({
        data: {
          id: 'manual',
          name: 'Manual Actions',
          type: 'SPECIFIC_FIELD',
          isActive: true,
          frequency: 'manual', // Pas de cron, actions manuelles seulement
          config: {
            description: 'Agent for manual actions from the dashboard'
          }
        }
      })
    }

    // 1. Trouver toutes les propositions PENDING pour cet événement
    const pendingProposals = await db.prisma.proposal.findMany({
      where: {
        eventId: eventId,
        status: 'PENDING'
      }
    })

    // 2. Rejeter toutes les propositions en attente
    await db.prisma.proposal.updateMany({
      where: {
        eventId: eventId,
        status: 'PENDING'
      },
      data: {
        status: 'REJECTED',
        reviewedBy: 'system:kill-event',
        reviewedAt: new Date()
      }
    })

    // 3. Créer une Proposal pour marquer l'événement comme DEAD
    const killProposal = await db.prisma.proposal.create({
      data: {
        agentId: 'manual', // Agent manuel
        type: 'EVENT_UPDATE',
        status: 'APPROVED', // Auto-approuvée
        eventId: eventId,
        changes: {
          status: {
            current: 'LIVE',
            proposed: 'DEAD'
          }
        },
        justification: {
          reason: reason || 'Event killed manually via dashboard',
          killedAt: new Date().toISOString()
        },
        confidence: 1.0,
        reviewedBy: 'system:kill-event',
        reviewedAt: new Date()
      }
    })

    // 4. Créer une ProposalApplication (sera appliquée plus tard)
    const application = await db.prisma.proposalApplication.create({
      data: {
        proposalId: killProposal.id,
        status: 'PENDING',
        appliedChanges: {
          eventId: eventId,
          status: 'DEAD'
        }
      }
    })

    // 5. Log l'action
    await db.createLog({
      agentId: 'manual',
      level: 'INFO',
      message: `Event ${eventId} kill request created`,
      data: {
        eventId,
        reason: reason || 'No reason provided',
        rejectedProposals: pendingProposals.length,
        proposalId: killProposal.id,
        applicationId: application.id,
        timestamp: new Date().toISOString()
      }
    })

    res.json({
      success: true,
      data: {
        eventId: eventId,
        rejectedProposals: pendingProposals.length,
        killProposal: {
          id: killProposal.id,
          status: killProposal.status
        },
        application: {
          id: application.id,
          status: application.status
        }
      },
      message: `Event kill scheduled. ${pendingProposals.length} proposals rejected. Application will be processed later.`
    })
  } catch (error) {
    console.error('Error killing event:', error)
    res.status(500).json({
      success: false,
      message: 'Error creating kill event request',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}))

/**
 * POST /api/events/:eventId/revive
 * Ressuscite immédiatement un événement DEAD en le passant à LIVE
 * Remet également en PENDING les propositions REJECTED pour cet événement/édition
 */
router.post('/:eventId/revive', asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = req.params
  const { editionId } = req.body // Optionnel: pour filtrer par édition

  try {
    // 0. S'assurer qu'un agent "manual" existe
    let manualAgent = await db.prisma.agent.findUnique({
      where: { id: 'manual' }
    })

    if (!manualAgent) {
      manualAgent = await db.prisma.agent.create({
        data: {
          id: 'manual',
          name: 'Manual Actions',
          type: 'SPECIFIC_FIELD',
          isActive: true,
          frequency: 'manual', // Pas de cron, actions manuelles seulement
          config: {
            description: 'Agent for manual actions from the dashboard'
          }
        }
      })
    }

    // 1. Remettre en PENDING les propositions REJECTED pour cet événement
    // (toutes les propositions rejetées sont restaurées car l'événement est ressuscité)
    const whereClause: any = {
      eventId: eventId,
      status: 'REJECTED'
    }
    if (editionId) {
      whereClause.editionId = editionId
    }

    const revivedProposals = await db.prisma.proposal.updateMany({
      where: whereClause,
      data: {
        status: 'PENDING',
        reviewedBy: null,
        reviewedAt: null
      }
    })

    console.log(`[REVIVE] ${revivedProposals.count} propositions remises en PENDING pour eventId=${eventId}`)

    // 2. Appliquer immédiatement le changement de statut dans Miles Republic
    const milesRepublicConnection = await db.prisma.databaseConnection.findFirst({
      where: { name: 'miles-republic' }
    })

    if (!milesRepublicConnection) {
      throw createError(500, 'Miles Republic connection not found', 'CONNECTION_NOT_FOUND')
    }

    const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
    const logger = createConsoleLogger('API', 'events-revive')
    const dbManager = DatabaseManager.getInstance(logger)
    const sourceDb = await dbManager.getConnection(milesRepublicConnection.id)

    const previousStatus = await sourceDb.event.findUnique({
      where: { id: parseInt(eventId) },
      select: { status: true }
    })

    await sourceDb.event.update({
      where: { id: parseInt(eventId) },
      data: { status: 'LIVE' }
    })

    console.log(`[REVIVE] Event ${eventId} status changed from ${previousStatus?.status} to LIVE`)

    // 3. Créer une Proposal pour tracer l'action (déjà appliquée)
    const reviveProposal = await db.prisma.proposal.create({
      data: {
        agentId: 'manual',
        type: 'EVENT_UPDATE',
        status: 'APPROVED',
        eventId: eventId,
        changes: {
          status: {
            current: previousStatus?.status || 'DEAD',
            proposed: 'LIVE'
          }
        },
        justification: {
          reason: 'Event revived manually via dashboard',
          revivedAt: new Date().toISOString()
        },
        confidence: 1.0,
        reviewedBy: 'system:revive-event',
        reviewedAt: new Date()
      }
    })

    // 4. Créer une ProposalApplication marquée comme APPLIED
    const application = await db.prisma.proposalApplication.create({
      data: {
        proposalId: reviveProposal.id,
        status: 'APPLIED',
        appliedAt: new Date(),
        appliedChanges: {
          eventId: eventId,
          previousStatus: previousStatus?.status || 'DEAD',
          newStatus: 'LIVE'
        }
      }
    })

    // 5. Log l'action
    await db.createLog({
      agentId: 'manual',
      level: 'INFO',
      message: `Event ${eventId} revived immediately`,
      data: {
        eventId,
        editionId: editionId || null,
        previousStatus: previousStatus?.status,
        newStatus: 'LIVE',
        proposalId: reviveProposal.id,
        applicationId: application.id,
        revivedProposalsCount: revivedProposals.count,
        timestamp: new Date().toISOString()
      }
    })

    res.json({
      success: true,
      data: {
        eventId: eventId,
        previousStatus: previousStatus?.status || 'DEAD',
        newStatus: 'LIVE',
        revivedProposalsCount: revivedProposals.count,
        reviveProposal: {
          id: reviveProposal.id,
          status: reviveProposal.status
        },
        application: {
          id: application.id,
          status: application.status
        }
      },
      message: `Événement ressuscité ! Statut: LIVE. ${revivedProposals.count} propositions restaurées.`
    })
  } catch (error) {
    console.error('Error reviving event:', error)
    res.status(500).json({
      success: false,
      message: 'Error reviving event',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}))

/**
 * GET /api/events/:eventId/details
 * Récupère les détails complets d'un événement depuis Miles Republic (avec éditions)
 * Utilisé pour la page de fusion d'événements
 */
router.get('/:eventId/details', asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = req.params
  const numericEventId = parseInt(eventId, 10)

  if (isNaN(numericEventId)) {
    throw createError(400, 'eventId doit être un entier valide', 'INVALID_EVENT_ID')
  }

  try {
    // Trouver la connexion Miles Republic
    const milesRepublicConnection = await db.prisma.databaseConnection.findFirst({
      where: {
        type: 'MILES_REPUBLIC',
        isActive: true
      }
    })

    if (!milesRepublicConnection) {
      throw createError(500, 'Connexion Miles Republic non trouvée', 'DB_CONNECTION_ERROR')
    }

    // Obtenir la connexion via DatabaseManager
    const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
    const logger = createConsoleLogger('API', 'events-details')
    const dbManager = DatabaseManager.getInstance(logger)
    const connection = await dbManager.getConnection(milesRepublicConnection.id)

    // Récupérer l'événement avec ses éditions
    const event = await connection.event.findUnique({
      where: { id: numericEventId },
      include: {
        editions: {
          orderBy: { year: 'desc' },
          select: {
            id: true,
            year: true,
            startDate: true,
            endDate: true,
            status: true,
            calendarStatus: true
          }
        }
      }
    })

    if (!event) {
      throw createError(404, `Événement non trouvé (ID: ${eventId})`, 'EVENT_NOT_FOUND')
    }

    res.json({
      success: true,
      data: {
        event: {
          id: event.id,
          name: event.name,
          city: event.city,
          country: event.country,
          status: event.status,
          oldSlugId: event.oldSlugId,
          websiteUrl: event.websiteUrl,
          editions: event.editions.map((ed: any) => ({
            id: ed.id,
            year: ed.year,
            startDate: ed.startDate?.toISOString() || null,
            endDate: ed.endDate?.toISOString() || null,
            status: ed.status,
            calendarStatus: ed.calendarStatus
          }))
        }
      }
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error // Re-throw HTTP errors
    }
    console.error('Error fetching event details from Miles Republic:', error)
    throw createError(500, 'Erreur lors de la récupération des détails de l\'événement', 'FETCH_ERROR')
  }
}))

/**
 * GET /api/events/:eventId
 * Récupère un événement spécifique par son ID depuis Meilisearch
 */
router.get('/:eventId', [
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = req.params

  try {
    // Chercher dans Meilisearch si configuré
    if (await settingsService.isMeilisearchConfigured()) {
      try {
        const meilisearchService = getMeilisearchService(
          (await settingsService.getMeilisearchUrl())!,
          (await settingsService.getMeilisearchApiKey())!
        )

        const event = await meilisearchService.getEventById(eventId)

        if (event) {
          return res.json({
            success: true,
            data: { event }
          })
        }
      } catch (meilisearchError) {
        console.warn('Failed to fetch from Meilisearch:', meilisearchError)
      }
    }

    throw createError(404, 'Event not found', 'EVENT_NOT_FOUND')

  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'EVENT_NOT_FOUND') {
      // Relay the 404 error
      return res.status(404).json({ success: false, error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } })
    }

    console.error('Error fetching event:', error)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch event' } })
  }
}))

export { router as eventsRouter }
