import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { getDatabaseServiceSync } from '../services/database'
import { validateFrequencyConfig } from '@data-agents/database'
import { FlexibleScheduler } from '../services/flexible-scheduler'
import { asyncHandler, createError } from '../middleware/error-handler'
import { enrichAgentWithMetadata, getAvailableAgentsForUI } from '../services/agent-metadata'
import type { FrequencyConfig } from '@data-agents/types'

const router = Router()
const db = getDatabaseServiceSync()
const scheduler = new FlexibleScheduler()

// GET /api/agents/available - List available agent types for creation
// IMPORTANT: This route must be defined BEFORE /:id to avoid conflicts
router.get('/available', asyncHandler(async (_req: Request, res: Response) => {
  const availableAgents = getAvailableAgentsForUI()

  res.json({
    success: true,
    data: availableAgents
  })
}))

// Validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(e => `${e.type === 'field' ? (e as any).path : 'unknown'}: ${e.msg}`).join(', ')
    throw createError(400, `Validation failed: ${errorMessages}`, 'VALIDATION_ERROR')
  }
  next()
}

// GET /api/agents - List all agents
router.get('/', [
  query('includeInactive').optional().isBoolean(),
  query('type').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { includeInactive = 'false', type } = req.query

  let agents = await db.getAgents(includeInactive === 'true')

  if (type) {
    agents = agents.filter((agent: any) => agent.type === type)
  }

  res.json({
    success: true,
    data: agents
  })
}))

// GET /api/agents/:id - Get agent details
router.get('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const agent = await db.getAgent(id)
  if (!agent) {
    throw createError(404, 'Agent not found', 'AGENT_NOT_FOUND')
  }

  res.json({
    success: true,
    data: agent
  })
}))

// POST /api/agents - Create new agent
router.post('/', [
  body('name').isString().notEmpty().withMessage('Name is required'),
  body('description').optional().isString(),
  body('type').isIn(['EXTRACTOR', 'COMPARATOR', 'VALIDATOR', 'CLEANER', 'DUPLICATOR', 'SPECIFIC_FIELD', 'ANALYZER']),
  body('frequency').isObject().withMessage('Frequency must be a FrequencyConfig object'),
  body('config').isObject().withMessage('Config must be an object'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { name, description, type, frequency, config } = req.body

  // Validate frequency config
  const frequencyConfig = frequency as FrequencyConfig
  const validation = validateFrequencyConfig(frequencyConfig)
  if (!validation.valid) {
    throw createError(400, `Invalid frequency config: ${validation.errors.join(', ')}`, 'INVALID_FREQUENCY')
  }

  // Enrichir automatiquement avec les métadonnées depuis le code
  const enriched = await enrichAgentWithMetadata({
    name,
    config,
    description
  })

  const agent = await db.createAgent({
    name,
    description: enriched.description,
    type,
    frequency: frequencyConfig,
    config: enriched.config
  })

  // Register with scheduler
  await scheduler.registerAgent(agent.id)

  res.status(201).json({
    success: true,
    data: agent,
    message: 'Agent created successfully'
  })
}))

// PUT /api/agents/:id - Update agent
router.put('/:id', [
  param('id').isString().notEmpty(),
  body('name').optional().isString().notEmpty(),
  body('description').optional().isString(),
  body('frequency').optional().isObject(),
  body('config').optional().isObject(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body

  // Validate frequency config if provided
  if (updates.frequency) {
    const frequencyConfig = updates.frequency as FrequencyConfig
    const validation = validateFrequencyConfig(frequencyConfig)
    if (!validation.valid) {
      throw createError(400, `Invalid frequency config: ${validation.errors.join(', ')}`, 'INVALID_FREQUENCY')
    }
  }

  const agent = await db.updateAgent(id, updates)

  // Update scheduler if frequency changed
  if (updates.frequency || updates.isActive !== undefined) {
    await scheduler.updateAgent(id)
  }

  res.json({
    success: true,
    data: agent,
    message: 'Agent updated successfully'
  })
}))

// POST /api/agents/:id/toggle - Toggle agent active status
router.post('/:id/toggle', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const existingAgent = await db.getAgent(id)
  if (!existingAgent) {
    throw createError(404, 'Agent not found', 'AGENT_NOT_FOUND')
  }

  const agent = await db.updateAgent(id, {
    isActive: !existingAgent.isActive
  })

  // Update scheduler
  await scheduler.updateAgent(id)

  res.json({
    success: true,
    data: agent,
    message: `Agent ${agent.isActive ? 'activated' : 'deactivated'} successfully`
  })
}))

// POST /api/agents/:id/run - Manually trigger agent run
router.post('/:id/run', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const agent = await db.getAgent(id)
  if (!agent) {
    throw createError(404, 'Agent not found', 'AGENT_NOT_FOUND')
  }

  // Trigger manual run
  const runId = await scheduler.runAgent(id)

  res.json({
    success: true,
    data: { runId },
    message: 'Agent run triggered successfully'
  })
}))

// GET /api/agents/:id/status - Get agent status
router.get('/:id/status', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const status = await scheduler.getAgentStatus(id)
  if (!status) {
    throw createError(404, 'Agent not found', 'AGENT_NOT_FOUND')
  }

  res.json({
    success: true,
    data: status
  })
}))

// GET /api/agents/:id/validate - Validate agent configuration
router.get('/:id/validate', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const validation = await db.validateAgentConfiguration(id)

  res.json({
    success: true,
    data: validation
  })
}))

// POST /api/agents/:id/reinstall - Reinstall agent with latest definition
router.post('/:id/reinstall', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const agent = await db.reinstallAgent(id)

  // Update scheduler with new configuration
  await scheduler.updateAgent(id)

  res.json({
    success: true,
    data: agent,
    message: 'Agent reinstalled successfully'
  })
}))

// GET /api/agents/:id/state - Get agent state (progress, cursor, etc.)
router.get('/:id/state', [
  param('id').isString().notEmpty(),
  query('key').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { key } = req.query

  const agent = await db.getAgent(id)
  if (!agent) {
    throw createError(404, 'Agent not found', 'AGENT_NOT_FOUND')
  }

  if (key) {
    // Récupérer une clé spécifique
    const state = await db.prisma.agentState.findFirst({
      where: {
        agentId: id,
        key: key as string
      }
    })

    res.json({
      success: true,
      data: state ? state.value : null
    })
  } else {
    // Récupérer toutes les clés
    const states = await db.prisma.agentState.findMany({
      where: { agentId: id }
    })

    const stateMap = states.reduce((acc: Record<string, unknown>, s: { key: string; value: unknown }) => {
      acc[s.key] = s.value
      return acc
    }, {} as Record<string, unknown>)

    res.json({
      success: true,
      data: stateMap
    })
  }
}))

// POST /api/agents/:id/reset-cursor - Reset agent cursor to zero
router.post('/:id/reset-cursor', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const agent = await db.getAgent(id)
  if (!agent) {
    throw createError(404, 'Agent not found', 'AGENT_NOT_FOUND')
  }

  // Delete all state for this agent (cursor, progress, etc.)
  await db.prisma.agentState.deleteMany({
    where: { agentId: id }
  })

  res.json({
    success: true,
    message: 'Agent state reset successfully'
  })
}))

// POST /api/agents/:id/reset-cooldown - Reset cooldown to restart scraping cycle
router.post('/:id/reset-cooldown', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const agent = await db.getAgent(id)
  if (!agent) {
    throw createError(404, 'Agent not found', 'AGENT_NOT_FOUND')
  }

  // Get current progress state
  const progressState = await db.prisma.agentState.findFirst({
    where: { agentId: id, key: 'progress' }
  })

  if (!progressState) {
    throw createError(404, 'No progress state found for this agent', 'NO_PROGRESS_STATE')
  }

  // Reset lastCompletedAt to null to exit cooldown
  const currentValue = progressState.value as any
  const updatedValue = {
    ...currentValue,
    lastCompletedAt: null
  }

  await db.prisma.agentState.update({
    where: { id: progressState.id },
    data: { value: updatedValue }
  })

  res.json({
    success: true,
    message: 'Cooldown reset successfully. The agent will resume scraping on next run.'
  })
}))

// DELETE /api/agents/:id - Delete agent
router.delete('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  // Unregister from scheduler first
  await scheduler.unregisterAgent(id)

  // Delete from database (cascades to runs, logs, proposals)
  await db.prisma.agent.delete({ where: { id } })

  res.json({
    success: true,
    message: 'Agent deleted successfully'
  })
}))

export { router as agentRouter }
