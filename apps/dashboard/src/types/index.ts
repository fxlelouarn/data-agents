// Agent types
export type AgentType = 'EXTRACTOR' | 'COMPARATOR' | 'VALIDATOR' | 'CLEANER' | 'DUPLICATOR' | 'SPECIFIC_FIELD'

export type RunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export type ProposalType = 'NEW_EVENT' | 'EVENT_UPDATE' | 'EDITION_UPDATE' | 'RACE_UPDATE'

export type ProposalStatus = 'PENDING' | 'PARTIALLY_APPROVED' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'

export type UpdateStatus = 'PENDING' | 'APPLIED' | 'FAILED'

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
  // Approbation par blocs
  approvedBlocks?: Record<string, boolean>
  // Modifications utilisateur
  userModifiedChanges?: Record<string, any>
  // Champs de contexte enrichis
  eventName?: string
  eventCity?: string
  editionYear?: number
  raceName?: string
  // Courses existantes de l'édition (enrichies)
  existingRaces?: Array<{
    id: number
    name: string
    distance?: number
    elevation?: number
    type?: string
    startDate?: string
  }>
  createdAt: string
  updatedAt: string
  reviewedAt?: string
  reviewedBy?: string
  agent: {
    name: string
    type: AgentType
  }
  relatedProposals?: Proposal[]
  previousEditionCalendarStatus?: string
  previousEditionYear?: number
  previousEditionStartDate?: string
  eventStatus?: 'DEAD' | 'DRAFT' | 'REVIEW' | 'LIVE' | 'DELETED'
  isFeatured?: boolean  // ✅ Enrichi depuis Event.isFeatured (Miles Republic)
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
  runDistance?: number           // ✅ Distance course à pied (km)
  bikeDistance?: number          // ✅ Distance vélo (km)
  walkDistance?: number          // ✅ Distance marche (km)
  swimDistance?: number          // ✅ Distance natation (km)
  startDate?: string
  price?: number
  elevation?: number
  runPositiveElevation?: number  // ✅ Dénivelé positif
  bikePositiveElevation?: number // ✅ Dénivelé positif vélo
  walkPositiveElevation?: number // ✅ Dénivelé positif marche
  categoryLevel1?: string        // ✅ Catégorie principale
  categoryLevel2?: string        // ✅ Sous-catégorie
  timeZone?: string              // ✅ Timezone
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

export interface ManualProposalForm {
  eventId?: string
  editionId?: string
  raceId?: string
  fieldName: string
  fieldValue: any
  type: ProposalType
  propagateToRaces?: boolean // Pour propager les dates d'édition aux courses
  justification?: string
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

// Update/Application types
export interface DataUpdate {
  id: string
  proposalId: string
  proposalIds?: string[]  // ✅ Pour applications groupées
  blockType?: string | null  // ✅ Type de bloc ('event', 'edition', 'organizer', 'races', ou null)
  status: UpdateStatus | 'PENDING' | 'APPLIED' | 'FAILED'  // ✅ Support legacy
  
  // ✅ NOUVEAU: Payload complet (agent + user merged)
  appliedChanges?: Record<string, any>
  
  scheduledAt?: string
  appliedAt?: string
  errorMessage?: string
  logs?: string[]
  createdAt: string
  updatedAt: string
  proposal: {
    id: string
    type: ProposalType
    status: ProposalStatus
    eventId?: string
    editionId?: string
    raceId?: string
    eventName?: string  // Enriched for EVENT_UPDATE
    eventCity?: string  // Enriched for EVENT_UPDATE
    changes: Record<string, {
      old?: any
      new: any
      confidence: number
    }>
    // ⚠️ userModifiedChanges devient optionnel (fallback legacy)
    userModifiedChanges?: Record<string, any>
    agent: {
      name: string
      type: AgentType
    }
  }
  context?: {
    eventName?: string
    eventCity?: string
    editionYear?: string
    raceName?: string
  }
}

export interface UpdateFilters {
  status?: UpdateStatus
  proposalId?: string
  search?: string
}
