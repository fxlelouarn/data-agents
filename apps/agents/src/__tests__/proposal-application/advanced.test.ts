import { ProposalDomainService } from '@data-agents/database'
import {
  createNewEventProposal,
  createEditionUpdateProposal,
  createExistingEvent,
  createExistingEdition,
  createExistingRace,
  createExistingOrganizer,
  testMilesRepublicDb,
  setupProposalService,
  cleanupProposalService,
  cleanDatabase,
  cleanMilesRepublicDatabase,
  updateProposalUserModifications,  // ✅ Phase 2.7
  updateProposalApprovedBlocks      // ✅ Phase 2.8
} from './helpers'
import { DatabaseManager } from '@data-agents/agent-framework'

describe('Advanced Features', () => {
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
  // BLOCK APPLICATION (approvedBlocks)
  // ==========================================================================

  describe('Block Application', () => {
    it('should apply only approved blocks', async () => {
      // Given: Proposition EDITION_UPDATE avec 3 blocs, seulement 2 approuvés
      const event = await createExistingEvent({
        name: 'Trail Original',
        city: 'Paris'
      })
      const edition = await createExistingEdition(event.id, {
        startDate: new Date('2026-03-15T09:00:00.000Z')
      })
      await createExistingRace({ 
        editionId: edition.id, 
        name: '10km', 
        runDistance: 10 
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        // Bloc event
        name: { old: 'Trail Original', new: 'Trail Modifié' },
        // Bloc edition
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        },
        // Bloc races
        races: {
          toUpdate: [{
            raceId: (await testMilesRepublicDb.race.findFirst({ 
              where: { editionId: edition.id } 
            }))!.id,
            raceName: '10km',
            updates: { runDistance: { old: 10, new: 12 } }
          }]
        }
      })
      
      // Approuver seulement les blocs event + edition
      proposal.approvedBlocks = {
        event: true,
        edition: true,
        races: false
      }
      
      // ✅ Phase 2.8: Sauvegarder en DB pour que applyProposal() respecte les blocs
      await updateProposalApprovedBlocks(proposal.id, proposal.approvedBlocks)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Event + Edition modifiés, Race inchangée
      const updatedEvent = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updatedEvent!.name).toBe('Trail Modifié')
      
      const updatedEdition = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      expect(updatedEdition!.startDate).toEqual(new Date('2026-03-20T09:00:00.000Z'))
      
      const race = await testMilesRepublicDb.race.findFirst({ 
        where: { editionId: edition.id } 
      })
      expect(race!.runDistance).toBe(10) // ✅ Inchangé (bloc non approuvé)
    })

    it('should apply all blocks if approvedBlocks is empty', async () => {
      // Given: Proposition sans approvedBlocks défini
      const event = await createExistingEvent({ name: 'Trail' })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: { old: 'Trail', new: 'Trail Modifié' },
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        }
      })
      
      // Pas de approvedBlocks défini
      proposal.approvedBlocks = {}

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Tous les changements appliqués
      const updatedEvent = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updatedEvent!.name).toBe('Trail Modifié')
      
      const updatedEdition = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      expect(updatedEdition!.startDate).toEqual(new Date('2026-03-20T09:00:00.000Z'))
    })

    it.skip('should handle partial block approval', async () => {
      // ⚠️ SKIP: La table Organizer n'existe plus dans Miles Republic
      // Given: 4 blocs possibles, seulement 1 approuvé
      const event = await createExistingEvent()
      const organizer = await createExistingOrganizer()
      const edition = await createExistingEdition(event.id, {
        organizerId: organizer.id
      })
      await createExistingRace({ editionId: edition.id, name: '10km' })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: { old: 'Event Test', new: 'New Name' },
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        },
        organizer: {
          email: { old: 'Organizer Test', new: 'New Email' }
        },
        races: {
          toAdd: [{ name: 'Semi', runDistance: 21.1 }]
        }
      })
      
      // Approuver seulement le bloc edition
      proposal.approvedBlocks = {
        event: false,
        edition: true,
        organizer: false,
        races: false
      }

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Seulement edition modifiée
      const updatedEvent = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updatedEvent!.name).toBe('Event Test') // ✅ Inchangé
      
      const updatedEdition = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      expect(updatedEdition!.startDate).toEqual(new Date('2026-03-20T09:00:00.000Z'))
      
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id }
      })
      expect(races).toHaveLength(1) // ✅ Pas de nouvelle course
    })

    it.skip('should apply organizer block correctly', async () => {
      // ⚠️ SKIP: La table Organizer n'existe plus dans Miles Republic
      // Given: Proposition avec bloc organizer approuvé uniquement
      const event = await createExistingEvent()
      const organizer = await createExistingOrganizer({
        name: 'Old Org',
        email: 'old@org.fr'
      })
      const edition = await createExistingEdition(event.id, {
        organizerId: organizer.id
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        },
        organizer: {
          email: { old: 'old@org.fr', new: 'new@org.fr' }
        }
      })
      
      proposal.approvedBlocks = {
        edition: false,
        organizer: true
      }

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Organizer modifié, Edition inchangée
      const updatedOrg = await testMilesRepublicDb.organizer.findUnique({ 
        where: { id: organizer.id } 
      })
      expect(updatedOrg!.email).toBe('new@org.fr')
      
      const updatedEdition = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      expect(updatedEdition!.startDate).toEqual(new Date('2026-03-15T09:00:00.000Z')) // ✅ Inchangé
    })

    it('should handle races block with toAdd and toUpdate', async () => {
      // Given: Bloc races avec opérations mixtes
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race1 = await createExistingRace({ 
        editionId: edition.id, 
        name: '10km',
        runDistance: 10
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: { old: 'Event Test', new: 'New Event' },
        races: {
          toUpdate: [{
            raceId: race1.id,
            raceName: '10km',
            updates: { runDistance: { old: 10, new: 12 } }
          }],
          toAdd: [{ name: 'Semi', runDistance: 21.1 }]
        }
      })
      
      // Approuver seulement races
      proposal.approvedBlocks = {
        event: false,
        races: true
      }
      
      // ✅ Phase 2.8: Sauvegarder en DB
      await updateProposalApprovedBlocks(proposal.id, proposal.approvedBlocks)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Races modifiées/ajoutées, Event inchangé
      const updatedRace = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race1.id } 
      })
      expect(updatedRace!.runDistance).toBe(12)
      
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id, isArchived: false }
      })
      expect(races).toHaveLength(2)
      
      const updatedEvent = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updatedEvent!.name).toBe('Event Test') // ✅ Inchangé
    })
  })

  // ==========================================================================
  // USER MODIFICATIONS (userModifiedChanges)
  // ==========================================================================

  describe('User Modifications Override', () => {
    it('should override agent proposal with user modification', async () => {
      // Given: Agent propose distance 10, user modifie en 12
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({ 
        editionId: edition.id, 
        name: '10km',
        runDistance: 10
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: '10km',
            updates: {
              runDistance: { old: 10, new: 10 } // Agent propose 10 (aucun changement)
            }
          }]
        }
      })
      
      // User modifie manuellement
      proposal.userModifiedChanges = {
        races: {
          [race.id]: {
            runDistance: 12 // ✅ Override agent
          }
        }
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB pour que applyProposal() puisse merger
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: User override appliqué
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      expect(updated!.runDistance).toBe(12) // ✅ Valeur user, pas agent
    })

    it('should apply user modification to multiple races', async () => {
      // Given: User modifie 2 courses différemment
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const race1 = await createExistingRace({ 
        editionId: edition.id, 
        name: '10km',
        runDistance: 10
      })
      const race2 = await createExistingRace({ 
        editionId: edition.id, 
        name: 'Semi',
        runDistance: 21.1
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [
            {
              raceId: race1.id,
              raceName: '10km',
              updates: { runDistance: { old: 10, new: 10 } }
            },
            {
              raceId: race2.id,
              raceName: 'Semi',
              updates: { runDistance: { old: 21.1, new: 21.1 } }
            }
          ]
        }
      })
      
      // User modifie les 2
      proposal.userModifiedChanges = {
        races: {
          [race1.id]: { runDistance: 12 },
          [race2.id]: { runDistance: 21.097 }
        }
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Les 2 modifications user appliquées
      const updated1 = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race1.id } 
      })
      expect(updated1!.runDistance).toBe(12)
      
      const updated2 = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race2.id } 
      })
      expect(updated2!.runDistance).toBe(21.097)
    })

    it('should apply user modification to edition fields', async () => {
      // Given: Agent propose date A, user modifie en date B
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        startDate: new Date('2026-03-15T09:00:00.000Z')
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z' // Agent propose 20 mars
        }
      })
      
      // User modifie en 25 mars
      proposal.userModifiedChanges = {
        startDate: '2026-03-25T09:00:00.000Z'
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Date user appliquée
      const updated = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      expect(updated!.startDate).toEqual(new Date('2026-03-25T09:00:00.000Z'))
    })

    it('should apply user modification to event fields', async () => {
      // Given: Agent propose ville A, user modifie en ville B
      const event = await createExistingEvent({
        name: 'Trail Test',
        city: 'Paris'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        city: { old: 'Paris', new: 'Lyon' } // Agent propose Lyon
      })
      
      // User modifie en Marseille
      proposal.userModifiedChanges = {
        city: 'Marseille'
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Ville user appliquée
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updated!.city).toBe('Marseille')
    })

    it.skip('should apply user modification to organizer fields', async () => {
      // ⚠️ SKIP: La table Organizer n'existe plus dans Miles Republic
      // Given: Agent propose email A, user modifie en email B
      const organizer = await createExistingOrganizer({
        name: 'Org Test',
        email: 'old@org.fr'
      })
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id, {
        organizerId: organizer.id
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        organizer: {
          email: { old: 'old@org.fr', new: 'agent@org.fr' }
        }
      })
      
      // User modifie en user@org.fr
      proposal.userModifiedChanges = {
        organizer: {
          email: 'user@org.fr'
        }
      }

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Email user appliqué
      const updated = await testMilesRepublicDb.organizer.findUnique({ 
        where: { id: organizer.id } 
      })
      expect(updated!.email).toBe('user@org.fr')
    })

    it('should merge user modifications with agent proposal', async () => {
      // Given: Agent propose champ A, user modifie champ B
      const event = await createExistingEvent({
        name: 'Trail Test',
        city: 'Paris',
        websiteUrl: 'https://old.com'
      })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        city: { old: 'Paris', new: 'Lyon' } // Agent propose Lyon
      })
      
      // User modifie websiteUrl (champ différent)
      proposal.userModifiedChanges = {
        websiteUrl: 'https://new.com'
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Les 2 modifications appliquées
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updated!.city).toBe('Lyon') // ✅ Agent
      expect(updated!.websiteUrl).toBe('https://new.com') // ✅ User
    })

    it('should handle userModifiedChanges for NEW_EVENT', async () => {
      // Given: Proposition NEW_EVENT avec userModifiedChanges
      const proposal = await createNewEventProposal({
        name: 'Trail Agent',
        city: 'Paris',
        edition: {
          new: {
            year: 2026,
            startDate: '2026-03-15T09:00:00.000Z',
            endDate: '2026-03-15T18:00:00.000Z',
            timeZone: 'Europe/Paris',
            races: [
              { name: '10km', runDistance: 10 }
            ]
          }
        }
      })
      
      // User modifie le nom et la ville
      proposal.userModifiedChanges = {
        name: 'Trail User',
        city: 'Lyon'
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Modifications user appliquées
      const event = await testMilesRepublicDb.event.findFirst({
        where: { slug: { contains: 'trail-user' } }
      })
      
      expect(event).toBeDefined()
      expect(event!.name).toBe('Trail User')
      expect(event!.city).toBe('Lyon')
    })

    it('should handle userModifiedRaceChanges for racesToAdd', async () => {
      // Given: Proposition ajoutant 2 courses, user modifie course new-0
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toAdd: [
            { name: 'Course 1', runDistance: 10 },
            { name: 'Course 2', runDistance: 15 }
          ]
        }
      })
      
      // User modifie la première course
      proposal.userModifiedChanges = {
        raceEdits: {
          'new-0': {
            runDistance: 12 // ✅ Override agent 10 → 12
          }
        }
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Course 1 avec distance user
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id },
        orderBy: { runDistance: 'asc' }
      })
      
      expect(races).toHaveLength(2)
      expect(races[0].name).toBe('Course 1')
      expect(races[0].runDistance).toBe(12) // ✅ User override
      expect(races[1].name).toBe('Course 2')
      expect(races[1].runDistance).toBe(15) // ✅ Agent original
    })

    it('should handle racesToAddFiltered', async () => {
      // Given: 3 courses proposées, user exclut course index 1
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toAdd: [
            { name: 'Course 1', runDistance: 10 },
            { name: 'Course 2', runDistance: 15 },
            { name: 'Course 3', runDistance: 20 }
          ]
        }
      })
      
      // User exclut course 2 (index 1)
      proposal.userModifiedChanges = {
        racesToAddFiltered: [1]
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Seulement 2 courses créées
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id },
        orderBy: { runDistance: 'asc' }
      })
      
      expect(races).toHaveLength(2)
      expect(races[0].name).toBe('Course 1')
      expect(races[1].name).toBe('Course 3')
      expect(races.find(r => r.name === 'Course 2')).toBeUndefined()
    })

    it('should combine userModifiedChanges with approvedBlocks', async () => {
      // Given: 2 blocs, user modifie bloc approuvé uniquement
      const event = await createExistingEvent({ name: 'Trail', city: 'Paris' })
      const edition = await createExistingEdition(event.id, {
        startDate: new Date('2026-03-15T09:00:00.000Z')
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: { old: 'Trail', new: 'Trail Agent' },
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        }
      })
      
      // Approuver seulement event, user modifie event
      proposal.approvedBlocks = {
        event: true,
        edition: false
      }
      
      proposal.userModifiedChanges = {
        name: 'Trail User'
      }
      
      // ✅ Phase 2.8: Sauvegarder approvedBlocks en DB
      await updateProposalApprovedBlocks(proposal.id, proposal.approvedBlocks)
      
      // ✅ Phase 2.7: Sauvegarder userModifiedChanges en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Event avec user override, Edition inchangée
      const updatedEvent = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updatedEvent!.name).toBe('Trail User')
      
      const updatedEdition = await testMilesRepublicDb.edition.findUnique({ 
        where: { id: edition.id } 
      })
      expect(updatedEdition!.startDate).toEqual(new Date('2026-03-15T09:00:00.000Z')) // ✅ Inchangé
    })

    it('should not apply user modification if block not approved', async () => {
      // Given: User modifie un champ mais le bloc n'est pas approuvé
      const event = await createExistingEvent({ name: 'Trail', city: 'Paris' })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: { old: 'Trail', new: 'Trail Agent' }
      })
      
      // Bloc event NON approuvé
      proposal.approvedBlocks = {
        event: false
      }
      
      // Mais user modifie quand même
      proposal.userModifiedChanges = {
        name: 'Trail User'
      }
      
      // ✅ Phase 2.8: Sauvegarder approvedBlocks en DB
      await updateProposalApprovedBlocks(proposal.id, proposal.approvedBlocks)
      
      // ✅ Phase 2.7: Sauvegarder userModifiedChanges en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Aucun changement (bloc non approuvé)
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updated!.name).toBe('Trail') // ✅ Valeur originale
    })
  })

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty userModifiedChanges', async () => {
      // Given: userModifiedChanges vide
      const event = await createExistingEvent({ name: 'Trail' })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: { old: 'Trail', new: 'Trail Modifié' }
      })
      
      proposal.userModifiedChanges = {} // Vide
      
      // ✅ Phase 2.7: Sauvegarder en DB (même si vide)
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Proposition agent appliquée normalement
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updated!.name).toBe('Trail Modifié')
    })

    it('should handle null userModifiedChanges', async () => {
      // Given: userModifiedChanges null
      const event = await createExistingEvent({ name: 'Trail' })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: { old: 'Trail', new: 'Trail Modifié' }
      })
      
      proposal.userModifiedChanges = null as any
      
      // ✅ Phase 2.7: Pas de sauvegarde (null n'est pas persistable)
      // Ce test vérifie que l'agent proposal est appliqué quand userModifiedChanges=null

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Proposition agent appliquée normalement
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updated!.name).toBe('Trail Modifié')
    })

    it('should handle empty approvedBlocks with userModifiedChanges', async () => {
      // Given: approvedBlocks vide mais userModifiedChanges défini
      const event = await createExistingEvent({ name: 'Trail' })
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        name: { old: 'Trail', new: 'Trail Agent' }
      })
      
      proposal.approvedBlocks = {} // Vide = tout approuvé
      proposal.userModifiedChanges = {
        name: 'Trail User'
      }
      
      // ✅ Phase 2.7: Sauvegarder en DB
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: User override appliqué
      const updated = await testMilesRepublicDb.event.findUnique({ 
        where: { id: event.id } 
      })
      expect(updated!.name).toBe('Trail User')
    })
  })
})
