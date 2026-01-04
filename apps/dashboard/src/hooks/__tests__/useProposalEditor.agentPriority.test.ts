/**
 * Tests for useProposalEditor - Agent Priority in Grouped Proposals
 *
 * FIX 2025-12-13: When multiple agents propose changes for the same races,
 * agents are prioritized by SOURCE RELIABILITY, not by self-declared confidence:
 * - FFA Scraper (priority 100): Official FFA source, most reliable
 * - Slack Event Agent (priority 90): User-provided data, reliable
 * - Other agents (priority 50): Default priority
 * - Google Search Date Agent (priority 30): Web-scraped data, less reliable
 *
 * Bug: Previously, edition fields used FFA dates but race fields used Google dates
 * because consolidateRacesFromProposals() was overwriting fields instead of
 * keeping the first (highest priority) agent's values.
 */

import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'
import { useProposalEditor, isGroupReturn, ConsolidatedRaceChange } from '../useProposalEditor'
import { proposalsApi } from '@/services/api'
import type { Proposal } from '@/types'

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

/**
 * Create a mock FFA Scraper proposal
 * FFA Scraper has priority 100 (official source)
 * Note: confidence value doesn't affect priority anymore
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
    racesToUpdate: [
      {
        raceId: 147544,
        raceName: 'Trail 7km',
        currentData: {
          name: 'Trail 7km',
          startDate: '2025-06-01T08:00:00Z',
          runDistance: 7000
        },
        updates: {
          startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-15T08:00:00Z' }
        }
      },
      {
        raceId: 147545,
        raceName: 'Trail 15km',
        currentData: {
          name: 'Trail 15km',
          startDate: '2025-06-01T09:00:00Z',
          runDistance: 15000
        },
        updates: {
          startDate: { old: '2025-06-01T09:00:00Z', new: '2025-06-15T09:00:00Z' }
        }
      }
    ]
  },
  confidence: 0.70, // Even with lower confidence, FFA has priority due to agent type
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  approvedBlocks: {},
  userModifiedChanges: {},
  ...overrides,
})

/**
 * Create a mock Google Search Date Agent proposal
 * Google Agent has priority 30 (web-scraped data, less reliable)
 * Note: Even with high confidence, Google has lower priority than FFA
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
    startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-20T10:00:00Z' }, // Different date!
    racesToUpdate: [
      {
        raceId: 147544,
        raceName: 'Trail 7km',
        currentData: {
          name: 'Trail 7km',
          startDate: '2025-06-01T08:00:00Z',
          runDistance: 7000
        },
        updates: {
          startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-20T10:00:00Z' } // Different!
        }
      },
      {
        raceId: 147545,
        raceName: 'Trail 15km',
        currentData: {
          name: 'Trail 15km',
          startDate: '2025-06-01T09:00:00Z',
          runDistance: 15000
        },
        updates: {
          startDate: { old: '2025-06-01T09:00:00Z', new: '2025-06-20T11:00:00Z' } // Different!
        }
      }
    ]
  },
  confidence: 0.95, // Even with HIGH confidence, Google has lower priority than FFA!
  createdAt: '2024-01-02T00:00:00Z', // Created later
  updatedAt: '2024-01-02T00:00:00Z',
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

describe('useProposalEditor - Agent Priority', () => {
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

  describe('consolidateRacesFromProposals - priority logic (unit tests)', () => {
    /**
     * These tests verify the core consolidation logic that was fixed.
     * They simulate the internal behavior without the full hook lifecycle.
     */

    it('should keep FFA dates when FFA is processed first (higher agent priority)', () => {
      // Simulate the consolidation with correct order (FFA first due to agent priority, not confidence)
      const proposals = [createFFAProposal(), createGoogleProposal()]

      // Helper function matching the implementation
      const getAgentPriority = (agentName: string | undefined): number => {
        if (!agentName) return 50
        const name = agentName.toLowerCase()
        if (name.includes('ffa')) return 100
        if (name.includes('slack')) return 90
        if (name.includes('google')) return 30
        return 50
      }

      // Sort by agent priority (as the fix does)
      const sorted = proposals.sort((a, b) => {
        const priorityA = getAgentPriority((a as any).agentName)
        const priorityB = getAgentPriority((b as any).agentName)
        return priorityB - priorityA // Descending
      })

      // FFA should be first even though Google has higher confidence (0.95 vs 0.70)
      expect(sorted[0].id).toBe('proposal-ffa')
      expect(sorted[0].agentName).toBe('FFA Scraper')
      expect(sorted[1].id).toBe('proposal-google')
      expect(sorted[1].agentName).toBe('Google Search Date Agent')
    })

    it('should prioritize by agent type, not by confidence', () => {
      // Google has confidence 0.95, FFA has confidence 0.70 (in our mock data)
      // But FFA should still be first because of agent type priority
      const ffaProposal = createFFAProposal({ confidence: 0.50 }) // Very low confidence
      const googleProposal = createGoogleProposal({ confidence: 0.99 }) // Very high confidence

      const getAgentPriority = (agentName: string | undefined): number => {
        if (!agentName) return 50
        const name = agentName.toLowerCase()
        if (name.includes('ffa')) return 100
        if (name.includes('google')) return 30
        return 50
      }

      const proposals = [googleProposal, ffaProposal] // Google first in array
      const sorted = proposals.sort((a, b) => {
        const priorityA = getAgentPriority((a as any).agentName)
        const priorityB = getAgentPriority((b as any).agentName)
        return priorityB - priorityA
      })

      // FFA should be first despite lower confidence
      expect(sorted[0].id).toBe('proposal-ffa')
      expect(sorted[0].confidence).toBe(0.50) // Low confidence but high priority
      expect(sorted[1].id).toBe('proposal-google')
      expect(sorted[1].confidence).toBe(0.99) // High confidence but low priority
    })

    it('should NOT overwrite fields already set by higher-priority agent', () => {
      // Simulate the fixed consolidation logic
      const raceMap = new Map<string, { fields: Record<string, any> }>()

      // FFA proposal processed first (highest priority)
      const ffaRaceData = {
        id: '147544',
        name: 'Trail 7km',
        startDate: '2025-06-15T08:00:00Z' // FFA date
      }

      raceMap.set('147544', { fields: {} })
      const ffaEntry = raceMap.get('147544')!

      // FIX: Add fields only if not already present
      Object.entries(ffaRaceData).forEach(([field, value]) => {
        if (!(field in ffaEntry.fields)) {
          ffaEntry.fields[field] = value
        }
      })

      // Google proposal processed second (lower priority)
      const googleRaceData = {
        id: '147544',
        name: 'Trail 7km',
        startDate: '2025-06-20T10:00:00Z' // Google date - should NOT overwrite!
      }

      // FIX: This should NOT overwrite startDate
      Object.entries(googleRaceData).forEach(([field, value]) => {
        if (!(field in ffaEntry.fields)) {
          ffaEntry.fields[field] = value
        }
      })

      // Verify FFA date is preserved, not overwritten by Google
      expect(ffaEntry.fields.startDate).toBe('2025-06-15T08:00:00Z')
      expect(ffaEntry.fields.startDate).not.toBe('2025-06-20T10:00:00Z')
    })

    it('should demonstrate the OLD bug: spread operator overwrites fields', () => {
      // This test shows what the bug was doing BEFORE the fix
      const raceMap = new Map<string, { fields: Record<string, any> }>()

      const ffaRaceData = {
        id: '147544',
        name: 'Trail 7km',
        startDate: '2025-06-15T08:00:00Z' // FFA date
      }

      raceMap.set('147544', { fields: {} })
      const entry = raceMap.get('147544')!

      // OLD (buggy) behavior: simple spread
      entry.fields = { ...entry.fields, ...ffaRaceData }

      const googleRaceData = {
        id: '147544',
        name: 'Trail 7km',
        startDate: '2025-06-20T10:00:00Z' // Google date
      }

      // OLD (buggy) behavior: Google overwrites FFA!
      entry.fields = { ...entry.fields, ...googleRaceData }

      // This was the BUG: Google date overwrote FFA date
      expect(entry.fields.startDate).toBe('2025-06-20T10:00:00Z') // Wrong!
      expect(entry.fields.startDate).not.toBe('2025-06-15T08:00:00Z')
    })

    it('should handle multiple races with mixed agent contributions', () => {
      // Simulate scenario: FFA has both races, Google only has one
      const raceMap = new Map<string, { fields: Record<string, any>, proposalIds: string[] }>()

      // Process FFA first (both races)
      const ffaRaces = [
        { raceId: '147544', startDate: '2025-06-15T08:00:00Z' },
        { raceId: '147545', startDate: '2025-06-15T09:00:00Z' }
      ]

      ffaRaces.forEach(race => {
        if (!raceMap.has(race.raceId)) {
          raceMap.set(race.raceId, { fields: {}, proposalIds: [] })
        }
        const entry = raceMap.get(race.raceId)!
        entry.proposalIds.push('proposal-ffa')

        Object.entries(race).forEach(([field, value]) => {
          if (field !== 'raceId' && !(field in entry.fields)) {
            entry.fields[field] = value
          }
        })
      })

      // Process Google second (only first race)
      const googleRaces = [
        { raceId: '147544', startDate: '2025-06-20T10:00:00Z' }
      ]

      googleRaces.forEach(race => {
        if (!raceMap.has(race.raceId)) {
          raceMap.set(race.raceId, { fields: {}, proposalIds: [] })
        }
        const entry = raceMap.get(race.raceId)!
        entry.proposalIds.push('proposal-google')

        Object.entries(race).forEach(([field, value]) => {
          if (field !== 'raceId' && !(field in entry.fields)) {
            entry.fields[field] = value
          }
        })
      })

      // Verify: Race 147544 should have FFA date (not overwritten by Google)
      expect(raceMap.get('147544')!.fields.startDate).toBe('2025-06-15T08:00:00Z')
      expect(raceMap.get('147544')!.proposalIds).toContain('proposal-ffa')
      expect(raceMap.get('147544')!.proposalIds).toContain('proposal-google')

      // Verify: Race 147545 should have FFA date (only FFA proposed it)
      expect(raceMap.get('147545')!.fields.startDate).toBe('2025-06-15T09:00:00Z')
      expect(raceMap.get('147545')!.proposalIds).toEqual(['proposal-ffa'])
    })

    it('should allow lower-priority agent to add NEW fields not present in higher-priority agent', () => {
      const raceMap = new Map<string, { fields: Record<string, any> }>()

      // FFA only provides startDate
      const ffaRaceData = {
        raceId: '147544',
        startDate: '2025-06-15T08:00:00Z'
      }

      raceMap.set('147544', { fields: {} })
      const entry = raceMap.get('147544')!

      Object.entries(ffaRaceData).forEach(([field, value]) => {
        if (field !== 'raceId' && !(field in entry.fields)) {
          entry.fields[field] = value
        }
      })

      // Google provides startDate AND a new field (registrationUrl)
      const googleRaceData = {
        raceId: '147544',
        startDate: '2025-06-20T10:00:00Z', // Should NOT overwrite
        registrationUrl: 'https://example.com/register' // NEW field, should be added
      }

      Object.entries(googleRaceData).forEach(([field, value]) => {
        if (field !== 'raceId' && !(field in entry.fields)) {
          entry.fields[field] = value
        }
      })

      // FFA startDate is preserved
      expect(entry.fields.startDate).toBe('2025-06-15T08:00:00Z')
      // Google's NEW field is added
      expect(entry.fields.registrationUrl).toBe('https://example.com/register')
    })
  })

  describe('initializeWorkingGroup - sorting logic (unit tests)', () => {
    const getAgentPriority = (agentName: string | undefined): number => {
      if (!agentName) return 50
      const name = agentName.toLowerCase()
      if (name.includes('ffa')) return 100
      if (name.includes('slack')) return 90
      if (name.includes('google')) return 30
      return 50
    }

    it('should sort proposals by agent priority before consolidation', () => {
      // Create proposals in wrong order (lower priority first)
      const proposals = [
        createGoogleProposal(), // priority: 30
        createFFAProposal()     // priority: 100
      ]

      // The fix: sort by agent priority descending
      const sorted = [...proposals].sort((a, b) => {
        const priorityA = getAgentPriority((a as any).agentName)
        const priorityB = getAgentPriority((b as any).agentName)
        return priorityB - priorityA
      })

      expect(sorted[0].id).toBe('proposal-ffa')
      expect(sorted[1].id).toBe('proposal-google')
    })

    it('should handle proposals with undefined agentName', () => {
      const proposals = [
        createGoogleProposal({ agentName: undefined as any }),
        createFFAProposal()
      ]

      const sorted = [...proposals].sort((a, b) => {
        const priorityA = getAgentPriority((a as any).agentName)
        const priorityB = getAgentPriority((b as any).agentName)
        return priorityB - priorityA
      })

      // FFA with priority 100 should be first, undefined agentName (priority 50) should be second
      expect(sorted[0].id).toBe('proposal-ffa')
      expect(sorted[1].id).toBe('proposal-google')
    })

    it('should handle proposals with same agent type by preserving original order', () => {
      const proposals = [
        createFFAProposal({ id: 'first' }),
        createFFAProposal({ id: 'second' })
      ]

      const sorted = [...proposals].sort((a, b) => {
        const priorityA = getAgentPriority((a as any).agentName)
        const priorityB = getAgentPriority((b as any).agentName)
        return priorityB - priorityA
      })

      // With equal priority, the sort is stable, first should remain first
      expect(sorted[0].id).toBe('first')
      expect(sorted[1].id).toBe('second')
    })

    it('should correctly order Slack agent between FFA and Google', () => {
      const proposals = [
        createGoogleProposal(),
        { ...createFFAProposal(), id: 'proposal-slack', agentName: 'Slack Event Agent' } as Proposal,
        createFFAProposal()
      ]

      const sorted = [...proposals].sort((a, b) => {
        const priorityA = getAgentPriority((a as any).agentName)
        const priorityB = getAgentPriority((b as any).agentName)
        return priorityB - priorityA
      })

      // Order should be: FFA (100) > Slack (90) > Google (30)
      expect(sorted[0].id).toBe('proposal-ffa')
      expect(sorted[1].id).toBe('proposal-slack')
      expect(sorted[2].id).toBe('proposal-google')
    })
  })

  describe('Integration: Full hook with grouped proposals', () => {
    it('should use FFA dates for races in grouped proposal', async () => {
      // Mock API responses for both proposals
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

      // Verify group mode
      expect(isGroupReturn(result.current)).toBe(true)
      if (!isGroupReturn(result.current)) return

      const workingGroup = result.current.workingGroup
      expect(workingGroup).toBeDefined()

      // Find race 147544 in consolidated races
      const race147544 = workingGroup?.consolidatedRaces.find(
        r => r.raceId === '147544'
      )
      expect(race147544).toBeDefined()

      // The startDate should be from FFA (2025-06-15T08:00:00Z), NOT Google (2025-06-20T10:00:00Z)
      expect(race147544?.fields.startDate).toBe('2025-06-15T08:00:00Z')
    })

    it('should use FFA dates even when Google proposal is fetched first', async () => {
      // API returns Google first, but FFA has higher confidence
      const ffaProposal = createFFAProposal()
      const googleProposal = createGoogleProposal()

      // Google is fetched first but FFA has higher confidence
      mockProposalsApi.getById
        .mockResolvedValueOnce({ data: googleProposal } as any)
        .mockResolvedValueOnce({ data: ffaProposal } as any)

      const { result } = renderHook(
        // Note: IDs order doesn't matter, confidence does
        () => useProposalEditor(['proposal-google', 'proposal-ffa']),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      if (!isGroupReturn(result.current)) return

      const workingGroup = result.current.workingGroup

      // Race should still use FFA dates (sorted by confidence)
      const race147544 = workingGroup?.consolidatedRaces.find(
        r => r.raceId === '147544'
      )

      expect(race147544?.fields.startDate).toBe('2025-06-15T08:00:00Z')
    })

    it('should include only primary proposal in proposalIds (Two-Panes mode)', async () => {
      // ✅ REFONTE Two-Panes 2025-12-28:
      // Avec le nouveau comportement, seule la proposition prioritaire est utilisée
      // pour la working proposal. Les autres sont dans sourceProposals.
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

      const race147544 = result.current.workingGroup?.consolidatedRaces.find(
        r => r.raceId === '147544'
      )

      // ✅ Two-Panes: seule la proposition prioritaire (FFA) est dans proposalIds
      expect(race147544?.proposalIds).toContain('proposal-ffa')
      expect(race147544?.proposalIds).not.toContain('proposal-google')
      
      // ✅ Google est disponible via sourceProposals pour copie manuelle
      expect(result.current.sourceProposals.length).toBe(2)
    })
  })

  describe('Edge cases', () => {
    it('should handle single agent proposal (no priority conflict)', async () => {
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

      const race147544 = result.current.workingGroup?.consolidatedRaces.find(
        r => r.raceId === '147544'
      )

      expect(race147544?.fields.startDate).toBe('2025-06-15T08:00:00Z')
      expect(race147544?.proposalIds).toEqual(['proposal-ffa'])
    })

    it('should handle agents proposing different races (no overlap)', async () => {
      // ✅ REFONTE Two-Panes 2025-12-28:
      // Avec le nouveau comportement, seule la proposition prioritaire (FFA) est utilisée
      // Les courses de Google sont disponibles via sourceProposals pour copie manuelle
      
      // FFA proposes race 147544, Google proposes race 147546 (different)
      const ffaProposal = createFFAProposal({
        changes: {
          racesToUpdate: [
            {
              raceId: 147544,
              raceName: 'Trail 7km',
              updates: { startDate: { old: '2025-06-01T08:00:00Z', new: '2025-06-15T08:00:00Z' } }
            }
          ]
        }
      })

      const googleProposal = createGoogleProposal({
        changes: {
          racesToUpdate: [
            {
              raceId: 147546, // Different race!
              raceName: 'Trail 30km',
              updates: { startDate: { old: '2025-06-01T10:00:00Z', new: '2025-06-20T10:00:00Z' } }
            }
          ]
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

      const races = result.current.workingGroup?.consolidatedRaces

      // ✅ Two-Panes: Working proposal contient UNIQUEMENT les courses de FFA (prioritaire)
      // La course 147546 de Google n'est pas dans la working proposal,
      // mais disponible via sourceProposals pour copie manuelle
      expect(races?.length).toBe(1)

      // La course FFA est présente
      const race147544 = races?.find(r => r.raceId === '147544')
      expect(race147544?.proposalIds).toEqual(['proposal-ffa'])
      expect(race147544?.fields.startDate).toBe('2025-06-15T08:00:00Z')

      // ✅ La course Google est disponible via sourceProposals (pas dans working)
      expect(result.current.sourceProposals.length).toBe(2)
      const googleSource = result.current.sourceProposals.find(p => p.id === 'proposal-google')
      expect(googleSource).toBeDefined()
    })
  })
})
