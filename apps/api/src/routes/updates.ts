import { Router } from 'express'
import { param, query, body, validationResult } from 'express-validator'
import { getDatabaseService } from '../services/database'
import { asyncHandler, createError } from '../middleware/error-handler'
import { enrichProposal } from './proposals'
import { sortBlocksByDependencies, explainExecutionOrder, validateRequiredBlocks, BlockApplication } from '@data-agents/database'

const router = Router()

// Lazy-initialize services (will be set when first route is accessed)
let db: any = null
let applicationService: any = null

// Helper to ensure services are initialized
const ensureServices = async () => {
  if (!db) {
    db = await getDatabaseService()
    applicationService = db.proposalApplication

    if (!applicationService) {
      throw new Error('ProposalApplicationService not initialized. DatabaseManager may not be available.')
    }
  }
  return { db, applicationService }
}

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw createError(400, 'Validation failed', 'VALIDATION_ERROR')
  }
  next()
}

// Helper pour résoudre les IDs avec ou sans préfixe
const resolveId = (id: string, prefix: string): string => {
  if (id.startsWith(prefix)) return id
  return `${prefix}${id}`
}

// Helper function to transform Prisma data for frontend
const transformApplicationForAPI = (app: any) => {
  // Construire le contexte depuis les champs de la proposition
  let contextInfo: any = null

  const { eventName, eventCity, editionYear, raceName } = app.proposal

  if (eventName || editionYear || raceName) {
    contextInfo = {
      eventName,
      eventCity,
      editionYear: editionYear ? String(editionYear) : undefined,
      raceName
    }
  }

  return {
    id: app.id,
    proposalId: app.proposalId,
    proposalIds: app.proposalIds || [app.proposalId],  // ✅ Pour groupement frontend
    blockType: app.blockType || null,  // ✅ Type de bloc ('edition', 'organizer', 'races', 'event', ou null pour legacy)
    status: app.status,

    // ✅ PHASE 2: Inclure appliedChanges (payload complet agent + user)
    appliedChanges: app.appliedChanges || {},

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
      // ⚠️ userModifiedChanges devient optionnel (fallback legacy)
      userModifiedChanges: app.proposal.userModifiedChanges,
      eventId: app.proposal.eventId,
      editionId: app.proposal.editionId,
      raceId: app.proposal.raceId,
      eventName: app.proposal.eventName,  // Enriched for EVENT_UPDATE
      eventCity: app.proposal.eventCity,  // Enriched for EVENT_UPDATE
      agent: {
        name: app.proposal.agent.name,
        type: app.proposal.agent.type
      }
    },
    context: contextInfo
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
  await ensureServices()
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

  // Enrichir les propositions avec les infos contextuelles
  const enrichedApplications = await Promise.all(
    applications.map(async (app: any) => ({
      ...app,
      proposal: await enrichProposal(app.proposal)
    }))
  )

  const transformedUpdates = enrichedApplications.map(app => transformApplicationForAPI(app))

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
  await ensureServices()
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

  const transformedData = transformApplicationForAPI(application)

  res.json({
    success: true,
    data: transformedData
  })
}))

// POST /api/updates - Create new update
router.post('/', [
  body('proposalId').isString().notEmpty(),
  body('scheduledAt').optional().isISO8601(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  await ensureServices()
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

  const transformedData = transformApplicationForAPI(application)

  res.json({
    success: true,
    data: transformedData,
    message: 'Update created successfully'
  })
}))

// POST /api/updates/:id/apply - Apply update
router.post('/:id/apply', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  await ensureServices()
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

  // ✅ CASCADE AUTOMATIQUE: Appliquer les dépendances manquantes
  if (application.blockType) {
    const { getAllDependencies } = require('@data-agents/database')
    const requiredDeps = getAllDependencies(application.blockType as any)

    if (requiredDeps.length > 0) {
      console.log(`🔄 Bloc "${application.blockType}" nécessite: ${requiredDeps.join(' → ')}`)

      // Récupérer toutes les applications de cette proposition
      const allApps = await db.prisma.proposalApplication.findMany({
        where: {
          proposalId: application.proposalId,
          blockType: { in: requiredDeps }
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

      // Appliquer les dépendances PENDING dans l'ordre
      for (const depType of requiredDeps) {
        const depApp = allApps.find((a: any) => a.blockType === depType)

        if (!depApp) {
          // ✅ EXCEPTION: Pour EDITION_UPDATE, les blocs 'event' et 'edition' ne sont pas obligatoires
          // car applyEditionUpdate() utilise directement l'editionId et l'eventId existants de la proposition
          const proposalType = application.proposal.type

          if (proposalType === 'EDITION_UPDATE' && (depType === 'event' || depType === 'edition')) {
            console.log(`  ⏭️  Bloc "${depType}" non trouvé pour EDITION_UPDATE - ${depType}Id sera récupéré depuis la proposition/base`)
            continue  // Skip cette dépendance
          }

          throw createError(400, `Bloc requis "${depType}" introuvable pour cette proposition`, 'MISSING_DEPENDENCY')
        }

        if (depApp.status === 'PENDING') {
          console.log(`  → Application automatique du bloc "${depType}"...`)

          // Appliquer directement sans récursion HTTP
          const depLogs: string[] = []
          const applyOptions: any = {
            capturedLogs: depLogs,
            proposalId: depApp.proposalId,  // ✅ Nécessaire pour récupérer les IDs
            blockType: depType  // ✅ Type de bloc à appliquer
          }

          if (depApp.proposalIds && depApp.proposalIds.length > 0) {
            applyOptions.proposalIds = depApp.proposalIds
          }

          const depResult = await applicationService.applyProposal(
            depApp.proposalId,
            depApp.proposal.changes as Record<string, any>,
            applyOptions
          )

          if (!depResult.success) {
            const errorMsg = depResult.errors?.map((e: any) => e.message).join('; ') || 'Unknown error'
            throw createError(500, `Échec application du bloc "${depType}": ${errorMsg}`, 'DEPENDENCY_APPLICATION_FAILED')
          }

          // Mettre à jour le statut de la dépendance
          await db.prisma.proposalApplication.update({
            where: { id: depApp.id },
            data: {
              status: 'APPLIED',
              appliedAt: new Date(),
              logs: depLogs,
              appliedChanges: depResult.appliedChanges as any,
              rollbackData: (depResult.createdIds as any) || null
            }
          })

          console.log(`  ✅ Bloc "${depType}" appliqué avec succès`)
        } else if (depApp.status === 'FAILED') {
          throw createError(400, `Bloc requis "${depType}" en échec. Veuillez le rejouer d'abord.`, 'DEPENDENCY_FAILED')
        } else if (depApp.status === 'APPLIED') {
          console.log(`  ✅ Bloc "${depType}" déjà appliqué`)
        }
      }

      console.log(`🚀 Toutes les dépendances appliquées, application du bloc "${application.blockType}"...`)
    }
  }

  const logs: string[] = []
  let success = false
  let errorMessage: string | null = null

  try {
    logs.push('Starting update application...')
    logs.push('Validating proposal changes...')

    // ✅ MODE GROUPÉ : Passer proposalIds si disponibles
    const applyOptions: any = {
      capturedLogs: logs,
      proposalId: application.proposalId  // ✅ Nécessaire pour récupérer les IDs des blocs précédents
    }

    if (application.proposalIds && application.proposalIds.length > 0) {
      applyOptions.proposalIds = application.proposalIds
      logs.push(`📦 Mode groupé détecté: ${application.proposalIds.length} propositions`)
    }

    // ✅ Passer blockType pour application par blocs (NEW_EVENT)
    if (application.blockType) {
      applyOptions.blockType = application.blockType
      logs.push(`📦 Application bloc "${application.blockType}"`)
    }

    // Apply the proposal using ProposalApplicationService with log capturing
    const result = await applicationService.applyProposal(
      application.proposalId,
      application.proposal.changes as Record<string, any>, // Use all changes from the proposal
      applyOptions // Pass options with proposalIds, blockType, proposalId
    )

    if (result.success) {
      success = true
      logs.push('Successfully applied all changes')
      logs.push(`Applied changes: ${Object.keys(result.appliedChanges).join(', ')}`)

      // Log des entités créées si disponibles
      if (result.createdIds) {
        if (result.createdIds.eventId) {
          logs.push(`✅ Event créé: ${result.createdIds.eventId}`)
        }
        if (result.createdIds.editionId) {
          logs.push(`✅ Edition créée: ${result.createdIds.editionId}`)
        }
        if (result.createdIds.raceIds && result.createdIds.raceIds.length > 0) {
          logs.push(`✅ ${result.createdIds.raceIds.length} course(s) créée(s): ${result.createdIds.raceIds.join(', ')}`)
        }
      }
    } else {
      errorMessage = result.errors?.map((e: any) => e.message).join('; ') || 'Unknown error'
      logs.push(`Application failed: ${errorMessage}`)
    }

    // Update the application record
    // ✅ FIX: Utiliser result.appliedChanges si application.appliedChanges est vide
    // Un objet vide {} est truthy en JS, donc on vérifie explicitement
    const hasExistingChanges = application.appliedChanges && Object.keys(application.appliedChanges).length > 0
    const finalAppliedChanges = hasExistingChanges ? application.appliedChanges : result.appliedChanges

    const updatedApplication = await db.prisma.proposalApplication.update({
      where: { id },
      data: {
        status: success ? 'APPLIED' : 'FAILED',
        appliedAt: success ? new Date() : null,
        errorMessage: errorMessage,
        logs: logs,
        // ✅ Préserver appliedChanges d'origine SI non vide (payload complet avec racesToDelete, etc.)
        // Sinon utiliser result.appliedChanges qui contient les données effectivement appliquées
        appliedChanges: finalAppliedChanges as any,
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
  await ensureServices()
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

// POST /api/updates/bulk/delete - Delete multiple updates
router.post('/bulk/delete', [
  body('ids').isArray().notEmpty(),
  body('ids.*').isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  await ensureServices()
  const { ids } = req.body

  // Vérifier que toutes les mises à jour existent
  const applications = await db.prisma.proposalApplication.findMany({
    where: { id: { in: ids } },
    select: { id: true }
  })

  const foundIds = applications.map((app: any) => app.id)
  const notFoundIds = ids.filter((id: string) => !foundIds.includes(id))

  if (notFoundIds.length > 0) {
    throw createError(404, `Updates not found: ${notFoundIds.join(', ')}`, 'UPDATES_NOT_FOUND')
  }

  // Supprimer toutes les mises à jour
  const result = await db.prisma.proposalApplication.deleteMany({
    where: { id: { in: ids } }
  })

  res.json({
    success: true,
    message: `${result.count} update(s) deleted successfully`,
    data: { deletedCount: result.count }
  })
}))

// POST /api/updates/bulk/apply - Apply multiple updates
router.post('/bulk/apply', [
  body('ids').isArray().notEmpty(),
  body('ids.*').isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  await ensureServices()
  const { ids } = req.body

  // Récupérer toutes les mises à jour
  const applications = await db.prisma.proposalApplication.findMany({
    where: { id: { in: ids } },
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

  // ✅ PHASE 2: Trier les applications selon les dépendances entre blocs
  const sortedApplications = sortBlocksByDependencies(
    applications.map((app: any) => ({
      blockType: app.blockType,
      id: app.id
    }))
  )

  // Récupérer les applications complètes dans l'ordre trié
  const applicationsInOrder = sortedApplications
    .map((sorted: BlockApplication) => applications.find((app: any) => app.id === sorted.id)!)
    .filter(Boolean)

  const executionOrder = explainExecutionOrder(sortedApplications)
  console.log(`📋 ${executionOrder}`)

  const foundIds = applications.map((app: any) => app.id)
  const notFoundIds = ids.filter((id: string) => !foundIds.includes(id))

  if (notFoundIds.length > 0) {
    throw createError(404, `Updates not found: ${notFoundIds.join(', ')}`, 'UPDATES_NOT_FOUND')
  }

  // Vérifier que toutes les mises à jour sont PENDING
  const nonPendingApps = applications.filter((app: any) => app.status !== 'PENDING')
  if (nonPendingApps.length > 0) {
    throw createError(400, `Some updates are not pending: ${nonPendingApps.map((a: any) => a.id).join(', ')}`, 'INVALID_STATUS')
  }

  // ✅ PHASE 3: Valider que les blocs requis sont présents
  // Pour les propositions groupées, toutes doivent avoir le même type
  const proposalTypes = [...new Set(applications.map((app: any) => app.proposal.type))]

  if (proposalTypes.length > 1) {
    console.warn('⚠️ Applications avec types de propositions différents:', proposalTypes)
    // On valide quand même avec le premier type
  }

  const proposalType = applications[0].proposal.type
  const validation = validateRequiredBlocks(sortedApplications, proposalType)

  if (!validation.valid) {
    const missingBlocksList = validation.missing.join(', ')
    console.error(`❌ Blocs manquants pour ${proposalType}:`, validation.missing)

    throw createError(
      400,
      `Missing required blocks for ${proposalType}: ${missingBlocksList}. Cannot apply changes without these blocks.`,
      'MISSING_REQUIRED_BLOCKS'
    )
  }

  console.log(`✅ Validation passed: All required blocks present for ${proposalType}`)

  // Appliquer toutes les mises à jour dans l'ordre trié
  const results = {
    successful: [] as string[],
    failed: [] as { id: string; error: string | null }[]
  }

  for (const application of applicationsInOrder) {
    const logs: string[] = []
    let success = false
    let errorMessage: string | null = null

    try {
      logs.push(`[${new Date().toISOString()}] Starting bulk update application...`)
      logs.push('Validating proposal changes...')

      // Appliquer la proposition
      const result = await applicationService.applyProposal(
        application.proposalId,
        application.proposal.changes as Record<string, any>
      )

      if (result.success) {
        success = true
        logs.push('Successfully applied all changes')
        logs.push(`Applied changes: ${Object.keys(result.appliedChanges).join(', ')}`)

        // Log des entités créées si disponibles
        if (result.createdIds) {
          if (result.createdIds.eventId) {
            logs.push(`✅ Event créé: ${result.createdIds.eventId}`)
          }
          if (result.createdIds.editionId) {
            logs.push(`✅ Edition créée: ${result.createdIds.editionId}`)
          }
          if (result.createdIds.raceIds && result.createdIds.raceIds.length > 0) {
            logs.push(`✅ ${result.createdIds.raceIds.length} course(s) créée(s): ${result.createdIds.raceIds.join(', ')}`)
          }
        }

        results.successful.push(application.id)
      } else {
        errorMessage = result.errors?.map((e: any) => e.message).join('; ') || 'Unknown error'
        logs.push(`Application failed: ${errorMessage}`)
        results.failed.push({ id: application.id, error: errorMessage })
      }

      // Mettre à jour l'enregistrement
      await db.prisma.proposalApplication.update({
        where: { id: application.id },
        data: {
          status: success ? 'APPLIED' : 'FAILED',
          appliedAt: success ? new Date() : null,
          errorMessage: errorMessage,
          logs: logs,
          appliedChanges: success ? (result.appliedChanges as any) : null,
          rollbackData: success ? (result.createdIds as any) || null : null
        }
      })

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unexpected error'
      logs.push(`Unexpected error: ${errMsg}`)
      results.failed.push({ id: application.id, error: errMsg })

      // Mettre à jour l'enregistrement avec l'erreur
      await db.prisma.proposalApplication.update({
        where: { id: application.id },
        data: {
          status: 'FAILED',
          errorMessage: errMsg,
          logs: logs
        }
      })
    }
  }

  res.json({
    success: true,
    message: `Bulk apply completed: ${results.successful.length} successful, ${results.failed.length} failed`,
    data: {
      successful: results.successful,
      failed: results.failed,
      totalProcessed: applications.length
    }
  })
}))

// GET /api/updates/:id/logs - Get update logs
router.get('/:id/logs', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  await ensureServices()
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
  await ensureServices()
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
