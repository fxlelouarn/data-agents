/**
 * Tests for EVENT_MERGE proposal application
 *
 * Validates the applyEventMerge method in ProposalDomainService:
 * - Merges two events by setting oldSlugId on keepEvent
 * - Marks duplicate event as DELETED
 * - Optionally renames the kept event
 */

import { ProposalDomainService } from '../proposal-domain.service'
import { ProposalRepository } from '../../repositories/proposal.repository'

// ─────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}

const mockMilesRepo = {
  findEventById: jest.fn(),
  updateEvent: jest.fn(),
  updateEdition: jest.fn(),
  findEditionById: jest.fn(),
  createEdition: jest.fn(),
  createRace: jest.fn(),
}

const mockDbManager = {
  connectToSource: jest.fn().mockResolvedValue({
    event: {
      findUnique: jest.fn(),
      update: jest.fn(),
    }
  }),
}

// ─────────────────────────────────────────────────────────────
// TEST DATA
// ─────────────────────────────────────────────────────────────

const createMockEvent = (overrides: any = {}) => ({
  id: 1,
  name: 'Trail des Loups',
  city: 'Lyon',
  status: 'LIVE',
  oldSlugId: null,
  editions: [],
  ...overrides,
})

const createMockEdition = (overrides: any = {}) => ({
  id: 1000,
  year: '2025',
  startDate: new Date('2025-06-15'),
  endDate: null,
  registrationOpeningDate: null,
  registrationClosingDate: null,
  calendarStatus: 'DATE_CONFIRMED',
  clientStatus: null,
  status: 'LIVE',
  timeZone: 'Europe/Paris',
  currency: 'EUR',
  whatIsIncluded: null,
  clientExternalUrl: null,
  bibWithdrawalFullAddress: null,
  volunteerCode: null,
  races: [],
  ...overrides,
})

const createMockRace = (overrides: any = {}) => ({
  id: 5000,
  name: 'Trail 20km',
  startDate: new Date('2025-06-15T08:00:00Z'),
  timeZone: 'Europe/Paris',
  categoryLevel1: 'TRAIL',
  categoryLevel2: 'SHORT_TRAIL',
  runDistance: 20,
  bikeDistance: null,
  walkDistance: null,
  swimDistance: null,
  runPositiveElevation: 800,
  isActive: true,
  ...overrides,
})

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────

describe('ProposalDomainService - applyEventMerge', () => {
  let service: ProposalDomainService
  let mockProposalRepo: jest.Mocked<ProposalRepository>

  beforeEach(() => {
    jest.clearAllMocks()

    // Set default mock implementations
    mockMilesRepo.updateEdition.mockResolvedValue({})

    mockProposalRepo = {
      findById: jest.fn(),
      findApplicationsByProposalId: jest.fn(),
    } as any

    service = new ProposalDomainService(
      mockProposalRepo,
      mockDbManager,
      mockLogger
    )

    // Mock getMilesRepublicRepository to return our mockMilesRepo
    ;(service as any).getMilesRepublicRepository = jest.fn().mockResolvedValue(mockMilesRepo)
  })

  describe('Successful merge', () => {
    it('should set oldSlugId on keepEvent and mark duplicate as DELETED', async () => {
      const keepEvent = createMockEvent({ id: 100, name: 'Marathon de Paris' })
      const duplicateEvent = createMockEvent({ id: 200, name: 'Marathon Paris' })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)      // First call: keepEvent
        .mockResolvedValueOnce(duplicateEvent) // Second call: duplicateEvent

      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          keepEventName: 'Marathon de Paris',
          duplicateEventName: 'Marathon Paris',
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify keepEvent was updated with oldSlugId
      expect(mockMilesRepo.updateEvent).toHaveBeenCalledWith(100, {
        oldSlugId: 200,
        toUpdate: true,
        algoliaObjectToUpdate: true,
      })

      // Verify duplicateEvent was marked as DELETED
      expect(mockMilesRepo.updateEvent).toHaveBeenCalledWith(200, {
        status: 'DELETED',
        toUpdate: true,
        algoliaObjectToDelete: true,
      })

      // Verify appliedChanges structure
      expect(result.appliedChanges.keepEvent.id).toBe(100)
      expect(result.appliedChanges.keepEvent.oldSlugId).toBe(200)
      expect(result.appliedChanges.duplicateEvent.id).toBe(200)
      expect(result.appliedChanges.duplicateEvent.newStatus).toBe('DELETED')
    })

    it('should rename keepEvent when newEventName is provided', async () => {
      const keepEvent = createMockEvent({ id: 100, name: 'Trail des Loups' })
      const duplicateEvent = createMockEvent({ id: 200, name: 'Trail Loups' })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          newEventName: 'Trail des Loups - Edition Unifiee',
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify keepEvent was updated with new name AND oldSlugId
      expect(mockMilesRepo.updateEvent).toHaveBeenCalledWith(100, {
        oldSlugId: 200,
        toUpdate: true,
        algoliaObjectToUpdate: true,
        name: 'Trail des Loups - Edition Unifiee',
      })

      // Verify appliedChanges contains name change
      expect(result.appliedChanges.keepEvent.previousName).toBe('Trail des Loups')
      expect(result.appliedChanges.keepEvent.newName).toBe('Trail des Loups - Edition Unifiee')
    })

    it('should trim whitespace from newEventName', async () => {
      const keepEvent = createMockEvent({ id: 100, name: 'Original Name' })
      const duplicateEvent = createMockEvent({ id: 200 })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          newEventName: '  Trimmed Name  ',
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)
      expect(mockMilesRepo.updateEvent).toHaveBeenCalledWith(100, expect.objectContaining({
        name: 'Trimmed Name',
      }))
    })

    it('should not update name when newEventName is empty string', async () => {
      const keepEvent = createMockEvent({ id: 100, name: 'Keep This Name' })
      const duplicateEvent = createMockEvent({ id: 200 })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          newEventName: '',
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify name was NOT included in update
      expect(mockMilesRepo.updateEvent).toHaveBeenCalledWith(100, {
        oldSlugId: 200,
        toUpdate: true,
        algoliaObjectToUpdate: true,
        // No 'name' property
      })
    })

    it('should not update name when newEventName is whitespace only', async () => {
      const keepEvent = createMockEvent({ id: 100, name: 'Keep This Name' })
      const duplicateEvent = createMockEvent({ id: 200 })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          newEventName: '   ',
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify name was NOT included in update (whitespace only = empty)
      expect(mockMilesRepo.updateEvent).toHaveBeenCalledWith(100, {
        oldSlugId: 200,
        toUpdate: true,
        algoliaObjectToUpdate: true,
      })
    })
  })

  describe('Error cases', () => {
    // Helper to get error message from result
    const getErrorMessage = (result: any): string => {
      return result.errors?.[0]?.message || ''
    }

    it('should fail when merge data is missing', async () => {
      const changes = {}

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(false)
      expect(getErrorMessage(result)).toContain('Données de fusion manquantes')
    })

    it('should fail when keepEventId is missing', async () => {
      const changes = {
        merge: {
          duplicateEventId: 200,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(false)
      expect(getErrorMessage(result)).toContain('keepEventId et duplicateEventId sont requis')
    })

    it('should fail when duplicateEventId is missing', async () => {
      const changes = {
        merge: {
          keepEventId: 100,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(false)
      expect(getErrorMessage(result)).toContain('keepEventId et duplicateEventId sont requis')
    })

    it('should fail when keepEvent is not found', async () => {
      mockMilesRepo.findEventById.mockResolvedValueOnce(null)

      const changes = {
        merge: {
          keepEventId: 999,
          duplicateEventId: 200,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(false)
      expect(getErrorMessage(result)).toContain('Événement à conserver non trouvé')
      expect(getErrorMessage(result)).toContain('999')
    })

    it('should fail when duplicateEvent is not found', async () => {
      const keepEvent = createMockEvent({ id: 100 })
      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(null)

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 999,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(false)
      expect(getErrorMessage(result)).toContain('Événement doublon non trouvé')
      expect(getErrorMessage(result)).toContain('999')
    })

    it('should fail when keepEvent has oldSlugId pointing to existing event (without forceOverwrite)', async () => {
      const existingRedirectEvent = createMockEvent({
        id: 50,
        name: 'Old Redirected Event',
      })
      const keepEvent = createMockEvent({
        id: 100,
        name: 'Already Merged Event',
        oldSlugId: 50, // Points to existing event
      })
      const duplicateEvent = createMockEvent({ id: 200 })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)           // keepEvent lookup
        .mockResolvedValueOnce(existingRedirectEvent) // oldSlugId lookup - event exists
        .mockResolvedValueOnce(duplicateEvent)      // duplicateEvent lookup

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(false)
      expect(getErrorMessage(result)).toContain('Already Merged Event')
      expect(getErrorMessage(result)).toContain('Old Redirected Event')
      expect(getErrorMessage(result)).toContain('forceOverwrite: true')
    })

    it('should succeed when keepEvent has orphan oldSlugId (pointing to non-existent event)', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        name: 'Has Orphan Redirect',
        oldSlugId: 50, // Points to non-existent event
      })
      const duplicateEvent = createMockEvent({ id: 200 })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)      // keepEvent lookup
        .mockResolvedValueOnce(null)           // oldSlugId lookup - event not found (orphan)
        .mockResolvedValueOnce(duplicateEvent) // duplicateEvent lookup

      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      // Should succeed - orphan oldSlugId is automatically overwritten
      expect(result.success).toBe(true)
      expect(result.appliedChanges.keepEvent.oldSlugId).toBe(200)
    })

    it('should succeed with forceOverwrite when oldSlugId points to existing event', async () => {
      const existingRedirectEvent = createMockEvent({
        id: 50,
        name: 'Old Redirected Event',
      })
      const keepEvent = createMockEvent({
        id: 100,
        name: 'Already Merged Event',
        oldSlugId: 50,
      })
      const duplicateEvent = createMockEvent({ id: 200, name: 'New Duplicate' })

      // Reset mock and set up the 3 findEventById calls in order
      mockMilesRepo.findEventById.mockReset()
      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)           // 1. keepEvent lookup (id: 100)
        .mockResolvedValueOnce(existingRedirectEvent) // 2. oldSlugId lookup (id: 50)
        .mockResolvedValueOnce(duplicateEvent)      // 3. duplicateEvent lookup (id: 200)

      mockMilesRepo.updateEvent.mockReset()
      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          forceOverwrite: true,  // This should allow overwriting existing redirect
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      // Should succeed with forceOverwrite
      expect(result.success).toBe(true)

      // Verify keepEvent was updated with new oldSlugId (overwrites old one)
      expect(mockMilesRepo.updateEvent).toHaveBeenCalledWith(100, {
        oldSlugId: 200,
        toUpdate: true,
        algoliaObjectToUpdate: true,
      })

      // Verify appliedChanges
      expect(result.appliedChanges.keepEvent.oldSlugId).toBe(200)
    })

    it('should handle database errors gracefully', async () => {
      const keepEvent = createMockEvent({ id: 100 })
      const duplicateEvent = createMockEvent({ id: 200 })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.updateEvent.mockRejectedValueOnce(new Error('Database connection lost'))

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(false)
      expect(getErrorMessage(result)).toContain('Database connection lost')
    })
  })

  describe('Logging', () => {
    it('should log successful merge operations', async () => {
      const keepEvent = createMockEvent({ id: 100, name: 'Keep Event' })
      const duplicateEvent = createMockEvent({ id: 200, name: 'Duplicate Event' })

      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
        }
      }

      await (service as any).applyEventMerge(changes, {})

      // Verify logging for keepEvent update
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('EVENT_MERGE: Événement 100 mis à jour')
      )

      // Verify logging for duplicate deletion
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('EVENT_MERGE: Événement doublon 200 marqué DELETED')
      )
    })
  })

  describe('Copy missing editions', () => {
    it('should copy editions from duplicate that do not exist on keepEvent (by year)', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        name: 'Marathon de Paris',
        editions: [
          { id: 1001, year: '2024' },
          { id: 1002, year: '2025' },
        ]
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        name: 'Marathon Paris',
        editions: [
          { id: 2001, year: '2023' },  // Should be copied
          { id: 2002, year: '2024' },  // Already exists on keepEvent
          { id: 2003, year: '2026' },  // Should be copied
        ]
      })

      const edition2023 = createMockEdition({
        id: 2001,
        year: '2023',
        races: [
          createMockRace({ id: 5001, name: 'Marathon' }),
          createMockRace({ id: 5002, name: '10km' }),
        ]
      })
      const edition2026 = createMockEdition({
        id: 2003,
        year: '2026',
        races: [
          createMockRace({ id: 5003, name: 'Marathon 2026' }),
        ]
      })

      mockMilesRepo.findEventById.mockReset()
      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.findEditionById.mockReset()
      mockMilesRepo.findEditionById
        .mockResolvedValueOnce(edition2023)
        .mockResolvedValueOnce(edition2026)

      mockMilesRepo.createEdition.mockReset()
      mockMilesRepo.createEdition
        .mockResolvedValueOnce({ id: 3001 })  // New edition for 2023
        .mockResolvedValueOnce({ id: 3002 })  // New edition for 2026

      mockMilesRepo.createRace.mockReset()
      mockMilesRepo.createRace.mockResolvedValue({})

      mockMilesRepo.updateEvent.mockReset()
      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          copyMissingEditions: true,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify 2 editions were created (2023 and 2026)
      expect(mockMilesRepo.createEdition).toHaveBeenCalledTimes(2)
      expect(mockMilesRepo.createEdition).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 100,
        year: '2023',
      }))
      expect(mockMilesRepo.createEdition).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 100,
        year: '2026',
      }))

      // Verify races were copied (2 for 2023, 1 for 2026)
      expect(mockMilesRepo.createRace).toHaveBeenCalledTimes(3)

      // Verify copiedEditions in result
      expect(result.appliedChanges.copiedEditions).toHaveLength(2)
      expect(result.appliedChanges.copiedEditions).toEqual(expect.arrayContaining([
        { originalId: 2001, newId: 3001, year: '2023' },
        { originalId: 2003, newId: 3002, year: '2026' },
      ]))
    })

    it('should not copy editions when copyMissingEditions is false', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        editions: [{ id: 1001, year: '2025' }]
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        editions: [{ id: 2001, year: '2024' }]  // Would normally be copied
      })

      mockMilesRepo.findEventById.mockReset()
      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.updateEvent.mockReset()
      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          copyMissingEditions: false,  // Explicitly disabled
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify NO editions were created
      expect(mockMilesRepo.findEditionById).not.toHaveBeenCalled()
      expect(mockMilesRepo.createEdition).not.toHaveBeenCalled()

      // Verify copiedEditions is undefined
      expect(result.appliedChanges.copiedEditions).toBeUndefined()
    })

    it('should not copy editions when all years already exist on keepEvent', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        editions: [
          { id: 1001, year: '2024' },
          { id: 1002, year: '2025' },
        ]
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        editions: [
          { id: 2001, year: '2024' },  // Already exists
          { id: 2002, year: '2025' },  // Already exists
        ]
      })

      mockMilesRepo.findEventById.mockReset()
      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.updateEvent.mockReset()
      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          copyMissingEditions: true,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify NO editions were created
      expect(mockMilesRepo.createEdition).not.toHaveBeenCalled()

      // Verify copiedEditions is undefined (empty array becomes undefined)
      expect(result.appliedChanges.copiedEditions).toBeUndefined()

      // Verify info log
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Aucune édition à copier')
      )
    })

    it('should copy editions by default (copyMissingEditions defaults to true)', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        editions: []  // No editions
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        editions: [{ id: 2001, year: '2025' }]
      })

      const edition2025 = createMockEdition({
        id: 2001,
        year: '2025',
        races: []
      })

      mockMilesRepo.findEventById.mockReset()
      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.findEditionById.mockReset()
      mockMilesRepo.findEditionById.mockResolvedValueOnce(edition2025)

      mockMilesRepo.createEdition.mockReset()
      mockMilesRepo.createEdition.mockResolvedValueOnce({ id: 3001 })

      mockMilesRepo.updateEvent.mockReset()
      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
          // copyMissingEditions NOT specified - should default to true
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify edition WAS created (default behavior)
      expect(mockMilesRepo.createEdition).toHaveBeenCalledTimes(1)
      expect(result.appliedChanges.copiedEditions).toHaveLength(1)
    })

    it('should handle edition not found gracefully and continue with others', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        editions: []
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        editions: [
          { id: 2001, year: '2023' },  // Will fail to find
          { id: 2002, year: '2024' },  // Will succeed
        ]
      })

      const edition2024 = createMockEdition({
        id: 2002,
        year: '2024',
        races: []
      })

      mockMilesRepo.findEventById.mockReset()
      mockMilesRepo.findEventById
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      mockMilesRepo.findEditionById.mockReset()
      mockMilesRepo.findEditionById
        .mockResolvedValueOnce(null)           // 2023 not found
        .mockResolvedValueOnce(edition2024)   // 2024 found

      mockMilesRepo.createEdition.mockReset()
      mockMilesRepo.createEdition.mockResolvedValueOnce({ id: 3001 })

      mockMilesRepo.updateEvent.mockReset()
      mockMilesRepo.updateEvent.mockResolvedValue({})

      const changes = {
        merge: {
          keepEventId: 100,
          duplicateEventId: 200,
        }
      }

      const result = await (service as any).applyEventMerge(changes, {})

      expect(result.success).toBe(true)

      // Verify warning was logged for missing edition
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Édition 2001 non trouvée')
      )

      // Verify only 1 edition was created (the one that was found)
      expect(mockMilesRepo.createEdition).toHaveBeenCalledTimes(1)
      expect(result.appliedChanges.copiedEditions).toHaveLength(1)
      expect(result.appliedChanges.copiedEditions[0].year).toBe('2024')
    })
  })
})
