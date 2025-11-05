/**
 * ConfigLoader - Service de chargement de configurations de bases de données
 * 
 * Extrait du DatabaseManager pour séparer les responsabilités.
 * 
 * @since 2025-11-05 - Refactoring Phase 2
 */

import { AgentLogger } from '../types'
import { DatabaseConfig } from '../database-manager'

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
      const { PrismaClient } = await import('@prisma/client')
      const prisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        }
      })

      await prisma.$connect()
      
      const dbConnections = await prisma.databaseConnection.findMany({
        where: {
          isActive: true
        }
      })

      for (const dbConn of dbConnections) {
        const config: DatabaseConfig = {
          id: dbConn.id,
          name: dbConn.name,
          type: this.mapDatabaseType(dbConn.type),
          host: dbConn.host || 'localhost',
          port: dbConn.port || 5432,
          database: dbConn.database || '',
          username: dbConn.username || '',
          password: dbConn.password || '',
          ssl: dbConn.sslMode !== 'disable',
          isDefault: false,
          isActive: dbConn.isActive,
          description: dbConn.description || undefined,
          connectionString: dbConn.connectionUrl || undefined
        }
        
        configs.push(config)
      }

      await prisma.$disconnect()
      
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
