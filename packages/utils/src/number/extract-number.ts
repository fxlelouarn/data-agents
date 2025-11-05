/**
 * Number Extraction Utilities
 * 
 * ✅ REFACTORED from BaseAgent (Phase 5)
 * 
 * Extracted to make reusable across all agents and services
 */

/**
 * Extract numeric value from text string
 * 
 * Handles:
 * - Currency symbols (€, $, £)
 * - Thousands separators (commas, spaces)
 * - Decimal separators (period)
 * - Optional units (km, m, kg, etc.)
 * 
 * @param text - Text containing number
 * @param unit - Optional unit to remove (e.g., 'km', 'm', '€')
 * @returns Extracted number or undefined if not found
 * 
 * @example
 * ```typescript
 * extractNumber('25€')                  // 25
 * extractNumber('42.195 km', 'km')      // 42.195
 * extractNumber('1,250.50€')            // 1250.5
 * extractNumber('Distance: 10km', 'km') // 10
 * extractNumber('No number here')       // undefined
 * ```
 */
export function extractNumber(text: string, unit?: string): number | undefined {
  try {
    // Remove common currency symbols and separators
    let cleaned = text.replace(/[€$£,\s]/g, '')
    
    // Remove unit if specified
    if (unit) {
      cleaned = cleaned.replace(new RegExp(unit, 'gi'), '')
    }

    // Extract number (integer or decimal)
    const match = cleaned.match(/(\d+(?:\.\d+)?)/)
    return match ? parseFloat(match[1]) : undefined
  } catch {
    return undefined
  }
}

/**
 * Extract price from text
 * 
 * Specifically optimized for price extraction
 * 
 * @param text - Text containing price
 * @returns Extracted price or undefined
 * 
 * @example
 * ```typescript
 * extractPrice('Prix: 25€')           // 25
 * extractPrice('From $99.99')         // 99.99
 * extractPrice('1,250.00 EUR')        // 1250
 * extractPrice('Free registration')   // undefined
 * ```
 */
export function extractPrice(text: string): number | undefined {
  return extractNumber(text)
}

/**
 * Extract distance from text
 * 
 * Handles km and m units
 * 
 * @param text - Text containing distance
 * @returns Extracted distance in km or undefined
 * 
 * @example
 * ```typescript
 * extractDistance('42.195 km')     // 42.195
 * extractDistance('10000m')        // 10 (converted to km)
 * extractDistance('Marathon 42km') // 42
 * ```
 */
export function extractDistance(text: string): number | undefined {
  // Try km first
  let distance = extractNumber(text, 'km')
  if (distance !== undefined) return distance

  // Try meters and convert to km
  distance = extractNumber(text, 'm')
  if (distance !== undefined) return distance / 1000

  // Try without unit
  return extractNumber(text)
}

/**
 * Extract elevation from text
 * 
 * @param text - Text containing elevation
 * @returns Extracted elevation in meters or undefined
 * 
 * @example
 * ```typescript
 * extractElevation('D+: 1500m')    // 1500
 * extractElevation('+850m')        // 850
 * extractElevation('2,500m D+')    // 2500
 * ```
 */
export function extractElevation(text: string): number | undefined {
  // Remove D+ prefix if present
  const cleaned = text.replace(/D\+/gi, '')
  return extractNumber(cleaned, 'm')
}

/**
 * Parse range of numbers from text
 * 
 * @param text - Text containing range (e.g., "25-30km", "€50-€75")
 * @param unit - Optional unit
 * @returns { min, max } or undefined
 * 
 * @example
 * ```typescript
 * extractRange('25-30km', 'km')  // { min: 25, max: 30 }
 * extractRange('€50-€75')        // { min: 50, max: 75 }
 * extractRange('42km')           // undefined (not a range)
 * ```
 */
export function extractRange(
  text: string, 
  unit?: string
): { min: number; max: number } | undefined {
  try {
    // Remove unit and currency symbols
    let cleaned = text.replace(/[€$£,\s]/g, '')
    if (unit) {
      cleaned = cleaned.replace(new RegExp(unit, 'gi'), '')
    }

    // Look for range pattern (e.g., "25-30" or "25to30")
    const rangeMatch = cleaned.match(/(\d+(?:\.\d+)?)[-–—to]+(\d+(?:\.\d+)?)/)
    if (rangeMatch) {
      return {
        min: parseFloat(rangeMatch[1]),
        max: parseFloat(rangeMatch[2])
      }
    }

    return undefined
  } catch {
    return undefined
  }
}
