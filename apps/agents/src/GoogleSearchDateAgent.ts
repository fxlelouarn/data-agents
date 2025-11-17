// VERSION DE L'AGENT
export const GOOGLE_SEARCH_DATE_AGENT_VERSION = '1.1.0'

import { BaseAgent, AgentType } from '@data-agents/agent-framework'
import { IAgentStateService, AgentStateService } from '@data-agents/database'
import { prisma } from '@data-agents/database'
import { AgentContext, AgentRunResult, ProposalData } from '@data-agents/agent-framework'
import { GoogleSearchDateAgentConfigSchema } from './GoogleSearchDateAgent.configSchema'
import axios from 'axios'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// Interface pour la configuration spécifique de l'agent
interface GoogleSearchDateConfig {
  batchSize: number // Nombre d'événements à traiter par batch (défaut: 10)
  googleResultsCount: number // Nombre de résultats Google à récupérer (défaut: 5) 
  googleApiKey?: string // Clé API Google
  googleSearchEngineId?: string // ID du moteur de recherche personnalisé Google
  sourceDatabase: string // ID de la base de données source pour lire les événements
  cooldownDays: number // Nombre de jours à attendre avant de rechercher à nouveau un événement (défaut: 14)
}

// Interface pour les résultats de recherche Google
interface GoogleSearchResult {
  items?: Array<{
    title: string
    link: string
    snippet: string
    displayLink: string
  }>
}

// Interface pour les événements de la DB Next Prod
interface NextProdEvent {
  id: string
  name: string
  city: string
  currentEditionEventId: string | null
  edition?: {
    id: string
    year: string
    calendarStatus: string
    startDate: Date | null
    endDate?: Date | null                    // ✅ AJOUT
    timeZone?: string                        // ✅ AJOUT
    registrationClosingDate?: Date | null    // ✅ AJOUT
    races?: Array<{
      id: string
      name: string
      startDate: Date | null
      runDistance?: number                   // ✅ Distance course à pied (km)
      bikeDistance?: number                  // ✅ Distance vélo (km)
      walkDistance?: number                  // ✅ Distance marche (km)
      swimDistance?: number                  // ✅ Distance natation (km)
      runPositiveElevation?: number          // ✅ Dénivelé positif
      categoryLevel1?: string                // ✅ Catégorie principale
      categoryLevel2?: string                // ✅ Sous-catégorie
      timeZone?: string                      // ✅ Timezone de la course
    }>
  }
  historicalEditions?: Array<{
    id: string
    year: string
    startDate: Date
    calendarStatus: string
  }>
}

// Interface pour les dates extraites
interface ExtractedDate {
  date: Date
  confidence: number
  source: string
  context: string
}

export class GoogleSearchDateAgent extends BaseAgent {
  private sourceDb: any // Connexion à la base source
  private stateService: IAgentStateService // Service de gestion d'état
  private prisma: typeof prisma // Client Prisma pour le cache local

  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      id: config.id || 'google-search-date-agent',
      name: config.name || 'Google Search Date Agent',
      description: `Agent qui recherche les dates d'événements via Google Search et propose des mises à jour (v${GOOGLE_SEARCH_DATE_AGENT_VERSION})`,
      type: 'EXTRACTOR' as AgentType,
      frequency: config.frequency || '0 */6 * * *', // Toutes les 6 heures par défaut
      isActive: config.isActive ?? true,
      config: {
        version: GOOGLE_SEARCH_DATE_AGENT_VERSION,
        batchSize: config.config?.batchSize || 10,
        googleResultsCount: config.config?.googleResultsCount || 5,
        googleApiKey: config.config?.googleApiKey || process.env.GOOGLE_API_KEY,
        googleSearchEngineId: config.config?.googleSearchEngineId || process.env.GOOGLE_SEARCH_ENGINE_ID,
        sourceDatabase: config.config?.sourceDatabase, // ID de base de données requis
        cooldownDays: config.config?.cooldownDays || 14, // 2 semaines par défaut
        ...config.config,
        configSchema: GoogleSearchDateAgentConfigSchema // Ajouter le schéma de configuration
      }
    }

    super(agentConfig, db, logger)
    // Note: dbManager est maintenant dans BaseAgent
    this.prisma = prisma // Client Prisma pour accès au cache local
    // Créer une instance du service d'état avec le client Prisma
    this.stateService = new AgentStateService(prisma)
  }

  /**
   * Initialise la connexion à la base de données source
   * @deprecated Cette méthode utilise maintenant connectToSource() de BaseAgent
   */
  private async initializeSourceConnection(config: GoogleSearchDateConfig) {
    if (!this.sourceDb) {
      this.sourceDb = await this.connectToSource(config.sourceDatabase)
    }
    return this.sourceDb
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    const config = this.config.config as GoogleSearchDateConfig
    
    try {
      // Récupérer l'offset persistant
      const offset = await this.stateService.getState<number>(this.config.id, 'offset') || 0
      
      context.logger.info(`🚀 Démarrage Google Search Date Agent v${GOOGLE_SEARCH_DATE_AGENT_VERSION}`, {
        version: GOOGLE_SEARCH_DATE_AGENT_VERSION,
        batchSize: config.batchSize,
        googleResultsCount: config.googleResultsCount,
        offset: offset,
        sourceDatabase: config.sourceDatabase,
        timestamp: new Date().toISOString()
      })

      // S'assurer que la connexion source est initialisée
      context.logger.info('🔌 Initialisation de la connexion source...', { sourceDatabase: config.sourceDatabase })
      await this.initializeSourceConnection(config)
      context.logger.info('✅ Connexion source initialisée avec succès')

      // 1. Récupérer les événements TO_BE_CONFIRMED par batch
      context.logger.info(`📋 Récupération des événements TO_BE_CONFIRMED (batch: ${config.batchSize}, offset: ${offset})`)
      const events = await this.getToBeConfirmedEvents(config.batchSize, offset)
      
      context.logger.info(`📊 Nombre d'événements récupérés: ${events.length}`)
      
      if (events.length === 0) {
        // Fin du parcours, recommencer du début
        await this.stateService.setState(this.config.id, 'offset', 0)
        context.logger.info('🔄 Fin du parcours des événements, remise à zéro de l\'offset')
        return {
          success: true,
          message: 'Parcours complet terminé, recommence du début au prochain run'
        }
      }

      const proposals: ProposalData[] = []
      let eventsProcessed = 0
      let eventsSkipped = 0
      
      context.logger.info(`📋 Début du traitement de ${events.length} événement(s)...`)
      
      // 2. Traiter chaque événement
      for (let i = 0; i < events.length; i++) {
        const event = events[i]
        context.logger.info(`🏃 [Événement ${i + 1}/${events.length}] Traitement: ${event.name} (${event.city})`)
        
        try {
          // 3.1. Vérifier le cooldown avant de traiter
          const isInCooldown = await this.isEventInCooldown(event.id, config.cooldownDays)
          
          if (isInCooldown) {
            context.logger.info(`⏸️ Événement en cooldown (${config.cooldownDays} jours) - ignoré: ${event.name}`)
            eventsSkipped++
            continue
          }

          // 4. Effectuer la recherche Google
          const searchQuery = this.buildSearchQuery(event)
          context.logger.info(`🔍 Recherche Google: "${searchQuery}"`)
          eventsProcessed++
          
          const searchResults = await this.performGoogleSearch(searchQuery, config)

          if (!searchResults?.items?.length) {
            context.logger.warn(`⚠️ Aucun résultat Google trouvé pour: ${searchQuery}`)
            continue
          }
          
          context.logger.info(`📋 ${searchResults.items.length} résultat(s) Google obtenus`)

          // 5. Extraire les dates des snippets
          const extractedDates = await this.extractDatesFromSnippets(searchResults, event)

          if (extractedDates.length === 0) {
            context.logger.info(`Aucune date extraite pour l'événement: ${event.name}`)
            continue
          }

          // 6. Créer les propositions
          const eventProposals = await this.createDateProposals(event, extractedDates, searchResults)
          proposals.push(...eventProposals)

          context.logger.info(`${eventProposals.length} proposition(s) créée(s) pour l'événement: ${event.name}`)
          
          // 7. Marquer l'événement comme traité (même si aucune proposition)
          await this.markEventAsProcessed(event.id)

        } catch (error) {
          context.logger.error(`Erreur lors du traitement de l'événement ${event.name}:`, { error: String(error) })
          // Marquer comme traité même en cas d'erreur pour éviter de réessayer immédiatement
          await this.markEventAsProcessed(event.id)
        }
      }

      // 8. Mettre à jour l'offset pour le prochain batch
      const newOffset = offset + events.length
      await this.stateService.setState(this.config.id, 'offset', newOffset)

      // 9. Sauvegarder les propositions
      for (const proposal of proposals) {
        // Utiliser la confiance calculée de la proposition au lieu du 0.7 codé en dur
        const proposalConfidence = proposal.justification?.[0]?.metadata?.confidence || 0.7
        
        await this.createProposal(
          proposal.type,
          proposal.changes,
          proposal.justification,
          proposal.eventId,
          proposal.editionId,
          proposal.raceId,
          proposalConfidence // Utiliser la confiance calculée
        )
      }

      context.logger.info('Exécution terminée avec succès', {
        eventsRetrieved: events.length,
        eventsProcessed: eventsProcessed,
        eventsSkipped: eventsSkipped,
        proposalsCreated: proposals.length,
        cooldownDays: config.cooldownDays,
        nextOffset: newOffset
      })

      return {
        success: true,
        proposals,
        message: `${events.length} événements récupérés, ${eventsProcessed} traités, ${eventsSkipped} ignorés (cooldown), ${proposals.length} propositions créées`,
        metrics: {
          eventsRetrieved: events.length,
          eventsProcessed: eventsProcessed,
          eventsSkipped: eventsSkipped,
          proposalsCreated: proposals.length,
          cooldownDays: config.cooldownDays,
          nextOffset: newOffset
        }
      }

    } catch (error) {
      context.logger.error('Erreur lors de l\'exécution de l\'agent:', { error: String(error) })
      return {
        success: false,
        message: `Erreur: ${String(error)}`
      }
    }
  }

  private async getToBeConfirmedEvents(batchSize: number, offset: number = 0): Promise<NextProdEvent[]> {
    const config = this.config.config as GoogleSearchDateConfig
    
    try {
      this.logger.info(`🔍 Récupération des événements TO_BE_CONFIRMED...`, {
        sourceDbStatus: this.sourceDb ? 'connecté' : 'non-connecté',
        batchSize,
        offset: offset
      })
      
      // Si pas de connexion source, échouer
      if (!this.sourceDb) {
        throw new Error('Pas de connexion source - impossible de continuer')
      }
      
      this.logger.info('📊 Exécution de la requête Prisma...')
      
      // Vérifier que this.sourceDb a bien la méthode event (minuscule - modèle Prisma)
      if (!this.sourceDb || !this.sourceDb.event) {
        throw new Error('La base source ne contient pas le modèle "event" - vérifiez la configuration de la base de données')
      }
      
      // Calculer les années à traiter (année courante et suivante)
      const currentYear = new Date().getFullYear().toString()
      const nextYear = (new Date().getFullYear() + 1).toString()
      
      let events
      try {
        this.logger.info('🔍 Paramètres de la requête Prisma:', {
          skip: offset,
          take: batchSize,
          years: [currentYear, nextYear],
          filter: 'Events avec éditions TO_BE_CONFIRMED qui sont currentEdition'
        })
        
        // Étape 1: Récupérer les IDs des Events qui ont des éditions TO_BE_CONFIRMED 
        // ordonnés par la date future estimée pour un traitement déterministe
        // IMPORTANT: On filtre les éditions dont la startDate est dans le futur OU null (à confirmer)
        this.logger.info('🔍 Étape 1: Récupération des Event IDs avec éditions TO_BE_CONFIRMED (ordre: date estimée, futur uniquement)')
        const now = new Date()
        const eventIds = await this.sourceDb.$queryRaw<{id: number, estimatedDate: Date | null}[]>`
          SELECT DISTINCT e.id, 
                 ed."startDate" as "estimatedDate",
                 e."createdAt"
          FROM "Event" e 
          INNER JOIN "Edition" ed ON ed."currentEditionEventId" = e.id 
          WHERE ed."calendarStatus" = 'TO_BE_CONFIRMED'
            AND ed."status" = 'LIVE'
            AND e.status = 'LIVE'
            AND ed.year IN (${currentYear}, ${nextYear})
            AND (ed."startDate" IS NULL OR ed."startDate" >= ${now})
          ORDER BY 
            ed."startDate" ASC NULLS LAST,  -- Date estimée en premier (nulls à la fin)
            e."createdAt" ASC               -- Puis par date de création comme fallback
          LIMIT ${batchSize} OFFSET ${offset}
        `
        
        this.logger.info(`📊 Étape 1 terminée: ${eventIds.length} Event IDs récupérés`)
        
        if (eventIds.length === 0) {
          this.logger.info('Aucun Event trouvé, retour d\'un tableau vide')
          return []
        }
        
        // Étape 2: Récupérer les Events complets avec leurs éditions
        // et maintenir l'ordre déterministe de la requête principale
        this.logger.info('🔍 Étape 2: Récupération des Events complets avec éditions')
        const eventIdNumbers = eventIds.map((row: {id: number, estimatedDate: Date | null}) => row.id)
        const eventOrderMap = new Map<number, number>(eventIds.map((row: {id: number, estimatedDate: Date | null}, index: number) => [row.id, index]))
        
        const eventsFromDb = await this.sourceDb.event.findMany({
          where: {
            id: {
              in: eventIdNumbers
            }
          },
          include: {
            editions: {
              where: {
                status: 'LIVE' // Récupérer toutes les éditions pour analyser l'historique
              },
              select: {
                id: true,
                year: true,
                calendarStatus: true,
                startDate: true,
                races: {
                  select: {
                    id: true,
                    name: true,
                    startDate: true,
                    runDistance: true,           // ✅ Distance course à pied (km)
                    bikeDistance: true,          // ✅ Distance vélo (km)
                    walkDistance: true,          // ✅ Distance marche (km)
                    swimDistance: true,          // ✅ Distance natation (km)
                    runPositiveElevation: true,  // ✅ Dénivelé positif
                    categoryLevel1: true,        // ✅ Catégorie principale
                    categoryLevel2: true,        // ✅ Sous-catégorie
                    timeZone: true               // ✅ Timezone de la course
                  }
                }
              },
              orderBy: {
                year: 'desc' // Plus récentes en premier
              }
            }
          }
        })
        
        // Trier les événements selon l'ordre original (date estimée -> createdAt)
        events = eventsFromDb.sort((a: any, b: any) => {
          const orderA = eventOrderMap.get(a.id) || 999999
          const orderB = eventOrderMap.get(b.id) || 999999
          return orderA - orderB
        })
        
        this.logger.info('📋 Détails des événements Prisma bruts:', {
          totalEvents: events.length,
          eventDetails: events.map((e: any, i: number) => ({
            index: i,
            id: e.id,
            name: e.name,
            city: e.city,
            editionsCount: e.editions?.length || 0,
            editionsDetails: e.editions?.map((ed: any) => ({
              id: ed.id,
              year: ed.year,
              calendarStatus: ed.calendarStatus,
              racesCount: ed.races?.length || 0
            }))
          }))
        })
      } catch (prismaError) {
        this.logger.error('Erreur lors de l\'exécution de la requête Prisma', {
          error: String(prismaError)
        })
        throw prismaError
      }

      this.logger.info(`✅ Événements récupérés depuis la base: ${events.length}`)

      const processedEvents = events.map((event: any) => {
        // Séparer édition TO_BE_CONFIRMED et éditions historiques
        const currentYearInt = parseInt(currentYear)
        const nextYearInt = parseInt(nextYear)
        
        const currentEdition = event.editions.find((ed: any) => 
          ed.calendarStatus === 'TO_BE_CONFIRMED' && 
          (parseInt(ed.year) === currentYearInt || parseInt(ed.year) === nextYearInt)
        )
        
        const historicalEditions = event.editions
          .filter((ed: any) => 
            ed.calendarStatus === 'CONFIRMED' && // Seulement les éditions confirmées
            ed.startDate && 
            parseInt(ed.year) < currentYearInt
          )
          .map((ed: any) => ({
            id: ed.id.toString(),
            year: ed.year,
            startDate: new Date(ed.startDate),
            calendarStatus: ed.calendarStatus // Pour info/debug
          }))
          .sort((a: any, b: any) => parseInt(b.year) - parseInt(a.year)) // Plus récent en premier
        
        return {
          id: event.id.toString(),
          name: event.name,
          city: event.city,
          currentEditionEventId: currentEdition?.id?.toString() || null,
          edition: currentEdition ? {
            id: currentEdition.id.toString(),
            year: currentEdition.year,
            calendarStatus: currentEdition.calendarStatus,
            startDate: currentEdition.startDate ? new Date(currentEdition.startDate) : null,
            races: currentEdition.races?.map((race: any) => ({
              id: race.id.toString(),
              name: race.name,
              startDate: race.startDate ? new Date(race.startDate) : null,
              runDistance: race.runDistance,                     // ✅ Distance course à pied
              bikeDistance: race.bikeDistance,                   // ✅ Distance vélo
              walkDistance: race.walkDistance,                   // ✅ Distance marche
              swimDistance: race.swimDistance,                   // ✅ Distance natation
              runPositiveElevation: race.runPositiveElevation,   // ✅ Dénivelé
              categoryLevel1: race.categoryLevel1,               // ✅ Catégorie
              categoryLevel2: race.categoryLevel2,               // ✅ Sous-catégorie
              timeZone: race.timeZone                            // ✅ Timezone
            })) || []
          } : undefined,
          historicalEditions // Ajouter l'historique pour l'analyse de confiance
        }
      })
      
      this.logger.info(`🎆 Événements traités: ${processedEvents.length}`)
      return processedEvents

    } catch (error) {
      this.logger.error('Erreur lors de la récupération des événements TO_BE_CONFIRMED:', { error: String(error) })
      throw error
    }
  }


  private buildSearchQuery(event: NextProdEvent): string {
    // Format: "<Event.name> <Event.city> <Edition.year>"
    let year = event.edition?.year || new Date().getFullYear().toString()
    
    // Si l'édition a une date de début et qu'elle est déjà passée,
    // chercher l'année suivante (reconduction de l'événement)
    if (event.edition?.startDate) {
      const now = new Date()
      const editionDate = new Date(event.edition.startDate)
      
      if (editionDate < now) {
        // L'édition est passée, chercher l'année suivante
        const nextYear = parseInt(year) + 1
        year = nextYear.toString()
        this.logger.info(`📅 Édition ${event.edition.year} déjà passée (${editionDate.toLocaleDateString('fr-FR')}), recherche pour l'année ${year}`)
      }
    }
    
    return `"${event.name}" "${event.city}" ${year}`
  }

  /**
   * Vérifie si un événement est en période de cooldown (déjà traité récemment)
   */
  private async isEventInCooldown(eventId: string, cooldownDays: number): Promise<boolean> {
    try {
      const lastProcessedKey = `lastProcessed_${eventId}`
      const lastProcessedTimestamp = await this.stateService.getState<number>(this.config.id, lastProcessedKey)
      
      if (!lastProcessedTimestamp) {
        // Jamais traité, pas de cooldown
        return false
      }
      
      const lastProcessedDate = new Date(lastProcessedTimestamp)
      const now = new Date()
      const daysDiff = Math.floor((now.getTime() - lastProcessedDate.getTime()) / (1000 * 60 * 60 * 24))
      
      return daysDiff < cooldownDays
    } catch (error) {
      this.logger.warn(`Erreur lors de la vérification du cooldown pour l'événement ${eventId}:`, { error: String(error) })
      return false // En cas d'erreur, ne pas bloquer
    }
  }

  /**
   * Marque un événement comme traité (met à jour le timestamp)
   */
  private async markEventAsProcessed(eventId: string): Promise<void> {
    try {
      const lastProcessedKey = `lastProcessed_${eventId}`
      const now = Date.now()
      await this.stateService.setState(this.config.id, lastProcessedKey, now)
      this.logger.debug(`Événement ${eventId} marqué comme traité`, { timestamp: now })
    } catch (error) {
      this.logger.warn(`Erreur lors du marquage de l'événement ${eventId} comme traité:`, { error: String(error) })
    }
  }

  /**
   * Calcule la confiance basée sur le jour de la semaine, la proximité de date et l'historique
   */
  private calculateWeekdayConfidence(proposedDate: Date, event: NextProdEvent, baseConfidence: number): number {
    let adjustedConfidence = baseConfidence
    const dayOfWeek = proposedDate.getDay() // 0 = dimanche, 6 = samedi
    
    // Bonus pour le week-end (samedi = 6, dimanche = 0)
    if (dayOfWeek === 0) { // Dimanche
      adjustedConfidence += 0.1 // +10% pour dimanche
    } else if (dayOfWeek === 6) { // Samedi
      adjustedConfidence += 0.05 // +5% pour samedi
    } else {
      // Vérifier si c'est un jour férié connu
      if (this.isPublicHoliday(proposedDate)) {
        adjustedConfidence += 0.08 // +8% pour jour férié
      } else {
        adjustedConfidence -= 0.05 // -5% pour jour de semaine normal
      }
    }
    
    // Bonus basé sur la proximité avec les éditions précédentes
    if (event.historicalEditions && event.historicalEditions.length > 0) {
      const lastEdition = event.historicalEditions[0] // Plus récente
      const lastDayOfWeek = lastEdition.startDate.getDay()
      
      // Calculer la distance en jours (hors année) entre la date proposée et l'édition précédente
      const daysDiff = this.calculateDayOfYearDistance(proposedDate, lastEdition.startDate)
      
      // Bonus basé sur la proximité de date (uniquement si ≤ 14 jours)
      if (daysDiff <= 7) {
        // Très proche (même semaine) : fort bonus
        adjustedConfidence += 0.25 // +25%
        this.logger.debug(`📅 Date très proche de l'édition précédente (${daysDiff} jours) : +25% confiance`)
      } else if (daysDiff <= 14) {
        // Proche (2 semaines) : bon bonus
        adjustedConfidence += 0.20 // +20%
        this.logger.debug(`📅 Date proche de l'édition précédente (${daysDiff} jours) : +20% confiance`)
      } else if (daysDiff > 60) {
        // Très éloignée (>2 mois) : pénalité
        adjustedConfidence -= 0.15 // -15%
        this.logger.debug(`⚠️ Date éloignée de l'édition précédente (${daysDiff} jours) : -15% confiance`)
      }
      // Entre 14 et 60 jours : pas de bonus ni de pénalité
      
      // Bonus supplémentaire si même jour de la semaine
      if (dayOfWeek === lastDayOfWeek) {
        adjustedConfidence += 0.15 // +15% si même jour que l'édition précédente
      }
      
      // Vérifier la cohérence avec plusieurs éditions précédentes
      const recentEditions = event.historicalEditions.slice(0, 3) // 3 dernières
      const consistentDay = recentEditions.every(ed => ed.startDate.getDay() === dayOfWeek)
      
      if (consistentDay && recentEditions.length >= 2) {
        adjustedConfidence += 0.1 // +10% si cohérent avec plusieurs éditions
      }
      
      // Vérifier si la date est cohérente avec plusieurs éditions (distance similaire)
      if (recentEditions.length >= 2) {
        const distances = recentEditions.map(ed => this.calculateDayOfYearDistance(proposedDate, ed.startDate))
        const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length
        
        if (avgDistance <= 14) {
          adjustedConfidence += 0.15 // +15% si cohérent avec plusieurs éditions
          this.logger.debug(`✨ Date cohérente avec ${recentEditions.length} éditions (avg: ${Math.round(avgDistance)} jours) : +15% confiance`)
        }
      }
    }
    
    // S'assurer que la confiance reste dans [0, 1]
    return Math.min(Math.max(adjustedConfidence, 0), 1)
  }
  
  /**
   * Calcule la distance en jours entre deux dates (hors année)
   * Ex: 28 septembre vs 1 octobre = 3 jours
   */
  private calculateDayOfYearDistance(date1: Date, date2: Date): number {
    // Normaliser les deux dates à la même année pour comparer uniquement jour/mois
    const normalized1 = new Date(2000, date1.getMonth(), date1.getDate())
    const normalized2 = new Date(2000, date2.getMonth(), date2.getDate())
    
    // Différence en millisecondes
    const diffMs = Math.abs(normalized1.getTime() - normalized2.getTime())
    
    // Convertir en jours
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    // Gérer le cas où la différence traverse le nouvel an (ex: 28 déc vs 5 jan)
    // Dans ce cas, calculer aussi la distance "dans l'autre sens" et prendre le minimum
    const daysInYear = 365
    const alternativeDiff = daysInYear - diffDays
    
    return Math.min(diffDays, alternativeDiff)
  }

  /**
   * Compare deux dates dans une timezone donnée (ignore l'heure)
   */
  private isSameDateInTimezone(date1: Date | null, date2: Date, timezone: string): boolean {
    if (!date1) return false
    
    // Formatter les deux dates dans la timezone donnée (format ISO YYYY-MM-DD)
    const formatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    
    const date1Str = formatter.format(date1) // "2025-02-01"
    const date2Str = formatter.format(date2) // "2025-02-01"
    
    return date1Str === date2Str
  }

  /**
   * Formate une date dans un timezone donné (format français: "29/11/2025")
   */
  private formatDateInTimezone(date: Date, timezone: string): string {
    const zonedDate = toZonedTime(date, timezone)
    return format(zonedDate, 'dd/MM/yyyy', { locale: fr })
  }

  /**
   * Vérifie si une date correspond à un jour férié français connu
   */
  private isPublicHoliday(date: Date): boolean {
    const month = date.getMonth() + 1 // 1-12
    const day = date.getDate()
    const year = date.getFullYear()
    
    // Jours fériés fixes
    const fixedHolidays = [
      { month: 1, day: 1 },   // Nouvel An
      { month: 5, day: 1 },   // Fête du Travail
      { month: 5, day: 8 },   // Victoire 1945
      { month: 7, day: 14 },  // Fête Nationale
      { month: 8, day: 15 },  // Assomption
      { month: 11, day: 1 },  // Toussaint
      { month: 11, day: 11 }, // Armistice
      { month: 12, day: 25 }  // Noël
    ]
    
    return fixedHolidays.some(holiday => 
      holiday.month === month && holiday.day === day
    )
    
    // Note: On pourrait ajouter Pâques, Ascension, Pentecôte (dates variables)
    // mais c'est plus complexe à calculer
  }

  private async performGoogleSearch(query: string, config: GoogleSearchDateConfig): Promise<GoogleSearchResult | null> {
    try {
      const { googleApiKey, googleSearchEngineId, googleResultsCount } = config
      
      // Support legacy config field name (searchEngineId without "google" prefix)
      const searchEngineId = googleSearchEngineId || (config as any).searchEngineId

      if (!googleApiKey || !searchEngineId) {
        this.logger.error('Clés API Google manquantes - impossible de continuer', {
          hasApiKey: !!googleApiKey,
          hasSearchEngineId: !!searchEngineId,
          configKeys: Object.keys(config)
        })
        throw new Error('Clés API Google manquantes (googleApiKey et googleSearchEngineId requis)')
      }

      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: googleApiKey,
          cx: searchEngineId,
          q: query,
          num: Math.min(googleResultsCount, 10), // Max 10 résultats par requête Google
          dateRestrict: 'y1' // Limiter aux résultats de l'année écoulée
        }
      })

      return response.data
    } catch (error) {
      this.logger.error('Erreur lors de la recherche Google:', { query, error: String(error) })
      return null
    }
  }


  private async extractDatesFromSnippets(searchResults: GoogleSearchResult, event: NextProdEvent): Promise<ExtractedDate[]> {
    const dates: ExtractedDate[] = []
    const currentYear = new Date().getFullYear()
    const nextYear = currentYear + 1

    if (!searchResults.items) return dates

    for (const item of searchResults.items) {
      // Analyser à la fois le titre ET le snippet (le titre contient souvent la date)
      const textToAnalyze = `${item.title} ${item.snippet}`.toLowerCase()
      const context = `${item.title} - ${item.snippet}`

      // Patterns de dates en français
      const datePatterns = [
        // "le 15 juin 2024", "le dimanche 16 juin 2024"
        /(?:le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi,
        // "04 janvier" (sans année - assume l'année de l'édition)
        /(?:le )?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche )?(?:(?:le )|(?:du ))?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)(?![\d\s]*\d{4})/gi,
        // "15/06/2024", "15-06-2024"
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g,
        // "juin 2024", "en juin 2024"
        /(?:en\s+)?(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi,
        // "2024-06-15" (format ISO)
        /(\d{4})-(\d{1,2})-(\d{1,2})/g
      ]

      const monthNames = {
        'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
        'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12
      }

      for (const pattern of datePatterns) {
        let match
        while ((match = pattern.exec(textToAnalyze)) !== null) {
          try {
            let date: Date
            let confidence = 0.6

            if (pattern.source.includes('janvier|') && pattern.source.includes('\\d{4}')) {
              // Pattern avec nom de mois français et année explicite
              const day = parseInt(match[1])
              const monthName = match[2].toLowerCase()
              const year = parseInt(match[3])
              const month = monthNames[monthName as keyof typeof monthNames]
              
              if (month && year >= currentYear && year <= nextYear + 1) {
                // ✅ Créer date en heure locale française (minuit) puis convertir en UTC
                const timezone = event.edition?.timeZone || 'Europe/Paris'
                const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
                date = fromZonedTime(localDateStr, timezone)
                confidence = 0.8 // Haute confiance pour les dates explicites
              } else continue
              
            } else if (pattern.source.includes('janvier|') && pattern.source.includes('(?![')) {
              // Pattern "04 janvier" sans année - utiliser l'année de l'édition
              const day = parseInt(match[1])
              const monthName = match[2].toLowerCase()
              const month = monthNames[monthName as keyof typeof monthNames]
              
              if (month) {
                // Utiliser l'année de l'édition ou l'année suivante
                const editionYear = event.edition?.year ? parseInt(event.edition.year) : nextYear
                // ✅ Créer date en heure locale française (minuit) puis convertir en UTC
                const timezone = event.edition?.timeZone || 'Europe/Paris'
                const localDateStr = `${editionYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
                date = fromZonedTime(localDateStr, timezone)
                confidence = 0.75 // Confiance légèrement inférieure car année inferred
              } else continue

            } else if (pattern.source.includes('\\/\\-')) {
              // Pattern DD/MM/YYYY ou DD-MM-YYYY
              const day = parseInt(match[1])
              const month = parseInt(match[2])
              const year = parseInt(match[3])
              
              if (year >= currentYear && year <= nextYear + 1 && month >= 1 && month <= 12) {
                // ✅ Créer date en heure locale française (minuit) puis convertir en UTC
                const timezone = event.edition?.timeZone || 'Europe/Paris'
                const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
                date = fromZonedTime(localDateStr, timezone)
                confidence = 0.7
              } else continue

            } else if (pattern.source.includes('(\d{4})-')) {
              // Pattern YYYY-MM-DD
              const year = parseInt(match[1])
              const month = parseInt(match[2])
              const day = parseInt(match[3])
              
              if (year >= currentYear && year <= nextYear + 1 && month >= 1 && month <= 12) {
                // ✅ Créer date en heure locale française (minuit) puis convertir en UTC
                const timezone = event.edition?.timeZone || 'Europe/Paris'
                const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
                date = fromZonedTime(localDateStr, timezone)
                confidence = 0.8
              } else continue

            } else {
              // Pattern mois seul
              const monthName = match[1].toLowerCase()
              const year = parseInt(match[2])
              const month = monthNames[monthName as keyof typeof monthNames]
              
              if (month && year >= currentYear && year <= nextYear + 1) {
                // ✅ Créer date en heure locale française (minuit du 1er) puis convertir en UTC
                const timezone = event.edition?.timeZone || 'Europe/Paris'
                const localDateStr = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
                date = fromZonedTime(localDateStr, timezone)
                confidence = 0.5 // Confiance plus faible pour mois seul
              } else continue
            }

            // Vérifier que la date est valide et dans une plage raisonnable
            if (date && !isNaN(date.getTime())) {
              const now = new Date()
              const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1) // Début année précédente
              const twoYearsFromNow = new Date(now.getFullYear() + 2, 11, 31)
              
              // Accepter les dates de l'année précédente jusqu'à +2 ans
              if (date >= oneYearAgo && date <= twoYearsFromNow) {
                // Ajuster la confiance si la date est passée (probablement édition précédente)
                let adjustedConfidence = confidence
                if (date < now) {
                  // Réduire la confiance pour les dates passées
                  adjustedConfidence = confidence * 0.5
                  this.logger.debug(`Date passée détectée: ${date.toLocaleDateString('fr-FR')} - confiance réduite à ${adjustedConfidence}`)
                }
                
                dates.push({
                  date,
                  confidence: adjustedConfidence,
                  source: item.link,
                  context: match[0] + ` (extrait de: "${context}")`
                })
              }
            }
          } catch (error) {
            // Ignorer les erreurs de parsing de dates individuelles
          }
        }
      }
    }

    // Supprimer les doublons et trier par confiance
    const uniqueDates = dates.filter((date, index, self) => 
      index === self.findIndex(d => d.date.getTime() === date.date.getTime())
    ).sort((a, b) => b.confidence - a.confidence)

    return uniqueDates.slice(0, 5) // Garder les 5 meilleures dates
  }

  private async createDateProposals(
    event: NextProdEvent, 
    extractedDates: ExtractedDate[], 
    searchResults: GoogleSearchResult
  ): Promise<ProposalData[]> {
    const proposals: ProposalData[] = []

    if (!event.edition || extractedDates.length === 0) return proposals

    // Grouper les dates extraites par date pour créer une proposition consolidée
    const dateGroups = new Map<string, ExtractedDate[]>()
    
    // Regrouper les dates identiques (même jour)
    for (const extractedDate of extractedDates) {
      const dateKey = extractedDate.date.toDateString()
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, [])
      }
      dateGroups.get(dateKey)!.push(extractedDate)
    }

    // Créer une seule proposition par date trouvée avec toutes les sources
    for (const [dateKey, datesGroup] of dateGroups.entries()) {
      const primaryDate = datesGroup[0] // Date principale (meilleure confiance)
      const allSources = datesGroup.map(d => ({ source: d.source, snippet: d.context }))
      
      // Calculer la confiance moyenne des sources
      const avgConfidence = datesGroup.reduce((sum, d) => sum + d.confidence, 0) / datesGroup.length
      
      // Améliorer la confiance basée sur le jour de la semaine et l'historique
      const enhancedConfidence = this.calculateWeekdayConfidence(primaryDate.date, event, avgConfidence)
      
      // ✅ Déclarer le timezone de l'édition ici pour l'utiliser dans la justification
      const editionTimezone = event.edition.timeZone || 'Europe/Paris'
      
      // Créer une justification consolidée avec toutes les sources
      // ✅ Utiliser le timezone de l'édition pour formatter correctement la date
      const consolidatedJustification = {
        type: 'text' as const,
        content: `Date proposée: ${this.formatDateInTimezone(primaryDate.date, editionTimezone)} (${datesGroup.length} source(s))`,
        metadata: {
          source: primaryDate.source, // ✅ URL de la première source pour affichage du bouton
          extractedDate: primaryDate.date.toISOString(),
          confidence: enhancedConfidence,
          baseConfidence: avgConfidence, // Confiance originale pour référence
          weekdayBonus: enhancedConfidence - avgConfidence, // Bonus appliqué
          dayOfWeek: primaryDate.date.toLocaleDateString('fr-FR', { weekday: 'long' }),
          eventName: event.name,
          eventCity: event.city,
          editionYear: event.edition.year,
          sourcesCount: datesGroup.length,
          historicalEditionsCount: event.historicalEditions?.length || 0,
          dateDetails: {
            date: this.formatDateInTimezone(primaryDate.date, editionTimezone), // ✅ Formatter avec timezone
            confidence: enhancedConfidence, // Format décimal uniforme [0,1]
            confidencePercent: Math.round(enhancedConfidence * 100), // Pourcentage pour affichage
            sources: allSources
          }
        }
      }

      // Vérifier si la date proposée est différente de la date actuelle de l'édition
      const currentStartDate = event.edition.startDate
      const proposedDate = primaryDate.date
      // editionTimezone déjà déclaré ci-dessus
      
      // Ne créer une proposition que si la date est réellement différente
      // Comparer dans la timezone de l'édition pour gérer correctement les DOM-TOM
      const isSameDate = this.isSameDateInTimezone(
        currentStartDate,
        proposedDate,
        editionTimezone
      )
      
      if (isSameDate) {
        // Date identique à l'existant, pas de proposition à créer
        this.logger.debug(`⏭️  Date identique ignorée (${editionTimezone}): ${proposedDate.toLocaleDateString('fr-FR')} (événement: ${event.name})`)
        continue
      }
      
      // Créer une seule proposition EDITION_UPDATE qui inclut les courses
      const changes: any = {
        startDate: {
          old: currentStartDate, // Valeur actuelle (peut être null)
          new: proposedDate,
          confidence: enhancedConfidence // Utiliser la confiance améliorée
        },
        endDate: {
          old: event.edition.startDate, // Même valeur que startDate actuelle
          new: proposedDate, // endDate = startDate pour événements d'un jour
          confidence: enhancedConfidence
        },
        calendarStatus: {
          old: event.edition.calendarStatus,
          new: 'CONFIRMED',
          confidence: enhancedConfidence
        }
      }

      // Si il y a des courses, les mettre à jour avec la date de l'édition
      // ✅ Utiliser la structure racesToUpdate pour cohérence avec FFA Scraper
      // ✅ Par défaut, utiliser la date proposée (celle avec la confiance la plus élevée)
      if (event.edition.races && event.edition.races.length > 0) {
        const racesToUpdate = []
        
        for (const race of event.edition.races) {
          // Vérifier si la race a déjà cette date pour éviter les doublons
          // Utiliser la timezone de la course si disponible, sinon celle de l'édition
          const currentRaceStartDate = race.startDate
          const raceTimezone = race.timeZone || editionTimezone
          const isRaceDateSame = this.isSameDateInTimezone(
            currentRaceStartDate,
            proposedDate,
            raceTimezone
          )
          
          if (!isRaceDateSame) {
            // ✅ Structure compatible avec applyEditionUpdate : racesToUpdate.updates.field
            // La date proposée est celle avec la confiance la plus élevée (primaryDate)
            // qui est aussi la date sélectionnée par défaut pour l'édition dans le frontend
            racesToUpdate.push({
              raceId: race.id,
              raceName: race.name,
              updates: {
                startDate: {
                  old: currentRaceStartDate,
                  new: proposedDate, // Date avec confiance max = date de l'édition sélectionnée
                  confidence: enhancedConfidence // Même confiance que l'édition
                }
              },
              // ✅ Ajouter toutes les données actuelles de la course (comme FFA Scraper)
              currentData: {
                name: race.name,
                startDate: currentRaceStartDate,
                runDistance: race.runDistance,
                bikeDistance: race.bikeDistance,
                walkDistance: race.walkDistance,
                swimDistance: race.swimDistance,
                runPositiveElevation: race.runPositiveElevation,
                categoryLevel1: race.categoryLevel1,
                categoryLevel2: race.categoryLevel2,
                timeZone: race.timeZone
              }
            })
          }
        }
        
        // Utiliser racesToUpdate (pas races) pour cohérence avec FFA
        if (racesToUpdate.length > 0) {
          changes.racesToUpdate = {
            old: null,
            new: racesToUpdate,
            confidence: enhancedConfidence * 0.95
          }
        }
      }

      proposals.push({
        type: 'EDITION_UPDATE' as any,
        eventId: event.id,
        editionId: event.edition.id,
        changes,
        justification: [consolidatedJustification]
      })
    }

    return proposals
  }

  async validate(): Promise<boolean> {
    // Validation de base + spécifique à Google Search
    const baseValid = await super.validate()
    if (!baseValid) return false

    const config = this.config.config as GoogleSearchDateConfig
    
    // Vérifier les paramètres requis
    if (!config.batchSize || config.batchSize <= 0) {
      this.logger.error('batchSize doit être un nombre positif')
      return false
    }

    if (!config.googleResultsCount || config.googleResultsCount <= 0) {
      this.logger.error('googleResultsCount doit être un nombre positif')
      return false
    }

    // Vérifier la connexion à la base source
    try {
      const sourceDbId = config.sourceDatabase
      const available = await this.dbManager.getAvailableDatabases()
      
      if (!available.find(db => db.id === sourceDbId)) {
        this.logger.error(`Base de données source non disponible: ${sourceDbId}`)
        return false
      }
      
      // Test de connexion
      const testResult = await this.dbManager.testConnection(sourceDbId)
      if (!testResult) {
        this.logger.error(`Test de connexion échoué pour: ${sourceDbId}`)
        return false
      }
      
    } catch (error) {
      this.logger.error('Impossible de se connecter à la base Next Prod', { error: String(error) })
      return false
    }

    this.logger.info('Validation réussie pour GoogleSearchDateAgent')
    return true
  }

}
