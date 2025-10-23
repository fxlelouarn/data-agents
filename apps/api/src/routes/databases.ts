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
    const errorMessages = errors.array().map((error: any) => error.msg).join(', ')
    console.log('Validation errors:', errors.array())
    console.log('Request body:', req.body)
    throw createError(400, `Validation failed: ${errorMessages}`, 'VALIDATION_ERROR')
  }
  next()
}

// GET /api/databases - List all database connections
router.get('/', [
  query('includeInactive').optional().isBoolean(),
  query('type').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { includeInactive = 'false', type } = req.query
  
  let connections = await db.getDatabaseConnections(includeInactive === 'true')
  
  if (type) {
    connections = connections.filter((conn: any) => conn.type === type)
  }

  res.json({
    success: true,
    data: connections
  })
}))

// GET /api/databases/:id - Get database connection details
router.get('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  
  const connection = await db.getDatabaseConnection(id)
  if (!connection) {
    throw createError(404, 'Database connection not found', 'DATABASE_CONNECTION_NOT_FOUND')
  }

  res.json({
    success: true,
    data: connection
  })
}))


// POST /api/databases - Create new database connection
router.post('/', [
  body('name').isString().notEmpty().withMessage('Name is required'),
  body('description').optional().isString(),
  body('type').isIn(['POSTGRESQL', 'MILES_REPUBLIC']),
  body('host').optional().isString(),
  body('port').optional().isInt({ min: 1, max: 65535 }),
  body('database').optional().isString(),
  body('username').optional().isString(),
  body('password').optional().isString(),
  body('connectionUrl').optional().isString(),
  body('sslMode').optional().isString(),
  body('timeout').optional().isInt({ min: 1000 }),
  body('maxConnections').optional().isInt({ min: 1 }),
  body('tags').optional().isArray(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  // Remove isDefault since it's not supported in backend yet
  const { isDefault, ...connectionData } = req.body

  const connection = await db.createDatabaseConnection(connectionData)

  res.status(201).json({
    success: true,
    data: connection,
    message: 'Database connection created successfully'
  })
}))

// PUT /api/databases/:id - Update database connection
router.put('/:id', [
  param('id').isString().notEmpty(),
  body('name').optional().isString().notEmpty(),
  body('description').optional().isString(),
  body('type').optional().isIn(['POSTGRESQL', 'MILES_REPUBLIC']),
  body('host').optional().isString(),
  body('port').optional().isInt({ min: 1, max: 65535 }),
  body('database').optional().isString(),
  body('username').optional().isString(),
  body('password').optional().isString(),
  body('connectionUrl').optional().isString(),
  body('sslMode').optional().isString(),
  body('timeout').optional().isInt({ min: 1000 }),
  body('maxConnections').optional().isInt({ min: 1 }),
  body('tags').optional().isArray(),
  body('isActive').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  // Remove isDefault since it's not supported in backend yet
  const { isDefault, ...updates } = req.body

  const connection = await db.updateDatabaseConnection(id, updates)

  res.json({
    success: true,
    data: connection,
    message: 'Database connection updated successfully'
  })
}))

// POST /api/databases/:id/toggle - Toggle database connection active status
router.post('/:id/toggle', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const existingConnection = await db.getDatabaseConnection(id)
  if (!existingConnection) {
    throw createError(404, 'Database connection not found', 'DATABASE_CONNECTION_NOT_FOUND')
  }

  const connection = await db.updateDatabaseConnection(id, {
    isActive: !existingConnection.isActive
  })

  res.json({
    success: true,
    data: connection,
    message: `Database connection ${connection.isActive ? 'activated' : 'deactivated'} successfully`
  })
}))

// POST /api/databases/:id/test - Test database connection
router.post('/:id/test', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const connection = await db.getDatabaseConnection(id)
  if (!connection) {
    throw createError(404, 'Database connection not found', 'DATABASE_CONNECTION_NOT_FOUND')
  }

  const testResult = await db.testDatabaseConnection(id)

  res.json({
    success: true,
    data: testResult,
    message: testResult.isHealthy 
      ? 'Database connection test successful' 
      : 'Database connection test failed'
  })
}))

// DELETE /api/databases/:id - Delete database connection
router.delete('/:id', [
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  // Check if connection is used by any agents
  const agentsUsingConnection = await db.getAgentsUsingDatabaseConnection(id)
  if (agentsUsingConnection.length > 0) {
    throw createError(400, 
      `Cannot delete database connection. It is used by ${agentsUsingConnection.length} agent(s): ${agentsUsingConnection.map((a: any) => a.name).join(', ')}`,
      'DATABASE_CONNECTION_IN_USE'
    )
  }

  await db.prisma.databaseConnection.delete({ where: { id } })

  res.json({
    success: true,
    message: 'Database connection deleted successfully'
  })
}))

export { router as databaseRouter }