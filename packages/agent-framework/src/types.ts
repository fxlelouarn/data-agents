import { AgentType, LogLevel, ProposalType } from '@data-agents/types'

// Core agent configuration
export interface AgentConfig {
  id: string
  name: string
  description?: string
  type: AgentType
  frequency: string // Cron expression
  isActive: boolean
  config: Record<string, any>
}

// Agent execution context
export interface AgentContext {
  runId: string
  startedAt: Date
  logger: AgentLogger
  config: Record<string, any>
}

// Logger interface
export interface AgentLogger {
  debug(message: string, data?: any): void
  info(message: string, data?: any): void
  warn(message: string, data?: any): void
  error(message: string, data?: any): void
}

// Event data structures (matching Miles Republic format)
export interface EventData {
  id?: string
  name: string
  city: string
  
  // Location details
  country: string
  countrySubdivisionNameLevel1: string // Région/État
  countrySubdivisionDisplayCodeLevel1?: string
  countrySubdivisionNameLevel2: string // Département
  countrySubdivisionDisplayCodeLevel2?: string
  longitude?: number
  latitude?: number
  fullAddress?: string
  
  // Social media and web
  websiteUrl?: string
  facebookUrl?: string
  twitterUrl?: string
  instagramUrl?: string
  
  // Visual content
  images?: string[]
  coverImage?: string
  
  // Metadata
  status?: 'DEAD' | 'DRAFT' | 'REVIEW' | 'LIVE' | 'DELETED'
  dataSource?: 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
  isPrivate?: boolean
  isFeatured?: boolean
  isRecommended?: boolean
  slug?: string
}

export interface EditionData {
  id?: string
  eventId?: string
  year: string // Correspond au champ 'year' text dans Miles Republic
  
  // Dates d'édition
  startDate?: Date
  endDate?: Date
  
  // Statuts
  status?: 'DRAFT' | 'LIVE'
  calendarStatus: 'TO_BE_CONFIRMED' | 'CONFIRMED' | 'CANCELLED' // aligné avec enum Miles Republic
  clientStatus?: 'EXTERNAL_SALES_FUNNEL' | 'INTERNAL_SALES_FUNNEL' | 'NEW_SALES_FUNNEL'
  
  // Inscriptions
  registrationOpeningDate?: Date // nom correct Miles Republic
  registrationClosingDate?: Date  // nom correct Miles Republic
  registrantsNumber?: number
  
  // Configuration
  timeZone?: string // nom correct Miles Republic
  currency?: string
  federationId?: string
  
  // Metadata
  dataSource?: 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
  customerType?: 'BASIC' | 'PREMIUM' | 'ESSENTIAL' | 'LEAD_INT' | 'LEAD_EXT' | 'MEDIA'
  medusaVersion?: 'V1' | 'V2'
}

export interface RaceData {
  id?: string
  editionId?: string
  name: string
  startDate?: Date
  
  // Distances for different activities
  swimDistance?: number
  walkDistance?: number
  bikeDistance?: number
  runDistance?: number
  runDistance2?: number
  swimRunDistance?: number
  bikeRunDistance?: number
  
  // Elevations
  runPositiveElevation?: number
  runNegativeElevation?: number
  bikePositiveElevation?: number
  bikeNegativeElevation?: number
  walkPositiveElevation?: number
  walkNegativeElevation?: number
  
  // Classification (conservé seulement distanceCategory qui est utilisé)
  distanceCategory?: 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
  
  // Registration and pricing
  price?: number
  priceType?: 'PER_TEAM' | 'PER_PERSON'
  paymentCollectionType?: 'SINGLE' | 'MULTIPLE'
  registrationOpeningDate?: Date
  registrationClosingDate?: Date
  
  // Team configuration
  maxTeamSize?: number
  minTeamSize?: number
  
  // License and justifications
  licenseNumberType?: 'FFA' | 'FFTRI' | 'FFS' | 'NONE'
  adultJustificativeOptions?: 'MEDICAL_CERTIFICATE' | 'NONE'
  minorJustificativeOptions?: 'HEALTH_QUESTIONNAIRE' | 'PARENTAL_AUTHORIZATION' | 
                             'CHECKBOX_AUTHORIZATION' | 'NONE'
  
  // Note: Stock management now handled by UI via Form system
  
  // Status flags
  isActive?: boolean
  isArchived?: boolean
  resaleEnabled?: boolean
  
  // External integrations
  externalFunnelURL?: string
  medusaProductId?: string
  raceVariantStoreId?: string
  
  // Categories
  categoryLevel1?: string
  categoryLevel2?: string
  
  // Federation
  federationId?: string
  
  // Data source tracking
  dataSource?: 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
  
  // Legacy field for compatibility (conservé pour compatibilité)
  timeZone?: string
}

// Extraction result
export interface ExtractionResult {
  events: EventData[]
  editions: EditionData[]
  races: RaceData[]
  confidence: number // 0-1
  source: string // URL or identifier
}

// Proposal structure
export interface ProposalData {
  type: ProposalType
  eventId?: string
  editionId?: string
  raceId?: string
  changes: Record<string, {
    old?: any
    new: any
    confidence: number
  }>
  justification: {
    type: 'url' | 'image' | 'html' | 'text'
    content: string
    metadata?: Record<string, any>
  }[]
}

// Agent run result
export interface AgentRunResult {
  success: boolean
  extractedData?: ExtractionResult[]
  proposals?: ProposalData[]
  message?: string
  metrics?: Record<string, any>
}

// Base agent interface
export interface IAgent {
  readonly config: AgentConfig
  
  // Main execution method
  run(context: AgentContext): Promise<AgentRunResult>
  
  // Validation method
  validate(): Promise<boolean>
  
  // Get agent status
  getStatus(): Promise<{
    healthy: boolean
    lastRun?: Date
    nextRun?: Date
    message?: string
  }>
}

// Configuration schema for dynamic forms
export interface ConfigFieldOption {
  value: string
  label: string
}

export interface ConfigFieldValidation {
  required?: boolean
  min?: number
  max?: number
  step?: number
  pattern?: string
  message?: string
}

export interface ConfigField {
  name: string
  label: string
  type: 'text' | 'number' | 'password' | 'select' | 'textarea' | 'switch' | 'slider'
  category?: string
  required?: boolean
  defaultValue?: any
  description?: string
  helpText?: string
  placeholder?: string
  options?: ConfigFieldOption[]
  validation?: ConfigFieldValidation
}

export interface ConfigCategory {
  id: string
  label: string
  description?: string
}

export interface ConfigSchema {
  title: string
  description?: string
  categories?: ConfigCategory[]
  fields: ConfigField[]
}
