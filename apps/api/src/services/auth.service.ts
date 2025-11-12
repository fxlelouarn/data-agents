import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const JWT_SECRET = process.env.JWT_SECRET || 'data-agents-dev-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
const SALT_ROUNDS = 10

export interface JWTPayload {
  userId: string
  email: string
  role: string
}

export interface AuthResult {
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    isActive: boolean
  }
  token: string
}

export class AuthService {
  constructor(private db: PrismaClient) {}

  private get client() {
    return this.db
  }

  /**
   * Hash un mot de passe avec bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS)
  }

  /**
   * Vérifie un mot de passe contre un hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  /**
   * Génère un JWT token
   */
  generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions) as string
  }

  /**
   * Vérifie et décode un JWT token
   */
  verifyToken(token: string): JWTPayload {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  }

  /**
   * Authentifie un utilisateur avec email et mot de passe
   */
  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.client.user.findUnique({
      where: { email }
    })

    if (!user) {
      throw new Error('Invalid credentials')
    }

    if (!user.isActive) {
      throw new Error('User account is disabled')
    }

    const isPasswordValid = await this.verifyPassword(password, user.passwordHash)
    if (!isPasswordValid) {
      throw new Error('Invalid credentials')
    }

    // Mettre à jour lastLoginAt
    await this.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    })

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive
      },
      token
    }
  }

  /**
   * Crée un nouvel utilisateur (admin only)
   */
  async createUser(data: {
    email: string
    password: string
    firstName: string
    lastName: string
    role: string
    createdBy: string
  }): Promise<AuthResult['user']> {
    const existingUser = await this.client.user.findUnique({
      where: { email: data.email }
    })

    if (existingUser) {
      throw new Error('User with this email already exists')
    }

    const passwordHash = await this.hashPassword(data.password)

    const user = await this.client.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as any,
        createdBy: data.createdBy
      }
    })

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive
    }
  }

  /**
   * Récupère un utilisateur par ID
   */
  async getUserById(userId: string) {
    const user = await this.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true
      }
    })

    if (!user) {
      throw new Error('User not found')
    }

    return user
  }

  /**
   * Liste tous les utilisateurs (admin only)
   */
  async listUsers() {
    return this.client.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * Met à jour un utilisateur (admin only)
   */
  async updateUser(userId: string, data: {
    firstName?: string
    lastName?: string
    role?: string
    isActive?: boolean
  }) {
    return this.client.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as any,
        isActive: data.isActive
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true
      }
    })
  }

  /**
   * Change le mot de passe d'un utilisateur
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.client.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new Error('User not found')
    }

    const isOldPasswordValid = await this.verifyPassword(oldPassword, user.passwordHash)
    if (!isOldPasswordValid) {
      throw new Error('Current password is incorrect')
    }

    const newPasswordHash = await this.hashPassword(newPassword)

    await this.client.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash }
    })
  }

  /**
   * Réinitialise le mot de passe d'un utilisateur (admin only)
   */
  async resetPassword(userId: string, newPassword: string) {
    const newPasswordHash = await this.hashPassword(newPassword)

    await this.client.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash }
    })
  }

  /**
   * Supprime un utilisateur (admin only)
   * Vérifie qu'il reste au moins un admin actif et qu'on ne se supprime pas soi-même
   */
  async deleteUser(userId: string, currentUserId: string) {
    // Empêcher l'auto-suppression
    if (userId === currentUserId) {
      throw new Error('Cannot delete your own account')
    }

    const user = await this.client.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Si l'utilisateur est admin, vérifier qu'il reste au moins un autre admin actif
    if (user.role === 'ADMIN') {
      const activeAdmins = await this.client.user.count({
        where: {
          role: 'ADMIN',
          isActive: true,
          id: { not: userId }
        }
      })

      if (activeAdmins === 0) {
        throw new Error('Cannot delete the last active admin')
      }
    }

    await this.client.user.delete({
      where: { id: userId }
    })
  }
}

// Singleton instance
let authServiceInstance: AuthService | null = null

/**
 * Get singleton AuthService instance with fresh Prisma client
 * Lazy loads prisma to ensure it's loaded after client regeneration
 */
export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    // Create a fresh PrismaClient instance to get the latest generated client
    const { PrismaClient } = require('@prisma/client')
    const freshPrisma = new PrismaClient({
      log: [], // Disable logs
    })
    
    authServiceInstance = new AuthService(freshPrisma)
    console.log('🔐 AuthService initialized with fresh Prisma client')
    console.log('📊 Prisma user model:', typeof freshPrisma.user)
  }
  return authServiceInstance
}
