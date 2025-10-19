// Agent types
export type AgentType = 'EXTRACTOR' | 'COMPARATOR' | 'VALIDATOR' | 'CLEANER' | 'DUPLICATOR' | 'SPECIFIC_FIELD'

export type RunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export type ProposalType = 'NEW_EVENT' | 'EVENT_UPDATE' | 'EDITION_UPDATE' | 'RACE_UPDATE'

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'

export interface Agent {
  id: string
  name: string
  description?: string
  type: AgentType
  isActive: boolean
  frequency: string
  config: Record<string, any>
  createdAt: string
  updatedAt: string
  _count?: {
    runs: number
    proposals: number
  }
  runs?: AgentRun[]
  logs?: AgentLog[]
}

export interface AgentRun {
  id: string
  agentId: string
  status: RunStatus
  startedAt: string
  endedAt?: string
  duration?: number
  result?: any
  error?: string
  agent: {
    name: string
    type: AgentType
  }
}

export interface AgentLog {
  id: string
  agentId: string
  runId?: string
  level: LogLevel
  message: string
  data?: any
  timestamp: string
  agent: {
    name: string
  }
  run?: {
    id: string
    startedAt: string
  }
}

export interface Proposal {
  id: string
  agentId: string
  type: ProposalType
  status: ProposalStatus
  eventId?: string
  editionId?: string
  raceId?: string
  changes: Record<string, {
    old?: any
    new: any
    confidence: number
  }>
  justification: Array<{
    type: 'url' | 'image' | 'html' | 'text'
    content: string
    metadata?: Record<string, any>
  }>
  confidence?: number
  createdAt: string
  updatedAt: string
  reviewedAt?: string
  reviewedBy?: string
  agent: {
    name: string
    type: AgentType
  }
  relatedProposals?: Proposal[]
}

export interface AgentStatus {
  isScheduled: boolean
  isActive: boolean
  lastRun?: {
    id: string
    status: RunStatus
    startedAt: string
    endedAt?: string
    duration?: number
    error?: string
  }
  nextRun?: string
  frequency: string
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

// Event-related types (for proposals)
export interface EventData {
  id?: string
  name: string
  address?: string
  city?: string
  website?: string
  instagram?: string
  facebook?: string
}

export interface EditionData {
  id?: string
  eventId?: string
  year: number
  calendarStatus: string
  registrationStartDate?: string
  registrationEndDate?: string
  timezone?: string
  registrantsNumber?: number
}

export interface RaceData {
  id?: string
  editionId?: string
  name: string
  distance?: number
  startDate?: string
  price?: number
  elevation?: number
}

// Form types
export interface CreateAgentForm {
  name: string
  description?: string
  type: AgentType
  frequency: string
  config: Record<string, any>
}

export interface UpdateAgentForm extends Partial<CreateAgentForm> {
  isActive?: boolean
}

// Filter and search types
export interface AgentFilters {
  includeInactive?: boolean
  type?: AgentType
  search?: string
}

export interface ProposalFilters {
  status?: ProposalStatus
  type?: ProposalType
  eventId?: string
  editionId?: string
  search?: string
}

export interface RunFilters {
  agentId?: string
  status?: RunStatus
  search?: string
}

export interface LogFilters {
  agentId?: string
  runId?: string
  level?: LogLevel
  search?: string
}