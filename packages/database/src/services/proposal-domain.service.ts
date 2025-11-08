import { ProposalRepository } from '../repositories/proposal.repository'
import { MilesRepublicRepository } from '../repositories/miles-republic.repository'
import { ApplyOptions, ProposalApplicationResult } from './interfaces'

// DatabaseManager type to avoid circular dependency
type DatabaseManager = any

/**
 * Domain Service - Business logic for proposal application
 * 
 * Responsibilities:
 * - Business rules and validation
 * - Orchestration of repositories
 * - Data transformation and extraction
 * - Error handling and result formatting
 * 
 * Uses Repository Pattern to separate data access from business logic
 */
export class ProposalDomainService {
  constructor(
    private proposalRepo: ProposalRepository,
    private dbManager: DatabaseManager,
    private logger: { info: Function; error: Function; warn: Function; debug: Function }
  ) {}

  /**
   * Apply a proposal's changes to Miles Republic
   */
  async applyProposal(
    proposalId: string,
    selectedChanges: Record<string, any>,
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    // 1. Fetch proposal via repository
    const proposal = await this.proposalRepo.findById(proposalId)

    if (!proposal) {
      return this.errorResult('proposal', 'Proposition non trouvée')
    }

    // 2. Business validation
    if (proposal.status !== 'APPROVED' && !options.force) {
      return this.errorResult(
        'status',
        'La proposition doit être approuvée pour être appliquée (utilisez force: true pour outrepasser)'
      )
    }

    // 3. Merge changes (user modifications take precedence)
    const finalChanges = {
      ...(proposal.changes as Record<string, any>),
      ...(proposal.userModifiedChanges ? (proposal.userModifiedChanges as Record<string, any>) : {})
    }

    // 4. Filter changes based on approved blocks (Option 2: Partial Application)
    const approvedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}
    const filteredSelectedChanges = this.filterChangesByApprovedBlocks(selectedChanges, approvedBlocks)
    
    // Log which changes are being filtered out
    const removedChanges = Object.keys(selectedChanges).filter(key => !(key in filteredSelectedChanges))
    if (removedChanges.length > 0) {
      this.logger.info(`Filtered out ${removedChanges.length} changes from unapproved blocks: ${removedChanges.join(', ')}`)
    }

    try {
      // 5. Dry run check
      if (options.dryRun) {
        return {
          success: true,
          appliedChanges: filteredSelectedChanges,
          dryRun: true
        }
      }

      // 6. Route to appropriate handler based on proposal type
      let result: ProposalApplicationResult
      
      switch (proposal.type) {
        case 'NEW_EVENT':
          result = await this.applyNewEvent(finalChanges, filteredSelectedChanges, options)
          break

        case 'EVENT_UPDATE':
          if (!proposal.eventId) {
            throw new Error('EventId manquant pour EVENT_UPDATE')
          }
          result = await this.applyEventUpdate(proposal.eventId, finalChanges, filteredSelectedChanges, options)
          break

        case 'EDITION_UPDATE':
          if (!proposal.editionId) {
            throw new Error('EditionId manquant pour EDITION_UPDATE')
          }
          result = await this.applyEditionUpdate(proposal.editionId, finalChanges, filteredSelectedChanges, options, proposal)
          break

        case 'RACE_UPDATE':
          if (!proposal.raceId) {
            throw new Error('RaceId manquant pour RACE_UPDATE')
          }
          result = await this.applyRaceUpdate(proposal.raceId, finalChanges, filteredSelectedChanges, options)
          break

        default:
          return this.errorResult('type', `Type de proposition non supporté: ${proposal.type}`)
      }
      
      // 7. Add filtered changes info to result
      if (removedChanges.length > 0) {
        result.filteredChanges = {
          removed: removedChanges,
          approvedBlocks
        }
      }
      
      return result
    } catch (error) {
      return this.errorResult('application', `Erreur lors de l'application: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Apply NEW_EVENT proposal
   */
  async applyNewEvent(
    changes: any,
    selectedChanges: Record<string, any>,
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    try {
      const milesRepo = await this.getMilesRepublicRepository(options.milesRepublicDatabaseId)

      // Extract structured data
      // Note: Utiliser 'changes' qui contient les userModifiedChanges mergées
      const eventData = this.extractEventData(changes)
      const editionsData = this.extractEditionsData(changes)
      const racesData = this.extractRacesData(changes)
      const organizerData = this.extractNewValue(changes.organizer)

      // Create event
      const event = await milesRepo.createEvent(eventData)

      // ✅ FIX 1.4 : Générer le slug avec l'ID
      const slug = this.generateEventSlug(event.name, event.id)
      await milesRepo.updateEvent(event.id, { slug })
      this.logger.info(`Slug généré pour l'événement ${event.id}: ${slug}`)

      const createdEditionIds: number[] = []
      const createdRaceIds: number[] = []

      // Create editions
      for (const editionData of editionsData) {
        const edition = await milesRepo.createEdition({
          eventId: event.id,
          // ✅ FIX 2.2 : currentEditionEventId
          currentEditionEventId: event.id,
          ...editionData
        })

        createdEditionIds.push(edition.id)
        this.logger.info(`Édition créée: ${edition.id} pour l'événement ${event.id}`)

        // Create organizer if provided
        if (organizerData && typeof organizerData === 'object') {
          this.logger.info(`Création de l'organisateur pour l'édition ${edition.id}`)
          await milesRepo.upsertOrganizerPartner(edition.id, {
            name: organizerData.name,
            websiteUrl: organizerData.websiteUrl,
            email: organizerData.email,
            phone: organizerData.phone,
            facebookUrl: organizerData.facebookUrl,
            instagramUrl: organizerData.instagramUrl
          })
        }

        // ✅ FIX 3.1 : Create races for this edition
        const editionRaces = racesData.filter(race => 
          race.editionYear === editionData.year
        )
        
        if (editionRaces.length === 0 && racesData.length > 0) {
          // Si aucune race ne correspond à l'année, créer toutes les races
          this.logger.info(`Aucune race avec editionYear=${editionData.year}, création de toutes les races (${racesData.length})`)
          for (const raceData of racesData) {
            const race = await milesRepo.createRace({
              editionId: edition.id,
              eventId: event.id,
              ...raceData
            })
            createdRaceIds.push(race.id)
            this.logger.info(`Course créée: ${race.id} (${race.name}) pour l'édition ${edition.id}`)
          }
        } else {
          for (const raceData of editionRaces) {
            const race = await milesRepo.createRace({
              editionId: edition.id,
              eventId: event.id,
              ...raceData
            })
            createdRaceIds.push(race.id)
            this.logger.info(`Course créée: ${race.id} (${race.name}) pour l'édition ${edition.id}`)
          }
        }
      }

      // ✅ FIX 1.2 : Géocoder si coordonnées manquantes
      if (!event.latitude || !event.longitude) {
        this.logger.info(`Coordonnées manquantes pour l'événement ${event.id}, tentative de géocodage...`)
        const coords = await this.geocodeCity(event.city, event.country)
        if (coords) {
          await milesRepo.updateEvent(event.id, {
            latitude: coords.latitude,
            longitude: coords.longitude
          })
          this.logger.info(`Coordonnées mises à jour pour ${event.city}: ${coords.latitude}, ${coords.longitude}`)
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
      return this.errorResult('create', `Erreur lors de la création: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Apply EVENT_UPDATE proposal
   */
  async applyEventUpdate(
    eventId: string,
    changes: any,
    selectedChanges: Record<string, any>,
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    try {
      const milesRepo = await this.getMilesRepublicRepository(options.milesRepublicDatabaseId)
      const numericEventId = parseInt(eventId)

      if (isNaN(numericEventId)) {
        return this.errorResult('eventId', `ID d'événement invalide: ${eventId}`)
      }

      // Build update data
      const updateData = this.buildUpdateData(selectedChanges)

      // Apply update
      await milesRepo.updateEvent(numericEventId, updateData)

      return {
        success: true,
        appliedChanges: selectedChanges
      }
    } catch (error) {
      return this.errorResult('update', `Erreur lors de la mise à jour: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Apply EDITION_UPDATE proposal
   */
  async applyEditionUpdate(
    editionId: string,
    changes: any,
    selectedChanges: Record<string, any>,
    options: ApplyOptions = {},
    proposal?: any
  ): Promise<ProposalApplicationResult> {
    try {
      const milesRepo = await this.getMilesRepublicRepository(options.milesRepublicDatabaseId)
      const numericEditionId = parseInt(editionId)

      if (isNaN(numericEditionId)) {
        return this.errorResult('editionId', `ID d'édition invalide: ${editionId}`)
      }

      // Separate races and organizer from other changes
      let racesChanges: any[] | undefined
      let racesToAdd: any[] | undefined
      let racesToDelete: number[] | undefined
      let organizerData: any | undefined
      const updateData: Record<string, any> = { calendarStatus: 'CONFIRMED' }

      for (const [field, value] of Object.entries(selectedChanges)) {
        if (field === 'races') {
          racesChanges = value as any[]
          continue
        }
        
        if (field === 'racesToAdd') {
          racesToAdd = this.extractNewValue(value) as any[]
          continue
        }
        
        if (field === 'racesToDelete') {
          racesToDelete = value as number[]
          continue
        }

        // Handle organizer (complex object)
        if (field === 'organizer') {
          organizerData = this.extractNewValue(value)
          continue
        }

        const extractedValue = this.extractNewValue(value)
        if (extractedValue !== undefined && extractedValue !== null) {
          updateData[field] = extractedValue
        }
      }

      // Fetch edition to update parent event
      const edition = await milesRepo.findEditionById(numericEditionId)

      // Update edition
      await milesRepo.updateEdition(numericEditionId, updateData)

      // Update organizer if provided
      if (organizerData && typeof organizerData === 'object') {
        this.logger.info(`Mise à jour de l'organisateur pour l'édition ${numericEditionId}`)
        await milesRepo.upsertOrganizerPartner(numericEditionId, {
          name: organizerData.name,
          websiteUrl: organizerData.websiteUrl,
          email: organizerData.email,
          phone: organizerData.phone,
          facebookUrl: organizerData.facebookUrl,
          instagramUrl: organizerData.instagramUrl
        })
      }

      // Update parent event
      if (edition?.eventId) {
        await milesRepo.touchEvent(edition.eventId)
      }

      // Update races if any
      if (racesChanges && Array.isArray(racesChanges)) {
        for (const raceChange of racesChanges) {
          const raceId = parseInt(raceChange.raceId)
          if (isNaN(raceId)) {
            this.logger.warn(`ID de course invalide: ${raceChange.raceId}`)
            continue
          }

          const raceUpdateData = this.buildRaceUpdateData(raceChange)
          await milesRepo.updateRace(raceId, raceUpdateData)
        }
      }
      
      // Add races if any
      if (racesToAdd && Array.isArray(racesToAdd) && racesToAdd.length > 0) {
        // Récupérer les modifications utilisateur depuis userModifiedChanges
        const racesToAddFiltered = (proposal?.userModifiedChanges as any)?.racesToAddFiltered || []
        const raceEdits = (proposal?.userModifiedChanges as any)?.raceEdits || {}
        
        // Filtrer les courses marquées pour suppression
        const racesToAddEffective = racesToAdd.filter((_, index) => !racesToAddFiltered.includes(index))
        
        this.logger.info(`Ajout de ${racesToAddEffective.length} course(s) à l'édition ${numericEditionId}`)
        for (let i = 0; i < racesToAdd.length; i++) {
          if (racesToAddFiltered.includes(i)) {
            this.logger.info(`Course index ${i} filtrée (supprimée par l'utilisateur)`)
            continue
          }
          
          const raceData = racesToAdd[i]
          const editedData = raceEdits[`new-${i}`] || {}
          
          const racePayload: any = {
            editionId: numericEditionId,
            eventId: edition?.eventId,
            name: editedData.name || raceData.name,
            runDistance: editedData.distance ? parseFloat(editedData.distance) : raceData.distance,
            runPositiveElevation: editedData.elevation ? parseFloat(editedData.elevation) : raceData.elevation,
            startDate: raceData.startDate ? new Date(raceData.startDate) : null
          }
          
          // Type est déprécié dans le schéma mais peut être utilisé
          const finalType = editedData.type || raceData.type
          if (finalType) {
            racePayload.type = finalType
          }
          
          await milesRepo.createRace(racePayload)
        }
      }
      
      // Update existing races if edited
      const raceEdits = (proposal?.userModifiedChanges as any)?.raceEdits || {}
      const existingRaceEdits = Object.keys(raceEdits)
        .filter(key => key.startsWith('existing-'))
        .map(key => ({ index: parseInt(key.replace('existing-', '')), edits: raceEdits[key] }))
      
      if (existingRaceEdits.length > 0) {
        this.logger.info(`Mise à jour de ${existingRaceEdits.length} course(s) existante(s)`)
        
        // Récupérer les courses existantes enrichies
        const existingRaces = (proposal as any).existingRaces || []
        
        for (const { index, edits } of existingRaceEdits) {
          const race = existingRaces[index]
          if (!race) continue
          
          const updateData: any = {}
          
          if (edits.name) updateData.name = edits.name
          if (edits.distance) updateData.runDistance = parseFloat(edits.distance)
          if (edits.elevation) updateData.runPositiveElevation = parseFloat(edits.elevation)
          if (edits.type) updateData.type = edits.type
          
          if (Object.keys(updateData).length > 0) {
            await milesRepo.updateRace(race.id, updateData)
          }
        }
      }
      
      // Delete races if any
      if (racesToDelete && Array.isArray(racesToDelete) && racesToDelete.length > 0) {
        this.logger.info(`Suppression de ${racesToDelete.length} course(s) de l'édition ${numericEditionId}`)
        for (const raceId of racesToDelete) {
          await milesRepo.deleteRace(raceId)
        }
      }

      return {
        success: true,
        appliedChanges: selectedChanges
      }
    } catch (error) {
      return this.errorResult('update', `Erreur lors de la mise à jour: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  /**
   * Apply RACE_UPDATE proposal
   */
  async applyRaceUpdate(
    raceId: string,
    changes: any,
    selectedChanges: Record<string, any>,
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    try {
      const milesRepo = await this.getMilesRepublicRepository(options.milesRepublicDatabaseId)
      const numericRaceId = parseInt(raceId)

      if (isNaN(numericRaceId)) {
        return this.errorResult('raceId', `ID de course invalide: ${raceId}`)
      }

      const updateData = this.buildUpdateData(selectedChanges)

      // Fetch race to update parent event
      const race = await milesRepo.findRaceById(numericRaceId)

      // Update race
      await milesRepo.updateRace(numericRaceId, updateData)

      // Update parent event
      if (race?.eventId) {
        await milesRepo.touchEvent(race.eventId)
      }

      return {
        success: true,
        appliedChanges: selectedChanges
      }
    } catch (error) {
      return this.errorResult('update', `Erreur lors de la mise à jour: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    }
  }

  // ============== PRIVATE HELPERS ==============

  /**
   * Determine which block a field belongs to
   * Based on the GroupedProposalDetailBase logic (lines 656-694)
   * 
   * Blocks:
   * - 'organizer': organizer-related fields
   * - 'races': race changes (racesToAdd, races array, race_* fields)
   * - 'edition': edition/event changes (everything else)
   */
  private getBlockForField(field: string): string {
    // Organizer block
    if (field === 'organizerId' || field === 'organizer') {
      return 'organizer'
    }

    // Races block (racesToAdd, races array, or race_* fields)
    if (field === 'racesToAdd' || field === 'races' || field.startsWith('race_')) {
      return 'races'
    }

    // Everything else is edition/event block (default)
    // This includes: name, city, startDate, endDate, calendarStatus, etc.
    return 'edition'
  }

  /**
   * Filter changes by approved blocks (Option 2: Partial Application)
   * Only keep changes from blocks that have been approved
   */
  private filterChangesByApprovedBlocks(
    selectedChanges: Record<string, any>,
    approvedBlocks: Record<string, boolean>
  ): Record<string, any> {
    // If no blocks are specified (old behavior), allow all changes
    if (Object.keys(approvedBlocks).length === 0) {
      return selectedChanges
    }

    const filteredChanges: Record<string, any> = {}

    for (const [field, value] of Object.entries(selectedChanges)) {
      const block = this.getBlockForField(field)
      
      // Only include this change if its block has been approved
      if (approvedBlocks[block] === true) {
        filteredChanges[field] = value
      }
    }

    return filteredChanges
  }

  /**
   * Get Miles Republic repository (with connection)
   */
  private async getMilesRepublicRepository(databaseId?: string): Promise<MilesRepublicRepository> {
    const milesDb = await this.getMilesRepublicConnection(databaseId)
    return new MilesRepublicRepository(milesDb)
  }

  /**
   * Find Miles Republic connection
   */
  private async getMilesRepublicConnection(databaseId?: string): Promise<any> {
    if (databaseId) {
      return await this.dbManager.getConnection(databaseId)
    }

    const availableDbs = await this.dbManager.getAvailableDatabases()
    const milesDb = availableDbs.find(
      (db: any) => db.type === 'miles-republic' || db.name.toLowerCase().includes('miles')
    )

    if (!milesDb) {
      throw new Error('Aucune connexion Miles Republic trouvée')
    }

    return await this.dbManager.getConnection(milesDb.id)
  }

  /**
   * Extract event data from selected changes
   */
  private extractEventData(selectedChanges: Record<string, any>): any {
    const city = this.extractNewValue(selectedChanges.city) || ''
    const dept = this.extractNewValue(selectedChanges.countrySubdivisionNameLevel2) || ''
    const region = this.extractNewValue(selectedChanges.countrySubdivisionNameLevel1) || ''
    const country = this.extractNewValue(selectedChanges.country) || 'FR'
    
    return {
      // Requis
      name: this.extractNewValue(selectedChanges.name) || '',
      city,
      country,
      countrySubdivisionNameLevel1: region,
      countrySubdivisionNameLevel2: dept,
      countrySubdivisionDisplayCodeLevel2: this.extractDepartmentCode(dept),
      
      // ✅ FIX 1.1 : Subdivision Level 1
      countrySubdivisionDisplayCodeLevel1: this.extractRegionCode(region),
      
      // ✅ FIX 1.6 : fullAddress éditable
      fullAddress: this.extractNewValue(selectedChanges.fullAddress) || 
                   this.buildFullAddress(city, dept, country),
      
      // ✅ FIX 1.2 : Coordonnées (sera géocodé si manquant)
      latitude: this.extractNewValue(selectedChanges.latitude) ? 
                parseFloat(this.extractNewValue(selectedChanges.latitude)) : 
                undefined,
      longitude: this.extractNewValue(selectedChanges.longitude) ? 
                 parseFloat(this.extractNewValue(selectedChanges.longitude)) : 
                 undefined,
      
      // ✅ FIX 1.3 : URLs éditables même si non proposées
      websiteUrl: this.extractNewValue(selectedChanges.websiteUrl) || null,
      facebookUrl: this.extractNewValue(selectedChanges.facebookUrl) || null,
      instagramUrl: this.extractNewValue(selectedChanges.instagramUrl) || null,
      twitterUrl: this.extractNewValue(selectedChanges.twitterUrl) || null,
      
      // ✅ FIX 1.4 : Slug (sera généré après création avec l'ID)
      // Note: slug doit être généré APRÈS la création car il contient l'ID
      
      coverImage: this.extractNewValue(selectedChanges.coverImage),
      images: this.extractNewValue(selectedChanges.images) || [],
      peyceReview: this.extractNewValue(selectedChanges.peyceReview),
      
      // Flags
      isPrivate: this.extractNewValue(selectedChanges.isPrivate) ?? false,
      isFeatured: this.extractNewValue(selectedChanges.isFeatured) ?? false,
      isRecommended: this.extractNewValue(selectedChanges.isRecommended) ?? false,
      
      // ✅ FIX 1.5 : toUpdate par défaut
      toUpdate: this.extractNewValue(selectedChanges.toUpdate) ?? true,
      
      // Métadonnées
      dataSource: this.extractNewValue(selectedChanges.dataSource) || 'FEDERATION'
    }
  }

  /**
   * Extract editions data from selected changes
   */
  private extractEditionsData(selectedChanges: Record<string, any>): any[] {
    // ✅ FIX: Extraire depuis edition.new si présent
    const editionData = this.extractNewValue(selectedChanges.edition)
    
    if (editionData && typeof editionData === 'object') {
      // Edition imbriquée (structure FFA Scraper)
      return [{
        year: editionData.year || new Date().getFullYear().toString(),
        
        // Dates
        startDate: this.parseDate(editionData.startDate),
        endDate: this.parseDate(editionData.endDate),
        registrationOpeningDate: this.parseDate(editionData.registrationOpeningDate),
        registrationClosingDate: this.parseDate(editionData.registrationClosingDate),
        confirmedAt: this.parseDate(editionData.confirmedAt),
        
        // Statuts
        calendarStatus: editionData.calendarStatus || 'CONFIRMED',
        clientStatus: editionData.clientStatus,
        status: editionData.status || 'DRAFT',
        
        // Configuration
        currency: editionData.currency || 'EUR',
        timeZone: editionData.timeZone || 'Europe/Paris',
        medusaVersion: editionData.medusaVersion || 'V1',
        customerType: editionData.customerType,
        
        // Informations
        registrantsNumber: editionData.registrantsNumber ? parseInt(editionData.registrantsNumber) : undefined,
        whatIsIncluded: editionData.whatIsIncluded,
        clientExternalUrl: editionData.clientExternalUrl,
        bibWithdrawalFullAddress: editionData.bibWithdrawalFullAddress,
        volunteerCode: editionData.volunteerCode,
        
        // Flags
        isAttendeeListPublic: editionData.isAttendeeListPublic ?? true,
        publicAttendeeListColumns: editionData.publicAttendeeListColumns || [],
        hasEditedDates: editionData.hasEditedDates ?? false,
        
        // Métadonnées
        federationId: editionData.federationId,
        dataSource: editionData.dataSource || this.inferDataSource(selectedChanges),
        airtableId: editionData.airtableId,
        organizerStripeConnectedAccountId: editionData.organizerStripeConnectedAccountId,
        organizationId: editionData.organizationId ? parseInt(editionData.organizationId) : undefined
      }]
    }
    
    // Fallback: chercher au niveau racine (ancienne structure)
    if (selectedChanges.year || selectedChanges.startDate || selectedChanges.endDate) {
      return [{
        year: this.extractNewValue(selectedChanges.year) || new Date().getFullYear().toString(),
        
        // Dates
        startDate: this.extractDate(selectedChanges.startDate),
        endDate: this.extractDate(selectedChanges.endDate),
        registrationOpeningDate: this.extractDate(selectedChanges.registrationOpeningDate),
        registrationClosingDate: this.extractDate(selectedChanges.registrationClosingDate),
        confirmedAt: this.extractDate(selectedChanges.confirmedAt),
        
        // Statuts
        calendarStatus: this.extractNewValue(selectedChanges.calendarStatus) || 'CONFIRMED',
        clientStatus: this.extractNewValue(selectedChanges.clientStatus),
        status: this.extractNewValue(selectedChanges.status) || 'DRAFT',
        
        // Configuration
        currency: this.extractNewValue(selectedChanges.currency) || 'EUR',
        timeZone: this.extractNewValue(selectedChanges.timeZone) || 'Europe/Paris',
        medusaVersion: this.extractNewValue(selectedChanges.medusaVersion) || 'V1',
        customerType: this.extractNewValue(selectedChanges.customerType),
        
        // Informations
        registrantsNumber: this.extractInt(selectedChanges.registrantsNumber),
        whatIsIncluded: this.extractNewValue(selectedChanges.whatIsIncluded),
        clientExternalUrl: this.extractNewValue(selectedChanges.clientExternalUrl),
        bibWithdrawalFullAddress: this.extractNewValue(selectedChanges.bibWithdrawalFullAddress),
        volunteerCode: this.extractNewValue(selectedChanges.volunteerCode),
        
        // Flags
        isAttendeeListPublic: this.extractNewValue(selectedChanges.isAttendeeListPublic) ?? true,
        publicAttendeeListColumns: this.extractNewValue(selectedChanges.publicAttendeeListColumns) || [],
        hasEditedDates: this.extractNewValue(selectedChanges.hasEditedDates) ?? false,
        
        // Métadonnées
        federationId: this.extractNewValue(selectedChanges.federationId),
        // ✅ FIX 2.3 : dataSource
        dataSource: this.extractNewValue(selectedChanges.dataSource) || this.inferDataSource(selectedChanges),
        airtableId: this.extractNewValue(selectedChanges.airtableId),
        organizerStripeConnectedAccountId: this.extractNewValue(selectedChanges.organizerStripeConnectedAccountId),
        organizationId: this.extractInt(selectedChanges.organizationId)
      }]
    }

    // Multiple editions (edge case)
    const editions = []
    for (const [key, value] of Object.entries(selectedChanges)) {
      if (key.startsWith('edition_') && typeof value === 'object') {
        editions.push(value)
      }
    }

    return editions.length > 0 ? editions : [{
      year: new Date().getFullYear().toString(),
      calendarStatus: 'CONFIRMED',
      status: 'DRAFT'
    }]
  }

  /**
   * Extract races data from selected changes
   */
  private extractRacesData(selectedChanges: Record<string, any>): any[] {
    const races = []

  // ✅ FIX: Extraire depuis edition.new.races si présent (structure FFA Scraper)
  const editionData = this.extractNewValue(selectedChanges.edition)
  if (editionData && typeof editionData === 'object' && Array.isArray(editionData.races)) {
    for (const raceData of editionData.races) {
      races.push({
        name: raceData.name || 'Course principale',
        editionYear: editionData.year || new Date().getFullYear().toString(),
        startDate: this.parseDate(raceData.startDate),
        runDistance: raceData.runDistance ? parseFloat(raceData.runDistance) : undefined,
        runDistance2: raceData.runDistance2 ? parseFloat(raceData.runDistance2) : undefined,
        bikeDistance: raceData.bikeDistance ? parseFloat(raceData.bikeDistance) : undefined,
        swimDistance: raceData.swimDistance ? parseFloat(raceData.swimDistance) : undefined,
        walkDistance: raceData.walkDistance ? parseFloat(raceData.walkDistance) : undefined,
        runPositiveElevation: raceData.runPositiveElevation ? parseFloat(raceData.runPositiveElevation) : undefined,
        // Mapper type (obsolète) vers categoryLevel1
        categoryLevel1: raceData.categoryLevel1 || raceData.type,
        // Note: type est obsolète, on ne le renseigne pas
        price: raceData.price ? parseFloat(raceData.price) : undefined
      })
    }
  }

    // Explicit race objects (race_0, race_1, etc.)
    for (const [key, value] of Object.entries(selectedChanges)) {
      if (key.startsWith('race_') && typeof value === 'object') {
        races.push(value)
      }
    }

    // Single race from flat fields
    if (races.length === 0 && (selectedChanges.runDistance || selectedChanges.price || selectedChanges.raceName)) {
      races.push({
        name: this.extractNewValue(selectedChanges.raceName) || 'Course principale',
        editionYear: this.extractNewValue(selectedChanges.year) || new Date().getFullYear().toString(),
        
        // Dates
        startDate: this.extractDate(selectedChanges.raceStartDate),
        registrationOpeningDate: this.extractDate(selectedChanges.raceRegistrationOpeningDate),
        registrationClosingDate: this.extractDate(selectedChanges.raceRegistrationClosingDate),
        
        // Prix
        price: this.extractFloat(selectedChanges.price),
        priceType: this.extractNewValue(selectedChanges.priceType) || 'PER_PERSON',
        paymentCollectionType: this.extractNewValue(selectedChanges.paymentCollectionType) || 'SINGLE',
        
        // Distances
        runDistance: this.extractFloat(selectedChanges.runDistance),
        runDistance2: this.extractFloat(selectedChanges.runDistance2),
        bikeDistance: this.extractFloat(selectedChanges.bikeDistance),
        swimDistance: this.extractFloat(selectedChanges.swimDistance),
        walkDistance: this.extractFloat(selectedChanges.walkDistance),
        bikeRunDistance: this.extractFloat(selectedChanges.bikeRunDistance),
        swimRunDistance: this.extractFloat(selectedChanges.swimRunDistance),
        
        // Dénivelés
        runPositiveElevation: this.extractFloat(selectedChanges.runPositiveElevation),
        runNegativeElevation: this.extractFloat(selectedChanges.runNegativeElevation),
        bikePositiveElevation: this.extractFloat(selectedChanges.bikePositiveElevation),
        bikeNegativeElevation: this.extractFloat(selectedChanges.bikeNegativeElevation),
        walkPositiveElevation: this.extractFloat(selectedChanges.walkPositiveElevation),
        walkNegativeElevation: this.extractFloat(selectedChanges.walkNegativeElevation),
        
        // Catégories
        categoryLevel1: this.extractNewValue(selectedChanges.categoryLevel1),
        categoryLevel2: this.extractNewValue(selectedChanges.categoryLevel2),
        distanceCategory: this.extractNewValue(selectedChanges.distanceCategory),
        distance: this.extractNewValue(selectedChanges.distance),  // @deprecated
        type: this.extractNewValue(selectedChanges.type),          // @deprecated
        
        // Métadonnées
        federationId: this.extractNewValue(selectedChanges.federationId),
        licenseNumberType: this.extractNewValue(selectedChanges.licenseNumberType),
        dataSource: this.extractNewValue(selectedChanges.dataSource) || 'FEDERATION',
        
        // Configuration inscription (valeurs par défaut dans createRace)
        askAttendeeGender: this.extractNewValue(selectedChanges.askAttendeeGender),
        askAttendeeBirthDate: this.extractNewValue(selectedChanges.askAttendeeBirthDate),
        askAttendeePhoneNumber: this.extractNewValue(selectedChanges.askAttendeePhoneNumber),
        askAttendeeNationality: this.extractNewValue(selectedChanges.askAttendeeNationality),
        askAttendeePostalAddress: this.extractNewValue(selectedChanges.askAttendeePostalAddress),
        showClubOrAssoInput: this.extractNewValue(selectedChanges.showClubOrAssoInput),
        showPublicationConsentCheckbox: this.extractNewValue(selectedChanges.showPublicationConsentCheckbox),
        
        // Équipes
        minTeamSize: this.extractInt(selectedChanges.minTeamSize),
        maxTeamSize: this.extractInt(selectedChanges.maxTeamSize),
        
        // Fonctionnalités
        isWaitingList: this.extractNewValue(selectedChanges.isWaitingList),
        resaleEnabled: this.extractNewValue(selectedChanges.resaleEnabled),
        externalFunnelURL: this.extractNewValue(selectedChanges.externalFunnelURL),
        
        // Justificatifs
        adultJustificativeOptions: this.extractNewValue(selectedChanges.adultJustificativeOptions),
        minorJustificativeOptions: this.extractNewValue(selectedChanges.minorJustificativeOptions),
        
        // Autres
        timeZone: this.extractNewValue(selectedChanges.timeZone)
      })
    }

    return races
  }

  /**
   * Build update data from selected changes
   */
  private buildUpdateData(selectedChanges: Record<string, any>): Record<string, any> {
    const updateData: Record<string, any> = {}

    for (const [field, value] of Object.entries(selectedChanges)) {
      const extractedValue = this.extractNewValue(value)
      if (extractedValue !== undefined && extractedValue !== null) {
        updateData[field] = extractedValue
      }
    }

    return updateData
  }

  /**
   * Build race update data (excluding raceId and raceName)
   */
  private buildRaceUpdateData(raceChange: Record<string, any>): Record<string, any> {
    const updateData: Record<string, any> = {}

    for (const [field, value] of Object.entries(raceChange)) {
      if (field === 'raceId' || field === 'raceName') continue

      const extractedValue = this.extractNewValue(value)
      if (extractedValue !== undefined && extractedValue !== null) {
        updateData[field] = extractedValue
      }
    }

    return updateData
  }

  /**
   * Extract new value from change object {old, new, confidence} or {current, proposed}
   */
  private extractNewValue(value: any): any {
    if (value && typeof value === 'object' && ('new' in value || 'proposed' in value)) {
      return 'new' in value ? value.new : value.proposed
    }
    return value
  }
  
  /**
   * Helper to extract value and parse as float
   */
  private extractFloat(value: any): number | undefined {
    const extracted = this.extractNewValue(value)
    return extracted ? parseFloat(extracted) : undefined
  }
  
  /**
   * Helper to extract value and parse as int
   */
  private extractInt(value: any): number | undefined {
    const extracted = this.extractNewValue(value)
    return extracted ? parseInt(extracted) : undefined
  }
  
  /**
   * Helper to extract value and parse as Date
   */
  private extractDate(value: any): Date | null {
    const extracted = this.extractNewValue(value)
    return extracted ? new Date(extracted) : null
  }

  /**
   * Helper to parse a raw date value (without extractNewValue)
   * Used when value is already extracted (e.g. from edition.new.startDate)
   */
  private parseDate(value: any): Date | null {
    if (!value) return null
    return new Date(value)
  }

  /**
   * Create error result
   */
  private errorResult(field: string, message: string): ProposalApplicationResult {
    return {
      success: false,
      appliedChanges: {},
      errors: [{
        field,
        message,
        severity: 'error'
      }]
    }
  }

  /**
   * Extract department code from subdivision name
   * Ex: "Côte-d'Or" → "21", "Paris" → "75"
   */
  private extractDepartmentCode(subdivisionName?: string): string {
    if (!subdivisionName) return ''
    
    // Mapping départements français (101 départements)
    const departmentCodes: Record<string, string> = {
      // Métropole (01-95)
      'Ain': '01',
      'Aisne': '02',
      'Allier': '03',
      'Alpes-de-Haute-Provence': '04',
      'Hautes-Alpes': '05',
      'Alpes-Maritimes': '06',
      'Ardèche': '07',
      'Ardennes': '08',
      'Ariège': '09',
      'Aube': '10',
      'Aude': '11',
      'Aveyron': '12',
      'Bouches-du-Rhône': '13',
      'Calvados': '14',
      'Cantal': '15',
      'Charente': '16',
      'Charente-Maritime': '17',
      'Cher': '18',
      'Corrèze': '19',
      'Corse-du-Sud': '2A',
      'Haute-Corse': '2B',
      'Côte-d\'Or': '21',
      'Côtes-d\'Armor': '22',
      'Creuse': '23',
      'Dordogne': '24',
      'Doubs': '25',
      'Drôme': '26',
      'Eure': '27',
      'Eure-et-Loir': '28',
      'Finistère': '29',
      'Gard': '30',
      'Haute-Garonne': '31',
      'Gers': '32',
      'Gironde': '33',
      'Hérault': '34',
      'Ille-et-Vilaine': '35',
      'Indre': '36',
      'Indre-et-Loire': '37',
      'Isère': '38',
      'Jura': '39',
      'Landes': '40',
      'Loir-et-Cher': '41',
      'Loire': '42',
      'Haute-Loire': '43',
      'Loire-Atlantique': '44',
      'Loiret': '45',
      'Lot': '46',
      'Lot-et-Garonne': '47',
      'Lozère': '48',
      'Maine-et-Loire': '49',
      'Manche': '50',
      'Marne': '51',
      'Haute-Marne': '52',
      'Mayenne': '53',
      'Meurthe-et-Moselle': '54',
      'Meuse': '55',
      'Morbihan': '56',
      'Moselle': '57',
      'Nièvre': '58',
      'Nord': '59',
      'Oise': '60',
      'Orne': '61',
      'Pas-de-Calais': '62',
      'Puy-de-Dôme': '63',
      'Pyrénées-Atlantiques': '64',
      'Hautes-Pyrénées': '65',
      'Pyrénées-Orientales': '66',
      'Bas-Rhin': '67',
      'Haut-Rhin': '68',
      'Rhône': '69',
      'Haute-Saône': '70',
      'Saône-et-Loire': '71',
      'Sarthe': '72',
      'Savoie': '73',
      'Haute-Savoie': '74',
      'Paris': '75',
      'Seine-Maritime': '76',
      'Seine-et-Marne': '77',
      'Yvelines': '78',
      'Deux-Sèvres': '79',
      'Somme': '80',
      'Tarn': '81',
      'Tarn-et-Garonne': '82',
      'Var': '83',
      'Vaucluse': '84',
      'Vendée': '85',
      'Vienne': '86',
      'Haute-Vienne': '87',
      'Vosges': '88',
      'Yonne': '89',
      'Territoire de Belfort': '90',
      'Essonne': '91',
      'Hauts-de-Seine': '92',
      'Seine-Saint-Denis': '93',
      'Val-de-Marne': '94',
      'Val-d\'Oise': '95',
      // DOM-TOM
      'Guadeloupe': '971',
      'Martinique': '972',
      'Guyane': '973',
      'La Réunion': '974',
      'Mayotte': '976'
    }
    
    return departmentCodes[subdivisionName] || ''
  }

  /**
   * Extract region code from subdivision name
   * Ex: "Grand Est" → "GES", "Île-de-France" → "IDF"
   */
  private extractRegionCode(regionName?: string): string {
    if (!regionName) return ''
    
    // Mapping régions françaises (13 régions métropolitaines + 5 DOM)
    const regionCodes: Record<string, string> = {
      // Métropole
      'Auvergne-Rhône-Alpes': 'ARA',
      'Bourgogne-Franche-Comté': 'BFC',
      'Bretagne': 'BRE',
      'Centre-Val de Loire': 'CVL',
      'Corse': 'COR',
      'Grand Est': 'GES',
      'Hauts-de-France': 'HDF',
      'Île-de-France': 'IDF',
      'Normandie': 'NOR',
      'Nouvelle-Aquitaine': 'NAQ',
      'Occitanie': 'OCC',
      'Pays de la Loire': 'PDL',
      'Provence-Alpes-Côte d\'Azur': 'PAC',
      // DOM-TOM
      'Guadeloupe': 'GUA',
      'Martinique': 'MTQ',
      'Guyane': 'GUY',
      'La Réunion': 'REU',
      'Mayotte': 'MAY'
    }
    
    return regionCodes[regionName] || ''
  }

  /**
   * Build full address from components
   */
  private buildFullAddress(city: string, department: string, country: string): string {
    const parts = [city, department]
    
    // Ajouter le pays si différent de FR
    if (country !== 'FR') {
      const countryNames: Record<string, string> = {
        'FR': 'France',
        'BE': 'Belgique',
        'CH': 'Suisse',
        'LU': 'Luxembourg',
        'MC': 'Monaco'
      }
      parts.push(countryNames[country] || country)
    } else {
      parts.push('France')
    }
    
    return parts.filter(Boolean).join(', ')
  }

  /**
   * Generate event slug from name and ID
   * Ex: "Semi-Marathon du Grand Nancy" + 15178 → "semi-marathon-du-grand-nancy-15178"
   */
  private generateEventSlug(name: string, id: number): string {
    const slugifiedName = name
      .toLowerCase()
      .normalize('NFD') // Décompose les caractères accentués
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-z0-9\s-]/g, '') // Garde uniquement lettres, chiffres, espaces et tirets
      .trim()
      .replace(/\s+/g, '-') // Remplace espaces par tirets
      .replace(/-+/g, '-') // Supprime tirets multiples
    
    return `${slugifiedName}-${id}`
  }

  /**
   * Geocode city to get coordinates using Nominatim API (OpenStreetMap)
   * Rate limit: 1 request per second (enforced by sleep)
   * 
   * @param city - City name
   * @param country - Country code (FR, BE, etc.)
   * @returns Coordinates or null if geocoding failed
   */
  private async geocodeCity(city: string, country: string): Promise<{latitude: number, longitude: number} | null> {
    try {
      this.logger.info(`Tentative de géocodage pour: ${city}, ${country}`)
      
      // Construire la requête pour Nominatim
      const countryName = this.getCountryName(country)
      const query = `${city}, ${countryName}`
      const url = `https://nominatim.openstreetmap.org/search?` + 
                  `q=${encodeURIComponent(query)}&` +
                  `format=json&` +
                  `limit=1&` +
                  `addressdetails=1`
      
      this.logger.debug(`Requête Nominatim: ${url}`)
      
      // Respect rate limiting Nominatim (max 1 req/sec)
      await this.sleep(1100) // 1.1 sec pour être sûr
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Miles-Republic-Data-Agents/1.0 (contact@milesrepublic.com)'
        }
      })
      
      if (!response.ok) {
        this.logger.warn(`Erreur Nominatim HTTP ${response.status} pour ${city}`)
        return null
      }
      
      const data = await response.json() as Array<{
        lat: string
        lon: string
        display_name?: string
      }>
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        this.logger.warn(`Aucun résultat Nominatim pour ${city}, ${country}`)
        return null
      }
      
      const result = data[0]
      const latitude = parseFloat(result.lat)
      const longitude = parseFloat(result.lon)
      
      if (isNaN(latitude) || isNaN(longitude)) {
        this.logger.warn(`Coordonnées invalides pour ${city}: lat=${result.lat}, lon=${result.lon}`)
        return null
      }
      
      this.logger.info(`✅ Géocodage réussi pour ${city}: ${latitude}, ${longitude}`)
      return { latitude, longitude }
      
    } catch (error) {
      this.logger.error(`Erreur lors du géocodage de ${city}:`, error)
      return null
    }
  }
  
  /**
   * Get full country name from country code
   */
  private getCountryName(countryCode: string): string {
    const countryNames: Record<string, string> = {
      'FR': 'France',
      'BE': 'Belgique',
      'CH': 'Suisse',
      'LU': 'Luxembourg',
      'MC': 'Monaco',
      'DE': 'Allemagne',
      'ES': 'Espagne',
      'IT': 'Italie',
      'GB': 'United Kingdom',
      'US': 'United States'
    }
    return countryNames[countryCode] || countryCode
  }
  
  /**
   * Sleep for specified milliseconds (for rate limiting)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Infer dataSource from agent type or proposal context
   */
  private inferDataSource(selectedChanges: Record<string, any>): string {
    // Vérifier si la proposition vient d'un agent fédération
    const agentName = selectedChanges._agentName || ''
    
    if (agentName.toLowerCase().includes('ffa') || 
        agentName.toLowerCase().includes('federation')) {
      return 'FEDERATION'
    }
    
    if (agentName.toLowerCase().includes('timer') || 
        agentName.toLowerCase().includes('chronometeur')) {
      return 'TIMER'
    }
    
    return 'OTHER'
  }
}
