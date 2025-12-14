/**
 * Event Matching Service
 *
 * Mutualized service for matching events against an existing database.
 * Used by FFA, Slack, and other agents.
 */

// Main matching functions
export {
  matchEvent,
  matchRaces,
  matchRacesByDistanceAndName, // Legacy wrapper for backwards compatibility
  calculateAdjustedConfidence,
  calculateNewEventConfidence,
  DEFAULT_MATCHING_CONFIG,
  // Utility functions (deprecated but kept for compatibility)
  calculateSimilarity,
  levenshteinDistance,
  normalizeString,
  normalizeRaceName,
  removeEditionNumber
} from './event-matcher'

// Types
export {
  EventMatchInput,
  EventMatchResult,
  RejectedMatch,
  MatchingConfig,
  MatchingLogger,
  defaultLogger,
  RaceMatchInput,
  DbRace,
  RaceMatchResult
} from './types'

// Stopwords and keywords
export {
  EVENT_NAME_STOPWORDS,
  EVENT_SPONSORS,
  CITY_NAME_STOPWORDS,
  removeStopwords,
  removeSponsors,
  extractKeywords,
  getPrimaryKeyword,
  calculateNameQuality
} from './stopwords'

// Department utilities
export {
  FRENCH_DEPARTMENTS,
  getDepartmentName,
  normalizeDepartmentCode
} from './departments'
