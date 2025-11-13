import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { getDatabaseServiceSync } from '../services/database'
import { asyncHandler, createError } from '../middleware/error-handler'
import { requireAuth, optionalAuth } from '../middleware/auth.middleware'

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

export async function enrichProposal(proposal: any) {
  // EVENT_UPDATE: Enrich with event name, city and status
  if (proposal.type === 'EVENT_UPDATE' && proposal.eventId) {
    try {
      // Lazy load and cache Miles Republic connection (une seule fois au démarrage)
      if (!milesRepublicConnection) {
        const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
          where: { type: 'MILES_REPUBLIC', isActive: true }
        })
        if (!milesRepublicConn) return proposal
        milesRepublicConnectionId = milesRepublicConn.id

        // Lazy load DatabaseManager singleton
        const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
        const logger = createConsoleLogger('API', 'proposals-api')
        enrichProposalDbManager = DatabaseManager.getInstance(logger)
        
        // Obtenir et cacher la connexion Prisma
        milesRepublicConnection = await enrichProposalDbManager.getConnection(milesRepublicConnectionId)
      }

      const connection = milesRepublicConnection

      const numericEventId = typeof proposal.eventId === 'string' && /^\d+$/.test(proposal.eventId)
        ? parseInt(proposal.eventId)
        : proposal.eventId

      const event = await connection.event.findUnique({
        where: { id: numericEventId },
        select: { 
          name: true,
          city: true,
          status: true,
          slug: true
        }
      })

      if (event) {
        return {
          ...proposal,
          eventName: event.name,
          eventCity: event.city,
          eventStatus: event.status,
          eventSlug: event.slug
        }
      }
    } catch (error) {
      console.warn('Failed to fetch event info for proposal', proposal.id, error)
    }
    return proposal
  }
  
  // Pour les EDITION_UPDATE et NEW_EVENT
  if (proposal.type === 'EDITION_UPDATE' || proposal.type === 'NEW_EVENT') {
    try {
      // Lazy load and cache Miles Republic connection (une seule fois au démarrage)
      if (!milesRepublicConnection) {
        const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
          where: { type: 'MILES_REPUBLIC', isActive: true }
        })
        if (!milesRepublicConn) return proposal
        milesRepublicConnectionId = milesRepublicConn.id

        // Lazy load DatabaseManager singleton
        const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
        const logger = createConsoleLogger('API', 'proposals-api')
        enrichProposalDbManager = DatabaseManager.getInstance(logger)
        
        // Obtenir et cacher la connexion Prisma
        milesRepublicConnection = await enrichProposalDbManager.getConnection(milesRepublicConnectionId)
      }

      const connection = milesRepublicConnection

      let numericEventId: number | undefined
      let editionYear: number | undefined

      // Pour EDITION_UPDATE, récupérer l'eventId depuis l'édition
      if (proposal.type === 'EDITION_UPDATE' && proposal.editionId) {
        const numericEditionId = typeof proposal.editionId === 'string' && /^\d+$/.test(proposal.editionId)
          ? parseInt(proposal.editionId)
          : proposal.editionId

        const edition = await connection.edition.findUnique({
          where: { id: numericEditionId },
          select: { 
            eventId: true,
            year: true
          }
        })

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
      const event = await connection.event.findUnique({
        where: { id: numericEventId },
        select: { 
          name: true,
          city: true,
          status: true,
          slug: true
        }
      })
      
      // Base enrichment avec event info
      const enriched: any = {
        ...proposal,
        eventName: event?.name,
        eventCity: event?.city,
        eventStatus: event?.status,
        eventSlug: event?.slug,
        editionYear: editionYear
      }

      // Si on a editionYear, récupérer aussi l'édition précédente
      if (editionYear && typeof editionYear === 'number' && !isNaN(editionYear)) {
        const previousEditionYear = editionYear - 1
        const previousEdition = await connection.edition.findFirst({
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
        
        const existingRaces = await connection.race.findMany({
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
        
        // Extraire racesToUpdate de la proposition (si existe)
        const racesToUpdate = proposal.changes?.racesToUpdate?.new || []
        const raceUpdatesMap = new Map(
          racesToUpdate.map((update: any) => [update.raceId, update.updates])
        )
        
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
      console.warn('Failed to fetch edition info for proposal', proposal.id, error)
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

  // Enrichir chaque proposition avec les infos contextuelles
  const enrichedProposals = await Promise.all(
    proposals.map(p => enrichProposal(p))
  )

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
        }
      }
    })
    
    proposals = proposal ? [proposal] : []
  } else {
    // Parse eventId-editionId format
    const [eventId, editionId] = groupKey.split('-')
    
    if (!eventId || !editionId || eventId === 'unknown' || editionId === 'unknown') {
      throw createError(400, 'Invalid group key format', 'INVALID_GROUP_KEY')
    }
    
    // Get all proposals for this event/edition combination
    proposals = await db.prisma.proposal.findMany({
      where: {
        eventId,
        editionId
      },
      include: {
        agent: {
          select: { name: true, type: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }
  
  // Enrichir chaque proposition avec les infos contextuelles
  const enrichedProposals = await Promise.all(
    proposals.map(p => enrichProposal(p))
  )
  
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
      
      const duplicateApp = allPendingApplications.find(app => {
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

    // Courses : Matcher avec l'édition existante (comme dans FFAScraperAgent)
    if (editionData.races && editionData.races.length > 0) {
      const ffaRaces = editionData.races
      const existingRaces = existingEdition.races || []
      
      // Convertir les distances DB (km) en mètres
      const existingRacesWithMeters = existingRaces.map((r: any) => ({
        ...r,
        totalDistanceMeters: ((r.runDistance || 0) + (r.walkDistance || 0) + (r.swimDistance || 0) + (r.bikeDistance || 0)) * 1000
      }))
      
      const racesToAdd: any[] = []
      const racesToUpdate: any[] = []
      
      for (const ffaRace of ffaRaces) {
        // Matcher par distance (tolérance 5%)
        const matchingRace = existingRacesWithMeters.find((dbRace: any) => {
          if (ffaRace.runDistance && ffaRace.runDistance > 0) {
            const ffaDistanceMeters = ffaRace.runDistance * 1000
            const tolerance = ffaDistanceMeters * 0.05
            const distanceDiff = Math.abs(dbRace.totalDistanceMeters - ffaDistanceMeters)
            return distanceDiff <= tolerance
          }
          
          // Fallback sur le nom
          const nameMatch = dbRace.name?.toLowerCase().includes(ffaRace.name.toLowerCase()) ||
                            ffaRace.name.toLowerCase().includes(dbRace.name?.toLowerCase())
          return nameMatch
        })
        
        if (!matchingRace) {
          // Course à ajouter
          racesToAdd.push(ffaRace)
        } else {
          // Course existante - vérifier les mises à jour
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
          }
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

  // Vérifier si l'application a déjà été appliquée
  const appliedApplication = proposal.applications.find(app => app.status === 'APPLIED')
  if (appliedApplication) {
    throw createError(400, 'Cannot unapprove a proposal that has already been applied', 'PROPOSAL_ALREADY_APPLIED')
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
  
  await db.prisma.$transaction(async (tx) => {
    // Si on repasse à PENDING, supprimer les applications en attente
    if (newStatus === 'PENDING') {
      const pendingApplications = proposal.applications.filter(app => app.status === 'PENDING')
      
      if (pendingApplications.length > 0) {
        await tx.proposalApplication.deleteMany({
          where: {
            id: { in: pendingApplications.map(app => app.id) }
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
  const result = await db.prisma.$transaction(async (tx) => {
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
          id: { in: pendingProposals.map(p => p.id) }
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
      
      const duplicateApp = allPendingApplications.find(app => {
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

export { router as proposalRouter }