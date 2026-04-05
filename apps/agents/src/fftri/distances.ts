/**
 * FFTRI Standard Distances Reference Table
 *
 * Maps FFTRI sport type + format codes to standard race distances.
 * swimDistance is in meters, bikeDistance and runDistance are in km.
 */

export interface FFTRIDistances {
  swimDistance?: number
  bikeDistance?: number
  runDistance?: number
}

const TRIATHLON_DISTANCES: Record<string, FFTRIDistances> = {
  XXS: { swimDistance: 100, bikeDistance: 4, runDistance: 1 },
  XS: { swimDistance: 400, bikeDistance: 10, runDistance: 2.5 },
  S: { swimDistance: 750, bikeDistance: 20, runDistance: 5 },
  M: { swimDistance: 1500, bikeDistance: 40, runDistance: 10 },
  L: { swimDistance: 3000, bikeDistance: 80, runDistance: 30 },
  XL: { swimDistance: 3000, bikeDistance: 120, runDistance: 30 },
  XXL: { swimDistance: 3800, bikeDistance: 180, runDistance: 42.195 },
}

const DUATHLON_DISTANCES: Record<string, FFTRIDistances> = {
  XS: { bikeDistance: 10, runDistance: 3.75 },
  S: { bikeDistance: 20, runDistance: 7.5 },
  M: { bikeDistance: 40, runDistance: 15 },
  L: { bikeDistance: 60, runDistance: 20 },
}

const AQUATHLON_DISTANCES: Record<string, FFTRIDistances> = {
  XS: { swimDistance: 250, runDistance: 1.5 },
  S: { swimDistance: 750, runDistance: 5 },
  M: { swimDistance: 1500, runDistance: 10 },
}

const FORMAT_SUFFIX_PATTERN = /-(OP|EQ|CLM|OPEN|JEUNES-N|JEUNES)$/

/**
 * Strips known FFTRI format suffixes before matching.
 * e.g. "S-OP" → "S", "M-CLM" → "M", "S-JEUNES-N" → "S"
 */
function normalizeFormat(format: string): string {
  return format.replace(FORMAT_SUFFIX_PATTERN, '')
}

/**
 * Returns standard distances for a given FFTRI sport type and format.
 *
 * @param sportType - FFTRI sport type (e.g. 'TRI', 'DUA', 'X-DUA', 'AQUA', 'RAID', ...)
 * @param format - FFTRI format code (e.g. 'S', 'M', 'S-OP', 'M-CLM', ...)
 * @returns Standard distances object, or null if distances are not standardized for this sport type
 */
export function getStandardDistances(
  sportType: string,
  format: string
): FFTRIDistances | null {
  const normalizedFormat = normalizeFormat(format)

  switch (sportType) {
    case 'TRI':
      return TRIATHLON_DISTANCES[normalizedFormat] ?? null

    case 'DUA':
    case 'X-DUA':
      return DUATHLON_DISTANCES[normalizedFormat] ?? null

    case 'AQUA':
      return AQUATHLON_DISTANCES[normalizedFormat] ?? null

    // Non-standardized sport types
    case 'X-TRI':
    case 'S&R':
    case 'S&B':
    case 'B&R':
    case 'RAID':
    case 'CYCL':
    default:
      return null
  }
}
