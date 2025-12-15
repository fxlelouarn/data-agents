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
const TOKEN_KEY = 'data-agents-token'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Helper pour délai avec backoff exponentiel
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Request interceptor pour ajouter le token automatiquement
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for error handling with retry logic for 429
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config

    // Handle authentication error
    if (error.response?.status === 401) {
      // Token expiré ou invalide, nettoyer et rediriger
      localStorage.removeItem(TOKEN_KEY)
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // Handle rate limiting with exponential backoff
    if (error.response?.status === 429) {
      config._retryCount = config._retryCount || 0

      // Maximum 3 retries
      if (config._retryCount < 3) {
        config._retryCount += 1

        // Backoff exponentiel : 1s, 2s, 4s
        const delayMs = Math.pow(2, config._retryCount - 1) * 1000
        console.warn(`Rate limited. Retrying in ${delayMs}ms (attempt ${config._retryCount}/3)...`)

        await delay(delayMs)
        return api.request(config)
      }
    }

    return Promise.reject(error)
  }
)

// Available agent types (for creation)
export interface AvailableAgentInfo {
  type: string
  label: string
  description: string
  version: string
  agentType: 'EXTRACTOR' | 'VALIDATOR' | 'COMPARATOR' | 'CLEANER'
  configSchema: {
    title: string
    description?: string
    categories?: Array<{ id: string; label: string; description?: string }>
    fields: Array<{
      name: string
      label: string
      type: 'text' | 'number' | 'password' | 'select' | 'textarea' | 'switch' | 'boolean' | 'slider' | 'multiselect' | 'database_select'
      category?: string
      required?: boolean
      defaultValue?: any
      description?: string
      helpText?: string
      placeholder?: string
      options?: Array<{ value: string; label: string }>
      validation?: { required?: boolean; min?: number; max?: number; step?: number }
    }>
  }
}

// Agents API
export const agentsApi = {
  getAvailable: (): Promise<ApiResponse<AvailableAgentInfo[]>> =>
    api.get('/agents/available').then(res => res.data),

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

  getState: (id: string, key?: string): Promise<ApiResponse<any>> =>
    api.get(`/agents/${id}/state`, { params: key ? { key } : {} }).then(res => res.data),
}

// Proposals API
export const proposalsApi = {
  getAll: (filters: ProposalFilters = {}, limit = 20, offset = 0, sort = 'created-desc'): Promise<PaginatedResponse<Proposal>> => {
    const start = Date.now()
    console.log(`[📋 PROPOSALS] Frontend: Initiating GET /api/proposals (limit=${limit}, offset=${offset}, sort=${sort})`)
    return api.get('/proposals', { params: { ...filters, limit, offset, sort } }).then(res => {
      const duration = Date.now() - start
      console.log(`[📋 PROPOSALS] Frontend: GET /api/proposals completed in ${duration}ms, received ${res.data.data?.length} proposals`)
      if (duration > 2000) {
        console.warn(`⚠️  SLOW API CALL: proposals took ${duration}ms (> 2s)`)
      }
      return res.data
    })
  },

  getById: (id: string): Promise<ApiResponse<Proposal & { relatedProposals: Proposal[] }>> =>
    api.get(`/proposals/${id}`).then(res => res.data),

  getByGroup: (groupKey: string): Promise<ApiResponse<Proposal[]>> =>
    api.get(`/proposals/group/${groupKey}`).then(res => res.data),

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

  createComplete: (data: {
    type: 'NEW_EVENT'
    changes: Record<string, any>
    userModifiedChanges: Record<string, any>
    userModifiedRaceChanges: Record<string, any>
    races: Array<{ id: string; [key: string]: any }>
    justification: Array<{ type: string; message: string; metadata: any }>
    autoValidate?: boolean
  }): Promise<ApiResponse<Proposal>> =>
    api.post('/proposals/manual', data).then(res => res.data),

  createEditionUpdateComplete: (data: {
    editionId: string
    userModifiedChanges?: Record<string, any>
    userModifiedRaceChanges?: Record<string, any>
    justification?: string
    autoValidate?: boolean
  }): Promise<ApiResponse<{
    proposal: {
      id: string
      type: string
      status: string
      eventId: string
      editionId: string
      eventName: string
      editionYear: number
    }
  }>> =>
    api.post('/proposals/edition-update-complete', data).then(res => res.data),

  update: (
    id: string,
    data: {
      status?: string;
      reviewedBy?: string;
      appliedChanges?: Record<string, any>;
      userModifiedChanges?: Record<string, any>;
      modificationReason?: string;
      modifiedBy?: string;
      block?: string;
      killEvent?: boolean;
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

  unapprove: (id: string): Promise<ApiResponse<{ proposalId: string; newStatus: string; deletedApplications: number }>> =>
    api.post(`/proposals/${id}/unapprove`).then(res => res.data),

  unapproveBlock: (id: string, block: string): Promise<ApiResponse<{ proposalId: string; block: string; newStatus: string; approvedBlocks: Record<string, boolean> }>> =>
    api.post(`/proposals/${id}/unapprove-block`, { block }).then(res => res.data),

  convertToEditionUpdate: (
    id: string,
    data: {
      eventId: number
      editionId: number
      eventName: string
      eventSlug: string
      editionYear: string
    }
  ): Promise<ApiResponse<{
    originalProposal: { id: string; status: string }
    newProposal: {
      id: string
      type: string
      status: string
      eventId: string
      editionId: string
      eventName: string
      editionYear: number
    }
  }>> =>
    api.post(`/proposals/${id}/convert-to-edition-update`, data).then(res => res.data),

  checkExistingEvent: (id: string): Promise<{
    hasMatch: boolean
    match?: {
      type: 'EXACT_MATCH' | 'FUZZY_MATCH'
      eventId: number
      eventName: string
      eventSlug: string
      eventCity: string
      editionId?: number
      editionYear?: string
      confidence: number
    }
    proposalData: {
      eventName: string | null
      eventCity: string | null
      eventDepartment: string | null
      editionYear: number | null
      editionDate: string | null
    }
  }> => api.get(`/proposals/${id}/check-existing-event`).then(res => res.data),

  changeTarget: (
    id: string,
    data: {
      eventId: number
      editionId: number
      eventName: string
      eventSlug: string
      editionYear: string
    }
  ): Promise<ApiResponse<any>> =>
    api.post(`/proposals/${id}/change-target`, data).then(res => res.data),

  // Édition de propositions (pour useProposalEditor)
  updateUserModifications: (
    id: string,
    modifications: Record<string, any>
  ): Promise<ApiResponse<Proposal>> =>
    api.put(`/proposals/${id}`, { userModifiedChanges: modifications }).then(res => res.data),

  validateBlock: (
    id: string,
    blockKey: string,
    payload: Record<string, any>
  ): Promise<ApiResponse<Proposal>> =>
    api.post(`/proposals/${id}/validate-block`, { block: blockKey, payload }).then(res => res.data),

  unvalidateBlock: (
    id: string,
    blockKey: string
  ): Promise<ApiResponse<Proposal>> =>
    api.post(`/proposals/${id}/unvalidate-block`, { block: blockKey }).then(res => res.data),

  // ✅ MODE GROUPÉ : Validation de bloc pour plusieurs propositions
  validateBlockGroup: (
    proposalIds: string[],
    blockKey: string,
    changes: Record<string, any>
  ): Promise<ApiResponse<Proposal[]>> =>
    api.post('/proposals/validate-block-group', { proposalIds, block: blockKey, changes }).then(res => res.data),

  // Compte les propositions éligibles pour l'auto-validation
  getEligibleCount: (): Promise<ApiResponse<{ count: number }>> =>
    api.get('/proposals/eligible-count').then(res => res.data),
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

  getAutoApplyStatus: (): Promise<ApiResponse<{
    enabled: boolean
    intervalMinutes: number
    lastRunAt: string | null
    nextRunAt: string | null
    lastRunResult: {
      success: number
      failed: number
      errors: string[]
      appliedIds: string[]
      failedIds: string[]
    } | null
    isSchedulerRunning: boolean
    isCurrentlyApplying: boolean
  }>> =>
    api.get('/settings/auto-apply-status').then(res => res.data),

  runAutoApply: (): Promise<ApiResponse<{
    success: number
    failed: number
    errors: string[]
    appliedIds: string[]
    failedIds: string[]
  }>> =>
    api.post('/settings/run-auto-apply').then(res => res.data),
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

// Events API (gestion des événements)
export const eventsApi = {
  kill: (eventId: string): Promise<ApiResponse<{ status: string }>> =>
    api.post(`/events/${eventId}/kill`).then(res => res.data),

  revive: (eventId: string, editionId?: string): Promise<ApiResponse<{ status: string; revivedProposalsCount?: number }>> =>
    api.post(`/events/${eventId}/revive`, editionId ? { editionId } : {}).then(res => res.data),
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

// Stats API
export const statsApi = {
  getCalendarConfirmations: (filters: {
    startDate?: string
    endDate?: string
    granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  } = {}): Promise<ApiResponse<{
    startDate: string
    endDate: string
    granularity: string
    results: Array<{
      date: string
      count: number
      timestamp: string
    }>
  }>> =>
    api.get('/stats/calendar-confirmations', { params: filters }).then(res => res.data),

  getPendingConfirmations: (filters: {
    startDate?: string
    endDate?: string
    granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  } = {}): Promise<ApiResponse<{
    startDate: string
    endDate: string
    granularity: string
    results: Array<{
      date: string
      confirmed: number
      toBeConfirmed: number
      total: number
      timestamp: string
    }>
  }>> =>
    api.get('/stats/pending-confirmations', { params: filters }).then(res => res.data),

  getProposalsCreated: (filters: {
    startDate?: string
    endDate?: string
    granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  } = {}): Promise<ApiResponse<{
    startDate: string
    endDate: string
    granularity: string
    results: Array<{
      date: string
      timestamp: string
      total: number
      NEW_EVENT: number
      EVENT_UPDATE: number
      EDITION_UPDATE: number
      RACE_UPDATE: number
    }>
  }>> =>
    api.get('/stats/proposals-created', { params: filters }).then(res => res.data),

  getUserLeaderboard: (filters: {
    startDate?: string
    endDate?: string
  } = {}): Promise<ApiResponse<{
    startDate: string
    endDate: string
    leaderboard: Array<{
      userId: string
      firstName: string
      lastName: string
      email: string
      approved: number
      rejected: number
      archived: number
      total: number
    }>
  }>> =>
    api.get('/stats/user-leaderboard', { params: filters }).then(res => res.data),
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
