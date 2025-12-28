/**
 * Tests for useProposalEditor - Two-Panes Mode
 *
 * Phase 5 Tests for the new Two-Panes interface:
 * - Copy functions (copyFieldFromSource, copyRaceFromSource, copyAllFromSource)
 * - Comparison functions (getFieldDifferences, getRaceDifferences)
 * - Source management (sourceProposals, activeSourceIndex)
 *
 * Critical scenarios tested:
 * 1. copyAllFromSource does a COMPLETE reset (no leftovers from previous sources)
 * 2. copyFieldFromSource copies a single field correctly
 * 3. copyRaceFromSource with/without targetRaceId
 * 4. getFieldDifferences returns correct diffs
 * 5. getRaceDifferences handles matching by ID and by name
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'
import { useProposalEditor, isGroupReturn } from '../useProposalEditor'
import { proposalsApi } from '@/services/api'
import type { Proposal } from '@/types'

// ─────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────

jest.mock('@/services/api', () => ({
  proposalsApi: {
    getById: jest.fn(),
    updateUserModifications: jest.fn().mockResolvedValue({}),
    validateBlock: jest.fn(),
    unvalidateBlock: jest.fn(),
  }
}))

jest.mock('@/utils/blockFieldMapping', () => ({
  getBlockForField: jest.fn((field: string) => {
    if (['name', 'city', 'country'].includes(field)) return 'event'
    if (['startDate', 'endDate', 'timeZone', 'registrationUrl'].includes(field)) return 'edition'
    if (field === 'organizer') return 'organizer'
    return 'edition'
  }),
  isFieldInBlock: jest.fn(() => true),
}))

const mockProposalsApi = proposalsApi as jest.Mocked<typeof proposalsApi>

// ─────────────────────────────────────────────────────────────
// TEST DATA FACTORIES
// ─────────────────────────────────────────────────────────────

/**
 * Create a mock FFA Scraper proposal (priority 100)
 */
const createFFAProposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: 'proposal-ffa',
  type: 'EDITION_UPDATE',
  status: 'PENDING',
  eventId: '13111',
  editionId: '42613',
  agentId: 'agent-ffa',
  agent: { id: 'agent-ffa', name: 'FFA Scraper', type: 'EXTRACTOR' } as any,
  agentName: 'FFA Scraper',
  changes: {
    startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-15T08:00:00Z' },
    endDate: { old: '2025-06-01T18:00:00Z', new: '2025-06-15T18:00:00Z' },
    racesToUpdate: [
      {
        raceId: 147544,
        raceName: 'Trail 7km',
        currentData: { name: 'Trail 7km', startDate: '2025-06-01T08:00:00Z', runDistance: 7000 },
        updates: { startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-15T08:00:00Z' } }
      },
      {
        raceId: 147545,
        raceName: 'Trail 15km',
        currentData: { name: 'Trail 15km', startDate: '2025-06-01T09:00:00Z', runDistance: 15000 },
        updates: { startDate: { old: '2025-06-01T09:00:00Z', new: '2025-06-15T09:00:00Z' } }
      }
    ]
  },
  confidence: 0.85,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  approvedBlocks: {},
  userModifiedChanges: {},
  ...overrides,
})

/**
 * Create a mock Google Search Date Agent proposal (priority 30)
 */
const createGoogleProposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: 'proposal-google',
  type: 'EDITION_UPDATE',
  status: 'PENDING',
  eventId: '13111',
  editionId: '42613',
  agentId: 'agent-google',
  agent: { id: 'agent-google', name: 'Google Search Date Agent', type: 'EXTRACTOR' } as any,
  agentName: 'Google Search Date Agent',
  changes: {
    startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-20T10:00:00Z' },
    registrationUrl: { old: null, new: 'https://inscriptions.example.com' },
    racesToUpdate: [
      {
        raceId: 147544,
        raceName: 'Trail 7km',
        currentData: { name: 'Trail 7km', startDate: '2025-06-01T08:00:00Z', runDistance: 7000 },
        updates: { startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-20T10:00:00Z' } }
      },
      {
        raceId: 147546, // Different race! Not in FFA
        raceName: 'Trail 30km',
        currentData: { name: 'Trail 30km', startDate: '2025-06-01T10:00:00Z', runDistance: 30000 },
        updates: { startDate: { old: '2025-06-01T10:00:00Z', new: '2025-06-20T12:00:00Z' } }
      }
    ]
  },
  confidence: 0.90,
  createdAt: '2024-01-02T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  approvedBlocks: {},
  userModifiedChanges: {},
  ...overrides,
})

/**
 * Create a third proposal (Slack, priority 90)
 */
const createSlackProposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: 'proposal-slack',
  type: 'EDITION_UPDATE',
  status: 'PENDING',
  eventId: '13111',
  editionId: '42613',
  agentId: 'agent-slack',
  agent: { id: 'agent-slack', name: 'Slack Event Agent', type: 'EXTRACTOR' } as any,
  agentName: 'Slack Event Agent',
  changes: {
    startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-18T09:00:00Z' },
    city: { old: 'Paris', new: 'Lyon' },
    racesToUpdate: [
      {
        raceId: 147544,
        raceName: 'Trail 7km',
        currentData: { name: 'Trail 7km', startDate: '2025-06-01T08:00:00Z', runDistance: 7000 },
        updates: { startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-18T09:00:00Z' } }
      }
    ]
  },
  confidence: 0.75,
  createdAt: '2024-01-03T00:00:00Z',
  updatedAt: '2024-01-03T00:00:00Z',
  approvedBlocks: {},
  userModifiedChanges: {},
  ...overrides,
})

// ─────────────────────────────────────────────────────────────
// TEST WRAPPER
// ─────────────────────────────────────────────────────────────

let testQueryClient: QueryClient

const createWrapper = () => {
  testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: testQueryClient },
      React.createElement(SnackbarProvider, { maxSnack: 3 }, children)
    )
  )
}

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────

describe('useProposalEditor - Two-Panes Mode', () => {
  const originalConsoleError = console.error

  beforeEach(() => {
    jest.clearAllMocks()
    // Supprimer les warnings act() qui sont des faux positifs dans les tests async
    console.error = (...args: unknown[]) => {
      const message = typeof args[0] === 'string' ? args[0] : ''
      if (message.includes('not wrapped in act')) return
      originalConsoleError(...args)
    }
  })

  afterEach(async () => {
    // Annuler toutes les requêtes en cours et nettoyer le cache
    await testQueryClient?.cancelQueries()
    testQueryClient?.clear()
    // Restaurer console.error
    console.error = originalConsoleError
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SOURCE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Source Management', () => {
    it('should initialize sourceProposals sorted by agent priority', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()
      const slackProposal = createSlackProposal()

      // Return in random order
      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: googleProposal } as any)
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: slackProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-google', 'proposal-ffa', 'proposal-slack']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      expect(isGroupReturn(result.current)).toBe(true)
      if (!isGroupReturn(result.current)) return

      // Should be sorted: FFA (100) > Slack (90) > Google (30)
      expect(result.current.sourceProposals[0].id).toBe('proposal-ffa')
      expect(result.current.sourceProposals[1].id).toBe('proposal-slack')
      expect(result.current.sourceProposals[2].id).toBe('proposal-google')
    })

    it('should default activeSourceIndex to 1 when multiple sources exist', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Should default to index 1 (second source) to show differences
      expect(result.current.activeSourceIndex).toBe(1)
    })

    it('should default activeSourceIndex to 0 when only one source exists', async () => {
      const ffaProposal = createFFAProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      expect(result.current.activeSourceIndex).toBe(0)
    })

    it('should allow changing activeSourceIndex', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()
      const slackProposal = createSlackProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)
        .mockResolvedValueOnce({ data: slackProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google', 'proposal-slack']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      act(() => {
        result.current.setActiveSourceIndex(2)
      })

      expect(result.current.activeSourceIndex).toBe(2)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // COPY FIELD FROM SOURCE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('copyFieldFromSource', () => {
    it('should copy a field from the active source to working proposal', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Active source is Google (index 1 by default)
      // Google has registrationUrl that FFA doesn't have
      expect(result.current.activeSourceIndex).toBe(1)

      act(() => {
        result.current.copyFieldFromSource('registrationUrl')
      })

      // The field should now be in userModifiedChanges
      expect(result.current.workingGroup?.userModifiedChanges.registrationUrl)
        .toBe('https://inscriptions.example.com')
    })

    it('should copy startDate from Google source (different from FFA)', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Initially, working proposal has FFA date (priority)
      const initialStartDate = result.current.workingGroup?.consolidatedChanges.find(
        c => c.field === 'startDate'
      )?.options[0]?.proposedValue
      expect(initialStartDate).toBe('2025-06-15T08:00:00Z') // FFA date

      // Copy from Google (active source)
      act(() => {
        result.current.copyFieldFromSource('startDate')
      })

      // Now userModifiedChanges should have Google's date
      expect(result.current.workingGroup?.userModifiedChanges.startDate)
        .toBe('2025-06-20T10:00:00Z') // Google date
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // COPY RACE FROM SOURCE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('copyRaceFromSource', () => {
    it('should add a new race when targetRaceId is undefined', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Google has race 147546 (Trail 30km) that FFA doesn't have
      const initialRaceCount = result.current.workingGroup?.consolidatedRaces.length || 0

      act(() => {
        // Add the race from Google (no targetRaceId = add new)
        result.current.copyRaceFromSource('147546')
      })

      // Wait for state update
      await waitFor(() => {
        // Either in consolidatedRaces or userModifiedRaceChanges
        const hasNewRace = result.current.workingGroup?.consolidatedRaces.some(
          r => r.raceName === 'Trail 30km' || r.raceId === '147546'
        ) || result.current.workingGroup?.userModifiedRaceChanges['147546'] !== undefined
          || Object.keys(result.current.workingGroup?.userModifiedRaceChanges || {}).some(
            k => k.startsWith('new-')
          )
        expect(hasNewRace).toBe(true)
      })
    })

    it('should replace an existing race when targetRaceId is provided', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Both have race 147544 with different dates
      // Copy Google's version to replace FFA's
      act(() => {
        result.current.copyRaceFromSource('147544', '147544')
      })

      // The race should have Google's startDate in userModifiedRaceChanges
      const raceModifications = result.current.workingGroup?.userModifiedRaceChanges['147544']
      expect(raceModifications).toBeDefined()
      expect(raceModifications?.startDate).toBe('2025-06-20T10:00:00Z') // Google's date
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // COPY ALL FROM SOURCE - CRITICAL TEST
  // ═══════════════════════════════════════════════════════════════════════════

  describe('copyAllFromSource - No Leftovers', () => {
    it('should completely replace working proposal with source (no leftovers)', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()
      const slackProposal = createSlackProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)
        .mockResolvedValueOnce({ data: slackProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google', 'proposal-slack']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Step 1: Copy all from Slack (index 1, between FFA and Google)
      act(() => {
        result.current.setActiveSourceIndex(1) // Slack
      })

      act(() => {
        result.current.copyAllFromSource()
      })

      // Slack has 'city' field that others don't have
      await waitFor(() => {
        const hasCity = result.current.workingGroup?.consolidatedChanges.some(
          c => c.field === 'city'
        )
        expect(hasCity).toBe(true)
      })

      const slackStartDate = result.current.workingGroup?.consolidatedChanges.find(
        c => c.field === 'startDate'
      )?.selectedValue
      expect(slackStartDate).toBe('2025-06-18T09:00:00Z') // Slack's date

      // Step 2: Now copy all from Google (index 2)
      act(() => {
        result.current.setActiveSourceIndex(2) // Google
      })

      act(() => {
        result.current.copyAllFromSource()
      })

      await waitFor(() => {
        const googleStartDate = result.current.workingGroup?.consolidatedChanges.find(
          c => c.field === 'startDate'
        )?.selectedValue
        expect(googleStartDate).toBe('2025-06-20T10:00:00Z') // Google's date
      })

      // CRITICAL: Slack's 'city' field should be GONE (no leftovers)
      // Google doesn't have 'city', so it shouldn't exist after copyAll
      const hasCityAfterGoogle = result.current.workingGroup?.consolidatedChanges.some(
        c => c.field === 'city'
      )
      expect(hasCityAfterGoogle).toBe(false)

      // Google has registrationUrl, should exist
      const hasRegistrationUrl = result.current.workingGroup?.consolidatedChanges.some(
        c => c.field === 'registrationUrl'
      )
      expect(hasRegistrationUrl).toBe(true)
    })

    it('should reset userModifiedChanges when copying all', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Step 1: Make some manual modifications
      act(() => {
        result.current.updateField('startDate', '2025-07-01T08:00:00Z')
      })

      expect(result.current.workingGroup?.userModifiedChanges.startDate)
        .toBe('2025-07-01T08:00:00Z')

      // Step 2: Copy all from source
      act(() => {
        result.current.copyAllFromSource()
      })

      // userModifiedChanges should be reset
      expect(result.current.workingGroup?.userModifiedChanges).toEqual({})
    })

    it('should handle races correctly when copying all', async () => {
      const ffaProposal = createFFAProposal() // Has races 147544, 147545
      const googleProposal = createGoogleProposal() // Has races 147544, 147546

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Initially has FFA's races (147544, 147545) plus Google's unique race (147546)
      // due to consolidation
      const initialRaces = result.current.workingGroup?.consolidatedRaces || []

      // Copy all from Google
      act(() => {
        result.current.setActiveSourceIndex(1) // Google
      })

      act(() => {
        result.current.copyAllFromSource()
      })

      await waitFor(() => {
        const races = result.current.workingGroup?.consolidatedRaces || []
        // Should have ONLY Google's races: 147544 and 147546
        // Race 147545 (FFA only) should be GONE
        const raceIds = races.map(r => r.raceId)
        expect(raceIds).toContain('147544')
        expect(raceIds).toContain('147546')
        expect(raceIds).not.toContain('147545') // FFA's unique race should be gone
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // FIELD DIFFERENCES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getFieldDifferences', () => {
    it('should return empty array when not in group mode', async () => {
      const ffaProposal = createFFAProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor('proposal-ffa'), // Single proposal, not group
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      // Not in group mode, so no getFieldDifferences
      expect(isGroupReturn(result.current)).toBe(false)
    })

    it('should identify different fields between working and source', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      // Active source is Google (index 1)
      const diffs = result.current.getFieldDifferences()

      // startDate should be different (FFA: 2025-06-15, Google: 2025-06-20)
      const startDateDiff = diffs.find(d => d.field === 'startDate')
      expect(startDateDiff).toBeDefined()
      expect(startDateDiff?.isDifferent).toBe(true)
      expect(startDateDiff?.workingValue).toBe('2025-06-15T08:00:00Z')
      expect(startDateDiff?.sourceValue).toBe('2025-06-20T10:00:00Z')

      // registrationUrl should be absent in working (FFA doesn't have it)
      const regUrlDiff = diffs.find(d => d.field === 'registrationUrl')
      expect(regUrlDiff).toBeDefined()
      expect(regUrlDiff?.isAbsentInWorking).toBe(true)
      expect(regUrlDiff?.sourceValue).toBe('https://inscriptions.example.com')
    })

    it('should identify fields absent in source', async () => {
      const ffaProposal = createFFAProposal({
        changes: {
          ...createFFAProposal().changes,
          endDate: { old: '2025-06-01T18:00:00Z', new: '2025-06-15T18:00:00Z' },
        }
      })
      const googleProposal = createGoogleProposal({
        changes: {
          startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-20T10:00:00Z' },
          // No endDate in Google's proposal
        }
      })

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      const diffs = result.current.getFieldDifferences()

      // endDate should be absent in source (Google)
      const endDateDiff = diffs.find(d => d.field === 'endDate')
      expect(endDateDiff).toBeDefined()
      expect(endDateDiff?.isAbsentInSource).toBe(true)
      expect(endDateDiff?.workingValue).toBe('2025-06-15T18:00:00Z')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // RACE DIFFERENCES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getRaceDifferences', () => {
    it('should identify races present in both working and source', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      const raceDiffs = result.current.getRaceDifferences()

      // Race 147544 exists in both
      const race147544 = raceDiffs.find(r => r.raceId === '147544')
      expect(race147544).toBeDefined()
      expect(race147544?.existsInWorking).toBe(true)
      expect(race147544?.existsInSource).toBe(true)

      // Should have field differences for startDate
      const startDateDiff = race147544?.fieldDiffs.find(d => d.field === 'startDate')
      expect(startDateDiff?.isDifferent).toBe(true)
    })

    it('should identify races only in working (not in source)', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      const raceDiffs = result.current.getRaceDifferences()

      // Race 147545 is only in FFA (working), not in Google (source)
      const race147545 = raceDiffs.find(r => r.raceId === '147545')
      expect(race147545).toBeDefined()
      expect(race147545?.existsInWorking).toBe(true)
      expect(race147545?.existsInSource).toBe(false)
    })

    it('should identify races only in source (not in working)', async () => {
      // Create FFA with only race 147544
      const ffaProposal = createFFAProposal({
        changes: {
          startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-15T08:00:00Z' },
          racesToUpdate: [
            {
              raceId: 147544,
              raceName: 'Trail 7km',
              currentData: { name: 'Trail 7km', startDate: '2025-06-01T08:00:00Z', runDistance: 7000 },
              updates: { startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-15T08:00:00Z' } }
            }
          ]
        }
      })
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      const raceDiffs = result.current.getRaceDifferences()

      // Race 147546 is only in Google (source), not in FFA (working)
      const race147546 = raceDiffs.find(r => r.raceId === '147546')
      expect(race147546).toBeDefined()
      expect(race147546?.existsInWorking).toBe(false)
      expect(race147546?.existsInSource).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRTY STATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Dirty State', () => {
    it('should mark as dirty after copyFieldFromSource', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      expect(result.current.isDirty).toBe(false)

      act(() => {
        result.current.copyFieldFromSource('registrationUrl')
      })

      expect(result.current.isDirty).toBe(true)
    })

    it('should mark as dirty after copyAllFromSource', async () => {
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: ffaProposal } as any)
        .mockResolvedValueOnce({ data: googleProposal } as any)

      const { result } = renderHook(
        () => useProposalEditor(['proposal-ffa', 'proposal-google']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      expect(result.current.isDirty).toBe(false)

      act(() => {
        result.current.copyAllFromSource()
      })

      expect(result.current.workingGroup?.isDirty).toBe(true)
    })
  })
})
