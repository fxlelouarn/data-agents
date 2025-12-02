/**
 * Tests - User Modifications sur Courses Existantes
 * 
 * Cas de test spécifiques pour `userModifiedChanges.raceEdits`
 * sur des courses EXISTANTES (existing-0, existing-1, etc.)
 * 
 * Reproduit le bug découvert le 2 décembre 2025 :
 * - ✅ Nom de course modifié (appliqué)
 * - ❌ Dénivelé positif modifié (NON appliqué) 
 * - ❌ Course supprimée (NON appliquée)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { ProposalDomainService } from '@data-agents/database'
import {
  testMilesRepublicDb,
  createExistingEvent,
  createExistingEdition,
  createExistingRace,
  createEditionUpdateProposal,
  updateProposalUserModifications,
  setupProposalService,
  cleanupProposalService,
  cleanDatabase,
  cleanMilesRepublicDatabase
} from './helpers'
import { DatabaseManager } from '@data-agents/agent-framework'

describe('User Race Edits - Existing Races', () => {
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

  describe('Modifications de courses existantes', () => {
    it('should apply user modification to existing race name', async () => {
      // Given: 3 courses existantes
      const event = await createExistingEvent({ name: 'SAINTELYON' })
      const edition = await createExistingEdition(event.id, { year: 2025 })
      
      const race1 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'SAINTÉTIC',
        runDistance: 10
      })
      
      const race2 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'LYONSAINTÉLYON',
        runDistance: 21.1
      })
      
      const race3 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'SAINTÉLYON Relais 4',
        runDistance: 21.1,
        runPositiveElevation: 2010
      })
      
      // Proposition EDITION_UPDATE avec racesToUpdate
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race1.id, raceName: race1.name, updates: {} },
          { raceId: race2.id, raceName: race2.name, updates: {} },
          { raceId: race3.id, raceName: race3.name, updates: {} }
        ]
      })
      
      // User modifie le nom de la course 2 (index 1)
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-1': {
            name: 'LYONSAINTÉLYONNNNN' // ✅ 4 N
          }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      
      // Then: Nom modifié
      const updatedRace = await testMilesRepublicDb.race.findUnique({
        where: { id: race2.id }
      })
      
      expect(updatedRace).toBeDefined()
      expect(updatedRace?.name).toBe('LYONSAINTÉLYONNNNN')
    })

    it('should apply user modification to existing race runPositiveElevation', async () => {
      // Given: 3 courses existantes
      const event = await createExistingEvent({ name: 'SAINTELYON' })
      const edition = await createExistingEdition(event.id, { year: 2025 })
      
      const race1 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'SAINTÉTIC',
        runDistance: 10
      })
      
      const race2 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'LYONSAINTÉLYON',
        runDistance: 21.1
      })
      
      const race3 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'SAINTÉLYON Relais 4',
        runDistance: 21.1,
        runPositiveElevation: 2010
      })
      
      // Proposition EDITION_UPDATE avec racesToUpdate
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race1.id, raceName: race1.name, updates: {} },
          { raceId: race2.id, raceName: race2.name, updates: {} },
          { raceId: race3.id, raceName: race3.name, updates: {} }
        ]
      })
      
      // User modifie le dénivelé de la course 3 (index 2)
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-2': {
            runPositiveElevation: '2101' // ✅ String car vient du frontend
          }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      
      // Then: Dénivelé modifié
      const updatedRace = await testMilesRepublicDb.race.findUnique({
        where: { id: race3.id }
      })
      
      expect(updatedRace).toBeDefined()
      expect(updatedRace?.runPositiveElevation).toBe(2101)
    })

    it('should apply multiple user modifications to existing races', async () => {
      // Given: 3 courses existantes
      const event = await createExistingEvent({ name: 'SAINTELYON' })
      const edition = await createExistingEdition(event.id, { year: 2025 })
      
      const race1 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'Trail enfants saintégones 1 km',
        runDistance: 1
      })
      
      const race2 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'LYONSAINTÉLYON',
        runDistance: 21.1
      })
      
      const race3 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'SAINTÉLYON Relais 4',
        runDistance: 21.1,
        runPositiveElevation: 2010
      })
      
      // Proposition EDITION_UPDATE avec racesToUpdate
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race1.id, raceName: race1.name, updates: {} },
          { raceId: race2.id, raceName: race2.name, updates: {} },
          { raceId: race3.id, raceName: race3.name, updates: {} }
        ]
      })
      
      // User modifie : nom race2 + dénivelé race3 + supprime race1
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-0': {
            _deleted: true // ❌ Suppression
          },
          'existing-1': {
            name: 'LYONSAINTÉLYONNNNN' // ✅ Modification nom
          },
          'existing-2': {
            runPositiveElevation: '2101' // ✅ Modification dénivelé
          }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      
      // Then: Toutes les modifications appliquées
      
      // 1. Course supprimée (soft delete)
      const deletedRace = await testMilesRepublicDb.race.findUnique({
        where: { id: race1.id }
      })
      expect(deletedRace).toBeDefined()
      expect(deletedRace?.isArchived).toBe(true)
      
      // 2. Nom modifié
      const updatedRace2 = await testMilesRepublicDb.race.findUnique({
        where: { id: race2.id }
      })
      expect(updatedRace2?.name).toBe('LYONSAINTÉLYONNNNN')
      
      // 3. Dénivelé modifié
      const updatedRace3 = await testMilesRepublicDb.race.findUnique({
        where: { id: race3.id }
      })
      expect(updatedRace3?.runPositiveElevation).toBe(2101)
    })

    it('should handle existing race distance modification', async () => {
      // Given
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: '10km',
        runDistance: 10
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race.id, raceName: race.name, updates: {} }
        ]
      })
      
      // User modifie la distance
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-0': {
            runDistance: '12' // String car vient du frontend
          }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      
      // Then
      const updated = await testMilesRepublicDb.race.findUnique({
        where: { id: race.id }
      })
      expect(updated?.runDistance).toBe(12)
    })

    it('should handle existing race startDate modification', async () => {
      // Given
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: '10km',
        runDistance: 10,
        startDate: new Date('2026-03-15T09:00:00.000Z')
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race.id, raceName: race.name, updates: {} }
        ]
      })
      
      // User modifie l'heure
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-0': {
            startDate: '2026-03-15T10:30:00.000Z'
          }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      
      // Then
      const updated = await testMilesRepublicDb.race.findUnique({
        where: { id: race.id }
      })
      expect(updated?.startDate).toEqual(new Date('2026-03-15T10:30:00.000Z'))
    })
  })

  describe('Suppression de courses existantes', () => {
    it('should soft delete existing race when _deleted is true', async () => {
      // Given
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'Course à supprimer',
        runDistance: 10
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race.id, raceName: race.name, updates: {} }
        ]
      })
      
      // User supprime la course
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-0': {
            _deleted: true
          }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      
      // Then: Course existe toujours mais isArchived = true
      const deleted = await testMilesRepublicDb.race.findUnique({
        where: { id: race.id }
      })
      
      expect(deleted).toBeDefined()
      expect(deleted?.isArchived).toBe(true)
      expect(deleted?.isActive).toBe(false)
    })

    it('should delete multiple existing races', async () => {
      // Given: 3 courses, user supprime 2
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const race1 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'Course 1',
        runDistance: 5
      })
      
      const race2 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'Course 2',
        runDistance: 10
      })
      
      const race3 = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: 'Course 3',
        runDistance: 15
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race1.id, raceName: race1.name, updates: {} },
          { raceId: race2.id, raceName: race2.name, updates: {} },
          { raceId: race3.id, raceName: race3.name, updates: {} }
        ]
      })
      
      // User supprime race1 et race3
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-0': { _deleted: true },
          'existing-2': { _deleted: true }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      
      // Then
      const deleted1 = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      expect(deleted1?.isArchived).toBe(true)
      
      const active = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })
      expect(active?.isArchived).toBe(false)
      
      const deleted3 = await testMilesRepublicDb.race.findUnique({ where: { id: race3.id } })
      expect(deleted3?.isArchived).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should ignore raceEdits if racesToUpdate is empty', async () => {
      // Given: Proposition sans racesToUpdate mais avec raceEdits
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        startDate: {
          old: '2026-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        }
      })
      
      // User ajoute des raceEdits (ne devrait pas crasher)
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-0': {
            name: 'Course inexistante'
          }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When/Then: Ne doit pas crasher
      await expect(
        domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      ).resolves.toBeDefined()
    })

    it('should handle raceEdits with invalid index', async () => {
      // Given
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        eventId: event.id,
        name: '10km',
        runDistance: 10
      })
      
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race.id, raceName: race.name, updates: {} }
        ]
      })
      
      // User modifie existing-99 (hors limites)
      proposal.userModifiedChanges = {
        raceEdits: {
          'existing-99': {
            name: 'Course inexistante'
          }
        }
      }
      
      await updateProposalUserModifications(proposal.id, proposal.userModifiedChanges)
      
      // When/Then: Ne doit pas crasher
      await expect(
        domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      ).resolves.toBeDefined()
      
      // La course existante ne doit pas être modifiée
      const unchanged = await testMilesRepublicDb.race.findUnique({
        where: { id: race.id }
      })
      expect(unchanged?.name).toBe('10km')
    })
  })
})
