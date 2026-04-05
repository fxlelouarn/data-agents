/**
 * Wrapper de matching pour l'agent FFTRI
 *
 * Ce module fait le lien entre les types FFTRI et le service de matching mutualisé.
 * Le code de matching a été déplacé dans @data-agents/agent-framework.
 *
 * @see packages/agent-framework/src/services/event-matching/
 */

import { FFTRIEventDetails, FFTRIMatchResult, FFTRIScraperConfig } from './types'
import {
  matchEvent,
  calculateAdjustedConfidence as calculateAdjustedConfidenceGeneric,
  calculateNewEventConfidence as calculateNewEventConfidenceGeneric,
  EventMatchInput,
  EventMatchResult,
  MatchingLogger,
  MeilisearchMatchingConfig,
  LLMMatchingService,
  LLMMatchingConfig
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
 * Convertir FFTRIEventDetails en EventMatchInput
 */
function fftriToMatchInput(eventDetails: FFTRIEventDetails): EventMatchInput {
  return {
    eventName: eventDetails.event.name,
    eventCity: eventDetails.event.city,
    eventDepartment: eventDetails.event.department,
    editionDate: eventDetails.startDate,
    editionYear: eventDetails.startDate.getFullYear(),
    organizerName: eventDetails.organizerName,
  }
}

/**
 * Convertir EventMatchResult en FFTRIMatchResult (format FFTRI)
 */
function matchResultToFFTRI(result: EventMatchResult): FFTRIMatchResult {
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
    })),
    llmNewEventConfidence: result.llmNewEventConfidence,
    llmReason: result.llmReason,
    llmCleanedEventName: result.llmCleanedEventName,
  }
}

/**
 * Convertir FFTRIMatchResult en EventMatchResult pour le service générique
 */
function fftriToEventMatchResult(matchResult: FFTRIMatchResult): EventMatchResult {
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
 * Match un événement FFTRI avec un événement Miles Republic existant
 *
 * Cette fonction est un wrapper autour du service de matching mutualisé.
 * Elle convertit les types FFTRI vers les types génériques et inversement.
 *
 * @param meilisearchConfig - Configuration optionnelle pour utiliser Meilisearch
 */
export async function matchFFTRIEvent(
  eventDetails: FFTRIEventDetails,
  sourceDb: any,
  config: FFTRIScraperConfig,
  logger: any,
  meilisearchConfig?: MeilisearchMatchingConfig,
  llmConfig?: LLMMatchingConfig
): Promise<FFTRIMatchResult> {
  const input = fftriToMatchInput(eventDetails)
  const adaptedLogger = adaptLogger(logger)

  // Use provided LLM config, or fall back to env vars
  const resolvedLlmConfig: LLMMatchingConfig | undefined = llmConfig ?? (process.env.LLM_MATCHING_API_KEY ? {
    apiKey: process.env.LLM_MATCHING_API_KEY,
    model: process.env.LLM_MATCHING_MODEL,
    enabled: process.env.LLM_MATCHING_ENABLED !== 'false',
    shadowMode: process.env.LLM_MATCHING_SHADOW_MODE === 'true',
  } : undefined)

  const llmService = resolvedLlmConfig ? new LLMMatchingService(resolvedLlmConfig, adaptedLogger) : undefined

  const result = await matchEvent(
    input,
    sourceDb,
    {
      similarityThreshold: config.similarityThreshold,
      distanceTolerancePercent: config.distanceTolerancePercent,
      confidenceBase: config.confidenceBase,
      meilisearch: meilisearchConfig,
      llm: resolvedLlmConfig,
      llmService,
    },
    adaptedLogger
  )

  return matchResultToFFTRI(result)
}

/**
 * Calcule un score de confiance ajusté pour les propositions EDITION_UPDATE
 */
export function calculateAdjustedConfidence(
  baseConfidence: number,
  eventDetails: FFTRIEventDetails,
  matchResult: FFTRIMatchResult
): number {
  const hasOrganizerInfo = !!eventDetails.organizerWebsite
  const raceCount = eventDetails.event.races.length

  const eventMatchResult = fftriToEventMatchResult(matchResult)

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
  eventDetails: FFTRIEventDetails,
  matchResult: FFTRIMatchResult
): number {
  const hasOrganizerInfo = !!eventDetails.organizerWebsite
  const raceCount = eventDetails.event.races.length

  const eventMatchResult = fftriToEventMatchResult(matchResult)

  return calculateNewEventConfidenceGeneric(
    baseConfidence,
    eventMatchResult,
    hasOrganizerInfo,
    raceCount,
    undefined
  )
}

// Re-exporter les fonctions utilitaires du framework pour compatibilité
export {
  calculateSimilarity,
  levenshteinDistance
} from '@data-agents/agent-framework'
