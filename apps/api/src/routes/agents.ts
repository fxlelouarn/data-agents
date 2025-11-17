import { Router, Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { getDatabaseServiceSync } from '../services/database'
import { AgentScheduler } from '../services/scheduler'
import { asyncHandler, createError } from '../middleware/error-handler'
import { enrichAgentWithMetadata } from '../services/agent-metadata'

const router = Router()
const db = getDatabaseServiceSync()
const scheduler = new AgentScheduler()

// Function to validate cron expressions with support for intervals
const isValidCronExpression = (expression: string): boolean => {
  if (!expression) return false
  
  // Vérification de base : 5 champs séparés par des espaces
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  
  // Vérification que chaque champ contient uniquement des caractères valides pour cron
  const cronFieldPattern = /^[*\/\d,-]+$|^[A-Z]{3}$|^[A-Z]{3}-[A-Z]{3}$|^[A-Z]{3},[A-Z]{3}$/
  const monthDayPattern = /^[*\/\d,-]+$|^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$|^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/
  const weekDayPattern = /^[*\/\d,-]+$|^(SUN|MON|TUE|WED|THU|FRI|SAT)$|^(SUN|MON|TUE|WED|THU|FRI|SAT)-(SUN|MON|TUE|WED|THU|FRI|SAT)$/
  
  // Vérifier minute, heure, jour du mois
  for (let i = 0; i < 3; i++) {
    if (!cronFieldPattern.test(fields[i])) return false
  }
  
  // Vérifier mois (peut avoir des noms)
  if (!monthDayPattern.test(fields[3])) return false
  
  // Vérifier jour de la semaine (peut avoir des noms)
  if (!weekDayPattern.test(fields[4])) return false
  
  return true
}

// Validation middleware
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw createError(400, 'Validation failed', 'VALIDATION_ERROR')
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
  body('type').isIn(['EXTRACTOR', 'COMPARATOR', 'VALIDATOR', 'CLEANER', 'DUPLICATOR', 'SPECIFIC_FIELD']),
  body('frequency').isString().notEmpty().withMessage('Frequency (cron expression) is required'),
  body('config').isObject().withMessage('Config must be an object'),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { name, description, type, frequency, config } = req.body

  // Validate cron expression
  if (!isValidCronExpression(frequency)) {
    throw createError(400, 'Invalid cron expression', 'INVALID_CRON')
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
    frequency,
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
  body('frequency').optional().isString(),
  body('config').optional().isObject(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body

  // Validate cron expression if provided
  if (updates.frequency) {
    if (!isValidCronExpression(updates.frequency)) {
      throw createError(400, 'Invalid cron expression', 'INVALID_CRON')
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
    
    const stateMap = states.reduce((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {} as Record<string, any>)
    
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
