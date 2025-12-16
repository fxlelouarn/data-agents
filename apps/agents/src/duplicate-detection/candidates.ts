/**
 * Duplicate Detection Candidates Module
 *
 * Recherche de candidats potentiellement doublons avec stratégie en entonnoir :
 * 1. Filtre par département (réduction du scope)
 * 2. Filtre par nom similaire (SQL ILIKE ou Meilisearch)
 * 3. Scoring détaillé (fuzzy matching)
 */

import { normalizeString, removeStopwords, removeEditionNumber } from '@data-agents/agent-framework'
import { getMeilisearchService } from '@data-agents/database'
import { EventForScoring } from './scoring'

/**
 * Configuration de la recherche de candidats
 */
export interface CandidateSearchConfig {
  useMeilisearch: boolean
  meilisearchUrl?: string
  meilisearchApiKey?: string
  maxCandidatesPerEvent: number
}

export const DEFAULT_CANDIDATE_CONFIG: CandidateSearchConfig = {
  useMeilisearch: true,
  maxCandidatesPerEvent: 50
}

/**
 * Logger interface
 */
export interface CandidateLogger {
  info: (message: string, meta?: Record<string, unknown>) => void
  debug: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
}

const defaultLogger: CandidateLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {}
}

/**
 * Recherche les candidats potentiellement doublons pour un événement donné
 *
 * Stratégie en entonnoir :
 * 1. Meilisearch (si configuré) : recherche full-text rapide
 * 2. Fallback SQL : ILIKE sur nom + même département
 */
export async function findCandidateEvents(
  event: EventForScoring,
  sourceDb: any,
  config: CandidateSearchConfig = DEFAULT_CANDIDATE_CONFIG,
  logger: CandidateLogger = defaultLogger
): Promise<EventForScoring[]> {
  const normalizedName = normalizeString(removeEditionNumber(event.name))
  const keywords = removeStopwords(normalizedName).split(' ').filter(w => w.length >= 3)

  logger.debug(`Finding candidates for "${event.name}" (${event.city})`, {
    normalizedName,
    keywords,
    department: event.countrySubdivisionDisplayCodeLevel2
  })

  // Tenter Meilisearch si configuré
  if (config.useMeilisearch && config.meilisearchUrl) {
    try {
      const candidates = await findCandidatesViaMeilisearch(
        event,
        normalizedName,
        config,
        logger
      )
      if (candidates.length > 0) {
        // Enrichir avec éditions et courses depuis Prisma
        return await enrichCandidatesWithEditions(candidates, sourceDb, logger)
      }
      logger.debug('Meilisearch returned 0 results, falling back to SQL')
    } catch (error) {
      logger.warn('Meilisearch search failed, falling back to SQL', { error })
    }
  }

  // Fallback : recherche SQL
  return await findCandidatesViaSql(event, keywords, sourceDb, config, logger)
}

/**
 * Recherche via Meilisearch
 */
async function findCandidatesViaMeilisearch(
  event: EventForScoring,
  normalizedName: string,
  config: CandidateSearchConfig,
  logger: CandidateLogger
): Promise<EventForScoring[]> {
  const meilisearchService = getMeilisearchService()

  if (!meilisearchService.isConfigured()) {
    logger.debug('Meilisearch not configured')
    return []
  }

  // Construire le filtre (même département si disponible)
  const filters: string[] = []
  if (event.countrySubdivisionDisplayCodeLevel2) {
    filters.push(`department = "${event.countrySubdivisionDisplayCodeLevel2}"`)
  }
  // Exclure l'événement lui-même
  filters.push(`objectID != ${event.id}`)

  const result = await meilisearchService.searchEvents({
    query: normalizedName,
    filters: filters.length > 0 ? filters.join(' AND ') : undefined,
    limit: config.maxCandidatesPerEvent
  })

  logger.debug(`Meilisearch found ${result.hits.length} candidates`)

  // Convertir au format EventForScoring (sans éditions pour l'instant)
  return result.hits.map((hit: any) => ({
    id: hit.objectID || hit.id,
    name: hit.eventName || hit.name || '',
    city: hit.eventCity || hit.city || '',
    countrySubdivisionDisplayCodeLevel2: hit.department,
    latitude: hit.latitude,
    longitude: hit.longitude,
    status: hit.status,
    editions: [] // Sera enrichi après
  }))
}

/**
 * Enrichit les candidats Meilisearch avec les éditions et courses depuis Prisma
 */
async function enrichCandidatesWithEditions(
  candidates: EventForScoring[],
  sourceDb: any,
  logger: CandidateLogger
): Promise<EventForScoring[]> {
  if (candidates.length === 0) return []

  const eventIds = candidates.map(c => c.id)

  const events = await sourceDb.event.findMany({
    where: { id: { in: eventIds } },
    select: {
      id: true,
      name: true,
      city: true,
      countrySubdivisionDisplayCodeLevel2: true,
      latitude: true,
      longitude: true,
      status: true,
      createdAt: true,
      editions: {
        select: {
          id: true,
          year: true,
          startDate: true,
          races: {
            select: {
              categoryLevel1: true
            }
          }
        }
      }
    }
  })

  logger.debug(`Enriched ${events.length} candidates with editions`)

  return events.map((e: any) => ({
    id: e.id,
    name: e.name,
    city: e.city,
    countrySubdivisionDisplayCodeLevel2: e.countrySubdivisionDisplayCodeLevel2,
    latitude: e.latitude,
    longitude: e.longitude,
    status: e.status,
    createdAt: e.createdAt,
    editions: e.editions.map((ed: any) => ({
      id: ed.id,
      year: ed.year,
      startDate: ed.startDate,
      races: ed.races
    }))
  }))
}

/**
 * Recherche via SQL avec stratégie en 2 passes
 *
 * Pass 1 : Même département + mots-clés du nom
 * Pass 2 : Tous départements + mots-clés du nom (si pas assez de résultats)
 */
async function findCandidatesViaSql(
  event: EventForScoring,
  keywords: string[],
  sourceDb: any,
  config: CandidateSearchConfig,
  logger: CandidateLogger
): Promise<EventForScoring[]> {
  const candidateMap = new Map<number, EventForScoring>()

  // Construire les conditions ILIKE pour les mots-clés
  const keywordConditions = keywords.slice(0, 3).map(keyword => ({
    name: { contains: keyword, mode: 'insensitive' as const }
  }))

  // Pass 1 : Même département + mots-clés
  if (event.countrySubdivisionDisplayCodeLevel2 && keywordConditions.length > 0) {
    const pass1Results = await sourceDb.event.findMany({
      where: {
        id: { not: event.id },
        status: 'LIVE',
        countrySubdivisionDisplayCodeLevel2: event.countrySubdivisionDisplayCodeLevel2,
        OR: keywordConditions
      },
      select: {
        id: true,
        name: true,
        city: true,
        countrySubdivisionDisplayCodeLevel2: true,
        latitude: true,
        longitude: true,
        status: true,
        createdAt: true,
        editions: {
          select: {
            id: true,
            year: true,
            startDate: true,
            races: {
              select: {
                categoryLevel1: true
              }
            }
          }
        }
      },
      take: config.maxCandidatesPerEvent
    })

    logger.debug(`SQL Pass 1 (same dept + keywords): ${pass1Results.length} results`)

    for (const e of pass1Results) {
      candidateMap.set(e.id, {
        id: e.id,
        name: e.name,
        city: e.city,
        countrySubdivisionDisplayCodeLevel2: e.countrySubdivisionDisplayCodeLevel2,
        latitude: e.latitude,
        longitude: e.longitude,
        status: e.status,
        createdAt: e.createdAt,
        editions: e.editions.map((ed: any) => ({
          id: ed.id,
          year: ed.year,
          startDate: ed.startDate,
          races: ed.races
        }))
      })
    }
  }

  // Pass 2 : Tous départements + mots-clés (si pas assez de résultats)
  if (candidateMap.size < 5 && keywordConditions.length > 0) {
    const existingIds = [...candidateMap.keys()]

    const pass2Results = await sourceDb.event.findMany({
      where: {
        id: { notIn: [event.id, ...existingIds] },
        status: 'LIVE',
        OR: keywordConditions
      },
      select: {
        id: true,
        name: true,
        city: true,
        countrySubdivisionDisplayCodeLevel2: true,
        latitude: true,
        longitude: true,
        status: true,
        createdAt: true,
        editions: {
          select: {
            id: true,
            year: true,
            startDate: true,
            races: {
              select: {
                categoryLevel1: true
              }
            }
          }
        }
      },
      take: config.maxCandidatesPerEvent - candidateMap.size
    })

    logger.debug(`SQL Pass 2 (all depts + keywords): ${pass2Results.length} results`)

    for (const e of pass2Results) {
      if (!candidateMap.has(e.id)) {
        candidateMap.set(e.id, {
          id: e.id,
          name: e.name,
          city: e.city,
          countrySubdivisionDisplayCodeLevel2: e.countrySubdivisionDisplayCodeLevel2,
          latitude: e.latitude,
          longitude: e.longitude,
          status: e.status,
          createdAt: e.createdAt,
          editions: e.editions.map((ed: any) => ({
            id: ed.id,
            year: ed.year,
            startDate: ed.startDate,
            races: ed.races
          }))
        })
      }
    }
  }

  return [...candidateMap.values()]
}

/**
 * Génère une clé unique pour une paire d'événements (ordre indépendant)
 * Utilisé pour éviter les doublons de propositions
 */
export function getPairKey(eventId1: number, eventId2: number): string {
  const [min, max] = eventId1 < eventId2 ? [eventId1, eventId2] : [eventId2, eventId1]
  return `${min}-${max}`
}

/**
 * Vérifie si une proposition EVENT_MERGE existe déjà pour cette paire d'événements
 */
export async function hasExistingMergeProposal(
  db: any,
  eventId1: number,
  eventId2: number
): Promise<boolean> {
  // Chercher dans les deux sens (keepEvent/duplicateEvent peuvent être inversés)
  const existing = await db.proposal.findFirst({
    where: {
      type: 'EVENT_MERGE',
      status: { in: ['PENDING', 'APPROVED'] },
      OR: [
        {
          eventId: eventId1.toString(),
          changes: {
            path: ['merge', 'duplicateEventId'],
            equals: eventId2
          }
        },
        {
          eventId: eventId2.toString(),
          changes: {
            path: ['merge', 'duplicateEventId'],
            equals: eventId1
          }
        }
      ]
    }
  })

  return existing !== null
}
