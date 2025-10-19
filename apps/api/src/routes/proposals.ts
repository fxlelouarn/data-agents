import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { DatabaseService } from '@data-agents/database'
import { asyncHandler, createError } from '../middleware/error-handler'

const router = Router()
const db = new DatabaseService()

// Validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw createError(400, 'Validation failed', 'VALIDATION_ERROR')
  }
  next()
}

// GET /api/proposals - List proposals with filters
router.get('/', [
  query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']),
  query('type').optional().isIn(['NEW_EVENT', 'EVENT_UPDATE', 'EDITION_UPDATE', 'RACE_UPDATE']),
  query('eventId').optional().isString(),
  query('editionId').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { status, type, eventId, editionId, limit = 20, offset = 0 } = req.query

  const proposals = await db.prisma.proposal.findMany({
    where: {
      status: (status as string | undefined) ? (status as any) : undefined,
      type: (type as string | undefined) ? (type as any) : undefined,
      eventId: (eventId as string | undefined) || undefined,
      editionId: (editionId as string | undefined) || undefined
    },
    include: {
      agent: {
        select: { name: true, type: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: parseInt(String(limit)),
    skip: parseInt(String(offset))
  })

  const total = await db.prisma.proposal.count({
    where: {
      status: (status as string | undefined) ? (status as any) : undefined,
      type: (type as string | undefined) ? (type as any) : undefined,
      eventId: (eventId as string | undefined) || undefined,
      editionId: (editionId as string | undefined) || undefined
    }
  })

  res.json({
    success: true,
    data: proposals,
    meta: {
      total,
      limit: parseInt(String(limit)),
      offset: parseInt(String(offset)),
      hasMore: (parseInt(String(offset)) + parseInt(String(limit))) < total
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

  res.json({
    success: true,
    data: {
      ...proposal,
      relatedProposals
    }
  })
}))

// PUT /api/proposals/:id - Update proposal (approve, reject, archive)
router.put('/:id', [
  param('id').isString().notEmpty(),
  body('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']),
  body('reviewedBy').optional().isString(),
  body('appliedChanges').optional().isObject(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { status, reviewedBy, appliedChanges } = req.body

  const updates: any = {}
  
  if (status) {
    updates.status = status
    updates.reviewedAt = new Date()
    if (reviewedBy) {
      updates.reviewedBy = reviewedBy
    }
  }

  const proposal = await db.updateProposal(id, updates)

  // If approved, log the applied changes for audit trail
  if (status === 'APPROVED' && appliedChanges) {
    await db.createLog({
      agentId: proposal.agentId,
      level: 'INFO',
      message: `Proposal ${id} approved and changes applied`,
      data: { proposalId: id, appliedChanges }
    })
  }

  res.json({
    success: true,
    data: proposal,
    message: `Proposal ${status?.toLowerCase() || 'updated'} successfully`
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

  // If this is for a new event and user provided an existing event to compare
  if (proposal.type === 'NEW_EVENT' && existingEventId) {
    // Fetch existing event data from cache or Miles Republic DB
    const existingEvent = await db.prisma.eventCache.findUnique({
      where: { id: existingEventId },
      include: {
        editions: {
          include: {
            races: true
          }
        }
      }
    })

    if (!existingEvent) {
      throw createError(404, 'Existing event not found', 'EVENT_NOT_FOUND')
    }

    res.json({
      success: true,
      data: {
        proposal: proposal.changes,
        existing: existingEvent,
        similarity: calculateEventSimilarity(proposal.changes, existingEvent)
      }
    })
  } else {
    // Compare with existing event/edition/race data
    let existingData = null

    if (proposal.eventId) {
      existingData = await db.prisma.eventCache.findUnique({
        where: { id: proposal.eventId }
      })
    } else if (proposal.editionId) {
      existingData = await db.prisma.editionCache.findUnique({
        where: { id: proposal.editionId }
      })
    } else if (proposal.raceId) {
      existingData = await db.prisma.raceCache.findUnique({
        where: { id: proposal.raceId }
      })
    }

    res.json({
      success: true,
      data: {
        proposal: proposal.changes,
        existing: existingData,
        changes: compareData(existingData, proposal.changes)
      }
    })
  }
}))

// Bulk operations
router.post('/bulk-approve', [
  body('proposalIds').isArray().withMessage('proposalIds must be an array'),
  body('proposalIds.*').isString().notEmpty(),
  body('reviewedBy').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { proposalIds, reviewedBy } = req.body

  const results = await db.prisma.proposal.updateMany({
    where: {
      id: { in: proposalIds },
      status: 'PENDING' // Only approve pending proposals
    },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedBy: reviewedBy || undefined
    }
  })

  res.json({
    success: true,
    data: { updated: results.count },
    message: `${results.count} proposals approved successfully`
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

export { router as proposalRouter }