import { Router } from 'express'
import { param, query, validationResult } from 'express-validator'
import { getDatabaseServiceSync } from '../services/database'
import { asyncHandler, createError } from '../middleware/error-handler'

const router = Router()
const db = getDatabaseServiceSync()

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw createError(400, 'Validation failed', 'VALIDATION_ERROR')
  }
  next()
}

// GET /api/logs - List logs with filters
router.get('/', [
  query('agentId').optional().isString(),
  query('runId').optional().isString(),
  query('level').optional().isIn(['DEBUG', 'INFO', 'WARN', 'ERROR']),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { agentId, runId, level, limit = 100, offset = 0 } = req.query

  const logs = await db.prisma.agentLog.findMany({
    where: {
      agentId: agentId || undefined,
      runId: runId || undefined,
      level: level || undefined
    },
    include: {
      agent: {
        select: { name: true }
      },
      run: {
        select: { id: true, startedAt: true }
      }
    },
    orderBy: { timestamp: 'desc' },
    take: parseInt(limit),
    skip: parseInt(offset)
  })

  const total = await db.prisma.agentLog.count({
    where: {
      agentId: agentId || undefined,
      runId: runId || undefined,
      level: level || undefined
    }
  })

  res.json({
    success: true,
    data: logs,
    meta: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + parseInt(limit)) < total
    }
  })
}))

export { router as logRouter }