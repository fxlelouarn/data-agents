import { ProposalDomainService } from '@data-agents/database'
import {
  createNewEventProposal,
  testMilesRepublicDb,
  expectObjectFields,
  expectRaceCount,
  expectSlugFormat,
  expectOrganizerLinked,
  expectEditionExists,
  setupProposalService,
  cleanupProposalService,
  cleanDatabase,
  cleanMilesRepublicDatabase
} from './helpers'
import { DatabaseManager } from '@data-agents/agent-framework'

describe('NEW_EVENT - Event Creation', () => {
  let domainService: ProposalDomainService
  let databaseManager: DatabaseManager

  beforeEach(async () => {
    await cleanDatabase()
    await cleanMilesRepublicDatabase()
    
    const setup = await setupProposalService()
    domainService = setup.proposalService
    databaseManager = setup.databaseManager
  })

  afterEach(async () => {
    await cleanupProposalService(databaseManager)
  })

  describe('Event Creation', () => {
    it('should create event with all fields', async () => {
      // Given: Proposition NEW_EVENT avec tous les champs Event
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail des Loups',
          city: 'Bonnefontaine',
          country: 'France',
          countrySubdivision: 'Bourgogne-Franche-Comté',
          websiteUrl: 'https://traildesloups.fr',
          facebookUrl: 'https://facebook.com/traildesloups',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              endDate: '2026-03-15T18:00:00.000Z',
              timeZone: 'Europe/Paris',
              races: []
            }
          }
        }
      })

      // When: Application de la proposition
      const result = await domainService.applyProposal(
        proposal.id,
        proposal.selectedChanges as any,
        { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Event créé avec tous les champs
      const event = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result.createdIds!.eventId!) }
      })

      expectObjectFields(event, {
        name: 'Trail des Loups',
        city: 'Bonnefontaine',
        country: 'France',
        websiteUrl: 'https://traildesloups.fr',
        facebookUrl: 'https://facebook.com/traildesloups',
        toUpdate: true
      })

      expect(event!.slug).toMatch(/^trail-des-loups-\d+$/)
    })

    it('should create event with minimal fields', async () => {
      // Given: Proposition avec champs minimum
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Course Minimale',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: []
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Event créé, champs optionnels null
      const event = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result.createdIds!.eventId!) }
      })

      expectObjectFields(event, {
        name: 'Course Minimale',
        city: 'Paris',
        country: 'France'
      })

      expect(event!.websiteUrl).toBeNull()
      expect(event!.facebookUrl).toBeNull()
      expect(event!.instagramUrl).toBeNull()
    })

    it('should generate slug automatically', async () => {
      // Given: Proposition sans slug
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail des Loups',
          city: 'Paris',
          country: 'France',
          edition: { new: { year: 2026, startDate: '2026-03-15T09:00:00.000Z', races: [] } }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Slug généré au format attendu
      const event = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result.createdIds!.eventId!) }
      })

      expectSlugFormat(event!.slug, 'trail-des-loups')
    })

    it('should set toUpdate to true by default', async () => {
      // Given
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Event Test',
          city: 'Paris',
          country: 'France',
          edition: { new: { year: 2026, startDate: '2026-03-15T09:00:00.000Z', races: [] } }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const event = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result.createdIds!.eventId!) }
      })

      expect(event!.toUpdate).toBe(true)
    })

    it('should create fullAddress if not provided', async () => {
      // Given
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Bonnefontaine',
          country: 'France',
          countrySubdivision: 'Bourgogne-Franche-Comté',
          edition: { new: { year: 2026, startDate: '2026-03-15T09:00:00.000Z', races: [] } }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: fullAddress généré automatiquement
      const event = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result.createdIds!.eventId!) }
      })

      expect(event!.fullAddress).toContain('Bonnefontaine')
      expect(event!.fullAddress).toContain('France')
    })

    it('should handle special characters in event name', async () => {
      // Given: Nom avec caractères spéciaux
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail d\'Ô l\'Eau #5',
          city: 'Paris',
          country: 'France',
          edition: { new: { year: 2026, startDate: '2026-03-15T09:00:00.000Z', races: [] } }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Event créé et slug correct
      const event = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result.createdIds!.eventId!) }
      })

      expect(event!.name).toBe('Trail d\'Ô l\'Eau #5')
      expect(event!.slug).toMatch(/^trail-d-o-l-eau-5-\d+$/)
    })

    it('should handle null optional fields correctly', async () => {
      // Given: Champs optionnels explicitement null
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          websiteUrl: null,
          facebookUrl: null,
          instagramUrl: null,
          twitterUrl: null,
          edition: { new: { year: 2026, startDate: '2026-03-15T09:00:00.000Z', races: [] } }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const event = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result.createdIds!.eventId!) }
      })

      expect(event!.websiteUrl).toBeNull()
      expect(event!.facebookUrl).toBeNull()
      expect(event!.instagramUrl).toBeNull()
      expect(event!.twitterUrl).toBeNull()
    })

    it('should extract region code from countrySubdivision', async () => {
      // Given: Région française
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          countrySubdivision: 'Bourgogne-Franche-Comté',
          edition: { new: { year: 2026, startDate: '2026-03-15T09:00:00.000Z', races: [] } }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Code région extrait
      const event = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result.createdIds!.eventId!) }
      })

      expect(event!.countrySubdivisionDisplayCodeLevel1).toBe('BFC')
    })

    it('should return createdEventId and createdEditionId', async () => {
      // Given
      const proposal = await createNewEventProposal()

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      expect(result.createdIds).toBeDefined()
      expect(result.createdIds!.eventId).toBeDefined()
      expect(parseInt(result.createdIds!.eventId!)).toBeGreaterThan(0)
      expect(result.createdIds!.editionId).toBeDefined()
      expect(parseInt(result.createdIds!.editionId!)).toBeGreaterThan(0)
    })

    it('should create unique slugs for events with same name', async () => {
      // Given: Deux événements avec le même nom
      const proposal1 = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: { new: { year: 2026, startDate: '2026-03-15T09:00:00.000Z', races: [] } }
        }
      })

      const proposal2 = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Lyon',
          country: 'France',
          edition: { new: { year: 2026, startDate: '2026-03-20T09:00:00.000Z', races: [] } }
        }
      })

      // When
      const result1 = await domainService.applyProposal(
        proposal1.id,  // ✅ Passer l'ID string, pas l'objet
        proposal1.selectedChanges as any,
        { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      const result2 = await domainService.applyProposal(
        proposal2.id,  // ✅ Passer l'ID string, pas l'objet
        proposal2.selectedChanges as any,
        { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Slugs différents
      const event1 = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result1.createdIds!.eventId!) }
      })

      const event2 = await testMilesRepublicDb.event.findUnique({
        where: { id: parseInt(result2.createdIds!.eventId!) }
      })

      expect(event1!.slug).not.toBe(event2!.slug)
      expect(event1!.slug).toMatch(/^trail-test-\d+$/)
      expect(event2!.slug).toMatch(/^trail-test-\d+$/)
    })
  })

  describe('Edition Creation', () => {
    it('should create edition with all fields', async () => {
      // Given: Proposition avec édition complète
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              endDate: '2026-03-15T18:00:00.000Z',
              timeZone: 'Europe/Paris',
              calendarStatus: 'CONFIRMED',
              websiteUrl: 'https://edition2026.com',
              registrationUrl: 'https://register.com',
              races: []
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Edition créée
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expectObjectFields(edition, {
        year: 2026,
        startDate: new Date('2026-03-15T09:00:00.000Z'),
        endDate: new Date('2026-03-15T18:00:00.000Z'),
        timeZone: 'Europe/Paris',
        calendarStatus: 'CONFIRMED',
        websiteUrl: 'https://edition2026.com',
        registrationUrl: 'https://register.com'
      })

      expect(edition!.currentEditionEventId).toBe(parseInt(result.createdIds!.eventId!))
    })

    it('should set currentEditionEventId automatically', async () => {
      // Given
      const proposal = await createNewEventProposal()

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expect(edition!.currentEditionEventId).toBe(parseInt(result.createdIds!.eventId!))
      expect(edition!.eventId).toBe(parseInt(result.createdIds!.eventId!))
    })

    it('should deduce dataSource automatically from agent', async () => {
      // Given: Agent FFA
      const proposal = await createNewEventProposal({
        agentId: 'ffa-scraper'
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: dataSource = FEDERATION
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expect(edition!.dataSource).toBe('FEDERATION')
    })

    it('should handle edition without endDate', async () => {
      // Given: Pas de endDate
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              timeZone: 'Europe/Paris',
              races: []
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: endDate peut être null ou égale à startDate
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expect(edition).not.toBeNull()
      // endDate sera soit null soit égale à startDate selon la logique métier
    })

    it('should handle different timezones', async () => {
      // Given: Timezone DOM-TOM
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Guadeloupe',
          city: 'Pointe-à-Pitre',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              timeZone: 'America/Guadeloupe',
              races: []
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expect(edition!.timeZone).toBe('America/Guadeloupe')
    })

    it('should set default calendarStatus if not provided', async () => {
      // Given: Pas de calendarStatus
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              timeZone: 'Europe/Paris',
              races: []
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: calendarStatus défini
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expect(edition!.calendarStatus).toBeDefined()
    })

    it('should link edition to created event', async () => {
      // Given
      const proposal = await createNewEventProposal()

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Edition liée à l'event
      const edition = await expectEditionExists(parseInt(result.createdIds!.editionId!))

      expect(edition.eventId).toBe(parseInt(result.createdIds!.eventId!))
      expect(edition.event).toBeDefined()
      expect(edition.event.id).toBe(parseInt(result.createdIds!.eventId!))
    })

    it('should handle optional edition fields as null', async () => {
      // Given: Champs optionnels non fournis
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              timeZone: 'Europe/Paris',
              races: []
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expect(edition!.websiteUrl).toBeNull()
      expect(edition!.registrationUrl).toBeNull()
      expect(edition!.facebookEventUrl).toBeNull()
    })
  })

  describe.skip('Organizer Creation', () => {
    it('should create organizer when provided', async () => {
      // Given: Proposition avec organisateur
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: []
            }
          },
          organizer: {
            new: {
              name: 'Association Trail BFC',
              email: 'contact@trailbfc.fr',
              phone: '0601020304',
              city: 'Dijon',
              country: 'France'
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Organizer créé et lié
      const organizer = await expectOrganizerLinked(
        parseInt(result.createdIds!.editionId!),
        'Association Trail BFC'
      )

      expectObjectFields(organizer, {
        email: 'contact@trailbfc.fr',
        phone: '0601020304',
        city: 'Dijon',
        country: 'France'
      })
    })

    it('should not create organizer if not provided', async () => {
      // Given: Pas d'organisateur
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: []
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Pas d'organizer
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expect(edition!.organizerId).toBeNull()
    })

    it('should reuse existing organizer if name matches', async () => {
      // Given: Organisateur existant
      const existingOrg = await testMilesRepublicDb.organizer.create({
        data: {
          name: 'Trail BFC',
          email: 'old@trailbfc.fr'
        }
      })

      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: []
            }
          },
          organizer: {
            new: {
              name: 'Trail BFC',
              email: 'new@trailbfc.fr'
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Organizer réutilisé (pas créé)
      const edition = await testMilesRepublicDb.edition.findUnique({
        where: { id: parseInt(result.createdIds!.editionId!) }
      })

      expect(edition!.organizerId).toBe(existingOrg.id)

      // Vérifier qu'un seul organizer existe
      const allOrganizers = await testMilesRepublicDb.organizer.findMany()
      expect(allOrganizers).toHaveLength(1)
    })

    it('should handle organizer with minimal fields', async () => {
      // Given: Organizer avec nom seulement
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: []
            }
          },
          organizer: {
            new: {
              name: 'Minimal Org'
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const organizer = await expectOrganizerLinked(
        parseInt(result.createdIds!.editionId!),
        'Minimal Org'
      )

      expect(organizer.email).toBeNull()
      expect(organizer.phone).toBeNull()
    })

    it('should handle organizer with all fields', async () => {
      // Given: Tous les champs organizer
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: []
            }
          },
          organizer: {
            new: {
              name: 'Complete Org',
              legalName: 'Association Complete Org',
              email: 'contact@org.fr',
              phone: '0601020304',
              address: '123 rue Test',
              city: 'Paris',
              zipCode: '75001',
              country: 'France',
              websiteUrl: 'https://org.fr'
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const organizer = await expectOrganizerLinked(
        parseInt(result.createdIds!.editionId!),
        'Complete Org'
      )

      expectObjectFields(organizer, {
        legalName: 'Association Complete Org',
        email: 'contact@org.fr',
        phone: '0601020304',
        address: '123 rue Test',
        city: 'Paris',
        zipCode: '75001',
        country: 'France',
        websiteUrl: 'https://org.fr'
      })
    })
  })

  describe('Races Creation', () => {
    it('should create all races', async () => {
      // Given: Proposition avec 3 courses
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              timeZone: 'Europe/Paris',
              races: [
                {
                  name: '10km',
                  runDistance: 10,
                  startDate: '2026-03-15T09:00:00.000Z',
                  categoryLevel1: 'RUNNING',
                  categoryLevel2: 'KM10'
                },
                {
                  name: 'Semi-Marathon',
                  runDistance: 21.1,
                  startDate: '2026-03-15T10:00:00.000Z',
                  categoryLevel1: 'RUNNING',
                  categoryLevel2: 'HALF_MARATHON'
                },
                {
                  name: 'Trail 35km',
                  runDistance: 35,
                  runPositiveElevation: 1500,
                  startDate: '2026-03-15T08:00:00.000Z',
                  categoryLevel1: 'TRAIL',
                  categoryLevel2: 'LONG_TRAIL'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: 3 courses créées
      await expectRaceCount(parseInt(result.createdIds!.editionId!), 3)

      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) },
        orderBy: { startDate: 'asc' }
      })

      expect(races[0].name).toBe('Trail 35km')
      expect(races[0].runDistance).toBe(35)
      expect(races[0].runPositiveElevation).toBe(1500)

      expect(races[1].name).toBe('10km')
      expect(races[1].runDistance).toBe(10)

      expect(races[2].name).toBe('Semi-Marathon')
      expect(races[2].runDistance).toBe(21.1)
    })

    it('should set correct categories', async () => {
      // Given: Courses avec catégories
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: [
                {
                  name: 'Marathon',
                  runDistance: 42.195,
                  categoryLevel1: 'RUNNING',
                  categoryLevel2: 'MARATHON'
                },
                {
                  name: 'Ultra Trail',
                  runDistance: 80,
                  categoryLevel1: 'TRAIL',
                  categoryLevel2: 'ULTRA_TRAIL'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: Catégories correctement assignées
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) }
      })

      expect(races[0].categoryLevel1).toBe('RUNNING')
      expect(races[0].categoryLevel2).toBe('MARATHON')

      expect(races[1].categoryLevel1).toBe('TRAIL')
      expect(races[1].categoryLevel2).toBe('ULTRA_TRAIL')
    })

    it('should handle races without elevation', async () => {
      // Given: Course sans dénivelé
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: [
                {
                  name: '10km Route',
                  runDistance: 10,
                  categoryLevel1: 'RUNNING',
                  categoryLevel2: 'KM10'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) }
      })

      expect(races[0].runPositiveElevation).toBeNull()
    })

    it('should inherit edition timezone for races', async () => {
      // Given
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              timeZone: 'America/Guadeloupe',
              races: [
                {
                  name: '10km',
                  runDistance: 10,
                  startDate: '2026-03-15T09:00:00.000Z'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) }
      })

      expect(races[0].timeZone).toBe('America/Guadeloupe')
    })

    it('should create race with bike distance', async () => {
      // Given: Course cycliste
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Cyclo Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: [
                {
                  name: 'Cyclo 100km',
                  bikeDistance: 100,
                  categoryLevel1: 'CYCLING',
                  categoryLevel2: 'ROAD_CYCLING_TOUR'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) }
      })

      expect(races[0].bikeDistance).toBe(100)
      expect(races[0].runDistance).toBeNull()
    })

    it('should handle multiple distance types (triathlon)', async () => {
      // Given: Triathlon avec swim, bike, run
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Triathlon Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: [
                {
                  name: 'Triathlon Sprint',
                  swimDistance: 0.75,
                  bikeDistance: 20,
                  runDistance: 5,
                  categoryLevel1: 'TRIATHLON',
                  categoryLevel2: 'SPRINT'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) }
      })

      expect(races[0].swimDistance).toBe(0.75)
      expect(races[0].bikeDistance).toBe(20)
      expect(races[0].runDistance).toBe(5)
    })

    it('should create races with different start times', async () => {
      // Given: Courses à heures différentes
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T08:00:00.000Z',
              races: [
                {
                  name: 'Trail Long',
                  runDistance: 50,
                  startDate: '2026-03-15T08:00:00.000Z'
                },
                {
                  name: '10km',
                  runDistance: 10,
                  startDate: '2026-03-15T10:00:00.000Z'
                },
                {
                  name: '5km',
                  runDistance: 5,
                  startDate: '2026-03-15T11:00:00.000Z'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) },
        orderBy: { startDate: 'asc' }
      })

      expect(races[0].startDate).toEqual(new Date('2026-03-15T08:00:00.000Z'))
      expect(races[1].startDate).toEqual(new Date('2026-03-15T10:00:00.000Z'))
      expect(races[2].startDate).toEqual(new Date('2026-03-15T11:00:00.000Z'))
    })

    it('should not create races if array is empty', async () => {
      // Given: Pas de courses
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Trail Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: []
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then: 0 courses
      await expectRaceCount(parseInt(result.createdIds!.editionId!), 0)
    })

    it('should create races with walk distance', async () => {
      // Given: Marche nordique
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Marche Test',
          city: 'Paris',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-03-15T09:00:00.000Z',
              races: [
                {
                  name: 'Marche Nordique 10km',
                  walkDistance: 10,
                  categoryLevel1: 'WALK',
                  categoryLevel2: 'NORDIC_WALK'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) }
      })

      expect(races[0].walkDistance).toBe(10)
      expect(races[0].categoryLevel1).toBe('WALK')
    })

    it('should handle large elevation values', async () => {
      // Given: Ultra trail avec gros D+
      const proposal = await createNewEventProposal({
        changes: {
          name: 'Ultra Test',
          city: 'Chamonix',
          country: 'France',
          edition: {
            new: {
              year: 2026,
              startDate: '2026-08-28T18:00:00.000Z',
              races: [
                {
                  name: 'UTMB',
                  runDistance: 170,
                  runPositiveElevation: 10000,
                  categoryLevel1: 'TRAIL',
                  categoryLevel2: 'ULTRA_TRAIL'
                }
              ]
            }
          }
        }
      })

      // When
      const result = await domainService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }
      )

      // Then
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: parseInt(result.createdIds!.editionId!) }
      })

      expect(races[0].runPositiveElevation).toBe(10000)
    })
  })
})
