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
        connectionUrl: true,
        prismaSchema: true
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
        connectionUrl: true,
        prismaSchema: true
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
        connectionUrl: true,
        prismaSchema: true
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
        connectionUrl: true,
        prismaSchema: true
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
    console.log(`[ConnectionService] Testing connection ${id}`)
    const connection = await this.prisma.databaseConnection.findUnique({
      where: { id }
    })
    
    if (!connection) {
      throw new Error('Database connection not found')
    }

    console.log(`[ConnectionService] Connection found:`, {
      name: connection.name,
      type: connection.type,
      hasConnectionUrl: !!connection.connectionUrl,
      hasHost: !!connection.host,
      hasDatabase: !!connection.database
    })

    let isHealthy = false
    let error: string | null = null
    let responseTime = 0
    
    const startTime = Date.now()
    
    try {
      // Simple connection test based on type
      switch (connection.type) {
        case 'MILES_REPUBLIC':
        case 'POSTGRESQL':
          // Pour les connexions PostgreSQL, on doit utiliser le DatabaseManager pour tester
          console.log(`[ConnectionService] Testing PostgreSQL/Miles Republic connection`)
          if (connection.connectionUrl || (connection.host && connection.database)) {
            try {
              console.log(`[ConnectionService] Importing DatabaseManager...`)
              // Import dynamique pour éviter les dépendances circulaires
              // @ts-ignore - Lazy loading au runtime pour éviter cycle database <-> agent-framework
              const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
              const logger = createConsoleLogger('ConnectionService', 'test-connection')
              const dbManager = DatabaseManager.getInstance(logger)
              console.log(`[ConnectionService] DatabaseManager loaded, attempting connection...`)
              
              // Essayer de se connecter avec un timeout
              const testConnection = await Promise.race([
                dbManager.getConnection(connection.id),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Connection timeout')), connection.timeout || 30000)
                )
              ])
              
              // Si on arrive ici, la connexion a réussi
              console.log(`[ConnectionService] Connection successful!`)
              isHealthy = true
              
              // Nettoyer la connexion de test (optionnel selon implémentation DatabaseManager)
              // dbManager.disconnect(connection.id)
            } catch (testError) {
              console.error(`[ConnectionService] Connection test failed:`, testError)
              error = testError instanceof Error ? testError.message : 'Connection failed'
              isHealthy = false
            }
          } else {
            console.log(`[ConnectionService] Missing connection information`)
            error = 'Missing connection information'
            isHealthy = false
          }
          break
          
        default:
          // Pour les autres types, vérifier simplement que les infos sont présentes
          const hasIndividualFields = !!(connection.host && connection.database)
          const hasConnectionUrl = !!(connection.connectionUrl)
          isHealthy = hasIndividualFields || hasConnectionUrl
          if (!isHealthy) {
            error = 'Missing connection information'
          }
          break
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error'
      isHealthy = false
    }
    
    responseTime = Date.now() - startTime
    
    console.log(`[ConnectionService] Test result:`, { isHealthy, responseTime, error })
    
    // Update the connection health status
    await this.prisma.databaseConnection.update({
      where: { id },
      data: {
        isHealthy,
        lastTestedAt: new Date()
      }
    })
    
    const result = {
      isHealthy,
      responseTime,
      error,
      testedAt: new Date()
    }
    
    console.log(`[ConnectionService] Returning result:`, result)
    return result
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