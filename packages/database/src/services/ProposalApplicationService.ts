import { PrismaClient } from '@prisma/client'
import { IProposalApplicationService, ProposalApplicationResult, ApplyOptions } from './interfaces'
import { DatabaseManager } from '@data-agents/agent-framework'
import { prisma } from '../prisma'

export class ProposalApplicationService implements IProposalApplicationService {
  private dbManager: DatabaseManager
  
  constructor(private prisma: PrismaClient) {
    // Utiliser un logger simple pour le DatabaseManager
    const logger = {
      info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ''),
      warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
      debug: (msg: string, data?: any) => console.debug(`[DEBUG] ${msg}`, data || '')
    }
    this.dbManager = DatabaseManager.getInstance(logger)
  }

  /**
   * Résoudre l'ID d'une édition (supporte les IDs numériques et les IDs cache)
   */
  private async resolveEditionId(editionId: string): Promise<string | null> {
    console.log(`[DEBUG] Tentative de résolution d'ID édition: ${editionId}`)
    
    // Si l'ID commence par "edition-", c'est déjà un ID cache
    if (editionId.startsWith('edition-')) {
      const exists = await this.prisma.editionCache.findUnique({ where: { id: editionId } })
      console.log(`[DEBUG] Recherche ID cache direct: ${exists ? 'trouvé' : 'non trouvé'}`)
      return exists ? editionId : null
    }
    
    // Si c'est un ID numérique, chercher dans le cache par ID Miles Republic
    if (/^\d+$/.test(editionId)) {
      console.log(`[DEBUG] ID numérique détecté, recherche dans cache...`)
      
      // D'abord, lister quelques éditions pour debug
      const sampleEditions = await this.prisma.editionCache.findMany({ take: 5 })
      console.log(`[DEBUG] Échantillon d'éditions dans le cache:`, sampleEditions.map(e => e.id))
      
      // Essayer de trouver une édition cache qui correspond à cet ID numérique
      const cacheEdition = await this.prisma.editionCache.findFirst({
        where: {
          OR: [
            { id: { contains: editionId } }, // ID contient le numéro
            { id: { endsWith: `-${editionId}` } } // ID se termine par le numéro
          ]
        }
      })
      console.log(`[DEBUG] Recherche par motifs: ${cacheEdition ? `trouvé ${cacheEdition.id}` : 'non trouvé'}`)
      
      // Si pas trouvé, essayer une recherche plus large
      if (!cacheEdition) {
        const allEditions = await this.prisma.editionCache.findMany()
        console.log(`[DEBUG] Total éditions dans le cache: ${allEditions.length}`)
        const matching = allEditions.filter(e => e.id.includes(editionId))
        console.log(`[DEBUG] Éditions contenant '${editionId}':`, matching.map(e => e.id))
      }
      
      return cacheEdition?.id || null
    }
    
    // Sinon, essayer tel quel
    const exists = await this.prisma.editionCache.findUnique({ where: { id: editionId } })
    console.log(`[DEBUG] Recherche directe: ${exists ? 'trouvé' : 'non trouvé'}`)
    return exists ? editionId : null
  }

  /**
   * Résoudre l'ID d'un événement (supporte les IDs numériques et les IDs cache)
   */
  private async resolveEventId(eventId: string): Promise<string | null> {
    if (eventId.startsWith('event-')) {
      const exists = await this.prisma.eventCache.findUnique({ where: { id: eventId } })
      return exists ? eventId : null
    }
    
    if (/^\d+$/.test(eventId)) {
      const cacheEvent = await this.prisma.eventCache.findFirst({
        where: {
          OR: [
            { id: { contains: eventId } },
            { id: { endsWith: `-${eventId}` } }
          ]
        }
      })
      return cacheEvent?.id || null
    }
    
    const exists = await this.prisma.eventCache.findUnique({ where: { id: eventId } })
    return exists ? eventId : null
  }

  /**
   * Résoudre l'ID d'une course (supporte les IDs numériques et les IDs cache)
   */
  private async resolveRaceId(raceId: string): Promise<string | null> {
    if (raceId.includes('event-') || raceId.includes('edition-')) {
      const exists = await this.prisma.raceCache.findUnique({ where: { id: raceId } })
      return exists ? raceId : null
    }
    
    if (/^\d+$/.test(raceId)) {
      const cacheRace = await this.prisma.raceCache.findFirst({
        where: {
          OR: [
            { id: { contains: raceId } },
            { id: { endsWith: `-${raceId}` } }
          ]
        }
      })
      return cacheRace?.id || null
    }
    
    const exists = await this.prisma.raceCache.findUnique({ where: { id: raceId } })
    return exists ? raceId : null
  }

  /**
   * Trouver la connexion Miles Republic par défaut ou par ID
   */
  private async getMilesRepublicConnection(databaseId?: string): Promise<any> {
    if (databaseId) {
      return await this.dbManager.getConnection(databaseId)
    }
    
    // Chercher une connexion MILES_REPUBLIC par défaut
    const availableDbs = await this.dbManager.getAvailableDatabases()
    const milesDb = availableDbs.find(db => db.type === 'medusa' || db.name.toLowerCase().includes('miles'))
    
    if (!milesDb) {
      throw new Error('Aucune connexion Miles Republic trouvée')
    }
    
    return await this.dbManager.getConnection(milesDb.id)
  }

  /**
   * Synchroniser un événement avec Miles Republic
   */
  private async syncEventToMilesRepublic(eventId: string, eventData: any, milesDb: any): Promise<void> {
    try {
      // Mapper les données du cache vers le format Miles Republic
      const milesEventData = {
        name: eventData.name,
        city: eventData.city,
        country: eventData.country,
        countrySubdivisionNameLevel1: eventData.countrySubdivisionNameLevel1,
        countrySubdivisionNameLevel2: eventData.countrySubdivisionNameLevel2,
        websiteUrl: eventData.websiteUrl,
        facebookUrl: eventData.facebookUrl,
        instagramUrl: eventData.instagramUrl,
        twitterUrl: eventData.twitterUrl,
        fullAddress: eventData.fullAddress,
        latitude: eventData.latitude,
        longitude: eventData.longitude,
        coverImage: eventData.coverImage,
        isFeatured: eventData.isFeatured,
        isPrivate: eventData.isPrivate,
        isRecommended: eventData.isRecommended,
        status: 'DRAFT',
        createdBy: 'data-agents',
        updatedBy: 'data-agents'
      }

      // Upsert dans Miles Republic
      await milesDb.event.upsert({
        where: { id: parseInt(eventId.replace('event-', '')) },
        update: milesEventData,
        create: {
          ...milesEventData,
          id: parseInt(eventId.replace('event-', ''))
        }
      })
    } catch (error) {
      throw new Error(`Erreur sync événement: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Synchroniser une édition avec Miles Republic
   */
  private async syncEditionToMilesRepublic(editionId: string, editionData: any, milesDb: any): Promise<void> {
    try {
      const milesEditionData = {
        year: editionData.year,
        startDate: editionData.startDate,
        endDate: editionData.endDate,
        registrationOpeningDate: editionData.registrationOpeningDate,
        registrationClosingDate: editionData.registrationClosingDate,
        registrantsNumber: editionData.registrantsNumber,
        currency: editionData.currency,
        medusaVersion: editionData.medusaVersion === 'V1' ? 'V1' : 'V2',
        federationId: editionData.federationId,
        timeZone: editionData.timeZone,
        calendarStatus: editionData.calendarStatus,
        clientStatus: editionData.clientStatus,
        status: 'DRAFT',
        createdBy: 'data-agents',
        updatedBy: 'data-agents',
        eventId: parseInt(editionData.eventId.replace('event-', ''))
      }

      await milesDb.edition.upsert({
        where: { id: parseInt(editionId.replace('edition-', '')) },
        update: milesEditionData,
        create: {
          ...milesEditionData,
          id: parseInt(editionId.replace('edition-', ''))
        }
      })
    } catch (error) {
      throw new Error(`Erreur sync édition: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Synchroniser une course avec Miles Republic
   */
  private async syncRaceToMilesRepublic(raceId: string, raceData: any, milesDb: any): Promise<void> {
    try {
      const milesRaceData = {
        name: raceData.name,
        startDate: raceData.startDate,
        price: raceData.price,
        runDistance: raceData.runDistance,
        runDistance2: raceData.runDistance2,
        bikeDistance: raceData.bikeDistance,
        swimDistance: raceData.swimDistance,
        walkDistance: raceData.walkDistance,
        bikeRunDistance: raceData.bikeRunDistance,
        swimRunDistance: raceData.swimRunDistance,
        runPositiveElevation: raceData.runPositiveElevation,
        runNegativeElevation: raceData.runNegativeElevation,
        bikePositiveElevation: raceData.bikePositiveElevation,
        bikeNegativeElevation: raceData.bikeNegativeElevation,
        walkPositiveElevation: raceData.walkPositiveElevation,
        walkNegativeElevation: raceData.walkNegativeElevation,
        categoryLevel1: raceData.categoryLevel1,
        categoryLevel2: raceData.categoryLevel2,
        distanceCategory: raceData.distanceCategory,
        registrationOpeningDate: raceData.registrationOpeningDate,
        registrationClosingDate: raceData.registrationClosingDate,
        federationId: raceData.federationId,
        isActive: raceData.isActive !== false,
        isArchived: raceData.isArchived || false,
        createdBy: 'data-agents',
        updatedBy: 'data-agents',
        editionId: parseInt(raceData.editionId.replace('edition-', '')),
        eventId: parseInt(raceData.eventId?.replace('event-', '') || '0')
      }

      await milesDb.race.upsert({
        where: { id: parseInt(raceId.replace('race-', '')) },
        update: milesRaceData,
        create: {
          ...milesRaceData,
          id: parseInt(raceId.replace('race-', ''))
        }
      })
    } catch (error) {
      throw new Error(`Erreur sync course: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  async applyProposal(proposalId: string, selectedChanges: Record<string, any>, options: ApplyOptions = {}): Promise<ProposalApplicationResult> {
    // Récupérer la proposition
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { agent: true }
    })

    if (!proposal) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'proposal',
          message: 'Proposition non trouvée',
          severity: 'error'
        }]
      }
    }

    if (proposal.status !== 'APPROVED' && !options.force) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'status',
          message: 'La proposition doit être approuvée pour être appliquée (utilisez force: true pour outrepasser)',
          severity: 'error'
        }]
      }
    }

    try {
      // Si dryRun, retourner sans appliquer
      if (options.dryRun) {
        return {
          success: true,
          appliedChanges: selectedChanges,
          dryRun: true
        }
      }

      // Appliquer selon le type de proposition
      switch (proposal.type) {
        case 'NEW_EVENT':
          return await this.applyNewEvent(proposal.changes, selectedChanges, options)
        
        case 'EVENT_UPDATE':
          if (!proposal.eventId) {
            throw new Error('EventId manquant pour EVENT_UPDATE')
          }
          return await this.applyEventUpdate(proposal.eventId, proposal.changes, selectedChanges, options)
        
        case 'EDITION_UPDATE':
          if (!proposal.editionId) {
            throw new Error('EditionId manquant pour EDITION_UPDATE')
          }
          return await this.applyEditionUpdate(proposal.editionId, proposal.changes, selectedChanges, options)
        
        case 'RACE_UPDATE':
          if (!proposal.raceId) {
            throw new Error('RaceId manquant pour RACE_UPDATE')
          }
          return await this.applyRaceUpdate(proposal.raceId, proposal.changes, selectedChanges, options)
        
        default:
          return {
            success: false,
            appliedChanges: {},
            errors: [{
              field: 'type',
              message: `Type de proposition non supporté: ${proposal.type}`,
              severity: 'error'
            }]
          }
      }
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'application',
          message: `Erreur lors de l'application: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          severity: 'error'
        }]
      }
    }
  }

  async applyNewEvent(changes: any, selectedChanges: Record<string, any>, options: ApplyOptions = {}): Promise<ProposalApplicationResult> {
    const transaction = await this.prisma.$transaction(async (tx) => {
      // Extraire les données de l'événement des changements sélectionnés
      const eventData = this.extractEventData(selectedChanges)
      const editionsData = this.extractEditionsData(selectedChanges)
      const racesData = this.extractRacesData(selectedChanges)

      // Générer un ID pour l'événement
      const eventId = this.generateEventId(eventData.name, eventData.city)

      // Créer l'événement
      const event = await tx.eventCache.create({
        data: {
          id: eventId,
          name: eventData.name,
          city: eventData.city,
          country: eventData.country || 'FR',
          countrySubdivisionNameLevel1: eventData.countrySubdivisionNameLevel1 || '',
          countrySubdivisionNameLevel2: eventData.countrySubdivisionNameLevel2 || '',
          websiteUrl: eventData.websiteUrl,
          facebookUrl: eventData.facebookUrl,
          instagramUrl: eventData.instagramUrl,
          twitterUrl: eventData.twitterUrl,
          fullAddress: eventData.fullAddress,
          latitude: eventData.latitude,
          longitude: eventData.longitude,
          coverImage: eventData.coverImage,
          isPrivate: eventData.isPrivate || false,
          isFeatured: eventData.isFeatured || false,
          isRecommended: eventData.isRecommended || false,
          lastSyncAt: new Date()
        }
      })

      const createdEditionIds: string[] = []
      const createdRaceIds: string[] = []

      // Créer les éditions associées
      for (const editionData of editionsData) {
        const editionId = this.generateEditionId(eventId, editionData.year)
        
        const edition = await tx.editionCache.create({
          data: {
            id: editionId,
            eventId: eventId,
            year: editionData.year,
            calendarStatus: editionData.calendarStatus || 'TO_BE_CONFIRMED',
            clientStatus: editionData.clientStatus,
            currency: editionData.currency || 'EUR',
            customerType: editionData.customerType,
            medusaVersion: editionData.medusaVersion || 'V1',
            startDate: editionData.startDate,
            endDate: editionData.endDate,
            registrationOpeningDate: editionData.registrationOpeningDate,
            registrationClosingDate: editionData.registrationClosingDate,
            registrantsNumber: editionData.registrantsNumber,
            federationId: editionData.federationId,
            dataSource: editionData.dataSource,
            timeZone: editionData.timeZone || 'Europe/Paris',
            lastSyncAt: new Date()
          }
        })

        createdEditionIds.push(edition.id)

        // Créer les courses associées à cette édition
        const editionRaces = racesData.filter(race => race.editionYear === editionData.year)
        for (const raceData of editionRaces) {
          const raceId = this.generateRaceId(editionId, raceData.name)
          
          const race = await tx.raceCache.create({
            data: {
              id: raceId,
              editionId: editionId,
              name: raceData.name,
              startDate: raceData.startDate,
              price: raceData.price,
              runDistance: raceData.runDistance || 0,
              runDistance2: raceData.runDistance2 || 0,
              bikeDistance: raceData.bikeDistance || 0,
              swimDistance: raceData.swimDistance || 0,
              walkDistance: raceData.walkDistance || 0,
              bikeRunDistance: raceData.bikeRunDistance || 0,
              swimRunDistance: raceData.swimRunDistance || 0,
              runPositiveElevation: raceData.runPositiveElevation,
              runNegativeElevation: raceData.runNegativeElevation,
              bikePositiveElevation: raceData.bikePositiveElevation,
              bikeNegativeElevation: raceData.bikeNegativeElevation,
              walkPositiveElevation: raceData.walkPositiveElevation,
              walkNegativeElevation: raceData.walkNegativeElevation,
              categoryLevel1: raceData.categoryLevel1,
              categoryLevel2: raceData.categoryLevel2,
              distanceCategory: raceData.distanceCategory,
              registrationOpeningDate: raceData.registrationOpeningDate,
              registrationClosingDate: raceData.registrationClosingDate,
              federationId: raceData.federationId,
              dataSource: raceData.dataSource,
              timeZone: raceData.timeZone,
              isActive: raceData.isActive !== false,
              lastSyncAt: new Date()
            }
          })

          createdRaceIds.push(race.id)
        }
      }

      return {
        success: true,
        appliedChanges: selectedChanges,
        createdIds: {
          eventId: eventId,
          editionId: createdEditionIds[0], // Premier ID d'édition créé
          raceIds: createdRaceIds
        },
        eventData,
        editionsData,
        racesData
      }
    })

    // Par défaut, synchroniser avec Miles Republic (sauf si explicitement désactivé)
    const shouldSyncToDatabase = options.applyToDatabase !== false
    if (shouldSyncToDatabase && transaction.success) {
      try {
        const milesDb = await this.getMilesRepublicConnection(options.milesRepublicDatabaseId)
        
        // Synchroniser l'événement
        await this.syncEventToMilesRepublic(transaction.createdIds.eventId, transaction.eventData, milesDb)
        
        // Synchroniser les éditions
        for (let i = 0; i < transaction.editionsData.length; i++) {
          const editionData = { ...transaction.editionsData[i], eventId: transaction.createdIds.eventId }
          const editionId = this.generateEditionId(transaction.createdIds.eventId, editionData.year)
          await this.syncEditionToMilesRepublic(editionId, editionData, milesDb)
        }
        
        // Synchroniser les courses
        const raceIds = transaction.createdIds.raceIds
        for (let i = 0; i < transaction.racesData.length; i++) {
          const raceData = {
            ...transaction.racesData[i],
            eventId: transaction.createdIds.eventId,
            editionId: this.generateEditionId(transaction.createdIds.eventId, transaction.racesData[i].editionYear || new Date().getFullYear().toString())
          }
          if (raceIds[i]) {
            await this.syncRaceToMilesRepublic(raceIds[i], raceData, milesDb)
          }
        }
        
        return {
          ...transaction,
          syncedToDatabase: true
        }
      } catch (syncError) {
        return {
          ...transaction,
          syncError: syncError instanceof Error ? syncError.message : 'Erreur de synchronisation inconnue',
          warnings: [{
            field: 'sync',
            message: `Création réussie dans le cache mais échec de synchronisation: ${syncError instanceof Error ? syncError.message : 'Erreur inconnue'}`,
            severity: 'warning'
          }]
        }
      }
    }

    return transaction
  }

  async applyEventUpdate(eventId: string, changes: any, selectedChanges: Record<string, any>, options: ApplyOptions = {}): Promise<ProposalApplicationResult> {
    try {
      // Résoudre l'ID d'événement
      const resolvedEventId = await this.resolveEventId(eventId)
      
      if (!resolvedEventId) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'eventId',
            message: `Événement non trouvé avec l'ID: ${eventId} (vérifiez que l'événement existe dans le cache)`,
            severity: 'error'
          }]
        }
      }
      
      // Construire les données de mise à jour
      const updateData: any = {}
      
      for (const [field, value] of Object.entries(selectedChanges)) {
        // Mapper les champs selon le schéma EventCache
        switch (field) {
          case 'name':
          case 'city':
          case 'country':
          case 'websiteUrl':
          case 'facebookUrl':
          case 'instagramUrl':
          case 'twitterUrl':
          case 'fullAddress':
          case 'coverImage':
          case 'countrySubdivisionNameLevel1':
          case 'countrySubdivisionNameLevel2':
            updateData[field] = value
            break
          case 'latitude':
          case 'longitude':
            updateData[field] = typeof value === 'number' ? value : parseFloat(value)
            break
          case 'isPrivate':
          case 'isFeatured':
          case 'isRecommended':
            updateData[field] = Boolean(value)
            break
        }
      }

      if (Object.keys(updateData).length === 0) {
        return {
          success: true,
          appliedChanges: {},
          errors: [{
            field: 'changes',
            message: 'Aucun changement à appliquer',
            severity: 'warning'
          }]
        }
      }

      updateData.lastSyncAt = new Date()

      // Récupérer l'événement existant
      const existingEvent = await this.prisma.eventCache.findUnique({
        where: { id: resolvedEventId }
      })

      if (!existingEvent) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'eventId',
            message: `Événement non trouvé avec l'ID résolu: ${resolvedEventId}`,
            severity: 'error'
          }]
        }
      }

      // Mettre à jour l'événement
      await this.prisma.eventCache.update({
        where: { id: resolvedEventId },
        data: updateData
      })

      let result: ProposalApplicationResult = {
        success: true,
        appliedChanges: selectedChanges
      }

      // Par défaut, synchroniser avec Miles Republic (sauf si explicitement désactivé)
      const shouldSyncToDatabase = options.applyToDatabase !== false
      if (shouldSyncToDatabase) {
        try {
          const milesDb = await this.getMilesRepublicConnection(options.milesRepublicDatabaseId)
          await this.syncEventToMilesRepublic(eventId, { ...existingEvent, ...updateData }, milesDb)
          result.syncedToDatabase = true
        } catch (syncError) {
          result.syncError = syncError instanceof Error ? syncError.message : 'Erreur de synchronisation inconnue'
          result.warnings = [{
            field: 'sync',
            message: `Mise à jour réussie dans le cache mais échec de synchronisation: ${syncError instanceof Error ? syncError.message : 'Erreur inconnue'}`,
            severity: 'warning'
          }]
        }
      }

      return result
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'update',
          message: `Erreur lors de la mise à jour de l'événement: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          severity: 'error'
        }]
      }
    }
  }

  async applyEditionUpdate(editionId: string, changes: any, selectedChanges: Record<string, any>, options: ApplyOptions = {}): Promise<ProposalApplicationResult> {
    try {
      // Résoudre l'ID d'édition (supporte les IDs numériques et cache)
      const resolvedEditionId = await this.resolveEditionId(editionId)
      
      if (!resolvedEditionId) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'editionId',
            message: `Édition non trouvée avec l'ID: ${editionId} (vérifiez que l'édition existe dans le cache)`,
            severity: 'error'
          }]
        }
      }
      
      const updateData: any = {}
      
      for (const [field, value] of Object.entries(selectedChanges)) {
        switch (field) {
          case 'year':
          case 'calendarStatus':
          case 'clientStatus':
          case 'currency':
          case 'customerType':
          case 'medusaVersion':
          case 'federationId':
          case 'dataSource':
          case 'timeZone':
            // Handle both direct strings and {old, new, confidence} objects
            if (value && typeof value === 'object' && value.new !== undefined) {
              updateData[field] = value.new
            } else {
              updateData[field] = value
            }
            break
          case 'startDate':
          case 'endDate':
          case 'registrationOpeningDate':
          case 'registrationClosingDate':
            // Handle both direct date strings and {old, new, confidence} objects
            if (value && typeof value === 'object' && value.new) {
              updateData[field] = new Date(value.new)
            } else if (value && typeof value === 'string') {
              updateData[field] = new Date(value)
            } else {
              updateData[field] = null
            }
            break
          case 'registrantsNumber':
            // Handle both direct numbers and {old, new, confidence} objects
            if (value && typeof value === 'object' && value.new !== undefined) {
              updateData[field] = typeof value.new === 'number' ? value.new : parseInt(value.new)
            } else if (typeof value === 'number') {
              updateData[field] = value
            } else if (value) {
              updateData[field] = parseInt(value)
            } else {
              updateData[field] = null
            }
            break
        }
      }

      if (Object.keys(updateData).length === 0) {
        return {
          success: true,
          appliedChanges: {},
          errors: [{
            field: 'changes',
            message: 'Aucun changement à appliquer',
            severity: 'warning'
          }]
        }
      }

      updateData.lastSyncAt = new Date()

      // Récupérer l'édition existante
      const existingEdition = await this.prisma.editionCache.findUnique({
        where: { id: resolvedEditionId }
      })

      if (!existingEdition) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'editionId',
            message: `Édition non trouvée avec l'ID résolu: ${resolvedEditionId}`,
            severity: 'error'
          }]
        }
      }

      await this.prisma.editionCache.update({
        where: { id: resolvedEditionId },
        data: updateData
      })

      let result: ProposalApplicationResult = {
        success: true,
        appliedChanges: selectedChanges
      }

      // Par défaut, synchroniser avec Miles Republic (sauf si explicitement désactivé)
      const shouldSyncToDatabase = options.applyToDatabase !== false
      if (shouldSyncToDatabase) {
        try {
          const milesDb = await this.getMilesRepublicConnection(options.milesRepublicDatabaseId)
          await this.syncEditionToMilesRepublic(editionId, { ...existingEdition, ...updateData }, milesDb)
          result.syncedToDatabase = true
        } catch (syncError) {
          result.syncError = syncError instanceof Error ? syncError.message : 'Erreur de synchronisation inconnue'
          result.warnings = [{
            field: 'sync',
            message: `Mise à jour réussie dans le cache mais échec de synchronisation: ${syncError instanceof Error ? syncError.message : 'Erreur inconnue'}`,
            severity: 'warning'
          }]
        }
      }

      return result
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'update',
          message: `Erreur lors de la mise à jour de l'édition: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          severity: 'error'
        }]
      }
    }
  }

  async applyRaceUpdate(raceId: string, changes: any, selectedChanges: Record<string, any>, options: ApplyOptions = {}): Promise<ProposalApplicationResult> {
    try {
      // Résoudre l'ID de course
      const resolvedRaceId = await this.resolveRaceId(raceId)
      
      if (!resolvedRaceId) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'raceId',
            message: `Course non trouvée avec l'ID: ${raceId} (vérifiez que la course existe dans le cache)`,
            severity: 'error'
          }]
        }
      }
      
      const updateData: any = {}
      
      for (const [field, value] of Object.entries(selectedChanges)) {
        switch (field) {
          case 'name':
          case 'categoryLevel1':
          case 'categoryLevel2':
          case 'distanceCategory':
          case 'federationId':
          case 'dataSource':
          case 'timeZone':
          case 'adultJustificativeOptions':
          case 'minorJustificativeOptions':
          case 'licenseNumberType':
          case 'paymentCollectionType':
          case 'priceType':
          case 'medusaProductId':
          case 'raceVariantStoreId':
          case 'externalFunnelURL':
            updateData[field] = value
            break
          case 'startDate':
          case 'registrationOpeningDate':
          case 'registrationClosingDate':
            // Handle both direct date strings and {old, new, confidence} objects
            if (value && typeof value === 'object' && value.new) {
              updateData[field] = new Date(value.new)
            } else if (value && typeof value === 'string') {
              updateData[field] = new Date(value)
            } else {
              updateData[field] = null
            }
            break
          case 'price':
          case 'runDistance':
          case 'runDistance2':
          case 'bikeDistance':
          case 'swimDistance':
          case 'walkDistance':
          case 'bikeRunDistance':
          case 'swimRunDistance':
          case 'runPositiveElevation':
          case 'runNegativeElevation':
          case 'bikePositiveElevation':
          case 'bikeNegativeElevation':
          case 'walkPositiveElevation':
          case 'walkNegativeElevation':
            updateData[field] = typeof value === 'number' ? value : (value ? parseFloat(value) : 0)
            break
          case 'maxTeamSize':
          case 'minTeamSize':
            updateData[field] = typeof value === 'number' ? value : (value ? parseInt(value) : null)
            break
          case 'isActive':
          case 'isArchived':
          case 'resaleEnabled':
            updateData[field] = Boolean(value)
            break
        }
      }

      if (Object.keys(updateData).length === 0) {
        return {
          success: true,
          appliedChanges: {},
          errors: [{
            field: 'changes',
            message: 'Aucun changement à appliquer',
            severity: 'warning'
          }]
        }
      }

      updateData.lastSyncAt = new Date()

      // Récupérer la course existante
      const existingRace = await this.prisma.raceCache.findUnique({
        where: { id: resolvedRaceId }
      })

      if (!existingRace) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'raceId',
            message: `Course non trouvée avec l'ID résolu: ${resolvedRaceId}`,
            severity: 'error'
          }]
        }
      }

      await this.prisma.raceCache.update({
        where: { id: resolvedRaceId },
        data: updateData
      })

      let result: ProposalApplicationResult = {
        success: true,
        appliedChanges: selectedChanges
      }

      // Par défaut, synchroniser avec Miles Republic (sauf si explicitement désactivé)
      const shouldSyncToDatabase = options.applyToDatabase !== false
      if (shouldSyncToDatabase) {
        try {
          const milesDb = await this.getMilesRepublicConnection(options.milesRepublicDatabaseId)
          await this.syncRaceToMilesRepublic(raceId, { ...existingRace, ...updateData }, milesDb)
          result.syncedToDatabase = true
        } catch (syncError) {
          result.syncError = syncError instanceof Error ? syncError.message : 'Erreur de synchronisation inconnue'
          result.warnings = [{
            field: 'sync',
            message: `Mise à jour réussie dans le cache mais échec de synchronisation: ${syncError instanceof Error ? syncError.message : 'Erreur inconnue'}`,
            severity: 'warning'
          }]
        }
      }

      return result
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'update',
          message: `Erreur lors de la mise à jour de la course: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          severity: 'error'
        }]
      }
    }
  }

  // Méthodes d'extraction des données depuis les changements

  private extractEventData(selectedChanges: Record<string, any>): any {
    return {
      name: selectedChanges.name || '',
      city: selectedChanges.city || '',
      country: selectedChanges.country,
      countrySubdivisionNameLevel1: selectedChanges.countrySubdivisionNameLevel1,
      countrySubdivisionNameLevel2: selectedChanges.countrySubdivisionNameLevel2,
      websiteUrl: selectedChanges.websiteUrl,
      facebookUrl: selectedChanges.facebookUrl,
      instagramUrl: selectedChanges.instagramUrl,
      twitterUrl: selectedChanges.twitterUrl,
      fullAddress: selectedChanges.fullAddress,
      latitude: selectedChanges.latitude,
      longitude: selectedChanges.longitude,
      coverImage: selectedChanges.coverImage,
      isPrivate: selectedChanges.isPrivate,
      isFeatured: selectedChanges.isFeatured,
      isRecommended: selectedChanges.isRecommended
    }
  }

  private extractEditionsData(selectedChanges: Record<string, any>): any[] {
    // Si il y a des données d'édition directes
    if (selectedChanges.year || selectedChanges.startDate || selectedChanges.endDate) {
      return [{
        year: selectedChanges.year || new Date().getFullYear().toString(),
        calendarStatus: selectedChanges.calendarStatus || 'TO_BE_CONFIRMED',
        clientStatus: selectedChanges.clientStatus,
        currency: selectedChanges.currency,
        customerType: selectedChanges.customerType,
        medusaVersion: selectedChanges.medusaVersion,
        startDate: selectedChanges.startDate ? new Date(selectedChanges.startDate) : null,
        endDate: selectedChanges.endDate ? new Date(selectedChanges.endDate) : null,
        registrationOpeningDate: selectedChanges.registrationOpeningDate ? new Date(selectedChanges.registrationOpeningDate) : null,
        registrationClosingDate: selectedChanges.registrationClosingDate ? new Date(selectedChanges.registrationClosingDate) : null,
        registrantsNumber: selectedChanges.registrantsNumber,
        federationId: selectedChanges.federationId,
        dataSource: selectedChanges.dataSource,
        timeZone: selectedChanges.timeZone
      }]
    }

    // Chercher des éditions dans un format structuré (si applicable)
    const editions = []
    for (const [key, value] of Object.entries(selectedChanges)) {
      if (key.startsWith('edition_') && typeof value === 'object') {
        editions.push(value)
      }
    }

    return editions.length > 0 ? editions : [{
      year: new Date().getFullYear().toString(),
      calendarStatus: 'TO_BE_CONFIRMED'
    }]
  }

  private extractRacesData(selectedChanges: Record<string, any>): any[] {
    const races = []
    
    // Chercher des courses dans un format structuré
    for (const [key, value] of Object.entries(selectedChanges)) {
      if (key.startsWith('race_') && typeof value === 'object') {
        races.push(value)
      }
    }

    // Si pas de courses structurées, créer une course par défaut si on a des données pertinentes
    if (races.length === 0 && (selectedChanges.runDistance || selectedChanges.price || selectedChanges.raceName)) {
      races.push({
        name: selectedChanges.raceName || 'Course principale',
        editionYear: selectedChanges.year || new Date().getFullYear().toString(),
        startDate: selectedChanges.raceStartDate ? new Date(selectedChanges.raceStartDate) : null,
        price: selectedChanges.price,
        runDistance: selectedChanges.runDistance,
        runDistance2: selectedChanges.runDistance2,
        bikeDistance: selectedChanges.bikeDistance,
        swimDistance: selectedChanges.swimDistance,
        walkDistance: selectedChanges.walkDistance,
        runPositiveElevation: selectedChanges.runPositiveElevation,
        runNegativeElevation: selectedChanges.runNegativeElevation,
        categoryLevel1: selectedChanges.categoryLevel1,
        categoryLevel2: selectedChanges.categoryLevel2,
        distanceCategory: selectedChanges.distanceCategory,
        federationId: selectedChanges.federationId,
        dataSource: selectedChanges.dataSource,
        timeZone: selectedChanges.timeZone
      })
    }

    return races
  }

  // Méthodes de génération d'IDs

  private generateEventId(name: string, city: string): string {
    const slug = this.slugify(`${name}-${city}`)
    return `event-${slug}-${Date.now()}`
  }

  private generateEditionId(eventId: string, year: string): string {
    return `${eventId}-${year}`
  }

  private generateRaceId(editionId: string, raceName: string): string {
    const slug = this.slugify(raceName)
    return `${editionId}-${slug}`
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
      .replace(/[^a-z0-9\s-]/g, '') // Supprimer les caractères spéciaux
      .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
      .replace(/-+/g, '-') // Fusionner les tirets multiples
      .trim()
  }

  // Méthode de rollback pour annuler une application
  async rollbackProposal(proposalId: string, rollbackData: {
    createdIds?: {
      eventId?: string
      editionId?: string
      raceIds?: string[]
    }
    originalValues?: Record<string, any>
  }): Promise<ProposalApplicationResult> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Supprimer les entités créées
        if (rollbackData.createdIds?.raceIds) {
          await tx.raceCache.deleteMany({
            where: { id: { in: rollbackData.createdIds.raceIds } }
          })
        }

        if (rollbackData.createdIds?.editionId) {
          await tx.editionCache.delete({
            where: { id: rollbackData.createdIds.editionId }
          })
        }

        if (rollbackData.createdIds?.eventId) {
          await tx.eventCache.delete({
            where: { id: rollbackData.createdIds.eventId }
          })
        }

        // Restaurer les valeurs originales pour les mises à jour
        if (rollbackData.originalValues) {
          const proposal = await tx.proposal.findUnique({
            where: { id: proposalId }
          })

          if (!proposal) {
            throw new Error('Proposition non trouvée pour le rollback')
          }

          const updateData = { ...rollbackData.originalValues, lastSyncAt: new Date() }

          switch (proposal.type) {
            case 'EVENT_UPDATE':
              if (proposal.eventId) {
                await tx.eventCache.update({
                  where: { id: proposal.eventId },
                  data: updateData
                })
              }
              break

            case 'EDITION_UPDATE':
              if (proposal.editionId) {
                await tx.editionCache.update({
                  where: { id: proposal.editionId },
                  data: updateData
                })
              }
              break

            case 'RACE_UPDATE':
              if (proposal.raceId) {
                await tx.raceCache.update({
                  where: { id: proposal.raceId },
                  data: updateData
                })
              }
              break
          }
        }
      })

      return {
        success: true,
        appliedChanges: rollbackData.originalValues || {}
      }
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'rollback',
          message: `Erreur lors du rollback: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          severity: 'error'
        }]
      }
    }
  }
}
