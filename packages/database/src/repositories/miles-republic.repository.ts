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
  constructor(
    private milesDb: any,
    private auditUser: string = 'data-agents' // Nom de l'agent ou utilisateur pour l'audit trail
  ) {}

  // ============== EVENT OPERATIONS ==============

  /**
   * Create a new event in Miles Republic
   */
  async createEvent(data: {
    // Requis
    name: string
    city: string
    country: string
    countrySubdivisionNameLevel1: string
    countrySubdivisionNameLevel2: string
    countrySubdivisionDisplayCodeLevel2: string
    
    // Optionnels
    countrySubdivisionDisplayCodeLevel1?: string
    longitude?: number
    latitude?: number
    peyceReview?: string
    websiteUrl?: string
    facebookUrl?: string
    twitterUrl?: string
    instagramUrl?: string
    images?: string[]
    coverImage?: string
    fullAddress?: string
    
    // Flags
    isFeatured?: boolean
    isPrivate?: boolean
    isRecommended?: boolean
    
    // Métadonnées
    status?: string  // 'DRAFT' | 'REVIEW' | 'LIVE' | 'DELETED' | 'DEAD'
    dataSource?: string  // 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
    slug?: string
  }) {
    // 🔍 Déboggage : afficher data reçu AVANT l'appel Prisma
    console.log('🔍 [REPO] createEvent - data reçu:', {
      dataKeys: Object.keys(data),
      hasIdInData: 'id' in data,
      dataId: (data as any).id,
      name: data.name,
      city: data.city
    })
    
    const prismaData = {
      // Champs obligatoires
      name: data.name,
      city: data.city,
      country: data.country || 'France',
      countrySubdivisionNameLevel1: data.countrySubdivisionNameLevel1 || '',
      countrySubdivisionNameLevel2: data.countrySubdivisionNameLevel2 || '',
      countrySubdivisionDisplayCodeLevel2: data.countrySubdivisionDisplayCodeLevel2 || '',
      
      // Champs optionnels
      countrySubdivisionDisplayCodeLevel1: data.countrySubdivisionDisplayCodeLevel1,
      longitude: data.longitude,
      latitude: data.latitude,
      peyceReview: data.peyceReview,
      websiteUrl: data.websiteUrl,
      facebookUrl: data.facebookUrl,
      twitterUrl: data.twitterUrl,
      instagramUrl: data.instagramUrl,
      images: data.images || [],
      coverImage: data.coverImage,
      fullAddress: data.fullAddress,
      slug: data.slug,
      
      // Flags
      isPrivate: data.isPrivate ?? false,
      isFeatured: data.isFeatured ?? false,
      isRecommended: data.isRecommended ?? false,
      
      // Métadonnées
      status: data.status || 'LIVE',
      dataSource: data.dataSource,
      
      // Flags Algolia
      toUpdate: true,
      algoliaObjectToUpdate: true,
      algoliaObjectToDelete: false,
      
      // Audit
      createdBy: this.auditUser,
      updatedBy: this.auditUser
    }
    
    console.log('🔍 [REPO] createEvent - prismaData construct:', {
      prismaDataKeys: Object.keys(prismaData),
      hasIdInPrismaData: 'id' in prismaData,
      prismaDataId: (prismaData as any).id
    })
    
    return this.milesDb.event.create({
      data: prismaData
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
        updatedBy: this.auditUser,
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
    // Requis
    eventId: number
    year: string
    
    // Dates
    startDate?: Date | null
    endDate?: Date | null
    registrationOpeningDate?: Date | null
    registrationClosingDate?: Date | null
    confirmedAt?: Date | null
    
    // Statuts
    calendarStatus?: string  // 'CONFIRMED' | 'CANCELED' | 'TO_BE_CONFIRMED'
    clientStatus?: string  // 'EXTERNAL_SALES_FUNNEL' | 'INTERNAL_SALES_FUNNEL' | 'NEW_SALES_FUNNEL'
    status?: string  // 'DRAFT' | 'LIVE'
    
    // Configuration
    currency?: string
    timeZone?: string
    medusaVersion?: string  // 'V1' | 'V2'
    customerType?: string  // 'BASIC' | 'PREMIUM' | 'ESSENTIAL' | 'MEDIA' | 'LEAD_INT' | 'LEAD_EXT'
    
    // Informations
    registrantsNumber?: number
    whatIsIncluded?: string
    clientExternalUrl?: string
    bibWithdrawalFullAddress?: string
    volunteerCode?: string
    
    // Flags
    isAttendeeListPublic?: boolean
    publicAttendeeListColumns?: string[]
    hasEditedDates?: boolean
    toUpdate?: boolean
    
    // Métadonnées
    federationId?: string
    dataSource?: string  // 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
    airtableId?: string
    organizerStripeConnectedAccountId?: string
    organizationId?: number
    currentEditionEventId?: number
    slug?: string
  }) {
    return this.milesDb.edition.create({
      data: {
        // Champs obligatoires
        eventId: data.eventId,
        year: data.year,
        
        // Dates
        startDate: data.startDate,
        endDate: data.endDate,
        registrationOpeningDate: data.registrationOpeningDate,
        registrationClosingDate: data.registrationClosingDate,
        confirmedAt: data.confirmedAt,
        
        // Statuts
        calendarStatus: data.calendarStatus || 'TO_BE_CONFIRMED',
        clientStatus: data.clientStatus || 'NEW_SALES_FUNNEL',
        status: data.status || 'LIVE',
        
        // Configuration
        currency: data.currency || 'EUR',
        timeZone: data.timeZone || 'Europe/Paris',
        medusaVersion: data.medusaVersion || 'V1',
        customerType: data.customerType,
        
        // Informations
        registrantsNumber: data.registrantsNumber,
        whatIsIncluded: data.whatIsIncluded,
        clientExternalUrl: data.clientExternalUrl,
        bibWithdrawalFullAddress: data.bibWithdrawalFullAddress,
        volunteerCode: data.volunteerCode,
        slug: data.slug,
        
        // Flags
        isAttendeeListPublic: data.isAttendeeListPublic ?? true,
        publicAttendeeListColumns: data.publicAttendeeListColumns || [],
        hasEditedDates: data.hasEditedDates ?? false,
        toUpdate: data.toUpdate ?? false,
        
        // Métadonnées
        federationId: data.federationId,
        dataSource: data.dataSource,
        airtableId: data.airtableId,
        organizerStripeConnectedAccountId: data.organizerStripeConnectedAccountId,
        organizationId: data.organizationId,
        currentEditionEventId: data.currentEditionEventId,
        
        // Audit
        createdBy: this.auditUser,
        updatedBy: this.auditUser
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
        updatedBy: this.auditUser,
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
        races: true,
        editionPartners: true
      }
    })
  }

  // ============== EDITION PARTNER OPERATIONS ==============

  /**
   * Upsert (create or update) an organizer EditionPartner
   * If an ORGANIZER already exists for this edition, update it. Otherwise, create a new one.
   */
  async upsertOrganizerPartner(editionId: number, organizerData: {
    name?: string
    websiteUrl?: string
    email?: string
    phone?: string
    facebookUrl?: string
    instagramUrl?: string
  }) {
    // Find existing ORGANIZER partner
    const existingOrganizer = await this.milesDb.editionPartner.findFirst({
      where: {
        editionId,
        role: 'ORGANIZER'
      }
    })

    const partnerData = {
      role: 'ORGANIZER',
      name: organizerData.name || null,
      websiteUrl: organizerData.websiteUrl || null,
      facebookUrl: organizerData.facebookUrl || null,
      instagramUrl: organizerData.instagramUrl || null,
      // Note: email et phone ne sont pas dans le schéma EditionPartner
      // Ils seraient dans une autre table (Organization ou Contact)
    }

    if (existingOrganizer) {
      // Update existing
      return this.milesDb.editionPartner.update({
        where: { id: existingOrganizer.id },
        data: partnerData
      })
    } else {
      // Create new
      return this.milesDb.editionPartner.create({
        data: {
          ...partnerData,
          editionId
        }
      })
    }
  }

  /**
   * Find all EditionPartners for an edition
   */
  async findEditionPartners(editionId: number) {
    return this.milesDb.editionPartner.findMany({
      where: { editionId }
    })
  }

  // ============== RACE OPERATIONS ==============

  /**
   * Create a new race
   */
  async createRace(data: {
    // Requis
    editionId: number
    eventId: number
    name: string
    
    // Dates
    startDate?: Date | null
    registrationOpeningDate?: Date | null
    registrationClosingDate?: Date | null
    
    // Prix
    price?: number
    priceType?: string  // 'PER_TEAM' | 'PER_PERSON'
    paymentCollectionType?: string  // 'SINGLE' | 'MULTIPLE'
    
    // Distances (Float)
    runDistance?: number
    runDistance2?: number
    bikeDistance?: number
    swimDistance?: number
    walkDistance?: number
    bikeRunDistance?: number
    swimRunDistance?: number
    
    // Dénivelés (Float)
    runPositiveElevation?: number
    runNegativeElevation?: number
    bikePositiveElevation?: number
    bikeNegativeElevation?: number
    walkPositiveElevation?: number
    walkNegativeElevation?: number
    
    // Catégories
    categoryLevel1?: string
    categoryLevel2?: string
    distanceCategory?: string  // 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
    distance?: string  // @deprecated RaceDistance enum
    type?: any  // @deprecated RaceType enum
    
    // Configuration inscription
    askAttendeeGender?: boolean
    askAttendeeBirthDate?: boolean
    askAttendeePhoneNumber?: boolean
    askAttendeeNationality?: boolean
    askAttendeePostalAddress?: boolean
    showClubOrAssoInput?: boolean
    showPublicationConsentCheckbox?: boolean
    
    // Équipes
    minTeamSize?: number
    maxTeamSize?: number
    
    // Fonctionnalités
    isWaitingList?: boolean
    resaleEnabled?: boolean
    externalFunnelURL?: string
    
    // Stock
    stockDisplayThreshold?: string  // 'BELOW' | 'ALWAYS' | 'NEVER'
    stockDisplayThresholdValue?: number
    
    // Métadonnées
    federationId?: string
    licenseNumberType?: string  // 'FFA' | 'FFTRI' | 'FFS' | 'NONE'
    dataSource?: string  // 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
    adultJustificativeOptions?: string  // 'MEDICAL_CERTIFICATE' | 'NONE'
    minorJustificativeOptions?: string  // 'HEALTH_QUESTIONNAIRE' | 'PARENTAL_AUTHORIZATION' | 'CHECKBOX_AUTHORIZATION' | 'NONE'
    
    // Flags
    isActive?: boolean
    isArchived?: boolean
    toUpdate?: boolean
    displayOrder?: number
    
    // Produits Medusa
    products?: string[]
    timeZone?: string
    slug?: string
  }) {
    return this.milesDb.race.create({
      data: {
        // Champs obligatoires
        editionId: data.editionId,
        eventId: data.eventId,
        name: data.name,
        
        // Dates
        startDate: data.startDate,
        registrationOpeningDate: data.registrationOpeningDate,
        registrationClosingDate: data.registrationClosingDate,
        
        // Prix
        price: data.price,
        priceType: data.priceType || 'PER_PERSON',
        paymentCollectionType: data.paymentCollectionType || 'SINGLE',
        
        // Distances par défaut 0
        runDistance: data.runDistance ?? 0,
        runDistance2: data.runDistance2 ?? 0,
        bikeDistance: data.bikeDistance ?? 0,
        swimDistance: data.swimDistance ?? 0,
        walkDistance: data.walkDistance ?? 0,
        bikeRunDistance: data.bikeRunDistance ?? 0,
        swimRunDistance: data.swimRunDistance ?? 0,
        
        // Dénivelés
        runPositiveElevation: data.runPositiveElevation,
        runNegativeElevation: data.runNegativeElevation,
        bikePositiveElevation: data.bikePositiveElevation,
        bikeNegativeElevation: data.bikeNegativeElevation,
        walkPositiveElevation: data.walkPositiveElevation,
        walkNegativeElevation: data.walkNegativeElevation,
        
        // Catégories
        categoryLevel1: data.categoryLevel1,
        categoryLevel2: data.categoryLevel2,
        distanceCategory: data.distanceCategory,
        distance: data.distance,  // @deprecated
        type: data.type,          // @deprecated
        
        // Champs inscription par défaut true
        askAttendeeGender: data.askAttendeeGender ?? true,
        askAttendeeBirthDate: data.askAttendeeBirthDate ?? true,
        askAttendeePhoneNumber: data.askAttendeePhoneNumber ?? true,
        askAttendeeNationality: data.askAttendeeNationality ?? true,
        askAttendeePostalAddress: data.askAttendeePostalAddress ?? true,
        showClubOrAssoInput: data.showClubOrAssoInput ?? true,
        showPublicationConsentCheckbox: data.showPublicationConsentCheckbox ?? true,
        
        // Équipes
        minTeamSize: data.minTeamSize,
        maxTeamSize: data.maxTeamSize,
        
        // Fonctionnalités par défaut false
        isWaitingList: data.isWaitingList ?? false,
        resaleEnabled: data.resaleEnabled ?? false,
        externalFunnelURL: data.externalFunnelURL,
        
        // Stock par défaut
        stockDisplayThreshold: data.stockDisplayThreshold || 'BELOW',
        stockDisplayThresholdValue: data.stockDisplayThresholdValue ?? 10,
        
        // Métadonnées
        federationId: data.federationId,
        licenseNumberType: data.licenseNumberType,
        dataSource: data.dataSource,
        adultJustificativeOptions: data.adultJustificativeOptions,
        minorJustificativeOptions: data.minorJustificativeOptions,
        timeZone: data.timeZone,
        slug: data.slug,
        
        // Flags
        isActive: data.isActive !== false,
        isArchived: data.isArchived ?? false,
        toUpdate: data.toUpdate ?? false,
        displayOrder: data.displayOrder,
        
        // Produits
        products: data.products || [],
        
        // Audit
        createdBy: this.auditUser,
        updatedBy: this.auditUser
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
        updatedBy: this.auditUser,
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
   * Find all races by edition ID
   */
  async findRacesByEditionId(editionId: number) {
    return this.milesDb.race.findMany({
      where: { editionId },
      orderBy: { name: 'asc' }
    })
  }
  
  /**
   * Delete a race (soft delete)
   * ✅ V2: Utilise isArchived au lieu de archivedAt
   */
  async deleteRace(raceId: number) {
    return this.milesDb.race.update({
      where: { id: raceId },
      data: {
        isArchived: true,
        isActive: false,
        updatedBy: this.auditUser,
        updatedAt: new Date()
      }
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
      updatedBy: this.auditUser,
      updatedAt: new Date(),
      toUpdate: true,
      algoliaObjectToUpdate: true
    })
  }
}
