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
  body('userModifiedChanges').optional().isObject(),
  body('modificationReason').optional().isString(),
  body('modifiedBy').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { status, reviewedBy, appliedChanges, userModifiedChanges, modificationReason, modifiedBy } = req.body

  const updates: any = {}
  
  if (status) {
    updates.status = status
    updates.reviewedAt = new Date()
    if (reviewedBy) {
      updates.reviewedBy = reviewedBy
    }
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
    // Check if application already exists
    const existingApp = await db.prisma.proposalApplication.findFirst({
      where: { proposalId: id }
    })

    if (!existingApp) {
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

  res.json({
    success: true,
    data: proposal,
    createdApplication,
    message: `Proposal ${status?.toLowerCase() || 'updated'} successfully${createdApplication ? ' - Application created and ready for deployment' : ''}`
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
router.post('/:id/apply', [
  param('id').isString().notEmpty(),
  body('selectedChanges').isObject().withMessage('selectedChanges must be an object'),
  body('force').optional().isBoolean().withMessage('force must be a boolean'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { selectedChanges, force = false } = req.body

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
router.post('/:id/unapprove', [
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

  if (proposal.status !== 'APPROVED') {
    throw createError(400, 'Only approved proposals can be unapproved', 'PROPOSAL_NOT_APPROVED')
  }

  // Vérifier si l'application a déjà été appliquée
  const appliedApplication = proposal.applications.find(app => app.status === 'APPLIED')
  if (appliedApplication) {
    throw createError(400, 'Cannot unapprove a proposal that has already been applied', 'PROPOSAL_ALREADY_APPLIED')
  }

  // Supprimer les applications PENDING
  const pendingApplications = proposal.applications.filter(app => app.status === 'PENDING')
  
  await db.prisma.$transaction(async (tx) => {
    // Supprimer les applications en attente
    if (pendingApplications.length > 0) {
      await tx.proposalApplication.deleteMany({
        where: {
          id: { in: pendingApplications.map(app => app.id) }
        }
      })
    }

    // Remettre la proposition à PENDING
    await tx.proposal.update({
      where: { id },
      data: {
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null
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
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const { proposalIds, reviewedBy } = req.body

  // Use transaction to approve proposals and create applications atomically
  const result = await db.prisma.$transaction(async (tx) => {
    // First, get all pending proposals that will be approved
    const pendingProposals = await tx.proposal.findMany({
      where: {
        id: { in: proposalIds },
        status: 'PENDING'
      }
    })

    // Approve the proposals
    const updateResult = await tx.proposal.updateMany({
      where: {
        id: { in: pendingProposals.map(p => p.id) }
      },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: reviewedBy || undefined
      }
    })

    // Create ProposalApplication for each approved proposal (only if not exists)
    const applicationsToCreate = []
    for (const proposal of pendingProposals) {
      const existingApp = await tx.proposalApplication.findFirst({
        where: { proposalId: proposal.id }
      })
      
      if (!existingApp) {
        applicationsToCreate.push({
          proposalId: proposal.id,
          status: 'PENDING' as const
        })
      }
    }

    const applications = await tx.proposalApplication.createMany({
      data: applicationsToCreate
    })

    return {
      approvedCount: updateResult.count,
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

export { router as proposalRouter }