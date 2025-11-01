import { AgentLogger } from './types'

export interface DatabaseConfig {
  id: string
  name: string
  type: 'postgresql' | 'mysql' | 'mongodb' | 'miles-republic'
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl: boolean
  isDefault: boolean
  isActive: boolean
  description?: string
  connectionString?: string // URL de connexion complète si fournie
  prismaSchema?: string // Chemin relatif vers le schéma Prisma à utiliser
}

export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private connections = new Map<string, any>()
  private configs = new Map<string, DatabaseConfig>()
  private logger: AgentLogger
  private configsLoaded = false
  private loadPromise: Promise<void> | null = null

  private constructor(logger: AgentLogger) {
    this.logger = logger
    // Ne pas attendre ici, mais charger dès la première utilisation
  }
  
  /**
   * Obtenir l'instance singleton de DatabaseManager
   */
  static getInstance(logger: AgentLogger): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(logger)
    }
    // Mettre à jour le logger si nécessaire
    DatabaseManager.instance.logger = logger
    return DatabaseManager.instance
  }
  
  /**
   * Réinitialiser l'instance (pour les tests)
   */
  static resetInstance(): void {
    DatabaseManager.instance = null
  }

  private async loadConfigurations() {
    // Si déjà en cours de chargement, attendre la fin
    if (this.loadPromise) {
      await this.loadPromise
      return
    }
    
    // Si déjà chargé, ne pas recharger
    if (this.configsLoaded) {
      return
    }
    
    this.loadPromise = this.doLoadConfigurations()
    await this.loadPromise
    this.loadPromise = null
  }
  
  private async doLoadConfigurations() {
    try {
      // Si des configurations de test ont déjà été ajoutées, ne pas charger depuis la BD
      if (this.configs.size > 0) {
        this.logger.info(`Utilisation des configurations existantes (${this.configs.size} config(s) - mode test)`)
        this.configsLoaded = true
        return
      }
      
      // Charger uniquement les configurations depuis la base de données
      await this.loadDatabaseConfigurations()
      this.configsLoaded = true

      this.logger.info(`Configurations de bases de données chargées: ${this.configs.size}`)
    } catch (error) {
      this.logger.error('Erreur lors du chargement des configurations DB', { error: String(error) })
    }
  }

  /**
   * Mapper les types de base de données depuis le schéma Prisma
   */
  private mapDatabaseType(prismaType: any): 'postgresql' | 'mysql' | 'mongodb' | 'miles-republic' {
    switch (prismaType) {
      case 'POSTGRESQL': return 'postgresql'
      case 'MYSQL': return 'mysql'
      case 'MONGODB': return 'mongodb'
      case 'MILES_REPUBLIC': return 'miles-republic'
      case 'EXTERNAL_API': return 'postgresql' // Fallback
      case 'SQLITE': return 'postgresql' // Fallback
      default: return 'postgresql'
    }
  }

  /**
   * Charger les configurations depuis la table database_connections
   */
  private async loadDatabaseConfigurations() {
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
          isDefault: false, // Pas de champ isDefault dans le schéma
          isActive: dbConn.isActive,
          description: dbConn.description || undefined,
          connectionString: dbConn.connectionUrl || undefined
        }
        
        this.configs.set(config.id, config)
      }

      await prisma.$disconnect()
      
      this.logger.info(`${dbConnections.length} configurations de base chargées depuis la BD`)

    } catch (error) {
      this.logger.warn('Impossible de charger les configurations depuis la BD, utilisation des configs par défaut uniquement', { error: String(error) })
    }
  }

  /**
   * Obtenir une connexion à une base de données par son ID
   */
  async getConnection(databaseId: string): Promise<any> {
    try {
      // S'assurer que les configurations sont chargées
      await this.loadConfigurations()

      // Vérifier si la connexion existe déjà
      if (this.connections.has(databaseId)) {
        return this.connections.get(databaseId)
      }

      const config = this.configs.get(databaseId)
      if (!config) {
        throw new Error(`Configuration de base de données non trouvée: ${databaseId}`)
      }

      if (!config.isActive) {
        throw new Error(`Base de données inactive: ${config.name}`)
      }

      // Créer une nouvelle connexion
      const connection = await this.createConnection(config)
      this.connections.set(databaseId, connection)

      this.logger.info(`Connexion établie à la base de données: ${config.name}`)
      return connection

    } catch (error) {
      this.logger.error(`Erreur de connexion à la base ${databaseId}`, { error: String(error) })
      throw error
    }
  }

  /**
   * Créer une connexion selon le type de base de données
   */
  private async createConnection(config: DatabaseConfig): Promise<any> {
    try {
      let connectionUrl: string

      if (config.connectionString) {
        // Utiliser l'URL de connexion fournie
        connectionUrl = config.connectionString
      } else {
        // Construire l'URL à partir des paramètres
        const protocol = config.type === 'postgresql' ? 'postgresql' : 'mysql'
        const sslParam = config.ssl ? '?ssl=true' : ''
        connectionUrl = `${protocol}://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}${sslParam}`
      }

      // Use the correct Prisma client based on database type and schema
      let PrismaClient
      
      if (config.prismaSchema) {
        // Si un schéma Prisma est spécifié, on doit le générer et l'utiliser
        try {
          const path = require('path')
          const fs = require('fs')
          const { execSync } = require('child_process')
          
          // Résoudre le chemin absolu du schéma depuis la racine du projet
          const projectRoot = path.resolve(__dirname, '../../..')
          const schemaPath = path.resolve(projectRoot, config.prismaSchema)
          
          if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema Prisma introuvable: ${schemaPath}`)
          }
          
          this.logger.info(`Utilisation du schéma Prisma: ${config.prismaSchema}`)
          
          // Créer un répertoire temporaire pour le client généré
          const outputDir = path.join(projectRoot, 'node_modules', '.prisma', `client-${config.id}`)
          
          // Générer le client Prisma pour ce schéma spécifique
          const envVars = `DATABASE_URL="${connectionUrl}"`
          const generateCmd = `${envVars} npx prisma generate --schema="${schemaPath}" --generator=client`
          
          this.logger.debug(`Génération du client Prisma: ${generateCmd}`)
          
          // Exécuter la génération (si pas déjà fait)
          try {
            execSync(generateCmd, { 
              cwd: projectRoot,
              stdio: 'pipe',
              env: { ...process.env, DATABASE_URL: connectionUrl }
            })
          } catch (genError: any) {
            // Si l'erreur est juste un warning, continuer
            if (!genError.message.includes('already up to date')) {
              this.logger.warn(`Erreur lors de la génération du client Prisma (continuons quand même): ${genError.message}`)
            }
          }
          
          // Importer le client généré depuis le schéma
          const schemaDir = path.dirname(schemaPath)
          const clientPath = path.join(schemaDir, 'node_modules', '.prisma', 'client')
          
          // Essayer plusieurs chemins possibles
          const possiblePaths = [
            clientPath,
            path.join(projectRoot, 'node_modules', '.prisma', 'client'),
            path.join(schemaDir, '..', 'node_modules', '.prisma', 'client')
          ]
          
          let clientModule = null
          for (const tryPath of possiblePaths) {
            try {
              if (fs.existsSync(path.join(tryPath, 'index.js'))) {
                clientModule = await import(tryPath)
                this.logger.info(`Client Prisma chargé depuis: ${tryPath}`)
                break
              }
            } catch (e) {
              // Continuer vers le prochain chemin
            }
          }
          
          if (!clientModule) {
            throw new Error(`Client Prisma introuvable après génération. Chemins testés: ${possiblePaths.join(', ')}`)
          }
          
          PrismaClient = clientModule.PrismaClient
          
        } catch (error) {
          this.logger.error(`Erreur lors du chargement du client Prisma personnalisé`, { error: String(error) })
          throw new Error(`Impossible de charger le client Prisma depuis ${config.prismaSchema}: ${error}`)
        }
      } else if (config.type === 'miles-republic') {
        // Fallback: essayer de charger le client Miles Republic par défaut
        try {
          const path = require('path')
          const agentsDir = path.resolve(__dirname, '../../../apps/agents')
          const milesClient = await import(`${agentsDir}/node_modules/.prisma/client/index.js`)
          PrismaClient = milesClient.PrismaClient
          this.logger.info('Using Miles Republic Prisma client (default)')
        } catch (error) {
          this.logger.error('Miles Republic Prisma client not found', { error: String(error) })
          throw new Error('Miles Republic Prisma client not generated. Run: cd apps/agents && npx prisma generate')
        }
      } else {
        // For other databases, use the default client
        const defaultClient = await import('@prisma/client')
        PrismaClient = defaultClient.PrismaClient
      }

      const client = new PrismaClient({
        datasources: {
          db: {
            url: connectionUrl
          }
        }
      })

      // Tester la connexion
      await client.$connect()
      
      return client

    } catch (error) {
      this.logger.error(`Erreur lors de la création de connexion pour ${config.name}`, { error: String(error) })
      throw error
    }
  }

  /**
   * Obtenir la liste des bases de données disponibles
   */
  async getAvailableDatabases(): Promise<DatabaseConfig[]> {
    // S'assurer que les configurations sont chargées
    await this.loadConfigurations()
    return Array.from(this.configs.values()).filter(config => config.isActive)
  }

  /**
   * Obtenir la base de données par défaut
   */
  getDefaultDatabase(): DatabaseConfig | null {
    for (const config of this.configs.values()) {
      if (config.isDefault && config.isActive) {
        return config
      }
    }
    return null
  }

  /**
   * Tester une connexion
   */
  async testConnection(databaseId: string): Promise<boolean> {
    try {
      // S'assurer que les configurations sont chargées
      await this.loadConfigurations()

      const config = this.configs.get(databaseId)
      if (!config) {
        throw new Error(`Configuration non trouvée: ${databaseId}`)
      }

      const connection = await this.createConnection(config)
      await connection.$queryRaw`SELECT 1`
      await connection.$disconnect()

      this.logger.info(`Test de connexion réussi: ${config.name}`)
      return true

    } catch (error) {
      this.logger.error(`Test de connexion échoué pour ${databaseId}`, { error: String(error) })
      return false
    }
  }

  /**
   * Fermer toutes les connexions
   */
  async closeAllConnections(): Promise<void> {
    for (const [id, connection] of this.connections.entries()) {
      try {
        await connection.$disconnect()
        this.logger.info(`Connexion fermée: ${id}`)
      } catch (error) {
        this.logger.error(`Erreur lors de la fermeture de connexion ${id}`, { error: String(error) })
      }
    }
    this.connections.clear()
  }

  /**
   * Ajouter ou mettre à jour une configuration
   */
  addOrUpdateConfig(config: DatabaseConfig): void {
    this.configs.set(config.id, config)
    // Fermer la connexion existante si elle existe
    if (this.connections.has(config.id)) {
      const connection = this.connections.get(config.id)
      connection.$disconnect().catch(() => {}) // Ignorer les erreurs
      this.connections.delete(config.id)
    }
  }

  /**
   * Supprimer une configuration
   */
  removeConfig(databaseId: string): void {
    if (this.connections.has(databaseId)) {
      const connection = this.connections.get(databaseId)
      connection.$disconnect().catch(() => {})
      this.connections.delete(databaseId)
    }
    this.configs.delete(databaseId)
  }

  /**
   * Ajouter des configurations de test (pour l'environnement de test)
   * Ces configs ont la priorité sur celles chargées depuis la BD
   */
  addTestConfigs(testConfigs: DatabaseConfig[]): void {
    for (const config of testConfigs) {
      this.configs.set(config.id, config)
    }
    this.logger.info(`Ajout de ${testConfigs.length} configuration(s) de test`)
    // Marquer comme chargé pour éviter le chargement depuis la BD
    this.configsLoaded = true
  }
}
