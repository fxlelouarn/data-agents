/**
 * Agent de scraping du calendrier FFA (Fédération Française d'Athlétisme)
 *
 * Cet agent scrape automatiquement le calendrier FFA pour:
 * - Extraire les compétitions de course à pied par ligues et par mois
 * - Matcher les compétitions avec les événements existants dans Miles Republic
 * - Créer des propositions de création/modification d'événements, éditions et courses
 */

import { AGENT_VERSIONS, FFAScraperAgentConfigSchema } from '@data-agents/types'
import { BaseAgent, AgentContext, AgentRunResult, ProposalData, ProposalType, AgentType } from '@data-agents/agent-framework'

// Version exportée pour compatibilité
export const FFA_SCRAPER_AGENT_VERSION = AGENT_VERSIONS.FFA_SCRAPER_AGENT
import { IAgentStateService, AgentStateService, prisma } from '@data-agents/database'
import {
  FFAScraperConfig,
  FFACompetition,
  FFACompetitionDetails,
  FFARace,
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
import { parseCompetitionsList, parseCompetitionDetails, normalizeFFARaceName, classifyOrganizerUrl } from './ffa/parser'
import { matchCompetition, calculateAdjustedConfidence, calculateNewEventConfidence } from './ffa/matcher'
import { getDepartmentName, normalizeDepartmentCode } from '@data-agents/agent-framework'
import { hasIdenticalPendingProposal, hasNewInformation, filterNewChanges } from './ffa/deduplication'
import { fromZonedTime, getTimezoneOffset as getTzOffset } from 'date-fns-tz'

export class FFAScraperAgent extends BaseAgent {
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'ffa-scraper-agent',
      name: config.name || 'FFA Scraper Agent',
      description: `Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied (v${FFA_SCRAPER_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 */12 * * *', // Toutes les 12 heures par défaut
      isActive: config.isActive ?? true,
      config: {
        version: FFA_SCRAPER_AGENT_VERSION,
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

    // Déterminer les mois à traiter en évitant ceux déjà complétés
    let currentMonthIndex = allMonths.indexOf(progress.currentMonth)

    // Si le mois actuel n'est plus dans la fenêtre (expiré), recommencer au premier mois
    if (currentMonthIndex === -1) {
      this.logger.info(`⚠️  Mois actuel ${progress.currentMonth} expiré, redémarrage au mois: ${allMonths[0]}`)
      currentMonthIndex = 0
      progress.currentMonth = allMonths[0]
    }

    // Trouver les mois non complétés pour les ligues sélectionnées
    // On cherche les mois qui n'ont pas été complétés pour AU MOINS une des ligues
    const months: string[] = []

    for (let i = currentMonthIndex; i < allMonths.length && months.length < config.monthsPerRun; i++) {
      const month = allMonths[i]
      // Vérifier si ce mois n'est pas complété pour au moins une des ligues sélectionnées
      const needsProcessing = ligues.some(ligue => {
        const completedForLigue = progress.completedMonths[ligue] || []
        return !completedForLigue.includes(month)
      })

      if (needsProcessing) {
        months.push(month)
      } else {
        this.logger.debug?.(`⏭️  Mois ${month} déjà complété pour toutes les ligues [${ligues.join(', ')}], skip`)
      }
    }

    // Si tous les mois sont complétés pour ces ligues, passer aux ligues suivantes
    if (months.length === 0 && ligues.length > 0) {
      const lastLigueIndex = FFA_LIGUES.indexOf(ligues[ligues.length - 1] as any)
      if (lastLigueIndex + 1 < FFA_LIGUES.length) {
        // Avancer aux prochaines ligues
        this.logger.info(`✅ Toutes les ligues [${ligues.join(', ')}] ont complété tous les mois, passage aux suivantes`)
        progress.currentLigue = FFA_LIGUES[lastLigueIndex + 1]
        progress.currentMonth = allMonths[0]
        // Récursion pour obtenir les vraies prochaines cibles
        return this.getNextTargets(progress, config)
      }
    }

    // Mettre à jour currentMonth si on a sauté des mois déjà complétés
    if (months.length > 0 && months[0] !== progress.currentMonth) {
      this.logger.info(`⏭️  Avance au mois ${months[0]} (${progress.currentMonth} déjà complété)`)
      progress.currentMonth = months[0]
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
      // Proposer aussi endDate = date de la dernière course
      const ffaEndDate = this.calculateEditionEndDate(ffaData)
      changes.endDate = {
        old: edition.endDate,
        new: ffaEndDate,
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

    // 2. TimeZone selon la ligue (DOM-TOM vs Métropole)
    const ffaTimeZone = this.getTimezoneIANA(ffaData.competition.ligue)
    if (edition.timeZone !== ffaTimeZone) {
      changes.timeZone = {
        old: edition.timeZone,
        new: ffaTimeZone,
        confidence
      }
      justifications.push({
        type: 'text',
        content: `TimeZone FFA: ${ffaTimeZone} (ligue ${ffaData.competition.ligue})`,
        metadata: {
          oldTimeZone: edition.timeZone,
          newTimeZone: ffaTimeZone,
          ligue: ffaData.competition.ligue,
          source: ffaData.competition.detailUrl
        }
      })
    }

    // 3. Statut calendrier (toujours confirmer depuis la FFA)
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

    // 4. Date de clôture des inscriptions
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

    // 5. Organisateur (via EditionPartner avec role ORGANIZER)
    if (ffaData.organizerName) {
      // Trouver l'organisateur actuel dans les EditionPartners
      const existingOrganizer = (edition.editionPartners || []).find(
        (p: any) => p.role === 'ORGANIZER'
      )

      const existingOrgName = existingOrganizer?.name
      const existingOrgWebsite = existingOrganizer?.websiteUrl
      const existingOrgFacebook = existingOrganizer?.facebookUrl
      const existingOrgInstagram = existingOrganizer?.instagramUrl

      // Classifier le lien extrait selon son type (facebook, instagram, ou website)
      const classifiedUrls = classifyOrganizerUrl(ffaData.organizerWebsite)

      // Proposer si:
      // 1. Aucun organisateur n'existe
      // 2. Le nom a changé
      // 3. Une nouvelle URL est disponible (dans le bon champ)
      const shouldUpdate = !existingOrganizer ||
                           existingOrgName !== ffaData.organizerName ||
                           (classifiedUrls.websiteUrl && classifiedUrls.websiteUrl !== existingOrgWebsite) ||
                           (classifiedUrls.facebookUrl && classifiedUrls.facebookUrl !== existingOrgFacebook) ||
                           (classifiedUrls.instagramUrl && classifiedUrls.instagramUrl !== existingOrgInstagram)

      if (shouldUpdate) {
        changes.organizer = {
          old: existingOrganizer ? {
            name: existingOrgName,
            websiteUrl: existingOrgWebsite,
            facebookUrl: existingOrgFacebook,
            instagramUrl: existingOrgInstagram
          } : null,
          new: {
            name: ffaData.organizerName,
            // Utiliser les URLs classifiées (un seul champ sera défini selon le type de lien)
            ...classifiedUrls,
            email: ffaData.organizerEmail,
            phone: ffaData.organizerPhone
          },
          confidence: confidence * 0.85
        }

        const reasons = []
        if (!existingOrganizer) reasons.push('organisateur manquant')
        if (existingOrgName && existingOrgName !== ffaData.organizerName) reasons.push('nom différent')
        if (classifiedUrls.websiteUrl && classifiedUrls.websiteUrl !== existingOrgWebsite) reasons.push('nouveau site web')
        if (classifiedUrls.facebookUrl && classifiedUrls.facebookUrl !== existingOrgFacebook) reasons.push('nouveau lien Facebook')
        if (classifiedUrls.instagramUrl && classifiedUrls.instagramUrl !== existingOrgInstagram) reasons.push('nouveau lien Instagram')

        justifications.push({
          type: 'text',
          content: `Organisateur FFA: ${ffaData.organizerName}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`,
          metadata: {
            oldOrganizer: existingOrgName,
            newOrganizer: ffaData.organizerName,
            contact: {
              email: ffaData.organizerEmail,
              phone: ffaData.organizerPhone,
              website: ffaData.organizerWebsite,
              classifiedAs: Object.keys(classifiedUrls)[0] || 'none'
            },
            reasons,
            source: ffaData.competition.detailUrl
          }
        })
      }
    }

    // 6. Courses manquantes ou à mettre à jour
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

      // FIX: Set pour tracker les courses DB déjà matchées
      // Évite qu'une même course DB soit matchée par plusieurs courses FFA de même distance
      const matchedDbRaceIds = new Set<number>()

      for (const ffaRace of ffaData.races) {
        // Inférer la catégorie de la course FFA pour un meilleur matching
        const [ffaCategoryLevel1] = this.inferRaceCategories(
          ffaRace.name,
          ffaRace.distance ? ffaRace.distance / 1000 : undefined
        )

        // Calculer la date de la course FFA (pour événements multi-jours)
        const ffaRaceDate = this.calculateRaceStartDate(ffaData, ffaRace)
        const ffaRaceDayStr = ffaRaceDate.toISOString().split('T')[0]

        const matchingRace = existingRacesWithMeters.find((dbRace: any) => {
          // FIX: Ignorer les courses déjà matchées
          if (matchedDbRaceIds.has(dbRace.id)) {
            return false
          }

          // Utiliser la distance totale déjà convertie en mètres
          const totalDistance = dbRace.totalDistanceMeters

          // Si la course FFA a une distance, matcher sur distance + catégorie + date
          if (ffaRace.distance && ffaRace.distance > 0) {
            // Utiliser la tolérance configurée (config.distanceTolerancePercent)
            const tolerancePercent = (this.config.config as FFAScraperConfig).distanceTolerancePercent
            const tolerance = ffaRace.distance * tolerancePercent
            const distanceDiff = Math.abs(totalDistance - ffaRace.distance)

            // La distance doit être dans la tolérance
            if (distanceDiff > tolerance) {
              return false
            }

            // FIX: Pour les événements multi-jours, vérifier aussi la catégorie
            // Ex: "Marche nordique 9km" (WALK) ne doit pas matcher "Trail 9km" (TRAIL)
            if (dbRace.categoryLevel1 && ffaCategoryLevel1) {
              const categoryMatch = dbRace.categoryLevel1 === ffaCategoryLevel1
              if (!categoryMatch) {
                // Catégories différentes - vérifier si la date correspond
                // Si même jour, c'est probablement la même course malgré catégorie différente
                // Si jour différent, ce sont des courses distinctes
                if (dbRace.startDate) {
                  const dbRaceDayStr = dbRace.startDate.toISOString().split('T')[0]
                  if (dbRaceDayStr !== ffaRaceDayStr) {
                    // Jour différent + catégorie différente = courses distinctes
                    return false
                  }
                }
              }
            }

            // FIX: Pour les événements multi-jours, vérifier la date
            // Si plusieurs courses ont la même distance, privilégier celle du même jour
            if (dbRace.startDate) {
              const dbRaceDayStr = dbRace.startDate.toISOString().split('T')[0]
              // Si jour différent et qu'il existe une autre course de même distance le bon jour,
              // ce n'est pas un match
              const sameDayRaceExists = existingRacesWithMeters.some((otherRace: any) => {
                if (otherRace.id === dbRace.id || matchedDbRaceIds.has(otherRace.id)) return false
                const otherDistanceDiff = Math.abs(otherRace.totalDistanceMeters - (ffaRace.distance || 0))
                if (otherDistanceDiff > tolerance) return false
                if (!otherRace.startDate) return false
                const otherDayStr = otherRace.startDate.toISOString().split('T')[0]
                // Vérifier aussi la catégorie si disponible
                if (otherRace.categoryLevel1 && ffaCategoryLevel1 && otherRace.categoryLevel1 !== ffaCategoryLevel1) {
                  return false
                }
                return otherDayStr === ffaRaceDayStr
              })

              if (dbRaceDayStr !== ffaRaceDayStr && sameDayRaceExists) {
                // Il existe une meilleure correspondance le même jour
                return false
              }
            }

            return true
          }

          // Si pas de distance FFA, fallback sur le matching de nom
          const nameMatch = dbRace.name?.toLowerCase().includes(ffaRace.name.toLowerCase()) ||
                            ffaRace.name.toLowerCase().includes(dbRace.name?.toLowerCase())
          return nameMatch
        })

        // FIX: Marquer cette course DB comme matchée pour éviter les doublons
        if (matchingRace) {
          matchedDbRaceIds.add(matchingRace.id)
        }

        if (!matchingRace) {
          this.logger.info(`➡️  Course FFA non matchée: ${ffaRace.name} (${ffaRace.distance}m) - sera ajoutée`)

          // Inférer les catégories à partir du nom et des distances
          const [categoryLevel1, categoryLevel2] = this.inferRaceCategories(
            ffaRace.name,
            ffaRace.distance ? ffaRace.distance / 1000 : undefined  // runDistance en km
          )

          // Normaliser le nom selon le format standard
          const normalizedName = normalizeFFARaceName(
            ffaRace.name,
            categoryLevel1,
            categoryLevel2,
            ffaRace.distance ? ffaRace.distance / 1000 : undefined
          )

          // Calculer la startDate complète (date + heure + timezone)
          const raceStartDate = this.calculateRaceStartDate(ffaData, ffaRace)

          // ✅ Définir le bon champ de distance selon la catégorie
          const distanceKm = ffaRace.distance ? ffaRace.distance / 1000 : undefined
          const elevationM = ffaRace.positiveElevation

          const raceData: any = {
            name: normalizedName,  // ✅ Nom normalisé au lieu du nom brut
            distance: distanceKm,  // Pour l'affichage frontend
            elevation: elevationM,  // Pour l'affichage frontend
            startDate: raceStartDate,  // DateTime UTC complet
            categoryLevel1,
            categoryLevel2,  // ✅ Maintenant renseigné à partir du nom
            categories: ffaRace.categories,
            timeZone: this.getTimezoneIANA(ffaData.competition.ligue)
          }

          // Ajouter le bon champ de distance selon la catégorie (pour l'application)
          if (categoryLevel1 === 'WALK') {
            raceData.walkDistance = distanceKm
            raceData.walkPositiveElevation = elevationM
          } else if (categoryLevel1 === 'CYCLING') {
            raceData.bikeDistance = distanceKm
            raceData.bikePositiveElevation = elevationM
          } else {
            // RUNNING, TRAIL, TRIATHLON, FUN, OTHER par défaut
            raceData.runDistance = distanceKm
            raceData.runPositiveElevation = elevationM
          }

          racesToAdd.push(raceData)
        } else {
          this.logger.info(`✅ Course FFA matchée: ${ffaRace.name} (${ffaRace.distance}m) ↔ ${matchingRace.name} (${matchingRace.totalDistanceMeters}m)`)
          const raceUpdates: any = {}

          // Vérifier l'élévation
          if (ffaRace.positiveElevation &&
              (!matchingRace.runPositiveElevation ||
               Math.abs(matchingRace.runPositiveElevation - ffaRace.positiveElevation) > 10)) {
            raceUpdates.runPositiveElevation = {
              old: matchingRace.runPositiveElevation,
              new: ffaRace.positiveElevation
            }
          }

          // Vérifier la date/heure de départ de la course
          const expectedTimeZone = this.getTimezoneIANA(ffaData.competition.ligue)
          const raceStartDate = this.calculateRaceStartDate(ffaData, ffaRace)

          // CAS 1: FFA donne une heure
          if (ffaRace.startTime) {
            // Comparer avec la startDate existante de la course (si elle existe)
            if (matchingRace.startDate) {
              // CAS 1a: DB à minuit local -> Toujours proposer l'heure précise
              const dbTimeZone = matchingRace.timeZone || expectedTimeZone
              const isDbMidnight = this.isMidnightInTimezone(matchingRace.startDate, dbTimeZone)

              if (isDbMidnight) {
                this.logger.info(`🕓 Course à minuit détectée, ajout heure précise: ${matchingRace.name}`, {
                  dbDate: matchingRace.startDate.toISOString(),
                  ffaDate: raceStartDate.toISOString()
                })
                raceUpdates.startDate = {
                  old: matchingRace.startDate,
                  new: raceStartDate
                }
              } else {
                // CAS 1b: DB avec heure -> Proposer si différence
                const timeDiff = Math.abs(raceStartDate.getTime() - matchingRace.startDate.getTime())

                if (timeDiff > 0) {
                  this.logger.info(`⏰ Différence horaire détectée: ${matchingRace.name}`, {
                    dbDate: matchingRace.startDate.toISOString(),
                    ffaDate: raceStartDate.toISOString(),
                    diffMinutes: Math.round(timeDiff / 60000)
                  })
                  raceUpdates.startDate = {
                    old: matchingRace.startDate,
                    new: raceStartDate
                  }
                }
              }

              // Mettre à jour le timeZone si nécessaire
              if (matchingRace.timeZone !== expectedTimeZone && Object.keys(raceUpdates).length > 0) {
                raceUpdates.timeZone = {
                  old: matchingRace.timeZone,
                  new: expectedTimeZone
                }
              }
            } else {
              // CAS 1c: Pas de startDate existante, proposer d'ajouter
              this.logger.info(`➕ Ajout date+heure manquante: ${matchingRace.name}`, {
                ffaDate: raceStartDate.toISOString()
              })
              raceUpdates.startDate = {
                old: null,
                new: raceStartDate
              }
              // Aussi ajouter le timeZone si manquant
              if (!matchingRace.timeZone || matchingRace.timeZone !== expectedTimeZone) {
                raceUpdates.timeZone = {
                  old: matchingRace.timeZone,
                  new: expectedTimeZone
                }
              }
            }
          } else {
            // CAS 2: FFA ne donne PAS d'heure (seulement une date)
            if (matchingRace.startDate) {
              const dbTimeZone = matchingRace.timeZone || expectedTimeZone
              const isDbMidnight = this.isMidnightInTimezone(matchingRace.startDate, dbTimeZone)

              if (isDbMidnight) {
                // CAS 2a: DB à minuit -> Comparer les dates uniquement
                const isSameDate = this.isSameDateInTimezone(
                  matchingRace.startDate,
                  raceStartDate,
                  dbTimeZone
                )

                if (!isSameDate) {
                  // Date différente, proposer mise à jour
                  this.logger.info(`📅 Date changée (sans heure): ${matchingRace.name}`, {
                    dbDate: matchingRace.startDate.toISOString(),
                    ffaDate: raceStartDate.toISOString()
                  })
                  raceUpdates.startDate = {
                    old: matchingRace.startDate,
                    new: raceStartDate
                  }
                } else {
                  // Date identique -> Pas de proposition (Option A)
                  this.logger.debug(`⏭️  Date identique sans heure FFA: ${matchingRace.name}`)
                }
              } else {
                // CAS 2b: DB avec heure précise -> Ne pas écraser (Option A)
                this.logger.debug(`🔒 Conservation heure existante: ${matchingRace.name}`, {
                  reason: 'FFA ne fournit pas d\'heure, DB a une heure précise'
                })
              }
            } else {
              // CAS 2c: Pas de startDate existante, ajouter date sans heure (minuit)
              this.logger.info(`➕ Ajout date sans heure: ${matchingRace.name}`, {
                ffaDate: raceStartDate.toISOString()
              })
              raceUpdates.startDate = {
                old: null,
                new: raceStartDate
              }
              if (!matchingRace.timeZone || matchingRace.timeZone !== expectedTimeZone) {
                raceUpdates.timeZone = {
                  old: matchingRace.timeZone,
                  new: expectedTimeZone
                }
              }
            }
          }

          // Toujours inclure la course, même sans changements, pour affichage complet
          racesToUpdate.push({
            raceId: matchingRace.id,
            raceName: matchingRace.name,
            updates: raceUpdates,
            // ✅ Ajouter toutes les données actuelles de la course
            currentData: {
              name: matchingRace.name,
              startDate: matchingRace.startDate,
              runDistance: matchingRace.runDistance,
              walkDistance: matchingRace.walkDistance,
              swimDistance: matchingRace.swimDistance,
              bikeDistance: matchingRace.bikeDistance,
              runPositiveElevation: matchingRace.runPositiveElevation,
              categoryLevel1: matchingRace.categoryLevel1,
              categoryLevel2: matchingRace.categoryLevel2,
              timeZone: matchingRace.timeZone
            }
          })
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

      // 6bis. Mettre à jour les courses existantes non matchées avec la FFA
      // Si on a déjà proposé un changement de startDate pour l'édition, on doit aussi
      // mettre à jour les courses existantes qui n'ont pas été matchées
      // MAIS on doit conserver l'heure précise si la course en a une (non-minuit)
      const matchedRaceIds = new Set(racesToUpdate.map(r => r.raceId))
      const unmatchedExistingRaces = existingRaces.filter((r: any) => !matchedRaceIds.has(r.id))

      if (unmatchedExistingRaces.length > 0) {
        const ffaStartDate = this.calculateEditionStartDate(ffaData)
        const unmatchedExpectedTimeZone = this.getTimezoneIANA(ffaData.competition.ligue)

        // Proposer de mettre à jour la startDate de chaque course non matchée vers la nouvelle date d'édition
        unmatchedExistingRaces.forEach((race: any) => {
          if (!race.startDate) {
            // Pas de date existante -> ajouter la date FFA
            racesToUpdate.push({
              raceId: race.id,
              raceName: race.name,
              updates: {
                startDate: {
                  old: null,
                  new: ffaStartDate
                }
              },
              currentData: {
                name: race.name,
                startDate: race.startDate,
                runDistance: race.runDistance,
                walkDistance: race.walkDistance,
                swimDistance: race.swimDistance,
                bikeDistance: race.bikeDistance,
                runPositiveElevation: race.runPositiveElevation,
                categoryLevel1: race.categoryLevel1,
                categoryLevel2: race.categoryLevel2,
                timeZone: race.timeZone
              }
            })
            return
          }

          const raceTimeZone = race.timeZone || unmatchedExpectedTimeZone
          const isRaceMidnight = this.isMidnightInTimezone(race.startDate, raceTimeZone)
          const isSameDate = this.isSameDateInTimezone(race.startDate, ffaStartDate, raceTimeZone)

          if (isSameDate) {
            // Même date -> pas de mise à jour nécessaire
            this.logger.debug(`⏭️  Course non matchée "${race.name}" déjà à la bonne date`)
            return
          }

          // Date différente -> proposer mise à jour
          let newStartDate: Date

          if (isRaceMidnight) {
            // Course à minuit -> utiliser ffaStartDate directement
            newStartDate = ffaStartDate
            this.logger.info(`📅 Course non matchée "${race.name}" (minuit) → nouvelle date édition`)
          } else {
            // Course avec heure précise -> CONSERVER l'heure, changer seulement la DATE
            // Extraire l'heure de la course existante et l'appliquer à la nouvelle date FFA
            const raceLocalTime = new Intl.DateTimeFormat('en-US', {
              timeZone: raceTimeZone,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            }).format(race.startDate)

            const ffaLocalDate = new Intl.DateTimeFormat('en-CA', {
              timeZone: raceTimeZone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).format(ffaStartDate)

            // Reconstruire la date avec l'heure conservée
            const newLocalDateTimeStr = `${ffaLocalDate}T${raceLocalTime}`
            newStartDate = fromZonedTime(newLocalDateTimeStr, raceTimeZone)

            this.logger.info(`📅 Course non matchée "${race.name}" (heure conservée: ${raceLocalTime}) → nouvelle date édition`)
          }

          racesToUpdate.push({
            raceId: race.id,
            raceName: race.name,
            updates: {
              startDate: {
                old: race.startDate,
                new: newStartDate
              }
            },
            currentData: {
              name: race.name,
              startDate: race.startDate,
              runDistance: race.runDistance,
              walkDistance: race.walkDistance,
              swimDistance: race.swimDistance,
              bikeDistance: race.bikeDistance,
              runPositiveElevation: race.runPositiveElevation,
              categoryLevel1: race.categoryLevel1,
              categoryLevel2: race.categoryLevel2,
              timeZone: race.timeZone
            }
          })
        })

        // Mettre à jour les changements racesToUpdate si des courses ont été ajoutées
        if (racesToUpdate.length > 0) {
          changes.racesToUpdate = {
            old: null,
            new: racesToUpdate,
            confidence: confidence * 0.9
          }

          // Ajouter/mettre à jour la justification
          const unmatchedRacesUpdated = racesToUpdate.filter(r =>
            unmatchedExistingRaces.some((ur: any) => ur.id === r.raceId)
          )

          if (unmatchedRacesUpdated.length > 0) {
            justifications.push({
              type: 'text',
              content: `${unmatchedRacesUpdated.length} course(s) existante(s) non matchée(s) avec la FFA - Mise à jour vers nouvelle date d'édition`,
              metadata: {
                unmatchedRaces: unmatchedRacesUpdated.map(r => r.raceName),
                oldDate: edition.startDate?.toISOString(),
                newDate: ffaStartDate.toISOString(),
                source: ffaData.competition.detailUrl
              }
            })
            this.logger.info(`📅 ${unmatchedRacesUpdated.length} course(s) non matchée(s) → Mise à jour vers nouvelle date d'édition`, {
              unmatchedRaces: unmatchedRacesUpdated.map(r => ({ id: r.raceId, name: r.raceName })),
              newDate: ffaStartDate
            })
          }
        }
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
   * Vérifie si une date UTC correspond à minuit (00:00:00) dans une timezone donnée
   */
  private isMidnightInTimezone(date: Date, timezone: string): boolean {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })

    const timeStr = formatter.format(date)
    return timeStr === '00:00:00'
  }

  /**
   * Compare deux dates dans une timezone donnée (ignore l'heure)
   */
  private isSameDateInTimezone(date1: Date, date2: Date, timezone: string): boolean {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    return formatter.format(date1) === formatter.format(date2)
  }

  /**
   * Récupère le timezone IANA (ex: "Europe/Paris", "America/Guadeloupe") selon la ligue
   */
  private getTimezoneIANA(ligue: string): string {
    const ligueTimezones: Record<string, string> = {
      // DOM-TOM
      'GUA': 'America/Guadeloupe',
      'GUY': 'America/Cayenne',
      'MAR': 'America/Martinique',
      'MAY': 'Indian/Mayotte',
      'N-C': 'Pacific/Noumea',
      'P-F': 'Pacific/Tahiti',
      'REU': 'Indian/Reunion',
      'W-F': 'Pacific/Wallis'
    }

    // Si c'est un DOM-TOM, retourner sa timezone spécifique
    if (ligue in ligueTimezones) {
      return ligueTimezones[ligue]
    }

    // Sinon, c'est la métropole
    return 'Europe/Paris'
  }

  /**
   * Détermine l'offset UTC d'une ligue en fonction de sa localisation ET de la date précise
   * Utilise date-fns-tz pour gérer correctement les changements d'heure
   * @deprecated Utilisez getTimezoneOffset avec date-fns-tz à la place
   */
  private getTimezoneOffsetForDate(ligue: string, date: Date): number {
    const timeZone = this.getTimezoneIANA(ligue)

    // Utiliser date-fns-tz pour obtenir l'offset réel à cette date précise
    // getTzOffset retourne l'offset en millisecondes
    const offsetMs = getTzOffset(timeZone, date)
    const offsetHours = offsetMs / (1000 * 60 * 60)

    this.logger.debug(`🕐 Offset timezone pour ${ligue} (${timeZone}) le ${date.toISOString().split('T')[0]}: ${offsetHours}h`)

    return offsetHours
  }

  /**
   * Infère les catégories de course depuis le nom et les distances
   * Basé sur les données réelles de Miles Republic (82 combinaisons trouvées)
   * @param raceName Nom de la course
   * @param runDistance Distance course en km (optionnel)
   * @param bikeDistance Distance vélo en km (optionnel)
   * @param swimDistance Distance nage en km (optionnel)
   * @param walkDistance Distance marche en km (optionnel)
   * @returns Tuple [categoryLevel1, categoryLevel2 | undefined]
   */
  private inferRaceCategories(
    raceName: string,
    runDistance?: number,
    bikeDistance?: number,
    swimDistance?: number,
    walkDistance?: number
  ): [string, string | undefined] {
    const lowerName = this.normalizeRaceName(raceName)

    // 1. TRIATHLON ET VARIANTS - Prioritaire car très distinctifs
    if (lowerName.includes('swim') && lowerName.includes('run')) return ['TRIATHLON', 'SWIM_RUN']
    if (lowerName.includes('swim') && lowerName.includes('bike')) return ['TRIATHLON', 'SWIM_BIKE']
    if (lowerName.includes('run') && lowerName.includes('bike')) return ['TRIATHLON', 'RUN_BIKE']
    if (lowerName.includes('aquathlon')) return ['TRIATHLON', 'AQUATHLON']
    if (lowerName.includes('duathlon')) return ['TRIATHLON', 'DUATHLON']
    if (lowerName.includes('cross triathlon') || lowerName.includes('cross-triathlon')) {
      return ['TRIATHLON', 'CROSS_TRIATHLON']
    }
    if (lowerName.includes('ultra triathlon')) return ['TRIATHLON', 'ULTRA_TRIATHLON']
    if (lowerName.includes('triathlon')) {
      // Déduire la taille du triathlon
      if (lowerName.includes('enfant') || lowerName.includes('kids')) return ['TRIATHLON', 'TRIATHLON_KIDS']
      if (lowerName.includes('xs')) return ['TRIATHLON', 'TRIATHLON_XS']
      if (lowerName.match(/\bm\b/)) return ['TRIATHLON', 'TRIATHLON_M']
      if (lowerName.match(/\bl\b/)) return ['TRIATHLON', 'TRIATHLON_L']
      if (lowerName.includes('xxl') || lowerName.includes('ultra')) return ['TRIATHLON', 'TRIATHLON_XXL']
      if (lowerName.match(/\bs\b/)) return ['TRIATHLON', 'TRIATHLON_S']  // Après les autres pour éviter matchage partiel
      // Si distances détectées, classifier par tailles standard
      if (swimDistance && bikeDistance && runDistance) {
        if (swimDistance <= 0.75 && bikeDistance <= 20 && runDistance <= 5) return ['TRIATHLON', 'TRIATHLON_XS']
        if (swimDistance <= 1.5 && bikeDistance <= 40 && runDistance <= 10) return ['TRIATHLON', 'TRIATHLON_S']
        if (swimDistance <= 2 && bikeDistance <= 90 && runDistance <= 21) return ['TRIATHLON', 'TRIATHLON_M']
        if (swimDistance <= 3 && bikeDistance <= 180 && runDistance <= 42) return ['TRIATHLON', 'TRIATHLON_L']
      }
      return ['TRIATHLON', undefined]
    }

    // 2. CYCLING - Vélo
    if (lowerName.includes('gravel')) {
      return lowerName.includes('race') ? ['CYCLING', 'GRAVEL_RACE'] : ['CYCLING', 'GRAVEL_RIDE']
    }
    if (lowerName.includes('gran fondo') || lowerName.includes('granfondo')) return ['CYCLING', 'GRAN_FONDO']
    if (lowerName.includes('enduro') && (lowerName.includes('vtt') || lowerName.includes('mountain'))) {
      return ['CYCLING', 'ENDURO_MOUNTAIN_BIKE']
    }
    if (lowerName.includes('xc') && (lowerName.includes('vtt') || lowerName.includes('mountain'))) {
      return ['CYCLING', 'XC_MOUNTAIN_BIKE']
    }
    if ((lowerName.includes('vtt') || lowerName.includes('mountain')) && !lowerName.includes('triathlon')) {
      return ['CYCLING', 'MOUNTAIN_BIKE_RIDE']
    }
    if (lowerName.includes('bikepacking') || lowerName.includes('bike packing')) return ['CYCLING', 'BIKEPACKING']
    if (lowerName.includes('ultra cycling') || (lowerName.includes('ultra') && bikeDistance && bikeDistance > 200)) {
      return ['CYCLING', 'ULTRA_CYCLING']
    }
    if (lowerName.includes('contre-la-montre') || lowerName.includes('clm') || lowerName.includes('time trial') || /\btt\b/.test(lowerName)) {
      return ['CYCLING', 'TIME_TRIAL']
    }
    if (lowerName.includes('touring') || lowerName.includes('cyclo')) return ['CYCLING', 'CYCLE_TOURING']
    if (lowerName.includes('vélo') || lowerName.includes('velo') || lowerName.includes('cyclisme') || lowerName.includes('cycling')) {
      // Fallback par distance si disponible
      if (bikeDistance && bikeDistance > 100) return ['CYCLING', 'GRAN_FONDO']
      return ['CYCLING', 'ROAD_CYCLING_TOUR']
    }

    // 3. TRAIL - Trails pédestres
    if (lowerName.includes('trail')) {
      // Classifier par distance
      if (runDistance) {
        if (runDistance <= 21) return ['TRAIL', 'DISCOVERY_TRAIL']
        if (runDistance <= 41) return ['TRAIL', 'SHORT_TRAIL']
        if (runDistance <= 80) return ['TRAIL', 'LONG_TRAIL']
        if (runDistance > 80) return ['TRAIL', 'ULTRA_TRAIL']
      }
      // Si "km" dans le nom avec nombre
      if (lowerName.includes('km')) {
        const kmMatch = lowerName.match(/(\d+)\s*km/)
        if (kmMatch) {
          const km = parseInt(kmMatch[1])
          if (km <= 5) return ['TRAIL', 'KM5']
          if (km <= 10) return ['TRAIL', 'KM10']
          if (km <= 15) return ['TRAIL', 'KM15']
          if (km <= 20) return ['TRAIL', 'KM20']
        }
      }
      return ['TRAIL', 'DISCOVERY_TRAIL']  // Défaut trail
    }

    // 4. WALK - Marches et randonnées
    if (lowerName.includes('marche nordique') || lowerName.includes('nordic walk')) return ['WALK', 'NORDIC_WALK']
    if (lowerName.includes('ski de fond') || lowerName.includes('cross country skiing')) return ['WALK', 'CROSS_COUNTRY_SKIING']
    if (lowerName.includes('randonnée') || lowerName.includes('rando') || lowerName.includes('hiking')) {
      return ['WALK', 'HIKING']
    }
    if (lowerName.includes('marche')) return ['WALK', 'HIKING']  // Défaut marche

    // 5. FUN - Courses fun
    if (lowerName.includes('color')) return ['FUN', 'COLOR_RUN']
    if (lowerName.includes('obstacle')) return ['FUN', 'OBSTACLE_RACE']
    if (lowerName.includes('spartan')) return ['FUN', 'SPARTAN_RACE']
    if (lowerName.includes('mud')) return ['FUN', 'MUD_DAY']

    // 6. OTHER - Autres sports
    if (lowerName.includes('canicross')) return ['OTHER', 'CANICROSS']
    if (lowerName.includes('orienteering') || lowerName.includes('orientation')) return ['OTHER', 'ORIENTEERING']
    if (lowerName.includes('raid') && !lowerName.includes('triathlon')) return ['OTHER', 'RAID']
    if (lowerName.includes('biathlon')) return ['OTHER', 'BIATHLON']
    if (lowerName.includes('natation') || lowerName.includes('swimming')) return ['OTHER', 'SWIMMING']
    if (lowerName.includes('vol libre') || lowerName.includes('free flight')) return ['OTHER', 'FREE_FLIGHT']
    if (lowerName.includes('yoga')) return ['OTHER', 'YOGA']

    // 7. RUNNING - Courses à pied (fallback par défaut)
    if (lowerName.includes('vertical') || lowerName.includes('vertical km')) return ['RUNNING', 'VERTICAL_KILOMETER']
    if (lowerName.includes('cross')) return ['RUNNING', 'CROSS']
    if (lowerName.includes('ekiden')) return ['RUNNING', 'EKIDEN']
    if (lowerName.includes('marathon')) {
      if (lowerName.includes('semi') || lowerName.includes('half') || lowerName.includes('1/2')) {
        return ['RUNNING', 'HALF_MARATHON']
      }
      return ['RUNNING', 'MARATHON']
    }
    if (lowerName.includes('corrida')) return ['RUNNING', undefined]

    // Classifier par distance si fournie (RUNNING)
    if (runDistance) {
      if (runDistance < 5) return ['RUNNING', 'LESS_THAN_5_KM']
      if (runDistance < 7.5) return ['RUNNING', 'KM5']
      if (runDistance < 12.5) return ['RUNNING', 'KM10']
      if (runDistance < 17.5) return ['RUNNING', 'KM15']
      if (runDistance < 30) return ['RUNNING', 'KM20']
      if (runDistance < 35) return ['RUNNING', 'HALF_MARATHON']
      if (runDistance < 50) return ['RUNNING', 'MARATHON']
      if (runDistance >= 50) return ['RUNNING', 'ULTRA_RUNNING']
    }

    // Par défaut : RUNNING
    return ['RUNNING', undefined]
  }

  /**
   * Normalise le nom d'une course pour comparaison
   * Supprime accents, met en minuscules, normalise les espaces
   */
  private normalizeRaceName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // Supprime les accents
      .replace(/\s+/g, ' ')             // Normalise les espaces multiples
      .trim()
  }

  /**
   * Calcule la date/heure de départ d'une course spécifique
   * Convertit l'heure locale (selon la ligue) en UTC en utilisant date-fns-tz
   */
  private calculateRaceStartDate(ffaData: FFACompetitionDetails, race: FFARace): Date {
    // Déterminer la date de base
    let baseDate: Date

    // Si la course a une date spécifique (format "28/02" pour événements multi-jours)
    if (race.raceDate) {
      // Parser le format "DD/MM"
      const [dayStr, monthStr] = race.raceDate.split('/')
      const raceDay = parseInt(dayStr, 10)
      const raceMonth = parseInt(monthStr, 10) - 1 // JavaScript months are 0-indexed

      // Déterminer l'année : utiliser startDate de l'événement
      const year = ffaData.startDate.getUTCFullYear()

      // Vérifier si c'est un changement d'année (décembre -> janvier)
      // Si le mois de la course est janvier (0) et que startDate est en décembre,
      // alors la course est l'année suivante
      const startMonth = ffaData.startDate.getUTCMonth()
      const adjustedYear = (raceMonth === 0 && startMonth === 11) ? year + 1 : year

      baseDate = new Date(Date.UTC(adjustedYear, raceMonth, raceDay, 0, 0, 0, 0))

      this.logger.debug(`📅 Course avec date spécifique: ${race.raceDate} -> ${baseDate.toISOString().split('T')[0]}`)
    } else {
      // Utiliser la date de début de l'événement (startDate)
      baseDate = ffaData.startDate
    }

    const year = baseDate.getUTCFullYear()
    const month = baseDate.getUTCMonth()
    const day = baseDate.getUTCDate()

    // Récupérer le timezone IANA de la ligue
    const ligue = ffaData.competition.ligue
    const timeZone = this.getTimezoneIANA(ligue)

    if (race.startTime) {
      // Parser l'heure locale (format HH:MM)
      const [hours, minutes] = race.startTime.split(':').map(Number)

      // Créer une date en heure locale (pas UTC !)
      const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`

      // Convertir en UTC en tenant compte du DST
      const utcDate = fromZonedTime(localDateStr, timeZone)

      this.logger.info(`🕐 Conversion timezone: ${localDateStr} ${timeZone} -> ${utcDate.toISOString()} (course: ${race.name})`)

      return utcDate
    }

    // Sinon, minuit heure locale (00:00 local time)
    const localMidnight = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
    const utcDate = fromZonedTime(localMidnight, timeZone)

    this.logger.info(`🕐 Minuit locale ${localMidnight} ${timeZone} -> ${utcDate.toISOString()}`)

    return utcDate
  }

  /**
   * Calcule la date de début d'une édition en utilisant la première heure réelle (non-minuit)
   * de la date chronologique la plus précoce
   * Convertit l'heure locale (selon la ligue) en UTC avec date-fns-tz
   *
   * Stratégie:
   * 1. Déterminer le premier jour chronologique (startDate ou plus ancien raceDate)
   * 2. Chercher la première heure >= 01:00 de ce jour
   * 3. Si aucune heure vraie, utiliser minuit locale
   */
  private calculateEditionStartDate(ffaData: FFACompetitionDetails): Date {
    // Timezone IANA de la ligue
    const ligue = ffaData.competition.ligue
    const timeZone = this.getTimezoneIANA(ligue)

    // 1️⃣ Déterminer la date chronologique la plus précoce
    let earliestDate = ffaData.startDate // Par défaut, date de l'événement
    let earliestDay = earliestDate.getUTCDate()
    let earliestMonth = earliestDate.getUTCMonth()
    let earliestYear = earliestDate.getUTCFullYear()

    // Vérifier si une course a une date antérieure
    for (const race of ffaData.races) {
      if (race.raceDate) {
        const [dayStr, monthStr] = race.raceDate.split('/')
        const raceDay = parseInt(dayStr, 10)
        const raceMonth = parseInt(monthStr, 10) - 1

        const raceDate = new Date(Date.UTC(earliestYear, raceMonth, raceDay))
        if (raceDate < earliestDate) {
          earliestDate = raceDate
          earliestDay = raceDay
          earliestMonth = raceMonth
        }
      }
    }

    this.logger.info(`🕒 Date chronologique la plus précoce: ${earliestDate.toISOString().split('T')[0]}`)

    // 2️⃣ Chercher la première heure RÉELLE (non 00:00) de ce jour
    let firstRealStartTime: string | undefined
    let raceWithFirstTime: string | undefined

    for (const race of ffaData.races) {
      // Vérifier si cette course est le jour le plus précoce
      let isEarliestDay = false

      if (race.raceDate) {
        const [dayStr, monthStr] = race.raceDate.split('/')
        const raceDay = parseInt(dayStr, 10)
        const raceMonth = parseInt(monthStr, 10) - 1
        isEarliestDay = (raceDay === earliestDay && raceMonth === earliestMonth)
      } else {
        // Pas de date spécifique = jour de l'événement
        isEarliestDay = (earliestDay === ffaData.startDate.getUTCDate() &&
                        earliestMonth === ffaData.startDate.getUTCMonth())
      }

      // Si cette course est du jour le plus précoce et a une heure
      if (isEarliestDay && race.startTime) {
        const [hours] = race.startTime.split(':').map(Number)
        // Exclure 00:00 (minuit) - chercher première heure >= 01:00
        if (hours !== 0) {
          firstRealStartTime = race.startTime
          raceWithFirstTime = race.name
          this.logger.info(`🕒 Première heure réelle du jour le plus précoce: ${race.startTime} (course: ${race.name})`)
          break
        }
      }
    }

    if (firstRealStartTime) {
      // Parser l'heure locale (format HH:MM)
      const [hours, minutes] = firstRealStartTime.split(':').map(Number)

      // Créer la date en heure locale (pas UTC !)
      const localDateStr = `${earliestYear}-${String(earliestMonth + 1).padStart(2, '0')}-${String(earliestDay).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`

      // Convertir en UTC en tenant compte du DST
      const startDateUTC = fromZonedTime(localDateStr, timeZone)

      this.logger.info(`🕒 Édition: première heure réelle ${localDateStr} ${timeZone} -> ${startDateUTC.toISOString()} UTC`)
      return startDateUTC
    }

    // ⚠️ Aucune course n'a d'heure vraie → minuit locale du jour le plus précoce
    const localMidnight = `${earliestYear}-${String(earliestMonth + 1).padStart(2, '0')}-${String(earliestDay).padStart(2, '0')}T00:00:00`
    const midnightLocalUTC = fromZonedTime(localMidnight, timeZone)

    this.logger.info(`🕒 Aucune heure réelle du jour le plus précoce → minuit locale ${localMidnight} ${timeZone} -> ${midnightLocalUTC.toISOString()}`)
    return midnightLocalUTC
  }

  /**
   * Calcule la date de fin d'une édition en utilisant l'heure de la dernière course
   * Si la dernière course est le même jour que la première, retourne la date de la dernière course
   * Sinon, retourne la date de fin de l'événement (endDate du FFACompetitionDetails)
   * Convertit l'heure locale (selon la ligue) en UTC avec date-fns-tz
   */
  private calculateEditionEndDate(ffaData: FFACompetitionDetails): Date {
    // S'il n'y a pas de courses, retourner startDate
    if (ffaData.races.length === 0) {
      return this.calculateEditionStartDate(ffaData)
    }

    // Récupérer la dernière course (selon raceDate ou ordre dans le tableau)
    const lastRace = ffaData.races[ffaData.races.length - 1]

    // Calculer la date de la dernière course
    return this.calculateRaceStartDate(ffaData, lastRace)
  }

  /**
   * Crée les propositions pour une compétition
   */
  private async createProposalsForCompetition(
    competition: FFACompetitionDetails,
    matchResult: MatchResult,
    config: FFAScraperConfig,
    context: AgentContext,
    proposalsCache?: Map<string, Set<string>> // FIX 1: Cache optionnel pour déduplication intra-run
  ): Promise<ProposalData[]> {
    const proposals: ProposalData[] = []

    // Calculer la confiance selon le type de proposition
    // Pour NEW_EVENT: logique inversée (pas de match = confiance haute)
    // Pour UPDATE: logique classique (bon match = confiance haute)
    const confidence = matchResult.type === 'NO_MATCH'
      ? calculateNewEventConfidence(config.confidenceBase, competition, matchResult)
      : calculateAdjustedConfidence(config.confidenceBase, competition, matchResult)

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
              startDate: this.calculateEditionStartDate(competition),
              endDate: this.calculateEditionEndDate(competition), // Date de la dernière course
              year: competition.competition.date.getFullYear().toString(),
              timeZone: this.getTimezoneIANA(competition.competition.ligue),
              calendarStatus: 'CONFIRMED',
              ...(competition.organizerName ? {
                organizer: {
                  name: competition.organizerName,
                  websiteUrl: competition.organizerWebsite,
                  facebookUrl: competition.organizerWebsite?.includes('facebook.com') ? competition.organizerWebsite : undefined,
                  instagramUrl: competition.organizerWebsite?.includes('instagram.com') ? competition.organizerWebsite : undefined,
                  email: competition.organizerEmail,
                  phone: competition.organizerPhone
                }
              } : {}),
              races: competition.races.map(race => {
                const raceStartDate = this.calculateRaceStartDate(competition, race)
                // Passer les distances pour une meilleure inférence des catégories
                const [categoryLevel1, categoryLevel2] = this.inferRaceCategories(
                  race.name,
                  race.distance ? race.distance / 1000 : undefined,  // runDistance en km
                  undefined,  // bikeDistance (pas d'infos FFA)
                  undefined,  // swimDistance
                  undefined   // walkDistance
                )

                // Normaliser le nom selon le format standard
                const normalizedName = normalizeFFARaceName(
                  race.name,
                  categoryLevel1,
                  categoryLevel2,
                  race.distance ? race.distance / 1000 : undefined
                )

                // ✅ Définir le bon champ de distance selon la catégorie
                const distanceKm = race.distance ? race.distance / 1000 : undefined
                const distanceFields: any = {}

                if (categoryLevel1 === 'WALK') {
                  distanceFields.walkDistance = distanceKm
                  distanceFields.walkPositiveElevation = race.positiveElevation
                } else if (categoryLevel1 === 'CYCLING') {
                  distanceFields.bikeDistance = distanceKm
                  distanceFields.bikePositiveElevation = race.positiveElevation
                } else {
                  // RUNNING, TRAIL, TRIATHLON, FUN, OTHER par défaut
                  distanceFields.runDistance = distanceKm
                  distanceFields.runPositiveElevation = race.positiveElevation
                }

                return {
                  name: normalizedName,  // ✅ Nom normalisé au lieu du nom brut
                  startDate: raceStartDate,
                  ...distanceFields,
                  type: race.type === 'trail' ? 'TRAIL' : 'RUNNING',
                  categoryLevel1,
                  categoryLevel2,
                  timeZone: this.getTimezoneIANA(competition.competition.ligue)
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
            matchScore: matchResult.confidence,  // Score du meilleur match trouvé (0 si aucun)
            source: competition.competition.detailUrl,
            level: competition.competition.level,
            organizerEmail: competition.organizerEmail,
            rejectedMatches: matchResult.rejectedMatches || []  // Top 3 matches rejetés
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

            // Vérifier si une proposition identique existe déjà en DB
            if (hasIdenticalPendingProposal(changes, pendingProposals)) {
              context.logger.info(`⏭️  Proposition identique déjà en attente pour édition ${matchResult.edition.id} (${matchResult.event!.name}), skip`, {
                pendingCount: pendingProposals.length,
                changesHash: require('crypto').createHash('sha256').update(JSON.stringify(changes)).digest('hex').substring(0, 8)
              })
              return proposals // Ne pas créer de nouvelle proposition
            }

            // FIX 1: Vérifier si une proposition identique a déjà été créée dans ce run
            if (proposalsCache) {
              const changeHash = require('crypto').createHash('sha256')
                .update(JSON.stringify(changes))
                .digest('hex')
              const cacheKey = matchResult.edition.id.toString()

              if (!proposalsCache.has(cacheKey)) {
                proposalsCache.set(cacheKey, new Set())
              }

              if (proposalsCache.get(cacheKey)!.has(changeHash)) {
                context.logger.info(`⏭️  Proposition identique déjà créée dans ce run pour édition ${matchResult.edition.id} (${matchResult.event!.name}), skip`, {
                  changeHash: changeHash.substring(0, 8)
                })
                return proposals
              }

              // Ajouter ce hash au cache
              proposalsCache.get(cacheKey)!.add(changeHash)
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
      context.logger.info(`🚀 Démarrage FFA Scraper Agent v${FFA_SCRAPER_AGENT_VERSION}`, {
        version: FFA_SCRAPER_AGENT_VERSION,
        liguesPerRun: config.liguesPerRun,
        monthsPerRun: config.monthsPerRun,
        levels: config.levels,
        sourceDatabase: config.sourceDatabase,
        timestamp: new Date().toISOString()
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

      // FIX 1: Cache en mémoire pour déduplication intra-run
      // Map<editionId, Set<changeHash>> pour éviter les propositions identiques dans le même run
      const proposalsCache = new Map<string, Set<string>>()

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
              context,
              proposalsCache // FIX 1: Passer le cache à la méthode
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

          // FIX 2: Sauvegarder la progression après chaque mois complété
          // Évite de refaire la dernière combinaison en cas de crash
          await this.saveProgress(progress)
          context.logger.info(`💾 Progression sauvegardée: ${ligue} - ${month}`)

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
      // FIX: Lorsqu'on traite plusieurs ligues par run (liguesPerRun > 1),
      // on doit revenir à la première ligue traitée au mois suivant
      if (lastMonthIndex + 1 < allMonths.length) {
        // Il reste des mois à traiter
        // Revenir à la PREMIÈRE ligue du run, mais au mois SUIVANT
        progress.currentMonth = allMonths[lastMonthIndex + 1]
        progress.currentLigue = ligues[0]  // FIX: Utiliser ligues[0] au lieu de lastProcessedLigue
        context.logger.info(`⏭️  Prochaine position: ${progress.currentLigue} - ${progress.currentMonth}`, {
          liguesTraitees: ligues,
          moisTraite: lastProcessedMonth,
          prochainMois: progress.currentMonth
        })
      } else {
        // Tous les mois traités pour ces ligues, passer à la ligue suivante
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

      // Mettre à jour les statistiques finales
      progress.totalCompetitionsScraped += totalCompetitions
      progress.lastCompletedAt = new Date()
      // FIX 2: Sauvegarde finale pour les statistiques (progression déjà sauvegardée après chaque mois)
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
