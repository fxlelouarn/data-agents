import Fuse from 'fuse.js'

/**
 * Type pour représenter une course avec sa distance en mètres
 */
export interface RaceWithDistance {
  id: number | string
  name: string
  runDistance?: number
  walkDistance?: number
  swimDistance?: number
  bikeDistance?: number
  startDate?: Date | string | null
  runPositiveElevation?: number | null
  [key: string]: any
}

/**
 * Match des courses FFA avec des courses Miles Republic existantes
 * en utilisant un algorithme hybride distance + nom (fuse.js)
 * 
 * Stratégie :
 * 1. Grouper les courses DB par distance (tolérance 5%)
 * 2. Pour chaque course FFA :
 *    - Si 1 seule course DB avec cette distance → Match automatique
 *    - Si plusieurs courses DB → Fuzzy match sur le nom (fuse.js)
 *    - Si aucune course DB → Nouvelle course
 * 
 * @param ffaRaces - Courses extraites de la FFA
 * @param dbRaces - Courses existantes dans Miles Republic
 * @param logger - Logger pour debugging
 * @returns Courses matchées et non matchées
 */
export function matchRacesByDistanceAndName(
  ffaRaces: any[],
  dbRaces: RaceWithDistance[],
  logger: any
): { 
  matched: Array<{ ffa: any, db: RaceWithDistance }>, 
  unmatched: any[] 
} {
  const matched: Array<{ ffa: any, db: RaceWithDistance }> = []
  const unmatched: any[] = []
  
  // 1. Grouper les courses DB par distance (tolérance 5%)
  const racesByDistance = new Map<number, RaceWithDistance[]>()
  
  for (const race of dbRaces) {
    const totalDistanceKm = (race.runDistance || 0) + 
                            (race.walkDistance || 0) + 
                            (race.swimDistance || 0) + 
                            (race.bikeDistance || 0)
    
    if (totalDistanceKm === 0) continue
    
    // Trouver un groupe existant avec tolérance 5%
    let foundGroup = false
    for (const [groupDistance, races] of racesByDistance.entries()) {
      const tolerance = groupDistance * 0.05
      if (Math.abs(groupDistance - totalDistanceKm) <= tolerance) {
        races.push(race)
        foundGroup = true
        break
      }
    }
    
    if (!foundGroup) {
      racesByDistance.set(totalDistanceKm, [race])
    }
  }
  
  logger.info(`  🏃 Grouped ${dbRaces.length} existing races into ${racesByDistance.size} distance groups`)
  
  // Séparer les courses DB sans distance pour le fallback
  const racesWithoutDistance = dbRaces.filter(race => {
    const totalDistanceKm = (race.runDistance || 0) + 
                            (race.walkDistance || 0) + 
                            (race.swimDistance || 0) + 
                            (race.bikeDistance || 0)
    return totalDistanceKm === 0
  })
  
  if (racesWithoutDistance.length > 0) {
    logger.info(`  ℹ️  ${racesWithoutDistance.length} races without distance available for fallback matching`)
  }
  
  // 2. Matcher chaque course FFA
  for (const ffaRace of ffaRaces) {
    const ffaDistanceKm = ffaRace.runDistance || 0
    
    if (ffaDistanceKm === 0) {
      logger.info(`  ⚠️  Race "${ffaRace.name}" has no distance - treating as new race`)
      unmatched.push(ffaRace)
      continue
    }
    
    // Trouver les candidats par distance
    let candidates: RaceWithDistance[] = []
    for (const [groupDistance, races] of racesByDistance.entries()) {
      const tolerance = groupDistance * 0.05
      if (Math.abs(groupDistance - ffaDistanceKm) <= tolerance) {
        candidates = races
        break
      }
    }
    
    if (candidates.length === 0) {
      // Aucune course avec cette distance
      // ✅ FALLBACK: Essayer de matcher avec les courses sans distance
      if (racesWithoutDistance.length > 0) {
        logger.info(`  🔍 Race "${ffaRace.name}" (${ffaDistanceKm}km) - no distance match, trying name fallback...`)
        const bestMatch = fuzzyMatchRaceName(ffaRace, racesWithoutDistance, logger)
        
        if (bestMatch.score >= 0.7) { // Seuil plus strict pour le fallback
          logger.info(`  ✅ Fallback match: "${ffaRace.name}" → "${bestMatch.race.name}" (score: ${bestMatch.score.toFixed(2)}, no distance in DB)`)
          matched.push({ ffa: ffaRace, db: bestMatch.race })
          continue
        } else {
          logger.info(`  ➕ Race "${ffaRace.name}" - fallback score ${bestMatch.score.toFixed(2)} below threshold 0.7`)
        }
      } else {
        logger.info(`  ➕ Race "${ffaRace.name}" (${ffaDistanceKm}km) - no existing race with this distance`)
      }
      unmatched.push(ffaRace)
    } else if (candidates.length === 1) {
      // Une seule course → Match direct (comportement actuel)
      logger.info(`  ✅ Race "${ffaRace.name}" → "${candidates[0].name}" (unique distance match)`)
      matched.push({ ffa: ffaRace, db: candidates[0] })
    } else {
      // Plusieurs courses → Fuzzy match sur le nom
      logger.info(`  🔍 Race "${ffaRace.name}" (${ffaDistanceKm}km) - ${candidates.length} candidates, fuzzy matching...`)
      const bestMatch = fuzzyMatchRaceName(ffaRace, candidates, logger)
      
      if (bestMatch.score >= 0.5) {
        logger.info(`  ✅ Race "${ffaRace.name}" → "${bestMatch.race.name}" (score: ${bestMatch.score.toFixed(2)})`)
        matched.push({ ffa: ffaRace, db: bestMatch.race })
      } else {
        // Pas de match suffisant → Nouvelle course
        logger.info(`  ➕ Race "${ffaRace.name}" - best score ${bestMatch.score.toFixed(2)} below threshold 0.5`)
        unmatched.push(ffaRace)
      }
    }
  }
  
  return { matched, unmatched }
}

/**
 * Effectue un fuzzy matching entre une course FFA et plusieurs candidats
 * en utilisant fuse.js sur les noms normalisés
 * 
 * @param ffaRace - Course FFA à matcher
 * @param candidates - Courses candidates avec la même distance
 * @param logger - Logger pour debugging
 * @returns Meilleure course matchée avec son score
 */
function fuzzyMatchRaceName(
  ffaRace: any,
  candidates: RaceWithDistance[],
  logger: any
): { race: RaceWithDistance, score: number } {
  // Normaliser le nom FFA
  const searchName = normalizeRaceName(ffaRace.name)
  const searchKeywords = removeStopwords(searchName)
  
  // Préparer les candidats avec noms normalisés
  const prepared = candidates.map(race => ({
    ...race,
    nameNorm: normalizeRaceName(race.name || ''),
    nameKeywords: removeStopwords(normalizeRaceName(race.name || ''))
  }))
  
  // Configuration fuse.js pour les courses
  const fuse = new Fuse(prepared, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.6,
    keys: [
      { name: 'nameNorm', weight: 0.6 },
      { name: 'nameKeywords', weight: 0.4 }
    ]
  })
  
  // Chercher avec le nom complet
  const nameResults = fuse.search(searchName)
  // Chercher avec les keywords
  const keywordResults = fuse.search(searchKeywords)
  
  // Combiner les résultats
  const scoreMap = new Map<string | number, { race: RaceWithDistance, score: number }>()
  
  for (const result of nameResults) {
    const raceId = result.item.id
    scoreMap.set(raceId, { 
      race: result.item, 
      score: 1 - (result.score || 0) // Inverser le score fuse.js (0 = parfait)
    })
  }
  
  for (const result of keywordResults) {
    const raceId = result.item.id
    const score = 1 - (result.score || 0)
    
    if (scoreMap.has(raceId)) {
      // Moyenne des scores name + keywords
      const existing = scoreMap.get(raceId)!
      existing.score = (existing.score + score) / 2
    } else {
      scoreMap.set(raceId, { race: result.item, score })
    }
  }
  
  // Trouver le meilleur score
  let best = { race: candidates[0], score: 0 }
  for (const entry of scoreMap.values()) {
    if (entry.score > best.score) {
      best = entry
    }
  }
  
  return best
}

/**
 * Normalise un nom de course pour le matching
 */
function normalizeRaceName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Retirer les accents
    .replace(/\(.*?\)/g, '') // Retirer parenthèses
    .replace(/[^\w\s]/g, ' ') // Remplacer ponctuation par espaces
    .replace(/\s+/g, ' ') // Collapser espaces multiples
    .trim()
}

/**
 * Retire les stopwords d'un texte normalisé
 */
function removeStopwords(text: string): string {
  const stopwords = ['de', 'la', 'le', 'du', 'des', 'les', 'un', 'une', 'au', 'aux', 'et']
  const words = text.split(' ').filter(w => !stopwords.includes(w))
  return words.join(' ')
}
