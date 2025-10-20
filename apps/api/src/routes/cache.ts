import { Router, Request, Response } from 'express'
import { query, validationResult } from 'express-validator'
import { DatabaseService } from '@data-agents/database'
import { asyncHandler, createError } from '../middleware/error-handler'

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

// GET /api/cache/events - List events
router.get('/events', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { limit = 50, search } = req.query

  const events = await db.prisma.eventCache.findMany({
    where: search ? {
      OR: [
        { name: { contains: search as string, mode: 'insensitive' } },
        { city: { contains: search as string, mode: 'insensitive' } }
      ]
    } : undefined,
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
    data: events
  })
}))

// GET /api/cache/editions - List editions
router.get('/editions', [
  query('eventId').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { eventId, limit = 50 } = req.query

  const editions = await db.prisma.editionCache.findMany({
    where: eventId ? { eventId: eventId as string } : undefined,
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
    data: editions
  })
}))

// GET /api/cache/races - List races
router.get('/races', [
  query('editionId').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { editionId, limit = 50 } = req.query

  const races = await db.prisma.raceCache.findMany({
    where: editionId ? { editionId: editionId as string } : undefined,
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
    data: races
  })
}))

// GET /api/cache/miles-republic/events - List events from Miles Republic database
router.get('/miles-republic/events', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { limit = 50, search } = req.query

  try {
    // Find Miles Republic database connection
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

    // Get database manager and connect
    const { DatabaseManager } = await import('@data-agents/agent-framework')
    const { ConsoleLogger } = await import('@data-agents/agent-framework')
    const logger = new ConsoleLogger('API')
    const dbManager = DatabaseManager.getInstance(logger)
    const connection = await dbManager.getConnection(milesRepublicConnection.id)

    // Query events from Miles Republic
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
          select: { Edition: true }
        }
      },
      orderBy: { name: 'asc' },
      take: parseInt(String(limit))
    })

    res.json({
      success: true,
      data: events.map(event => ({
        id: event.id.toString(),
        name: event.name,
        city: event.city,
        country: event.country,
        _count: { editions: event._count.Edition }
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

// GET /api/cache/miles-republic/editions - List editions from Miles Republic database
router.get('/miles-republic/editions', [
  query('eventId').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { eventId, limit = 50 } = req.query

  try {
    // Find Miles Republic database connection
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

    // Get database manager and connect
    const { DatabaseManager } = await import('@data-agents/agent-framework')
    const { ConsoleLogger } = await import('@data-agents/agent-framework')
    const logger = new ConsoleLogger('API')
    const dbManager = DatabaseManager.getInstance(logger)
    const connection = await dbManager.getConnection(milesRepublicConnection.id)

    let whereClause: any = {}
    if (eventId) {
      whereClause.eventId = parseInt(eventId as string)
    }

    const editions = await connection.edition.findMany({
      where: whereClause,
      select: {
        id: true,
        year: true,
        startDate: true,
        calendarStatus: true,
        eventId: true,
        Event: {
          select: {
            name: true,
            city: true
          }
        },
        _count: {
          select: { Race: true }
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
      data: editions.map(edition => ({
        id: edition.id.toString(),
        year: parseInt(edition.year),
        startDate: edition.startDate?.toISOString() || null,
        calendarStatus: edition.calendarStatus,
        eventId: edition.eventId.toString(),
        event: {
          name: edition.Event.name,
          city: edition.Event.city
        },
        _count: { races: edition._count.Race }
      }))
    })
  } catch (error) {
    console.error('Error fetching editions from Miles Republic:', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching editions from Miles Republic database'
    })
  }
}))

// GET /api/cache/miles-republic/races - List races from Miles Republic database
router.get('/miles-republic/races', [
  query('editionId').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { editionId, limit = 50 } = req.query

  try {
    // Find Miles Republic database connection
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

    // Get database manager and connect
    const { DatabaseManager } = await import('@data-agents/agent-framework')
    const { ConsoleLogger } = await import('@data-agents/agent-framework')
    const logger = new ConsoleLogger('API')
    const dbManager = DatabaseManager.getInstance(logger)
    const connection = await dbManager.getConnection(milesRepublicConnection.id)

    let whereClause: any = {}
    if (editionId) {
      whereClause.editionId = parseInt(editionId as string)
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
        Edition: {
          select: {
            year: true,
            Event: {
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
      data: races.map(race => ({
        id: race.id.toString(),
        name: race.name,
        startDate: race.startDate?.toISOString() || null,
        price: race.price,
        runDistance: race.runDistance,
        editionId: race.editionId.toString(),
        edition: {
          year: parseInt(race.Edition.year),
          event: {
            name: race.Edition.Event.name,
            city: race.Edition.Event.city
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

export { router as cacheRouter }
