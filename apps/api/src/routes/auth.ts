import { Router, Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { getAuthService } from '../services/auth.service'
import { requireAuth, requireRole } from '../middleware/auth.middleware'
import { asyncHandler, createError } from '../middleware/error-handler'

const router = Router()

// Validation middleware
const validateRequest = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw createError(400, 'Validation failed', 'VALIDATION_ERROR', { errors: errors.array() })
  }
  next()
}

/**
 * POST /api/auth/login
 * Authentifie un utilisateur et retourne un JWT token
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body

  try {
    const authService = getAuthService()
    const result = await authService.login(email, password)

    res.json({
      success: true,
      data: result,
      message: 'Login successful'
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'Invalid credentials') {
      throw createError(401, 'Invalid email or password', 'INVALID_CREDENTIALS')
    }
    if (message === 'User account is disabled') {
      throw createError(403, 'Your account has been disabled', 'ACCOUNT_DISABLED')
    }
    throw error
  }
}))

/**
 * GET /api/auth/me
 * Retourne les informations de l'utilisateur connecté
 */
router.get('/me', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw createError(401, 'Not authenticated', 'NOT_AUTHENTICATED')
  }

  const authService = getAuthService()
  const user = await authService.getUserById(req.user.userId)

  res.json({
    success: true,
    data: user
  })
}))

/**
 * PUT /api/auth/password
 * Change le mot de passe de l'utilisateur connecté
 */
router.put('/password', [
  requireAuth,
  body('oldPassword').isString().notEmpty(),
  body('newPassword').isString().isLength({ min: 8 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw createError(401, 'Not authenticated', 'NOT_AUTHENTICATED')
  }

  const { oldPassword, newPassword } = req.body

  try {
    const authService = getAuthService()
    await authService.changePassword(req.user.userId, oldPassword, newPassword)

    res.json({
      success: true,
      message: 'Password changed successfully'
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'Current password is incorrect') {
      throw createError(400, message, 'INCORRECT_PASSWORD')
    }
    throw error
  }
}))

/**
 * GET /api/auth/users
 * Liste tous les utilisateurs (ADMIN only)
 */
router.get('/users', requireAuth, requireRole('ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const authService = getAuthService()
  const users = await authService.listUsers()

  res.json({
    success: true,
    data: users
  })
}))

/**
 * POST /api/auth/users
 * Crée un nouvel utilisateur (ADMIN only)
 */
router.post('/users', [
  requireAuth,
  requireRole('ADMIN'),
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 8 }),
  body('firstName').isString().notEmpty(),
  body('lastName').isString().notEmpty(),
  body('role').isIn(['ADMIN', 'VALIDATOR', 'EXECUTOR']),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw createError(401, 'Not authenticated', 'NOT_AUTHENTICATED')
  }

  const { email, password, firstName, lastName, role } = req.body

  try {
    const authService = getAuthService()
    const user = await authService.createUser({
      email,
      password,
      firstName,
      lastName,
      role,
      createdBy: req.user.userId
    })

    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully'
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'User with this email already exists') {
      throw createError(409, message, 'USER_EXISTS')
    }
    throw error
  }
}))

/**
 * GET /api/auth/users/:id
 * Récupère un utilisateur par ID (ADMIN only)
 */
router.get('/users/:id', [
  requireAuth,
  requireRole('ADMIN'),
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const authService = getAuthService()
  const user = await authService.getUserById(req.params.id)

  res.json({
    success: true,
    data: user
  })
}))

/**
 * PUT /api/auth/users/:id
 * Met à jour un utilisateur (ADMIN only)
 */
router.put('/users/:id', [
  requireAuth,
  requireRole('ADMIN'),
  param('id').isString().notEmpty(),
  body('firstName').optional().isString().notEmpty(),
  body('lastName').optional().isString().notEmpty(),
  body('role').optional().isIn(['ADMIN', 'VALIDATOR', 'EXECUTOR']),
  body('isActive').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { firstName, lastName, role, isActive } = req.body

  const authService = getAuthService()
  const user = await authService.updateUser(id, {
    firstName,
    lastName,
    role,
    isActive
  })

  res.json({
    success: true,
    data: user,
    message: 'User updated successfully'
  })
}))

/**
 * POST /api/auth/users/:id/reset-password
 * Réinitialise le mot de passe d'un utilisateur (ADMIN only)
 */
router.post('/users/:id/reset-password', [
  requireAuth,
  requireRole('ADMIN'),
  param('id').isString().notEmpty(),
  body('newPassword').isString().isLength({ min: 8 }),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { newPassword } = req.body

  const authService = getAuthService()
  await authService.resetPassword(id, newPassword)

  res.json({
    success: true,
    message: 'Password reset successfully'
  })
}))

/**
 * DELETE /api/auth/users/:id
 * Supprime un utilisateur (ADMIN only)
 * Vérifie qu'il reste au moins un admin actif
 */
router.delete('/users/:id', [
  requireAuth,
  requireRole('ADMIN'),
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  if (!req.user) {
    throw createError(401, 'Not authenticated', 'NOT_AUTHENTICATED')
  }

  try {
    const authService = getAuthService()
    await authService.deleteUser(id, req.user.userId)

    res.json({
      success: true,
      message: 'User deleted successfully'
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'Cannot delete your own account') {
      throw createError(400, message, 'SELF_DELETE')
    }
    if (message === 'Cannot delete the last active admin') {
      throw createError(400, message, 'LAST_ADMIN')
    }
    if (message === 'User not found') {
      throw createError(404, message, 'USER_NOT_FOUND')
    }
    throw error
  }
}))

export default router
