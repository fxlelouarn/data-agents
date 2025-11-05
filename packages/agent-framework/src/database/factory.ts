import { DatabaseConfig } from '../database-manager'
import {
  DatabaseStrategy,
  PostgresStrategy,
  MySQLStrategy,
  MongoDBStrategy,
  MilesRepublicStrategy
} from './strategies'

/**
 * Factory pour créer les stratégies de connexion appropriées selon le type de base de données
 */
export class DatabaseStrategyFactory {
  private static strategies = new Map<string, DatabaseStrategy>([
    ['postgresql', new PostgresStrategy()],
    ['mysql', new MySQLStrategy()],
    ['mongodb', new MongoDBStrategy()],
    ['miles-republic', new MilesRepublicStrategy()]
  ])

  /**
   * Obtenir la stratégie appropriée pour un type de base de données
   */
  static getStrategy(config: DatabaseConfig): DatabaseStrategy {
    const strategy = this.strategies.get(config.type)
    
    if (!strategy) {
      throw new Error(`Type de base de données non supporté: ${config.type}`)
    }
    
    return strategy
  }

  /**
   * Enregistrer une nouvelle stratégie (pour extension)
   */
  static registerStrategy(type: string, strategy: DatabaseStrategy): void {
    this.strategies.set(type, strategy)
  }

  /**
   * Liste des types supportés
   */
  static getSupportedTypes(): string[] {
    return Array.from(this.strategies.keys())
  }
}
