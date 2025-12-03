// Export Prisma client and types
export { prisma } from './prisma'
export * from '@prisma/client'

// Re-export Prisma enums explicitly for better IDE support
export { AgentType, LogLevel, ProposalType, ProposalStatus } from '@prisma/client'

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
export * from './services/block-execution-order'
