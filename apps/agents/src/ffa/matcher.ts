/**
 * Utilitaires de matching pour comparer les données FFA avec Miles Republic
 * 
 * Ce module gère :
 * - Calcul de similarité entre noms d'événements (algorithme de Levenshtein)
 * - Matching de courses par distance
 * - Recherche d'événements candidats dans la base
 */

import { FFACompetitionDetails, FFARace, MatchResult, FFAScraperConfig } from './types'

/**
 * Match une compétition FFA avec un événement Miles Republic existant
 */
export async function matchCompetition(
  competition: FFACompetitionDetails,
  sourceDb: any,
  config: FFAScraperConfig,
  logger: any
): Promise<MatchResult> {
  try {
    // Nettoyer le nom pour la recherche
    const searchName = normalizeString(competition.competition.name)
    const searchCity = normalizeString(competition.competition.city)
    const searchDate = competition.competition.date

    // Rechercher des événements candidats
    const candidates = await findCandidateEvents(
      searchName,
      searchCity,
      searchDate,
      sourceDb
    )

    if (candidates.length === 0) {
      return {
        type: 'NO_MATCH',
        confidence: 0
      }
    }

    // Trouver le meilleur match
    let bestMatch: MatchResult | null = null
    let bestSimilarity = 0

    for (const candidate of candidates) {
      const nameSimilarity = calculateSimilarity(searchName, normalizeString(candidate.name))
      const citySimilarity = calculateSimilarity(searchCity, normalizeString(candidate.city))
      
      // Score combiné (80% nom, 20% ville)
      const totalSimilarity = nameSimilarity * 0.8 + citySimilarity * 0.2

      if (totalSimilarity > bestSimilarity) {
        bestSimilarity = totalSimilarity
        
        // Trouver l'édition correspondante (même année)
        const year = competition.competition.date.getFullYear().toString()
        const edition = candidate.editions.find((e: any) => e.year === year)

        bestMatch = {
          type: totalSimilarity >= config.similarityThreshold ? 'FUZZY_MATCH' : 'NO_MATCH',
          event: {
            id: candidate.id,
            name: candidate.name,
            city: candidate.city,
            similarity: totalSimilarity
          },
          edition: edition ? {
            id: edition.id,
            year: edition.year,
            startDate: edition.startDate
          } : undefined,
          confidence: totalSimilarity
        }

        // Si c'est un excellent match (>95%), c'est un EXACT_MATCH
        if (totalSimilarity >= 0.95) {
          bestMatch.type = 'EXACT_MATCH'
        }
      }
    }

    return bestMatch || {
      type: 'NO_MATCH',
      confidence: 0
    }
  } catch (error) {
    logger.error('Erreur lors du matching:', error)
    return {
      type: 'NO_MATCH',
      confidence: 0
    }
  }
}

/**
 * Calcule la similarité entre deux chaînes (distance de Levenshtein normalisée)
 * Retourne un score entre 0 et 1 (1 = identique)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  if (s1 === s2) return 1
  if (s1.length === 0 || s2.length === 0) return 0

  const distance = levenshteinDistance(s1, s2)
  const maxLength = Math.max(s1.length, s2.length)
  
  return 1 - distance / maxLength
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  // Initialiser la matrice
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  // Remplir la matrice
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Suppression
        matrix[i][j - 1] + 1,      // Insertion
        matrix[i - 1][j - 1] + cost // Substitution
      )
    }
  }

  return matrix[len1][len2]
}

/**
 * Normalise une chaîne pour la comparaison
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Retirer accents
    .replace(/[^\w\s]/g, ' ')        // Retirer ponctuation
    .replace(/\s+/g, ' ')            // Normaliser espaces
    .trim()
}

/**
 * Match une course FFA avec une course Miles Republic existante
 */
export function matchRace(
  ffaRace: FFARace,
  milesRaces: Array<{ id: string, name: string, distance: number }>,
  tolerancePercent: number
): { matched: boolean, raceId?: string, similarity?: number } {
  if (!ffaRace.distance) {
    return { matched: false }
  }

  let bestMatch: { id: string, similarity: number } | null = null
  let bestScore = 0

  for (const milesRace of milesRaces) {
    // Vérifier la distance
    const distanceDiff = Math.abs(ffaRace.distance - milesRace.distance)
    const distanceTolerance = ffaRace.distance * tolerancePercent

    if (distanceDiff > distanceTolerance) {
      continue
    }

    // Calculer similarité du nom
    const nameSimilarity = calculateSimilarity(
      normalizeString(ffaRace.name),
      normalizeString(milesRace.name)
    )

    // Score combiné (50% distance, 50% nom)
    const distanceScore = 1 - (distanceDiff / distanceTolerance)
    const totalScore = distanceScore * 0.5 + nameSimilarity * 0.5

    if (totalScore > bestScore) {
      bestScore = totalScore
      bestMatch = {
        id: milesRace.id,
        similarity: totalScore
      }
    }
  }

  if (bestMatch && bestScore >= 0.6) {
    return {
      matched: true,
      raceId: bestMatch.id,
      similarity: bestMatch.similarity
    }
  }

  return { matched: false }
}

/**
 * Recherche des événements candidats par nom + ville + période
 */
export async function findCandidateEvents(
  name: string,
  city: string,
  date: Date,
  sourceDb: any
): Promise<Array<{ id: string, name: string, city: string, editions: any[] }>> {
  try {
    // Calculer la fenêtre temporelle (±60 jours)
    const startDate = new Date(date)
    startDate.setDate(startDate.getDate() - 60)
    
    const endDate = new Date(date)
    endDate.setDate(endDate.getDate() + 60)

    // Rechercher dans la base
    // Note: Ceci est un exemple simplifié. L'implémentation réelle dépendra 
    // de la structure de la base Miles Republic
    const events = await sourceDb.event.findMany({
      where: {
        OR: [
          {
            name: {
              contains: name,
              mode: 'insensitive'
            }
          },
          {
            city: {
              contains: city,
              mode: 'insensitive'
            }
          }
        ],
        editions: {
          some: {
            startDate: {
              gte: startDate,
              lte: endDate
            }
          }
        }
      },
      include: {
        editions: {
          where: {
            startDate: {
              gte: startDate,
              lte: endDate
            }
          }
        }
      },
      take: 10
    })

    return events
  } catch (error) {
    console.error('Erreur lors de la recherche de candidats:', error)
    return []
  }
}

/**
 * Calcule un score de confiance ajusté basé sur différents facteurs
 */
export function calculateAdjustedConfidence(
  baseConfidence: number,
  competition: FFACompetitionDetails,
  matchResult: MatchResult
): number {
  let confidence = baseConfidence

  // Bonus si c'est un match exact
  if (matchResult.type === 'EXACT_MATCH') {
    confidence = Math.min(confidence + 0.05, 1)
  }

  // Bonus si on a des informations d'organisateur
  if (competition.organizerEmail || competition.organizerWebsite) {
    confidence = Math.min(confidence + 0.02, 1)
  }

  // Bonus si on a plusieurs courses
  if (competition.races.length > 1) {
    confidence = Math.min(confidence + 0.01, 1)
  }

  // Pénalité si similarité faible
  if (matchResult.confidence < 0.8) {
    confidence *= matchResult.confidence
  }

  return Math.round(confidence * 100) / 100
}
