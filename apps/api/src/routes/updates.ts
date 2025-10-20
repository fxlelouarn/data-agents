import { Router } from 'express'
import { param, query, body, validationResult } from 'express-validator'
import { DatabaseService } from '@data-agents/database'
import { ProposalApplicationService } from '@data-agents/database/src/services/ProposalApplicationService'
import { asyncHandler, createError } from '../middleware/error-handler'

const router = Router()
const db = new DatabaseService()
const applicationService = new ProposalApplicationService(db.prisma)

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw createError(400, 'Validation failed', 'VALIDATION_ERROR')
  }
  next()
}

// Helper function to transform Prisma data for frontend
const transformApplicationForAPI = (app: any) => {
  return {
    id: app.id,
    proposalId: app.proposalId,
    status: app.status,
    scheduledAt: app.scheduledAt?.toISOString() || null,
    appliedAt: app.appliedAt?.toISOString() || null,
    errorMessage: app.errorMessage,
    logs: app.logs || [],
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    proposal: {
      id: app.proposal.id,
      type: app.proposal.type,
      status: app.proposal.status,
      changes: app.proposal.changes,
      agent: {
        name: app.proposal.agent.name,
        type: app.proposal.agent.type
      }
    }
  }
}

// GET /api/updates - List updates with filters
router.get('/', [
  query('status').optional().isIn(['PENDING', 'APPLIED', 'FAILED']),
  query('proposalId').optional().isString(),
  query('search').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { status, proposalId, search, limit = 20, offset = 0 } = req.query

  // Build where clause
  const where: any = {}
  
  if (status) {
    where.status = status
  }
  
  if (proposalId) {
    where.proposalId = proposalId
  }
  
  if (search) {
    where.OR = [
      { proposalId: { contains: search, mode: 'insensitive' } },
      { proposal: { agent: { name: { contains: search, mode: 'insensitive' } } } }
    ]
  }

  const applications = await db.prisma.proposalApplication.findMany({
    where,
    include: {
      proposal: {
        include: {
          agent: {
            select: { name: true, type: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit),
    skip: parseInt(offset)
  })

  const total = await db.prisma.proposalApplication.count({ where })
  
  const transformedUpdates = applications.map(transformApplicationForAPI)

  res.json({
    success: true,
    data: transformedUpdates,
    meta: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + parseInt(limit)) < total
    }
  })
}))

// GET /api/updates/:id - Get update details
router.get('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { id } = req.params

  const application = await db.prisma.proposalApplication.findUnique({
    where: { id },
    include: {
      proposal: {
        include: {
          agent: {
            select: { name: true, type: true }
          }
        }
      }
    }
  })

  if (!application) {
    throw createError(404, 'Update not found', 'UPDATE_NOT_FOUND')
  }

  res.json({
    success: true,
    data: transformApplicationForAPI(application)
  })
}))

// POST /api/updates - Create new update
router.post('/', [
  body('proposalId').isString().notEmpty(),
  body('scheduledAt').optional().isISO8601(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { proposalId, scheduledAt } = req.body

  // Verify proposal exists and is approved
  const proposal = await db.prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      agent: {
        select: { name: true, type: true }
      }
    }
  })

  if (!proposal) {
    throw createError(404, 'Proposal not found', 'PROPOSAL_NOT_FOUND')
  }

  if (proposal.status !== 'APPROVED') {
    throw createError(400, 'Proposal must be approved to create an application', 'PROPOSAL_NOT_APPROVED')
  }

  // Check if application already exists
  const existingApp = await db.prisma.proposalApplication.findFirst({
    where: { proposalId }
  })

  if (existingApp) {
    throw createError(409, 'Application already exists for this proposal', 'APPLICATION_EXISTS')
  }

  const application = await db.prisma.proposalApplication.create({
    data: {
      proposalId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null
    },
    include: {
      proposal: {
        include: {
          agent: {
            select: { name: true, type: true }
          }
        }
      }
    }
  })

  res.json({
    success: true,
    data: transformApplicationForAPI(application),
    message: 'Update created successfully'
  })
}))

// POST /api/updates/:id/apply - Apply update
router.post('/:id/apply', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { id } = req.params

  const application = await db.prisma.proposalApplication.findUnique({
    where: { id },
    include: {
      proposal: {
        include: {
          agent: {
            select: { name: true, type: true }
          }
        }
      }
    }
  })
  
  if (!application) {
    throw createError(404, 'Update not found', 'UPDATE_NOT_FOUND')
  }

  if (application.status !== 'PENDING') {
    throw createError(400, 'Update is not pending', 'INVALID_STATUS')
  }

  const logs: string[] = []
  let success = false
  let errorMessage: string | null = null

  try {
    logs.push('Starting update application...')
    logs.push('Validating proposal changes...')
    
    // Apply the proposal using ProposalApplicationService
    const result = await applicationService.applyProposal(
      application.proposalId,
      application.proposal.changes as Record<string, any> // Use all changes from the proposal
    )

    if (result.success) {
      success = true
      logs.push('Successfully applied all changes')
      logs.push(`Applied changes: ${Object.keys(result.appliedChanges).join(', ')}`)
    } else {
      errorMessage = result.errors?.map(e => e.message).join('; ') || 'Unknown error'
      logs.push(`Application failed: ${errorMessage}`)
    }
    
    // Update the application record
    const updatedApplication = await db.prisma.proposalApplication.update({
      where: { id },
      data: {
        status: success ? 'APPLIED' : 'FAILED',
        appliedAt: success ? new Date() : null,
        errorMessage: errorMessage,
        logs: logs,
        appliedChanges: success ? (result.appliedChanges as any) : null,
        rollbackData: success ? (result.createdIds as any) || null : null
      },
      include: {
        proposal: {
          include: {
            agent: {
              select: { name: true, type: true }
            }
          }
        }
      }
    })

    res.json({
      success: true,
      data: transformApplicationForAPI(updatedApplication),
      message: success ? 'Update applied successfully' : 'Update failed to apply'
    })

  } catch (error) {
    logs.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    
    // Update the application record with error status
    await db.prisma.proposalApplication.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unexpected error during application',
        logs: logs
      }
    })

    throw createError(500, 'Error applying update', 'APPLICATION_ERROR')
  }
}))

// DELETE /api/updates/:id - Delete update
router.delete('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { id } = req.params

  const application = await db.prisma.proposalApplication.findUnique({
    where: { id }
  })
  
  if (!application) {
    throw createError(404, 'Update not found', 'UPDATE_NOT_FOUND')
  }

  await db.prisma.proposalApplication.delete({
    where: { id }
  })

  res.json({
    success: true,
    message: 'Update deleted successfully'
  })
}))

// GET /api/updates/:id/logs - Get update logs
router.get('/:id/logs', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { id } = req.params

  const application = await db.prisma.proposalApplication.findUnique({
    where: { id },
    select: { logs: true }
  })

  if (!application) {
    throw createError(404, 'Update not found', 'UPDATE_NOT_FOUND')
  }

  res.json({
    success: true,
    data: {
      logs: application.logs || []
    }
  })
}))

// POST /api/updates/:id/replay - Replay update
router.post('/:id/replay', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { id } = req.params

  const application = await db.prisma.proposalApplication.findUnique({
    where: { id },
    include: {
      proposal: {
        include: {
          agent: {
            select: { name: true, type: true }
          }
        }
      }
    }
  })
  
  if (!application) {
    throw createError(404, 'Update not found', 'UPDATE_NOT_FOUND')
  }

  if (application.status === 'PENDING') {
    throw createError(400, 'Update is already pending', 'ALREADY_PENDING')
  }

  // Reset the application to PENDING state
  const resetApplication = await db.prisma.proposalApplication.update({
    where: { id },
    data: {
      status: 'PENDING',
      appliedAt: null,
      errorMessage: null,
      logs: [`[${new Date().toISOString()}] Update reset to PENDING for replay`],
      appliedChanges: null as any,
      rollbackData: null as any
    },
    include: {
      proposal: {
        include: {
          agent: {
            select: { name: true, type: true }
          }
        }
      }
    }
  })

  res.json({
    success: true,
    data: transformApplicationForAPI(resetApplication),
    message: 'Update reset to pending - ready for replay'
  })
}))

export { router as updateRouter }
