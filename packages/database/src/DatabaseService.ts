import { PrismaClient } from '@prisma/client'
import { AgentService } from './services/AgentService'
import { ProposalService } from './services/ProposalService'
import { ProposalApplicationService } from './services/ProposalApplicationService'
import { RunService, LogService } from './services/RunService'
import { ConnectionService } from './services/ConnectionService'
import { AgentStateService, IAgentStateService } from './services/AgentStateService'
import {
  IAgentService,
  IProposalService,
  IProposalApplicationService,
  IRunService,
  ILogService,
  IConnectionService,
} from './services/interfaces'
import { prisma } from './prisma'

// Refactored DatabaseService as a facade
export class DatabaseService {
  private agentService: IAgentService
  private proposalService: IProposalService
  private proposalApplicationService: IProposalApplicationService
  private runService: IRunService
  private logService: ILogService
  private connectionService: IConnectionService
  private stateService: IAgentStateService

  constructor(private db: PrismaClient = prisma, dbManager?: any) {
    // Initialize services with dependency injection
    this.connectionService = new ConnectionService(this.db)
    this.agentService = new AgentService(this.db, this.connectionService)
    this.proposalService = new ProposalService(this.db)
    
    // ProposalApplicationService needs DatabaseManager - lazy load it
    if (dbManager) {
      this.proposalApplicationService = new ProposalApplicationService(this.db, dbManager)
    } else {
      // Lazy initialization - will be set when DatabaseManager is available
      this.proposalApplicationService = null as any
    }
    
    this.runService = new RunService(this.db)
    this.logService = new LogService(this.db)
    this.stateService = new AgentStateService(this.db)
  }
  
  // Method to set DatabaseManager after initialization
  setDatabaseManager(dbManager: any) {
    this.proposalApplicationService = new ProposalApplicationService(this.db, dbManager)
  }

  // Expose prisma client for advanced operations
  get prisma(): PrismaClient {
    return this.db
  }

  // Expose services for direct access
  get agents(): IAgentService {
    return this.agentService
  }

  get proposals(): IProposalService {
    return this.proposalService
  }

  get proposalApplication(): IProposalApplicationService {
    return this.proposalApplicationService
  }

  get runs(): IRunService {
    return this.runService
  }

  get logs(): ILogService {
    return this.logService
  }

  get connections(): IConnectionService {
    return this.connectionService
  }

  get state(): IAgentStateService {
    return this.stateService
  }

  // Backward compatibility methods

  // Agent operations
  async getAgents(includeInactive: boolean = false) {
    return this.agentService.getAgents({ includeInactive })
  }

  async getAgent(id: string) {
    return this.agentService.getAgent(id)
  }

  async createAgent(data: {
    name: string
    description?: string
    type: string
    frequency: string
    config: any
  }) {
    return this.agentService.createAgent(data)
  }

  async updateAgent(id: string, data: Partial<{
    name: string
    description: string
    isActive: boolean
    frequency: string
    config: any
  }>) {
    return this.agentService.updateAgent(id, data)
  }

  // Run operations
  async createRun(agentId: string) {
    return this.runService.createRun(agentId)
  }

  async updateRun(id: string, data: {
    status?: string
    endedAt?: Date
    duration?: number
    result?: any
    error?: string
  }) {
    return this.runService.updateRun(id, data)
  }

  async getAgentRuns(agentId: string, limit: number = 50) {
    return this.runService.getAgentRuns(agentId, limit)
  }

  // Logging operations
  async createLog(data: {
    agentId: string
    runId?: string
    level: string
    message: string
    data?: any
  }) {
    return this.logService.createLog(data)
  }

  // Proposal operations
  async getProposals(filters?: {
    status?: string
    type?: string
    eventId?: string
    editionId?: string
  }) {
    return this.proposalService.getProposals(filters)
  }

  async createProposal(data: {
    agentId: string
    type: string
    eventId?: string
    editionId?: string
    raceId?: string
    changes: any
    justification: any
    confidence?: number
  }) {
    return this.proposalService.createProposal(data)
  }

  async updateProposal(id: string, data: {
    status?: string
    reviewedAt?: Date
    reviewedBy?: string
    appliedBy?: string
    userModifiedChanges?: any
    modificationReason?: string
    modifiedBy?: string
    modifiedAt?: Date
    approvedBlocks?: any
  }) {
    return this.proposalService.updateProposal(id, data)
  }

  // Proposal application operations
  async applyProposal(proposalId: string, selectedChanges: Record<string, any>, options?: any) {
    return this.proposalApplicationService.applyProposal(proposalId, selectedChanges, options)
  }

  // Database connection operations
  async getDatabaseConnections(includeInactive: boolean = false) {
    return this.connections.getConnections(includeInactive)
  }

  async getDatabaseConnection(id: string) {
    return this.connections.getConnection(id)
  }

  async createDatabaseConnection(data: {
    name: string
    description?: string
    type: string
    host?: string
    port?: number
    database?: string
    username?: string
    password?: string
    connectionUrl?: string
    sslMode?: string
    timeout?: number
    maxConnections?: number
    tags?: string[]
  }) {
    return this.connections.createConnection(data)
  }

  async updateDatabaseConnection(id: string, data: Partial<{
    name: string
    description: string
    type: string
    isActive: boolean
    host: string
    port: number
    database: string
    username: string
    password: string
    connectionUrl: string
    sslMode: string
    timeout: number
    maxConnections: number
    tags: string[]
  }>) {
    return this.connections.updateConnection(id, data)
  }

  async testDatabaseConnection(id: string) {
    return this.connections.testConnection(id)
  }

  async getAgentsUsingDatabaseConnection(connectionId: string) {
    return this.connections.getAgentsUsingConnection(connectionId)
  }

  async validateAgentConfiguration(agentId: string) {
    return this.agentService.validateConfiguration(agentId)
  }

  async reinstallAgent(id: string) {
    return this.agentService.reinstallAgent(id)
  }
}
