/**
 * Service de normalisation des noms de courses
 * Extrait de FFAScraperAgent et parser.ts pour réutilisation cross-agents
 */

/**
 * Normalise un nom de course pour comparaison
 * Supprime accents, met en minuscules, normalise les espaces
 *
 * @param name - Nom brut de la course
 * @returns Nom normalisé (lowercase, sans accents)
 */
export function normalizeRaceName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/\s+/g, ' ') // Normalise les espaces multiples
    .trim()
}

/**
 * Nettoie un nom de course en retirant les préfixes et indicateurs communs
 *
 * @param name - Nom brut de la course
 * @returns Nom nettoyé
 */
export function cleanRaceName(name: string): string {
  let cleaned = name

  // Retirer préfixes "Race X -" ou "Course X -"
  cleaned = cleaned.replace(/^(Race|Course)\s*\d+\s*[-–]\s*/i, '')

  // Nettoyer espaces multiples
  cleaned = cleaned.replace(/\s+/g, ' ')

  // Nettoyer tirets/slash en début/fin
  cleaned = cleaned.replace(/^[-–/\s]+|[-–/\s]+$/g, '')

  return cleaned.trim()
}

/**
 * Normalise un nom de course selon le format standard
 * [Category Level 1] [Relais ?] [Enfants ?] [Distance]
 *
 * Exemples :
 * - "1/2 Marathon" (21 km) → "Course 21 km"
 * - "Trail des Loups" (25 km) → "Trail 25 km"
 * - "Marche Nordique" (8 km) → "Marche Nordique 8 km"
 * - "Course Relais 4x5km" (20 km) → "Course Relais 20 km"
 *
 * @param raceName - Nom brut de la course
 * @param categoryLevel1 - Catégorie inférée (RUNNING, TRAIL, WALK, etc.)
 * @param categoryLevel2 - Sous-catégorie inférée (HALF_MARATHON, NORDIC_WALK, etc.)
 * @param distance - Distance en km (optionnelle)
 * @returns Nom normalisé au format standard
 */
export function normalizeRaceNameWithCategory(
  raceName: string,
  categoryLevel1?: string,
  categoryLevel2?: string,
  distance?: number
): string {
  const lower = raceName.toLowerCase()

  // 1. Détection des modificateurs
  const isRelay = /relais|ekiden|x\d/.test(lower)
  const isKids = /enfant|kids|junior|jeune|pouss/.test(lower)

  // 2. Label de catégorie principal
  const categoryLabel = getCategoryLabel(categoryLevel1, categoryLevel2)

  // 3. Composition
  const parts: string[] = []

  // Ajouter le label de catégorie
  parts.push(categoryLabel)

  // Ajouter "Relais" si détecté ET pas déjà dans le label
  if (isRelay && !categoryLabel.toLowerCase().includes('relais')) {
    parts.push('Relais')
  }

  // Ajouter "Enfants" si détecté
  if (isKids) {
    parts.push('Enfants')
  }

  // Ajouter la distance (sauf pour triathlon avec format spécial)
  if (distance && categoryLevel1 !== 'TRIATHLON') {
    if (distance < 1) {
      parts.push(`${Math.round(distance * 1000)} m`)
    } else {
      // Arrondir à 1 décimale si nécessaire
      const rounded = Math.round(distance * 10) / 10
      parts.push(`${rounded} km`)
    }
  }

  return parts.join(' ')
}

/**
 * Retourne le label de catégorie à afficher selon categoryLevel1 et categoryLevel2
 *
 * Cas spéciaux basés sur level 2, sinon fallback sur level 1
 */
export function getCategoryLabel(
  categoryLevel1?: string,
  categoryLevel2?: string
): string {
  // Cas spéciaux basés sur level 2
  if (categoryLevel2) {
    switch (categoryLevel2) {
      // WALK
      case 'NORDIC_WALK':
        return 'Marche Nordique'
      case 'HIKING':
        return 'Randonnée'

      // CYCLING
      case 'GRAVEL_RIDE':
      case 'GRAVEL_RACE':
        return 'Gravel'
      case 'GRAN_FONDO':
        return 'Gran Fondo'
      case 'MOUNTAIN_BIKE_RIDE':
        return 'VTT'
      case 'ROAD_CYCLING_TOUR':
        return 'Vélo'

      // TRAIL
      case 'ULTRA_TRAIL':
        return 'Ultra Trail'
      case 'DISCOVERY_TRAIL':
      case 'SHORT_TRAIL':
      case 'LONG_TRAIL':
        return 'Trail'
      case 'VERTICAL_KILOMETER':
        return 'Kilomètre Vertical'

      // TRIATHLON
      case 'TRIATHLON_XS':
        return 'Triathlon XS'
      case 'TRIATHLON_S':
        return 'Triathlon S'
      case 'TRIATHLON_M':
        return 'Triathlon M'
      case 'TRIATHLON_L':
        return 'Triathlon L'
      case 'TRIATHLON_XXL':
        return 'Triathlon XXL'
      case 'DUATHLON':
        return 'Duathlon'
      case 'AQUATHLON':
        return 'Aquathlon'
      case 'SWIM_RUN':
        return 'Swim Run'
      case 'RUN_BIKE':
        return 'Run & Bike'
      case 'SWIM_BIKE':
        return 'Swim Bike'

      // RUNNING
      case 'EKIDEN':
        return 'Course Relais'
      case 'CROSS':
        return 'Cross'

      // FUN
      case 'OBSTACLE_RACE':
        return 'Course à Obstacles'
      case 'COLOR_RUN':
        return 'Color Run'
      case 'SPARTAN_RACE':
        return 'Spartan Race'
      case 'MUD_DAY':
        return 'Mud Day'

      // OTHER
      case 'CANICROSS':
        return 'Canicross'
      case 'ORIENTEERING':
        return "Course d'Orientation"
    }
  }

  // Fallback sur level 1
  if (categoryLevel1) {
    const level1Map: Record<string, string> = {
      RUNNING: 'Course',
      TRAIL: 'Trail',
      WALK: 'Marche',
      CYCLING: 'Vélo',
      TRIATHLON: 'Triathlon',
      FUN: 'Course Fun',
      OTHER: 'Autre',
    }
    return level1Map[categoryLevel1] || 'Course'
  }

  return 'Course' // Défaut
}
