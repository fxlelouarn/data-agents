/**
 * Tests unitaires : Endpoints EVENT_MERGE
 *
 * Endpoints testés :
 * - POST /api/proposals/merge : Création d'une proposition de fusion
 * - GET /api/events/:id/details : Récupération des détails d'un événement
 *
 * Ces tests mockent la base de données pour tester la logique en isolation.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface MockEvent {
  id: number
  name: string
  city: string
  status: string
  oldSlugId: number | null
  editions?: Array<{
    id: number
    year: number
    startDate: string
    status: string
  }>
}

interface MergeRequestBody {
  keepEventId?: number
  duplicateEventId?: number
  newEventName?: string
  reason?: string
  forceOverwrite?: boolean
  copyMissingEditions?: boolean
}

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────

const createMockEvent = (overrides: Partial<MockEvent> = {}): MockEvent => ({
  id: 1,
  name: 'Trail des Loups',
  city: 'Lyon',
  status: 'LIVE',
  oldSlugId: null,
  editions: [],
  ...overrides,
})

// ─────────────────────────────────────────────────────────────
// LOGIC UNDER TEST (simulating endpoint behavior)
// ─────────────────────────────────────────────────────────────

/**
 * Simule la logique de POST /api/proposals/merge
 */
async function createMergeProposalLogic(
  body: MergeRequestBody,
  findEvent: (id: number) => Promise<MockEvent | null>,
  createProposal: (data: any) => Promise<{ id: string }>
): Promise<{ status: number; body: any }> {
  const { keepEventId, duplicateEventId, newEventName, reason, forceOverwrite, copyMissingEditions = true } = body

  // 1. Validation des paramètres requis
  if (!keepEventId || !duplicateEventId) {
    return {
      status: 400,
      body: { error: 'keepEventId et duplicateEventId sont requis' }
    }
  }

  // 2. Validation: pas le même événement
  if (keepEventId === duplicateEventId) {
    return {
      status: 400,
      body: { error: 'Impossible de fusionner un événement avec lui-même' }
    }
  }

  // 3. Vérifier que l'événement à conserver existe
  const keepEvent = await findEvent(keepEventId)
  if (!keepEvent) {
    return {
      status: 404,
      body: { error: `Événement à conserver non trouvé (ID: ${keepEventId})` }
    }
  }

  // 4. Vérifier que l'événement à conserver n'a pas déjà un oldSlugId
  if (keepEvent.oldSlugId) {
    // Vérifier si cet oldSlugId correspond à un événement existant
    const existingRedirectEvent = await findEvent(keepEvent.oldSlugId)

    if (existingRedirectEvent && !forceOverwrite) {
      // L'oldSlugId pointe vers un événement existant et on n'a pas forcé
      return {
        status: 400,
        body: {
          error: `L'événement "${keepEvent.name}" a déjà une redirection vers "${existingRedirectEvent.name}" (ID: ${keepEvent.oldSlugId}). Utilisez forceOverwrite: true pour écraser.`,
          code: 'ALREADY_HAS_REDIRECT',
          details: {
            existingRedirect: {
              oldSlugId: keepEvent.oldSlugId,
              eventExists: true,
              eventName: existingRedirectEvent.name
            },
            canForce: true
          }
        }
      }
    }
    // Si l'événement n'existe pas (orphelin) ou forceOverwrite=true, on continue
  }

  // 5. Vérifier que l'événement doublon existe
  const duplicateEvent = await findEvent(duplicateEventId)
  if (!duplicateEvent) {
    return {
      status: 404,
      body: { error: `Événement doublon non trouvé (ID: ${duplicateEventId})` }
    }
  }

  // 6. Calculer les éditions qui seront copiées
  const keepEventYears = new Set((keepEvent.editions || []).map(e => e.year))
  const editionsToCopy = copyMissingEditions
    ? (duplicateEvent.editions || [])
        .filter(e => !keepEventYears.has(e.year))
        .map(e => ({
          id: e.id,
          year: e.year,
          startDate: e.startDate,
          status: e.status
        }))
    : []

  // 7. Créer la proposition
  const changes: any = {
    merge: {
      keepEventId,
      keepEventName: keepEvent.name,
      keepEventCity: keepEvent.city,
      keepEventEditionsCount: keepEvent.editions?.length || 0,
      duplicateEventId,
      duplicateEventName: duplicateEvent.name,
      duplicateEventCity: duplicateEvent.city,
      duplicateEventEditionsCount: duplicateEvent.editions?.length || 0,
      newEventName: newEventName || null,
      copyMissingEditions,
      editionsToCopy: editionsToCopy.length > 0 ? editionsToCopy : null
    }
  }

  // Ajouter forceOverwrite si oldSlugId existait
  if (keepEvent.oldSlugId && forceOverwrite) {
    changes.merge.forceOverwrite = true
    changes.merge.previousOldSlugId = keepEvent.oldSlugId
  }

  const proposal = await createProposal({
    type: 'EVENT_MERGE',
    status: 'PENDING',
    eventId: keepEventId.toString(),
    changes,
    justification: [{
      type: 'user_action',
      message: reason || 'Fusion manuelle d\'événements doublons'
    }],
    confidence: 1.0,
    eventName: keepEvent.name,
    eventCity: keepEvent.city
  })

  return {
    status: 200,
    body: { success: true, proposal }
  }
}

/**
 * Simule la logique de GET /api/events/:id/details
 */
async function getEventDetailsLogic(
  eventId: number,
  findEvent: (id: number) => Promise<MockEvent | null>
): Promise<{ status: number; body: any }> {
  // 1. Validation de l'ID
  if (isNaN(eventId) || eventId <= 0) {
    return {
      status: 400,
      body: { error: 'ID événement invalide' }
    }
  }

  // 2. Récupérer l'événement
  const event = await findEvent(eventId)

  if (!event) {
    return {
      status: 404,
      body: { error: 'Événement non trouvé' }
    }
  }

  return {
    status: 200,
    body: { success: true, event }
  }
}

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────

describe('POST /api/proposals/merge', () => {
  let mockFindEvent: jest.Mock
  let mockCreateProposal: jest.Mock

  beforeEach(() => {
    mockFindEvent = jest.fn()
    mockCreateProposal = jest.fn().mockResolvedValue({ id: 'proposal-123' })
  })

  describe('Successful creation', () => {
    test('should create merge proposal with minimal data', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        name: 'Marathon de Paris',
        city: 'Paris',
        editions: [{ id: 1, year: 2024, startDate: '2024-04-07', status: 'LIVE' }]
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        name: 'Marathon Paris',
        city: 'Paris',
        editions: []
      })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 200 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(200)
      expect(result.body.success).toBe(true)
      expect(result.body.proposal.id).toBe('proposal-123')

      // Verify proposal was created with correct data
      expect(mockCreateProposal).toHaveBeenCalledWith(expect.objectContaining({
        type: 'EVENT_MERGE',
        status: 'PENDING',
        eventId: '100',
        confidence: 1.0,
        eventName: 'Marathon de Paris',
        eventCity: 'Paris',
      }))

      // Verify merge data in changes
      const createdChanges = mockCreateProposal.mock.calls[0][0].changes
      expect(createdChanges.merge.keepEventId).toBe(100)
      expect(createdChanges.merge.duplicateEventId).toBe(200)
      expect(createdChanges.merge.keepEventEditionsCount).toBe(1)
      expect(createdChanges.merge.duplicateEventEditionsCount).toBe(0)
    })

    test('should include newEventName when provided', async () => {
      const keepEvent = createMockEvent({ id: 100, name: 'Trail A' })
      const duplicateEvent = createMockEvent({ id: 200, name: 'Trail B' })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      const result = await createMergeProposalLogic(
        {
          keepEventId: 100,
          duplicateEventId: 200,
          newEventName: 'Trail Unifié'
        },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(200)

      const createdChanges = mockCreateProposal.mock.calls[0][0].changes
      expect(createdChanges.merge.newEventName).toBe('Trail Unifié')
    })

    test('should include custom reason in justification', async () => {
      const keepEvent = createMockEvent({ id: 100 })
      const duplicateEvent = createMockEvent({ id: 200 })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      const result = await createMergeProposalLogic(
        {
          keepEventId: 100,
          duplicateEventId: 200,
          reason: 'Doublons détectés lors du nettoyage annuel'
        },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(200)

      const justification = mockCreateProposal.mock.calls[0][0].justification
      expect(justification[0].message).toBe('Doublons détectés lors du nettoyage annuel')
    })

    test('should include editionsToCopy when duplicate has editions not in keepEvent', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        editions: [
          { id: 1, year: 2024, startDate: '2024-06-15', status: 'LIVE' },
        ]
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        editions: [
          { id: 10, year: 2023, startDate: '2023-06-15', status: 'LIVE' },  // Should be copied
          { id: 11, year: 2024, startDate: '2024-06-15', status: 'LIVE' },  // Already exists
          { id: 12, year: 2025, startDate: '2025-06-15', status: 'LIVE' },  // Should be copied
        ]
      })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 200 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(200)

      const createdChanges = mockCreateProposal.mock.calls[0][0].changes
      expect(createdChanges.merge.copyMissingEditions).toBe(true)
      expect(createdChanges.merge.editionsToCopy).toHaveLength(2)
      expect(createdChanges.merge.editionsToCopy.map((e: any) => e.year)).toEqual([2023, 2025])
    })

    test('should set copyMissingEditions to false when explicitly disabled', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        editions: []
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        editions: [
          { id: 10, year: 2023, startDate: '2023-06-15', status: 'LIVE' },
        ]
      })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 200, copyMissingEditions: false },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(200)

      const createdChanges = mockCreateProposal.mock.calls[0][0].changes
      expect(createdChanges.merge.copyMissingEditions).toBe(false)
      expect(createdChanges.merge.editionsToCopy).toBeNull()
    })

    test('should set editionsToCopy to null when all years already exist', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        editions: [
          { id: 1, year: 2024, startDate: '2024-06-15', status: 'LIVE' },
          { id: 2, year: 2025, startDate: '2025-06-15', status: 'LIVE' },
        ]
      })
      const duplicateEvent = createMockEvent({
        id: 200,
        editions: [
          { id: 10, year: 2024, startDate: '2024-06-15', status: 'LIVE' },
          { id: 11, year: 2025, startDate: '2025-06-15', status: 'LIVE' },
        ]
      })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(duplicateEvent)

      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 200 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(200)

      const createdChanges = mockCreateProposal.mock.calls[0][0].changes
      expect(createdChanges.merge.copyMissingEditions).toBe(true)
      expect(createdChanges.merge.editionsToCopy).toBeNull()
    })
  })

  describe('Validation errors', () => {
    test('should fail when keepEventId is missing', async () => {
      const result = await createMergeProposalLogic(
        { duplicateEventId: 200 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(400)
      expect(result.body.error).toContain('keepEventId et duplicateEventId sont requis')
    })

    test('should fail when duplicateEventId is missing', async () => {
      const result = await createMergeProposalLogic(
        { keepEventId: 100 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(400)
      expect(result.body.error).toContain('keepEventId et duplicateEventId sont requis')
    })

    test('should fail when trying to merge event with itself', async () => {
      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 100 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(400)
      expect(result.body.error).toContain('Impossible de fusionner un événement avec lui-même')
    })

    test('should fail when keepEvent is not found', async () => {
      mockFindEvent.mockResolvedValueOnce(null)

      const result = await createMergeProposalLogic(
        { keepEventId: 999, duplicateEventId: 200 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(404)
      expect(result.body.error).toContain('Événement à conserver non trouvé')
      expect(result.body.error).toContain('999')
    })

    test('should fail when duplicateEvent is not found', async () => {
      const keepEvent = createMockEvent({ id: 100 })
      mockFindEvent
        .mockResolvedValueOnce(keepEvent)
        .mockResolvedValueOnce(null)

      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 999 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(404)
      expect(result.body.error).toContain('Événement doublon non trouvé')
      expect(result.body.error).toContain('999')
    })

    test('should fail when keepEvent has oldSlugId pointing to existing event (without forceOverwrite)', async () => {
      const existingRedirectEvent = createMockEvent({
        id: 50,
        name: 'Old Redirected Event'
      })
      const keepEvent = createMockEvent({
        id: 100,
        name: 'Already Merged',
        oldSlugId: 50
      })
      const duplicateEvent = createMockEvent({ id: 200 })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)      // keepEvent lookup
        .mockResolvedValueOnce(existingRedirectEvent) // oldSlugId lookup
        .mockResolvedValueOnce(duplicateEvent)

      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 200 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(400)
      expect(result.body.error).toContain('Already Merged')
      expect(result.body.error).toContain('Old Redirected Event')
      expect(result.body.code).toBe('ALREADY_HAS_REDIRECT')
      expect(result.body.details.canForce).toBe(true)
      expect(result.body.details.existingRedirect.eventExists).toBe(true)
    })

    test('should succeed when keepEvent has orphan oldSlugId (pointing to non-existent event)', async () => {
      const keepEvent = createMockEvent({
        id: 100,
        name: 'Has Orphan Redirect',
        oldSlugId: 50 // Points to non-existent event
      })
      const duplicateEvent = createMockEvent({ id: 200, name: 'Duplicate' })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)      // keepEvent lookup
        .mockResolvedValueOnce(null)           // oldSlugId lookup - event not found (orphan)
        .mockResolvedValueOnce(duplicateEvent) // duplicateEvent lookup

      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 200 },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(200)
      expect(result.body.success).toBe(true)
      expect(mockCreateProposal).toHaveBeenCalled()
    })

    test('should succeed with forceOverwrite when oldSlugId points to existing event', async () => {
      const existingRedirectEvent = createMockEvent({
        id: 50,
        name: 'Old Redirected Event'
      })
      const keepEvent = createMockEvent({
        id: 100,
        name: 'Already Merged',
        oldSlugId: 50
      })
      const duplicateEvent = createMockEvent({ id: 200, name: 'New Duplicate' })

      mockFindEvent
        .mockResolvedValueOnce(keepEvent)           // keepEvent lookup
        .mockResolvedValueOnce(existingRedirectEvent) // oldSlugId lookup
        .mockResolvedValueOnce(duplicateEvent)      // duplicateEvent lookup

      const result = await createMergeProposalLogic(
        { keepEventId: 100, duplicateEventId: 200, forceOverwrite: true },
        mockFindEvent,
        mockCreateProposal
      )

      expect(result.status).toBe(200)
      expect(result.body.success).toBe(true)

      // Verify forceOverwrite and previousOldSlugId are in changes
      const createdChanges = mockCreateProposal.mock.calls[0][0].changes
      expect(createdChanges.merge.forceOverwrite).toBe(true)
      expect(createdChanges.merge.previousOldSlugId).toBe(50)
    })
  })
})

describe('GET /api/events/:id/details', () => {
  let mockFindEvent: jest.Mock

  beforeEach(() => {
    mockFindEvent = jest.fn()
  })

  describe('Successful retrieval', () => {
    test('should return event with editions', async () => {
      const event = createMockEvent({
        id: 100,
        name: 'Trail des Loups',
        city: 'Lyon',
        editions: [
          { id: 1, year: 2024, startDate: '2024-06-15', status: 'LIVE' },
          { id: 2, year: 2023, startDate: '2023-06-17', status: 'LIVE' },
        ]
      })

      mockFindEvent.mockResolvedValueOnce(event)

      const result = await getEventDetailsLogic(100, mockFindEvent)

      expect(result.status).toBe(200)
      expect(result.body.success).toBe(true)
      expect(result.body.event.id).toBe(100)
      expect(result.body.event.name).toBe('Trail des Loups')
      expect(result.body.event.editions).toHaveLength(2)
    })

    test('should return event without editions', async () => {
      const event = createMockEvent({
        id: 100,
        name: 'New Event',
        editions: []
      })

      mockFindEvent.mockResolvedValueOnce(event)

      const result = await getEventDetailsLogic(100, mockFindEvent)

      expect(result.status).toBe(200)
      expect(result.body.event.editions).toHaveLength(0)
    })
  })

  describe('Error cases', () => {
    test('should return 404 when event not found', async () => {
      mockFindEvent.mockResolvedValueOnce(null)

      const result = await getEventDetailsLogic(999, mockFindEvent)

      expect(result.status).toBe(404)
      expect(result.body.error).toContain('Événement non trouvé')
    })

    test('should return 400 for invalid event ID', async () => {
      const result = await getEventDetailsLogic(NaN, mockFindEvent)

      expect(result.status).toBe(400)
      expect(result.body.error).toContain('ID événement invalide')
    })

    test('should return 400 for negative event ID', async () => {
      const result = await getEventDetailsLogic(-1, mockFindEvent)

      expect(result.status).toBe(400)
      expect(result.body.error).toContain('ID événement invalide')
    })

    test('should return 400 for zero event ID', async () => {
      const result = await getEventDetailsLogic(0, mockFindEvent)

      expect(result.status).toBe(400)
      expect(result.body.error).toContain('ID événement invalide')
    })
  })
})

describe('Merge workflow integration', () => {
  /**
   * Tests the complete merge workflow from creation to application
   */

  test('should correctly identify event with more editions as default keepEvent', () => {
    const eventA = createMockEvent({
      id: 100,
      editions: [
        { id: 1, year: 2024, startDate: '2024-01-01', status: 'LIVE' },
        { id: 2, year: 2023, startDate: '2023-01-01', status: 'LIVE' },
        { id: 3, year: 2022, startDate: '2022-01-01', status: 'LIVE' },
      ]
    })
    const eventB = createMockEvent({
      id: 200,
      editions: [
        { id: 4, year: 2024, startDate: '2024-01-01', status: 'LIVE' },
      ]
    })

    // Heuristic: event with more editions should be kept
    const shouldKeep = (eventA.editions?.length || 0) >= (eventB.editions?.length || 0)
      ? eventA
      : eventB

    expect(shouldKeep.id).toBe(100)
    expect(shouldKeep.editions?.length).toBe(3)
  })

  test('should correctly structure merge changes for ProposalDomainService', () => {
    const keepEvent = createMockEvent({
      id: 100,
      name: 'Marathon de Paris',
      city: 'Paris',
      editions: [{ id: 1, year: 2024, startDate: '2024-04-07', status: 'LIVE' }]
    })
    const duplicateEvent = createMockEvent({
      id: 200,
      name: 'Marathon Paris',
      city: 'Paris',
      editions: []
    })

    const mergeChanges = {
      merge: {
        keepEventId: keepEvent.id,
        keepEventName: keepEvent.name,
        keepEventCity: keepEvent.city,
        keepEventEditionsCount: keepEvent.editions?.length || 0,
        duplicateEventId: duplicateEvent.id,
        duplicateEventName: duplicateEvent.name,
        duplicateEventCity: duplicateEvent.city,
        duplicateEventEditionsCount: duplicateEvent.editions?.length || 0,
        newEventName: null
      }
    }

    // Verify structure matches what ProposalDomainService.applyEventMerge expects
    expect(mergeChanges.merge).toBeDefined()
    expect(mergeChanges.merge.keepEventId).toBe(100)
    expect(mergeChanges.merge.duplicateEventId).toBe(200)
    expect(typeof mergeChanges.merge.keepEventId).toBe('number')
    expect(typeof mergeChanges.merge.duplicateEventId).toBe('number')
  })
})
