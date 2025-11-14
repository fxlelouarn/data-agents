import { AgentLogger } from '../types'
import { DatabaseConfig } from '../database-manager'

/**
 * Interface pour les stratégies de connexion à différents types de bases de données
 */
export interface DatabaseStrategy {
  /**
   * Créer une connexion Prisma pour le type de base de données
   */
  createConnection(config: DatabaseConfig, logger: AgentLogger): Promise<any>
  
  /**
   * Tester la connexion
   */
  testConnection(connection: any): Promise<boolean>
  
  /**
   * Fermer la connexion
   */
  closeConnection(connection: any): Promise<void>
}

/**
 * Utilitaires partagés pour construire les URLs de connexion
 */
export class ConnectionUrlBuilder {
  static build(config: DatabaseConfig): string {
    if (config.connectionString) {
      return config.connectionString
    }

    const protocol = config.type === 'postgresql' ? 'postgresql' : 'mysql'
    const sslParam = config.ssl ? '?ssl=true' : ''
    return `${protocol}://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}${sslParam}`
  }
}

/**
 * Stratégie pour PostgreSQL
 */
export class PostgresStrategy implements DatabaseStrategy {
  async createConnection(config: DatabaseConfig, logger: AgentLogger): Promise<any> {
    const { PrismaClient } = await import('@prisma/client')
    const connectionUrl = ConnectionUrlBuilder.build(config)

    logger.debug(`Création connexion PostgreSQL: ${config.name}`)

    const client = new PrismaClient({
      datasources: {
        db: { url: connectionUrl }
      }
    })

    await client.$connect()
    return client
  }

  async testConnection(connection: any): Promise<boolean> {
    try {
      await connection.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }

  async closeConnection(connection: any): Promise<void> {
    await connection.$disconnect()
  }
}

/**
 * Stratégie pour MySQL
 */
export class MySQLStrategy implements DatabaseStrategy {
  async createConnection(config: DatabaseConfig, logger: AgentLogger): Promise<any> {
    const { PrismaClient } = await import('@prisma/client')
    const connectionUrl = ConnectionUrlBuilder.build(config)

    logger.debug(`Création connexion MySQL: ${config.name}`)

    const client = new PrismaClient({
      datasources: {
        db: { url: connectionUrl }
      }
    })

    await client.$connect()
    return client
  }

  async testConnection(connection: any): Promise<boolean> {
    try {
      await connection.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }

  async closeConnection(connection: any): Promise<void> {
    await connection.$disconnect()
  }
}

/**
 * Stratégie pour MongoDB
 */
export class MongoDBStrategy implements DatabaseStrategy {
  async createConnection(config: DatabaseConfig, logger: AgentLogger): Promise<any> {
    const { PrismaClient } = await import('@prisma/client')
    const connectionUrl = ConnectionUrlBuilder.build(config)

    logger.debug(`Création connexion MongoDB: ${config.name}`)

    const client = new PrismaClient({
      datasources: {
        db: { url: connectionUrl }
      }
    })

    await client.$connect()
    return client
  }

  async testConnection(connection: any): Promise<boolean> {
    try {
      // MongoDB uses different query syntax
      await connection.$runCommandRaw({ ping: 1 })
      return true
    } catch {
      return false
    }
  }

  async closeConnection(connection: any): Promise<void> {
    await connection.$disconnect()
  }
}

/**
 * Stratégie pour Miles Republic (avec schéma Prisma personnalisé)
 */
export class MilesRepublicStrategy implements DatabaseStrategy {
  async createConnection(config: DatabaseConfig, logger: AgentLogger): Promise<any> {
    const connectionUrl = ConnectionUrlBuilder.build(config)

    if (config.prismaSchema) {
      return this.createConnectionWithCustomSchema(config, connectionUrl, logger)
    }

    // Fallback: client par défaut Miles Republic
    return this.createDefaultMilesConnection(connectionUrl, logger)
  }

  private async createConnectionWithCustomSchema(
    config: DatabaseConfig,
    connectionUrl: string,
    logger: AgentLogger
  ): Promise<any> {
    const path = require('path')
    const fs = require('fs')
    const { execSync } = require('child_process')

    const projectRoot = path.resolve(__dirname, '../../../..')
    const schemaPath = path.resolve(projectRoot, config.prismaSchema!)

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema Prisma introuvable: ${schemaPath}`)
    }

    logger.info(`Utilisation du schéma Prisma personnalisé: ${config.prismaSchema}`)

    // ✅ Vérifier si le client existe déjà avant de re-générer
    const clientExists = fs.existsSync(path.join(projectRoot, 'apps', 'node_modules', '.prisma', 'client-miles', 'index.js')) ||
                         fs.existsSync(path.join(projectRoot, 'node_modules', '.prisma', 'client-miles', 'index.js'))

    if (!clientExists) {
      // Générer le client Prisma UNIQUEMENT s'il n'existe pas
      logger.debug('Client Prisma non trouvé, génération en cours...')
      const envVars = `DATABASE_URL="${connectionUrl}"`
      const generateCmd = `${envVars} npx prisma generate --schema="${schemaPath}" --generator=client`

      try {
        execSync(generateCmd, {
          cwd: projectRoot,
          stdio: 'pipe',
          env: { ...process.env, DATABASE_URL: connectionUrl }
        })
      } catch (genError: any) {
        if (!genError.message.includes('already up to date')) {
          logger.warn(`Génération Prisma (warning ignoré): ${genError.message}`)
        }
      }
    } else {
      logger.debug('Client Prisma déjà généré, utilisation directe')
    }

    // Charger le client généré
    const PrismaClient = await this.loadGeneratedClient(schemaPath, projectRoot, logger)

    const client = new PrismaClient({
      datasources: {
        db: { url: connectionUrl }
      }
    })

    await client.$connect()
    return client
  }

  private async loadGeneratedClient(
    schemaPath: string,
    projectRoot: string,
    logger: AgentLogger
  ): Promise<any> {
    const path = require('path')
    const fs = require('fs')

    const schemaDir = path.dirname(schemaPath)
    // Miles Republic utilise client-miles, pas client
    const possiblePaths = [
      path.join(projectRoot, 'apps', 'node_modules', '.prisma', 'client-miles'),
      path.join(schemaDir, '..', 'node_modules', '.prisma', 'client-miles'),
      path.join(projectRoot, 'node_modules', '.prisma', 'client-miles'),
      path.join(schemaDir, 'node_modules', '.prisma', 'client-miles')
    ]

    for (const tryPath of possiblePaths) {
      try {
        if (fs.existsSync(path.join(tryPath, 'index.js'))) {
          // Use require instead of dynamic import for reliability
          const clientModule = require(tryPath)
          logger.info(`Client Prisma chargé depuis: ${tryPath}`)
          return clientModule.PrismaClient
        }
      } catch {
        continue
      }
    }

    throw new Error(
      `Client Prisma introuvable après génération. Chemins testés: ${possiblePaths.join(', ')}`
    )
  }

  private async createDefaultMilesConnection(connectionUrl: string, logger: AgentLogger): Promise<any> {
    try {
      const path = require('path')
      const fs = require('fs')
      // Client Miles Republic est dans apps/node_modules/.prisma/client-miles
      const projectRoot = path.resolve(__dirname, '../../../..')
      const possiblePaths = [
        path.join(projectRoot, 'apps', 'node_modules', '.prisma', 'client-miles'),
        path.join(projectRoot, 'node_modules', '.prisma', 'client-miles')
      ]

      let clientPath: string | null = null
      for (const tryPath of possiblePaths) {
        if (fs.existsSync(path.join(tryPath, 'index.js'))) {
          clientPath = tryPath
          break
        }
      }

      if (!clientPath) {
        throw new Error(`Client Prisma Miles Republic non trouvé dans: ${possiblePaths.join(', ')}`)
      }

      // Use require instead of dynamic import for reliability
      const milesClient = require(clientPath)

      logger.info(`Utilisation du client Prisma Miles Republic depuis: ${clientPath}`)

      const client = new milesClient.PrismaClient({
        datasources: {
          db: { url: connectionUrl }
        }
      })

      await client.$connect()
      return client
    } catch (error) {
      logger.error('Client Prisma Miles Republic introuvable', { error: String(error) })
      throw new Error(
        'Client Prisma Miles Republic non généré. Exécutez: cd apps/agents && npx prisma generate --schema=prisma/miles-republic.prisma'
      )
    }
  }

  async testConnection(connection: any): Promise<boolean> {
    try {
      await connection.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }

  async closeConnection(connection: any): Promise<void> {
    await connection.$disconnect()
  }
}
