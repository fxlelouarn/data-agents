/**
 * Duplicate Detection Scoring Module
 *
 * Algorithme de scoring multi-critères pour détecter les doublons d'événements.
 * Critères : similarité de nom (40%), localisation (30%), date (20%), catégories (10%)
 */

import Fuse from 'fuse.js'
import { differenceInDays } from 'date-fns'
import {
  normalizeString,
  removeStopwords,
  removeEditionNumber
} from '@data-agents/agent-framework'

/**
 * Configuration du scoring
 */
export interface DuplicateScoringConfig {
  nameWeight: number           // Poids du nom (défaut: 0.40)
  locationWeight: number       // Poids de la localisation (défaut: 0.30)
  dateWeight: number           // Poids de la date (défaut: 0.20)
  categoryWeight: number       // Poids des catégories (défaut: 0.10)
  maxDistanceKm: number        // Distance max en km (défaut: 15)
  dateToleranceDays: number    // Tolérance date en jours (défaut: 30)
}

export const DEFAULT_SCORING_CONFIG: DuplicateScoringConfig = {
  nameWeight: 0.40,
  locationWeight: 0.30,
  dateWeight: 0.20,
  categoryWeight: 0.10,
  maxDistanceKm: 15,
  dateToleranceDays: 30
}

/**
 * Résultat du scoring de duplication
 */
export interface DuplicateScore {
  score: number                 // Score final (0-1)
  isDuplicate: boolean          // true si score >= minDuplicateScore
  details: {
    nameScore: number           // Score similarité nom (0-1)
    locationScore: number       // Score localisation (0-1)
    dateScore: number           // Score proximité date (0-1)
    categoryScore: number       // Score catégories (0-1)
    editionRatio: number        // Ratio nombre d'éditions
    distanceKm?: number         // Distance en km (si coordonnées dispo)
  }
}

/**
 * Événement simplifié pour le scoring
 */
export interface EventForScoring {
  id: number
  name: string
  city: string
  countrySubdivisionDisplayCodeLevel2?: string  // Département
  latitude?: number | null
  longitude?: number | null
  status?: string
  createdAt?: Date
  editions: EditionForScoring[]
}

export interface EditionForScoring {
  id: number
  year: string
  startDate?: Date | null
  races?: RaceForScoring[]
}

export interface RaceForScoring {
  categoryLevel1?: string | null
}

/**
 * Calcule le score de similarité entre deux noms d'événements
 * Utilise fuse.js pour le fuzzy matching + chevauchement de mots-clés
 */
export function calculateNameScore(event1: EventForScoring, event2: EventForScoring): number {
  // Normaliser les noms
  const name1 = normalizeString(removeEditionNumber(event1.name))
  const name2 = normalizeString(removeEditionNumber(event2.name))

  // Si identiques après normalisation
  if (name1 === name2) {
    return 1.0
  }

  // Extraire les mots-clés significatifs
  const keywords1 = removeStopwords(name1).split(' ').filter(w => w.length > 0)
  const keywords2 = removeStopwords(name2).split(' ').filter(w => w.length > 0)

  // Score fuse.js sur le nom complet
  const fuse = new Fuse([{ name: name2 }], {
    includeScore: true,
    keys: ['name'],
    threshold: 0.6
  })
  const fuseResults = fuse.search(name1)
  const fuseScore = fuseResults.length > 0 ? 1 - (fuseResults[0].score ?? 1) : 0

  // Score de chevauchement des mots-clés (coefficient de Jaccard)
  const commonKeywords = keywords1.filter(k => keywords2.includes(k))
  const allKeywords = new Set([...keywords1, ...keywords2])
  const keywordScore = allKeywords.size > 0 ? commonKeywords.length / allKeywords.size : 0

  // Score combiné : 70% fuse.js + 30% mots-clés
  return fuseScore * 0.7 + keywordScore * 0.3
}

/**
 * Calcule la distance en km entre deux points (formule de Haversine)
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Rayon de la Terre en km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Normalise une ville pour comparaison
 */
function normalizeCity(city: string): string {
  return normalizeString(city)
    .replace(/^(saint|sainte|st)\s+/i, 'st ')
    .replace(/\s+(cedex|cedex\s*\d+)$/i, '')
    .trim()
}

/**
 * Calcule le score de proximité géographique
 * - Même ville exacte : 1.0
 * - Distance < 5km : 1.0
 * - Distance < 15km : 0.8
 * - Distance < 30km : 0.5
 * - Distance < 50km : 0.3
 * - Même département sans coordonnées : 0.6
 */
export function calculateLocationScore(
  event1: EventForScoring,
  event2: EventForScoring,
  maxDistanceKm: number = 15
): { score: number; distanceKm?: number } {
  // Même ville exacte
  if (normalizeCity(event1.city) === normalizeCity(event2.city)) {
    return { score: 1.0 }
  }

  // Même département
  const sameDept =
    event1.countrySubdivisionDisplayCodeLevel2 &&
    event2.countrySubdivisionDisplayCodeLevel2 &&
    event1.countrySubdivisionDisplayCodeLevel2 === event2.countrySubdivisionDisplayCodeLevel2

  // Distance géographique (si lat/lng disponibles)
  if (
    event1.latitude != null &&
    event1.longitude != null &&
    event2.latitude != null &&
    event2.longitude != null
  ) {
    const distanceKm = haversineDistance(
      event1.latitude,
      event1.longitude,
      event2.latitude,
      event2.longitude
    )

    if (distanceKm <= 5) return { score: 1.0, distanceKm }
    if (distanceKm <= maxDistanceKm) return { score: 0.8, distanceKm }
    if (distanceKm <= 30) return { score: 0.5, distanceKm }
    if (distanceKm <= 50) return { score: 0.3, distanceKm }
    return { score: 0.0, distanceKm }
  }

  // Fallback: même département sans coordonnées
  return { score: sameDept ? 0.6 : 0.0 }
}

/**
 * Récupère les éditions récentes (N dernières années)
 */
function getRecentEditions(editions: EditionForScoring[], yearsBack: number = 3): EditionForScoring[] {
  const currentYear = new Date().getFullYear()
  const minYear = currentYear - yearsBack

  return editions.filter(ed => {
    const year = parseInt(ed.year, 10)
    return !isNaN(year) && year >= minYear
  })
}

/**
 * Calcule le score de proximité temporelle entre les éditions
 * - Même date exacte : 1.0
 * - Écart ≤ 7 jours : 0.9
 * - Écart ≤ tolérance : 0.7
 * - Même année, dates éloignées : 0.3
 * - Années différentes sans overlap : 0.0
 */
export function calculateDateScore(
  event1: EventForScoring,
  event2: EventForScoring,
  toleranceDays: number = 30
): number {
  const recentEditions1 = getRecentEditions(event1.editions, 3)
  const recentEditions2 = getRecentEditions(event2.editions, 3)

  if (recentEditions1.length === 0 || recentEditions2.length === 0) {
    // Pas d'éditions récentes à comparer
    return 0.0
  }

  let bestScore = 0

  for (const ed1 of recentEditions1) {
    for (const ed2 of recentEditions2) {
      // Même année ?
      if (ed1.year === ed2.year) {
        // Comparer les dates si disponibles
        if (ed1.startDate && ed2.startDate) {
          const diffDays = Math.abs(differenceInDays(new Date(ed1.startDate), new Date(ed2.startDate)))

          if (diffDays === 0) {
            bestScore = Math.max(bestScore, 1.0)
          } else if (diffDays <= 7) {
            bestScore = Math.max(bestScore, 0.9)
          } else if (diffDays <= toleranceDays) {
            bestScore = Math.max(bestScore, 0.7)
          } else {
            bestScore = Math.max(bestScore, 0.3) // Même année mais dates éloignées
          }
        } else {
          bestScore = Math.max(bestScore, 0.5) // Même année, dates inconnues
        }
      }
    }
  }

  return bestScore
}

/**
 * Calcule le score de chevauchement des catégories de courses
 * Utilise le coefficient de Jaccard
 */
export function calculateCategoryScore(event1: EventForScoring, event2: EventForScoring): number {
  // Extraire les catégories de toutes les courses
  const categories1 = new Set<string>()
  const categories2 = new Set<string>()

  for (const ed of event1.editions) {
    if (ed.races) {
      for (const race of ed.races) {
        if (race.categoryLevel1) {
          categories1.add(race.categoryLevel1)
        }
      }
    }
  }

  for (const ed of event2.editions) {
    if (ed.races) {
      for (const race of ed.races) {
        if (race.categoryLevel1) {
          categories2.add(race.categoryLevel1)
        }
      }
    }
  }

  // Si pas de catégories, retourner un score neutre
  if (categories1.size === 0 || categories2.size === 0) {
    return 0.5 // Score neutre, ne pénalise pas
  }

  // Coefficient de Jaccard
  const intersection = [...categories1].filter(c => categories2.has(c))
  const union = new Set([...categories1, ...categories2])

  return intersection.length / union.size
}

/**
 * Calcule le score de duplication combiné entre deux événements
 */
export function calculateDuplicateScore(
  event1: EventForScoring,
  event2: EventForScoring,
  config: DuplicateScoringConfig = DEFAULT_SCORING_CONFIG,
  minDuplicateScore: number = 0.80
): DuplicateScore {
  // Calculer les scores individuels
  const nameScore = calculateNameScore(event1, event2)
  const locationResult = calculateLocationScore(event1, event2, config.maxDistanceKm)
  const dateScore = calculateDateScore(event1, event2, config.dateToleranceDays)
  const categoryScore = calculateCategoryScore(event1, event2)

  // Score pondéré
  const rawScore =
    nameScore * config.nameWeight +
    locationResult.score * config.locationWeight +
    dateScore * config.dateWeight +
    categoryScore * config.categoryWeight

  // Calculer le ratio d'éditions
  const editionRatio =
    Math.min(event1.editions.length, event2.editions.length) /
    Math.max(event1.editions.length, event2.editions.length, 1)

  // Bonus/Malus
  let finalScore = rawScore

  // Bonus si même ville ET même date (très probable doublon)
  if (locationResult.score === 1.0 && dateScore >= 0.9) {
    finalScore = Math.min(1.0, finalScore + 0.05)
  }

  // Malus si grande différence d'éditions (un a beaucoup plus que l'autre)
  if (editionRatio < 0.2) {
    finalScore = finalScore * 0.9 // -10%
  }

  return {
    score: Math.round(finalScore * 1000) / 1000, // Arrondir à 3 décimales
    isDuplicate: finalScore >= minDuplicateScore,
    details: {
      nameScore: Math.round(nameScore * 1000) / 1000,
      locationScore: Math.round(locationResult.score * 1000) / 1000,
      dateScore: Math.round(dateScore * 1000) / 1000,
      categoryScore: Math.round(categoryScore * 1000) / 1000,
      editionRatio: Math.round(editionRatio * 1000) / 1000,
      distanceKm: locationResult.distanceKm
    }
  }
}

/**
 * Choisit quel événement conserver et lequel supprimer
 * Heuristique :
 * 1. Celui avec le plus d'éditions
 * 2. Celui avec status LIVE
 * 3. Celui créé en premier (plus ancien)
 */
export function chooseKeepEvent(
  event1: EventForScoring,
  event2: EventForScoring
): {
  keepEvent: EventForScoring
  duplicateEvent: EventForScoring
  reason: string
} {
  // 1. Celui avec le plus d'éditions
  if (event1.editions.length !== event2.editions.length) {
    const [keep, dup] =
      event1.editions.length > event2.editions.length ? [event1, event2] : [event2, event1]
    return {
      keepEvent: keep,
      duplicateEvent: dup,
      reason: `Plus d'éditions (${keep.editions.length} vs ${dup.editions.length})`
    }
  }

  // 2. Celui avec status LIVE (vs DRAFT, REVIEW)
  if (event1.status === 'LIVE' && event2.status !== 'LIVE') {
    return { keepEvent: event1, duplicateEvent: event2, reason: 'Status LIVE' }
  }
  if (event2.status === 'LIVE' && event1.status !== 'LIVE') {
    return { keepEvent: event2, duplicateEvent: event1, reason: 'Status LIVE' }
  }

  // 3. Celui créé en premier (plus ancien)
  if (event1.createdAt && event2.createdAt) {
    if (event1.createdAt < event2.createdAt) {
      return { keepEvent: event1, duplicateEvent: event2, reason: 'Plus ancien' }
    }
    return { keepEvent: event2, duplicateEvent: event1, reason: 'Plus ancien' }
  }

  // Par défaut: garder le premier (ID plus petit = plus ancien généralement)
  if (event1.id < event2.id) {
    return { keepEvent: event1, duplicateEvent: event2, reason: 'ID plus ancien' }
  }
  return { keepEvent: event2, duplicateEvent: event1, reason: 'ID plus ancien' }
}
