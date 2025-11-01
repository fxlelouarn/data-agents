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
          datasources: { db: { url: connectionUrl } },
          log: [] // Désactiver les logs prisma:query
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
    let currentMonthIndex = allMonths.indexOf(progress.currentMonth)
    
    // Si le mois actuel n'est plus dans la fenêtre (expiré), recommencer au premier mois
    if (currentMonthIndex === -1) {
      this.logger.info(`⚠️  Mois actuel ${progress.currentMonth} expiré, redémarrage au mois: ${allMonths[0]}`)
      currentMonthIndex = 0
      progress.currentMonth = allMonths[0]
    }
    
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
   * Compare les données FFA avec une édition existante
   * Retourne les changements détectés et leurs justifications
   */
  private compareFFAWithEdition(
    ffaData: FFACompetitionDetails,
    edition: any,
    event: any,
    confidence: number
  ): { changes: any, justifications: any[] } {
    const changes: any = {}
    const justifications: any[] = []

    // Calculer la date de début avec l'heure de la première course
    const ffaStartDate = this.calculateEditionStartDate(ffaData)
    const hasRaceTime = ffaData.races.length > 0 && ffaData.races[0].startTime

    // 1. Comparaison de la date
    let dateDiff = Infinity
    if (edition.startDate) {
      if (hasRaceTime) {
        // Si on a une heure précise de la FFA, comparer date + heure
        dateDiff = Math.abs(ffaStartDate.getTime() - edition.startDate.getTime())
      } else {
        // Sinon, comparer uniquement la date (jour), pas l'heure
        const ffaDay = ffaStartDate.toISOString().split('T')[0]
        const dbDay = edition.startDate.toISOString().split('T')[0]
        dateDiff = ffaDay === dbDay ? 0 : 86400000 // 0 ou 1 jour en ms
      }
    }
    
    if (dateDiff > 21600000) { // 6 heures en ms
      changes.startDate = {
        old: edition.startDate,
        new: ffaStartDate,
        confidence
      }
      justifications.push({
        type: 'text',
        content: `Date FFA différente: ${ffaStartDate.toISOString()} vs ${edition.startDate?.toISOString()}`,
        metadata: { 
          ffaDate: ffaStartDate.toISOString(),
          dbDate: edition.startDate?.toISOString(),
          diffHours: Math.round(dateDiff / 3600000),
          source: ffaData.competition.detailUrl
        }
      })
    }
    
    // 2. Statut calendrier (toujours confirmer depuis la FFA)
    if (edition.calendarStatus !== 'CONFIRMED') {
      changes.calendarStatus = {
        old: edition.calendarStatus,
        new: 'CONFIRMED',
        confidence
      }
      justifications.push({
        type: 'text',
        content: `Confirmation depuis FFA (source officielle)`,
        metadata: { 
          oldStatus: edition.calendarStatus,
          source: ffaData.competition.detailUrl 
        }
      })
    }

    // 3. Date de clôture des inscriptions
    if (ffaData.registrationClosingDate) {
      const existingClosingDate = edition.registrationClosingDate
      const newClosingDate = ffaData.registrationClosingDate
      
      if (!existingClosingDate || 
          Math.abs(newClosingDate.getTime() - existingClosingDate.getTime()) > 3600000) { // 1h de diff
        changes.registrationClosingDate = {
          old: existingClosingDate,
          new: newClosingDate,
          confidence
        }
        justifications.push({
          type: 'text',
          content: `Date de clôture FFA: ${newClosingDate.toISOString()}`,
          metadata: { 
            oldDate: existingClosingDate?.toISOString(),
            newDate: newClosingDate.toISOString()
          }
        })
      }
    }

    // 4. Organisateur
    if (ffaData.organizerName) {
      const existingOrgName = edition.organization?.name
      if (!existingOrgName || existingOrgName !== ffaData.organizerName) {
        changes.organization = {
          old: existingOrgName,
          new: {
            name: ffaData.organizerName,
            email: ffaData.organizerEmail,
            phone: ffaData.organizerPhone,
            website: ffaData.organizerWebsite,
            address: ffaData.organizerAddress
          },
          confidence: confidence * 0.9
        }
        justifications.push({
          type: 'text',
          content: `Organisateur FFA: ${ffaData.organizerName}`,
          metadata: {
            oldOrganizer: existingOrgName,
            newOrganizer: ffaData.organizerName,
            contact: {
              email: ffaData.organizerEmail,
              phone: ffaData.organizerPhone,
              website: ffaData.organizerWebsite
            }
          }
        })
      }
    }

    // 5. Courses manquantes ou à mettre à jour
    if (ffaData.races.length > 0) {
      const existingRaces = edition.races || []
      // Convertir les distances DB (qui sont en km) en mètres pour comparaison
      const existingRacesWithMeters = existingRaces.map((r: any) => ({
        ...r,
        runDistanceMeters: (r.runDistance || 0) * 1000,
        walkDistanceMeters: (r.walkDistance || 0) * 1000,
        swimDistanceMeters: (r.swimDistance || 0) * 1000,
        bikeDistanceMeters: (r.bikeDistance || 0) * 1000,
        totalDistanceMeters: ((r.runDistance || 0) + (r.walkDistance || 0) + (r.swimDistance || 0) + (r.bikeDistance || 0)) * 1000
      }))
      
      this.logger.info(`📋 Édition ${edition.id} : ${existingRaces.length} course(s) existante(s)`, {
        races: existingRacesWithMeters.map((r: any) => ({
          name: r.name,
          distanceKm: r.runDistance,
          distanceMeters: r.totalDistanceMeters
        }))
      })
      this.logger.info(`📋 FFA : ${ffaData.races.length} course(s) à comparer`, {
        races: ffaData.races.map(r => ({ name: r.name, distance: r.distance }))
      })
      
      const racesToAdd: any[] = []
      const racesToUpdate: any[] = []

      for (const ffaRace of ffaData.races) {
        const matchingRace = existingRacesWithMeters.find((dbRace: any) => {
          // Utiliser la distance totale déjà convertie en mètres
          const totalDistance = dbRace.totalDistanceMeters
          
          // Si la course FFA a une distance, matcher principalement sur la distance
          if (ffaRace.distance && ffaRace.distance > 0) {
            // Tolérance de 5% pour le matching de distance
            const tolerance = ffaRace.distance * 0.05
            const distanceDiff = Math.abs(totalDistance - ffaRace.distance)
            
            // Match si la distance est dans la tolérance
            return distanceDiff <= tolerance
          }
          
          // Si pas de distance FFA, fallback sur le matching de nom
          const nameMatch = dbRace.name?.toLowerCase().includes(ffaRace.name.toLowerCase()) ||
                            ffaRace.name.toLowerCase().includes(dbRace.name?.toLowerCase())
          return nameMatch
        })

        if (!matchingRace) {
          this.logger.info(`➡️  Course FFA non matchée: ${ffaRace.name} (${ffaRace.distance}m) - sera ajoutée`)
          racesToAdd.push({
            name: ffaRace.name,
            distance: ffaRace.distance,
            elevation: ffaRace.positiveElevation,
            startTime: ffaRace.startTime,
            type: ffaRace.type,
            categories: ffaRace.categories
          })
        } else {
          this.logger.info(`✅ Course FFA matchée: ${ffaRace.name} (${ffaRace.distance}m) ↔ ${matchingRace.name} (${matchingRace.totalDistanceMeters}m)`)
          const raceUpdates: any = {}
          
          if (ffaRace.positiveElevation && 
              (!matchingRace.runPositiveElevation || 
               Math.abs(matchingRace.runPositiveElevation - ffaRace.positiveElevation) > 10)) {
            raceUpdates.runPositiveElevation = {
              old: matchingRace.runPositiveElevation,
              new: ffaRace.positiveElevation
            }
          }

          if (Object.keys(raceUpdates).length > 0) {
            racesToUpdate.push({
              raceId: matchingRace.id,
              raceName: matchingRace.name,
              updates: raceUpdates
            })
          }
        }
      }

      if (racesToAdd.length > 0) {
        changes.racesToAdd = {
          old: null,
          new: racesToAdd,
          confidence: confidence * 0.85
        }
        justifications.push({
          type: 'text',
          content: `${racesToAdd.length} nouvelle(s) course(s) FFA détectée(s)`,
          metadata: { races: racesToAdd.map(r => r.name) }
        })
      }

      if (racesToUpdate.length > 0) {
        changes.racesToUpdate = {
          old: null,
          new: racesToUpdate,
          confidence: confidence * 0.9
        }
        justifications.push({
          type: 'text',
          content: `${racesToUpdate.length} course(s) à mettre à jour`,
          metadata: { races: racesToUpdate.map(r => ({ name: r.raceName, updates: r.updates })) }
        })
      }
    }

    // 6. Services/équipements
    if (ffaData.services && ffaData.services.length > 0) {
      changes.services = {
        old: edition.editionInfo?.editionServices?.map((s: any) => s.editionService?.type) || [],
        new: ffaData.services,
        confidence: confidence * 0.7
      }
      justifications.push({
        type: 'text',
        content: `Services FFA: ${ffaData.services.join(', ')}`,
        metadata: { services: ffaData.services }
      })
    }

    // 7. Informations additionnelles
    if (ffaData.additionalInfo && ffaData.additionalInfo.trim().length > 10) {
      const existingInfo = edition.editionInfo?.whatIsIncluded || ''
      if (!existingInfo || existingInfo.length < ffaData.additionalInfo.length) {
        changes.additionalInfo = {
          old: existingInfo,
          new: ffaData.additionalInfo,
          confidence: confidence * 0.6
        }
        justifications.push({
          type: 'text',
          content: `Informations additionnelles FFA disponibles`,
          metadata: { preview: ffaData.additionalInfo.substring(0, 200) }
        })
      }
    }

    return { changes, justifications }
  }

  /**
   * Calcule la date de début d'une édition en utilisant l'heure de la première course
   * Convertit l'heure locale France (Europe/Paris) en UTC
   */
  private calculateEditionStartDate(ffaData: FFACompetitionDetails): Date {
    // Si on a des courses avec une heure de départ
    if (ffaData.races.length > 0 && ffaData.races[0].startTime) {
      // La date de la compétition est en UTC à minuit
      const competitionDate = ffaData.competition.date
      const year = competitionDate.getUTCFullYear()
      const month = competitionDate.getUTCMonth()
      const day = competitionDate.getUTCDate()
      
      // Parser l'heure locale (format HH:MM)
      const [hours, minutes] = ffaData.races[0].startTime.split(':').map(Number)
      
      // Créer la date en heure locale France (UTC+1 hiver, UTC+2 été)
      // En utilisant le timezone Europe/Paris
      const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
      
      // Calculer l'offset UTC pour la France à cette date
      // Approximation: UTC+1 (hiver) sauf entre fin mars et fin octobre où c'est UTC+2 (été)
      const isDST = month > 2 && month < 10 // Approximation DST (mars à octobre)
      const offsetHours = isDST ? 2 : 1
      
      // Convertir en UTC
      const startDateUTC = new Date(Date.UTC(year, month, day, hours - offsetHours, minutes, 0, 0))
      
      this.logger.info(`🕒 Date calculée avec heure première course: ${localDateStr} France (UTC+${offsetHours}) -> ${startDateUTC.toISOString()} UTC (course: ${ffaData.races[0].name} à ${ffaData.races[0].startTime})`)
      return startDateUTC
    }
    // Sinon, utiliser la date à minuit UTC
    this.logger.info(`🕒 Pas d'heure de course, utilisation minuit UTC: ${ffaData.competition.date.toISOString()} (${ffaData.races.length} courses)`)
    return ffaData.competition.date
  }

  /**
   * Crée les propositions pour une compétition
   */
  private async createProposalsForCompetition(
    competition: FFACompetitionDetails,
    matchResult: MatchResult,
    config: FFAScraperConfig,
    context: AgentContext
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
              startDate: this.calculateEditionStartDate(competition),
              calendarStatus: 'CONFIRMED',
              races: competition.races.map(race => {
                let raceStartDate: Date
                if (race.startTime) {
                  // Convertir l'heure locale France en UTC
                  const competitionDate = competition.competition.date
                  const year = competitionDate.getUTCFullYear()
                  const month = competitionDate.getUTCMonth()
                  const day = competitionDate.getUTCDate()
                  const [hours, minutes] = race.startTime.split(':').map(Number)
                  
                  // Calculer l'offset DST
                  const isDST = month > 2 && month < 10
                  const offsetHours = isDST ? 2 : 1
                  
                  raceStartDate = new Date(Date.UTC(year, month, day, hours - offsetHours, minutes, 0, 0))
                } else {
                  raceStartDate = competition.competition.date
                }
                
                return {
                  name: race.name,
                  startDate: raceStartDate,
                  runDistance: race.distance,
                  runPositiveElevation: race.positiveElevation,
                  type: race.type === 'trail' ? 'TRAIL' : 'RUNNING'
                }
              })
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
      // Vérifier si l'événement est featured (ne doit pas être modifié)
      const eventData = await this.sourceDb.event.findUnique({
        where: { id: matchResult.event!.id },
        select: { isFeatured: true }
      })
      
      if (eventData?.isFeatured) {
        context.logger.info(`⚠️  Événement featured ignoré: ${matchResult.event!.name} (${matchResult.event!.id})`)
        return proposals
      }
      
      // Proposer des mises à jour pour l'édition existante
      if (matchResult.edition) {
        // Charger les données complètes de l'édition depuis la base
        const fullEdition = await this.sourceDb.edition.findUnique({
          where: { id: matchResult.edition.id },
          include: {
            organization: true,
            races: {
              include: {
                raceInfo: true
              },
              where: { isArchived: false }
            },
            editionInfo: {
              include: {
                editionServices: {
                  include: {
                    editionService: true
                  }
                }
              }
            }
          }
        })

        if (!fullEdition) {
          context.logger.warn(`⚠️  Édition ${matchResult.edition.id} non trouvée lors du chargement complet`)
        } else {
          context.logger.info(`🔍 Analyse édition ${fullEdition.id} (${matchResult.event!.name})...`)
          const { changes, justifications } = this.compareFFAWithEdition(
            competition,
            fullEdition,
            matchResult.event!,
            confidence
          )
          
          // Log pour comprendre pourquoi aucun changement
          if (Object.keys(changes).length === 0) {
            context.logger.info(`✓ Édition ${fullEdition.id} (${matchResult.event!.name}) déjà à jour`, {
              ffaDate: competition.competition.date.toISOString(),
              dbDate: fullEdition.startDate?.toISOString(),
              calendarStatus: fullEdition.calendarStatus,
              hasOrganization: !!fullEdition.organization,
              racesCount: fullEdition.races?.length || 0,
              ffaRacesCount: competition.races.length
            })
          }
          
          // Si on a des changements, créer la proposition
          if (Object.keys(changes).length > 0) {
            context.logger.info(`📝 Proposition EDITION_UPDATE pour ${matchResult.event!.name} (édition ${matchResult.edition.id})`, {
              changesCount: Object.keys(changes).length,
              changeTypes: Object.keys(changes)
            })
            proposals.push({
              type: ProposalType.EDITION_UPDATE,
              eventId: matchResult.event!.id,
              editionId: matchResult.edition.id,
              changes,
              justification: justifications
            })
          }
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
          let matchedCount = 0
          let proposalsFromMatches = 0
          
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
              config,
              context
            )

            if (matchResult.type !== 'NO_MATCH') {
              matchedCount++
              if (proposals.length > 0) {
                proposalsFromMatches++
              }
            }

            allProposals.push(...proposals)
          }
          
          context.logger.info(`📊 Stats: ${matchedCount} matches (${proposalsFromMatches} avec propositions)`)

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
