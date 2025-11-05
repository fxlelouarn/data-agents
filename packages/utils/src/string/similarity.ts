/**
 * String Similarity Utilities
 * 
 * ✅ REFACTORED from BaseAgent (Phase 5)
 * 
 * Extracted to make reusable across all agents and services
 */

import stringSimilarity from 'string-similarity'

/**
 * Calculate similarity between two text strings
 * 
 * Uses Dice's Coefficient algorithm (bigram comparison)
 * Returns a value between 0 (completely different) and 1 (identical)
 * 
 * @param text1 - First text string
 * @param text2 - Second text string
 * @returns Similarity score between 0 and 1
 * 
 * @example
 * ```typescript
 * calculateSimilarity('Marathon de Paris', 'Marathon Paris')  // ~0.9
 * calculateSimilarity('Marathon de Paris', 'Semi Marathon')   // ~0.3
 * calculateSimilarity('Hello', 'World')                        // ~0.0
 * ```
 * 
 * @see https://github.com/aceakash/string-similarity
 */
export function calculateSimilarity(text1: string, text2: string): number {
  return stringSimilarity.compareTwoStrings(
    text1.toLowerCase(), 
    text2.toLowerCase()
  )
}

/**
 * Find the best match for a string in an array of candidates
 * 
 * @param mainString - String to match
 * @param candidates - Array of candidate strings
 * @returns Best match with its rating and index
 * 
 * @example
 * ```typescript
 * findBestMatch('Marathon Paris', [
 *   'Marathon de Paris',
 *   'Semi-Marathon de Paris',
 *   '10km de Paris'
 * ])
 * // { bestMatch: 'Marathon de Paris', rating: 0.9, bestMatchIndex: 0 }
 * ```
 */
export function findBestMatch(
  mainString: string, 
  candidates: string[]
): { bestMatch: string; rating: number; bestMatchIndex: number } {
  const ratings = stringSimilarity.findBestMatch(
    mainString.toLowerCase(), 
    candidates.map(c => c.toLowerCase())
  )
  
  return {
    bestMatch: candidates[ratings.bestMatchIndex],
    rating: ratings.bestMatch.rating,
    bestMatchIndex: ratings.bestMatchIndex
  }
}
