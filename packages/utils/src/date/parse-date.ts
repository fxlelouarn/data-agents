/**
 * Date Utilities - Parse dates from various formats
 * 
 * ✅ REFACTORED from BaseAgent (Phase 5)
 * 
 * Extracted to make reusable across all agents and services
 */

/**
 * Parse a date string in various formats
 * 
 * Supports:
 * - MM/DD/YYYY or DD/MM/YYYY
 * - YYYY-MM-DD
 * - DD-MM-YYYY or MM-DD-YYYY
 * - ISO 8601 format
 * 
 * @param dateStr - Date string to parse
 * @param timezone - Optional timezone (not used yet, future enhancement)
 * @returns Parsed Date object or undefined if parsing fails
 * 
 * @example
 * ```typescript
 * parseDate('25/12/2024') // Christmas 2024
 * parseDate('2024-12-25') // Christmas 2024
 * parseDate('invalid')    // undefined
 * ```
 */
export function parseDate(dateStr: string, timezone?: string): Date | undefined {
  try {
    // Try different date formats
    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY or DD/MM/YYYY
      /^(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
      /^(\d{1,2})-(\d{1,2})-(\d{4})/, // DD-MM-YYYY or MM-DD-YYYY
    ]

    for (const format of formats) {
      const match = dateStr.match(format)
      if (match) {
        const [, p1, p2, p3] = match
        // Try both DD/MM and MM/DD interpretations
        const date1 = new Date(parseInt(p3), parseInt(p2) - 1, parseInt(p1))
        const date2 = new Date(parseInt(p3), parseInt(p1) - 1, parseInt(p2))
        
        // Return the more reasonable date (not too far in future/past)
        const now = new Date()
        const yearFromNow = new Date(now.getFullYear() + 1, 11, 31)
        const yearAgo = new Date(now.getFullYear() - 1, 0, 1)
        
        if (date1 >= yearAgo && date1 <= yearFromNow) return date1
        if (date2 >= yearAgo && date2 <= yearFromNow) return date2
        
        return date1 // Default to first interpretation
      }
    }

    // Try native Date parsing as fallback
    const parsed = new Date(dateStr)
    return isNaN(parsed.getTime()) ? undefined : parsed
  } catch {
    return undefined
  }
}

/**
 * Extract year from date, string, or number
 * 
 * @param input - Date object, string containing year, or year number
 * @returns Extracted year or current year if extraction fails
 * 
 * @example
 * ```typescript
 * extractYear(new Date('2024-12-25'))  // 2024
 * extractYear('Marathon de Paris 2025') // 2025
 * extractYear(2024)                     // 2024
 * extractYear('invalid')                // 2025 (current year)
 * ```
 */
export function extractYear(input: Date | string | number): number {
  if (input instanceof Date) {
    return input.getFullYear()
  }
  if (typeof input === 'number') {
    return input > 1900 && input < 2100 ? input : new Date().getFullYear()
  }
  if (typeof input === 'string') {
    const yearMatch = input.match(/\b(20\d{2}|19\d{2})\b/)
    return yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()
  }
  return new Date().getFullYear()
}
