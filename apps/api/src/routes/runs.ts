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

// GET /api/runs - List runs with filters
router.get('/', [
  query('agentId').optional().isString(),
  query('status').optional().isIn(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { agentId, status, limit = 20, offset = 0 } = req.query

  const runs = await db.prisma.agentRun.findMany({
    where: {
      agentId: agentId || undefined,
      status: status || undefined
    },
    include: {
      agent: {
        select: { name: true, type: true }
      }
    },
    orderBy: { startedAt: 'desc' },
    take: parseInt(limit),
    skip: parseInt(offset)
  })

  const total = await db.prisma.agentRun.count({
    where: {
      agentId: agentId || undefined,
      status: status || undefined
    }
  })

  res.json({
    success: true,
    data: runs,
    meta: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + parseInt(limit)) < total
    }
  })
}))

// GET /api/runs/:id - Get run details
router.get('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { id } = req.params

  const run = await db.prisma.agentRun.findUnique({
    where: { id },
    include: {
      agent: {
        select: { name: true, type: true }
      },
      logs: {
        orderBy: { timestamp: 'asc' }
      }
    }
  })

  if (!run) {
    throw createError(404, 'Run not found', 'RUN_NOT_FOUND')
  }

  res.json({
    success: true,
    data: run
  })
}))

export { router as runRouter }