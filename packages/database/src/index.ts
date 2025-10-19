// Export Prisma client and types
export { prisma } from './prisma'
export * from '@prisma/client'
export {
  AgentType,
  LogLevel,
  ProposalType,
} from '@data-agents/types'

// Export the refactored DatabaseService
export { DatabaseService } from './DatabaseService'

// Export services and interfaces
export * from './services/interfaces'
export { AgentService } from './services/AgentService'
export { ProposalService } from './services/ProposalService'
export { RunService, LogService } from './services/RunService'
export { ConnectionService } from './services/ConnectionService'
export { AgentStateService } from './services/AgentStateService'
export type { IAgentStateService } from './services/AgentStateService'
export { AgentRegistryService, agentRegistryService } from './services/AgentRegistryService'

// Export validation schemas and types
export * from './validation/schemas'

// Export custom errors
export * from './errors'

// Export logging utilities
export * from './logging'
