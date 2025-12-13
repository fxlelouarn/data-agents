/**
 * Service d'inférence de catégories de courses
 * Extrait de FFAScraperAgent pour réutilisation cross-agents
 */

import { normalizeRaceName } from './race-normalizer'

/**
 * Input pour l'inférence de catégories
 */
export interface RaceEnrichmentInput {
  name: string
  runDistance?: number
  bikeDistance?: number
  swimDistance?: number
  walkDistance?: number
}

/**
 * Résultat de l'inférence de catégories
 */
export interface EnrichedRaceCategories {
  categoryLevel1: string
  categoryLevel2?: string
}

/**
 * Infère les catégories d'une course à partir de son nom et de ses distances
 *
 * L'algorithme priorise dans l'ordre :
 * 1. TRIATHLON ET VARIANTS - Très distinctifs (swim+run, swim+bike, etc.)
 * 2. CYCLING - Vélo
 * 3. TRAIL - Trails pédestres
 * 4. WALK - Marches et randonnées
 * 5. FUN - Courses fun
 * 6. OTHER - Autres sports
 * 7. RUNNING - Courses à pied (fallback par défaut)
 *
 * @param raceName Nom de la course
 * @param runDistance Distance course en km (optionnel)
 * @param bikeDistance Distance vélo en km (optionnel)
 * @param swimDistance Distance nage en km (optionnel)
 * @param walkDistance Distance marche en km (optionnel)
 * @param eventName Nom de l'événement (optionnel, utilisé comme contexte pour l'inférence)
 * @returns Tuple [categoryLevel1, categoryLevel2 | undefined]
 */
export function inferRaceCategories(
  raceName: string,
  runDistance?: number,
  bikeDistance?: number,
  swimDistance?: number,
  walkDistance?: number,
  eventName?: string
): [string, string | undefined] {
  const lowerName = normalizeRaceName(raceName)
  const eventNameLower = eventName ? normalizeRaceName(eventName) : ''

  // 1. TRIATHLON ET VARIANTS - Prioritaire car très distinctifs
  if (lowerName.includes('swim') && lowerName.includes('run')) return ['TRIATHLON', 'SWIM_RUN']
  if (lowerName.includes('swim') && lowerName.includes('bike')) return ['TRIATHLON', 'SWIM_BIKE']
  if (lowerName.includes('run') && lowerName.includes('bike')) return ['TRIATHLON', 'RUN_BIKE']
  if (lowerName.includes('aquathlon')) return ['TRIATHLON', 'AQUATHLON']
  if (lowerName.includes('duathlon')) return ['TRIATHLON', 'DUATHLON']
  if (lowerName.includes('cross triathlon') || lowerName.includes('cross-triathlon')) {
    return ['TRIATHLON', 'CROSS_TRIATHLON']
  }
  if (lowerName.includes('ultra triathlon')) return ['TRIATHLON', 'ULTRA_TRIATHLON']
  if (lowerName.includes('triathlon')) {
    // Déduire la taille du triathlon
    if (lowerName.includes('enfant') || lowerName.includes('kids')) return ['TRIATHLON', 'TRIATHLON_KIDS']
    if (lowerName.includes('xs')) return ['TRIATHLON', 'TRIATHLON_XS']
    if (lowerName.match(/\bm\b/)) return ['TRIATHLON', 'TRIATHLON_M']
    if (lowerName.match(/\bl\b/)) return ['TRIATHLON', 'TRIATHLON_L']
    if (lowerName.includes('xxl') || lowerName.includes('ultra')) return ['TRIATHLON', 'TRIATHLON_XXL']
    if (lowerName.match(/\bs\b/)) return ['TRIATHLON', 'TRIATHLON_S'] // Après les autres pour éviter matchage partiel
    // Si distances détectées, classifier par tailles standard
    if (swimDistance && bikeDistance && runDistance) {
      if (swimDistance <= 0.75 && bikeDistance <= 20 && runDistance <= 5) return ['TRIATHLON', 'TRIATHLON_XS']
      if (swimDistance <= 1.5 && bikeDistance <= 40 && runDistance <= 10) return ['TRIATHLON', 'TRIATHLON_S']
      if (swimDistance <= 2 && bikeDistance <= 90 && runDistance <= 21) return ['TRIATHLON', 'TRIATHLON_M']
      if (swimDistance <= 3 && bikeDistance <= 180 && runDistance <= 42) return ['TRIATHLON', 'TRIATHLON_L']
    }
    return ['TRIATHLON', undefined]
  }

  // 2. CYCLING - Vélo
  if (lowerName.includes('gravel')) {
    return lowerName.includes('race') ? ['CYCLING', 'GRAVEL_RACE'] : ['CYCLING', 'GRAVEL_RIDE']
  }
  if (lowerName.includes('gran fondo') || lowerName.includes('granfondo')) return ['CYCLING', 'GRAN_FONDO']
  if (lowerName.includes('enduro') && (lowerName.includes('vtt') || lowerName.includes('mountain'))) {
    return ['CYCLING', 'ENDURO_MOUNTAIN_BIKE']
  }
  if (lowerName.includes('xc') && (lowerName.includes('vtt') || lowerName.includes('mountain'))) {
    return ['CYCLING', 'XC_MOUNTAIN_BIKE']
  }
  if ((lowerName.includes('vtt') || lowerName.includes('mountain')) && !lowerName.includes('triathlon')) {
    return ['CYCLING', 'MOUNTAIN_BIKE_RIDE']
  }
  if (lowerName.includes('bikepacking') || lowerName.includes('bike packing')) return ['CYCLING', 'BIKEPACKING']
  if (lowerName.includes('ultra cycling') || (lowerName.includes('ultra') && bikeDistance && bikeDistance > 200)) {
    return ['CYCLING', 'ULTRA_CYCLING']
  }
  if (
    lowerName.includes('contre-la-montre') ||
    lowerName.includes('clm') ||
    lowerName.includes('time trial') ||
    /\btt\b/.test(lowerName)
  ) {
    return ['CYCLING', 'TIME_TRIAL']
  }
  if (lowerName.includes('touring') || lowerName.includes('cyclo')) return ['CYCLING', 'CYCLE_TOURING']
  if (
    lowerName.includes('velo') ||
    lowerName.includes('vélo') ||
    lowerName.includes('cyclisme') ||
    lowerName.includes('cycling')
  ) {
    // Fallback par distance si disponible
    if (bikeDistance && bikeDistance > 100) return ['CYCLING', 'GRAN_FONDO']
    return ['CYCLING', 'ROAD_CYCLING_TOUR']
  }

  // 3. TRAIL - Trails pédestres
  // Check both race name AND event name for "trail" context
  const isTrailContext = lowerName.includes('trail') || eventNameLower.includes('trail')
  if (isTrailContext) {
    // Classifier par distance
    if (runDistance) {
      if (runDistance <= 21) return ['TRAIL', 'DISCOVERY_TRAIL']
      if (runDistance <= 41) return ['TRAIL', 'SHORT_TRAIL']
      if (runDistance <= 80) return ['TRAIL', 'LONG_TRAIL']
      if (runDistance > 80) return ['TRAIL', 'ULTRA_TRAIL']
    }
    // Si "km" dans le nom avec nombre
    if (lowerName.includes('km')) {
      const kmMatch = lowerName.match(/(\d+)\s*km/)
      if (kmMatch) {
        const km = parseInt(kmMatch[1])
        if (km <= 5) return ['TRAIL', 'KM5']
        if (km <= 10) return ['TRAIL', 'KM10']
        if (km <= 15) return ['TRAIL', 'KM15']
        if (km <= 20) return ['TRAIL', 'KM20']
      }
    }
    return ['TRAIL', 'DISCOVERY_TRAIL'] // Défaut trail
  }

  // 4. WALK - Marches et randonnées
  if (lowerName.includes('marche nordique') || lowerName.includes('nordic walk')) return ['WALK', 'NORDIC_WALK']
  if (lowerName.includes('ski de fond') || lowerName.includes('cross country skiing'))
    return ['WALK', 'CROSS_COUNTRY_SKIING']
  if (lowerName.includes('randonnee') || lowerName.includes('rando') || lowerName.includes('hiking')) {
    return ['WALK', 'HIKING']
  }
  if (lowerName.includes('marche')) return ['WALK', 'HIKING'] // Défaut marche

  // 5. FUN - Courses fun
  if (lowerName.includes('color')) return ['FUN', 'COLOR_RUN']
  if (lowerName.includes('obstacle')) return ['FUN', 'OBSTACLE_RACE']
  if (lowerName.includes('spartan')) return ['FUN', 'SPARTAN_RACE']
  if (lowerName.includes('mud')) return ['FUN', 'MUD_DAY']

  // 6. OTHER - Autres sports
  if (lowerName.includes('canicross')) return ['OTHER', 'CANICROSS']
  if (lowerName.includes('orienteering') || lowerName.includes('orientation')) return ['OTHER', 'ORIENTEERING']
  if (lowerName.includes('raid') && !lowerName.includes('triathlon')) return ['OTHER', 'RAID']
  if (lowerName.includes('biathlon')) return ['OTHER', 'BIATHLON']
  if (lowerName.includes('natation') || lowerName.includes('swimming')) return ['OTHER', 'SWIMMING']
  if (lowerName.includes('vol libre') || lowerName.includes('free flight')) return ['OTHER', 'FREE_FLIGHT']
  if (lowerName.includes('yoga')) return ['OTHER', 'YOGA']

  // 7. RUNNING - Courses à pied (fallback par défaut)
  if (lowerName.includes('vertical') || lowerName.includes('vertical km')) return ['RUNNING', 'VERTICAL_KILOMETER']
  if (lowerName.includes('cross')) return ['RUNNING', 'CROSS']
  if (lowerName.includes('ekiden')) return ['RUNNING', 'EKIDEN']
  if (lowerName.includes('marathon')) {
    if (lowerName.includes('semi') || lowerName.includes('half') || lowerName.includes('1/2')) {
      return ['RUNNING', 'HALF_MARATHON']
    }
    return ['RUNNING', 'MARATHON']
  }
  if (lowerName.includes('corrida')) return ['RUNNING', undefined]

  // Classifier par distance si fournie (RUNNING)
  // Note: HALF_MARATHON et MARATHON sont détectés par nom uniquement (ci-dessus)
  // La classification par distance utilise KM20 pour 17.5-45km car pas de KM30
  if (runDistance) {
    if (runDistance < 5) return ['RUNNING', 'LESS_THAN_5_KM']
    if (runDistance < 7.5) return ['RUNNING', 'KM5']
    if (runDistance < 12.5) return ['RUNNING', 'KM10']
    if (runDistance < 17.5) return ['RUNNING', 'KM15']
    if (runDistance < 45) return ['RUNNING', 'KM20']
    if (runDistance >= 45) return ['RUNNING', 'ULTRA_RUNNING']
  }

  // Par défaut : RUNNING
  return ['RUNNING', undefined]
}

/**
 * Enrichit les catégories d'une course
 *
 * @param input - Données de la course
 * @returns Catégories enrichies
 */
export function enrichRaceCategories(input: RaceEnrichmentInput): EnrichedRaceCategories {
  const [categoryLevel1, categoryLevel2] = inferRaceCategories(
    input.name,
    input.runDistance,
    input.bikeDistance,
    input.swimDistance,
    input.walkDistance
  )

  return {
    categoryLevel1,
    categoryLevel2,
  }
}
