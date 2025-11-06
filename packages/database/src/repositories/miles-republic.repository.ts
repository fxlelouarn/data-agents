/**
 * Repository Pattern - Data access for Miles Republic database
 * 
 * Responsibilities:
 * - CRUD operations on Events, Editions, and Races in Miles Republic
 * - Connection management
 * - NO business logic (extracted data, validation rules, etc.)
 * 
 * Note: Uses Prisma client instance for Miles Republic DB
 */
export class MilesRepublicRepository {
  constructor(private milesDb: any) {}

  // ============== EVENT OPERATIONS ==============

  /**
   * Create a new event in Miles Republic
   */
  async createEvent(data: {
    name: string
    city: string
    country: string
    countrySubdivisionNameLevel1?: string
    countrySubdivisionNameLevel2?: string
    websiteUrl?: string
    facebookUrl?: string
    instagramUrl?: string
    twitterUrl?: string
    fullAddress?: string
    latitude?: number
    longitude?: number
    coverImage?: string
    isPrivate?: boolean
    isFeatured?: boolean
    isRecommended?: boolean
    status?: string
  }) {
    return this.milesDb.event.create({
      data: {
        ...data,
        country: data.country || 'FR',
        isPrivate: data.isPrivate || false,
        isFeatured: data.isFeatured || false,
        isRecommended: data.isRecommended || false,
        status: data.status || 'DRAFT',
        createdBy: 'data-agents',
        updatedBy: 'data-agents'
      }
    })
  }

  /**
   * Update an existing event
   */
  async updateEvent(eventId: number, data: Record<string, any>) {
    return this.milesDb.event.update({
      where: { id: eventId },
      data: {
        ...data,
        updatedBy: 'data-agents',
        updatedAt: new Date(),
        toUpdate: true,
        algoliaObjectToUpdate: true
      }
    })
  }

  /**
   * Find event by ID
   */
  async findEventById(eventId: number) {
    return this.milesDb.event.findUnique({
      where: { id: eventId },
      include: {
        editions: true,
        races: true
      }
    })
  }

  // ============== EDITION OPERATIONS ==============

  /**
   * Create a new edition
   */
  async createEdition(data: {
    eventId: number
    year: string
    calendarStatus?: string
    clientStatus?: string
    currency?: string
    customerType?: string
    medusaVersion?: string
    startDate?: Date | null
    endDate?: Date | null
    registrationOpeningDate?: Date | null
    registrationClosingDate?: Date | null
    registrantsNumber?: number
    federationId?: string
    timeZone?: string
    status?: string
  }) {
    return this.milesDb.edition.create({
      data: {
        ...data,
        calendarStatus: data.calendarStatus || 'TO_BE_CONFIRMED',
        currency: data.currency || 'EUR',
        medusaVersion: data.medusaVersion || 'V1',
        timeZone: data.timeZone || 'Europe/Paris',
        status: data.status || 'DRAFT',
        createdBy: 'data-agents',
        updatedBy: 'data-agents'
      }
    })
  }

  /**
   * Update an existing edition
   */
  async updateEdition(editionId: number, data: Record<string, any>) {
    return this.milesDb.edition.update({
      where: { id: editionId },
      data: {
        ...data,
        updatedBy: 'data-agents',
        updatedAt: new Date()
      }
    })
  }

  /**
   * Find edition by ID
   */
  async findEditionById(editionId: number) {
    return this.milesDb.edition.findUnique({
      where: { id: editionId },
      include: {
        event: true,
        races: true
      }
    })
  }

  // ============== RACE OPERATIONS ==============

  /**
   * Create a new race
   */
  async createRace(data: {
    editionId: number
    eventId: number
    name: string
    startDate?: Date | null
    price?: number
    runDistance?: number
    runDistance2?: number
    bikeDistance?: number
    swimDistance?: number
    walkDistance?: number
    bikeRunDistance?: number
    swimRunDistance?: number
    runPositiveElevation?: number
    runNegativeElevation?: number
    bikePositiveElevation?: number
    bikeNegativeElevation?: number
    walkPositiveElevation?: number
    walkNegativeElevation?: number
    categoryLevel1?: string
    categoryLevel2?: string
    distanceCategory?: string
    registrationOpeningDate?: Date | null
    registrationClosingDate?: Date | null
    federationId?: string
    isActive?: boolean
    type?: any  // RaceType (deprecated but still usable)
  }) {
    return this.milesDb.race.create({
      data: {
        ...data,
        runDistance: data.runDistance || 0,
        runDistance2: data.runDistance2 || 0,
        bikeDistance: data.bikeDistance || 0,
        swimDistance: data.swimDistance || 0,
        walkDistance: data.walkDistance || 0,
        bikeRunDistance: data.bikeRunDistance || 0,
        swimRunDistance: data.swimRunDistance || 0,
        isActive: data.isActive !== false,
        createdBy: 'data-agents',
        updatedBy: 'data-agents'
      }
    })
  }

  /**
   * Update an existing race
   */
  async updateRace(raceId: number, data: Record<string, any>) {
    return this.milesDb.race.update({
      where: { id: raceId },
      data: {
        ...data,
        updatedBy: 'data-agents',
        updatedAt: new Date()
      }
    })
  }

  /**
   * Find race by ID
   */
  async findRaceById(raceId: number) {
    return this.milesDb.race.findUnique({
      where: { id: raceId },
      include: {
        edition: true,
        event: true
      }
    })
  }
  
  /**
   * Delete a race
   */
  async deleteRace(raceId: number) {
    return this.milesDb.race.delete({
      where: { id: raceId }
    })
  }

  // ============== BATCH OPERATIONS ==============

  /**
   * Create multiple races for an edition
   */
  async createManyRaces(races: Array<{
    editionId: number
    eventId: number
    name: string
    [key: string]: any
  }>) {
    const createdRaces = []
    for (const raceData of races) {
      const race = await this.createRace(raceData)
      createdRaces.push(race)
    }
    return createdRaces
  }

  /**
   * Update parent event timestamp (to trigger Algolia sync)
   */
  async touchEvent(eventId: number) {
    return this.updateEvent(eventId, {
      updatedBy: 'data-agents',
      updatedAt: new Date(),
      toUpdate: true,
      algoliaObjectToUpdate: true
    })
  }
}
