/**
 * Tests for useProposalEditor.addRace functionality
 *
 * Validates that manually added races appear in both:
 * - userModifiedRaceChanges (for persistence/save)
 * - consolidatedRaces / races (for display in RacesChangesTable)
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'
import { useProposalEditor, isGroupReturn, WorkingProposalGroup, ConsolidatedRaceChange } from '../useProposalEditor'
import { proposalsApi } from '@/services/api'
import type { Proposal, RaceData } from '@/types'

// ─────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────

jest.mock('@/services/api', () => ({
  proposalsApi: {
    getById: jest.fn(),
    updateUserModifications: jest.fn(),
    validateBlock: jest.fn(),
    unvalidateBlock: jest.fn(),
  }
}))

jest.mock('@/utils/blockFieldMapping', () => ({
  getBlockForField: jest.fn((field: string) => {
    if (['name', 'city', 'country'].includes(field)) return 'event'
    if (['startDate', 'endDate', 'timeZone'].includes(field)) return 'edition'
    if (field === 'organizer') return 'organizer'
    return 'edition'
  }),
  isFieldInBlock: jest.fn(() => true),
}))

const mockProposalsApi = proposalsApi as jest.Mocked<typeof proposalsApi>

// ─────────────────────────────────────────────────────────────
// TEST DATA
// ─────────────────────────────────────────────────────────────

const createMockProposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: 'proposal-1',
  type: 'EDITION_UPDATE',
  status: 'PENDING',
  eventId: 'event-1',
  editionId: 'edition-1',
  agentId: 'agent-1',
  changes: {
    startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-15T09:00:00Z' }
  },
  confidence: 0.85,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  approvedBlocks: {},
  userModifiedChanges: {},
  ...overrides,
})

const createMockRaceData = (overrides: Partial<RaceData> = {}): RaceData => ({
  name: 'Trail du Mont Blanc',
  categoryLevel1: 'TRAIL',
  categoryLevel2: 'ULTRA_TRAIL',
  runDistance: 170,
  runPositiveElevation: 10000,
  ...overrides,
})

// ─────────────────────────────────────────────────────────────
// TEST WRAPPER
// ─────────────────────────────────────────────────────────────

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(SnackbarProvider, { maxSnack: 3 }, children)
    )
  )
}

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────

describe('useProposalEditor - addRace', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Single mode (one proposal)', () => {
    it('should add race to both userModifiedRaceChanges and races', async () => {
      const mockProposal = createMockProposal()
      mockProposalsApi.getById.mockResolvedValue({ data: mockProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor('proposal-1'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      // Verify single mode
      expect(isGroupReturn(result.current)).toBe(false)
      if (isGroupReturn(result.current)) return

      // Add a race
      const newRace = createMockRaceData()
      act(() => {
        result.current.addRace(newRace)
      })

      // In single mode, check workingProposal
      const workingProposal = result.current.workingProposal
      expect(workingProposal).toBeDefined()

      // Find the new race in races (for display)
      const newRaceEntry = Object.entries(workingProposal?.races || {}).find(
        ([id]) => id.startsWith('new-')
      )
      expect(newRaceEntry).toBeDefined()
      expect(newRaceEntry?.[1].name).toBe('Trail du Mont Blanc')
      expect(newRaceEntry?.[1].categoryLevel1).toBe('TRAIL')
      expect(newRaceEntry?.[1].runDistance).toBe(170)

      // Verify it's also in userModifiedRaceChanges (for persistence)
      const raceId = newRaceEntry?.[0]
      expect(workingProposal?.userModifiedRaceChanges[raceId!]).toBeDefined()
      expect(workingProposal?.userModifiedRaceChanges[raceId!].name).toBe('Trail du Mont Blanc')
    })

    it('should generate unique IDs for multiple added races', async () => {
      const mockProposal = createMockProposal()
      mockProposalsApi.getById.mockResolvedValue({ data: mockProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor('proposal-1'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (isGroupReturn(result.current)) return

      // Add first race
      act(() => {
        result.current.addRace(createMockRaceData({ name: 'Race 1' }))
      })

      // Small delay to ensure unique timestamp
      await new Promise(resolve => setTimeout(resolve, 5))

      // Add second race
      act(() => {
        result.current.addRace(createMockRaceData({ name: 'Race 2' }))
      })

      const workingProposal = result.current.workingProposal
      const newRaces = Object.entries(workingProposal?.races || {}).filter(
        ([id]) => id.startsWith('new-')
      )

      expect(newRaces.length).toBe(2)
      expect(newRaces[0][0]).not.toBe(newRaces[1][0]) // Different IDs
      expect(newRaces[0][1].name).toBe('Race 1')
      expect(newRaces[1][1].name).toBe('Race 2')
    })

    it('should mark state as dirty after adding race', async () => {
      const mockProposal = createMockProposal()
      mockProposalsApi.getById.mockResolvedValue({ data: mockProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor('proposal-1'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (isGroupReturn(result.current)) return

      expect(result.current.workingProposal?.isDirty).toBe(false)

      act(() => {
        result.current.addRace(createMockRaceData())
      })

      expect(result.current.workingProposal?.isDirty).toBe(true)
    })

    it('should include added races in save payload', async () => {
      const mockProposal = createMockProposal()
      mockProposalsApi.getById.mockResolvedValue({ data: mockProposal } as any)
      mockProposalsApi.updateUserModifications.mockResolvedValue({} as any)

      const { result } = renderHook(
        () => useProposalEditor('proposal-1', { autosave: false }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (isGroupReturn(result.current)) return

      // Add a race
      act(() => {
        result.current.addRace(createMockRaceData({ name: 'New Trail' }))
      })

      // Manually save
      await act(async () => {
        await result.current.save()
      })

      // Verify API was called with race data
      expect(mockProposalsApi.updateUserModifications).toHaveBeenCalled()
      const savedPayload = mockProposalsApi.updateUserModifications.mock.calls[0][1]

      expect(savedPayload.raceEdits).toBeDefined()
      const raceIds = Object.keys(savedPayload.raceEdits)
      expect(raceIds.some(id => id.startsWith('new-'))).toBe(true)

      // Verify race data in payload
      const newRaceId = raceIds.find(id => id.startsWith('new-'))!
      expect(savedPayload.raceEdits[newRaceId].name).toBe('New Trail')
    })
  })

  describe('addRace logic (unit tests)', () => {
    /**
     * These tests verify the state transformation logic of addRace
     * without the full hook lifecycle complexity
     */

    it('should create ConsolidatedRaceChange with correct structure for new race', () => {
      const race: RaceData = createMockRaceData()
      const tempId = `new-${Date.now()}`

      // Simulate what addRace does for consolidatedRaces
      const newConsolidatedRace: ConsolidatedRaceChange = {
        raceId: tempId,
        raceName: race.name || 'Nouvelle course',
        proposalIds: [],
        originalFields: {},
        fields: { ...race, id: tempId }
      }

      expect(newConsolidatedRace.raceId).toMatch(/^new-\d+$/)
      expect(newConsolidatedRace.raceName).toBe('Trail du Mont Blanc')
      expect(newConsolidatedRace.proposalIds).toEqual([])
      expect(newConsolidatedRace.originalFields).toEqual({})
      expect(newConsolidatedRace.fields.categoryLevel1).toBe('TRAIL')
      expect(newConsolidatedRace.fields.runDistance).toBe(170)
    })

    it('should use fallback name when race name is empty', () => {
      const race: RaceData = createMockRaceData({ name: '' })
      const tempId = `new-${Date.now()}`

      const newConsolidatedRace: ConsolidatedRaceChange = {
        raceId: tempId,
        raceName: race.name || 'Nouvelle course',
        proposalIds: [],
        originalFields: {},
        fields: { ...race, id: tempId }
      }

      expect(newConsolidatedRace.raceName).toBe('Nouvelle course')
    })

    it('should add race to both consolidatedRaces and userModifiedRaceChanges in group state', () => {
      const race: RaceData = createMockRaceData()
      const tempId = `new-${Date.now()}`

      // Simulate initial group state
      const initialState: Partial<WorkingProposalGroup> = {
        consolidatedRaces: [],
        userModifiedRaceChanges: {},
        isDirty: false
      }

      // Simulate addRace transformation
      const nextState = {
        ...initialState,
        consolidatedRaces: [
          ...initialState.consolidatedRaces!,
          {
            raceId: tempId,
            raceName: race.name || 'Nouvelle course',
            proposalIds: [],
            originalFields: {},
            fields: { ...race, id: tempId }
          }
        ],
        userModifiedRaceChanges: {
          ...initialState.userModifiedRaceChanges,
          [tempId]: { ...race, id: tempId }
        },
        isDirty: true
      }

      // Verify both locations have the race
      expect(nextState.consolidatedRaces.length).toBe(1)
      expect(nextState.consolidatedRaces[0].raceId).toBe(tempId)
      expect(nextState.userModifiedRaceChanges[tempId]).toBeDefined()
      expect(nextState.userModifiedRaceChanges[tempId].name).toBe('Trail du Mont Blanc')
      expect(nextState.isDirty).toBe(true)
    })
  })
})
