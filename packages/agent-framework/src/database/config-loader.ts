/**
 * ConfigLoader - Service de chargement de configurations de bases de données
 * 
 * Extrait du DatabaseManager pour séparer les responsabilités.
 * 
 * @since 2025-11-05 - Refactoring Phase 2
 */

import { AgentLogger } from '../types'
import { DatabaseConfig } from '../database-manager'
import type { DatabaseConnection } from '@data-agents/database'

/**
 * Charge les configurations de bases de données depuis Prisma
 */
export class ConfigLoader {
  constructor(private logger: AgentLogger) {}

  /**
   * Charge les configurations depuis la table database_connections
   */
  async loadFromDatabase(): Promise<DatabaseConfig[]> {
    const configs: DatabaseConfig[] = []

    try {
      // Use the shared Prisma instance from @data-agents/database
      const { prisma } = await import('@data-agents/database')
      
      // No need to connect, it's already connected
      
      const dbConnections = await prisma.databaseConnection.findMany({
        where: {
          isActive: true
        }
      })

      for (const dbConn of dbConnections) {
        // Cast to any to access prismaSchema field (TypeScript inference issue with dynamic import)
        const conn = dbConn as any
        const config: DatabaseConfig = {
          id: conn.id,
          name: conn.name,
          type: this.mapDatabaseType(conn.type),
          host: conn.host || 'localhost',
          port: conn.port || 5432,
          database: conn.database || '',
          username: conn.username || '',
          password: conn.password || '',
          ssl: conn.sslMode !== 'disable',
          isDefault: false,
          isActive: conn.isActive,
          description: conn.description || undefined,
          connectionString: conn.connectionUrl || undefined,
          prismaSchema: conn.prismaSchema || undefined
        }
        
        configs.push(config)
      }
      
      // No need to disconnect, prisma instance is managed by @data-agents/database
      
      this.logger.info(`${dbConnections.length} configurations chargées depuis la BD`)

    } catch (error) {
      this.logger.warn(
        'Impossible de charger les configurations depuis la BD',
        { error: String(error) }
      )
    }

    return configs
  }

  /**
   * Mapper les types de base de données depuis le schéma Prisma
   */
  private mapDatabaseType(prismaType: any): DatabaseConfig['type'] {
    switch (prismaType) {
      case 'POSTGRESQL':
        return 'postgresql'
      case 'MYSQL':
        return 'mysql'
      case 'MONGODB':
        return 'mongodb'
      case 'MILES_REPUBLIC':
        return 'miles-republic'
      case 'EXTERNAL_API':
        return 'postgresql' // Fallback
      case 'SQLITE':
        return 'postgresql' // Fallback
      default:
        return 'postgresql'
    }
  }

}
