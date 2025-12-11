// Export Prisma client and types
export { prisma } from './prisma'
export * from '@prisma/client'
export { Prisma } from '@prisma/client'

// Re-export Prisma types and enums explicitly for better IDE support
export type { Proposal, ProposalApplication, Agent, AgentRun, AgentLog, AgentState, DatabaseConnection, Settings, User } from '@prisma/client'
export { AgentType, LogLevel, ProposalType, ProposalStatus, ApplicationStatus, RunStatus, DatabaseType, UserRole } from '@prisma/client'

// Export the refactored DatabaseService
export { DatabaseService } from './DatabaseService'

// Export repositories (Repository Pattern - Phase 4 Refactoring)
export * from './repositories'

// Export services and interfaces
export * from './services/interfaces'
export { AgentService } from './services/AgentService'
export { ProposalService } from './services/ProposalService'
export { ProposalApplicationService } from './services/ProposalApplicationService'
export { ProposalDomainService } from './services/proposal-domain.service'
export { RunService, LogService } from './services/RunService'
export { ConnectionService } from './services/ConnectionService'
export { AgentStateService } from './services/AgentStateService'
export type { IAgentStateService } from './services/AgentStateService'
export { AgentRegistryService, agentRegistryService } from './services/AgentRegistryService'
export { MeilisearchService, getMeilisearchService } from './services/meilisearch-service'
export type { MeilisearchEvent, MeilisearchSearchParams, MeilisearchSearchResult } from './services/meilisearch-service'

// Export validation schemas and types
export * from './validation/schemas'

// Export custom errors
export * from './errors'

// Export logging utilities
export * from './logging'

// Export utility functions
export { convertChangesToSelectedChanges } from './utils/proposal-helpers'

// Export block execution order utilities
export {
  sortBlocksByDependencies,
  validateRequiredBlocks,
  getAllDependencies,
  explainExecutionOrder,
  BLOCK_DEPENDENCIES,
  type BlockType,
  type BlockApplication
} from './services/block-execution-order'

// Export frequency calculator utilities
export {
  calculateNextRun,
  validateFrequencyConfig,
  formatFrequencyConfig,
  areFrequencyConfigsEqual,
} from './services/frequency-calculator'
