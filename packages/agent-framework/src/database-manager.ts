import { AgentLogger } from './types'

export interface DatabaseConfig {
  id: string
  name: string
  type: 'postgresql' | 'mysql' | 'mongodb' | 'medusa'
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
}

export class DatabaseManager {
  private connections = new Map<string, any>()
  private configs = new Map<string, DatabaseConfig>()
  private logger: AgentLogger
  private configsLoaded = false

  constructor(logger: AgentLogger) {
    this.logger = logger
    // Ne pas attendre ici, mais charger dès la première utilisation
  }

  private async loadConfigurations() {
    try {
      // Charger uniquement les configurations depuis la base de données
      await this.loadDatabaseConfigurations()

      this.logger.info(`Configurations de bases de données chargées: ${this.configs.size}`)
    } catch (error) {
      this.logger.error('Erreur lors du chargement des configurations DB', { error: String(error) })
    }
  }

  /**
   * Mapper les types de base de données depuis le schéma Prisma
   */
  private mapDatabaseType(prismaType: any): 'postgresql' | 'mysql' | 'mongodb' | 'medusa' {
    switch (prismaType) {
      case 'POSTGRESQL': return 'postgresql'
      case 'MYSQL': return 'mysql'
      case 'MONGODB': return 'mongodb'
      case 'MILES_REPUBLIC': return 'medusa'
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
      if (!this.configsLoaded) {
        await this.loadConfigurations()
        this.configsLoaded = true
      }

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
    const { PrismaClient } = await import('@prisma/client')
    
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
    if (!this.configsLoaded) {
      await this.loadConfigurations()
      this.configsLoaded = true
    }
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
      if (!this.configsLoaded) {
        await this.loadConfigurations()
        this.configsLoaded = true
      }

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
   */
  addTestConfigs(testConfigs: DatabaseConfig[]): void {
    for (const config of testConfigs) {
      this.configs.set(config.id, config)
    }
    this.logger.info(`Ajout de ${testConfigs.length} configurations de test`)
  }
}
