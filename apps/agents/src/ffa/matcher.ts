/**
 * Utilitaires de matching pour comparer les données FFA avec Miles Republic
 * 
 * Ce module gère :
 * - Calcul de similarité entre noms d'événements (algorithme de Levenshtein)
 * - Matching de courses par distance
 * - Recherche d'événements candidats dans la base
 */

import { FFACompetitionDetails, FFARace, MatchResult, FFAScraperConfig } from './types'
import Fuse from 'fuse.js'
import { removeStopwords, getPrimaryKeyword, extractKeywords } from './stopwords'

/**
 * Match une compétition FFA avec un événement Miles Republic existant
 * Utilise fuse.js pour le fuzzy matching avec scoring optimal
 */
export async function matchCompetition(
  competition: FFACompetitionDetails,
  sourceDb: any,
  config: FFAScraperConfig,
  logger: any
): Promise<MatchResult> {
  try {
    // 1. Nettoyer et normaliser UNE SEULE FOIS
    const cleanedName = removeEditionNumber(competition.competition.name)
    const searchName = normalizeString(cleanedName)
    const searchCity = normalizeString(competition.competition.city)
    const searchDepartment = competition.competition.department
    const searchDate = competition.competition.date
    const searchYear = searchDate.getFullYear().toString()

    // DEBUG LOG
    logger.info(`[MATCHER] "${competition.competition.name}" in ${competition.competition.city} (dept: ${searchDepartment})`);
    if (cleanedName !== competition.competition.name) {
      logger.info(`  Cleaned: "${cleanedName}"`);
    }
    logger.info(`  Normalized: name="${searchName}", city="${searchCity}"`);

    // 2. Récupérer les candidats via 3 passes SQL
    const candidates = await findCandidateEvents(
      searchName,
      searchCity,
      searchDepartment,
      searchDate,
      sourceDb
    )

    logger.info(`  Found ${candidates.length} candidates`);
    if (candidates.length > 0) {
      logger.info(`  Candidates: ${candidates.map(c => `${c.name} (${c.city})`).join(', ')}`);
    }

    if (candidates.length === 0) {
      return { type: 'NO_MATCH', confidence: 0 }
    }

    // 3. Préparer les données normalisées pour fuse.js
    const prepared = candidates.map(c => {
      const nameNorm = normalizeString(removeEditionNumber(c.name))
      
      // Calculer la proximité temporelle de l'édition la plus proche
      let dateProximity = 0
      if (c.editions && c.editions.length > 0) {
        const closestEdition = c.editions.reduce((closest, ed) => {
          if (!ed.startDate) return closest
          const diff = Math.abs(new Date(ed.startDate).getTime() - searchDate.getTime())
          const closestDiff = closest?.startDate ? Math.abs(new Date(closest.startDate).getTime() - searchDate.getTime()) : Infinity
          return diff < closestDiff ? ed : closest
        }, c.editions[0])
        
        if (closestEdition?.startDate) {
          const daysDiff = Math.abs(new Date(closestEdition.startDate).getTime() - searchDate.getTime()) / (1000 * 60 * 60 * 24)
          // Score de proximité : 1.0 si même date, diminue linéairement jusqu'à 0 à 90 jours
          dateProximity = Math.max(0, 1 - (daysDiff / 90))
        }
      }
      
      return {
        ...c,
        nameNorm,
        nameKeywords: removeStopwords(nameNorm), // Sans stopwords pour matching secondaire
        cityNorm: normalizeString(c.city),
        department: c.countrySubdivisionDisplayCodeLevel2,
        dateProximity
      }
    })

    // 4. Configuration fuse.js optimale
    const fuse = new Fuse(prepared, {
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      threshold: 0.6,  // Tolérance (0=strict, 1=tout accepter)
      keys: [
        { name: 'nameNorm', weight: 0.5 },      // Nom complet (poids réduit)
        { name: 'nameKeywords', weight: 0.3 },  // Mots-clés sans stopwords (nouveau !)
        { name: 'cityNorm', weight: 0.2 }
      ]
    })

    // 5. Recherche combinée nom+ville avec stratégie hybride
    const searchNameKeywords = removeStopwords(searchName)
    
    // Recherche niveau 1 : Nom complet
    const nameResults = fuse.search(searchName)
    // Recherche niveau 2 : Mots-clés sans stopwords
    const keywordResults = fuse.search(searchNameKeywords)
    // Recherche ville
    const cityResults = fuse.search(searchCity)

    logger.info(`  🧠 fuse.js: ${nameResults.length} name matches, ${keywordResults.length} keyword matches, ${cityResults.length} city matches`);

    if (nameResults.length === 0 && keywordResults.length === 0 && cityResults.length === 0) {
      return { type: 'NO_MATCH', confidence: 0 }
    }

    // 6. Combiner les scores avec stratégie hybride
    type ScoredCandidate = { 
      event: any, 
      nameScore: number, 
      keywordScore: number, 
      cityScore: number,
      departmentMatch: boolean,
      dateProximity: number,
      combined: number 
    }
    const scoreMap = new Map<string, ScoredCandidate>()

    // Scores du nom complet
    for (const result of nameResults) {
      const similarity = 1 - (result.score ?? 1)
      const id = result.item.id
      const departmentMatch = result.item.department === searchDepartment
      const existing = scoreMap.get(id) || { 
        event: result.item, 
        nameScore: 0, 
        keywordScore: 0,
        cityScore: 0,
        departmentMatch,
        dateProximity: result.item.dateProximity || 0,
        combined: 0 
      }
      existing.nameScore = Math.max(existing.nameScore, similarity)
      existing.departmentMatch = existing.departmentMatch || departmentMatch
      scoreMap.set(id, existing)
    }

    // Scores des mots-clés (sans stopwords)
    for (const result of keywordResults) {
      const similarity = 1 - (result.score ?? 1)
      const id = result.item.id
      const departmentMatch = result.item.department === searchDepartment
      const existing = scoreMap.get(id) || { 
        event: result.item, 
        nameScore: 0, 
        keywordScore: 0,
        cityScore: 0,
        departmentMatch,
        dateProximity: result.item.dateProximity || 0,
        combined: 0 
      }
      existing.keywordScore = Math.max(existing.keywordScore, similarity)
      existing.departmentMatch = existing.departmentMatch || departmentMatch
      scoreMap.set(id, existing)
    }

    for (const result of cityResults) {
      const similarity = 1 - (result.score ?? 1)
      const id = result.item.id
      const departmentMatch = result.item.department === searchDepartment
      const existing = scoreMap.get(id) || { 
        event: result.item, 
        nameScore: 0,
        keywordScore: 0,
        cityScore: 0,
        departmentMatch,
        dateProximity: result.item.dateProximity || 0,
        combined: 0 
      }
      existing.cityScore = Math.max(existing.cityScore, similarity)
      existing.departmentMatch = existing.departmentMatch || departmentMatch
      scoreMap.set(id, existing)
    }

    // 7. Calculer le score combiné avec logique adaptative hybride
    const searchKeywords = extractKeywords(searchNameKeywords)
    
    const scoredCandidates = Array.from(scoreMap.values()).map(candidate => {
      // Stratégie hybride : Prioriser le meilleur score entre nom complet et keywords
      const bestNameScore = Math.max(candidate.nameScore, candidate.keywordScore)
      
      // Validation anti-faux-positifs :
      // Si le score vient principalement des keywords (nom complet faible),
      // vérifier la qualité du match
      if (candidate.keywordScore > candidate.nameScore && candidate.nameScore < 0.5) {
        const candidateKeywords = extractKeywords(candidate.event.nameKeywords)
        const isValidKeywordMatch = validateKeywordMatch(searchKeywords, candidateKeywords)
        
        if (!isValidKeywordMatch) {
          // Pénaliser fortement si le match keyword est suspect
          candidate.keywordScore *= 0.3
          logger.debug(`  ⚠️  Keyword match suspect pour "${candidate.event.name}" - score pénalisé`);
        }
      }
      
      // Recalculer le meilleur score après validation
      const validatedBestScore = Math.max(candidate.nameScore, candidate.keywordScore)
      
      // Bonus département : Si même département mais villes différentes, c'est très probable
      const departmentBonus = candidate.departmentMatch && candidate.cityScore < 0.9 ? 0.15 : 0
      
      // Pénalité temporelle : Réduire le score si la date est éloignée
      // dateProximity: 1.0 = même date, 0.5 = 45 jours d'écart, 0.0 = 90+ jours
      const dateMultiplier = 0.7 + (candidate.dateProximity * 0.3) // 70-100% du score selon proximité
      
      // Si le nom (ou keywords) correspond très bien (>0.9), tolérer les villes différentes
      // (gérer Saint-Apollinaire vs Dijon, Nevers vs Magny-Cours, etc.)
      if (validatedBestScore >= 0.9) {
        // Si même département, bonus significatif
        if (candidate.departmentMatch) {
          candidate.combined = Math.min(1.0, (validatedBestScore * 0.90 + candidate.cityScore * 0.05 + departmentBonus) * dateMultiplier)
        } else {
          candidate.combined = Math.min(1.0, (validatedBestScore * 0.95 + candidate.cityScore * 0.05) * dateMultiplier)
        }
      } else {
        // Sinon, équilibrer nom complet, keywords, ville et département
        // 50% meilleur score nom, 30% ville, 20% score alternatif + bonus département
        const alternativeScore = Math.min(candidate.nameScore, candidate.keywordScore)
        candidate.combined = Math.min(1.0, (validatedBestScore * 0.5 + candidate.cityScore * 0.3 + alternativeScore * 0.2 + departmentBonus) * dateMultiplier)
      }
      return candidate
    })

    // 8. Trier par score décroissant
    scoredCandidates.sort((a, b) => b.combined - a.combined)

    // DEBUG: Top 3
    logger.info(`  Top 3 matches:`);
    scoredCandidates.slice(0, 3).forEach((c, i) => {
      const deptMatch = c.departmentMatch ? '✓' : '✗'
      logger.info(`    ${i+1}. "${c.event.name}" (${c.event.city}, dept: ${c.event.department} ${deptMatch}) - score: ${c.combined.toFixed(3)} (name: ${c.nameScore.toFixed(3)}, city: ${c.cityScore.toFixed(3)}, date: ${c.dateProximity.toFixed(3)})`);
    });

    // 9. Sélectionner le meilleur match
    const best = scoredCandidates[0]
    
    if (best.combined < 0.3) {
      logger.info(`  → Result: NO_MATCH (best score ${best.combined.toFixed(3)} < 0.3)`);
      return { type: 'NO_MATCH', confidence: 0 }
    }

    // 10. Trouver l'édition correspondante (même année)
    const edition = best.event.editions?.find((e: any) => e.year === searchYear)

    // 11. Déterminer le type de match
    const matchType = best.combined >= 0.95 ? 'EXACT_MATCH' :
                      best.combined >= config.similarityThreshold ? 'FUZZY_MATCH' :
                      'NO_MATCH'

    const result: MatchResult = {
      type: matchType,
      event: {
        id: best.event.id,
        name: best.event.name,
        city: best.event.city,
        similarity: best.combined
      },
      edition: edition ? {
        id: edition.id,
        year: edition.year,
        startDate: edition.startDate
      } : undefined,
      confidence: best.combined
    }

    logger.info(`  → Result: ${result.type} with "${result.event?.name || 'unknown'}" (confidence: ${result.confidence.toFixed(3)}, edition: ${result.edition ? 'YES' : 'NO'})`);
    
    return result
  } catch (error) {
    logger.error('Erreur lors du matching:', error)
    return { type: 'NO_MATCH', confidence: 0 }
  }
}

/**
 * @deprecated Cette fonction n'est plus utilisée. fuse.js gère maintenant le calcul de similarité.
 * Conservée pour compatibilité avec matchRace() qui l'utilise encore.
 * 
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
 * Valide qu'un match basé sur les keywords est légitime
 * 
 * Critères de validation :
 * 1. Au moins 2 keywords en commun OU
 * 2. Un keyword très distinctif (>= 8 caractères) en commun
 * 
 * @param searchKeywords - Keywords de la recherche
 * @param candidateKeywords - Keywords du candidat
 * @returns true si le match est valide
 */
function validateKeywordMatch(searchKeywords: string[], candidateKeywords: string[]): boolean {
  if (searchKeywords.length === 0 || candidateKeywords.length === 0) {
    return false
  }
  
  // Calculer l'intersection des keywords
  const commonKeywords = searchKeywords.filter(sk => 
    candidateKeywords.some(ck => 
      // Match exact ou l'un contient l'autre (pour gérer pluriels, etc.)
      sk === ck || sk.includes(ck) || ck.includes(sk)
    )
  )
  
  // Critère 1 : Au moins 2 keywords en commun
  if (commonKeywords.length >= 2) {
    return true
  }
  
  // Critère 2 : Un keyword très distinctif (>= 8 caractères)
  if (commonKeywords.length >= 1) {
    const hasDistinctiveKeyword = commonKeywords.some(kw => kw.length >= 8)
    if (hasDistinctiveKeyword) {
      return true
    }
  }
  
  // Sinon, le match est suspect (probablement un mot générique comme "nevers")
  return false
}

/**
 * Nettoie le nom d'un événement pour le matching en retirant les numéros d'édition
 * Exemples :
 * - "34ème Corrida des Bleuets" -> "Corrida des Bleuets"
 * - "Corrida des Bleuets - 34ème édition" -> "Corrida des Bleuets"
 * - "Corrida De Sassenage - 34èMe éDition" -> "Corrida De Sassenage"
 */
function removeEditionNumber(name: string): string {
  return name
    // Supprimer "- Xème édition" / "- Xeme edition" avec le tiret et tout ce qui suit
    .replace(/\s*[-–—]\s*\d+[eèé]?me?\s+[eé]?ditions?\s*$/i, '')
    // Supprimer juste "Xème édition" à la fin (sans tiret)
    .replace(/\s+\d+[eèé]?me?\s+[eé]?ditions?\s*$/i, '')
    // Supprimer "Xème" / "Xè" / "Xeme" partout dans le nom
    .replace(/\b\d+[eèé]?me?\b/gi, '')
    // Supprimer année entre parenthèses ou après tiret (ex: "(2025)", "- 2025")
    .replace(/\s*[-–—]?\s*\(?\d{4}\)?\s*$/, '')
    // Nettoyer les tirets/mots orphelins à la fin
    .replace(/\s*[-–—]\s*$/, '')
    // Normaliser les espaces multiples créés
    .replace(/\s+/g, ' ')
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
 * 
 * Stratégie en 3 passes SQL pour maximiser les candidats pertinents :
 * 1. Nom ET Ville (restrictif)
 * 2. Nom OU Ville (élargi)
 * 3. Nom uniquement (villes différentes)
 * 
 * Note : Le scoring et ranking sont désormais gérés par matchCompetition() avec fuse.js
 */
export async function findCandidateEvents(
  name: string,
  city: string,
  department: string,
  date: Date,
  sourceDb: any
): Promise<Array<{ id: string, name: string, city: string, countrySubdivisionDisplayCodeLevel2: string, editions?: any[] }>> {
  try {
    // Calculer la fenêtre temporelle (±90 jours)
    const startDate = new Date(date)
    startDate.setDate(startDate.getDate() - 90)
    
    const endDate = new Date(date)
    endDate.setDate(endDate.getDate() + 90)

    // Extraire TOUS les mots significatifs (>= 3 caractères)
    const nameWords = name.split(' ').filter(w => w.length >= 3)
    const cityWords = city.split(' ').filter(w => w.length >= 3)
    
    console.log(`🔍 [SQL] Mots-clés nom: [${nameWords.join(', ')}], ville: [${cityWords.join(', ')}], dept: ${department}`);

    // === PASSE 1 : Même département + Nom (prioritaire) ===
    console.log(`🔍 [PASSE 1] Recherche même département + nom`);
    let allEvents = await sourceDb.event.findMany({
      where: {
        AND: [
          {
            editions: {
              some: {
                startDate: { gte: startDate, lte: endDate }
              }
            }
          },
          // Même département
          department ? {
            countrySubdivisionDisplayCodeLevel2: department
          } : {},
          // ET au moins un mot du nom (>= 3 caractères)
          nameWords.length > 0 ? {
            OR: nameWords.map(w => ({
              name: { contains: w, mode: 'insensitive' as const }
            }))
          } : {}
        ].filter(clause => Object.keys(clause).length > 0)
      },
      select: {
        id: true,
        name: true,
        city: true,
        countrySubdivisionDisplayCodeLevel2: true,
        editions: {
          where: { startDate: { gte: startDate, lte: endDate } },
          select: { id: true, year: true, startDate: true }
        }
      },
      take: 100
    })
    
    console.log(`🔍 [PASSE 1] Trouvé ${allEvents.length} événements`);
    if (allEvents.length >= 100) {
      console.log('⚠️  [PASSE 1] Limite de 100 atteinte, certains candidats peuvent être manqués');
    }

    // === PASSE 2 : Nom OU Ville (tous départements, élargi si nécessaire) ===
    if (allEvents.length < 10) {
      console.log('🔍 [PASSE 2] Élargir recherche (nom OU ville, tous départements)...');
      const moreEvents = await sourceDb.event.findMany({
        where: {
          AND: [
            {
              editions: {
                some: { startDate: { gte: startDate, lte: endDate } }
              }
            },
            {
              OR: [
                ...cityWords.map(word => ({
                  city: { contains: word, mode: 'insensitive' as const }
                })),
                ...nameWords.map(w => ({
                  name: { contains: w, mode: 'insensitive' as const }
                }))
              ]
            },
            { NOT: { id: { in: allEvents.map((e: any) => e.id) } } }
          ]
        },
        select: {
          id: true,
          name: true,
          city: true,
          countrySubdivisionDisplayCodeLevel2: true,
          editions: {
            where: { startDate: { gte: startDate, lte: endDate } },
            select: { id: true, year: true, startDate: true }
          }
        },
        take: Math.max(100 - allEvents.length, 20)
      })

      console.log(`🔍 [PASSE 2] Ajouté ${moreEvents.length} événements, total: ${allEvents.length + moreEvents.length}`);
      allEvents = [...allEvents, ...moreEvents]
    }
    
    // Retourner les candidats bruts (le scoring sera fait par fuse.js dans matchCompetition)
    return allEvents
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
