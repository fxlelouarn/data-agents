import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { testDb, testMilesRepublicDb, setupTestEnvironment, teardownTestEnvironment } from './helpers/db-setup'
import { 
  createExistingEvent, 
  createExistingEdition, 
  createExistingRace,
  createEditionUpdateProposal
} from './helpers/fixtures'
import { ProposalDomainService } from '../../../../packages/database/src/services/proposal-domain.service'
import { DatabaseManager } from '../../../../packages/agent-framework/src/database-manager'

describe('Race Operations', () => {
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
  // UPDATE RACES
  // ==========================================================================

  describe('Update Races', () => {
    it('should update race distance', async () => {
      // Given: Course existante + Proposition modifiant distance
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: '10km',
        runDistance: 10,
        startDate: new Date('2026-03-15T09:00:00.000Z')
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: '10km',
            updates: {
              runDistance: { old: 10, new: 12 }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Distance modifiée
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.runDistance).toBe(12)
    })

    it('should update race startDate', async () => {
      // Given: Course + Proposition changeant heure
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: 'Semi-Marathon',
        runDistance: 21.1,
        startDate: new Date('2026-03-15T09:00:00.000Z')
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: 'Semi-Marathon',
            updates: {
              startDate: {
                old: '2026-03-15T09:00:00.000Z',
                new: '2026-03-15T10:30:00.000Z'
              }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Heure modifiée
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.startDate).toEqual(new Date('2026-03-15T10:30:00.000Z'))
    })

    it('should update race elevation', async () => {
      // Given: Trail avec D+ + Proposition modifiant élévation
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: 'Trail 30km',
        runDistance: 30,
        runPositiveElevation: 1200
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: 'Trail 30km',
            updates: {
              runPositiveElevation: { old: 1200, new: 1500 }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Élévation modifiée
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.runPositiveElevation).toBe(1500)
    })

    it('should update multiple race fields', async () => {
      // Given: Course + Proposition modifiant distance + heure + élévation
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: 'Trail',
        runDistance: 25,
        runPositiveElevation: 800,
        startDate: new Date('2026-03-15T09:00:00.000Z')
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: 'Trail',
            updates: {
              runDistance: { old: 25, new: 28 },
              runPositiveElevation: { old: 800, new: 1000 },
              startDate: {
                old: '2026-03-15T09:00:00.000Z',
                new: '2026-03-15T08:30:00.000Z'
              }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: 3 champs modifiés
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.runDistance).toBe(28)
      expect(updated!.runPositiveElevation).toBe(1000)
      expect(updated!.startDate).toEqual(new Date('2026-03-15T08:30:00.000Z'))
    })

    it('should preserve unmodified race fields', async () => {
      // Given: Course complète + Proposition modifiant seulement distance
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: 'Trail 30km',
        runDistance: 30,
        runPositiveElevation: 1200,
        startDate: new Date('2026-03-15T09:00:00.000Z'),
        categoryLevel1: 'TRAIL',
        categoryLevel2: 'SHORT_TRAIL'
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: 'Trail 30km',
            updates: {
              runDistance: { old: 30, new: 32 }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Seule distance modifiée
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.runDistance).toBe(32)
      expect(updated!.runPositiveElevation).toBe(1200) // ✅ Inchangé
      expect(updated!.startDate).toEqual(new Date('2026-03-15T09:00:00.000Z')) // ✅ Inchangé
      expect(updated!.categoryLevel1).toBe('TRAIL') // ✅ Inchangé
      expect(updated!.categoryLevel2).toBe('SHORT_TRAIL') // ✅ Inchangé
    })

    it('should update multiple races independently', async () => {
      // Given: 2 courses + Proposition modifiant chacune différemment
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
              updates: { runDistance: { old: 10, new: 12 } }
            },
            {
              raceId: race2.id,
              raceName: 'Semi',
              updates: { runDistance: { old: 21.1, new: 21.097 } }
            }
          ]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Chaque course modifiée indépendamment
      const updated1 = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      const updated2 = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })
      
      expect(updated1!.runDistance).toBe(12)
      expect(updated2!.runDistance).toBe(21.097)
    })

    it('should update race categories', async () => {
      // Given: Course RUNNING + Proposition changeant catégorie
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: 'Course Nature 15km',
        runDistance: 15,
        categoryLevel1: 'RUNNING',
        categoryLevel2: 'KM10'
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: 'Course Nature 15km',
            updates: {
              categoryLevel1: { old: 'RUNNING', new: 'TRAIL' },
              categoryLevel2: { old: 'KM10', new: 'SHORT_TRAIL' }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Catégories modifiées
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.categoryLevel1).toBe('TRAIL')
      expect(updated!.categoryLevel2).toBe('SHORT_TRAIL')
    })

    it('should update bike race distance', async () => {
      // Given: Course vélo + Proposition modifiant bikeDistance
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: 'VTT 50km',
        bikeDistance: 50,
        runDistance: null,
        categoryLevel1: 'CYCLING',
        categoryLevel2: 'XC_MOUNTAIN_BIKE'
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: 'VTT 50km',
            updates: {
              bikeDistance: { old: 50, new: 55 }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: bikeDistance modifiée
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.bikeDistance).toBe(55)
      expect(updated!.runDistance).toBeNull() // ✅ Reste null
    })

    it('should update triathlon distances', async () => {
      // Given: Triathlon + Proposition modifiant les 3 distances
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: 'Triathlon Sprint',
        swimDistance: 0.75,
        bikeDistance: 20,
        runDistance: 5,
        categoryLevel1: 'TRIATHLON'
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: 'Triathlon Sprint',
            updates: {
              swimDistance: { old: 0.75, new: 1 },
              bikeDistance: { old: 20, new: 25 },
              runDistance: { old: 5, new: 6 }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: 3 distances modifiées
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.swimDistance).toBe(1)
      expect(updated!.bikeDistance).toBe(25)
      expect(updated!.runDistance).toBe(6)
    })

    it('should set elevation to null if not provided', async () => {
      // Given: Course avec élévation + Proposition sans élévation
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: '10km',
        runDistance: 10,
        runPositiveElevation: 100
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race.id,
            raceName: '10km',
            updates: {
              runPositiveElevation: { old: 100, new: null }
            }
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Élévation mise à null
      const updated = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(updated!.runPositiveElevation).toBeNull()
    })
  })

  // ==========================================================================
  // ADD RACES
  // ==========================================================================

  describe('Add Races', () => {
    it('should add new race to edition', async () => {
      // Given: Edition avec 1 course + Proposition ajoutant 1 course
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      await createExistingRace({ editionId: edition.id, name: '10km' })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toAdd: [{
            name: 'Semi-Marathon',
            runDistance: 21.1,
            startDate: '2026-03-15T10:00:00.000Z',
            categoryLevel1: 'RUNNING',
            categoryLevel2: 'HALF_MARATHON'
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: 2 courses au total
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id, archivedAt: null }
      })
      
      expect(races).toHaveLength(2)
      
      const newRace = races.find(r => r.name === 'Semi-Marathon')
      expect(newRace).toBeDefined()
      expect(newRace!.runDistance).toBe(21.1)
      expect(newRace!.categoryLevel1).toBe('RUNNING')
    })

    it('should add multiple new races', async () => {
      // Given: Edition vide + Proposition ajoutant 3 courses
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toAdd: [
            {
              name: '5km',
              runDistance: 5,
              startDate: '2026-03-15T09:00:00.000Z'
            },
            {
              name: '10km',
              runDistance: 10,
              startDate: '2026-03-15T10:00:00.000Z'
            },
            {
              name: 'Semi',
              runDistance: 21.1,
              startDate: '2026-03-15T11:00:00.000Z'
            }
          ]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: 3 courses créées
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id },
        orderBy: { runDistance: 'asc' }
      })
      
      expect(races).toHaveLength(3)
      expect(races[0].name).toBe('5km')
      expect(races[1].name).toBe('10km')
      expect(races[2].name).toBe('Semi')
    })

    it('should add race with elevation', async () => {
      // Given: Edition + Proposition ajoutant trail avec D+
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toAdd: [{
            name: 'Trail 30km',
            runDistance: 30,
            runPositiveElevation: 1500,
            startDate: '2026-03-15T08:00:00.000Z',
            categoryLevel1: 'TRAIL',
            categoryLevel2: 'LONG_TRAIL'
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Trail créé avec élévation
      const race = await testMilesRepublicDb.race.findFirst({
        where: { editionId: edition.id, name: 'Trail 30km' }
      })
      
      expect(race).toBeDefined()
      expect(race!.runPositiveElevation).toBe(1500)
      expect(race!.categoryLevel1).toBe('TRAIL')
    })

    it('should add bike race', async () => {
      // Given: Edition + Proposition ajoutant course vélo
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toAdd: [{
            name: 'VTT 50km',
            bikeDistance: 50,
            startDate: '2026-03-15T09:00:00.000Z',
            categoryLevel1: 'CYCLING',
            categoryLevel2: 'XC_MOUNTAIN_BIKE'
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Course vélo créée
      const race = await testMilesRepublicDb.race.findFirst({
        where: { editionId: edition.id, name: 'VTT 50km' }
      })
      
      expect(race).toBeDefined()
      expect(race!.bikeDistance).toBe(50)
      expect(race!.runDistance).toBeNull()
      expect(race!.categoryLevel1).toBe('CYCLING')
    })

    it('should add triathlon race', async () => {
      // Given: Edition + Proposition ajoutant triathlon
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toAdd: [{
            name: 'Triathlon Sprint',
            swimDistance: 0.75,
            bikeDistance: 20,
            runDistance: 5,
            startDate: '2026-03-15T08:00:00.000Z',
            categoryLevel1: 'TRIATHLON'
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Triathlon créé avec les 3 distances
      const race = await testMilesRepublicDb.race.findFirst({
        where: { editionId: edition.id, name: 'Triathlon Sprint' }
      })
      
      expect(race).toBeDefined()
      expect(race!.swimDistance).toBe(0.75)
      expect(race!.bikeDistance).toBe(20)
      expect(race!.runDistance).toBe(5)
    })
  })

  // ==========================================================================
  // DELETE RACES
  // ==========================================================================

  describe('Delete Races', () => {
    it('should archive deleted race', async () => {
      // Given: Edition avec 2 courses + Proposition supprimant 1 course
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const race1 = await createExistingRace({ 
        editionId: edition.id, 
        name: '10km' 
      })
      const race2 = await createExistingRace({ 
        editionId: edition.id, 
        name: 'Semi' 
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toDelete: [race1.id]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Course 1 archivée, course 2 active
      const deleted = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race1.id } 
      })
      expect(deleted!.archivedAt).not.toBeNull()
      
      const active = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race2.id } 
      })
      expect(active!.archivedAt).toBeNull()
    })

    it('should archive multiple races', async () => {
      // Given: Edition avec 3 courses + Proposition supprimant 2 courses
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const race1 = await createExistingRace({ editionId: edition.id, name: '5km' })
      const race2 = await createExistingRace({ editionId: edition.id, name: '10km' })
      const race3 = await createExistingRace({ editionId: edition.id, name: 'Semi' })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toDelete: [race1.id, race2.id]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: 2 courses archivées, 1 active
      const archived = await testMilesRepublicDb.race.findMany({
        where: { 
          editionId: edition.id,
          archivedAt: { not: null }
        }
      })
      expect(archived).toHaveLength(2)
      
      const active = await testMilesRepublicDb.race.findMany({
        where: { 
          editionId: edition.id,
          archivedAt: null
        }
      })
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe(race3.id)
    })

    it('should not delete if racesToDelete is empty', async () => {
      // Given: 2 courses + Proposition sans racesToDelete
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      await createExistingRace({ editionId: edition.id, name: '10km' })
      await createExistingRace({ editionId: edition.id, name: 'Semi' })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: (await testMilesRepublicDb.race.findFirst({ 
              where: { editionId: edition.id } 
            }))!.id,
            raceName: '10km',
            updates: { runDistance: { old: 10, new: 12 } }
          }]
          // ❌ Pas de toDelete
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Toutes les courses restent actives
      const active = await testMilesRepublicDb.race.findMany({
        where: { 
          editionId: edition.id,
          archivedAt: null
        }
      })
      expect(active).toHaveLength(2)
    })

    it('should not hard-delete races', async () => {
      // Given: Course + Proposition supprimant course
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({ editionId: edition.id, name: '10km' })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toDelete: [race.id]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Course toujours en DB (soft delete)
      const deleted = await testMilesRepublicDb.race.findUnique({ 
        where: { id: race.id } 
      })
      
      expect(deleted).not.toBeNull() // ✅ Pas supprimée physiquement
      expect(deleted!.archivedAt).not.toBeNull() // ✅ Archivée logiquement
    })

    it('should allow filtering toAdd with racesToAddFiltered', async () => {
      // Given: Proposition avec 3 nouvelles courses + filtre excluant 1 course
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
      
      // Simulation userModifiedChanges filtrant course index 1
      proposal.userModifiedChanges = {
        racesToAddFiltered: [1] // Index de la course à exclure
      }

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: Seulement 2 courses créées (course 2 exclue)
      const races = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id },
        orderBy: { runDistance: 'asc' }
      })
      
      expect(races).toHaveLength(2)
      expect(races[0].name).toBe('Course 1')
      expect(races[1].name).toBe('Course 3')
      // Course 2 absente
      expect(races.find(r => r.name === 'Course 2')).toBeUndefined()
    })
  })

  // ==========================================================================
  // MIXED OPERATIONS
  // ==========================================================================

  describe('Mixed Operations', () => {
    it('should handle update + add + delete together', async () => {
      // Given: Edition avec 2 courses existantes
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const race1 = await createExistingRace({ 
        editionId: edition.id, 
        name: '5km',
        runDistance: 5
      })
      const race2 = await createExistingRace({ 
        editionId: edition.id, 
        name: '10km',
        runDistance: 10
      })
      
      // Proposition : update race1 + delete race2 + add new race
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toUpdate: [{
            raceId: race1.id,
            raceName: '5km',
            updates: { runDistance: { old: 5, new: 6 } }
          }],
          toDelete: [race2.id],
          toAdd: [{
            name: 'Semi',
            runDistance: 21.1,
            startDate: '2026-03-15T10:00:00.000Z'
          }]
        }
      })

      // When
      await proposalService.applyProposal(proposal.id, proposal.selectedChanges as any, { milesRepublicDatabaseId: 'miles-republic-test' }))

      // Then: 
      // - race1 modifiée
      const updated = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      expect(updated!.runDistance).toBe(6)
      
      // - race2 archivée
      const deleted = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })
      expect(deleted!.archivedAt).not.toBeNull()
      
      // - Nouvelle course créée
      const active = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id, archivedAt: null }
      })
      expect(active).toHaveLength(2) // race1 + Semi
      
      const newRace = active.find(r => r.name === 'Semi')
      expect(newRace).toBeDefined()
      expect(newRace!.runDistance).toBe(21.1)
    })
  })
})
