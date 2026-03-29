/**
 * Configuration for the Edition Confirmation Agent
 */
export interface EditionConfirmationConfig {
  sourceDatabase: string       // Miles Republic database ID
  batchSize: number            // Editions to process per run (default: 30)
  cooldownDays: number         // Days before re-checking an edition (default: 14)
  lookAheadMonths: number      // How far ahead to look for editions (default: 3)
  requestDelayMs: number       // Delay between HTTP requests (default: 3000)
  requestTimeoutMs: number     // HTTP request timeout (default: 10000)
  anthropicApiKey?: string     // Anthropic API key (falls back to env)
  llmModel?: string            // LLM model for analysis (default: claude-haiku-4-5-20251001)
  dryRun?: boolean             // Log proposals without creating them
}

/**
 * An edition target with all its available URLs to check
 */
export interface EditionTarget {
  editionId: number
  eventId: number
  eventName: string
  eventCity: string | null
  editionYear: string
  startDate: Date | null
  urls: UrlSource[]
}

/**
 * A URL to check with its source type
 */
export interface UrlSource {
  url: string
  sourceType: 'event' | 'organizer' | 'timer'
  sourceName?: string  // e.g., organizer name
}

/**
 * Result of checking a single URL
 */
export interface UrlCheckResult {
  url: string
  sourceType: UrlSource['sourceType']
  isAlive: boolean
  httpStatus?: number
  isDead: boolean           // 404, domain expired, parking page
  errorReason?: string      // e.g., 'DNS_FAILURE', 'HTTP_404', 'PARKING_PAGE', 'TIMEOUT'
  htmlText?: string         // Extracted text content (if alive)
  contentLength?: number
}

/**
 * LLM analysis result for a page
 */
export interface PageAnalysisResult {
  confirmed: boolean
  canceled: boolean
  registrationOpen: boolean
  datesFound: string[]          // ISO date strings found on page
  yearMentioned: boolean        // Whether the target year appears on page
  confidence: number            // LLM's own confidence (0-1)
  reasoning: string             // Short explanation
}

/**
 * Final result for one edition after checking all its URLs
 */
export interface EditionCheckResult {
  editionId: number
  eventId: number
  eventName: string
  eventCity: string | null
  editionYear: string
  startDate: Date | null
  urlResults: UrlCheckResultWithAnalysis[]
  decision: 'CONFIRMED' | 'CANCELED' | 'INCONCLUSIVE'
  finalConfidence: number
  deadUrls: UrlCheckResult[]    // URLs that are dead
}

export interface UrlCheckResultWithAnalysis extends UrlCheckResult {
  analysis?: PageAnalysisResult
}

/**
 * Agent state persisted between runs
 */
export interface ConfirmationProgress {
  lastOffset: number
  lastRunAt: string
  stats: ConfirmationStats
}

export interface ConfirmationStats {
  totalChecked: number
  confirmed: number
  canceled: number
  inconclusive: number
  deadUrls: number
  errors: number
}
