/**
 * Sélection automatique de la course principale (mainRace) d'une édition.
 *
 * Règle déterminée par analyse de 52 283 éditions dans Miles Republic :
 * - Précision globale : 72.1%
 * - Précision pour RUNNING : 88.3%
 * - Précision pour TRAIL : 68.8%
 *
 * Algorithme :
 * 1. Plus grande distance principale (max entre runDistance et bikeDistance)
 * 2. Courses solo prioritaires sur courses d'équipe (duo, relais, trio, etc.)
 * 3. En cas d'égalité, l'index le plus bas (première course créée)
 */

/**
 * Interface minimale pour une course candidate à la sélection mainRace
 */
export interface MainRaceCandidate {
  /** Index de la course dans le tableau (utilisé comme tie-breaker) */
  index: number
  /** Nom de la course */
  name: string
  /** Distance de course à pied en km */
  runDistance?: number | null
  /** Distance de vélo en km */
  bikeDistance?: number | null
}

/**
 * Pattern regex pour détecter les courses d'équipe
 */
const TEAM_RACE_PATTERN = /(duo|relais|trio|quatuor|équipe|equipe|team|à [234]|a [234])/i

/**
 * Vérifie si une course est une course d'équipe
 */
export function isTeamRace(raceName: string): boolean {
  return TEAM_RACE_PATTERN.test(raceName)
}

/**
 * Calcule la distance principale d'une course (max entre run et bike)
 */
export function getPrimaryDistance(race: MainRaceCandidate): number {
  const runDist = race.runDistance ?? 0
  const bikeDist = race.bikeDistance ?? 0
  return Math.max(runDist, bikeDist)
}

/**
 * Sélectionne l'index de la course principale parmi un tableau de courses.
 *
 * @param races - Tableau de courses candidates
 * @returns Index de la course sélectionnée comme principale, ou -1 si aucune course
 *
 * @example
 * ```typescript
 * const races = [
 *   { index: 0, name: 'Trail 10km', runDistance: 10 },
 *   { index: 1, name: 'Trail 20km', runDistance: 20 },
 *   { index: 2, name: 'Trail duo 20km', runDistance: 20 }
 * ]
 * const mainIndex = selectMainRaceIndex(races) // Returns 1 (Trail 20km - solo, plus long)
 * ```
 */
export function selectMainRaceIndex(races: MainRaceCandidate[]): number {
  if (races.length === 0) {
    return -1
  }

  if (races.length === 1) {
    return races[0].index
  }

  // Trier par : distance DESC, isTeam ASC (solo d'abord), index ASC
  const sorted = [...races].sort((a, b) => {
    // 1. Plus grande distance principale
    const distA = getPrimaryDistance(a)
    const distB = getPrimaryDistance(b)
    if (distB !== distA) {
      return distB - distA
    }

    // 2. Courses solo avant courses d'équipe
    const teamA = isTeamRace(a.name) ? 1 : 0
    const teamB = isTeamRace(b.name) ? 1 : 0
    if (teamA !== teamB) {
      return teamA - teamB
    }

    // 3. Index le plus bas (première course)
    return a.index - b.index
  })

  return sorted[0].index
}

/**
 * Sélectionne la course principale parmi un tableau de données de courses.
 *
 * Cette fonction est conçue pour être utilisée avec les données brutes
 * des propositions (racesToAdd, racesToUpdate).
 *
 * @param racesData - Tableau de données de courses avec name, runDistance, bikeDistance
 * @returns L'index de la course qui devrait être la mainRace, ou -1 si tableau vide
 */
export function selectMainRace<T extends { name?: string; runDistance?: number | null; bikeDistance?: number | null }>(
  racesData: T[]
): number {
  const candidates: MainRaceCandidate[] = racesData.map((race, index) => ({
    index,
    name: race.name || '',
    runDistance: race.runDistance,
    bikeDistance: race.bikeDistance
  }))

  return selectMainRaceIndex(candidates)
}
