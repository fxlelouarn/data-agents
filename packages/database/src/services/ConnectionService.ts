import { PrismaClient, DatabaseConnection } from '@prisma/client'
import { IConnectionService, ConnectionTestResult } from './interfaces'

export class ConnectionService implements IConnectionService {
  constructor(private prisma: PrismaClient) {}

  async getConnections(includeInactive: boolean = false): Promise<Omit<DatabaseConnection, 'password'>[]> {
    const connections = await this.prisma.databaseConnection.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isActive: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        lastTestedAt: true,
        isHealthy: true,
        host: true,
        port: true,
        database: true,
        username: true,
        sslMode: true,
        timeout: true,
        maxConnections: true,
        connectionUrl: true
      }
    })
    return connections
  }

  async getConnection(id: string): Promise<Omit<DatabaseConnection, 'password'> | null> {
    return this.prisma.databaseConnection.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isActive: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        lastTestedAt: true,
        isHealthy: true,
        host: true,
        port: true,
        database: true,
        username: true,
        sslMode: true,
        timeout: true,
        maxConnections: true,
        connectionUrl: true
      }
    })
  }

  async createConnection(data: {
    name: string
    description?: string
    type: string
    host?: string
    port?: number
    database?: string
    username?: string
    password?: string
    connectionUrl?: string
    sslMode?: string
    timeout?: number
    maxConnections?: number
    tags?: string[]
  }): Promise<Omit<DatabaseConnection, 'password'>> {
    const result = await this.prisma.databaseConnection.create({
      data: {
        ...data,
        type: data.type as any
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isActive: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        lastTestedAt: true,
        isHealthy: true,
        host: true,
        port: true,
        database: true,
        username: true,
        sslMode: true,
        timeout: true,
        maxConnections: true,
        connectionUrl: true
      }
    })
    return result
  }

  async updateConnection(id: string, data: Partial<{
    name: string
    description: string
    type: string
    isActive: boolean
    host: string
    port: number
    database: string
    username: string
    password: string
    connectionUrl: string
    sslMode: string
    timeout: number
    maxConnections: number
    tags: string[]
  }>): Promise<Omit<DatabaseConnection, 'password'>> {
    const result = await this.prisma.databaseConnection.update({
      where: { id },
      data: {
        ...data,
        type: data.type as any
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isActive: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        lastTestedAt: true,
        isHealthy: true,
        host: true,
        port: true,
        database: true,
        username: true,
        sslMode: true,
        timeout: true,
        maxConnections: true,
        connectionUrl: true
      }
    })
    return result
  }

  async deleteConnection(id: string): Promise<void> {
    await this.prisma.databaseConnection.delete({
      where: { id }
    })
  }

  async testConnection(id: string): Promise<ConnectionTestResult> {
    const connection = await this.prisma.databaseConnection.findUnique({
      where: { id }
    })
    
    if (!connection) {
      throw new Error('Database connection not found')
    }

    let isHealthy = false
    let error: string | null = null
    let responseTime = 0
    
    const startTime = Date.now()
    
    try {
      // Simple connection test based on type
      switch (connection.type) {
        case 'MILES_REPUBLIC':
          // Test connection to Miles Republic API or database
          if (connection.connectionUrl) {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), connection.timeout || 30000)
            
            try {
              const response = await fetch(connection.connectionUrl, {
                method: 'HEAD',
                signal: controller.signal
              })
              isHealthy = response.ok
            } finally {
              clearTimeout(timeoutId)
            }
          } else {
            // For now, just mark as healthy if URL is not provided
            isHealthy = true
          }
          break
          
        case 'EXTERNAL_API':
          if (connection.connectionUrl) {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), connection.timeout || 30000)
            
            try {
              const response = await fetch(connection.connectionUrl, {
                method: 'HEAD',
                signal: controller.signal
              })
              isHealthy = response.ok
            } finally {
              clearTimeout(timeoutId)
            }
          }
          break
          
        case 'POSTGRESQL':
        case 'MYSQL':
        case 'SQLITE':
        case 'MONGODB':
        default:
          // For database connections, we would need specific drivers
          // For now, mark as healthy if we have connection info (either individual fields or connection URL)
          const hasIndividualFields = !!(connection.host && connection.database)
          const hasConnectionUrl = !!(connection.connectionUrl)
          isHealthy = hasIndividualFields || hasConnectionUrl
          break
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error'
      isHealthy = false
    }
    
    responseTime = Date.now() - startTime
    
    // Update the connection health status
    await this.prisma.databaseConnection.update({
      where: { id },
      data: {
        isHealthy,
        lastTestedAt: new Date()
      }
    })
    
    return {
      isHealthy,
      responseTime,
      error,
      testedAt: new Date()
    }
  }

  async getAgentsUsingConnection(connectionId: string): Promise<Array<{
    id: string
    name: string
    config: any
  }>> {
    // Search for agents that have this connection ID in their config
    const agents = await this.prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        config: true
      }
    })
    
    // Filter agents that use this database connection
    return agents.filter(agent => {
      const config = agent.config as any
      return config?.sourceDatabase === connectionId ||
             config?.databaseId === connectionId ||
             config?.database === connectionId
    })
  }
}