/**
 * Types for the Event Matching Service
 *
 * These types are generic and not specific to any data source (FFA, Slack, etc.)
 */

/**
 * Input data for event matching
 * This is what agents provide to find a match
 */
export interface EventMatchInput {
  /** Event name (will be normalized) */
  eventName: string
  /** City where the event takes place */
  eventCity: string
  /** Department code (e.g., "21", "2A", "974") */
  eventDepartment?: string
  /** Date of the edition to match */
  editionDate: Date
  /** Optional: year to match (extracted from editionDate if not provided) */
  editionYear?: number
}

/**
 * Result of matching an event
 */
export interface EventMatchResult {
  /** Type of match found */
  type: 'NO_MATCH' | 'FUZZY_MATCH' | 'EXACT_MATCH'

  /** Matched event details (if found) */
  event?: {
    id: number | string
    name: string
    city: string
    slug?: string
    similarity: number
  }

  /** Matched edition details (if found) */
  edition?: {
    id: number | string
    year: string
    startDate?: Date
  }

  /** Overall confidence score (0-1) */
  confidence: number

  /** Top 3 rejected matches for NEW_EVENT proposals */
  rejectedMatches?: RejectedMatch[]
}

/**
 * A rejected match candidate (for justification)
 */
export interface RejectedMatch {
  eventId: number | string
  eventName: string
  eventSlug?: string
  eventCity: string
  eventDepartment?: string
  editionId?: number | string
  editionYear?: string
  matchScore: number
  nameScore: number
  cityScore: number
  departmentMatch: boolean
  dateProximity: number
}

/**
 * Configuration for Meilisearch integration
 */
export interface MeilisearchMatchingConfig {
  /** Meilisearch server URL */
  url: string
  /** Meilisearch API key (search key) */
  apiKey: string
  /** Index name (default: 'fra_events') */
  indexName?: string
}

/**
 * Configuration for the matching algorithm
 */
export interface MatchingConfig {
  /** Minimum similarity threshold for a match (default: 0.75) */
  similarityThreshold: number
  /** Distance tolerance for race matching in percent (default: 0.1 = 10%) */
  distanceTolerancePercent?: number
  /** Base confidence for proposals (default: 0.9) */
  confidenceBase?: number
  /** Optional Meilisearch configuration for improved search */
  meilisearch?: MeilisearchMatchingConfig
}

/**
 * Logger interface for the matching service
 */
export interface MatchingLogger {
  info: (message: string, data?: any) => void
  debug: (message: string, data?: any) => void
  warn: (message: string, data?: any) => void
  error: (message: string, data?: any) => void
}

/**
 * Default console logger
 */
export const defaultLogger: MatchingLogger = {
  info: (msg, data) => console.log(`ℹ️ [MATCHER] ${msg}`, data || ''),
  debug: (msg, data) => console.log(`🔍 [MATCHER] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`⚠️ [MATCHER] ${msg}`, data || ''),
  error: (msg, data) => console.error(`❌ [MATCHER] ${msg}`, data || '')
}

/**
 * Race matching input
 */
export interface RaceMatchInput {
  name: string
  distance?: number  // in km
  startTime?: string
}

/**
 * Race from database for matching
 */
export interface DbRace {
  id: number | string
  name: string
  runDistance?: number
  walkDistance?: number
  swimDistance?: number
  bikeDistance?: number
  startDate?: Date | string | null
  runPositiveElevation?: number | null
  [key: string]: any
}

/**
 * Race matching result
 */
export interface RaceMatchResult {
  matched: Array<{ input: RaceMatchInput, db: DbRace }>
  unmatched: RaceMatchInput[]
}
