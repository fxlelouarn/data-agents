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
          result = await this.applyEditionUpdate(proposal.editionId, finalChanges, filteredSelectedChanges, options)
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
      const eventData = this.extractEventData(selectedChanges)
      const editionsData = this.extractEditionsData(selectedChanges)
      const racesData = this.extractRacesData(selectedChanges)

      // Create event
      const event = await milesRepo.createEvent(eventData)

      const createdEditionIds: number[] = []
      const createdRaceIds: number[] = []

      // Create editions
      for (const editionData of editionsData) {
        const edition = await milesRepo.createEdition({
          eventId: event.id,
          ...editionData
        })

        createdEditionIds.push(edition.id)

        // Create races for this edition
        const editionRaces = racesData.filter(race => race.editionYear === editionData.year)
        for (const raceData of editionRaces) {
          const race = await milesRepo.createRace({
            editionId: edition.id,
            eventId: event.id,
            ...raceData
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
    options: ApplyOptions = {}
  ): Promise<ProposalApplicationResult> {
    try {
      const milesRepo = await this.getMilesRepublicRepository(options.milesRepublicDatabaseId)
      const numericEditionId = parseInt(editionId)

      if (isNaN(numericEditionId)) {
        return this.errorResult('editionId', `ID d'édition invalide: ${editionId}`)
      }

      // Separate races from other changes
      let racesChanges: any[] | undefined
      const updateData: Record<string, any> = { calendarStatus: 'CONFIRMED' }

      for (const [field, value] of Object.entries(selectedChanges)) {
        if (field === 'races') {
          racesChanges = value as any[]
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

  /**
   * Extract editions data from selected changes
   */
  private extractEditionsData(selectedChanges: Record<string, any>): any[] {
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

  /**
   * Extract races data from selected changes
   */
  private extractRacesData(selectedChanges: Record<string, any>): any[] {
    const races = []

    for (const [key, value] of Object.entries(selectedChanges)) {
      if (key.startsWith('race_') && typeof value === 'object') {
        races.push(value)
      }
    }

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
}
