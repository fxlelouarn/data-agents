// Export all types
export * from './types'

// Export base classes
export { BaseAgent } from './base-agent'
export { WebScraperAgent } from './web-scraper-agent'

// Export utilities
export { createLogger, createConsoleLogger } from './logger'
export { DatabaseManager } from './database-manager'
export type { DatabaseConfig } from './database-manager'
export { ConnectionManager } from './connection-manager'
export type { SourceConnectionConfig, PrismaClientType } from './connection-manager'

// Export database modules (Phase 2 refactoring)
export { ConfigLoader } from './database/config-loader'
export { DatabaseStrategyFactory } from './database/factory'
export type { DatabaseStrategy } from './database/strategies'
export {
  PostgresStrategy,
  MySQLStrategy,
  MongoDBStrategy,
  MilesRepublicStrategy,
  ConnectionUrlBuilder
} from './database/strategies'

// Import BaseAgent for use in AgentRegistry
import { BaseAgent } from './base-agent'

// Agent registry for managing different agent types
export class AgentRegistry {
  private agents = new Map<string, new (config: any) => BaseAgent>()

  register<T extends BaseAgent>(
    type: string, 
    agentClass: new (config: any) => T
  ): void {
    this.agents.set(type, agentClass)
  }

  create(type: string, config: any): BaseAgent | null {
    const AgentClass = this.agents.get(type)
    return AgentClass ? new AgentClass(config) : null
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.agents.keys())
  }
}

// Global registry instance
export const agentRegistry = new AgentRegistry()