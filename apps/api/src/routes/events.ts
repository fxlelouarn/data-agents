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
  if (!settingsService.isMeilisearchConfigured()) {
    return res.status(503).json({
      success: false,
      message: 'Meilisearch is not configured. Please configure URL and API key in settings.',
      error: 'MEILISEARCH_NOT_CONFIGURED'
    })
  }

  try {
    // Obtenir l'instance du service Meilisearch avec la configuration actuelle
    const meilisearchService = getMeilisearchService(
      settingsService.getMeilisearchUrl()!,
      settingsService.getMeilisearchApiKey()!
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
  if (!settingsService.isMeilisearchConfigured()) {
    return res.status(503).json({
      success: false,
      message: 'Meilisearch is not configured',
      data: { events: [], configured: false }
    })
  }

  try {
    // Obtenir l'instance du service Meilisearch
    const meilisearchService = getMeilisearchService(
      settingsService.getMeilisearchUrl()!,
      settingsService.getMeilisearchApiKey()!
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
 * Récupère un événement spécifique par son ID et le met en cache
 */
router.get('/:eventId', [
  query('cache').optional().isBoolean().withMessage('Cache must be a boolean'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = req.params
  const { cache = true } = req.query

  try {
    let event = null
    let fromCache = false

    // D'abord chercher dans le cache local
    if (cache) {
      event = await db.prisma.eventCache.findUnique({
        where: { id: eventId },
        include: {
          editions: {
            include: {
              races: true
            }
          }
        }
      })
      
      if (event) {
        fromCache = true
      }
    }

    // Si pas trouvé en cache et Meilisearch configuré, chercher dans Meilisearch
    if (!event && settingsService.isMeilisearchConfigured()) {
      try {
        const meilisearchService = getMeilisearchService(
          settingsService.getMeilisearchUrl()!,
          settingsService.getMeilisearchApiKey()!
        )

        const meilisearchEvent = await meilisearchService.getEventById(eventId)
        
        if (meilisearchEvent && cache) {
          // Mettre en cache l'événement trouvé dans Meilisearch
          event = await cacheEventFromMeilisearch(meilisearchEvent)
          fromCache = false
        } else {
          // Retourner directement les données de Meilisearch sans cache
          event = meilisearchEvent
          fromCache = false
        }
      } catch (meilisearchError) {
        console.warn('Failed to fetch from Meilisearch:', meilisearchError)
        // Continue sans Meilisearch
      }
    }

    if (!event) {
      throw createError(404, 'Event not found', 'EVENT_NOT_FOUND')
    }

    res.json({
      success: true,
      data: {
        event,
        meta: {
          fromCache,
          meilisearchConfigured: settingsService.isMeilisearchConfigured(),
          cachedAt: fromCache && 'lastSyncAt' in event ? event.lastSyncAt : null
        }
      }
    })

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
  if (!settingsService.isMeilisearchConfigured()) {
    return res.status(400).json({
      success: false,
      message: 'Meilisearch is not configured. Please set URL and API key in settings.'
    })
  }

  try {
    const meilisearchService = getMeilisearchService(
      settingsService.getMeilisearchUrl()!,
      settingsService.getMeilisearchApiKey()!
    )

    const testResult = await meilisearchService.testConnection()
    
    res.json({
      success: testResult.success,
      data: {
        configured: true,
        connected: testResult.success,
        message: testResult.message,
        url: settingsService.getMeilisearchUrl(),
        // Ne pas retourner la clé API pour des raisons de sécurité
        hasApiKey: !!settingsService.getMeilisearchApiKey()
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
  try {
    // Créer ou mettre à jour l'EventCache
    const eventData = {
      id: meilisearchEvent.objectID,
      name: meilisearchEvent.name,
      city: meilisearchEvent.city,
      country: meilisearchEvent.country,
      latitude: meilisearchEvent.latitude || null,
      longitude: meilisearchEvent.longitude || null,
      websiteUrl: meilisearchEvent.websiteUrl || null,
      slug: meilisearchEvent.slug || null,
      lastSyncAt: new Date(),
      // Valeurs par défaut pour les champs requis
      countrySubdivisionNameLevel1: '',
      countrySubdivisionNameLevel2: ''
    }

    const cachedEvent = await db.prisma.eventCache.upsert({
      where: { id: meilisearchEvent.objectID },
      update: eventData,
      create: eventData,
      include: {
        editions: {
          include: {
            races: true
          }
        }
      }
    })

    console.log(`✅ Cached event ${meilisearchEvent.objectID} from Meilisearch`)
    return cachedEvent

  } catch (error) {
    console.error('Failed to cache event from Meilisearch:', error)
    // Retourner les données Meilisearch même si le cache échoue
    return meilisearchEvent
  }
}

export { router as eventsRouter }