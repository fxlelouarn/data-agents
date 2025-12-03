import { Agent, AgentRun, AgentLog, Proposal, DatabaseConnection } from '@prisma/client'

// Filters and options
export interface AgentFilters {
  includeInactive?: boolean
  type?: string
  isActive?: boolean
}

export interface ProposalFilters {
  status?: string
  type?: string
  eventId?: string
  editionId?: string
  agentId?: string
}

export interface RunFilters {
  agentId?: string
  status?: string
  limit?: number
  offset?: number
}

export interface LogFilters {
  agentId?: string
  runId?: string
  level?: string
  limit?: number
  offset?: number
}

// Validation result
export interface ValidationResult {
  isValid: boolean
  errors: Array<{
    field: string
    message: string
    severity: 'error' | 'warning'
  }>
}

// Connection test result
export interface ConnectionTestResult {
  isHealthy: boolean
  responseTime: number
  error: string | null
  testedAt: Date
}

// Service interfaces
export interface IAgentService {
  getAgents(filters?: AgentFilters): Promise<(Agent & { 
    _count: { runs: number; proposals: number }
    configurationErrors?: ValidationResult['errors']
    hasConfigurationErrors?: boolean
  })[]>
  
  getAgent(id: string): Promise<(Agent & {
    runs: AgentRun[]
    logs: AgentLog[]
  }) | null>
  
  createAgent(data: {
    name: string
    description?: string
    type: string
    frequency: string
    config: any
  }): Promise<Agent>
  
  updateAgent(id: string, data: Partial<{
    name: string
    description: string
    isActive: boolean
    frequency: string
    config: any
  }>): Promise<Agent>
  
  deleteAgent(id: string): Promise<void>
  
  validateConfiguration(agentId: string): Promise<ValidationResult>
  
  reinstallAgent(id: string): Promise<Agent>
}

export interface IProposalService {
  getProposals(filters?: ProposalFilters): Promise<(Proposal & {
    agent: { name: string; type: string }
  })[]>
  
  getProposal(id: string): Promise<Proposal | null>
  
  createProposal(data: {
    agentId: string
    type: string
    eventId?: string
    editionId?: string
    raceId?: string
    changes: any
    justification: any
    confidence?: number
  }): Promise<Proposal>
  
  updateProposal(id: string, data: {
    status?: string
    reviewedAt?: Date
    reviewedBy?: string
    appliedBy?: string
    userModifiedChanges?: any
    modificationReason?: string
    modifiedBy?: string
    modifiedAt?: Date
    approvedBlocks?: any
  }): Promise<Proposal>
  
  deleteProposal(id: string): Promise<void>
}

export interface IRunService {
  getRuns(filters?: RunFilters): Promise<AgentRun[]>
  
  getRun(id: string): Promise<(AgentRun & { logs: AgentLog[] }) | null>
  
  createRun(agentId: string): Promise<AgentRun>
  
  updateRun(id: string, data: {
    status?: string
    endedAt?: Date
    duration?: number
    result?: any
    error?: string
  }): Promise<AgentRun>
  
  getAgentRuns(agentId: string, limit?: number): Promise<AgentRun[]>
}

export interface ILogService {
  getLogs(filters?: LogFilters): Promise<AgentLog[]>
  
  createLog(data: {
    agentId: string
    runId?: string
    level: string
    message: string
    data?: any
  }): Promise<AgentLog>
  
  getAgentLogs(agentId: string, limit?: number): Promise<AgentLog[]>
  
  getRunLogs(runId: string): Promise<AgentLog[]>
}

export interface IConnectionService {
  getConnections(includeInactive?: boolean): Promise<Omit<DatabaseConnection, 'password'>[]>
  
  getConnection(id: string): Promise<Omit<DatabaseConnection, 'password'> | null>
  
  createConnection(data: {
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
  }): Promise<Omit<DatabaseConnection, 'password'>>
  
  updateConnection(id: string, data: Partial<{
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
  }>): Promise<Omit<DatabaseConnection, 'password'>>
  
  deleteConnection(id: string): Promise<void>
  
  testConnection(id: string): Promise<ConnectionTestResult>
  
  getAgentsUsingConnection(connectionId: string): Promise<Array<{
    id: string
    name: string
    config: any
  }>>
}

// Interfaces pour l'application des propositions
export interface ApplyOptions {
  applyToDatabase?: boolean  // Par défaut true (cache + Miles Republic)
  force?: boolean           // Bypass validation
  dryRun?: boolean         // Simulation
  milesRepublicDatabaseId?: string // ID de la connexion Miles Republic
  capturedLogs?: string[]  // Tableau pour capturer les logs (pour l'interface utilisateur)
  agentName?: string       // Nom de l'agent pour l'audit trail (createdBy/updatedBy)
  proposalIds?: string[]   // IDs des propositions du groupe (mode groupé)
  proposalId?: string      // ✅ ID de la proposition (pour récupérer les IDs des blocs précédents)
  blockType?: string       // ✅ Type de bloc pour application partielle ('edition', 'organizer', 'races', 'event')
}

export interface ProposalApplicationResult {
  success: boolean
  appliedChanges: Record<string, any>
  createdIds?: {
    eventId?: string
    editionId?: string
    raceIds?: string[]
  }
  errors?: Array<{
    field: string
    message: string
    severity: 'error' | 'warning'
  }>
  warnings?: Array<{
    field: string
    message: string
    severity: 'warning'
  }>
  syncedToDatabase?: boolean // Indique si synchronisé avec Miles Republic
  syncError?: string // Erreur de synchronisation s'il y en a une
  dryRun?: boolean // Indique si c'était une simulation
  filteredChanges?: { // Changements filtrés par blocs non approuvés
    removed: string[]
    approvedBlocks: Record<string, boolean>
  }
  [key: string]: any // Pour permettre d'autres champs comme eventData, etc.
}

export interface IProposalApplicationService {
  applyProposal(proposalId: string, selectedChanges: Record<string, any>, options?: ApplyOptions): Promise<ProposalApplicationResult>
  applyNewEvent(changes: any, selectedChanges: Record<string, any>, options?: ApplyOptions): Promise<ProposalApplicationResult>
  applyEventUpdate(eventId: string, changes: any, selectedChanges: Record<string, any>, options?: ApplyOptions): Promise<ProposalApplicationResult>
  applyEditionUpdate(editionId: string, changes: any, selectedChanges: Record<string, any>, options?: ApplyOptions): Promise<ProposalApplicationResult>
  applyRaceUpdate(raceId: string, changes: any, selectedChanges: Record<string, any>, options?: ApplyOptions): Promise<ProposalApplicationResult>
}
