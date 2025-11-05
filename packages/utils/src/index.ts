/**
 * @data-agents/utils
 * 
 * ✅ REFACTORED from BaseAgent (Phase 5)
 * 
 * Shared utility functions for data extraction, parsing, and transformation
 * Used across all agents and services in the data-agents monorepo
 * 
 * @packageDocumentation
 */

// ============== DATE UTILITIES ==============
export { parseDate, extractYear } from './date/parse-date'

// ============== STRING UTILITIES ==============
export { 
  calculateSimilarity, 
  findBestMatch 
} from './string/similarity'

export { 
  normalizeEventName, 
  normalizeText, 
  slugify, 
  removeAccents 
} from './string/normalize'

// ============== NUMBER UTILITIES ==============
export { 
  extractNumber, 
  extractPrice, 
  extractDistance, 
  extractElevation,
  extractRange
} from './number/extract-number'
