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
 * @param saveToDb - Si true, sauvegarde la proposition en DB (défaut: true)
 * @returns Proposition complète prête à être appliquée
 * 
 * @example
 * const proposal = await createNewEventProposal({
 *   changes: {
 *     name: 'Trail des Loups',
 *     city: 'Bonnefontaine'
 *   }
 * })
 */
export const createNewEventProposal = async (overrides: any = {}, saveToDb: boolean = true) => {
  const baseChanges = {
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
  }
  
  const changes = deepMerge(baseChanges, overrides.changes || {})
  
  // ✅ Utiliser 'ffa-scraper' par défaut pour que dataSource = FEDERATION
  const proposalData = {
    type: 'NEW_EVENT',
    agentId: overrides.agentId || 'ffa-scraper',
    status: overrides.status || 'APPROVED',
    changes,
    userModifiedChanges: overrides.userModifiedChanges || {},
    justification: overrides.justification || {},
    confidence: overrides.confidence || 0.9,
    eventName: changes.name,
    eventCity: changes.city,
    editionYear: changes.edition?.new?.year || 2026
  }
  
  // ✅ selectedChanges n'est PAS persisté en DB (champ frontend-only)
  // On le retourne séparément après la création
  const selectedChanges = overrides.selectedChanges || changes
  
  if (!saveToDb) {
    return {
      id: generateTestId(),
      ...proposalData,
      selectedChanges,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
  
  // Créer l'agent s'il n'existe pas (ignore si déjà existant)
  const agent = await testDb.agent.upsert({
    where: { name: proposalData.agentId },
    create: {
      name: proposalData.agentId,
      type: 'EXTRACTOR',
      config: {},
      isActive: true,
      frequency: 'DAILY'
    },
    update: {} // Pas de mise à jour si existe déjà
  })
  
  // Sauvegarder en DB (utiliser l'ID de l'agent, pas le nom)
  // ❌ Ne PAS inclure selectedChanges (n'existe pas dans le schéma Prisma)
  const saved = await testDb.proposal.create({
    data: {
      ...proposalData,
      agentId: agent.id  // ✅ Utiliser l'ID (CUID) de l'agent
    } as any
  })
  
  // ✅ Ajouter selectedChanges au retour (en mémoire uniquement)
  return {
    ...saved,
    selectedChanges
  }
}

/**
 * Crée une proposition EDITION_UPDATE
 * 
 * @param eventId - ID de l'événement existant
 * @param editionId - ID de l'édition existante
 * @param changes - Changements proposés
 * @param saveToDb - Si true, sauvegarde la proposition en DB (défaut: true)
 * @returns Proposition EDITION_UPDATE
 * 
 * @example
 * const proposal = await createEditionUpdateProposal(eventId, editionId, {
 *   startDate: {
 *     old: '2026-03-15T09:00:00.000Z',
 *     new: '2026-03-20T09:00:00.000Z'
 *   }
 * })
 */
export const createEditionUpdateProposal = async (
  eventId: number,
  editionId: number,
  changes: any = {},
  saveToDb: boolean = true
) => {
  const proposalData = {
    type: 'EDITION_UPDATE',
    agentId: 'ffa-scraper',  // ✅ Utiliser ffa-scraper par défaut comme NEW_EVENT
    status: 'APPROVED',
    eventId: eventId.toString(),
    editionId: editionId.toString(),
    changes,
    userModifiedChanges: {},
    justification: {},
    confidence: 0.85,
    eventName: 'Event Test',
    eventCity: 'Paris',
    editionYear: 2026
  }
  
  if (!saveToDb) {
    return {
      id: generateTestId(),
      ...proposalData,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
  
  // Créer l'agent s'il n'existe pas (ignore si déjà existant)
  const agent = await testDb.agent.upsert({
    where: { name: proposalData.agentId },
    create: {
      name: proposalData.agentId,
      type: 'EXTRACTOR',
      config: {},
      isActive: true,
      frequency: 'DAILY'
    },
    update: {} // Pas de mise à jour si existe déjà
  })
  
  // Sauvegarder en DB (utiliser l'ID de l'agent, pas le nom)
  const saved = await testDb.proposal.create({
    data: {
      ...proposalData,
      agentId: agent.id  // ✅ Utiliser l'ID (CUID) de l'agent
    } as any
  })
  
  return saved
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
      status: data.status || 'LIVE',  // ✅ Required field
      toUpdate: data.toUpdate !== undefined ? data.toUpdate : true,
      countrySubdivisionNameLevel1: data.countrySubdivisionNameLevel1 || 'Île-de-France',
      countrySubdivisionNameLevel2: data.countrySubdivisionNameLevel2 || 'Paris',
      countrySubdivisionDisplayCodeLevel1: data.countrySubdivisionDisplayCodeLevel1 || null,
      countrySubdivisionDisplayCodeLevel2: data.countrySubdivisionDisplayCodeLevel2 || 'PAR',  // ✅ Required field
      createdBy: data.createdBy || 'test-agent',  // ✅ Required field
      updatedBy: data.updatedBy || 'test-agent',  // ✅ Required field
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
      year: data.year ? String(data.year) : '2026',  // ✅ Must be String
      status: data.status || 'LIVE',  // ✅ Required field
      startDate: data.startDate || new Date('2026-03-15T09:00:00.000Z'),
      endDate: data.endDate || new Date('2026-03-15T18:00:00.000Z'),
      timeZone: data.timeZone || 'Europe/Paris',
      currentEditionEventId: event.id,
      calendarStatus: data.calendarStatus || 'CONFIRMED',
      registrationOpeningDate: data.registrationOpeningDate || null,
      registrationClosingDate: data.registrationClosingDate || null,
      dataSource: data.dataSource !== undefined ? data.dataSource : null,  // ✅ Default to null (not 'OTHER')
      createdBy: data.createdBy || 'test-agent',  // ✅ Required field
      updatedBy: data.updatedBy || 'test-agent',  // ✅ Required field
      organizationId: data.organizationId || null
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
      // ✅ V2: Utiliser relations connect au lieu de foreign keys directs
      edition: {
        connect: { id: edition.id }
      },
      event: {
        connect: { id: edition.eventId }
      },
      name: data.name || '10km Test',
      // ✅ V2: Distances required - assigner selon le type de course
      runDistance: data.runDistance !== undefined ? data.runDistance : 
                   (data.distance && !data.bikeDistance && !data.walkDistance && !data.swimDistance ? data.distance : 0),
      runDistance2: data.runDistance2 || 0,  // ✅ Required field
      bikeDistance: data.bikeDistance !== undefined ? data.bikeDistance : 
                    (data.distance && data.categoryLevel1 === 'CYCLING' ? data.distance : 0),  // ✅ Required field
      bikeRunDistance: data.bikeRunDistance || 0,  // ✅ V2: New required field
      walkDistance: data.walkDistance !== undefined ? data.walkDistance : 
                    (data.distance && data.categoryLevel1 === 'WALK' ? data.distance : 0),  // ✅ Required field
      swimDistance: data.swimDistance !== undefined ? data.swimDistance : 
                    (data.distance && data.categoryLevel1 === 'TRIATHLON' ? data.distance : 0),  // ✅ Required field
      swimRunDistance: data.swimRunDistance || 0,  // ✅ Required field
      runPositiveElevation: data.runPositiveElevation !== undefined ? data.runPositiveElevation : (data.elevation || null),
      startDate: data.startDate || new Date('2026-03-15T09:00:00.000Z'),
      timeZone: data.timeZone || 'Europe/Paris',
      categoryLevel1: data.categoryLevel1 || 'RUNNING',
      categoryLevel2: data.categoryLevel2 || 'KM10',
      isActive: data.isActive !== undefined ? data.isActive : true,  // ✅ V2: Default true
      isArchived: data.isArchived !== undefined ? data.isArchived : false,  // ✅ V2: Default false
      createdBy: data.createdBy || 'test-agent',  // ✅ Required field
      updatedBy: data.updatedBy || 'test-agent'   // ✅ Required field
    }
  })
}

/**
 * Crée un organisateur existant en base Miles Republic
 * 
 * NOTE: La table Organizer n'existe plus dans Miles Republic.
 * Cette fonction est gardée pour compatibilité mais retourne null.
 */
export const createExistingOrganizer = async (data: any = {}) => {
  console.warn('⚠️  createExistingOrganizer: La table Organizer n\'existe plus dans Miles Republic')
  return null
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
      userModifiedChanges: proposalData.userModifiedChanges,
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
 * Crée un setup complet: Event + Edition + Races
 * 
 * @param config - Configuration du setup
 * @returns { event, edition, organizer: null, races }
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
  
  // NOTE: Organizer supprimé car table n'existe plus dans Miles Republic
  
  // Créer l'édition
  const edition = await createExistingEdition(event.id, {
    year: config.editionYear || 2026
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
  
  return { event, edition, organizer: null, races }
}
