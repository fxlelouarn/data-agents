/**
 * Event Matching Service
 * 
 * Service mutualisé pour le matching d'événements sportifs.
 * Utilisé par les agents FFA, Slack, et autres.
 * 
 * Ce module gère :
 * - Calcul de similarité entre noms d'événements (fuse.js)
 * - Matching de courses par distance et nom
 * - Recherche d'événements candidats dans la base
 */

import Fuse from 'fuse.js'
import { removeStopwords, getPrimaryKeyword, extractKeywords } from './stopwords'
import { normalizeDepartmentCode } from './departments'
import {
  EventMatchInput,
  EventMatchResult,
  RejectedMatch,
  MatchingConfig,
  MatchingLogger,
  defaultLogger,
  RaceMatchInput,
  DbRace,
  RaceMatchResult
} from './types'

/**
 * Default matching configuration
 */
export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  similarityThreshold: 0.75,
  distanceTolerancePercent: 0.1,
  confidenceBase: 0.9
}

/**
 * Match an event against a database of existing events
 * 
 * @param input - Event data to match
 * @param sourceDb - Prisma client for source database (Miles Republic)
 * @param config - Matching configuration
 * @param logger - Logger instance
 * @returns Match result with confidence and alternatives
 */
export async function matchEvent(
  input: EventMatchInput,
  sourceDb: any,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
  logger: MatchingLogger = defaultLogger
): Promise<EventMatchResult> {
  try {
    // 1. Normalize input data
    const cleanedName = removeEditionNumber(input.eventName)
    const searchName = normalizeString(cleanedName)
    const searchCity = normalizeString(input.eventCity)
    const searchDepartment = input.eventDepartment ? normalizeDepartmentCode(input.eventDepartment) : undefined
    const searchDate = input.editionDate
    const searchYear = (input.editionYear || searchDate.getFullYear()).toString()

    logger.info(`[MATCHER] "${input.eventName}" in ${input.eventCity} (dept: ${searchDepartment || 'unknown'})`)
    if (cleanedName !== input.eventName) {
      logger.info(`  Cleaned: "${cleanedName}"`)
    }
    logger.info(`  Normalized: name="${searchName}", city="${searchCity}"`)

    // 2. Find candidate events via SQL
    const candidates = await findCandidateEvents(
      searchName,
      searchCity,
      searchDepartment,
      searchDate,
      sourceDb
    )

    logger.info(`  Found ${candidates.length} candidates`)
    if (candidates.length > 0) {
      logger.debug(`  Candidates: ${candidates.slice(0, 5).map(c => `${c.name} (${c.city})`).join(', ')}`)
    }

    if (candidates.length === 0) {
      return { type: 'NO_MATCH', confidence: 0 }
    }

    // 3. Prepare normalized data for fuse.js
    const prepared = candidates.map(c => {
      const nameNorm = normalizeString(removeEditionNumber(c.name))

      // Calculate temporal proximity of closest edition
      let dateProximity = 0
      if (c.editions && c.editions.length > 0) {
        const closestEdition = c.editions.reduce((closest: any, ed: any) => {
          if (!ed.startDate) return closest
          const diff = Math.abs(new Date(ed.startDate).getTime() - searchDate.getTime())
          const closestDiff = closest?.startDate ? Math.abs(new Date(closest.startDate).getTime() - searchDate.getTime()) : Infinity
          return diff < closestDiff ? ed : closest
        }, c.editions[0])

        if (closestEdition?.startDate) {
          const daysDiff = Math.abs(new Date(closestEdition.startDate).getTime() - searchDate.getTime()) / (1000 * 60 * 60 * 24)
          dateProximity = Math.max(0, 1 - (daysDiff / 90))
        }
      }

      return {
        ...c,
        nameNorm,
        nameKeywords: removeStopwords(nameNorm),
        cityNorm: normalizeString(c.city),
        department: c.countrySubdivisionDisplayCodeLevel2,
        dateProximity
      }
    })

    // 4. Configure fuse.js
    const fuse = new Fuse(prepared, {
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      threshold: 0.6,
      keys: [
        { name: 'nameNorm', weight: 0.5 },
        { name: 'nameKeywords', weight: 0.3 },
        { name: 'cityNorm', weight: 0.2 }
      ]
    })

    // 5. Search with hybrid strategy
    const searchNameKeywords = removeStopwords(searchName)
    const nameResults = fuse.search(searchName)
    const keywordResults = fuse.search(searchNameKeywords)
    const cityResults = fuse.search(searchCity)

    logger.debug(`  fuse.js: ${nameResults.length} name matches, ${keywordResults.length} keyword matches, ${cityResults.length} city matches`)

    if (nameResults.length === 0 && keywordResults.length === 0 && cityResults.length === 0) {
      return { type: 'NO_MATCH', confidence: 0 }
    }

    // 6. Combine scores
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

    for (const result of nameResults) {
      const similarity = 1 - (result.score ?? 1)
      const id = result.item.id
      const departmentMatch = searchDepartment ? result.item.department === searchDepartment : true
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

    for (const result of keywordResults) {
      const similarity = 1 - (result.score ?? 1)
      const id = result.item.id
      const departmentMatch = searchDepartment ? result.item.department === searchDepartment : true
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
      const departmentMatch = searchDepartment ? result.item.department === searchDepartment : true
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

    // 7. Calculate combined scores
    const searchKeywords = extractKeywords(searchNameKeywords)

    const scoredCandidates = Array.from(scoreMap.values()).map(candidate => {
      const bestNameScore = Math.max(candidate.nameScore, candidate.keywordScore)

      // Anti-false-positive validation
      if (candidate.keywordScore > candidate.nameScore && candidate.nameScore < 0.5) {
        const candidateKeywords = extractKeywords(candidate.event.nameKeywords)
        const isValidKeywordMatch = validateKeywordMatch(searchKeywords, candidateKeywords)

        if (!isValidKeywordMatch) {
          candidate.keywordScore *= 0.3
          logger.debug(`  Keyword match suspect for "${candidate.event.name}" - score penalized`)
        }
      }

      const validatedBestScore = Math.max(candidate.nameScore, candidate.keywordScore)
      const departmentBonus = candidate.departmentMatch && candidate.cityScore < 0.9 ? 0.15 : 0
      const departmentPenalty = !candidate.departmentMatch && validatedBestScore >= 0.85
        ? 0.25 * validatedBestScore
        : 0
      const dateMultiplier = 0.8 + (candidate.dateProximity * 0.2)

      if (validatedBestScore >= 0.9) {
        if (candidate.departmentMatch) {
          candidate.combined = Math.min(1.0, (validatedBestScore * 0.90 + candidate.cityScore * 0.05 + departmentBonus) * dateMultiplier)
        } else {
          candidate.combined = Math.min(1.0, (validatedBestScore * 0.95 + candidate.cityScore * 0.05 - departmentPenalty) * dateMultiplier)
        }
      } else {
        const alternativeScore = Math.min(candidate.nameScore, candidate.keywordScore)
        candidate.combined = Math.min(1.0, (validatedBestScore * 0.5 + candidate.cityScore * 0.3 + alternativeScore * 0.2 + departmentBonus - departmentPenalty) * dateMultiplier)
      }
      return candidate
    })

    // 8. Sort by score descending
    scoredCandidates.sort((a, b) => b.combined - a.combined)

    // Log top 3
    logger.info(`  Top 3 matches:`)
    scoredCandidates.slice(0, 3).forEach((c, i) => {
      const deptMatch = c.departmentMatch ? '✓' : '✗'
      const bestScore = Math.max(c.nameScore, c.keywordScore)
      const penalty = !c.departmentMatch && bestScore >= 0.85 ? ` penalty:-${(0.25 * bestScore).toFixed(2)}` : ''
      logger.info(`    ${i+1}. "${c.event.name}" (${c.event.city}, dept: ${c.event.department} ${deptMatch}${penalty}) - score: ${c.combined.toFixed(3)}`)
    })

    // 9. Select best match
    const best = scoredCandidates[0]

    if (best.combined < 0.3) {
      logger.info(`  → Result: NO_MATCH (best score ${best.combined.toFixed(3)} < 0.3)`)
      return { type: 'NO_MATCH', confidence: 0 }
    }

    // 10. Find matching edition
    const edition = best.event.editions?.find((e: any) => e.year === searchYear)

    // 11. Determine match type
    const matchType = best.combined >= 0.95 ? 'EXACT_MATCH' :
                      best.combined >= config.similarityThreshold ? 'FUZZY_MATCH' :
                      'NO_MATCH'

    // Prepare top 3 for rejected matches
    const rejectedMatches: RejectedMatch[] = scoredCandidates.slice(0, 3).map(candidate => {
      const candidateEdition = candidate.event.editions?.find((e: any) => e.year === searchYear)
      return {
        eventId: candidate.event.id,
        eventName: candidate.event.name,
        eventSlug: candidate.event.slug,
        eventCity: candidate.event.city,
        eventDepartment: candidate.event.department,
        editionId: candidateEdition?.id,
        editionYear: candidateEdition?.year,
        matchScore: candidate.combined,
        nameScore: candidate.nameScore,
        cityScore: candidate.cityScore,
        departmentMatch: candidate.departmentMatch,
        dateProximity: candidate.dateProximity
      }
    })

    const result: EventMatchResult = {
      type: matchType,
      event: {
        id: best.event.id,
        name: best.event.name,
        city: best.event.city,
        slug: best.event.slug,
        similarity: best.combined
      },
      edition: edition ? {
        id: edition.id,
        year: edition.year,
        startDate: edition.startDate
      } : undefined,
      confidence: best.combined,
      rejectedMatches: rejectedMatches.length > 0 ? rejectedMatches : undefined
    }

    logger.info(`  → Result: ${result.type} with "${result.event?.name || 'unknown'}" (confidence: ${result.confidence.toFixed(3)}, edition: ${result.edition ? 'YES' : 'NO'})`)

    return result
  } catch (error) {
    logger.error('Error during matching:', error)
    return { type: 'NO_MATCH', confidence: 0 }
  }
}

/**
 * Match races by distance and name using hybrid algorithm
 * 
 * Strategy:
 * 1. Group DB races by distance (with tolerance)
 * 2. For each input race:
 *    - If 1 DB race with same distance → Auto match
 *    - If multiple DB races → Fuzzy match on name
 *    - If no DB race → New race
 */
export function matchRaces(
  inputRaces: RaceMatchInput[],
  dbRaces: DbRace[],
  logger: MatchingLogger = defaultLogger,
  tolerancePercent: number = 0.05
): RaceMatchResult {
  const matched: Array<{ input: RaceMatchInput, db: DbRace }> = []
  const unmatched: RaceMatchInput[] = []

  // 1. Group DB races by distance
  const racesByDistance = new Map<number, DbRace[]>()

  for (const race of dbRaces) {
    const totalDistanceKm = (race.runDistance || 0) +
                            (race.walkDistance || 0) +
                            (race.swimDistance || 0) +
                            (race.bikeDistance || 0)

    if (totalDistanceKm === 0) continue

    let foundGroup = false
    for (const [groupDistance, races] of racesByDistance.entries()) {
      const tolerance = groupDistance * tolerancePercent
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

  logger.debug(`Grouped ${dbRaces.length} races into ${racesByDistance.size} distance groups`)

  // DB races without distance for fallback
  const racesWithoutDistance = dbRaces.filter(race => {
    const totalDistanceKm = (race.runDistance || 0) +
                            (race.walkDistance || 0) +
                            (race.swimDistance || 0) +
                            (race.bikeDistance || 0)
    return totalDistanceKm === 0
  })

  // 2. Match each input race
  for (const inputRace of inputRaces) {
    const inputDistanceKm = inputRace.distance || 0

    if (inputDistanceKm === 0) {
      logger.debug(`Race "${inputRace.name}" has no distance - treating as new`)
      unmatched.push(inputRace)
      continue
    }

    // Find candidates by distance
    let candidates: DbRace[] = []
    for (const [groupDistance, races] of racesByDistance.entries()) {
      const tolerance = groupDistance * tolerancePercent
      if (Math.abs(groupDistance - inputDistanceKm) <= tolerance) {
        candidates = races
        break
      }
    }

    if (candidates.length === 0) {
      // Try fallback with races without distance
      if (racesWithoutDistance.length > 0) {
        const bestMatch = fuzzyMatchRaceName(inputRace, racesWithoutDistance, logger)

        if (bestMatch.score >= 0.7) {
          logger.debug(`Fallback match: "${inputRace.name}" → "${bestMatch.race.name}" (score: ${bestMatch.score.toFixed(2)})`)
          matched.push({ input: inputRace, db: bestMatch.race })
          continue
        }
      }
      unmatched.push(inputRace)
    } else if (candidates.length === 1) {
      logger.debug(`Race "${inputRace.name}" → "${candidates[0].name}" (unique distance match)`)
      matched.push({ input: inputRace, db: candidates[0] })
    } else {
      const bestMatch = fuzzyMatchRaceName(inputRace, candidates, logger)

      if (bestMatch.score >= 0.5) {
        logger.debug(`Race "${inputRace.name}" → "${bestMatch.race.name}" (score: ${bestMatch.score.toFixed(2)})`)
        matched.push({ input: inputRace, db: bestMatch.race })
      } else {
        unmatched.push(inputRace)
      }
    }
  }

  return { matched, unmatched }
}

/**
 * Legacy wrapper for matchRaces with FFA-style signature
 * 
 * @deprecated Use matchRaces directly with RaceMatchInput[]
 * 
 * This function provides backwards compatibility for code that uses
 * the old matchRacesByDistanceAndName signature with `runDistance` 
 * instead of `distance`, and returns `{ ffa, db }` instead of `{ input, db }`.
 */
export function matchRacesByDistanceAndName(
  ffaRaces: any[],
  dbRaces: DbRace[],
  logger: any,
  tolerancePercent: number = 0.05
): {
  matched: Array<{ ffa: any, db: DbRace }>,
  unmatched: any[]
} {
  // Adapt logger to MatchingLogger interface
  const adaptedLogger: MatchingLogger = {
    info: (msg, data) => logger.info?.(msg, data) || console.log(msg, data),
    debug: (msg, data) => logger.debug?.(msg, data) || logger.info?.(msg, data) || console.log(msg, data),
    warn: (msg, data) => logger.warn?.(msg, data) || console.warn(msg, data),
    error: (msg, data) => logger.error?.(msg, data) || console.error(msg, data)
  }

  // Convert FFA races to RaceMatchInput format
  const raceInputs: RaceMatchInput[] = ffaRaces.map(r => ({
    name: r.name,
    distance: r.runDistance || r.distance, // Support both formats
    startTime: r.startTime
  }))

  const result = matchRaces(raceInputs, dbRaces, adaptedLogger, tolerancePercent)

  // Convert back to FFA-style output
  return {
    matched: result.matched.map(m => {
      // Find original FFA race by name
      const ffaRace = ffaRaces.find(r => r.name === m.input.name) || ffaRaces[0]
      return { ffa: ffaRace, db: m.db }
    }),
    unmatched: result.unmatched.map(u => {
      // Find original FFA race by name
      return ffaRaces.find(r => r.name === u.name) || u
    })
  }
}

/**
 * Calculate adjusted confidence for EDITION_UPDATE and RACE_UPDATE proposals
 */
export function calculateAdjustedConfidence(
  baseConfidence: number,
  matchResult: EventMatchResult,
  hasOrganizerInfo: boolean = false,
  raceCount: number = 1
): number {
  let confidence = baseConfidence

  if (matchResult.type === 'EXACT_MATCH') {
    confidence = Math.min(confidence + 0.05, 1)
  }

  if (hasOrganizerInfo) {
    confidence = Math.min(confidence + 0.02, 1)
  }

  if (raceCount > 1) {
    confidence = Math.min(confidence + 0.01, 1)
  }

  if (matchResult.confidence < 0.8) {
    confidence *= matchResult.confidence
  }

  return Math.round(confidence * 100) / 100
}

/**
 * Calculate confidence for NEW_EVENT proposals
 * 
 * Inverted logic: Lower match = higher confidence to create new event
 */
export function calculateNewEventConfidence(
  baseConfidence: number,
  matchResult: EventMatchResult,
  hasOrganizerInfo: boolean = false,
  raceCount: number = 1,
  eventLevel?: string
): number {
  let confidence = baseConfidence

  if (matchResult.confidence === 0) {
    confidence = Math.min(confidence + 0.05, 1)
  } else {
    const penalty = matchResult.confidence * 0.5
    confidence *= (1 - penalty)
  }

  if (hasOrganizerInfo) {
    confidence = Math.min(confidence + 0.03, 1)
  }

  if (raceCount > 1) {
    confidence = Math.min(confidence + 0.02, 1)
  }

  if (eventLevel === 'Régional' || eventLevel === 'National') {
    confidence = Math.min(confidence + 0.01, 1)
  }

  return Math.round(confidence * 100) / 100
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Find candidate events by name + city + time period
 */
async function findCandidateEvents(
  name: string,
  city: string,
  department: string | undefined,
  date: Date,
  sourceDb: any
): Promise<Array<{ id: string, name: string, city: string, slug?: string, countrySubdivisionDisplayCodeLevel2: string, editions?: any[] }>> {
  try {
    const startDate = new Date(date)
    startDate.setDate(startDate.getDate() - 90)

    const endDate = new Date(date)
    endDate.setDate(endDate.getDate() + 90)

    const nameWords = name.split(' ').filter(w => w.length >= 3)
    const cityWords = city.split(' ').filter(w => w.length >= 3)

    // PASS 1: Same department + Name
    let allEvents = await sourceDb.event.findMany({
      where: {
        AND: [
          {
            editions: {
              some: { startDate: { gte: startDate, lte: endDate } }
            }
          },
          department ? { countrySubdivisionDisplayCodeLevel2: department } : {},
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
        slug: true,
        city: true,
        countrySubdivisionDisplayCodeLevel2: true,
        editions: {
          where: { startDate: { gte: startDate, lte: endDate } },
          select: { id: true, year: true, startDate: true }
        }
      },
      take: 100
    })

    // PASS 2: Name OR City (all departments)
    if (allEvents.length < 10) {
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
          slug: true,
          city: true,
          countrySubdivisionDisplayCodeLevel2: true,
          editions: {
            where: { startDate: { gte: startDate, lte: endDate } },
            select: { id: true, year: true, startDate: true }
          }
        },
        take: Math.max(100 - allEvents.length, 20)
      })

      allEvents = [...allEvents, ...moreEvents]
    }

    // PASS 3: Name AND City (no date constraint)
    const searchYear = date.getFullYear()
    const exactMatchEvents = await sourceDb.event.findMany({
      where: {
        AND: [
          {
            editions: {
              some: { year: String(searchYear) }
            }
          },
          nameWords.length > 0 ? {
            OR: nameWords.map(w => ({
              name: { contains: w, mode: 'insensitive' as const }
            }))
          } : {},
          cityWords.length > 0 ? {
            OR: cityWords.map(w => ({
              city: { contains: w, mode: 'insensitive' as const }
            }))
          } : {},
          { NOT: { id: { in: allEvents.map((e: any) => e.id) } } }
        ].filter(clause => Object.keys(clause).length > 0)
      },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        countrySubdivisionDisplayCodeLevel2: true,
        editions: {
          where: { year: String(searchYear) },
          select: { id: true, year: true, startDate: true }
        }
      },
      take: 20
    })

    if (exactMatchEvents.length > 0) {
      allEvents = [...allEvents, ...exactMatchEvents]
    }

    return allEvents
  } catch (error) {
    console.error('Error finding candidate events:', error)
    return []
  }
}

/**
 * Fuzzy match a race name against candidates
 */
function fuzzyMatchRaceName(
  inputRace: RaceMatchInput,
  candidates: DbRace[],
  logger: MatchingLogger
): { race: DbRace, score: number } {
  const searchName = normalizeRaceName(inputRace.name)
  const searchKeywords = removeStopwords(searchName)

  const prepared = candidates.map(race => ({
    ...race,
    nameNorm: normalizeRaceName(race.name || ''),
    nameKeywords: removeStopwords(normalizeRaceName(race.name || ''))
  }))

  const fuse = new Fuse(prepared, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.6,
    keys: [
      { name: 'nameNorm', weight: 0.6 },
      { name: 'nameKeywords', weight: 0.4 }
    ]
  })

  const nameResults = fuse.search(searchName)
  const keywordResults = fuse.search(searchKeywords)

  const scoreMap = new Map<string | number, { race: DbRace, score: number }>()

  for (const result of nameResults) {
    const similarity = 1 - (result.score ?? 1)
    const id = result.item.id
    scoreMap.set(id, { race: result.item, score: similarity })
  }

  for (const result of keywordResults) {
    const similarity = 1 - (result.score ?? 1)
    const id = result.item.id
    const existing = scoreMap.get(id)
    if (!existing || similarity > existing.score) {
      scoreMap.set(id, { race: result.item, score: similarity })
    }
  }

  let best = { race: candidates[0], score: 0 }
  for (const entry of scoreMap.values()) {
    if (entry.score > best.score) {
      best = entry
    }
  }

  return best
}

/**
 * Validate that a keyword-based match is legitimate
 */
function validateKeywordMatch(searchKeywords: string[], candidateKeywords: string[]): boolean {
  if (searchKeywords.length === 0 || candidateKeywords.length === 0) {
    return false
  }

  const commonKeywords = searchKeywords.filter(sk =>
    candidateKeywords.some(ck =>
      sk === ck || sk.includes(ck) || ck.includes(sk)
    )
  )

  if (commonKeywords.length >= 2) {
    return true
  }

  if (commonKeywords.length >= 1) {
    const hasDistinctiveKeyword = commonKeywords.some(kw => kw.length >= 8)
    if (hasDistinctiveKeyword) {
      return true
    }
  }

  return false
}

/**
 * Remove edition number from event name
 */
export function removeEditionNumber(name: string): string {
  return name
    .replace(/\s*[-–—]\s*\d+\s*[eèé]?me?\s+[eé]?ditions?\s*$/i, '')
    .replace(/\s+\d+\s*[eèé]?me?\s+[eé]?ditions?\s*$/i, '')
    .replace(/\b\d+\s*[eèé]?me?\b/gi, '')
    .replace(/\s*[#№]\s*\d+/gi, '')
    .replace(/\s*n[o°]?\.?\s*\d+/gi, '')
    .replace(/\s*[-–—]?\s*\(?\d{4}\)?\s*$/, '')
    .replace(/\s*\([^)]+\)\s*$/g, '')
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize string for comparison
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''‛]/g, "'")
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize race name for matching
 */
export function normalizeRaceName(name: string): string {
  return normalizeString(name)
    .replace(/- course hs non officielle/gi, '') // Retirer suffixe FFA
    .replace(/course hs non officielle/gi, '')
    .replace(/course hs/gi, '')
    .replace(/\ben duo\b/gi, '') // Retirer "en duo"
    .replace(/\badulte[s]?\b/gi, '') // Retirer "adulte(s)"
    .replace(/\benfant[s]?\b/gi, '') // Retirer "enfant(s)"
    .replace(/\bjeune[s]?\b/gi, '') // Retirer "jeune(s)"
    .replace(/courses\b/gi, 'course') // Singulariser "courses"
    .replace(/relais\b/gi, 'relai') // Normaliser "relais" → "relai"
    .replace(/\s+/g, ' ') // Collapser espaces multiples
    .trim()
}

/**
 * Calculate Levenshtein distance
 * @deprecated Use fuse.js instead
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[len1][len2]
}

/**
 * Calculate similarity between two strings
 * @deprecated Use fuse.js instead
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

// Note: normalizeString, normalizeRaceName, removeEditionNumber are already exported inline
