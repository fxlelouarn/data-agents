/**
 * Tests - Affichage des Updates pour NEW_EVENT
 * 
 * Vérifie que les changements pour les blocs Edition et Races
 * sont correctement structurés dans appliedChanges pour l'affichage
 * dans la page /updates.
 * 
 * Problème découvert le 3 décembre 2025 :
 * - ✅ Blocs Event et Organizer affichent les changements
 * - ❌ Blocs Edition et Races n'affichent AUCUN changement
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { ProposalDomainService } from '@data-agents/database'
import {
  testDb,
  createNewEventProposal,
  setupProposalService,
  cleanupProposalService,
  cleanDatabase,
  cleanMilesRepublicDatabase
} from './helpers'
import { DatabaseManager } from '@data-agents/agent-framework'

describe('NEW_EVENT Updates Display', () => {
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

  describe('appliedChanges structure', () => {
    it('should have all blocks with proper structure for BlockChangesTable', async () => {
      // Given: Proposition NEW_EVENT complète
      const proposal = await createNewEventProposal({
        name: 'Trail des Loups',
        city: 'Dijon',
        country: 'France',
        edition: {
          year: 2026,
          startDate: '2026-03-15T09:00:00.000Z',
          endDate: '2026-03-15T14:00:00.000Z',
          timeZone: 'Europe/Paris'
        },
        organizer: {
          name: 'Association Trail Dijon',
          email: 'contact@traildijon.fr'
        },
        races: [
          {
            name: '10km',
            runDistance: 10,
            categoryLevel1: 'RUNNING',
            startDate: '2026-03-15T09:00:00.000Z'
          },
          {
            name: '21km',
            runDistance: 21.1,
            categoryLevel1: 'RUNNING',
            startDate: '2026-03-15T10:00:00.000Z'
          }
        ]
      })

      // When: Appliquer la proposition
      const result = await domainService.applyProposal(proposal.id, { 
        milesRepublicDatabaseId: 'miles-republic-test' 
      })

      // Then: Vérifier la structure de appliedChanges
      expect(result.success).toBe(true)
      expect(result.appliedChanges).toBeDefined()

      const appliedChanges = result.appliedChanges

      // ✅ Bloc Event : champs au niveau racine
      expect(appliedChanges.name).toBe('Trail des Loups')
      expect(appliedChanges.city).toBe('Dijon')
      expect(appliedChanges.country).toBe('France')

      // ✅ Bloc Organizer : champs imbriqués dans organizer.new
      expect(appliedChanges.organizer).toBeDefined()
      const organizerData = appliedChanges.organizer.new || appliedChanges.organizer
      expect(organizerData.name).toBe('Association Trail Dijon')
      expect(organizerData.email).toBe('contact@traildijon.fr')

      // ❌ Bloc Edition : doit avoir les champs accessibles
      // PROBLÈME POTENTIEL : Les données sont-elles imbriquées dans edition.new ?
      console.log('📋 [TEST] Structure appliedChanges.edition:', appliedChanges.edition)
      
      // Version attendue : Champs au niveau racine ou dans edition.new
      const editionYear = appliedChanges.year || appliedChanges.edition?.new?.year || appliedChanges.edition?.year
      const editionStartDate = appliedChanges.startDate || appliedChanges.edition?.new?.startDate || appliedChanges.edition?.startDate
      
      expect(editionYear).toBe(2026)
      expect(editionStartDate).toBe('2026-03-15T09:00:00.000Z')

      // ❌ Bloc Races : doit avoir les courses accessibles
      // PROBLÈME POTENTIEL : Les données sont-elles dans racesToAdd.new ou races.new ?
      console.log('📋 [TEST] Structure appliedChanges.racesToAdd:', appliedChanges.racesToAdd)
      console.log('📋 [TEST] Structure appliedChanges.races:', appliedChanges.races)
      
      const racesData = appliedChanges.racesToAdd || appliedChanges.races?.new || appliedChanges.races
      
      expect(racesData).toBeDefined()
      expect(Array.isArray(racesData)).toBe(true)
      expect(racesData).toHaveLength(2)
      expect(racesData[0].name).toBe('10km')
      expect(racesData[1].name).toBe('21km')
    })

    it('should match the structure expected by BlockChangesTable component', async () => {
      // Given: Proposition NEW_EVENT
      const proposal = await createNewEventProposal({
        name: 'Semi-Marathon',
        city: 'Lyon',
        country: 'France',
        edition: {
          year: 2026,
          startDate: '2026-04-12T08:00:00.000Z',
          timeZone: 'Europe/Paris'
        },
        races: [
          { name: 'Semi-Marathon', runDistance: 21.1, categoryLevel1: 'RUNNING' }
        ]
      })

      // When: Appliquer
      const result = await domainService.applyProposal(proposal.id, {
        milesRepublicDatabaseId: 'miles-republic-test'
      })

      const appliedChanges = result.appliedChanges

      // Then: Vérifier que BlockChangesTable peut extraire les données

      // Pour le bloc 'edition', BlockChangesTable cherche les champs dans BLOCK_FIELDS['edition']
      // const fields = ['year', 'startDate', 'endDate', 'timeZone', 'calendarStatus', ...]
      
      // getProposedValue('year') doit retourner 2026
      // getProposedValue('startDate') doit retourner '2026-04-12T08:00:00.000Z'
      
      // ⚠️ VÉRIFICATION : Est-ce que ces champs sont accessibles ?
      const yearAccessible = appliedChanges.year !== undefined || 
                            appliedChanges.edition?.new?.year !== undefined ||
                            appliedChanges.edition?.year !== undefined

      expect(yearAccessible).toBe(true)

      // Pour le bloc 'races', BlockChangesTable cherche 'racesToAdd' ou 'races'
      const racesAccessible = appliedChanges.racesToAdd !== undefined ||
                              appliedChanges.races?.new !== undefined ||
                              appliedChanges.races !== undefined

      expect(racesAccessible).toBe(true)
    })
  })

  describe('Validation par blocs - appliedChanges structure', () => {
    it('should preserve block-specific data when validating individual blocks', async () => {
      // Given: Proposition NEW_EVENT avec validation par blocs
      const proposal = await createNewEventProposal({
        name: 'Trail Test',
        city: 'Test City',
        edition: {
          year: 2026,
          startDate: '2026-05-01T09:00:00.000Z'
        },
        races: [
          { name: 'Test Race', runDistance: 10, categoryLevel1: 'TRAIL' }
        ]
      })

      // Simuler validation bloc par bloc (event, edition, races, organizer)
      await testDb.prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          approvedBlocks: {
            event: true,
            edition: true,
            races: true,
            organizer: true
          }
        }
      })

      // When: Appliquer après validation par blocs
      const result = await domainService.applyProposal(proposal.id, {
        milesRepublicDatabaseId: 'miles-republic-test'
      })

      // Then: appliedChanges doit contenir TOUS les blocs validés
      expect(result.appliedChanges).toBeDefined()
      
      // Event
      expect(result.appliedChanges.name).toBeDefined()
      
      // Edition
      const editionData = result.appliedChanges.year || 
                         result.appliedChanges.edition?.new?.year || 
                         result.appliedChanges.edition?.year
      expect(editionData).toBeDefined()
      
      // Races
      const racesData = result.appliedChanges.racesToAdd || 
                       result.appliedChanges.races?.new || 
                       result.appliedChanges.races
      expect(racesData).toBeDefined()
    })
  })
})
