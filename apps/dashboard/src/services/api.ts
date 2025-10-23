import axios from 'axios'
import { 
  Agent, 
  AgentRun, 
  AgentLog, 
  Proposal, 
  AgentStatus,
  ApiResponse, 
  PaginatedResponse,
  CreateAgentForm,
  UpdateAgentForm,
  AgentFilters,
  ProposalFilters,
  RunFilters,
  LogFilters,
  DataUpdate,
  UpdateFilters
} from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle authentication error
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Agents API
export const agentsApi = {
  getAll: (filters: AgentFilters = {}): Promise<ApiResponse<Agent[]>> =>
    api.get('/agents', { params: filters }).then(res => res.data),

  getById: (id: string): Promise<ApiResponse<Agent & { runs: AgentRun[]; logs: AgentLog[] }>> =>
    api.get(`/agents/${id}`).then(res => res.data),

  create: (data: CreateAgentForm): Promise<ApiResponse<Agent>> =>
    api.post('/agents', data).then(res => res.data),

  update: (id: string, data: UpdateAgentForm): Promise<ApiResponse<Agent>> =>
    api.put(`/agents/${id}`, data).then(res => res.data),

  toggle: (id: string): Promise<ApiResponse<Agent>> =>
    api.post(`/agents/${id}/toggle`).then(res => res.data),

  run: (id: string): Promise<ApiResponse<{ runId: string }>> =>
    api.post(`/agents/${id}/run`).then(res => res.data),

  getStatus: (id: string): Promise<ApiResponse<AgentStatus>> =>
    api.get(`/agents/${id}/status`).then(res => res.data),

  validate: (id: string): Promise<ApiResponse<{
    isValid: boolean
    errors: Array<{
      field: string
      message: string
      severity: 'error' | 'warning'
    }>
  }>> =>
    api.get(`/agents/${id}/validate`).then(res => res.data),

  reinstall: (id: string): Promise<ApiResponse<Agent>> =>
    api.post(`/agents/${id}/reinstall`).then(res => res.data),

  delete: (id: string): Promise<ApiResponse<void>> =>
    api.delete(`/agents/${id}`).then(res => res.data),

  resetCursor: (id: string): Promise<ApiResponse<{ message: string }>> =>
    api.post(`/agents/${id}/reset-cursor`).then(res => res.data),
}

// Proposals API
export const proposalsApi = {
  getAll: (filters: ProposalFilters = {}, limit = 20, offset = 0): Promise<PaginatedResponse<Proposal>> =>
    api.get('/proposals', { params: { ...filters, limit, offset } }).then(res => res.data),

  getById: (id: string): Promise<ApiResponse<Proposal & { relatedProposals: Proposal[] }>> =>
    api.get(`/proposals/${id}`).then(res => res.data),

  createManual: (data: {
    eventId?: string
    editionId?: string
    raceId?: string
    fieldName: string
    fieldValue: any
    type: 'NEW_EVENT' | 'EVENT_UPDATE' | 'EDITION_UPDATE' | 'RACE_UPDATE'
    propagateToRaces?: boolean
    justification?: string
  }): Promise<ApiResponse<Proposal>> =>
    api.post('/proposals', data).then(res => res.data),

  update: (
    id: string, 
    data: { 
      status?: string; 
      reviewedBy?: string; 
      appliedChanges?: Record<string, any> 
    }
  ): Promise<ApiResponse<Proposal>> =>
    api.put(`/proposals/${id}`, data).then(res => res.data),

  compare: (id: string, existingEventId?: string): Promise<ApiResponse<{
    proposal: any
    existing: any
    similarity?: number
    changes?: any
  }>> =>
    api.post(`/proposals/${id}/compare`, { existingEventId }).then(res => res.data),

  bulkApprove: (proposalIds: string[], reviewedBy?: string): Promise<ApiResponse<{ updated: number }>> =>
    api.post('/proposals/bulk-approve', { proposalIds, reviewedBy }).then(res => res.data),

  bulkReject: (proposalIds: string[], reviewedBy?: string): Promise<ApiResponse<{ updated: number }>> =>
    api.post('/proposals/bulk-reject', { proposalIds, reviewedBy }).then(res => res.data),

  bulkArchive: (proposalIds: string[], reviewedBy?: string, archiveReason?: string): Promise<ApiResponse<{ updated: number }>> =>
    api.post('/proposals/bulk-archive', { proposalIds, reviewedBy, archiveReason }).then(res => res.data),

  delete: (id: string): Promise<ApiResponse<void>> =>
    api.delete(`/proposals/${id}`).then(res => res.data),

  bulkDelete: (proposalIds: string[], reviewedBy?: string): Promise<ApiResponse<{ deleted: number }>> =>
    api.post('/proposals/bulk-delete', { proposalIds, reviewedBy }).then(res => res.data),
}

// Runs API
export const runsApi = {
  getAll: (filters: RunFilters = {}, limit = 20, offset = 0): Promise<PaginatedResponse<AgentRun>> =>
    api.get('/runs', { params: { ...filters, limit, offset } }).then(res => res.data),

  getById: (id: string): Promise<ApiResponse<AgentRun & { logs: AgentLog[] }>> =>
    api.get(`/runs/${id}`).then(res => res.data),
}

// Logs API
export const logsApi = {
  getAll: (filters: LogFilters = {}, limit = 100, offset = 0): Promise<PaginatedResponse<AgentLog>> =>
    api.get('/logs', { params: { ...filters, limit, offset } }).then(res => res.data),
}

// Databases API
export const databasesApi = {
  getAll: (includeInactive = false): Promise<ApiResponse<Array<{
    id: string
    name: string
    type: string
    isActive: boolean
    description?: string
    host?: string
    port?: number
    database?: string
    username?: string
    tags?: string[]
    createdAt: string
    updatedAt: string
    lastTestedAt?: string
    isHealthy: boolean
  }>>> =>
    api.get('/databases', { params: { includeInactive } }).then(res => res.data),

  getById: (id: string): Promise<ApiResponse<{
    id: string
    name: string
    type: string
    isActive: boolean
    description?: string
    host?: string
    port?: number
    database?: string
    username?: string
    connectionUrl?: string
    tags?: string[]
    createdAt: string
    updatedAt: string
    lastTestedAt?: string
    isHealthy: boolean
  }>> =>
    api.get(`/databases/${id}`).then(res => res.data),

  create: (data: {
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
  }): Promise<ApiResponse<any>> =>
    api.post('/databases', data).then(res => res.data),

  update: (id: string, data: {
    name?: string
    description?: string
    type?: string
    isActive?: boolean
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
  }): Promise<ApiResponse<any>> =>
    api.put(`/databases/${id}`, data).then(res => res.data),

  toggle: (id: string): Promise<ApiResponse<any>> =>
    api.post(`/databases/${id}/toggle`).then(res => res.data),

  test: (id: string): Promise<ApiResponse<{
    isHealthy: boolean
    responseTime: number
    error?: string
    testedAt: string
  }>> =>
    api.post(`/databases/${id}/test`).then(res => res.data),

  delete: (id: string): Promise<ApiResponse<void>> =>
    api.delete(`/databases/${id}`).then(res => res.data),
}

// Settings API
export const settingsApi = {
  get: (): Promise<ApiResponse<{
    maxConsecutiveFailures: number
    enableAutoDisabling: boolean
    checkIntervalMinutes: number
  }>> =>
    api.get('/settings').then(res => res.data),

  update: (data: {
    maxConsecutiveFailures?: number
    enableAutoDisabling?: boolean
    checkIntervalMinutes?: number
  }): Promise<ApiResponse<{
    maxConsecutiveFailures: number
    enableAutoDisabling: boolean
    checkIntervalMinutes: number
  }>> =>
    api.put('/settings', data).then(res => res.data),

  getFailureReport: (): Promise<ApiResponse<{
    settings: {
      maxConsecutiveFailures: number
      enableAutoDisabling: boolean
    }
    agents: Array<{
      agentId: string
      agentName: string
      consecutiveFailures: number
      shouldDisable: boolean
      lastFailureAt: string
      recentRuns: Array<{
        id: string
        status: string
        startedAt: string
        error?: string
      }>
    }>
    summary: {
      totalAgentsWithFailures: number
      agentsAtRisk: number
      agentsWithWarnings: number
    }
  }>> =>
    api.get('/settings/failure-report').then(res => res.data),

  checkFailures: (): Promise<ApiResponse<{
    checkedAgents: number
    disabledAgents: string[]
  }>> =>
    api.post('/settings/check-failures').then(res => res.data),

  getAgentFailures: (agentId: string): Promise<ApiResponse<{
    agentId: string
    consecutiveFailures: number
    shouldDisable: boolean
    agentName?: string
    lastFailureAt?: string
    recentRuns?: Array<{
      id: string
      status: string
      startedAt: string
      error?: string
    }>
    settings: {
      maxConsecutiveFailures: number
      enableAutoDisabling: boolean
    }
    message?: string
  }>> =>
    api.get(`/settings/agent/${agentId}/failures`).then(res => res.data),
}

// Updates API
export const updatesApi = {
  getAll: (filters: UpdateFilters = {}, limit = 20, offset = 0): Promise<PaginatedResponse<DataUpdate>> =>
    api.get('/updates', { params: { ...filters, limit, offset } }).then(res => res.data),

  getById: (id: string): Promise<ApiResponse<DataUpdate & { logs: string[] }>> =>
    api.get(`/updates/${id}`).then(res => res.data),

  create: (proposalId: string, scheduledAt?: string): Promise<ApiResponse<DataUpdate>> =>
    api.post('/updates', { proposalId, scheduledAt }).then(res => res.data),

  apply: (id: string): Promise<ApiResponse<DataUpdate>> =>
    api.post(`/updates/${id}/apply`).then(res => res.data),

  delete: (id: string): Promise<ApiResponse<void>> =>
    api.delete(`/updates/${id}`).then(res => res.data),

  replay: (id: string): Promise<ApiResponse<DataUpdate>> =>
    api.post(`/updates/${id}/replay`).then(res => res.data),

  getLogs: (id: string): Promise<ApiResponse<{ logs: string[] }>> =>
    api.get(`/updates/${id}/logs`).then(res => res.data),

  bulkDelete: (ids: string[]): Promise<ApiResponse<{ deletedCount: number }>> =>
    api.post('/updates/bulk/delete', { ids }).then(res => res.data),

  bulkApply: (ids: string[]): Promise<ApiResponse<{
    successful: string[]
    failed: Array<{ id: string; error: string }>
    totalProcessed: number
  }>> =>
    api.post('/updates/bulk/apply', { ids }).then(res => res.data),
}

// Events API (interroge directement Miles Republic)
export const cacheApi = {
  getEvents: (filters: { limit?: number; search?: string } = {}): Promise<ApiResponse<Array<{
    id: string
    name: string
    city: string
    country: string
    _count: { editions: number }
  }>>> =>
    api.get('/events', { params: filters }).then(res => res.data),

  getEditions: (filters: { eventId?: string; limit?: number } = {}): Promise<ApiResponse<Array<{
    id: string
    year: number
    startDate: string | null
    calendarStatus: string
    eventId: string
    event: {
      name: string
      city: string
    }
    _count: { races: number }
  }>>> =>
    api.get('/events/editions', { params: filters }).then(res => res.data),

  getRaces: (filters: { editionId?: string; limit?: number } = {}): Promise<ApiResponse<Array<{
    id: string
    name: string
    startDate: string | null
    price: number | null
    runDistance: number | null
    editionId: string
    edition: {
      year: number
      event: {
        name: string
        city: string
      }
    }
  }>>> =>
    api.get('/events/races', { params: filters }).then(res => res.data),

  // Alias pour compatibilité (mêmes routes)
  getMilesRepublicEvents: (filters: { limit?: number; search?: string } = {}): Promise<ApiResponse<Array<{
    id: string
    name: string
    city: string
    country: string
    _count: { editions: number }
  }>>> =>
    api.get('/events', { params: filters }).then(res => res.data),

  getMilesRepublicEditions: (filters: { eventId?: string; limit?: number } = {}): Promise<ApiResponse<Array<{
    id: string
    year: number
    startDate: string | null
    calendarStatus: string
    eventId: string
    event: {
      name: string
      city: string
    }
    _count: { races: number }
  }>>> =>
    api.get('/events/editions', { params: filters }).then(res => res.data),

  getMilesRepublicRaces: (filters: { editionId?: string; limit?: number } = {}): Promise<ApiResponse<Array<{
    id: string
    name: string
    startDate: string | null
    price: number | null
    runDistance: number | null
    editionId: string
    edition: {
      year: number
      event: {
        name: string
        city: string
      }
    }
  }>>> =>
    api.get('/events/races', { params: filters }).then(res => res.data),
}

// Health API
export const healthApi = {
  check: (): Promise<ApiResponse<{
    timestamp: string
    uptime: number
    database: {
      connected: boolean
      latency: string
    }
    stats: {
      totalAgents: number
      runningJobs: number
      pendingProposals: number
    }
    version: string
  }>> =>
    api.get('/health').then(res => res.data),
}

export default api