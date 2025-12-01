import { testDb, testMilesRepublicDb } from './db-setup'

/**
 * Génère un ID unique pour les tests
 */
const generateTestId = () => `cm-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

/**
 * Deep merge de deux objets
 */
const deepMerge = (target: any, source: any): any => {
  const output = { ...target }
  
  if (source === null || source === undefined) {
    return output
  }
  
  Object.keys(source).forEach(key => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && !(source[key] instanceof Date)) {
      output[key] = deepMerge(target[key] || {}, source[key])
    } else {
      output[key] = source[key]
    }
  })
  
  return output
}

// ============================================================================
// PROPOSITION FIXTURES
// ============================================================================

/**
 * Crée une proposition NEW_EVENT avec valeurs par défaut
 * 
 * @param overrides - Valeurs personnalisées
 * @returns Proposition complète prête à être appliquée
 * 
 * @example
 * const proposal = createNewEventProposal({
 *   name: 'Trail des Loups',
 *   city: 'Bonnefontaine'
 * })
 */
export const createNewEventProposal = (overrides: any = {}) => {
  const baseProposal = {
    id: generateTestId(),
    type: 'NEW_EVENT',
    agentId: 'test-agent',
    status: 'APPROVED',
    changes: {
      name: 'Trail Test',
      city: 'Paris',
      country: 'France',
      countrySubdivision: 'Île-de-France',
      websiteUrl: null,
      facebookUrl: null,
      edition: {
        new: {
          year: 2026,
          startDate: '2026-03-15T09:00:00.000Z',
          endDate: '2026-03-15T18:00:00.000Z',
          timeZone: 'Europe/Paris',
          calendarStatus: 'CONFIRMED',
          races: []
        }
      },
      organizer: {
        new: null
      }
    },
    selectedChanges: {},
    userModifiedChanges: {},
    userModifiedRaceChanges: {},
    justification: {},
    confidence: 0.9,
    eventName: 'Trail Test',
    eventCity: 'Paris',
    editionYear: 2026,
    createdAt: new Date(),
    updatedAt: new Date()
  }
  
  const merged = deepMerge(baseProposal, overrides)
  
  // selectedChanges = copy of changes (simulation de l'UI)
  merged.selectedChanges = { ...merged.changes }
  
  return merged
}

/**
 * Crée une proposition EDITION_UPDATE
 * 
 * @param eventId - ID de l'événement existant
 * @param editionId - ID de l'édition existante
 * @param changes - Changements proposés
 * @returns Proposition EDITION_UPDATE
 * 
 * @example
 * const proposal = createEditionUpdateProposal(eventId, editionId, {
 *   startDate: {
 *     old: '2026-03-15T09:00:00.000Z',
 *     new: '2026-03-20T09:00:00.000Z'
 *   }
 * })
 */
export const createEditionUpdateProposal = (
  eventId: number,
  editionId: number,
  changes: any = {}
) => {
  return {
    id: generateTestId(),
    type: 'EDITION_UPDATE',
    agentId: 'test-agent',
    status: 'APPROVED',
    eventId: eventId.toString(),
    editionId: editionId.toString(),
    changes,
    selectedChanges: { ...changes },
    userModifiedChanges: {},
    userModifiedRaceChanges: {},
    justification: {},
    confidence: 0.85,
    eventName: 'Event Test',
    eventCity: 'Paris',
    editionYear: 2026,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

// ============================================================================
// MILES REPUBLIC FIXTURES
// ============================================================================

/**
 * Crée un événement existant en base Miles Republic
 * 
 * @param data - Données personnalisées
 * @returns Event créé
 * 
 * @example
 * const event = await createExistingEvent({
 *   name: 'Trail Original',
 *   city: 'Paris'
 * })
 */
export const createExistingEvent = async (data: any = {}) => {
  return await testMilesRepublicDb.event.create({
    data: {
      name: data.name || 'Event Test',
      city: data.city || 'Paris',
      country: data.country || 'France',
      slug: data.slug || `event-test-${Date.now()}`,
      toUpdate: data.toUpdate !== undefined ? data.toUpdate : true,
      countrySubdivision: data.countrySubdivision || null,
      countrySubdivisionNameLevel1: data.countrySubdivisionNameLevel1 || null,
      countrySubdivisionNameLevel2: data.countrySubdivisionNameLevel2 || null,
      countrySubdivisionDisplayCodeLevel1: data.countrySubdivisionDisplayCodeLevel1 || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      websiteUrl: data.websiteUrl || null,
      facebookUrl: data.facebookUrl || null,
      instagramUrl: data.instagramUrl || null,
      twitterUrl: data.twitterUrl || null,
      fullAddress: data.fullAddress || null
    }
  })
}

/**
 * Crée une édition existante en base Miles Republic
 * 
 * @param eventId - ID de l'événement (optionnel, sera créé si absent)
 * @param data - Données personnalisées
 * @returns Edition créée
 * 
 * @example
 * const edition = await createExistingEdition(eventId, {
 *   year: 2026,
 *   startDate: new Date('2026-03-15T09:00:00.000Z')
 * })
 */
export const createExistingEdition = async (
  eventId?: number,
  data: any = {}
) => {
  let event
  
  if (eventId) {
    event = await testMilesRepublicDb.event.findUnique({
      where: { id: eventId }
    })
  } else {
    event = await createExistingEvent()
  }
  
  if (!event) {
    throw new Error(`Event with ID ${eventId} not found`)
  }
  
  return await testMilesRepublicDb.edition.create({
    data: {
      eventId: event.id,
      year: data.year || 2026,
      startDate: data.startDate || new Date('2026-03-15T09:00:00.000Z'),
      endDate: data.endDate || new Date('2026-03-15T18:00:00.000Z'),
      timeZone: data.timeZone || 'Europe/Paris',
      currentEditionEventId: event.id,
      calendarStatus: data.calendarStatus || 'CONFIRMED',
      registrationOpeningDate: data.registrationOpeningDate || null,
      registrationClosingDate: data.registrationClosingDate || null,
      websiteUrl: data.websiteUrl || null,
      facebookEventUrl: data.facebookEventUrl || null,
      registrationUrl: data.registrationUrl || null,
      dataSource: data.dataSource || 'OTHER',
      organizerId: data.organizerId || null
    }
  })
}

/**
 * Crée une course existante en base Miles Republic
 * 
 * @param data - Données personnalisées (doit contenir editionId)
 * @returns Race créée
 * 
 * @example
 * const race = await createExistingRace({
 *   editionId: edition.id,
 *   name: '10km',
 *   distance: 10
 * })
 */
export const createExistingRace = async (data: any = {}) => {
  let edition
  
  if (data.editionId) {
    edition = await testMilesRepublicDb.edition.findUnique({
      where: { id: data.editionId }
    })
  } else {
    edition = await createExistingEdition()
  }
  
  if (!edition) {
    throw new Error(`Edition with ID ${data.editionId} not found`)
  }
  
  return await testMilesRepublicDb.race.create({
    data: {
      editionId: edition.id,
      name: data.name || '10km Test',
      runDistance: data.runDistance !== undefined ? data.runDistance : (data.distance || 10),
      bikeDistance: data.bikeDistance || null,
      walkDistance: data.walkDistance || null,
      swimDistance: data.swimDistance || null,
      runPositiveElevation: data.runPositiveElevation !== undefined ? data.runPositiveElevation : (data.elevation || null),
      startDate: data.startDate || new Date('2026-03-15T09:00:00.000Z'),
      timeZone: data.timeZone || 'Europe/Paris',
      categoryLevel1: data.categoryLevel1 || 'RUNNING',
      categoryLevel2: data.categoryLevel2 || 'KM10',
      archivedAt: data.archivedAt || null
    }
  })
}

/**
 * Crée un organisateur existant en base Miles Republic
 * 
 * @param data - Données personnalisées
 * @returns Organizer créé
 * 
 * @example
 * const organizer = await createExistingOrganizer({
 *   name: 'Association Trail BFC',
 *   email: 'contact@trail.fr'
 * })
 */
export const createExistingOrganizer = async (data: any = {}) => {
  return await testMilesRepublicDb.organizer.create({
    data: {
      name: data.name || 'Organizer Test',
      legalName: data.legalName || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      city: data.city || null,
      zipCode: data.zipCode || null,
      country: data.country || null,
      websiteUrl: data.websiteUrl || null
    }
  })
}

// ============================================================================
// HELPERS COMPLÉMENTAIRES
// ============================================================================

/**
 * Crée un agent de test en base data-agents
 * 
 * @param data - Données personnalisées
 * @returns Agent créé
 * 
 * @example
 * const agent = await createTestAgent({ name: 'FFA Scraper Test' })
 */
export const createTestAgent = async (data: any = {}) => {
  return await testDb.agent.create({
    data: {
      name: data.name || 'Test Agent',
      type: data.type || 'EXTRACTOR',
      isActive: data.isActive !== undefined ? data.isActive : true,
      frequency: data.frequency || 'DAILY',
      config: data.config || {}
    }
  })
}

/**
 * Crée une proposition complète en base data-agents
 * 
 * @param proposalData - Données de la proposition
 * @returns Proposition créée
 * 
 * @example
 * const proposal = await createTestProposal(createNewEventProposal())
 */
export const createTestProposal = async (proposalData: any) => {
  // Créer l'agent si nécessaire
  let agent = await testDb.agent.findFirst({
    where: { name: 'Test Agent' }
  })
  
  if (!agent) {
    agent = await createTestAgent()
  }
  
  return await testDb.proposal.create({
    data: {
      id: proposalData.id,
      type: proposalData.type,
      agentId: agent.id,
      status: proposalData.status,
      eventId: proposalData.eventId || null,
      editionId: proposalData.editionId || null,
      raceId: proposalData.raceId || null,
      changes: proposalData.changes,
      selectedChanges: proposalData.selectedChanges,
      userModifiedChanges: proposalData.userModifiedChanges,
      userModifiedRaceChanges: proposalData.userModifiedRaceChanges,
      justification: proposalData.justification,
      confidence: proposalData.confidence,
      eventName: proposalData.eventName,
      eventCity: proposalData.eventCity,
      editionYear: proposalData.editionYear,
      approvedBlocks: proposalData.approvedBlocks || {},
      createdAt: proposalData.createdAt,
      updatedAt: proposalData.updatedAt
    }
  })
}

/**
 * Crée un setup complet: Event + Edition + Organizer + Races
 * 
 * @param config - Configuration du setup
 * @returns { event, edition, organizer, races }
 * 
 * @example
 * const setup = await createCompleteSetup({
 *   eventName: 'Trail Test',
 *   raceCount: 3
 * })
 */
export const createCompleteSetup = async (config: {
  eventName?: string
  eventCity?: string
  editionYear?: number
  organizerName?: string
  raceCount?: number
} = {}) => {
  // Créer l'event
  const event = await createExistingEvent({
    name: config.eventName || 'Trail Test',
    city: config.eventCity || 'Paris'
  })
  
  // Créer l'organizer
  const organizer = await createExistingOrganizer({
    name: config.organizerName || 'Test Organizer'
  })
  
  // Créer l'édition
  const edition = await createExistingEdition(event.id, {
    year: config.editionYear || 2026,
    organizerId: organizer.id
  })
  
  // Créer les courses
  const races = []
  const raceCount = config.raceCount || 2
  
  for (let i = 0; i < raceCount; i++) {
    const race = await createExistingRace({
      editionId: edition.id,
      name: `Race ${i + 1}`,
      runDistance: 10 + (i * 5)
    })
    races.push(race)
  }
  
  return { event, edition, organizer, races }
}
