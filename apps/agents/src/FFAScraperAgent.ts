/**
 * Agent de scraping du calendrier FFA (Fédération Française d'Athlétisme)
 * 
 * Cet agent scrape automatiquement le calendrier FFA pour:
 * - Extraire les compétitions de course à pied par ligues et par mois
 * - Matcher les compétitions avec les événements existants dans Miles Republic
 * - Créer des propositions de création/modification d'événements, éditions et courses
 */

import { BaseAgent, DatabaseManager, AgentContext, AgentRunResult, ProposalData } from '@data-agents/agent-framework'
import { AgentType, IAgentStateService, AgentStateService, prisma, ProposalType } from '@data-agents/database'
import { FFAScraperAgentConfigSchema } from './FFAScraperAgent.configSchema'
import { 
  FFAScraperConfig, 
  FFACompetition, 
  FFACompetitionDetails,
  ScrapingProgress,
  FFA_LIGUES,
  MatchResult
} from './ffa/types'
import { 
  fetchAllCompetitionsForPeriod, 
  fetchCompetitionDetails, 
  getMonthBounds, 
  generateMonthsToScrape,
  humanDelay 
} from './ffa/scraper'
import { matchCompetition, calculateAdjustedConfidence } from './ffa/matcher'

export class FFAScraperAgent extends BaseAgent {
  private dbManager: DatabaseManager
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'ffa-scraper-agent',
      name: config.name || 'FFA Scraper Agent',
      description: 'Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied',
      type: AgentType.EXTRACTOR,
      frequency: config.frequency || '0 */12 * * *', // Toutes les 12 heures par défaut
      isActive: config.isActive ?? true,
      config: {
        sourceDatabase: config.sourceDatabase || config.config?.sourceDatabase,
        liguesPerRun: config.liguesPerRun || config.config?.liguesPerRun || 2,
        monthsPerRun: config.monthsPerRun || config.config?.monthsPerRun || 1,
        levels: config.levels || config.config?.levels || ['Départemental', 'Régional'],
        scrapingWindowMonths: config.scrapingWindowMonths || config.config?.scrapingWindowMonths || 6,
        rescanDelayDays: config.rescanDelayDays || config.config?.rescanDelayDays || 30,
        humanDelayMs: config.humanDelayMs || config.config?.humanDelayMs || 2000,
        similarityThreshold: config.similarityThreshold || config.config?.similarityThreshold || 0.75,
        distanceTolerancePercent: config.distanceTolerancePercent || config.config?.distanceTolerancePercent || 0.1,
        confidenceBase: config.confidenceBase || config.config?.confidenceBase || 0.9,
        maxCompetitionsPerMonth: config.maxCompetitionsPerMonth || config.config?.maxCompetitionsPerMonth || 500,
        configSchema: FFAScraperAgentConfigSchema
      }
    }

    super(agentConfig, db, logger)
    this.dbManager = DatabaseManager.getInstance(this.logger)
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  /**
   * Initialise la connexion à la base de données Miles Republic
   */
  private async initializeSourceConnection(config: FFAScraperConfig): Promise<void> {
    try {
      if (!this.sourceDb) {
        const dbConfig = await this.dbManager.getAvailableDatabases()
        const targetDb = dbConfig.find(db => db.id === config.sourceDatabase)
        
        if (!targetDb) {
          throw new Error(`Configuration de base de données non trouvée: ${config.sourceDatabase}`)
        }
        
        let connectionUrl = targetDb.connectionString
        if (!connectionUrl) {
          const protocol = targetDb.type === 'postgresql' ? 'postgresql' : 'mysql'
          const sslParam = targetDb.ssl ? '?ssl=true' : ''
          connectionUrl = `${protocol}://${targetDb.username}:${targetDb.password}@${targetDb.host}:${targetDb.port}/${targetDb.database}${sslParam}`
        }
        
        this.logger.info(`🔗 Connexion à Miles Republic: ${targetDb.name}`)
        
        process.env.DATABASE_URL = connectionUrl
        process.env.DATABASE_DIRECT_URL = connectionUrl
        
        const { PrismaClient } = await import('@prisma/client')
        this.sourceDb = new PrismaClient({
          datasources: { db: { url: connectionUrl } }
        })
        
        await this.sourceDb.$connect()
        this.logger.info(`✅ Connexion établie: ${targetDb.name}`)
      }
    } catch (error) {
      this.logger.error(`Erreur connexion source: ${config.sourceDatabase}`, { error: String(error) })
      throw error
    }
  }

  /**
   * Charge l'état de progression depuis AgentState
   */
  private async loadProgress(): Promise<ScrapingProgress> {
    const progress = await this.stateService.getState<ScrapingProgress>(
      this.config.id,
      'progress'
    )

    if (progress) {
      return progress
    }

    // État initial
    return {
      currentLigue: FFA_LIGUES[0],
      currentMonth: generateMonthsToScrape(1)[0],
      currentPage: 0,
      completedLigues: [],
      completedMonths: {},
      totalCompetitionsScraped: 0
    }
  }

  /**
   * Sauvegarde l'état de progression
   */
  private async saveProgress(progress: ScrapingProgress): Promise<void> {
    await this.stateService.setState(this.config.id, 'progress', progress)
  }

  /**
   * Détermine les prochaines ligues/mois à scraper
   */
  private getNextTargets(
    progress: ScrapingProgress,
    config: FFAScraperConfig
  ): { ligues: string[], months: string[] } {
    // Générer la liste des mois dans la fenêtre
    const allMonths = generateMonthsToScrape(config.scrapingWindowMonths)
    
    // Déterminer les ligues à traiter
    const currentLigueIndex = FFA_LIGUES.indexOf(progress.currentLigue as any)
    const ligues: string[] = []
    
    for (let i = 0; i < config.liguesPerRun && currentLigueIndex + i < FFA_LIGUES.length; i++) {
      ligues.push(FFA_LIGUES[currentLigueIndex + i])
    }

    // Déterminer les mois à traiter
    const currentMonthIndex = allMonths.indexOf(progress.currentMonth)
    const months: string[] = []
    
    for (let i = 0; i < config.monthsPerRun && currentMonthIndex + i < allMonths.length; i++) {
      months.push(allMonths[currentMonthIndex + i])
    }

    return { ligues, months }
  }

  /**
   * Scrape une ligue pour un mois donné
   */
  private async scrapeLigueMonth(
    ligue: string,
    month: string,
    config: FFAScraperConfig,
    context: AgentContext
  ): Promise<FFACompetitionDetails[]> {
    const { startDate, endDate } = getMonthBounds(month)
    
    context.logger.info(`🔍 Scraping ${ligue} - ${month}...`)
    
    // Récupérer les compétitions
    const competitions = await fetchAllCompetitionsForPeriod(
      ligue,
      startDate,
      endDate,
      config.levels,
      config.humanDelayMs,
      50 // Max 50 pages
    )
    
    context.logger.info(`📊 ${competitions.length} compétitions trouvées pour ${ligue} - ${month}`)
    
    // Limiter au max par mois si configuré
    const limitedCompetitions = config.maxCompetitionsPerMonth
      ? competitions.slice(0, config.maxCompetitionsPerMonth)
      : competitions
    
    // Récupérer les détails de chaque compétition
    const detailsPromises = limitedCompetitions.map(comp =>
      fetchCompetitionDetails(comp.detailUrl, comp, config.humanDelayMs)
    )
    
    const details = await Promise.all(detailsPromises)
    
    return details.filter(d => d !== null) as FFACompetitionDetails[]
  }

  /**
   * Crée les propositions pour une compétition
   */
  private async createProposalsForCompetition(
    competition: FFACompetitionDetails,
    matchResult: MatchResult,
    config: FFAScraperConfig
  ): Promise<ProposalData[]> {
    const proposals: ProposalData[] = []
    
    // Calculer la confiance ajustée
    const confidence = calculateAdjustedConfidence(
      config.confidenceBase,
      competition,
      matchResult
    )

    if (matchResult.type === 'NO_MATCH') {
      // Créer un nouvel événement
      proposals.push({
        type: ProposalType.NEW_EVENT,
        changes: {
          name: {
            new: competition.competition.name,
            confidence
          },
          city: {
            new: competition.competition.city,
            confidence
          },
          country: {
            new: 'France',
            confidence
          },
          countrySubdivisionNameLevel1: {
            new: competition.competition.ligue,
            confidence
          },
          countrySubdivisionDisplayCodeLevel1: {
            new: competition.competition.ligue,
            confidence
          },
          countrySubdivisionNameLevel2: {
            new: competition.competition.department,
            confidence
          },
          countrySubdivisionDisplayCodeLevel2: {
            new: competition.competition.department,
            confidence
          },
          websiteUrl: {
            new: competition.organizerWebsite,
            confidence
          },
          dataSource: {
            new: 'FEDERATION',
            confidence
          },
          edition: {
            new: {
              year: competition.competition.date.getFullYear().toString(),
              startDate: competition.competition.date,
              calendarStatus: 'CONFIRMED',
              races: competition.races.map(race => ({
                name: race.name,
                startDate: race.startTime 
                  ? new Date(`${competition.competition.date.toISOString().split('T')[0]}T${race.startTime}:00`)
                  : competition.competition.date,
                runDistance: race.distance,
                runPositiveElevation: race.positiveElevation,
                type: race.type === 'trail' ? 'TRAIL' : 'RUNNING'
              }))
            },
            confidence
          }
        },
        justification: [{
          type: 'text',
          content: `Nouvelle compétition FFA: ${competition.competition.name}`,
          metadata: {
            ffaId: competition.competition.ffaId,
            confidence,
            source: competition.competition.detailUrl,
            level: competition.competition.level,
            organizerEmail: competition.organizerEmail
          }
        }]
      })
    } else if (matchResult.type === 'FUZZY_MATCH' || matchResult.type === 'EXACT_MATCH') {
      // Proposer des mises à jour pour l'édition existante
      if (matchResult.edition) {
        const dateDiff = matchResult.edition.startDate 
          ? Math.abs(competition.competition.date.getTime() - matchResult.edition.startDate.getTime())
          : Infinity
        
        // Si la date diffère de plus d'un jour, proposer une mise à jour
        if (dateDiff > 86400000) {
          proposals.push({
            type: ProposalType.EDITION_UPDATE,
            eventId: matchResult.event!.id,
            editionId: matchResult.edition.id,
            changes: {
              startDate: {
                old: matchResult.edition.startDate,
                new: competition.competition.date,
                confidence
              }
            },
            justification: [{
              type: 'text',
              content: `Date FFA différente pour ${competition.competition.name}`,
              metadata: { ffaId: competition.competition.ffaId, source: competition.competition.detailUrl }
            }]
          })
        }
      }
    }

    return proposals
  }

  /**
   * Méthode principale d'exécution
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as FFAScraperConfig
    
    try {
      context.logger.info('🚀 Démarrage FFA Scraper Agent', {
        liguesPerRun: config.liguesPerRun,
        monthsPerRun: config.monthsPerRun,
        levels: config.levels,
        sourceDatabase: config.sourceDatabase
      })

      // Initialiser la connexion source
      await this.initializeSourceConnection(config)
      
      // Charger la progression
      const progress = await this.loadProgress()
      context.logger.info('📊 Progression chargée', { progress })

      // Déterminer les cibles
      const { ligues, months } = this.getNextTargets(progress, config)
      context.logger.info(`🎯 Traitement: ${ligues.length} ligues × ${months.length} mois`)

      const allProposals: ProposalData[] = []
      let totalCompetitions = 0

      // Scraper chaque combinaison ligue/mois
      for (const ligue of ligues) {
        for (const month of months) {
          const competitions = await this.scrapeLigueMonth(ligue, month, config, context)
          totalCompetitions += competitions.length

          // Matcher et créer des propositions
          for (const competition of competitions) {
            const matchResult = await matchCompetition(
              competition,
              this.sourceDb,
              config,
              this.logger
            )

            const proposals = await this.createProposalsForCompetition(
              competition,
              matchResult,
              config
            )

            allProposals.push(...proposals)
          }

          // Marquer le mois comme complété pour cette ligue
          if (!progress.completedMonths[ligue]) {
            progress.completedMonths[ligue] = []
          }
          if (!progress.completedMonths[ligue].includes(month)) {
            progress.completedMonths[ligue].push(month)
          }

          await humanDelay(config.humanDelayMs)
        }
      }

      // Mettre à jour la progression
      progress.totalCompetitionsScraped += totalCompetitions
      progress.lastCompletedAt = new Date()
      await this.saveProgress(progress)

      context.logger.info(`✅ Scraping terminé: ${totalCompetitions} compétitions, ${allProposals.length} propositions`)

      return {
        success: true,
        message: `Scraped ${totalCompetitions} competitions, created ${allProposals.length} proposals`,
        proposals: allProposals
      }
    } catch (error) {
      context.logger.error('❌ Erreur lors du scraping FFA', { error: String(error) })
      throw error
    }
  }

  /**
   * Validation de la configuration
   */
  async validate(): Promise<boolean> {
    const config = this.config.config as FFAScraperConfig
    
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

export default FFAScraperAgent
