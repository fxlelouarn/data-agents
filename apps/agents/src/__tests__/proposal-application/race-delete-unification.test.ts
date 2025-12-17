/**
 * Tests - Unification de la logique de suppression des courses
 *
 * Ces tests vérifient que les différents chemins de suppression sont consolidés
 * et que les suppressions ne sont exécutées qu'une seule fois.
 *
 * Bug reproduit (Event 1108 - Rotatrail) :
 * - Les mêmes courses étaient supprimées deux fois par deux chemins différents
 * - L'ordre d'exécution causait des mises à jour de courses avant leur suppression
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { ProposalDomainService } from '@data-agents/database'
import {
  testMilesRepublicDb,
  testDb,
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

describe('Race Delete Unification', () => {
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
  // EXTRACTION DES COURSES À SUPPRIMER
  // ==========================================================================

  describe('Extraction de racesToDelete depuis différentes sources', () => {

    it('should delete races from changes.racesToDelete (number[] format)', async () => {
      // Given: 3 courses existantes
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race1 = await createExistingRace({ editionId: edition.id, name: 'Course 1', runDistance: 10 })
      const race2 = await createExistingRace({ editionId: edition.id, name: 'Course 2', runDistance: 15 })
      const race3 = await createExistingRace({ editionId: edition.id, name: 'Course 3', runDistance: 20 })

      // Proposition avec racesToDelete au format number[]
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToDelete: [race1.id, race2.id]
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: race1 et race2 archivées, race3 toujours active
      const deleted1 = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      const deleted2 = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })
      const active3 = await testMilesRepublicDb.race.findUnique({ where: { id: race3.id } })

      expect(deleted1?.isArchived).toBe(true)
      expect(deleted2?.isArchived).toBe(true)
      expect(active3?.isArchived).toBe(false)
    })

    it('should delete races from changes.racesToDelete (object[] format)', async () => {
      // Given: 2 courses existantes
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race1 = await createExistingRace({ editionId: edition.id, name: 'Marche', runDistance: 0 })
      const race2 = await createExistingRace({ editionId: edition.id, name: 'Trail 18km', runDistance: 18 })

      // Proposition avec racesToDelete au format object[]
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToDelete: [
          { raceId: race1.id, raceName: 'Marche' },
          { raceId: race2.id, raceName: 'Trail 18km' }
        ]
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Les deux courses archivées
      const deleted1 = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      const deleted2 = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })

      expect(deleted1?.isArchived).toBe(true)
      expect(deleted2?.isArchived).toBe(true)
    })

    it('should delete races from changes.races.toDelete', async () => {
      // Given: 2 courses existantes
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race1 = await createExistingRace({ editionId: edition.id, name: 'Course A', runDistance: 10 })
      const race2 = await createExistingRace({ editionId: edition.id, name: 'Course B', runDistance: 15 })

      // Proposition avec races.toDelete
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        races: {
          toDelete: [race1.id]
        }
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: race1 archivée, race2 toujours active
      const deleted1 = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      const active2 = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })

      expect(deleted1?.isArchived).toBe(true)
      expect(active2?.isArchived).toBe(false)
    })

    it('should delete races from userModifiedChanges.raceEdits._deleted (numeric key)', async () => {
      // Given: 2 courses existantes
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race1 = await createExistingRace({ editionId: edition.id, name: 'Marche', runDistance: 0 })
      const race2 = await createExistingRace({ editionId: edition.id, name: 'Trail', runDistance: 20 })

      // Proposition avec racesToUpdate (nécessaire pour le mapping)
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race1.id, raceName: 'Marche', updates: {} },
          { raceId: race2.id, raceName: 'Trail', updates: {} }
        ]
      })

      // User marque race1 comme supprimée via raceEdits (clé numérique)
      await updateProposalUserModifications(proposal.id, {
        raceEdits: {
          [race1.id.toString()]: { _deleted: true }
        }
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: race1 archivée, race2 toujours active
      const deleted1 = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      const active2 = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })

      expect(deleted1?.isArchived).toBe(true)
      expect(active2?.isArchived).toBe(false)
    })

    it('should delete races from userModifiedChanges.raceEdits._deleted (existing-index key)', async () => {
      // Given: 2 courses existantes
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race1 = await createExistingRace({ editionId: edition.id, name: 'Course X', runDistance: 5 })
      const race2 = await createExistingRace({ editionId: edition.id, name: 'Course Y', runDistance: 10 })

      // Proposition avec racesToUpdate pour le mapping existing-index → raceId
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          { raceId: race1.id, raceName: 'Course X', updates: {} },
          { raceId: race2.id, raceName: 'Course Y', updates: {} }
        ]
      })

      // User marque existing-1 (race2) comme supprimée
      await updateProposalUserModifications(proposal.id, {
        raceEdits: {
          'existing-1': { _deleted: true }
        }
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: race2 archivée, race1 toujours active
      const active1 = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      const deleted2 = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })

      expect(active1?.isArchived).toBe(false)
      expect(deleted2?.isArchived).toBe(true)
    })
  })

  // ==========================================================================
  // DÉDUPLICATION DES SUPPRESSIONS
  // ==========================================================================

  describe('Déduplication des suppressions', () => {

    it('should delete race only once when present in multiple sources', async () => {
      // Given: Course présente dans changes.racesToDelete ET raceEdits._deleted
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({ editionId: edition.id, name: 'Doublon', runDistance: 10 })

      // Proposition avec racesToDelete au niveau racine
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToDelete: [race.id],
        racesToUpdate: [
          { raceId: race.id, raceName: 'Doublon', updates: {} }
        ]
      })

      // User marque aussi la course comme supprimée via raceEdits
      await updateProposalUserModifications(proposal.id, {
        racesToDelete: [{ raceId: race.id, raceName: 'Doublon' }],
        raceEdits: {
          [race.id.toString()]: { _deleted: true }
        }
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Course archivée une seule fois (pas d'erreur de doublon)
      const deleted = await testMilesRepublicDb.race.findUnique({ where: { id: race.id } })
      expect(deleted?.isArchived).toBe(true)
      expect(deleted?.isActive).toBe(false)
    })

    it('should consolidate racesToDelete from all sources', async () => {
      // Given: 4 courses, chacune dans une source différente
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race1 = await createExistingRace({ editionId: edition.id, name: 'Via racesToDelete', runDistance: 5 })
      const race2 = await createExistingRace({ editionId: edition.id, name: 'Via races.toDelete', runDistance: 10 })
      const race3 = await createExistingRace({ editionId: edition.id, name: 'Via raceEdits numeric', runDistance: 15 })
      const race4 = await createExistingRace({ editionId: edition.id, name: 'Survivante', runDistance: 20 })

      // Proposition complexe
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToDelete: [race1.id],
        races: {
          toDelete: [race2.id]
        },
        racesToUpdate: [
          { raceId: race3.id, raceName: 'Via raceEdits numeric', updates: {} },
          { raceId: race4.id, raceName: 'Survivante', updates: {} }
        ]
      })

      // User supprime race3 via raceEdits
      await updateProposalUserModifications(proposal.id, {
        raceEdits: {
          [race3.id.toString()]: { _deleted: true }
        }
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: 3 courses archivées, 1 survivante
      const d1 = await testMilesRepublicDb.race.findUnique({ where: { id: race1.id } })
      const d2 = await testMilesRepublicDb.race.findUnique({ where: { id: race2.id } })
      const d3 = await testMilesRepublicDb.race.findUnique({ where: { id: race3.id } })
      const active = await testMilesRepublicDb.race.findUnique({ where: { id: race4.id } })

      expect(d1?.isArchived).toBe(true)
      expect(d2?.isArchived).toBe(true)
      expect(d3?.isArchived).toBe(true)
      expect(active?.isArchived).toBe(false)
    })
  })

  // ==========================================================================
  // ORDRE D'EXÉCUTION
  // ==========================================================================

  describe('Ordre d\'exécution DELETE → UPDATE → ADD', () => {

    it('should not update races that are marked for deletion', async () => {
      // Given: Course marquée pour suppression mais aussi dans racesToUpdate
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({
        editionId: edition.id,
        name: 'Course Originale',
        runDistance: 10
      })

      // Proposition avec update ET delete
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToUpdate: [
          {
            raceId: race.id,
            raceName: 'Course Originale',
            updates: {
              name: { old: 'Course Originale', new: 'Nouveau Nom' },
              runDistance: { old: 10, new: 15 }
            }
          }
        ]
      })

      // User marque la course comme supprimée
      await updateProposalUserModifications(proposal.id, {
        raceEdits: {
          [race.id.toString()]: { _deleted: true }
        }
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Course supprimée (archivée) avec son nom original, pas modifiée
      const deleted = await testMilesRepublicDb.race.findUnique({ where: { id: race.id } })
      expect(deleted?.isArchived).toBe(true)
      // Le nom ne doit PAS avoir été modifié avant la suppression
      expect(deleted?.name).toBe('Course Originale')
      expect(deleted?.runDistance).toBe(10)
    })

    it('should delete races before adding new ones to avoid duplicates', async () => {
      // Reproduit le bug Event 1108 : course 151164 mise à jour en "Trail 11 km"
      // ET course 200639 créée aussi comme "Trail 11 km"

      // Given: Course existante à supprimer + nouvelle course avec même nom
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const existingRace = await createExistingRace({
        editionId: edition.id,
        name: 'Course à remplacer',
        runDistance: 8.5
      })

      // Proposition : supprimer l'existante + ajouter une nouvelle
      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToDelete: [existingRace.id],
        racesToAdd: [{
          name: 'Nouvelle Course',
          runDistance: 11,
          startDate: '2026-03-01T08:00:00.000Z',
          categoryLevel1: 'TRAIL',
          categoryLevel2: 'SHORT_TRAIL'
        }]
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: 1 course archivée, 1 nouvelle course active
      const deleted = await testMilesRepublicDb.race.findUnique({ where: { id: existingRace.id } })
      const activeRaces = await testMilesRepublicDb.race.findMany({
        where: { editionId: edition.id, isArchived: false }
      })

      expect(deleted?.isArchived).toBe(true)
      expect(activeRaces).toHaveLength(1)
      expect(activeRaces[0].name).toBe('Nouvelle Course')
      expect(activeRaces[0].runDistance).toBe(11)
    })
  })

  // ==========================================================================
  // CAS LIMITES
  // ==========================================================================

  describe('Cas limites', () => {

    it('should handle invalid raceId gracefully', async () => {
      // Given: racesToDelete avec des valeurs invalides
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const validRace = await createExistingRace({ editionId: edition.id, name: 'Valid', runDistance: 10 })

      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToDelete: [
          validRace.id,
          NaN,
          null as any,
          undefined as any,
          'invalid' as any,
          -1,
          999999999 // ID qui n'existe pas
        ]
      })

      // When: Ne doit pas planter
      await expect(
        domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })
      ).resolves.not.toThrow()

      // Then: Seule la course valide est archivée
      const deleted = await testMilesRepublicDb.race.findUnique({ where: { id: validRace.id } })
      expect(deleted?.isArchived).toBe(true)
    })

    it('should handle empty racesToDelete array', async () => {
      // Given: racesToDelete vide
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({ editionId: edition.id, name: 'Active', runDistance: 10 })

      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToDelete: []
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Aucune course archivée
      const stillActive = await testMilesRepublicDb.race.findUnique({ where: { id: race.id } })
      expect(stillActive?.isArchived).toBe(false)
    })

    it('should handle racesToDelete with string IDs', async () => {
      // Given: racesToDelete avec IDs en string (provenant du frontend)
      const event = await createExistingEvent()
      const edition = await createExistingEdition(event.id)
      const race = await createExistingRace({ editionId: edition.id, name: 'String ID', runDistance: 10 })

      const proposal = await createEditionUpdateProposal(event.id, edition.id, {
        racesToDelete: [
          { raceId: race.id.toString(), raceName: 'String ID' }
        ]
      })

      // When
      await domainService.applyProposal(proposal.id, { milesRepublicDatabaseId: 'miles-republic-test' })

      // Then: Course archivée
      const deleted = await testMilesRepublicDb.race.findUnique({ where: { id: race.id } })
      expect(deleted?.isArchived).toBe(true)
    })
  })
})
