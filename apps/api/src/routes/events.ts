import { Router, Request, Response } from 'express'
import { query, validationResult } from 'express-validator'
import { DatabaseService, getMeilisearchService, MeilisearchEvent } from '@data-agents/database'
import { asyncHandler, createError } from '../middleware/error-handler'
import { settingsService } from '../config/settings'

const router = Router()
const db = new DatabaseService()

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
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EVENT_NOT_FOUND') {
      throw error
    }
    
    console.error('Error fetching event:', error)
    throw createError(500, 'Failed to fetch event', 'FETCH_ERROR')
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

export { router as eventsRouter }
