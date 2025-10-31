import { PrismaClient } from '@prisma/client'
import { IProposalApplicationService, ProposalApplicationResult, ApplyOptions } from './interfaces'
import { DatabaseManager } from '@data-agents/agent-framework'

export class ProposalApplicationService implements IProposalApplicationService {
  private dbManager: DatabaseManager
  
  constructor(private prisma: PrismaClient) {
    const logger = {
      info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ''),
      warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
      debug: (msg: string, data?: any) => console.debug(`[DEBUG] ${msg}`, data || '')
    }
    this.dbManager = DatabaseManager.getInstance(logger)
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
    
    // Prioriser userModifiedChanges sur changes
    const finalChanges = {
      ...(proposal.changes as Record<string, any>),
      ...(proposal.userModifiedChanges ? (proposal.userModifiedChanges as Record<string, any>) : {})
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
          return await this.applyNewEvent(finalChanges, selectedChanges, options)
        
        case 'EVENT_UPDATE':
          if (!proposal.eventId) {
            throw new Error('EventId manquant pour EVENT_UPDATE')
          }
          return await this.applyEventUpdate(proposal.eventId, finalChanges, selectedChanges, options)
        
        case 'EDITION_UPDATE':
          if (!proposal.editionId) {
            throw new Error('EditionId manquant pour EDITION_UPDATE')
          }
          return await this.applyEditionUpdate(proposal.editionId, finalChanges, selectedChanges, options)
        
        case 'RACE_UPDATE':
          if (!proposal.raceId) {
            throw new Error('RaceId manquant pour RACE_UPDATE')
          }
          return await this.applyRaceUpdate(proposal.raceId, finalChanges, selectedChanges, options)
        
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
    try {
      const milesDb = await this.getMilesRepublicConnection(options.milesRepublicDatabaseId)
      
      // Extraire les données
      const eventData = this.extractEventData(selectedChanges)
      const editionsData = this.extractEditionsData(selectedChanges)
      const racesData = this.extractRacesData(selectedChanges)

      // Créer l'événement dans Miles Republic
      const event = await milesDb.event.create({
        data: {
          name: eventData.name,
          city: eventData.city,
          country: eventData.country || 'FR',
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
          isPrivate: eventData.isPrivate || false,
          isFeatured: eventData.isFeatured || false,
          isRecommended: eventData.isRecommended || false,
          status: 'DRAFT',
          createdBy: 'data-agents',
          updatedBy: 'data-agents'
        }
      })

      const createdEditionIds: number[] = []
      const createdRaceIds: number[] = []

      // Créer les éditions
      for (const editionData of editionsData) {
        const edition = await milesDb.edition.create({
          data: {
            eventId: event.id,
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
            timeZone: editionData.timeZone || 'Europe/Paris',
            status: 'DRAFT',
            createdBy: 'data-agents',
            updatedBy: 'data-agents'
          }
        })

        createdEditionIds.push(edition.id)

        // Créer les courses pour cette édition
        const editionRaces = racesData.filter(race => race.editionYear === editionData.year)
        for (const raceData of editionRaces) {
          const race = await milesDb.race.create({
            data: {
              editionId: edition.id,
              eventId: event.id,
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
              isActive: raceData.isActive !== false,
              createdBy: 'data-agents',
              updatedBy: 'data-agents'
            }
          })

          createdRaceIds.push(race.id)
        }
      }

      return {
        success: true,
        appliedChanges: selectedChanges,
        createdIds: {
          eventId: event.id.toString(),
          editionId: createdEditionIds[0]?.toString(),
          raceIds: createdRaceIds.map(id => id.toString())
        }
      }
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'create',
          message: `Erreur lors de la création: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          severity: 'error'
        }]
      }
    }
  }

  async applyEventUpdate(eventId: string, changes: any, selectedChanges: Record<string, any>, options: ApplyOptions = {}): Promise<ProposalApplicationResult> {
    try {
      const milesDb = await this.getMilesRepublicConnection(options.milesRepublicDatabaseId)
      const numericEventId = parseInt(eventId)

      if (isNaN(numericEventId)) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'eventId',
            message: `ID d'événement invalide: ${eventId}`,
            severity: 'error'
          }]
        }
      }

      // Construire les données de mise à jour
      const updateData: any = {
        updatedBy: 'data-agents',
        updatedAt: new Date(),
        toUpdate: true,
        algoliaObjectToUpdate: true
      }
      
      for (const [field, value] of Object.entries(selectedChanges)) {
        if (value !== undefined && value !== null) {
          // Gérer les objets {old, new, confidence} ou {current, proposed}
          if (value && typeof value === 'object' && ('new' in value || 'proposed' in value)) {
            const newValue = 'new' in value ? value.new : value.proposed
            if (newValue !== undefined && newValue !== null) {
              updateData[field] = newValue
            }
          } else {
            updateData[field] = value
          }
        }
      }

      // Mettre à jour dans Miles Republic
      await milesDb.event.update({
        where: { id: numericEventId },
        data: updateData
      })

      return {
        success: true,
        appliedChanges: selectedChanges
      }
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'update',
          message: `Erreur lors de la mise à jour: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          severity: 'error'
        }]
      }
    }
  }

  async applyEditionUpdate(editionId: string, changes: any, selectedChanges: Record<string, any>, options: ApplyOptions = {}): Promise<ProposalApplicationResult> {
    try {
      const milesDb = await this.getMilesRepublicConnection(options.milesRepublicDatabaseId)
      const numericEditionId = parseInt(editionId)

      if (isNaN(numericEditionId)) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'editionId',
            message: `ID d'édition invalide: ${editionId}`,
            severity: 'error'
          }]
        }
      }

      const updateData: any = {
        updatedBy: 'data-agents',
        updatedAt: new Date(),
        calendarStatus: 'CONFIRMED'
      }
      
      // Séparer les races des autres changements
      let racesChanges: any[] | undefined
      
      for (const [field, value] of Object.entries(selectedChanges)) {
        // Ignorer le champ 'races' - sera traité séparément
        if (field === 'races') {
          racesChanges = value as any[]
          continue
        }
        
        // Gérer les objets {old, new, confidence}
        if (value && typeof value === 'object' && 'new' in value) {
          if (value.new !== undefined && value.new !== null) {
            updateData[field] = value.new
          }
        } else if (value !== undefined && value !== null) {
          updateData[field] = value
        }
      }

      // Récupérer l'édition pour mettre à jour l'Event parent
      const edition = await milesDb.edition.findUnique({
        where: { id: numericEditionId },
        select: { eventId: true }
      })

      // Mettre à jour l'édition dans Miles Republic
      await milesDb.edition.update({
        where: { id: numericEditionId },
        data: updateData
      })

      // Mettre à jour l'Event parent
      if (edition?.eventId) {
        await milesDb.event.update({
          where: { id: edition.eventId },
          data: {
            updatedBy: 'data-agents',
            updatedAt: new Date(),
            toUpdate: true,
            algoliaObjectToUpdate: true
          }
        })
      }
      
      // Mettre à jour les races séparément si nécessaire
      if (racesChanges && Array.isArray(racesChanges)) {
        for (const raceChange of racesChanges) {
          const raceId = parseInt(raceChange.raceId)
          if (isNaN(raceId)) {
            console.warn(`ID de course invalide: ${raceChange.raceId}`)
            continue
          }
          
          const raceUpdateData: any = {
            updatedBy: 'data-agents',
            updatedAt: new Date()
          }
          
          // Extraire les changements de la course (tout sauf raceId et raceName)
          for (const [field, value] of Object.entries(raceChange)) {
            if (field === 'raceId' || field === 'raceName') continue
            
            // Gérer les objets {old, new, confidence}
            if (value && typeof value === 'object' && 'new' in (value as any)) {
              const val = value as any
              if (val.new !== undefined && val.new !== null) {
                raceUpdateData[field] = val.new
              }
            } else if (value !== undefined && value !== null) {
              raceUpdateData[field] = value
            }
          }
          
          // Mettre à jour la course
          await milesDb.race.update({
            where: { id: raceId },
            data: raceUpdateData
          })
        }
      }

      return {
        success: true,
        appliedChanges: selectedChanges
      }
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'update',
          message: `Erreur lors de la mise à jour: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
          severity: 'error'
        }]
      }
    }
  }

  async applyRaceUpdate(raceId: string, changes: any, selectedChanges: Record<string, any>, options: ApplyOptions = {}): Promise<ProposalApplicationResult> {
    try {
      const milesDb = await this.getMilesRepublicConnection(options.milesRepublicDatabaseId)
      const numericRaceId = parseInt(raceId)

      if (isNaN(numericRaceId)) {
        return {
          success: false,
          appliedChanges: {},
          errors: [{
            field: 'raceId',
            message: `ID de course invalide: ${raceId}`,
            severity: 'error'
          }]
        }
      }

      const updateData: any = {
        updatedBy: 'data-agents',
        updatedAt: new Date()
      }
      
      for (const [field, value] of Object.entries(selectedChanges)) {
        // Gérer les objets {old, new, confidence}
        if (value && typeof value === 'object' && 'new' in value) {
          if (value.new !== undefined && value.new !== null) {
            updateData[field] = value.new
          }
        } else if (value !== undefined && value !== null) {
          updateData[field] = value
        }
      }

      // Récupérer la race pour mettre à jour l'Event parent
      const race = await milesDb.race.findUnique({
        where: { id: numericRaceId },
        select: { eventId: true }
      })

      // Mettre à jour dans Miles Republic
      await milesDb.race.update({
        where: { id: numericRaceId },
        data: updateData
      })

      // Mettre à jour l'Event parent
      if (race?.eventId) {
        await milesDb.event.update({
          where: { id: race.eventId },
          data: {
            updatedBy: 'data-agents',
            updatedAt: new Date(),
            toUpdate: true,
            algoliaObjectToUpdate: true
          }
        })
      }

      return {
        success: true,
        appliedChanges: selectedChanges
      }
    } catch (error) {
      return {
        success: false,
        appliedChanges: {},
        errors: [{
          field: 'update',
          message: `Erreur lors de la mise à jour: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
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
        timeZone: selectedChanges.timeZone
      }]
    }

    // Chercher des éditions dans un format structuré
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
        federationId: selectedChanges.federationId
      })
    }

    return races
  }

  // Méthode de rollback (non implémentée pour l'instant - nécessiterait de stocker l'état avant)
  async rollbackProposal(proposalId: string, rollbackData: any): Promise<ProposalApplicationResult> {
    return {
      success: false,
      appliedChanges: {},
      errors: [{
        field: 'rollback',
        message: 'Le rollback n\'est pas encore implémenté pour le mode direct',
        severity: 'error'
      }]
    }
  }
}
