import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  PostgresStrategy,
  MySQLStrategy,
  MongoDBStrategy,
  MilesRepublicStrategy,
  ConnectionUrlBuilder
} from '../database/strategies'
import { DatabaseStrategyFactory } from '../database/factory'
import { DatabaseConfig } from '../database-manager'
// Mock logger pour tests
const createTestLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
} as any)

describe('ConnectionUrlBuilder', () => {
  it('devrait utiliser connectionString si fourni', () => {
    const config: DatabaseConfig = {
      id: 'test-1',
      name: 'Test DB',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'user',
      password: 'pass',
      ssl: false,
      isDefault: false,
      isActive: true,
      connectionString: 'postgresql://custom:url@example.com/db'
    }

    expect(ConnectionUrlBuilder.build(config)).toBe('postgresql://custom:url@example.com/db')
  })

  it('devrait construire URL PostgreSQL avec SSL', () => {
    const config: DatabaseConfig = {
      id: 'test-2',
      name: 'Postgres',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'mydb',
      username: 'admin',
      password: 'secret',
      ssl: true,
      isDefault: false,
      isActive: true
    }

    expect(ConnectionUrlBuilder.build(config)).toBe(
      'postgresql://admin:secret@localhost:5432/mydb?ssl=true'
    )
  })

  it('devrait construire URL MySQL sans SSL', () => {
    const config: DatabaseConfig = {
      id: 'test-3',
      name: 'MySQL',
      type: 'mysql',
      host: 'db.example.com',
      port: 3306,
      database: 'app',
      username: 'root',
      password: 'root123',
      ssl: false,
      isDefault: false,
      isActive: true
    }

    expect(ConnectionUrlBuilder.build(config)).toBe(
      'mysql://root:root123@db.example.com:3306/app'
    )
  })
})

describe('DatabaseStrategyFactory', () => {
  it('devrait retourner PostgresStrategy pour type postgresql', () => {
    const config: DatabaseConfig = {
      id: 'pg-1',
      name: 'PG',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'test',
      username: 'user',
      password: 'pass',
      ssl: false,
      isDefault: false,
      isActive: true
    }

    const strategy = DatabaseStrategyFactory.getStrategy(config)
    expect(strategy).toBeInstanceOf(PostgresStrategy)
  })

  it('devrait retourner MySQLStrategy pour type mysql', () => {
    const config: DatabaseConfig = {
      id: 'mysql-1',
      name: 'MySQL',
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'test',
      username: 'user',
      password: 'pass',
      ssl: false,
      isDefault: false,
      isActive: true
    }

    const strategy = DatabaseStrategyFactory.getStrategy(config)
    expect(strategy).toBeInstanceOf(MySQLStrategy)
  })

  it('devrait retourner MongoDBStrategy pour type mongodb', () => {
    const config: DatabaseConfig = {
      id: 'mongo-1',
      name: 'Mongo',
      type: 'mongodb',
      host: 'localhost',
      port: 27017,
      database: 'test',
      username: 'user',
      password: 'pass',
      ssl: false,
      isDefault: false,
      isActive: true
    }

    const strategy = DatabaseStrategyFactory.getStrategy(config)
    expect(strategy).toBeInstanceOf(MongoDBStrategy)
  })

  it('devrait retourner MilesRepublicStrategy pour type miles-republic', () => {
    const config: DatabaseConfig = {
      id: 'miles-1',
      name: 'Miles',
      type: 'miles-republic',
      host: 'localhost',
      port: 5432,
      database: 'miles',
      username: 'user',
      password: 'pass',
      ssl: false,
      isDefault: false,
      isActive: true
    }

    const strategy = DatabaseStrategyFactory.getStrategy(config)
    expect(strategy).toBeInstanceOf(MilesRepublicStrategy)
  })

  it('devrait lancer une erreur pour type non supporté', () => {
    const config = {
      id: 'invalid-1',
      name: 'Invalid',
      type: 'invalid-type',
      host: 'localhost',
      port: 5432,
      database: 'test',
      username: 'user',
      password: 'pass',
      ssl: false,
      isDefault: false,
      isActive: true
    } as any

    expect(() => DatabaseStrategyFactory.getStrategy(config)).toThrow(
      'Type de base de données non supporté: invalid-type'
    )
  })

  it('devrait permettre d\'enregistrer une stratégie personnalisée', () => {
    class CustomStrategy {
      async createConnection() { return {} }
      async testConnection() { return true }
      async closeConnection() {}
    }

    DatabaseStrategyFactory.registerStrategy('custom', new CustomStrategy() as any)
    
    const config: DatabaseConfig = {
      id: 'custom-1',
      name: 'Custom',
      type: 'custom' as any,
      host: 'localhost',
      port: 5432,
      database: 'test',
      username: 'user',
      password: 'pass',
      ssl: false,
      isDefault: false,
      isActive: true
    }

    const strategy = DatabaseStrategyFactory.getStrategy(config)
    expect(strategy).toBeInstanceOf(CustomStrategy)
  })

  it('devrait lister les types supportés', () => {
    const types = DatabaseStrategyFactory.getSupportedTypes()
    expect(types).toContain('postgresql')
    expect(types).toContain('mysql')
    expect(types).toContain('mongodb')
    expect(types).toContain('miles-republic')
  })
})

describe('PostgresStrategy', () => {
  const logger = createTestLogger()
  const strategy = new PostgresStrategy()

  it('devrait avoir les méthodes requises', () => {
    expect(typeof strategy.createConnection).toBe('function')
    expect(typeof strategy.testConnection).toBe('function')
    expect(typeof strategy.closeConnection).toBe('function')
  })

  // Note: Tests d'intégration avec vraie DB seraient dans un fichier séparé
  // Ces tests unitaires vérifient juste la structure
})

describe('MySQLStrategy', () => {
  const logger = createTestLogger()
  const strategy = new MySQLStrategy()

  it('devrait avoir les méthodes requises', () => {
    expect(typeof strategy.createConnection).toBe('function')
    expect(typeof strategy.testConnection).toBe('function')
    expect(typeof strategy.closeConnection).toBe('function')
  })
})

describe('MongoDBStrategy', () => {
  const logger = createTestLogger()
  const strategy = new MongoDBStrategy()

  it('devrait avoir les méthodes requises', () => {
    expect(typeof strategy.createConnection).toBe('function')
    expect(typeof strategy.testConnection).toBe('function')
    expect(typeof strategy.closeConnection).toBe('function')
  })
})

describe('MilesRepublicStrategy', () => {
  const logger = createTestLogger()
  const strategy = new MilesRepublicStrategy()

  it('devrait avoir les méthodes requises', () => {
    expect(typeof strategy.createConnection).toBe('function')
    expect(typeof strategy.testConnection).toBe('function')
    expect(typeof strategy.closeConnection).toBe('function')
  })
})
