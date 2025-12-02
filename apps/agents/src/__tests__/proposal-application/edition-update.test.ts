import {
  createEditionUpdateProposal,
  createExistingEvent,
  createExistingEdition,
  createExistingRace,
  testMilesRepublicDb,
  expectObjectFields,
  setupProposalService,
  cleanupProposalService,
  cleanDatabase,
  cleanMilesRepublicDatabase
} from './helpers'
import { ProposalDomainService } from '@data-agents/database'
import { DatabaseManager } from '@data-agents/agent-framework'

describe('EDITION_UPDATE - Modifications', () => {
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

  // ==========================================================================
  // MODIFICATION EVENT
  // ==========================================================================

  describe('Event Modifications', () => {
    it('should update only modified event fields', async () => {
      // Given: Event existant + Proposition modifiant 1 champ
      const event = await createExistingEvent({ 
        name: 'Trail Original', 
        city: 'Paris',
        websiteUrl: 'https://old.com'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: {
          old: 'Trail Original',
          new: 'Trail Modifié'
        }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Seul le nom modifié, autres champs intacts
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      
      expect(updated!.name).toBe('Trail Modifié')
      expect(updated!.city).toBe('Paris') // ✅ Inchangé
      expect(updated!.websiteUrl).toBe('https://old.com') // ✅ Inchangé
    })

    it('should update multiple event fields', async () => {
      // Given: Event existant + Proposition modifiant 3 champs
      const event = await createExistingEvent({
        name: 'Trail Original',
        city: 'Paris',
        websiteUrl: 'https://old.com',
        facebookUrl: 'https://facebook.com/old'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        city: { old: 'Paris', new: 'Lyon' },
        websiteUrl: { old: 'https://old.com', new: 'https://new.com' },
        facebookUrl: { old: 'https://facebook.com/old', new: 'https://facebook.com/new' }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: 3 champs modifiés, nom intact
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      
      expect(updated!.city).toBe('Lyon')
      expect(updated!.websiteUrl).toBe('https://new.com')
      expect(updated!.facebookUrl).toBe('https://facebook.com/new')
      expect(updated!.name).toBe('Trail Original') // ✅ Inchangé
    })

    it('should preserve null fields if not modified', async () => {
      // Given: Event avec champs null + Proposition modifiant 1 champ
      const event = await createExistingEvent({
        name: 'Trail Test',
        city: 'Paris',
        websiteUrl: null,
        facebookUrl: null,
        instagramUrl: null
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        websiteUrl: { old: null, new: 'https://new.com' }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Seul websiteUrl modifié, autres null préservés
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      
      expect(updated!.websiteUrl).toBe('https://new.com')
      expect(updated!.facebookUrl).toBeNull() // ✅ Null préservé
      expect(updated!.instagramUrl).toBeNull() // ✅ Null préservé
    })

    it('should update countrySubdivision correctly', async () => {
      // Given: Event avec région + Proposition changeant région
      const event = await createExistingEvent({
        name: 'Trail Test',
        city: 'Paris',
        countrySubdivisionNameLevel1: 'Île-de-France',
        countrySubdivisionDisplayCodeLevel1: 'IDF'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        countrySubdivisionNameLevel1: {
          old: 'Île-de-France',
          new: 'Bourgogne-Franche-Comté'
        }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Région modifiée + Code régional recalculé
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      
      expect(updated!.countrySubdivisionNameLevel1).toBe('Bourgogne-Franche-Comté')
      expect(updated!.countrySubdivisionDisplayCodeLevel1).toBe('BFC')
    })

    it('should clear optional fields when set to null', async () => {
      // Given: Event avec URLs + Proposition vidant les URLs
      const event = await createExistingEvent({
        name: 'Trail Test',
        websiteUrl: 'https://old.com',
        facebookUrl: 'https://facebook.com/old',
        instagramUrl: 'https://instagram.com/old'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        websiteUrl: { old: 'https://old.com', new: null },
        facebookUrl: { old: 'https://facebook.com/old', new: null },
        instagramUrl: { old: 'https://instagram.com/old', new: null }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Champs bien mis à null
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      
      expect(updated!.websiteUrl).toBeNull()
      expect(updated!.facebookUrl).toBeNull()
      expect(updated!.instagramUrl).toBeNull()
    })

    it('should not modify unspecified event fields', async () => {
      // Given: Event avec tous les champs + Proposition modifiant 2 champs
      const event = await createExistingEvent({
        name: 'Trail Test',
        city: 'Paris',
        country: 'France',
        countrySubdivisionNameLevel1: 'Île-de-France',
        websiteUrl: 'https://old.com',
        facebookUrl: 'https://facebook.com/old',
        instagramUrl: 'https://instagram.com/old',
        twitterUrl: 'https://twitter.com/old'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        city: { old: 'Paris', new: 'Lyon' },
        websiteUrl: { old: 'https://old.com', new: 'https://new.com' }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Seulement city et websiteUrl modifiés
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      
      expect(updated!.city).toBe('Lyon')
      expect(updated!.websiteUrl).toBe('https://new.com')
      expect(updated!.name).toBe('Trail Test') // ✅ Inchangé
      expect(updated!.country).toBe('France') // ✅ Inchangé
      expect(updated!.facebookUrl).toBe('https://facebook.com/old') // ✅ Inchangé
      expect(updated!.instagramUrl).toBe('https://instagram.com/old') // ✅ Inchangé
      expect(updated!.twitterUrl).toBe('https://twitter.com/old') // ✅ Inchangé
    })
  })

  // ==========================================================================
  // MODIFICATION EDITION
  // ==========================================================================

  describe('Edition Modifications', () => {
    it('should update edition dates', async () => {
      // Given: Edition existante + Proposition changeant startDate
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        startDate: new Date('2026-03-15T09:00:00.000Z'),
        endDate: new Date('2026-03-15T18:00:00.000Z')
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T10:00:00.000Z'
        }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: startDate modifiée, endDate intacte
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.startDate).toEqual(new Date('2026-03-20T10:00:00.000Z'))
      expect(updated!.endDate).toEqual(new Date('2026-03-15T18:00:00.000Z')) // ✅ Inchangé
    })

    it('should update both startDate and endDate', async () => {
      // Given: Edition + Proposition changeant les 2 dates
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        startDate: new Date('2026-03-15T09:00:00.000Z'),
        endDate: new Date('2026-03-15T18:00:00.000Z')
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T10:00:00.000Z'
        },
        endDate: {
          old: '2026-03-15T18:00:00.000Z',
          new: '2026-03-22T17:00:00.000Z'
        }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Les deux dates modifiées
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.startDate).toEqual(new Date('2026-03-20T10:00:00.000Z'))
      expect(updated!.endDate).toEqual(new Date('2026-03-22T17:00:00.000Z'))
    })

    it('should update calendarStatus', async () => {
      // Given: Edition TO_BE_CONFIRMED + Proposition CONFIRMED
      // Note: ANNOUNCED n'existe pas dans l'enum CalendarStatus MR V2
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, { 
        calendarStatus: 'TO_BE_CONFIRMED' 
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        calendarStatus: { old: 'TO_BE_CONFIRMED', new: 'CONFIRMED' }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Status confirmé
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.calendarStatus).toBe('CONFIRMED')
    })

    it('should update timeZone', async () => {
      // Given: Edition Europe/Paris + Proposition DOM-TOM timezone
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        timeZone: 'Europe/Paris'
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        timeZone: { old: 'Europe/Paris', new: 'America/Guadeloupe' }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Timezone modifié
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.timeZone).toBe('America/Guadeloupe')
    })

    it('should update registrationClosingDate', async () => {
      // Given: Edition sans date de clôture + Proposition ajoutant date
      // Note: websiteUrl, registrationUrl, facebookEventUrl n'existent plus dans Edition MR V2
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        registrationClosingDate: null
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        registrationClosingDate: { old: null, new: '2026-03-10T23:59:59.000Z' }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Date de clôture ajoutée
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.registrationClosingDate).toEqual(new Date('2026-03-10T23:59:59.000Z'))
    })

    it('should update dataSource from null to FEDERATION', async () => {
      // Given: Edition sans dataSource + Proposition FEDERATION
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        dataSource: null
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        dataSource: { old: null, new: 'FEDERATION' }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: dataSource modifié
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.dataSource).toBe('FEDERATION')
    })

    it('should update registration dates', async () => {
      // Given: Edition sans dates inscription + Proposition ajoutant dates
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        registrationOpeningDate: null,
        registrationClosingDate: null
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        registrationOpeningDate: {
          old: null,
          new: '2026-01-01T00:00:00.000Z'
        },
        registrationClosingDate: {
          old: null,
          new: '2026-03-10T23:59:59.000Z'
        }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Dates inscription définies
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.registrationOpeningDate).toEqual(new Date('2026-01-01T00:00:00.000Z'))
      expect(updated!.registrationClosingDate).toEqual(new Date('2026-03-10T23:59:59.000Z'))
    })

    it('should not modify unspecified edition fields', async () => {
      // Given: Edition complète + Proposition modifiant 1 champ
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        year: '2026',
        startDate: new Date('2026-03-15T09:00:00.000Z'),
        endDate: new Date('2026-03-15T18:00:00.000Z'),
        timeZone: 'Europe/Paris',
        calendarStatus: 'CONFIRMED',
        registrationOpeningDate: new Date('2026-01-01T00:00:00.000Z'),
        registrationClosingDate: new Date('2026-03-10T23:59:59.000Z'),
        dataSource: 'FEDERATION'
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        }
      })

      // When
      await domainService.applyProposal(proposal.id, proposal.changes as any, { milesRepublicDatabaseId: 'miles-republic-test', agentName: 'ffa-scraper' })

      // Then: Seule startDate modifiée
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.startDate).toEqual(new Date('2026-03-20T09:00:00.000Z'))
      expect(updated!.year).toBe('2026') // ✅ Inchangé (year is String in MR V2)
      expect(updated!.endDate).toEqual(new Date('2026-03-15T18:00:00.000Z')) // ✅ Inchangé
      expect(updated!.timeZone).toBe('Europe/Paris') // ✅ Inchangé
      expect(updated!.calendarStatus).toBe('CONFIRMED') // ✅ Inchangé
      expect(updated!.registrationOpeningDate).toEqual(new Date('2026-01-01T00:00:00.000Z')) // ✅ Inchangé
      expect(updated!.registrationClosingDate).toEqual(new Date('2026-03-10T23:59:59.000Z')) // ✅ Inchangé
      expect(updated!.dataSource).toBe('FEDERATION') // ✅ Inchangé
    })
  })

  // ==========================================================================
  // NOTE: Tests ORGANIZER supprimés
  // La table Organizer n'existe plus dans Miles Republic V2.
  // Ces tests doivent être migrés vers Organization quand la gestion des
  // organisations sera implémentée.
  // ==========================================================================
})
