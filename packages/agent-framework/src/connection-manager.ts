/**
 * ConnectionManager - Service centralisé pour gérer les connexions aux bases de données sources
 * 
 * Ce service remplace la logique dupliquée dans GoogleSearchDateAgent et FFAScraperAgent
 * pour l'initialisation des connexions aux bases de données externes.
 * 
 * @since 2025-11-05 - Refactoring critique pour éliminer duplication de code
 */

import { AgentLogger } from './types'
import { DatabaseManager, DatabaseConfig } from './database-manager'

export interface SourceConnectionConfig {
  sourceDbId: string
  dbManager: DatabaseManager
  logger: AgentLogger
}

export interface PrismaClientType {
  $connect(): Promise<void>
  $disconnect(): Promise<void>
  $queryRaw: any
  // Index signature pour permettre l'accès aux modèles dynamiquement
  // (Event, edition, race, etc. selon le schéma)
  [key: string]: any
}

/**
 * Service de gestion centralisée des connexions aux bases de données sources
 * pour les agents d'extraction.
 */
export class ConnectionManager {
  private connections = new Map<string, PrismaClientType>()

  /**
   * Établit une connexion à une base de données source et retourne le client Prisma
   * 
   * @param sourceDbId - ID de la base de données source dans la configuration
   * @param dbManager - Instance du DatabaseManager
   * @param logger - Logger pour tracer les opérations
   * @returns Client Prisma connecté
   * @throws Error si la configuration est introuvable ou la connexion échoue
   * 
   * @example
   * ```typescript
   * const connManager = new ConnectionManager()
   * const sourceDb = await connManager.connectToSource(
   *   config.sourceDatabase,
   *   this.dbManager,
   *   this.logger
   * )
   * ```
   */
  async connectToSource(
    sourceDbId: string,
    dbManager: DatabaseManager,
    logger: AgentLogger
  ): Promise<PrismaClientType> {
    try {
      // Vérifier si une connexion existe déjà
      if (this.connections.has(sourceDbId)) {
        logger.debug('Réutilisation de la connexion existante', { sourceDbId })
        return this.connections.get(sourceDbId)!
      }

      // Obtenir la configuration de la base de données
      const dbConfigs = await dbManager.getAvailableDatabases()
      const targetDb = dbConfigs.find(db => db.id === sourceDbId)
      
      if (!targetDb) {
        throw new Error(`Configuration de base de données non trouvée: ${sourceDbId}`)
      }

      logger.info(`🔗 Tentative de connexion: ${targetDb.name}`, {
        type: targetDb.type,
        host: targetDb.host,
        database: targetDb.database
      })

      // Construire l'URL de connexion
      const connectionUrl = this.buildConnectionUrl(targetDb)
      
      logger.debug('URL de connexion construite', {
        url: this.maskCredentials(connectionUrl)
      })

      // Créer le client Prisma avec la configuration appropriée
      const prismaClient = await this.createPrismaClient(connectionUrl, targetDb, logger)

      // Tester la connexion
      await prismaClient.$connect()
      logger.info(`✅ Connexion établie avec succès: ${targetDb.name}`)

      // Stocker la connexion pour réutilisation
      this.connections.set(sourceDbId, prismaClient)

      return prismaClient

    } catch (error) {
      logger.error(`❌ Erreur lors de la connexion à la source: ${sourceDbId}`, {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw error
    }
  }

  /**
   * Construit l'URL de connexion depuis la configuration
   */
  private buildConnectionUrl(config: DatabaseConfig): string {
    // Utiliser l'URL fournie si disponible
    if (config.connectionString) {
      return config.connectionString
    }

    // Sinon, construire l'URL depuis les paramètres
    const protocol = this.getProtocol(config.type)
    const sslParam = config.ssl ? '?ssl=true' : ''
    
    return `${protocol}://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}${sslParam}`
  }

  /**
   * Retourne le protocole approprié selon le type de base de données
   */
  private getProtocol(type: DatabaseConfig['type']): string {
    switch (type) {
      case 'postgresql':
      case 'miles-republic': // Miles Republic utilise PostgreSQL
        return 'postgresql'
      case 'mysql':
        return 'mysql'
      case 'mongodb':
        return 'mongodb'
      default:
        return 'postgresql'
    }
  }

  /**
   * Crée une instance de PrismaClient avec la bonne configuration
   */
  private async createPrismaClient(
    connectionUrl: string,
    config: DatabaseConfig,
    logger: AgentLogger
  ): Promise<PrismaClientType> {
    // Configurer les variables d'environnement pour Prisma
    const originalDatabaseUrl = process.env.DATABASE_URL
    const originalDirectUrl = process.env.DATABASE_DIRECT_URL
    
    process.env.DATABASE_URL = connectionUrl
    process.env.DATABASE_DIRECT_URL = connectionUrl

    try {
      // Pour Miles Republic ou bases avec schéma Prisma spécifique
      if (config.type === 'miles-republic' || config.prismaSchema) {
        logger.info('📚 Utilisation du client Prisma spécialisé')
        return await this.createSpecializedPrismaClient(connectionUrl, logger, config)
      }

      // Sinon, utiliser le client par défaut
      logger.info('📚 Utilisation du client Prisma par défaut')
      const { PrismaClient } = await import('@prisma/client')
      
      return new PrismaClient({
        datasources: {
          db: {
            url: connectionUrl
          }
        },
        log: [] // Désactiver les logs prisma:query en production
      })

    } finally {
      // Restaurer les variables d'environnement originales
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl
      }
      if (originalDirectUrl) {
        process.env.DATABASE_DIRECT_URL = originalDirectUrl
      }
    }
  }

  /**
   * Crée un client Prisma spécialisé (ex: Miles Republic)
   * Le client doit avoir été généré préalablement avec:
   * npx prisma generate --schema=<path-to-schema>
   */
  private async createSpecializedPrismaClient(
    connectionUrl: string,
    logger: AgentLogger,
    config: DatabaseConfig
  ): Promise<PrismaClientType> {
    try {
      logger.debug('Chargement du client Prisma spécialisé', {
        schemaPath: config.prismaSchema,
        type: config.type
      })
      
      // Déterminer le répertoire du schéma Prisma
      const path = await import('path')
      const fs = await import('fs')
      
      // Le schemaPath est relatif à la racine du projet
      const projectRoot = process.cwd()
      const schemaDir = path.dirname(path.join(projectRoot, config.prismaSchema || ''))
      
      // Chemins possibles pour le client généré
      // Miles Republic utilise un nom de client spécifique: client-miles
      const clientDirName = config.type === 'miles-republic' ? 'client-miles' : 'client'
      
      const possiblePaths = [
        // 1. Client au niveau apps/ (apps/node_modules/.prisma/client-miles)
        path.join(projectRoot, 'apps', 'node_modules', '.prisma', clientDirName),
        // 2. Client local au package du schéma (apps/agents/node_modules/.prisma/client-miles)
        path.join(schemaDir, '..', 'node_modules', '.prisma', clientDirName),
        // 3. Client au niveau racine (node_modules/.prisma/client-miles)
        path.join(projectRoot, 'node_modules', '.prisma', clientDirName),
        // 4. Dans le répertoire parent du schéma
        path.join(schemaDir, 'node_modules', '.prisma', clientDirName)
      ]
      
      logger.debug('Recherche du client Prisma dans les chemins possibles', {
        paths: possiblePaths
      })
      
      // Chercher le client dans les chemins possibles
      let clientPath: string | null = null
      for (const testPath of possiblePaths) {
        try {
          const indexPath = path.join(testPath, 'index.js')
          if (fs.existsSync(indexPath)) {
            clientPath = testPath
            logger.debug(`✅ Client Prisma trouvé: ${clientPath}`)
            break
          }
        } catch (err) {
          // Continuer à chercher
        }
      }
      
      if (!clientPath) {
        throw new Error(
          `Client Prisma introuvable pour ${config.name}.\n` +
          `Schéma: ${config.prismaSchema}\n` +
          `Chemins essayés:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}\n\n` +
          `Exécutez: cd ${schemaDir} && npx prisma generate --schema=${path.basename(config.prismaSchema || '')}`
        )
      }
      
      // Charger le client depuis le chemin trouvé
      // IMPORTANT: On doit importer le fichier index.js directement pour éviter
      // que Node.js résolve vers le mauvais client via node_modules
      const indexJsPath = path.join(clientPath, 'index.js')
      logger.debug(`🔍 [DEBUG] Import du client depuis: ${indexJsPath}`)
      
      const clientModule = await import(indexJsPath)
      const { PrismaClient } = clientModule
      
      if (!PrismaClient) {
        throw new Error(`PrismaClient non exporté depuis ${indexJsPath}`)
      }
      
      logger.debug('🔍 [DEBUG] PrismaClient chargé, vérification des modèles...')
      
      const client = new PrismaClient({
        datasources: {
          db: {
            url: connectionUrl
          }
        },
        log: [] // Désactiver les logs Prisma en production
      })
      
      logger.info('✅ Client Prisma spécialisé chargé avec succès', {
        clientPath,
        type: config.type
      })
      
      return client
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('❌ Impossible de charger le client Prisma spécialisé', {
        error: errorMessage,
        schemaPath: config.prismaSchema,
        type: config.type
      })
      
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  /**
   * Masque les credentials dans une URL pour le logging
   */
  private maskCredentials(url: string): string {
    try {
      return url.replace(/\/\/[^@]+@/, '//***:***@')
    } catch {
      return '***'
    }
  }

  /**
   * Ferme une connexion spécifique
   */
  async closeConnection(sourceDbId: string): Promise<void> {
    const connection = this.connections.get(sourceDbId)
    if (connection) {
      try {
        await connection.$disconnect()
        this.connections.delete(sourceDbId)
      } catch (error) {
        // Ignorer les erreurs de déconnexion
      }
    }
  }

  /**
   * Ferme toutes les connexions actives
   */
  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.keys()).map(id =>
      this.closeConnection(id)
    )
    await Promise.all(closePromises)
  }

  /**
   * Teste une connexion sans la stocker
   */
  async testConnection(
    sourceDbId: string,
    dbManager: DatabaseManager,
    logger: AgentLogger
  ): Promise<boolean> {
    let testClient: PrismaClientType | null = null
    
    try {
      const dbConfigs = await dbManager.getAvailableDatabases()
      const targetDb = dbConfigs.find(db => db.id === sourceDbId)
      
      if (!targetDb) {
        return false
      }

      const connectionUrl = this.buildConnectionUrl(targetDb)
      testClient = await this.createPrismaClient(connectionUrl, targetDb, logger)
      
      await testClient.$connect()
      await testClient.$queryRaw`SELECT 1`
      
      return true
    } catch (error) {
      logger.error('Test de connexion échoué', { error: String(error) })
      return false
    } finally {
      if (testClient) {
        try {
          await testClient.$disconnect()
        } catch {
          // Ignorer les erreurs
        }
      }
    }
  }

  /**
   * Retourne le nombre de connexions actives
   */
  getActiveConnectionsCount(): number {
    return this.connections.size
  }

  /**
   * Retourne les IDs des connexions actives
   */
  getActiveConnectionIds(): string[] {
    return Array.from(this.connections.keys())
  }
}
