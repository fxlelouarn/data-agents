/**
 * Agent de scraping du calendrier FFA (Fédération Française d'Athlétisme)
 * 
 * Cet agent scrape automatiquement le calendrier FFA pour:
 * - Extraire les compétitions de course à pied par ligues et par mois
 * - Matcher les compétitions avec les événements existants dans Miles Republic
 * - Créer des propositions de création/modification d'événements, éditions et courses
 */

import { BaseAgent, AgentContext, AgentRunResult, ProposalData, ProposalType, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import { FFAScraperAgentConfigSchema } from './FFAScraperAgent.configSchema'
import { 
  FFAScraperConfig, 
  FFACompetition, 
  FFACompetitionDetails,
  ScrapingProgress,
  FFA_LIGUES,
  MatchResult,
  convertFFALigueToRegionCode,
  convertFFALigueToRegionName,
  convertFFALigueToDisplayCode
} from './ffa/types'
import { 
  fetchAllCompetitionsForPeriod, 
  fetchCompetitionDetails, 
  getMonthBounds, 
  generateMonthsToScrape,
  humanDelay 
} from './ffa/scraper'
import { matchCompetition, calculateAdjustedConfidence } from './ffa/matcher'
import { getDepartmentName, normalizeDepartmentCode } from './ffa/departments'
import { hasIdenticalPendingProposal, hasNewInformation, filterNewChanges } from './ffa/deduplication'

export class FFAScraperAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'ffa-scraper-agent',
      name: config.name || 'FFA Scraper Agent',
      description: 'Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied',
      type: 'EXTRACTOR' as AgentType,
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
    // Note: dbManager est maintenant dans BaseAgent
    this.prisma = prisma
    this.stateService = new AgentStateService(prisma)
  }

  /**
   * Initialise la connexion à la base de données Miles Republic
   * @deprecated Cette méthode utilise maintenant connectToSource() de BaseAgent
   */
  private async initializeSourceConnection(config: FFAScraperConfig): Promise<void> {
    this.logger.debug('🔍 [DEBUG] initializeSourceConnection appelée', {
      hasSourceDb: !!this.sourceDb,
      sourceDatabase: config.sourceDatabase
    })
    
    if (!this.sourceDb) {
      this.logger.debug('🔍 [DEBUG] Appel de connectToSource...')
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
      
      this.logger.debug('🔍 [DEBUG] Résultat de connectToSource', {
        sourceDbDefined: !!this.sourceDb,
        sourceDbType: typeof this.sourceDb,
        hasEventModel: this.sourceDb && typeof this.sourceDb.event !== 'undefined',
        hasEventModelCapital: this.sourceDb && typeof this.sourceDb.Event !== 'undefined',
        sourceDbKeys: this.sourceDb ? Object.keys(this.sourceDb).slice(0, 10) : []
      })
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
   * Respecte le cooldown global (rescanDelayDays) avant de recommencer un cycle complet
   */
  private getNextTargets(
    progress: ScrapingProgress,
    config: FFAScraperConfig
  ): { ligues: string[], months: string[] } {
    // Générer la liste des mois dans la fenêtre
    const allMonths = generateMonthsToScrape(config.scrapingWindowMonths)
    
    // Vérifier si on a terminé un cycle complet (toutes les ligues)
    const allLiguesCompleted = FFA_LIGUES.every(ligue => {
      const completedMonthsForLigue = progress.completedMonths[ligue] || []
      // Une ligue est complète si elle a scanné tous les mois de la fenêtre
      return allMonths.every(month => completedMonthsForLigue.includes(month))
    })
    
    if (allLiguesCompleted && progress.lastCompletedAt) {
      // Calculer le temps écoulé depuis le dernier cycle complet
      const daysSinceLastComplete = 
        (Date.now() - new Date(progress.lastCompletedAt).getTime()) / (1000 * 60 * 60 * 24)
      
      if (daysSinceLastComplete < config.rescanDelayDays) {
        this.logger.info(`⏸️  Cooldown actif: ${Math.ceil(daysSinceLastComplete)}/${config.rescanDelayDays} jours écoulés depuis le dernier cycle complet`)
        this.logger.info(`⏭️  Prochain scan dans ${Math.ceil(config.rescanDelayDays - daysSinceLastComplete)} jours`)
        // Retourner des listes vides pour indiquer qu'il faut attendre
        return { ligues: [], months: [] }
      }
      
      // Le cooldown est écoulé, recommencer un nouveau cycle
      this.logger.info(`🔄 Cooldown terminé (${Math.ceil(daysSinceLastComplete)} jours), redémarrage d'un nouveau cycle complet`)
      progress.completedMonths = {}
      progress.currentLigue = FFA_LIGUES[0]
      progress.currentMonth = allMonths[0]
    }
    
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
            newDate: newClosingDate.toISOString(),
            source: ffaData.competition.detailUrl
          }
        })
      }
    }

    // 4. Organisateur (via EditionPartner avec role ORGANIZER)
    if (ffaData.organizerName) {
      // Trouver l'organisateur actuel dans les EditionPartners
      const existingOrganizer = (edition.editionPartners || []).find(
        (p: any) => p.role === 'ORGANIZER'
      )
      
      const existingOrgName = existingOrganizer?.name
      const existingOrgWebsite = existingOrganizer?.websiteUrl
      
      // Proposer si:
      // 1. Aucun organisateur n'existe
      // 2. Le nom a changé
      // 3. Un nouveau site web est disponible
      const shouldUpdate = !existingOrganizer || 
                           existingOrgName !== ffaData.organizerName ||
                           (ffaData.organizerWebsite && ffaData.organizerWebsite !== existingOrgWebsite)
      
      if (shouldUpdate) {
        changes.organizer = {
          old: existingOrganizer ? {
            name: existingOrgName,
            websiteUrl: existingOrgWebsite
          } : null,
          new: {
            name: ffaData.organizerName,
            websiteUrl: ffaData.organizerWebsite,
            facebookUrl: ffaData.organizerWebsite?.includes('facebook.com') ? ffaData.organizerWebsite : undefined,
            instagramUrl: ffaData.organizerWebsite?.includes('instagram.com') ? ffaData.organizerWebsite : undefined,
            email: ffaData.organizerEmail,
            phone: ffaData.organizerPhone
          },
          confidence: confidence * 0.85
        }
        
        const reasons = []
        if (!existingOrganizer) reasons.push('organisateur manquant')
        if (existingOrgName && existingOrgName !== ffaData.organizerName) reasons.push('nom différent')
        if (ffaData.organizerWebsite && ffaData.organizerWebsite !== existingOrgWebsite) reasons.push('nouveau site web')
        
        justifications.push({
          type: 'text',
          content: `Organisateur FFA: ${ffaData.organizerName}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`,
          metadata: {
            oldOrganizer: existingOrgName,
            newOrganizer: ffaData.organizerName,
            contact: {
              email: ffaData.organizerEmail,
              phone: ffaData.organizerPhone,
              website: ffaData.organizerWebsite
            },
            reasons,
            source: ffaData.competition.detailUrl
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
            distance: ffaRace.distance ? ffaRace.distance / 1000 : undefined,
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
          metadata: { 
            races: racesToAdd.map(r => r.name),
            source: ffaData.competition.detailUrl
          }
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
          metadata: { 
            races: racesToUpdate.map(r => ({ name: r.raceName, updates: r.updates })),
            source: ffaData.competition.detailUrl
          }
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
        metadata: { 
          services: ffaData.services,
          source: ffaData.competition.detailUrl
        }
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
          metadata: { 
            preview: ffaData.additionalInfo.substring(0, 200),
            source: ffaData.competition.detailUrl
          }
        })
      }
    }

    return { changes, justifications }
  }

  /**
   * Détermine l'offset UTC d'une ligue en fonction de sa localisation
   * Les DOM-TOM ont des timezones différentes de la métropole
   */
  private getTimezoneOffset(ligue: string, month: number): number {
    // Timezones DOM-TOM (pas de DST)
    const domTomTimezones: Record<string, number> = {
      'GUA': -4,  // Guadeloupe (America/Guadeloupe)
      'GUY': -3,  // Guyane (America/Cayenne)
      'MAR': -4,  // Martinique (America/Martinique)
      'MAY': 3,   // Mayotte (Indian/Mayotte)
      'N-C': 11,  // Nouvelle-Calédonie (Pacific/Noumea)
      'P-F': -10, // Polynésie Française (Pacific/Tahiti)
      'REU': 4,   // Réunion (Indian/Reunion)
      'W-F': 12   // Wallis-et-Futuna (Pacific/Wallis)
    }
    
    // Si c'est un DOM-TOM, retourner son offset fixe (pas de DST)
    if (ligue in domTomTimezones) {
      return domTomTimezones[ligue]
    }
    
    // Sinon, c'est la métropole : UTC+1 (hiver) ou UTC+2 (été avec DST)
    const isDST = month > 2 && month < 10 // Approximation DST (mars à octobre)
    return isDST ? 2 : 1
  }

  /**
   * Calcule la date de début d'une édition en utilisant l'heure de la première course
   * Convertit l'heure locale (selon la ligue) en UTC
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
      
      // Déterminer l'offset UTC selon la ligue
      const ligue = ffaData.competition.ligue
      const offsetHours = this.getTimezoneOffset(ligue, month)
      
      // Créer la date en heure locale
      const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
      
      // Convertir en UTC
      const startDateUTC = new Date(Date.UTC(year, month, day, hours - offsetHours, minutes, 0, 0))
      
      const offsetSign = offsetHours >= 0 ? '+' : ''
      this.logger.info(`🕒 Date calculée avec heure première course: ${localDateStr} ${ligue} (UTC${offsetSign}${offsetHours}) -> ${startDateUTC.toISOString()} UTC (course: ${ffaData.races[0].name} à ${ffaData.races[0].startTime})`)
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
            new: convertFFALigueToRegionName(competition.competition.ligue),
            confidence
          },
          countrySubdivisionDisplayCodeLevel1: {
            new: convertFFALigueToDisplayCode(competition.competition.ligue),
            confidence
          },
          countrySubdivisionNameLevel2: {
            new: getDepartmentName(competition.competition.department),
            confidence
          },
          countrySubdivisionDisplayCodeLevel2: {
            new: normalizeDepartmentCode(competition.competition.department),
            confidence
          },
          ...(competition.organizerWebsite ? {
            [competition.organizerWebsite.includes('facebook.com') ? 'facebookUrl' : 'websiteUrl']: {
              new: competition.organizerWebsite,
              confidence
            }
          } : {}),
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
                  // Convertir l'heure locale en UTC selon la ligue
                  const competitionDate = competition.competition.date
                  const year = competitionDate.getUTCFullYear()
                  const month = competitionDate.getUTCMonth()
                  const day = competitionDate.getUTCDate()
                  const [hours, minutes] = race.startTime.split(':').map(Number)
                  
                  // Déterminer l'offset selon la ligue
                  const ligue = competition.competition.ligue
                  const offsetHours = this.getTimezoneOffset(ligue, month)
                  
                  raceStartDate = new Date(Date.UTC(year, month, day, hours - offsetHours, minutes, 0, 0))
                } else {
                  raceStartDate = competition.competition.date
                }
                
                return {
                  name: race.name,
                  startDate: raceStartDate,
                  runDistance: race.distance ? race.distance / 1000 : undefined,
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
            eventName: competition.competition.name,
            eventCity: competition.competition.city,
            editionYear: competition.competition.date.getFullYear(),
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
            editionPartners: true,
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
          
          // Si on a des changements, vérifier la déduplication
          if (Object.keys(changes).length > 0) {
            // Récupérer les propositions en attente pour cette édition
            const pendingProposals = await this.prisma.proposal.findMany({
              where: {
                editionId: matchResult.edition.id.toString(),
                status: 'PENDING',
                type: ProposalType.EDITION_UPDATE
              },
              select: {
                id: true,
                type: true,
                eventId: true,
                editionId: true,
                raceId: true,
                changes: true,
                status: true,
                createdAt: true
              }
            })
            
            // Vérifier si une proposition identique existe déjà
            if (hasIdenticalPendingProposal(changes, pendingProposals)) {
              context.logger.info(`⏭️  Proposition identique déjà en attente pour édition ${matchResult.edition.id} (${matchResult.event!.name}), skip`, {
                pendingCount: pendingProposals.length,
                changesHash: require('crypto').createHash('sha256').update(JSON.stringify(changes)).digest('hex').substring(0, 8)
              })
              return proposals // Ne pas créer de nouvelle proposition
            }
            
            // Filtrer pour ne garder que les nouvelles informations
            const filteredChanges = filterNewChanges(changes, fullEdition, pendingProposals)
            
            if (Object.keys(filteredChanges).length === 0) {
              context.logger.info(`⏭️  Aucune nouvelle information pour édition ${matchResult.edition.id} (${matchResult.event!.name}), skip`, {
                originalChangesCount: Object.keys(changes).length,
                pendingProposalsCount: pendingProposals.length
              })
              return proposals
            }
            
            // Log si on a filtré des changements
            if (Object.keys(filteredChanges).length < Object.keys(changes).length) {
              context.logger.info(`🔍 Filtrage des changements pour ${matchResult.event!.name}:`, {
                original: Object.keys(changes).length,
                filtered: Object.keys(filteredChanges).length,
                removed: Object.keys(changes).filter(k => !filteredChanges[k])
              })
            }
            
            context.logger.info(`📝 Proposition EDITION_UPDATE pour ${matchResult.event!.name} (édition ${matchResult.edition.id})`, {
              changesCount: Object.keys(filteredChanges).length,
              changeTypes: Object.keys(filteredChanges),
              pendingProposalsChecked: pendingProposals.length
            })
            
            // Ajouter les métadonnées de contexte dans la justification
            const enrichedJustifications = justifications.map((justif, index) => {
              if (index === 0) {
                return {
                  ...justif,
                  metadata: {
                    ...justif.metadata,
                    eventName: matchResult.event!.name,
                    eventCity: matchResult.event!.city,
                    editionYear: fullEdition.year ? parseInt(fullEdition.year) : undefined
                  }
                }
              }
              return justif
            })
            
            proposals.push({
              type: ProposalType.EDITION_UPDATE,
              eventId: matchResult.event!.id.toString(),
              editionId: matchResult.edition.id.toString(),
              changes: filteredChanges,
              justification: enrichedJustifications
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
      
      // Vérifier que la connexion a été établie
      if (!this.sourceDb) {
        throw new Error(`Échec de la connexion à la base de données source: ${config.sourceDatabase}`)
      }
      
      context.logger.info('✅ Connexion à la base source établie', {
        sourceDatabase: config.sourceDatabase
      })
      
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

      // Calculer la prochaine position de scraping
      const allMonths = generateMonthsToScrape(config.scrapingWindowMonths)
      const lastProcessedMonth = months[months.length - 1]
      const lastProcessedLigue = ligues[ligues.length - 1]
      
      const lastMonthIndex = allMonths.indexOf(lastProcessedMonth)
      const lastLigueIndex = FFA_LIGUES.indexOf(lastProcessedLigue as any)
      
      // Avancer au mois suivant ou à la ligue suivante si tous les mois sont traités
      if (lastMonthIndex + 1 < allMonths.length) {
        // Il reste des mois à traiter pour cette ligue
        progress.currentMonth = allMonths[lastMonthIndex + 1]
        progress.currentLigue = lastProcessedLigue
        context.logger.info(`⏭️  Prochaine position: ${progress.currentLigue} - ${progress.currentMonth}`)
      } else {
        // Tous les mois traités pour cette ligue, passer à la suivante
        if (lastLigueIndex + 1 < FFA_LIGUES.length) {
          progress.currentLigue = FFA_LIGUES[lastLigueIndex + 1]
          progress.currentMonth = allMonths[0] // Recommencer au premier mois
          context.logger.info(`⏭️  Ligue complétée, passage à: ${progress.currentLigue} - ${progress.currentMonth}`)
        } else {
          // Toutes les ligues complétées, recommencer au début
          progress.currentLigue = FFA_LIGUES[0]
          progress.currentMonth = allMonths[0]
          context.logger.info(`🔄 Cycle complet terminé, redémarrage: ${progress.currentLigue} - ${progress.currentMonth}`)
        }
      }

      // Mettre à jour la progression
      progress.totalCompetitionsScraped += totalCompetitions
      progress.lastCompletedAt = new Date()
      await this.saveProgress(progress)

      // Sauvegarder les propositions en base de données
      context.logger.info(`💾 Sauvegarde de ${allProposals.length} propositions...`)
      for (const proposal of allProposals) {
        try {
          // Extraire la confiance de la proposition
          const proposalConfidence = proposal.justification?.[0]?.metadata?.confidence || 0.7
          
          await this.createProposal(
            proposal.type,
            proposal.changes,
            proposal.justification,
            proposal.eventId?.toString(),
            proposal.editionId?.toString(),
            proposal.raceId?.toString(),
            proposalConfidence
          )
        } catch (error) {
          context.logger.error(`Erreur lors de la création d'une proposition`, { 
            type: proposal.type,
            error: String(error) 
          })
        }
      }
      
      context.logger.info(`✅ Scraping terminé: ${totalCompetitions} compétitions, ${allProposals.length} propositions sauvegardées`)

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
