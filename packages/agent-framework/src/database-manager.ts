import { AgentLogger } from './types'
import { ConfigLoader } from './database/config-loader'
import { DatabaseStrategyFactory } from './database/factory'

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

/**
 * DatabaseManager refactorisé (Phase 2)
 * - Utilise ConfigLoader pour charger les configurations
 * - Utilise DatabaseStrategyFactory pour créer les connexions
 * - Simplifié de 420 → ~150 lignes
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private connections = new Map<string, any>()
  private configs = new Map<string, DatabaseConfig>()
  private logger: AgentLogger
  private configLoader: ConfigLoader
  private configsLoaded = false

  private constructor(logger: AgentLogger) {
    this.logger = logger
    this.configLoader = new ConfigLoader(logger)
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

  /**
   * Charger les configurations (délégué au ConfigLoader)
   */
  private async loadConfigurations(): Promise<void> {
    if (this.configsLoaded) {
      return
    }

    // Si des configs de test existent déjà, ne pas charger depuis la BD
    if (this.configs.size > 0) {
      this.logger.info(`Utilisation des configurations existantes (${this.configs.size} config(s) - mode test)`)
      this.configsLoaded = true
      return
    }

    // Charger depuis la BD via ConfigLoader
    const configs = await this.configLoader.loadFromDatabase()
    for (const config of configs) {
      this.configs.set(config.id, config)
    }

    this.configsLoaded = true
    this.logger.info(`${configs.length} configurations chargées`)
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
   * Créer une connexion (délégué au DatabaseStrategyFactory)
   */
  private async createConnection(config: DatabaseConfig): Promise<any> {
    try {
      const strategy = DatabaseStrategyFactory.getStrategy(config)
      const connection = await strategy.createConnection(config, this.logger)
      
      this.logger.info(`Connexion créée pour: ${config.name}`)
      return connection

    } catch (error) {
      this.logger.error(`Erreur création connexion: ${config.name}`, { error: String(error) })
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
   * Tester une connexion (utilise la stratégie appropriée)
   */
  async testConnection(databaseId: string): Promise<boolean> {
    try {
      await this.loadConfigurations()

      const config = this.configs.get(databaseId)
      if (!config) {
        throw new Error(`Configuration non trouvée: ${databaseId}`)
      }

      const strategy = DatabaseStrategyFactory.getStrategy(config)
      const connection = await strategy.createConnection(config, this.logger)
      const result = await strategy.testConnection(connection)
      await strategy.closeConnection(connection)

      this.logger.info(`Test connexion: ${config.name} → ${result ? 'OK' : 'FAIL'}`)
      return result

    } catch (error) {
      this.logger.error(`Test connexion échoué: ${databaseId}`, { error: String(error) })
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
