/**
 * Agent de récupération des résultats FFA (Fédération Française d'Athlétisme)
 *
 * Cet agent scrape automatiquement le calendrier FFA passé pour:
 * - Récupérer le nombre de participants (registrantsNumber) des compétitions
 * - Matcher les compétitions avec les éditions Miles Republic
 * - Créer des propositions de mise à jour du champ registrantsNumber
 *
 * Deux modes de fonctionnement :
 * 1. Pré-remplissage automatique pour les éditions opérées par MR (customerType = ESSENTIAL | PREMIUM)
 * 2. Scraping FFA pour les autres éditions (matching + proposition)
 */

import { AGENT_VERSIONS, FFAResultsAgentConfigSchema, getAgentName } from '@data-agents/types'
import {
  BaseAgent,
  AgentContext,
  AgentRunResult,
  ProposalData,
  ProposalType,
  AgentType,
  matchEvent,
  EventMatchInput,
  EventMatchResult,
  MatchingLogger,
  MeilisearchMatchingConfig
} from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import axios from 'axios'

import {
  FFAResultsConfig,
  FFAResultsProgress,
  FFACompetition,
  FFA_LIGUES
} from './ffa/types'
import {
  fetchAllCompetitionsForPeriod,
  humanDelay,
  calculateFFASeason
} from './ffa/scraper'
import { parseResultsCount, extractFFAIdFromResultsUrl } from './ffa/results-parser'

// Version exportée pour compatibilité
export const FFA_RESULTS_AGENT_VERSION = AGENT_VERSIONS.FFA_RESULTS_AGENT

// User-Agent pour les requêtes HTTP
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class FFAResultsAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma
  private meilisearchConfig?: MeilisearchMatchingConfig

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'ffa-results-agent',
      name: config.name || getAgentName('FFA_RESULTS'),
      description: `Agent qui récupère le nombre de participants depuis les résultats FFA (v${FFA_RESULTS_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 6 * * *', // Tous les jours à 6h
      isActive: config.isActive ?? true,
      config: {
        version: FFA_RESULTS_AGENT_VERSION,
        sourceDatabase: config.sourceDatabase || config.config?.sourceDatabase,
        liguesPerRun: config.liguesPerRun || config.config?.liguesPerRun || 2,
        monthsPerRun: config.monthsPerRun || config.config?.monthsPerRun || 1,
        levels: config.levels || config.config?.levels || ['Départemental', 'Régional', 'National', 'International'],
        humanDelayMs: config.humanDelayMs || config.config?.humanDelayMs || 2000,
        rescanDelayDays: config.rescanDelayDays || config.config?.rescanDelayDays || 30,
        similarityThreshold: config.similarityThreshold || config.config?.similarityThreshold || 0.75,
        confidenceBase: config.confidenceBase || config.config?.confidenceBase || 0.95,
        minEditionDate: config.minEditionDate || config.config?.minEditionDate || '2025-01-01',
        minDaysAgo: config.minDaysAgo || config.config?.minDaysAgo || 30,
        maxCandidates: config.maxCandidates || config.config?.maxCandidates || 5,
        configSchema: FFAResultsAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)

    // Configuration Meilisearch depuis les variables d'environnement
    if (process.env.MEILISEARCH_URL && process.env.MEILISEARCH_API_KEY) {
      this.meilisearchConfig = {
        url: process.env.MEILISEARCH_URL,
        apiKey: process.env.MEILISEARCH_API_KEY
      }
    }
  }

  /**
   * Adapte le logger au format attendu par le service de matching
   */
  private adaptLogger(): MatchingLogger {
    return {
      info: (msg, data) => this.logger.info(msg, data),
      debug: (msg, data) => {
        if (this.logger.debug) {
          this.logger.debug(msg, data)
        } else {
          this.logger.info(msg, data)
        }
      },
      warn: (msg, data) => {
        if (this.logger.warn) {
          this.logger.warn(msg, data)
        } else {
          this.logger.info(msg, data)
        }
      },
      error: (msg, data) => this.logger.error(msg, data)
    }
  }

  /**
   * Initialise la connexion à la base de données Miles Republic
   */
  private async initializeSourceConnection(config: FFAResultsConfig): Promise<void> {
    if (!this.sourceDb) {
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
    }
  }

  /**
   * Charge l'état de progression depuis AgentState
   */
  private async loadProgress(): Promise<FFAResultsProgress> {
    const progress = await this.stateService.getState<FFAResultsProgress>(
      this.config.id,
      'progress'
    )

    if (progress) {
      return progress
    }

    // État initial : commencer par les mois passés les plus récents
    return {
      currentLigue: FFA_LIGUES[0],
      currentMonth: this.getStartMonth(),
      currentPage: 0,
      completedLigues: [],
      completedMonths: {},
      totalCompetitionsScraped: 0,
      totalResultsFound: 0,
      totalProposalsCreated: 0
    }
  }

  /**
   * Calcule le mois de départ (date min ou début d'année)
   */
  private getStartMonth(): string {
    const config = this.config.config as FFAResultsConfig
    const minDate = new Date(config.minEditionDate)
    const year = minDate.getFullYear()
    const month = String(minDate.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  /**
   * Génère la liste des mois passés à scraper
   * Du mois de minEditionDate jusqu'au mois actuel - minDaysAgo
   */
  private generatePastMonthsToScrape(): string[] {
    const config = this.config.config as FFAResultsConfig
    const months: string[] = []

    const minDate = new Date(config.minEditionDate)
    const now = new Date()
    const maxDate = new Date(now.getTime() - config.minDaysAgo * 24 * 60 * 60 * 1000)

    let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1)

    while (current <= maxDate) {
      const year = current.getFullYear()
      const month = String(current.getMonth() + 1).padStart(2, '0')
      months.push(`${year}-${month}`)
      current.setMonth(current.getMonth() + 1)
    }

    return months
  }

  /**
   * Sauvegarde l'état de progression
   */
  private async saveProgress(progress: FFAResultsProgress): Promise<void> {
    await this.stateService.setState(this.config.id, 'progress', progress)
  }

  /**
   * Détermine les prochaines ligues/mois à scraper
   */
  private getNextTargets(
    progress: FFAResultsProgress,
    config: FFAResultsConfig
  ): { ligues: string[], months: string[] } {
    const allMonths = this.generatePastMonthsToScrape()

    // Vérifier si on a terminé un cycle complet
    const allLiguesCompleted = FFA_LIGUES.every(ligue => {
      const completedMonthsForLigue = progress.completedMonths[ligue] || []
      return allMonths.every(month => completedMonthsForLigue.includes(month))
    })

    if (allLiguesCompleted) {
      // Vérifier le cooldown
      if (progress.lastCompletedAt) {
        const daysSinceCompletion = (Date.now() - new Date(progress.lastCompletedAt).getTime()) / (1000 * 60 * 60 * 24)
        if (daysSinceCompletion < config.rescanDelayDays) {
          this.logger.info(`🛑 Cooldown actif: ${Math.ceil(config.rescanDelayDays - daysSinceCompletion)} jours restants`)
          return { ligues: [], months: [] }
        }
      }

      // Reset du cycle
      this.logger.info('🔄 Nouveau cycle de scraping')
      progress.completedLigues = []
      progress.completedMonths = {}
      progress.currentLigue = FFA_LIGUES[0]
      progress.currentMonth = allMonths[0]
    }

    // Trouver la position actuelle
    const currentLigueIndex = FFA_LIGUES.indexOf(progress.currentLigue as any)
    const currentMonthIndex = allMonths.indexOf(progress.currentMonth)

    // Sélectionner les ligues et mois à traiter
    const ligues = FFA_LIGUES.slice(currentLigueIndex, currentLigueIndex + config.liguesPerRun) as string[]
    const months = allMonths.slice(
      currentMonthIndex >= 0 ? currentMonthIndex : 0,
      (currentMonthIndex >= 0 ? currentMonthIndex : 0) + config.monthsPerRun
    )

    return { ligues, months }
  }

  /**
   * Récupère le nombre de participants depuis une page de résultats FFA
   */
  private async fetchResultsCount(resultsUrl: string, humanDelayMs: number): Promise<number | null> {
    try {
      await humanDelay(humanDelayMs)

      const response = await axios.get(resultsUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 60000
      })

      return parseResultsCount(response.data)
    } catch (error) {
      this.logger.warn(`Erreur lors de la récupération des résultats: ${resultsUrl}`, { error: String(error) })
      return null
    }
  }

  /**
   * Utilise le service de matching mutualisé du framework pour trouver un événement MR
   */
  private async matchWithFramework(
    competition: FFACompetition,
    config: FFAResultsConfig
  ): Promise<EventMatchResult> {
    // Convertir FFACompetition en EventMatchInput
    const input: EventMatchInput = {
      eventName: competition.name,
      eventCity: competition.city,
      eventDepartment: competition.department,
      editionDate: competition.date,
      editionYear: competition.date.getFullYear()
    }

    // Appeler le service de matching mutualisé
    const result = await matchEvent(
      input,
      this.sourceDb,
      {
        similarityThreshold: config.similarityThreshold,
        confidenceBase: config.confidenceBase,
        meilisearch: this.meilisearchConfig
      },
      this.adaptLogger()
    )

    return result
  }

  /**
   * Vérifie si une proposition similaire existe déjà
   */
  private async hasExistingProposal(ffaId: string): Promise<boolean> {
    const existing = await this.prisma.proposal.findFirst({
      where: {
        status: 'PENDING',
        justification: {
          path: ['$[*].metadata.ffaId'],
          string_contains: ffaId
        }
      }
    })
    return !!existing
  }

  /**
   * Crée une proposition pour une compétition FFA avec résultats
   *
   * Deux cas :
   * 1. Bon match (>= 0.9) : Crée une proposition EDITION_UPDATE avec eventId/editionId
   * 2. Pas de bon match : Crée une proposition EDITION_UPDATE SANS eventId/editionId
   *    pour que l'utilisateur puisse la lier manuellement via le dashboard
   */
  private async createResultsProposal(
    competition: FFACompetition,
    registrantsNumber: number,
    matchResult: EventMatchResult,
    config: FFAResultsConfig
  ): Promise<ProposalData | null> {
    // Vérifier si une proposition existe déjà pour cette compétition
    if (await this.hasExistingProposal(competition.ffaId)) {
      this.logger.debug(`Proposition existante pour ${competition.ffaId}, ignoré`)
      return null
    }

    // Cas 1 : Bon match trouvé (>= 0.9)
    const hasGoodMatch = matchResult.type !== 'NO_MATCH' &&
                         matchResult.event &&
                         matchResult.edition &&
                         matchResult.confidence >= 0.9

    if (hasGoodMatch) {
      const event = matchResult.event!
      const edition = matchResult.edition!

      this.logger.info(`✅ Match trouvé: "${competition.name}" → "${event.name}" (score: ${(matchResult.confidence * 100).toFixed(0)}%)`)

      return {
        type: ProposalType.EDITION_UPDATE,
        eventId: event.id.toString(),
        editionId: edition.id.toString(),
        changes: {
          registrantsNumber: {
            new: registrantsNumber,
            confidence: matchResult.confidence
          }
        },
        justification: [
          {
            type: 'text' as const,
            content: `Résultats FFA: ${registrantsNumber} participants`,
            metadata: {
              justificationType: 'ffa_source',
              ffaId: competition.ffaId,
              ffaName: competition.name,
              ffaCity: competition.city,
              ffaDate: competition.date.toISOString(),
              ffaLigue: competition.ligue,
              registrantsNumber,
              resultsUrl: competition.resultsUrl
            }
          },
          {
            type: 'text' as const,
            content: `Match automatique: ${event.name} - ${event.city} (${edition.year})`,
            metadata: {
              justificationType: 'mr_match',
              matchScore: matchResult.confidence,
              nameScore: event.similarity,
              eventId: event.id,
              editionId: edition.id,
              eventName: event.name,
              eventCity: event.city,
              editionYear: edition.year
            }
          }
        ]
      }
    }

    // Cas 2 : Pas de bon match → créer proposition SANS eventId/editionId
    // L'utilisateur pourra la lier manuellement via le dashboard (UnmatchedResultDetail)
    this.logger.info(`📝 Création proposition sans match pour "${competition.name}" (${competition.city}) - ${registrantsNumber} participants`, {
      ffaId: competition.ffaId,
      matchType: matchResult.type,
      confidence: matchResult.confidence,
      bestMatch: matchResult.event ? `${matchResult.event.name} (${matchResult.event.city})` : 'aucun'
    })

    // Construire les justifications avec les candidats rejetés si présents
    const justifications: ProposalData['justification'] = [
      {
        type: 'text' as const,
        content: `Résultats FFA: ${registrantsNumber} participants`,
        metadata: {
          justificationType: 'ffa_source',
          ffaId: competition.ffaId,
          ffaName: competition.name,
          ffaCity: competition.city,
          ffaDate: competition.date.toISOString(),
          ffaLigue: competition.ligue,
          registrantsNumber,
          resultsUrl: competition.resultsUrl
        }
      }
    ]

    // Ajouter les candidats rejetés pour aider l'utilisateur
    if (matchResult.rejectedMatches && matchResult.rejectedMatches.length > 0) {
      justifications.push({
        type: 'text' as const,
        content: `${matchResult.rejectedMatches.length} candidat(s) potentiel(s) (score < 90%)`,
        metadata: {
          justificationType: 'rejected_matches',
          rejectedMatches: matchResult.rejectedMatches.slice(0, 5).map(rm => ({
            eventId: rm.eventId,
            eventName: rm.eventName,
            eventCity: rm.eventCity,
            editionId: rm.editionId,
            editionYear: rm.editionYear,
            matchScore: rm.matchScore
          }))
        }
      })
    }

    return {
      type: ProposalType.EDITION_UPDATE,
      // PAS de eventId ni editionId - l'utilisateur les choisira dans le dashboard
      changes: {
        registrantsNumber: {
          new: registrantsNumber,
          confidence: 0.5 // Confiance basse car pas de match automatique
        }
      },
      justification: justifications
    }
  }

  /**
   * Phase 1: Pré-remplir le registrantsNumber pour les éditions opérées par MR
   */
  private async prefillMROperatedEditions(context: AgentContext): Promise<ProposalData[]> {
    const config = this.config.config as FFAResultsConfig
    const proposals: ProposalData[] = []

    context.logger.info('📊 Phase 1: Pré-remplissage des éditions opérées par Miles Republic')

    // Trouver les éditions opérées par MR sans registrantsNumber
    // customerType ESSENTIAL ou PREMIUM = éditions opérées par Miles Republic
    const editions = await this.sourceDb.edition.findMany({
      where: {
        registrantsNumber: null,
        customerType: { in: ['ESSENTIAL', 'PREMIUM'] },
        startDate: {
          lt: new Date(),
          gte: new Date(config.minEditionDate)
        }
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            city: true
          }
        },
        races: {
          select: { id: true }
        }
      },
      take: 50 // Limiter par run
    })

    context.logger.info(`🔍 ${editions.length} éditions MR opérées sans registrantsNumber`)

    for (const edition of editions) {
      const raceIds = edition.races.map((r: { id: number }) => r.id)

      if (raceIds.length === 0) {
        context.logger.debug(`Edition ${edition.id} sans courses, ignorée`)
        continue
      }

      // Compter les Attendees (modèle Prisma: attendees)
      // - cancelledAt: null = non annulé
      // - status: PAID, PAID_MANUALLY, FREE = inscription confirmée
      const count = await this.sourceDb.attendees.count({
        where: {
          raceId: { in: raceIds },
          cancelledAt: null,
          status: { in: ['PAID', 'PAID_MANUALLY', 'FREE'] }
        }
      })

      if (count > 0) {
        context.logger.info(`✅ ${edition.event.name} (${edition.year}): ${count} participants`)

        proposals.push({
          type: ProposalType.EDITION_UPDATE,
          eventId: edition.event.id.toString(),
          editionId: edition.id.toString(),
          changes: {
            registrantsNumber: {
              old: null,
              new: count,
              confidence: 1.0 // Données internes MR = certitude totale
            }
          },
          justification: [
            {
              type: 'text' as const,
              content: `Nombre de participants calculé depuis les inscriptions Miles Republic`,
              metadata: {
                justificationType: 'mr_internal',
                eventName: edition.event.name,
                eventCity: edition.event.city,
                editionYear: edition.year,
                raceCount: raceIds.length,
                attendeeCount: count,
                customerType: edition.customerType
              }
            }
          ]
        })
      }
    }

    return proposals
  }

  /**
   * Phase 2: Traite une combinaison ligue/mois du calendrier FFA passé
   */
  private async processLigueMonth(
    ligue: string,
    month: string,
    config: FFAResultsConfig,
    context: AgentContext
  ): Promise<ProposalData[]> {
    const proposals: ProposalData[] = []

    // Calculer les dates du mois
    const [year, monthNum] = month.split('-').map(Number)
    const startDate = new Date(year, monthNum - 1, 1)
    const endDate = new Date(year, monthNum, 0) // Dernier jour du mois

    context.logger.info(`📅 Scraping ${ligue} - ${month}`)

    // Scraper le listing FFA
    const competitions = await fetchAllCompetitionsForPeriod(
      ligue,
      startDate,
      endDate,
      config.levels,
      config.humanDelayMs,
      20 // Max pages
    )

    context.logger.info(`📊 ${competitions.length} compétitions trouvées`)

    // Filtrer les compétitions avec résultats
    const withResults = competitions.filter(c => c.resultsUrl)
    context.logger.info(`🎯 ${withResults.length} compétitions avec résultats`)

    for (const competition of withResults) {
      // Récupérer le nombre de participants
      const registrantsNumber = await this.fetchResultsCount(
        competition.resultsUrl!,
        config.humanDelayMs
      )

      if (!registrantsNumber) {
        context.logger.debug(`Pas de count pour ${competition.name}`)
        continue
      }

      context.logger.info(`✅ ${competition.name}: ${registrantsNumber} participants`)

      // Utiliser le service de matching mutualisé du framework
      const matchResult = await this.matchWithFramework(competition, config)

      // Créer la proposition (si match >= 0.9)
      const proposal = await this.createResultsProposal(
        competition,
        registrantsNumber,
        matchResult,
        config
      )

      if (proposal) {
        proposals.push(proposal)
      }
    }

    return proposals
  }

  /**
   * Méthode principale d'exécution
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as FFAResultsConfig

    try {
      context.logger.info(`🚀 Démarrage FFA Results Agent v${FFA_RESULTS_AGENT_VERSION}`, {
        version: FFA_RESULTS_AGENT_VERSION,
        liguesPerRun: config.liguesPerRun,
        monthsPerRun: config.monthsPerRun,
        minEditionDate: config.minEditionDate,
        minDaysAgo: config.minDaysAgo
      })

      // Initialiser la connexion source
      await this.initializeSourceConnection(config)

      if (!this.sourceDb) {
        throw new Error(`Échec de la connexion à la base de données source: ${config.sourceDatabase}`)
      }

      context.logger.info('✅ Connexion à la base source établie')

      const allProposals: ProposalData[] = []

      // Phase 1: Pré-remplissage des éditions MR opérées
      const mrProposals = await this.prefillMROperatedEditions(context)
      allProposals.push(...mrProposals)
      context.logger.info(`📊 Phase 1 terminée: ${mrProposals.length} propositions MR`)

      // Charger la progression
      const progress = await this.loadProgress()
      context.logger.info('📊 Progression chargée', { progress })

      // Déterminer les cibles
      const { ligues, months } = this.getNextTargets(progress, config)

      if (ligues.length === 0 || months.length === 0) {
        context.logger.info('⏸️ Aucune cible à traiter (cooldown actif)')
      } else {
        context.logger.info(`🎯 Phase 2: ${ligues.length} ligues × ${months.length} mois`)

        // Scraper chaque combinaison ligue/mois
        for (const ligue of ligues) {
          for (const month of months) {
            const proposals = await this.processLigueMonth(ligue, month, config, context)
            allProposals.push(...proposals)

            // Marquer le mois comme complété
            if (!progress.completedMonths[ligue]) {
              progress.completedMonths[ligue] = []
            }
            if (!progress.completedMonths[ligue].includes(month)) {
              progress.completedMonths[ligue].push(month)
            }

            progress.totalCompetitionsScraped++
            progress.totalResultsFound += proposals.length

            await this.saveProgress(progress)
          }
        }

        // Mettre à jour la position pour le prochain run
        const allMonths = this.generatePastMonthsToScrape()
        const currentMonthIndex = allMonths.indexOf(months[0])
        const lastLigueIndex = FFA_LIGUES.indexOf(ligues[ligues.length - 1] as any)

        if (lastLigueIndex + 1 < FFA_LIGUES.length) {
          progress.currentLigue = FFA_LIGUES[lastLigueIndex + 1]
          progress.currentMonth = months[0]
        } else {
          const nextMonthIndex = currentMonthIndex + config.monthsPerRun
          if (nextMonthIndex < allMonths.length) {
            progress.currentMonth = allMonths[nextMonthIndex]
            progress.currentLigue = FFA_LIGUES[0]
          } else {
            progress.lastCompletedAt = new Date()
            progress.currentLigue = FFA_LIGUES[0]
            progress.currentMonth = allMonths[0]
            context.logger.info('🔄 Cycle complet terminé')
          }
        }

        await this.saveProgress(progress)
      }

      // Sauvegarder les propositions en base de données
      context.logger.info(`💾 Sauvegarde de ${allProposals.length} propositions...`)

      for (const proposal of allProposals) {
        try {
          // Calculer la confidence depuis les changes si disponible
          const registrantsChange = proposal.changes?.registrantsNumber as { confidence?: number } | undefined
          const confidence = registrantsChange?.confidence || 0.9

          await this.createProposal(
            proposal.type,
            proposal.changes,
            proposal.justification,
            proposal.eventId?.toString(),
            proposal.editionId?.toString(),
            undefined,
            confidence
          )
          progress.totalProposalsCreated++
        } catch (error) {
          context.logger.error(`Erreur création proposition`, { error: String(error) })
        }
      }

      await this.saveProgress(progress)

      context.logger.info(`✅ Terminé: ${allProposals.length} propositions créées`)

      return {
        success: true,
        message: `Created ${allProposals.length} proposals (${mrProposals.length} MR internal)`,
        proposals: allProposals
      }
    } catch (error) {
      context.logger.error('❌ Erreur lors du scraping FFA Results', { error: String(error) })
      throw error
    }
  }

  /**
   * Validation de la configuration
   */
  async validate(): Promise<boolean> {
    const config = this.config.config as FFAResultsConfig

    if (!config.sourceDatabase) {
      this.logger.error('sourceDatabase est requis dans la configuration')
      return false
    }

    if (config.liguesPerRun < 1 || config.liguesPerRun > FFA_LIGUES.length) {
      this.logger.error(`liguesPerRun doit être entre 1 et ${FFA_LIGUES.length}`)
      return false
    }

    return true
  }
}
