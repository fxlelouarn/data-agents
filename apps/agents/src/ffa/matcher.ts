/**
 * Wrapper de matching pour l'agent FFA
 *
 * Ce module fait le lien entre les types FFA et le service de matching mutualisé.
 * Le code de matching a été déplacé dans @data-agents/agent-framework.
 *
 * @see packages/agent-framework/src/services/event-matching/
 */

import { FFACompetitionDetails, FFARace, MatchResult, FFAScraperConfig } from './types'
import {
  matchEvent,
  matchRaces as matchRacesGeneric,
  calculateAdjustedConfidence as calculateAdjustedConfidenceGeneric,
  calculateNewEventConfidence as calculateNewEventConfidenceGeneric,
  EventMatchInput,
  EventMatchResult,
  MatchingLogger,
  RaceMatchInput,
  DbRace,
  MeilisearchMatchingConfig
} from '@data-agents/agent-framework'

/**
 * Adapter le logger de l'agent au format du service de matching
 */
function adaptLogger(logger: any): MatchingLogger {
  return {
    info: (msg, data) => logger.info(msg, data),
    debug: (msg, data) => logger.debug?.(msg, data) || logger.info(msg, data),
    warn: (msg, data) => logger.warn?.(msg, data) || logger.info(msg, data),
    error: (msg, data) => logger.error(msg, data)
  }
}

/**
 * Convertir FFACompetitionDetails en EventMatchInput
 */
function ffaToMatchInput(competition: FFACompetitionDetails): EventMatchInput {
  return {
    eventName: competition.competition.name,
    eventCity: competition.competition.city,
    eventDepartment: competition.competition.department,
    editionDate: competition.competition.date,
    editionYear: competition.competition.date.getFullYear()
  }
}

/**
 * Convertir EventMatchResult en MatchResult (format FFA)
 */
function matchResultToFFA(result: EventMatchResult): MatchResult {
  return {
    type: result.type,
    event: result.event ? {
      id: String(result.event.id),
      name: result.event.name,
      city: result.event.city,
      similarity: result.event.similarity
    } : undefined,
    edition: result.edition ? {
      id: String(result.edition.id),
      year: result.edition.year,
      startDate: result.edition.startDate ?? null
    } : undefined,
    confidence: result.confidence,
    rejectedMatches: result.rejectedMatches?.map(rm => ({
      eventId: typeof rm.eventId === 'number' ? rm.eventId : parseInt(String(rm.eventId), 10),
      eventName: rm.eventName,
      eventSlug: rm.eventSlug || '',
      eventCity: rm.eventCity,
      eventDepartment: rm.eventDepartment || '',
      editionId: rm.editionId ? (typeof rm.editionId === 'number' ? rm.editionId : parseInt(String(rm.editionId), 10)) : undefined,
      editionYear: rm.editionYear,
      matchScore: rm.matchScore,
      nameScore: rm.nameScore,
      cityScore: rm.cityScore,
      departmentMatch: rm.departmentMatch,
      dateProximity: rm.dateProximity
    }))
  }
}

/**
 * Convertir MatchResult FFA en EventMatchResult pour le service générique
 */
function ffaToEventMatchResult(matchResult: MatchResult): EventMatchResult {
  return {
    type: matchResult.type,
    confidence: matchResult.confidence,
    event: matchResult.event ? {
      id: matchResult.event.id,
      name: matchResult.event.name,
      city: matchResult.event.city,
      similarity: matchResult.event.similarity
    } : undefined,
    edition: matchResult.edition ? {
      id: matchResult.edition.id,
      year: matchResult.edition.year,
      startDate: matchResult.edition.startDate ?? undefined
    } : undefined
  }
}

/**
 * Match une compétition FFA avec un événement Miles Republic existant
 *
 * Cette fonction est un wrapper autour du service de matching mutualisé.
 * Elle convertit les types FFA vers les types génériques et inversement.
 *
 * @param meilisearchConfig - Configuration optionnelle pour utiliser Meilisearch
 */
export async function matchCompetition(
  competition: FFACompetitionDetails,
  sourceDb: any,
  config: FFAScraperConfig,
  logger: any,
  meilisearchConfig?: MeilisearchMatchingConfig
): Promise<MatchResult> {
  const input = ffaToMatchInput(competition)
  const adaptedLogger = adaptLogger(logger)

  const result = await matchEvent(
    input,
    sourceDb,
    {
      similarityThreshold: config.similarityThreshold,
      distanceTolerancePercent: config.distanceTolerancePercent,
      confidenceBase: config.confidenceBase,
      meilisearch: meilisearchConfig
    },
    adaptedLogger
  )

  return matchResultToFFA(result)
}

/**
 * Match des courses FFA avec des courses Miles Republic existantes
 *
 * @deprecated Utiliser matchRaces de @data-agents/agent-framework directement
 */
export function matchRacesByDistanceAndName(
  ffaRaces: FFARace[],
  dbRaces: DbRace[],
  logger: any,
  tolerancePercent: number = 0.05
): {
  matched: Array<{ ffa: FFARace, db: DbRace }>,
  unmatched: FFARace[]
} {
  const adaptedLogger = adaptLogger(logger)

  // Convertir FFARace en RaceMatchInput
  const raceInputs: RaceMatchInput[] = ffaRaces.map(r => ({
    name: r.name,
    distance: r.distance ? r.distance / 1000 : undefined, // FFA stocke en mètres, convertir en km
    startTime: r.startTime
  }))

  const result = matchRacesGeneric(raceInputs, dbRaces, adaptedLogger, tolerancePercent)

  // Reconvertir les résultats vers le format FFA
  return {
    matched: result.matched.map(m => {
      // Retrouver la course FFA originale
      const ffaRace = ffaRaces.find(r => r.name === m.input.name) || ffaRaces[0]
      return { ffa: ffaRace, db: m.db }
    }),
    unmatched: result.unmatched.map(u => {
      // Retrouver la course FFA originale
      return ffaRaces.find(r => r.name === u.name) || ffaRaces[0]
    })
  }
}

/**
 * Calcule un score de confiance ajusté pour les propositions EDITION_UPDATE et RACE_UPDATE
 */
export function calculateAdjustedConfidence(
  baseConfidence: number,
  competition: FFACompetitionDetails,
  matchResult: MatchResult
): number {
  const hasOrganizerInfo = !!(competition.organizerEmail || competition.organizerWebsite)
  const raceCount = competition.races.length

  const eventMatchResult = ffaToEventMatchResult(matchResult)

  return calculateAdjustedConfidenceGeneric(
    baseConfidence,
    eventMatchResult,
    hasOrganizerInfo,
    raceCount
  )
}

/**
 * Calcule la confiance pour la création d'un NOUVEL événement
 */
export function calculateNewEventConfidence(
  baseConfidence: number,
  competition: FFACompetitionDetails,
  matchResult: MatchResult
): number {
  const hasOrganizerInfo = !!(competition.organizerEmail || competition.organizerWebsite)
  const raceCount = competition.races.length
  const eventLevel = competition.competition.level

  const eventMatchResult = ffaToEventMatchResult(matchResult)

  return calculateNewEventConfidenceGeneric(
    baseConfidence,
    eventMatchResult,
    hasOrganizerInfo,
    raceCount,
    eventLevel
  )
}

// Re-exporter les fonctions utilitaires du framework pour compatibilité
export {
  calculateSimilarity,
  levenshteinDistance
} from '@data-agents/agent-framework'
