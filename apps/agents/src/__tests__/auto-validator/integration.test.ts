/**
 * Tests d'intégration pour l'AutoValidatorAgent
 *
 * Ces tests utilisent les bases de données de test (data-agents et Miles Republic)
 * pour vérifier le comportement complet de l'agent.
 */

import { testDb, testMilesRepublicDb, cleanDatabase, cleanMilesRepublicDatabase, closeDatabase } from '../proposal-application/helpers/db-setup'
import {
  createExistingEvent,
  createExistingEdition,
  createExistingRace,
  createTestAgent
} from '../proposal-application/helpers/fixtures'
import { validateProposal } from '../../auto-validator/validator'
import { AutoValidatorConfig } from '../../auto-validator/types'

// Configuration par défaut
const defaultConfig: AutoValidatorConfig = {
  milesRepublicDatabase: 'miles-republic',
  maxProposalsPerRun: 100,
  minConfidence: 0.7,
  enableEditionBlock: true,
  enableOrganizerBlock: true,
  enableRacesBlock: true,
  dryRun: false
}

// Mock du logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}

describe('AutoValidatorAgent - Tests d\'intégration', () => {
  // Setup et cleanup
  beforeEach(async () => {
    await cleanDatabase()
    await cleanMilesRepublicDatabase()
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await closeDatabase()
  })

  describe('Validation avec vraies données Miles Republic', () => {
    it('devrait valider une proposition pour un événement non featured sans client premium', async () => {
      // Créer un événement et une édition dans Miles Republic
      const event = await createExistingEvent({
        name: 'Trail Test',
        city: 'Paris'
      })

      // Mettre à jour isFeatured via une requête directe
      await testMilesRepublicDb.event.update({
        where: { id: event.id },
        data: { isFeatured: false }
      })

      const edition = await createExistingEdition(event.id, {
        year: 2026
      })

      // Créer une course existante
      const race = await createExistingRace({
        editionId: edition.id,
        name: '10km Test',
        runDistance: 10
      })

      // Créer la proposition
      const proposal = {
        id: 'test-integration-1',
        confidence: 0.85,
        eventId: event.id.toString(),
        editionId: edition.id.toString(),
        changes: {
          startDate: {
            old: edition.startDate,
            new: new Date('2026-04-15T09:00:00.000Z')
          },
          racesToUpdate: {
            new: [{
              raceId: race.id,
              raceName: race.name,
              updates: {
                startDate: {
                  old: race.startDate,
                  new: new Date('2026-04-15T09:00:00.000Z')
                }
              }
            }]
          }
        }
      }

      // Valider avec la vraie base Miles Republic
      const result = await validateProposal(
        proposal,
        testMilesRepublicDb,
        defaultConfig,
        mockLogger
      )

      expect(result.isValid).toBe(true)
      expect(result.details).toMatchObject({
        eventId: event.id.toString(),
        editionId: edition.id.toString(),
        hasEditionChanges: true,
        hasRaceChanges: true
      })
    })

    it('devrait rejeter une proposition pour un événement featured', async () => {
      // Créer un événement featured
      const event = await createExistingEvent({
        name: 'Trail Featured',
        city: 'Lyon'
      })

      // Mettre à jour isFeatured via une requête directe
      await testMilesRepublicDb.event.update({
        where: { id: event.id },
        data: { isFeatured: true }
      })

      const edition = await createExistingEdition(event.id, {
        year: 2026
      })

      const proposal = {
        id: 'test-integration-2',
        confidence: 0.9,
        eventId: event.id.toString(),
        editionId: edition.id.toString(),
        changes: {
          startDate: { old: null, new: new Date('2026-04-15') }
        }
      }

      const result = await validateProposal(
        proposal,
        testMilesRepublicDb,
        defaultConfig,
        mockLogger
      )

      expect(result.isValid).toBe(false)
      expect(result.exclusionReason).toBe('featuredEvent')
    })

    it('devrait rejeter une proposition pour une édition avec client premium', async () => {
      const event = await createExistingEvent({
        name: 'Trail Premium',
        city: 'Bordeaux'
      })

      // Mettre à jour isFeatured via une requête directe
      await testMilesRepublicDb.event.update({
        where: { id: event.id },
        data: { isFeatured: false }
      })

      const edition = await createExistingEdition(event.id, {
        year: 2026
      })

      // Mettre à jour customerType via une requête directe
      await testMilesRepublicDb.edition.update({
        where: { id: edition.id },
        data: { customerType: 'PREMIUM' }
      })

      const proposal = {
        id: 'test-integration-3',
        confidence: 0.9,
        eventId: event.id.toString(),
        editionId: edition.id.toString(),
        changes: {
          startDate: { old: null, new: new Date('2026-04-15') }
        }
      }

      const result = await validateProposal(
        proposal,
        testMilesRepublicDb,
        defaultConfig,
        mockLogger
      )

      expect(result.isValid).toBe(false)
      expect(result.exclusionReason).toBe('premiumCustomer')
    })
  })

  describe('Workflow complet de validation', () => {
    it('devrait créer des ProposalApplication pour une proposition validée', async () => {
      // Setup Miles Republic
      const event = await createExistingEvent({
        name: 'Trail Validable',
        city: 'Marseille'
      })

      // Mettre à jour isFeatured via une requête directe
      await testMilesRepublicDb.event.update({
        where: { id: event.id },
        data: { isFeatured: false }
      })

      const edition = await createExistingEdition(event.id, {
        year: 2026
      })

      const race = await createExistingRace({
        editionId: edition.id,
        name: 'Marathon Test',
        runDistance: 42
      })

      // Setup data-agents : créer l'agent FFA
      const ffaAgent = await createTestAgent({
        name: 'FFA Scraper',
        type: 'EXTRACTOR'
      })

      // Créer une proposition PENDING
      const proposal = await testDb.proposal.create({
        data: {
          agentId: ffaAgent.id,
          type: 'EDITION_UPDATE',
          status: 'PENDING',
          eventId: event.id.toString(),
          editionId: edition.id.toString(),
          confidence: 0.85,
          eventName: event.name,
          eventCity: event.city,
          editionYear: 2026,
          changes: {
            startDate: {
              old: edition.startDate?.toISOString(),
              new: '2026-04-20T09:00:00.000Z',
              confidence: 0.85
            },
            calendarStatus: {
              old: edition.calendarStatus,
              new: 'CONFIRMED',
              confidence: 0.9
            },
            racesToUpdate: {
              new: [{
                raceId: race.id,
                raceName: race.name,
                updates: {
                  startDate: {
                    old: race.startDate?.toISOString(),
                    new: '2026-04-20T09:00:00.000Z'
                  }
                },
                currentData: {
                  name: race.name,
                  startDate: race.startDate,
                  runDistance: race.runDistance
                }
              }],
              confidence: 0.85
            }
          },
          justification: [{
            type: 'text',
            content: 'Mise à jour depuis FFA'
          }],
          approvedBlocks: {}
        }
      })

      // Valider la proposition
      const validationResult = await validateProposal(
        proposal,
        testMilesRepublicDb,
        defaultConfig,
        mockLogger
      )

      expect(validationResult.isValid).toBe(true)

      // Simuler ce que ferait l'agent : créer les ProposalApplication
      const blocksToValidate = ['edition', 'races']

      for (const block of blocksToValidate) {
        await testDb.proposalApplication.create({
          data: {
            proposalId: proposal.id,
            proposalIds: [proposal.id],
            blockType: block,
            status: 'PENDING',
            appliedChanges: {},
            logs: ['Auto-validated by Auto Validator Agent v1.0.0']
          }
        })
      }

      // Mettre à jour la proposition
      await testDb.proposal.update({
        where: { id: proposal.id },
        data: {
          status: 'APPROVED',
          approvedBlocks: { edition: true, races: true },
          reviewedAt: new Date(),
          reviewedBy: 'auto-validator-agent'
        }
      })

      // Vérifier les résultats
      const updatedProposal = await testDb.proposal.findUnique({
        where: { id: proposal.id },
        include: { applications: true }
      })

      expect(updatedProposal?.status).toBe('APPROVED')
      expect(updatedProposal?.approvedBlocks).toEqual({ edition: true, races: true })
      expect(updatedProposal?.applications).toHaveLength(2)
      expect(updatedProposal?.applications.map(a => a.blockType).sort()).toEqual(['edition', 'races'])
    })

    it('ne devrait PAS créer de ProposalApplication pour une proposition rejetée', async () => {
      // Setup Miles Republic avec un événement featured
      const event = await createExistingEvent({
        name: 'Trail Featured',
        city: 'Nice'
      })

      // Mettre à jour isFeatured via une requête directe
      await testMilesRepublicDb.event.update({
        where: { id: event.id },
        data: { isFeatured: true }
      })

      const edition = await createExistingEdition(event.id, {
        year: 2026
      })

      // Setup data-agents
      const ffaAgent = await createTestAgent({
        name: 'FFA Scraper',
        type: 'EXTRACTOR'
      })

      const proposal = await testDb.proposal.create({
        data: {
          agentId: ffaAgent.id,
          type: 'EDITION_UPDATE',
          status: 'PENDING',
          eventId: event.id.toString(),
          editionId: edition.id.toString(),
          confidence: 0.9,
          eventName: event.name,
          eventCity: event.city,
          editionYear: 2026,
          changes: {
            startDate: { old: null, new: '2026-04-20T09:00:00.000Z' }
          },
          justification: [],
          approvedBlocks: {}
        }
      })

      // Valider (devrait être rejeté)
      const validationResult = await validateProposal(
        proposal,
        testMilesRepublicDb,
        defaultConfig,
        mockLogger
      )

      expect(validationResult.isValid).toBe(false)
      expect(validationResult.exclusionReason).toBe('featuredEvent')

      // Vérifier qu'aucune application n'a été créée
      const applications = await testDb.proposalApplication.findMany({
        where: { proposalId: proposal.id }
      })

      expect(applications).toHaveLength(0)

      // La proposition doit rester PENDING
      const unchangedProposal = await testDb.proposal.findUnique({
        where: { id: proposal.id }
      })

      expect(unchangedProposal?.status).toBe('PENDING')
    })
  })

  describe('Détection des nouvelles courses', () => {
    it('devrait rejeter une proposition qui tente de créer des courses', async () => {
      const event = await createExistingEvent({
        name: 'Trail avec nouvelles courses',
        city: 'Toulouse'
      })

      // Mettre à jour isFeatured via une requête directe
      await testMilesRepublicDb.event.update({
        where: { id: event.id },
        data: { isFeatured: false }
      })

      const edition = await createExistingEdition(event.id, {
        year: 2026
      })

      const proposal = {
        id: 'test-new-races',
        confidence: 0.9,
        eventId: event.id.toString(),
        editionId: edition.id.toString(),
        changes: {
          startDate: { old: null, new: '2026-04-20T09:00:00.000Z' },
          racesToAdd: {
            new: [
              { name: '10km Trail', runDistance: 10, categoryLevel1: 'TRAIL' },
              { name: '20km Trail', runDistance: 20, categoryLevel1: 'TRAIL' }
            ]
          }
        }
      }

      const result = await validateProposal(
        proposal,
        testMilesRepublicDb,
        defaultConfig,
        mockLogger
      )

      expect(result.isValid).toBe(false)
      expect(result.exclusionReason).toBe('newRaces')
      expect(result.details?.newRacesCount).toBe(2)
    })
  })

  describe('Confiance minimale configurable', () => {
    it('devrait respecter le seuil de confiance configuré', async () => {
      const event = await createExistingEvent({
        name: 'Trail Confiance',
        city: 'Strasbourg'
      })

      // Mettre à jour isFeatured via une requête directe
      await testMilesRepublicDb.event.update({
        where: { id: event.id },
        data: { isFeatured: false }
      })

      const edition = await createExistingEdition(event.id, {
        year: 2026
      })

      const proposal = {
        id: 'test-confidence',
        confidence: 0.65,
        eventId: event.id.toString(),
        editionId: edition.id.toString(),
        changes: {
          startDate: { old: null, new: '2026-04-20T09:00:00.000Z' }
        }
      }

      // Avec minConfidence = 0.7 (défaut), devrait être rejeté
      const resultDefault = await validateProposal(
        proposal,
        testMilesRepublicDb,
        defaultConfig,
        mockLogger
      )

      expect(resultDefault.isValid).toBe(false)
      expect(resultDefault.exclusionReason).toBe('lowConfidence')

      // Avec minConfidence = 0.6, devrait être accepté
      const configPermissive: AutoValidatorConfig = {
        ...defaultConfig,
        minConfidence: 0.6
      }

      const resultPermissive = await validateProposal(
        proposal,
        testMilesRepublicDb,
        configPermissive,
        mockLogger
      )

      expect(resultPermissive.isValid).toBe(true)
    })
  })
})
