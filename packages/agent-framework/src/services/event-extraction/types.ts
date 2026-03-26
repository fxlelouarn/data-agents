/**
 * Types for the shared LLM event extraction service.
 * Designed for reuse across FFA, Slack, and future agents.
 */

import { MatchingLogger } from '../event-matching/types'

/** Source of content to extract event data from */
export type ExtractionSource =
  | { type: 'html'; content: string }
  | { type: 'text'; content: string }
  | { type: 'image'; imageData: Buffer; mimeType: string }

/** Options for extraction */
export interface ExtractionOptions {
  /** Agent-specific context for the prompt (e.g. "Page FFA, compétition départementale") */
  context?: string
  /** Timeout in ms (default: 15000) */
  timeout?: number
}

/** Result of extraction */
export interface ExtractionResult {
  success: boolean
  data?: ExtractedEventData
  error?: string
}

/** Extracted event data — shared format across all agents */
export interface ExtractedEventData {
  eventName: string
  eventCity?: string
  eventCountry?: string
  eventDepartment?: string
  editionYear?: number
  editionDate?: string        // ISO date YYYY-MM-DD
  editionEndDate?: string     // ISO date YYYY-MM-DD
  races?: ExtractedRace[]
  organizerName?: string
  organizerEmail?: string
  organizerPhone?: string
  organizerWebsite?: string
  registrationUrl?: string
  confidence: number          // 0-1
}

/** Extracted race data */
export interface ExtractedRace {
  name: string
  distance?: number           // meters (0 or omitted if not applicable)
  elevation?: number          // D+ meters
  startTime?: string          // HH:mm
  price?: number              // euros
  raceDate?: string           // DD/MM for multi-day events
  description?: string        // free text for special formats (e.g. "relais 24h, boucle 4.4km")
  categoryLevel1?: string     // RUNNING, TRAIL, WALK, OTHER
  categoryLevel2?: string     // MARATHON, ULTRA_TRAIL, etc.
}

/** Configuration for the LLM extractor */
export interface LLMExtractorConfig {
  apiKey: string
  model?: string              // default: 'claude-haiku-4-5-20251001'
  logger?: MatchingLogger
}
