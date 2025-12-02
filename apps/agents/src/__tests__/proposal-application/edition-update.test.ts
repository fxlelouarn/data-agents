import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { testDb, testMilesRepublicDb, setupTestEnvironment, teardownTestEnvironment } from './helpers/db-setup'
import { 
  createExistingEvent, 
  createExistingEdition, 
  createExistingOrganizer,
  createExistingRace,
  createEditionUpdateProposal
} from './helpers/fixtures'
import { expectEventFields, expectEditionFields, expectOrganizerFields } from './helpers/assertions'
import { ProposalDomainService } from '../../../../packages/database/src/services/proposal-domain.service'
import { DatabaseManager } from '../../../../packages/agent-framework/src/database-manager'

describe('EDITION_UPDATE - Modifications', () => {
  let proposalService: ProposalDomainService
  let databaseManager: DatabaseManager

  beforeEach(async () => {
    await setupTestEnvironment()
    
    // Initialiser les services
    databaseManager = new DatabaseManager()
    
    // Enregistrer la connexion Miles Republic
    await databaseManager.registerConnection({
      id: 'miles-republic',
      type: 'postgres',
      host: process.env.MILES_REPUBLIC_DATABASE_HOST!,
      port: parseInt(process.env.MILES_REPUBLIC_DATABASE_PORT || '5432'),
      username: process.env.MILES_REPUBLIC_DATABASE_USER!,
      password: process.env.MILES_REPUBLIC_DATABASE_PASSWORD!,
      database: process.env.MILES_REPUBLIC_DATABASE_NAME!,
      schemaPath: 'apps/agents/prisma/miles-republic.prisma'
    })
    
    proposalService = new ProposalDomainService(testDb, databaseManager)
  })

  afterEach(async () => {
    await databaseManager.disconnectAll()
    await teardownTestEnvironment()
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
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

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
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

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
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

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
        countrySubdivision: 'Île-de-France',
        countrySubdivisionDisplayCodeLevel1: 'IDF'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        countrySubdivision: {
          old: 'Île-de-France',
          new: 'Bourgogne-Franche-Comté'
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Région modifiée + Code régional recalculé
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      
      expect(updated!.countrySubdivision).toBe('Bourgogne-Franche-Comté')
      expect(updated!.countrySubdivisionDisplayCodeLevel1).toBe('BFC')
    })

    it('should clear optional fields when set to null', async () => {
      // Given: Event avec URLs + Proposition vidant les URLs
      const event = await createExistingEvent({
        name: 'Trail Test',
        websiteUrl: 'https://old.com',
        facebookUrl: 'https://facebook.com/old'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        websiteUrl: { old: 'https://old.com', new: null },
        facebookUrl: { old: 'https://facebook.com/old', new: null }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Champs bien mis à null
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      
      expect(updated!.websiteUrl).toBeNull()
      expect(updated!.facebookUrl).toBeNull()
    })

    it('should not modify unspecified event fields', async () => {
      // Given: Event avec tous les champs + Proposition modifiant 2 champs
      const event = await createExistingEvent({
        name: 'Trail Test',
        city: 'Paris',
        country: 'France',
        countrySubdivision: 'Île-de-France',
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
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

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
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

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
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Les deux dates modifiées
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.startDate).toEqual(new Date('2026-03-20T10:00:00.000Z'))
      expect(updated!.endDate).toEqual(new Date('2026-03-22T17:00:00.000Z'))
    })

    it('should update calendarStatus', async () => {
      // Given: Edition ANNOUNCED + Proposition CONFIRMED
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, { 
        calendarStatus: 'ANNOUNCED' 
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        calendarStatus: { old: 'ANNOUNCED', new: 'CONFIRMED' }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

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
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Timezone modifié
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.timeZone).toBe('America/Guadeloupe')
    })

    it('should update registration URLs', async () => {
      // Given: Edition sans URLs + Proposition ajoutant URLs
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        websiteUrl: null,
        registrationUrl: null,
        facebookEventUrl: null
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        websiteUrl: { old: null, new: 'https://event.com' },
        registrationUrl: { old: null, new: 'https://register.com' },
        facebookEventUrl: { old: null, new: 'https://facebook.com/event/123' }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: URLs ajoutées
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.websiteUrl).toBe('https://event.com')
      expect(updated!.registrationUrl).toBe('https://register.com')
      expect(updated!.facebookEventUrl).toBe('https://facebook.com/event/123')
    })

    it('should update dataSource', async () => {
      // Given: Edition dataSource OTHER + Proposition FEDERATION
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        dataSource: 'OTHER'
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        dataSource: { old: 'OTHER', new: 'FEDERATION' }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

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
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

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
        year: 2026,
        startDate: new Date('2026-03-15T09:00:00.000Z'),
        endDate: new Date('2026-03-15T18:00:00.000Z'),
        timeZone: 'Europe/Paris',
        calendarStatus: 'CONFIRMED',
        websiteUrl: 'https://event.com',
        registrationUrl: 'https://register.com',
        dataSource: 'FEDERATION'
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Seule startDate modifiée
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      
      expect(updated!.startDate).toEqual(new Date('2026-03-20T09:00:00.000Z'))
      expect(updated!.year).toBe(2026) // ✅ Inchangé
      expect(updated!.endDate).toEqual(new Date('2026-03-15T18:00:00.000Z')) // ✅ Inchangé
      expect(updated!.timeZone).toBe('Europe/Paris') // ✅ Inchangé
      expect(updated!.calendarStatus).toBe('CONFIRMED') // ✅ Inchangé
      expect(updated!.websiteUrl).toBe('https://event.com') // ✅ Inchangé
      expect(updated!.dataSource).toBe('FEDERATION') // ✅ Inchangé
    })
  })

  // ==========================================================================
  // MODIFICATION ORGANIZER
  // ==========================================================================

  describe('Organizer Modifications', () => {
    it('should update organizer fields', async () => {
      // Given: Edition avec organizer + Proposition modifiant email
      const event = await createExistingEvent()
      const organizer = await createExistingOrganizer({
        name: 'Association Trail',
        email: 'old@trail.fr',
        phone: '0601020304'
      })
      const edition = await createExistingEdition(event.id, {
        organizerId: organizer.id
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        organizer: {
          email: { old: 'old@trail.fr', new: 'new@trail.fr' }
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Email modifié, autres champs intacts
      const updated = await testMilesRepublicDb.organizer.findUnique({ 
        where: { id: organizer.id } 
      })
      
      expect(updated!.email).toBe('new@trail.fr')
      expect(updated!.name).toBe('Association Trail') // ✅ Inchangé
      expect(updated!.phone).toBe('0601020304') // ✅ Inchangé
    })

    it('should create new organizer if not exists', async () => {
      // Given: Edition sans organizer + Proposition ajoutant organizer
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        organizerId: null
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        organizer: {
          new: {
            name: 'New Association',
            email: 'contact@new.fr'
          }
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Organizer créé et lié
      const updated = await testMilesRepublicDb.edition.findUnique({
        where: { id: edition.id },
        include: { organizer: true }
      })
      
      expect(updated!.organizer).not.toBeNull()
      expect(updated!.organizer!.name).toBe('New Association')
      expect(updated!.organizer!.email).toBe('contact@new.fr')
    })

    it('should reuse existing organizer if name matches', async () => {
      // Given: Organizer existant + Edition sans organizer + Proposition avec même nom
      const existingOrg = await createExistingOrganizer({
        name: 'Association Trail BFC',
        email: 'old@trail.fr'
      })
      
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        organizerId: null
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        organizer: {
          new: {
            name: 'Association Trail BFC',
            email: 'new@trail.fr'
          }
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Organizer existant réutilisé (pas de doublon)
      const updated = await testMilesRepublicDb.edition.findUnique({
        where: { id: edition.id }
      })
      
      expect(updated!.organizerId).toBe(existingOrg.id)
      
      // Vérifier qu'il n'y a pas de doublon
      const organizerCount = await testMilesRepublicDb.organizer.count({
        where: { name: 'Association Trail BFC' }
      })
      expect(organizerCount).toBe(1)
    })

    it('should update multiple organizer fields', async () => {
      // Given: Organizer complet + Proposition modifiant 3 champs
      const organizer = await createExistingOrganizer({
        name: 'Association Trail',
        email: 'old@trail.fr',
        phone: '0601020304',
        websiteUrl: 'https://old.com',
        address: '123 Old Street',
        city: 'Paris'
      })
      
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        organizerId: organizer.id
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        organizer: {
          email: { old: 'old@trail.fr', new: 'new@trail.fr' },
          phone: { old: '0601020304', new: '0607080910' },
          websiteUrl: { old: 'https://old.com', new: 'https://new.com' }
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: 3 champs modifiés, autres intacts
      const updated = await testMilesRepublicDb.organizer.findUnique({ 
        where: { id: organizer.id } 
      })
      
      expect(updated!.email).toBe('new@trail.fr')
      expect(updated!.phone).toBe('0607080910')
      expect(updated!.websiteUrl).toBe('https://new.com')
      expect(updated!.name).toBe('Association Trail') // ✅ Inchangé
      expect(updated!.address).toBe('123 Old Street') // ✅ Inchangé
      expect(updated!.city).toBe('Paris') // ✅ Inchangé
    })

    it('should not modify organizer if no changes proposed', async () => {
      // Given: Edition avec organizer + Proposition sans organizer
      const organizer = await createExistingOrganizer({
        name: 'Association Trail',
        email: 'contact@trail.fr'
      })
      
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        organizerId: organizer.id
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        }
        // ❌ Pas de bloc organizer
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Organizer inchangé
      const updated = await testMilesRepublicDb.organizer.findUnique({ 
        where: { id: organizer.id } 
      })
      
      expect(updated!.name).toBe('Association Trail')
      expect(updated!.email).toBe('contact@trail.fr')
      expect(updated!.updatedAt).toEqual(organizer.updatedAt) // Pas de mise à jour
    })
  })
})
