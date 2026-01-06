/**
 * Agent de Détection de Doublons d'Événements
 *
 * Cet agent analyse automatiquement la base Miles Republic pour détecter
 * les événements potentiellement doublons et créer des propositions EVENT_MERGE.
 *
 * Critères de scoring :
 * - Similarité de nom (40%) : fuzzy matching avec fuse.js
 * - Proximité géographique (30%) : ville/département/coordonnées GPS
 * - Proximité temporelle (20%) : dates des éditions
 * - Catégories de courses (10%) : chevauchement des types
 */

import { AGENT_VERSIONS, DuplicateDetectionAgentConfigSchema, getAgentName } from '@data-agents/types'
import { BaseAgent, AgentContext, AgentRunResult, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import {
  calculateDuplicateScore,
  chooseKeepEvent,
  DEFAULT_SCORING_CONFIG,
  DuplicateScoringConfig,
  EventForScoring,
  DuplicateScore
} from './duplicate-detection/scoring'
import {
  findCandidateEvents,
  getPairKey,
  hasExistingMergeProposal,
  CandidateSearchConfig
} from './duplicate-detection/candidates'

// Version exportée pour compatibilité
export const DUPLICATE_DETECTION_AGENT_VERSION = AGENT_VERSIONS.DUPLICATE_DETECTION_AGENT

/**
 * Configuration de l'agent de détection de doublons
 */
interface DuplicateDetectionConfig {
  sourceDatabase: string
  minDuplicateScore: number
  maxDistanceKm: number
  dateToleranceDays: number
  excludeStatuses: string | string[]  // Supporte ancien format (string) et nouveau (array)
  nameWeight: number
  locationWeight: number
  dateWeight: number
  categoryWeight: number
  batchSize: number
  rescanDelayDays: number
  useMeilisearch: boolean
  dryRun: boolean
  notifySlack: boolean
}

/**
 * État de progression de l'agent
 */
interface DuplicateDetectionProgress {
  lastProcessedEventId: number
  lastFullScanAt: string | null
  totalEventsAnalyzed: number
  totalDuplicatesFound: number
  analyzedPairs: Record<string, { analyzedAt: string; score: number; proposalCreated: boolean }>
}

/**
 * Doublon détecté avec métadonnées
 */
interface DetectedDuplicate {
  keepEvent: EventForScoring
  duplicateEvent: EventForScoring
  score: DuplicateScore
  keepReason: string
}

export class DuplicateDetectionAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prismaClient: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'duplicate-detection-agent',
      name: config.name || getAgentName('DUPLICATE_DETECTION'),
      description: `Agent de détection automatique des événements doublons (v${DUPLICATE_DETECTION_AGENT_VERSION})`,
      type: 'ANALYZER' as AgentType,
      frequency: config.frequency || { type: 'daily', windowStart: '02:00', windowEnd: '05:00', jitterMinutes: 60 },
      isActive: config.isActive ?? true,
      config: {
        version: DUPLICATE_DETECTION_AGENT_VERSION,
        sourceDatabase: config.sourceDatabase || config.config?.sourceDatabase,
        minDuplicateScore: config.minDuplicateScore || config.config?.minDuplicateScore || 0.80,
        maxDistanceKm: config.maxDistanceKm || config.config?.maxDistanceKm || 15,
        dateToleranceDays: config.dateToleranceDays || config.config?.dateToleranceDays || 30,
        excludeStatuses: config.excludeStatuses ?? config.config?.excludeStatuses ?? [],
        nameWeight: config.nameWeight || config.config?.nameWeight || 0.40,
        locationWeight: config.locationWeight || config.config?.locationWeight || 0.30,
        dateWeight: config.dateWeight || config.config?.dateWeight || 0.20,
        categoryWeight: config.categoryWeight || config.config?.categoryWeight || 0.10,
        batchSize: config.batchSize || config.config?.batchSize || 100,
        rescanDelayDays: config.rescanDelayDays || config.config?.rescanDelayDays || 30,
        useMeilisearch: config.useMeilisearch ?? config.config?.useMeilisearch ?? true,
        dryRun: config.dryRun ?? config.config?.dryRun ?? false,
        notifySlack: config.notifySlack ?? config.config?.notifySlack ?? false,
        configSchema: DuplicateDetectionAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
    this.prismaClient = prisma
    this.stateService = new AgentStateService(prisma)
  }

  /**
   * Récupère la configuration Meilisearch depuis les Settings admin, avec fallback sur env vars
   */
  private async getMeilisearchConfig(): Promise<{ url: string; apiKey: string } | null> {
    try {
      // 1. Essayer depuis les Settings admin
      const settings = await this.prismaClient.settings.findUnique({
        where: { id: 'singleton' },
        select: { meilisearchUrl: true, meilisearchApiKey: true }
      })

      if (settings?.meilisearchUrl && settings?.meilisearchApiKey) {
        this.logger.debug('Using Meilisearch config from admin settings')
        return { url: settings.meilisearchUrl, apiKey: settings.meilisearchApiKey }
      }
    } catch (error) {
      this.logger.debug('Could not read Meilisearch config from settings, trying env vars')
    }

    // 2. Fallback sur variables d'environnement
    const url = process.env.MEILISEARCH_URL
    const apiKey = process.env.MEILISEARCH_API_KEY

    if (url && apiKey) {
      this.logger.debug('Using Meilisearch config from environment variables')
      return { url, apiKey }
    }

    return null
  }

  /**
   * Initialise la connexion à la base de données Miles Republic
   */
  private async initializeSourceConnection(config: DuplicateDetectionConfig): Promise<void> {
    if (!this.sourceDb) {
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
    }
  }

  /**
   * Charge l'état de progression depuis AgentState
   */
  private async loadProgress(): Promise<DuplicateDetectionProgress> {
    const progress = await this.stateService.getState<DuplicateDetectionProgress>(
      this.config.id,
      'progress'
    )

    if (progress) {
      return progress
    }

    // État initial
    return {
      lastProcessedEventId: 0,
      lastFullScanAt: null,
      totalEventsAnalyzed: 0,
      totalDuplicatesFound: 0,
      analyzedPairs: {}
    }
  }

  /**
   * Sauvegarde l'état de progression
   */
  private async saveProgress(progress: DuplicateDetectionProgress): Promise<void> {
    await this.stateService.setState(this.config.id, 'progress', progress)
  }

  /**
   * Récupère un batch d'événements à analyser
   */
  private async fetchEventsBatch(
    config: DuplicateDetectionConfig,
    lastProcessedId: number
  ): Promise<EventForScoring[]> {
    // Parser les statuts à exclure (supporte string ou array)
    let excludeStatuses: string[] = []
    if (config.excludeStatuses) {
      if (Array.isArray(config.excludeStatuses)) {
        excludeStatuses = config.excludeStatuses.filter(s => s)
      } else {
        excludeStatuses = config.excludeStatuses.split(',').map(s => s.trim()).filter(s => s)
      }
    }

    // Construire le where
    const where: any = {
      id: { gt: lastProcessedId },
      status: 'LIVE'
    }

    // Exclure certains statuts si configuré
    if (excludeStatuses.length > 0) {
      where.status = { notIn: excludeStatuses }
    }

    const events = await this.sourceDb.event.findMany({
      where,
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
      orderBy: { id: 'asc' },
      take: config.batchSize
    })

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
   * Analyse un événement pour détecter des doublons potentiels
   */
  private async analyzeEventForDuplicates(
    event: EventForScoring,
    config: DuplicateDetectionConfig,
    progress: DuplicateDetectionProgress,
    scoringConfig: DuplicateScoringConfig,
    candidateConfig: CandidateSearchConfig
  ): Promise<DetectedDuplicate[]> {
    const duplicates: DetectedDuplicate[] = []

    // Chercher les candidats
    const candidates = await findCandidateEvents(event, this.sourceDb, candidateConfig, {
      info: (msg, meta) => this.logger.info(msg, meta),
      debug: (msg, meta) => this.logger.debug(msg, meta),
      warn: (msg, meta) => this.logger.warn(msg, meta)
    })

    this.logger.debug(`Event ${event.id} "${event.name}": ${candidates.length} candidates found`)

    for (const candidate of candidates) {
      // Vérifier si on a déjà analysé cette paire
      const pairKey = getPairKey(event.id, candidate.id)
      if (progress.analyzedPairs[pairKey]) {
        continue
      }

      // Calculer le score de duplication
      const score = calculateDuplicateScore(event, candidate, scoringConfig, config.minDuplicateScore)

      // Log du score pour debug (seulement si score significatif)
      if (score.score >= 0.5) {
        this.logger.debug(`Score ${event.id} <-> ${candidate.id}: ${(score.score * 100).toFixed(1)}% (threshold: ${(config.minDuplicateScore * 100).toFixed(0)}%)`, {
          event: event.name,
          candidate: candidate.name,
          details: score.details
        })
      }

      // Marquer comme analysé
      progress.analyzedPairs[pairKey] = {
        analyzedAt: new Date().toISOString(),
        score: score.score,
        proposalCreated: false
      }

      if (score.isDuplicate) {
        // Choisir quel événement conserver
        const { keepEvent, duplicateEvent, reason } = chooseKeepEvent(event, candidate)

        duplicates.push({
          keepEvent,
          duplicateEvent,
          score,
          keepReason: reason
        })

        this.logger.info(`Duplicate detected: "${event.name}" <-> "${candidate.name}" (score: ${score.score.toFixed(2)})`, {
          pairKey,
          keepEventId: keepEvent.id,
          duplicateEventId: duplicateEvent.id,
          reason,
          details: score.details
        })
      }
    }

    return duplicates
  }

  /**
   * Crée une proposition EVENT_MERGE pour un doublon détecté
   */
  private async createMergeProposal(
    duplicate: DetectedDuplicate,
    config: DuplicateDetectionConfig
  ): Promise<boolean> {
    const { keepEvent, duplicateEvent, score, keepReason } = duplicate

    // Vérifier si une proposition existe déjà
    const hasExisting = await hasExistingMergeProposal(
      this.prismaClient,
      keepEvent.id,
      duplicateEvent.id
    )

    if (hasExisting) {
      this.logger.debug(`Skipping - merge proposal already exists for ${keepEvent.id} <-> ${duplicateEvent.id}`)
      return false
    }

    // Construire les données de la proposition
    const changes = {
      merge: {
        keepEventId: keepEvent.id,
        keepEventName: keepEvent.name,
        keepEventCity: keepEvent.city,
        keepEventEditionsCount: keepEvent.editions.length,
        duplicateEventId: duplicateEvent.id,
        duplicateEventName: duplicateEvent.name,
        duplicateEventCity: duplicateEvent.city,
        duplicateEventEditionsCount: duplicateEvent.editions.length,
        newEventName: null,
        copyMissingEditions: true
      }
    }

    const justification = [
      {
        type: 'duplicate_detection',
        message: `Doublon potentiel détecté automatiquement (score: ${(score.score * 100).toFixed(1)}%)`,
        metadata: {
          detectionMethod: 'automatic',
          agentVersion: DUPLICATE_DETECTION_AGENT_VERSION,
          scores: score.details,
          keepEventReason: keepReason,
          analyzedAt: new Date().toISOString()
        }
      }
    ]

    const sourceMetadata = {
      type: 'INTERNAL_ANALYSIS',
      extractedAt: new Date().toISOString(),
      extra: {
        agentType: 'DUPLICATE_DETECTION'
      }
    }

    // Créer la proposition
    await this.prismaClient.proposal.create({
      data: {
        agentId: this.config.id,
        type: 'EVENT_MERGE',
        status: 'PENDING',
        eventId: keepEvent.id.toString(),
        eventName: keepEvent.name,
        eventCity: keepEvent.city,
        confidence: score.score,
        changes,
        justification,
        sourceMetadata
      }
    })

    this.logger.info(`Created EVENT_MERGE proposal: keep "${keepEvent.name}" (${keepEvent.id}), delete "${duplicateEvent.name}" (${duplicateEvent.id})`)

    return true
  }

  /**
   * Point d'entrée principal de l'agent
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    const startTime = Date.now()
    const config = this.config.config as DuplicateDetectionConfig

    let eventsProcessed = 0
    let duplicatesFound = 0
    let proposalsCreated = 0
    const errors: string[] = []

    try {
      this.logger.info(`Starting Duplicate Detection Agent v${DUPLICATE_DETECTION_AGENT_VERSION}`, {
        dryRun: config.dryRun,
        batchSize: config.batchSize,
        minDuplicateScore: config.minDuplicateScore
      })

      // Initialiser la connexion
      await this.initializeSourceConnection(config)

      // Charger la progression
      const progress = await this.loadProgress()
      this.logger.info(`Resuming from event ID ${progress.lastProcessedEventId}`)

      // Préparer les configurations
      const scoringConfig: DuplicateScoringConfig = {
        nameWeight: config.nameWeight,
        locationWeight: config.locationWeight,
        dateWeight: config.dateWeight,
        categoryWeight: config.categoryWeight,
        maxDistanceKm: config.maxDistanceKm,
        dateToleranceDays: config.dateToleranceDays
      }

      // Récupérer la config Meilisearch (Settings admin > env vars)
      const meilisearchConfig = config.useMeilisearch ? await this.getMeilisearchConfig() : null
      if (meilisearchConfig) {
        this.logger.info('Meilisearch configured for candidate search')
      } else if (config.useMeilisearch) {
        this.logger.info('Meilisearch not configured, using SQL fallback')
      }

      const candidateConfig: CandidateSearchConfig = {
        useMeilisearch: config.useMeilisearch && !!meilisearchConfig,
        meilisearchUrl: meilisearchConfig?.url,
        meilisearchApiKey: meilisearchConfig?.apiKey,
        maxCandidatesPerEvent: 50
      }

      // Récupérer le batch d'événements
      const events = await this.fetchEventsBatch(config, progress.lastProcessedEventId)
      this.logger.info(`Fetched ${events.length} events to analyze`)

      if (events.length === 0) {
        // Fin du scan, reset pour le prochain cycle
        this.logger.info('No more events to process, resetting for next cycle')
        progress.lastProcessedEventId = 0
        progress.lastFullScanAt = new Date().toISOString()
        // Nettoyer les paires analysées trop anciennes
        const rescanCutoff = new Date()
        rescanCutoff.setDate(rescanCutoff.getDate() - config.rescanDelayDays)
        const cutoffStr = rescanCutoff.toISOString()

        for (const key of Object.keys(progress.analyzedPairs)) {
          if (progress.analyzedPairs[key].analyzedAt < cutoffStr) {
            delete progress.analyzedPairs[key]
          }
        }
        await this.saveProgress(progress)

        return {
          success: true,
          message: 'Full scan complete, waiting for next cycle',
          metrics: {
            eventsProcessed: 0,
            duplicatesFound: 0,
            proposalsCreated: 0,
            duration: Date.now() - startTime
          }
        }
      }

      // Analyser chaque événement
      for (const event of events) {
        try {
          const duplicates = await this.analyzeEventForDuplicates(
            event,
            config,
            progress,
            scoringConfig,
            candidateConfig
          )

          eventsProcessed++
          duplicatesFound += duplicates.length

          // Créer les propositions (sauf en mode dry run)
          for (const duplicate of duplicates) {
            if (config.dryRun) {
              // En mode dryRun, afficher ce qui serait créé
              const { keepEvent, duplicateEvent, score, keepReason } = duplicate
              const hasExisting = await hasExistingMergeProposal(
                this.prismaClient,
                keepEvent.id,
                duplicateEvent.id
              )

              if (hasExisting) {
                this.logger.info(`[DRY RUN] Would skip (already exists): "${keepEvent.name}" <-> "${duplicateEvent.name}"`)
              } else {
                proposalsCreated++
                this.logger.info(`[DRY RUN] Would create EVENT_MERGE proposal:`, {
                  keepEvent: {
                    id: keepEvent.id,
                    name: keepEvent.name,
                    city: keepEvent.city,
                    editionsCount: keepEvent.editions.length
                  },
                  duplicateEvent: {
                    id: duplicateEvent.id,
                    name: duplicateEvent.name,
                    city: duplicateEvent.city,
                    editionsCount: duplicateEvent.editions.length
                  },
                  score: (score.score * 100).toFixed(1) + '%',
                  scoreDetails: score.details,
                  keepReason
                })
              }
            } else {
              const created = await this.createMergeProposal(duplicate, config)
              if (created) {
                proposalsCreated++
                // Marquer comme créé dans le cache
                const pairKey = getPairKey(duplicate.keepEvent.id, duplicate.duplicateEvent.id)
                if (progress.analyzedPairs[pairKey]) {
                  progress.analyzedPairs[pairKey].proposalCreated = true
                }
              }
            }
          }

          // Mettre à jour le dernier ID traité
          progress.lastProcessedEventId = event.id
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          this.logger.error(`Error analyzing event ${event.id}`, { error: errorMsg })
          errors.push(`Event ${event.id}: ${errorMsg}`)
        }
      }

      // Mettre à jour les stats globales
      progress.totalEventsAnalyzed += eventsProcessed
      progress.totalDuplicatesFound += duplicatesFound

      // Sauvegarder la progression
      await this.saveProgress(progress)

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
      const summaryData = {
        eventsProcessed,
        duplicatesFound,
        proposalsCreated,
        dryRun: config.dryRun,
        durationSec
      }
      if (config.dryRun) {
        this.logger.info(`[DRY RUN] Batch complete: ${eventsProcessed} events, ${duplicatesFound} duplicates, ${proposalsCreated} would be created`, summaryData)
      } else {
        this.logger.info(`Batch complete: ${eventsProcessed} events, ${duplicatesFound} duplicates, ${proposalsCreated} created`, summaryData)
      }

      return {
        success: errors.length === 0,
        message: errors.length > 0 ? `Completed with ${errors.length} errors` : `Processed ${eventsProcessed} events`,
        metrics: {
          eventsProcessed,
          duplicatesFound,
          proposalsCreated,
          dryRun: config.dryRun,
          lastProcessedEventId: progress.lastProcessedEventId,
          duration: Date.now() - startTime,
          errors: errors.length > 0 ? errors : undefined
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.error('Fatal error in Duplicate Detection Agent', { error: errorMsg })

      return {
        success: false,
        message: errorMsg,
        metrics: {
          eventsProcessed,
          duplicatesFound,
          proposalsCreated,
          duration: Date.now() - startTime
        }
      }
    }
  }
}
