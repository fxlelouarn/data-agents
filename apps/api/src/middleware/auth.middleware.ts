import { Request, Response, NextFunction } from 'express'
import { getAuthService } from '../services/auth.service'
import { createError } from './error-handler'

// Extension de l'interface Request pour ajouter le user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        email: string
        role: string
      }
    }
  }
}

/**
 * Middleware d'authentification - vérifie le token JWT
 */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError(401, 'Authentication token required', 'MISSING_TOKEN')
    }

    const token = authHeader.substring(7) // Retire "Bearer "

    try {
      const authService = getAuthService()
      const payload = authService.verifyToken(token)
      
      // Vérifier que l'utilisateur existe toujours et est actif
      const user = await authService.getUserById(payload.userId)
      
      if (!user.isActive) {
        throw createError(403, 'User account is disabled', 'USER_DISABLED')
      }

      // Attacher les infos user à la requête
      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role
      }

      next()
    } catch (error) {
      if ((error as any).name === 'TokenExpiredError') {
        throw createError(401, 'Token expired', 'TOKEN_EXPIRED')
      }
      if ((error as any).name === 'JsonWebTokenError') {
        throw createError(401, 'Invalid token', 'INVALID_TOKEN')
      }
      throw error
    }
  } catch (error) {
    next(error)
  }
}

/**
 * Middleware d'autorisation - vérifie que l'utilisateur a le rôle requis
 * 
 * @param allowedRoles - Liste des rôles autorisés
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError(401, 'Authentication required', 'MISSING_AUTH'))
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(createError(403, `Access forbidden. Required role: ${allowedRoles.join(' or ')}`, 'INSUFFICIENT_PERMISSIONS'))
    }

    next()
  }
}

/**
 * Middleware optionnel - attache l'utilisateur s'il est authentifié, mais ne bloque pas si non authentifié
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next()
    }

    const token = authHeader.substring(7)

    try {
      const authService = getAuthService()
      const payload = authService.verifyToken(token)
      req.user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role
      }
    } catch (error) {
      // Token invalide ou expiré, mais on continue sans bloquer
      console.warn('Optional auth: Invalid token ignored', error)
    }

    next()
  } catch (error) {
    next(error)
  }
}
