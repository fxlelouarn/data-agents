/**
 * String Normalization Utilities
 * 
 * ✅ REFACTORED from BaseAgent (Phase 5)
 * 
 * Extracted to make reusable across all agents and services
 */

/**
 * Normalize event name for comparison
 * 
 * - Converts to lowercase
 * - Removes special characters (keeps alphanumeric and spaces)
 * - Collapses multiple spaces to single space
 * - Trims leading/trailing spaces
 * 
 * @param name - Event name to normalize
 * @returns Normalized event name
 * 
 * @example
 * ```typescript
 * normalizeEventName('Marathon de Paris 2024!')  // 'marathon de paris 2024'
 * normalizeEventName('Ultra-Trail du Mont-Blanc') // 'ultra trail du mont blanc'
 * normalizeEventName('10KM   de  Paris')         // '10km de paris'
 * ```
 */
export function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Replace special chars with space
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim()
}

/**
 * Normalize text for general comparison
 * 
 * More aggressive than normalizeEventName:
 * - Removes all accents/diacritics
 * - Removes all non-alphanumeric characters
 * 
 * @param text - Text to normalize
 * @returns Normalized text
 * 
 * @example
 * ```typescript
 * normalizeText('Événement sportif 2024!')  // 'evenementsportif2024'
 * normalizeText('Côte d\'Azur Marathon')     // 'cotedazurmarathon'
 * ```
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                    // Decompose accents
    .replace(/[\u0300-\u036f]/g, '')     // Remove diacritics
    .replace(/[^\w]/g, '')               // Remove all non-alphanumeric
}

/**
 * Slugify a string (URL-friendly format)
 * 
 * @param text - Text to slugify
 * @returns URL-friendly slug
 * 
 * @example
 * ```typescript
 * slugify('Marathon de Paris 2024')  // 'marathon-de-paris-2024'
 * slugify('Ultra Trail 100km')       // 'ultra-trail-100km'
 * ```
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

/**
 * Remove accents from text
 * 
 * @param text - Text with accents
 * @returns Text without accents
 * 
 * @example
 * ```typescript
 * removeAccents('Côte d\'Azur')  // 'Cote d\'Azur'
 * removeAccents('Événement')     // 'Evenement'
 * ```
 */
export function removeAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
