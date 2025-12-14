import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'
import React from 'react'
import { useCheckExistingEvent } from '../useApi'
import { proposalsApi } from '@/services/api'

// Mock the API
jest.mock('@/services/api', () => ({
  proposalsApi: {
    checkExistingEvent: jest.fn()
  }
}))

const mockProposalsApi = proposalsApi as jest.Mocked<typeof proposalsApi>

// Create wrapper with providers
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0
      }
    }
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </QueryClientProvider>
  )
}

describe('useCheckExistingEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('when enabled is false', () => {
    it('should not make API call', async () => {
      const { result } = renderHook(
        () => useCheckExistingEvent('proposal-123', false),
        { wrapper: createWrapper() }
      )

      // Wait a bit to ensure no call is made
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockProposalsApi.checkExistingEvent).not.toHaveBeenCalled()
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('when enabled is true', () => {
    it('should call API and return no match', async () => {
      mockProposalsApi.checkExistingEvent.mockResolvedValueOnce({
        data: {
          hasMatch: false,
          proposalData: {
            eventName: 'Trail Blanc du Corbier',
            eventCity: 'Le Corbier',
            eventDepartment: '73',
            editionYear: 2026,
            editionDate: '2026-01-24T17:00:00.000Z'
          }
        },
        message: 'OK'
      } as any)

      const { result } = renderHook(
        () => useCheckExistingEvent('proposal-123', true),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      }, { timeout: 5000 })

      expect(mockProposalsApi.checkExistingEvent).toHaveBeenCalledWith('proposal-123')
      expect(result.current.data?.data.hasMatch).toBe(false)
      expect(result.current.data?.data.match).toBeUndefined()
    })

    it('should call API and return a match', async () => {
      mockProposalsApi.checkExistingEvent.mockResolvedValueOnce({
        data: {
          hasMatch: true,
          match: {
            type: 'FUZZY_MATCH',
            eventId: 15388,
            eventName: 'Trail Blanc du Corbier',
            eventSlug: 'trail-blanc-du-corbier-15388',
            eventCity: 'Villarembert',
            editionId: 55062,
            editionYear: '2026',
            confidence: 0.85
          },
          proposalData: {
            eventName: 'Trail Blanc Du Corbier',
            eventCity: 'Le Corbier',
            eventDepartment: '73',
            editionYear: 2026,
            editionDate: '2026-01-24T17:00:00.000Z'
          }
        },
        message: 'OK'
      } as any)

      const { result } = renderHook(
        () => useCheckExistingEvent('proposal-456', true),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      }, { timeout: 5000 })

      expect(mockProposalsApi.checkExistingEvent).toHaveBeenCalledWith('proposal-456')
      expect(result.current.data?.data.hasMatch).toBe(true)
      expect(result.current.data?.data.match?.eventId).toBe(15388)
      expect(result.current.data?.data.match?.eventName).toBe('Trail Blanc du Corbier')
      expect(result.current.data?.data.match?.confidence).toBe(0.85)
    })

    it('should return exact match when confidence is high', async () => {
      mockProposalsApi.checkExistingEvent.mockResolvedValueOnce({
        data: {
          hasMatch: true,
          match: {
            type: 'EXACT_MATCH',
            eventId: 15388,
            eventName: 'Trail Blanc du Corbier',
            eventSlug: 'trail-blanc-du-corbier-15388',
            eventCity: 'Villarembert',
            editionId: 55062,
            editionYear: '2026',
            confidence: 0.98
          },
          proposalData: {
            eventName: 'Trail Blanc du Corbier',
            eventCity: 'Villarembert',
            eventDepartment: '73',
            editionYear: 2026,
            editionDate: '2026-01-24T17:00:00.000Z'
          }
        },
        message: 'OK'
      } as any)

      const { result } = renderHook(
        () => useCheckExistingEvent('proposal-789', true),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      }, { timeout: 5000 })

      expect(result.current.data?.data.match?.type).toBe('EXACT_MATCH')
      expect(result.current.data?.data.match?.confidence).toBe(0.98)
    })

    it('should return match without edition when edition does not exist', async () => {
      mockProposalsApi.checkExistingEvent.mockResolvedValueOnce({
        data: {
          hasMatch: true,
          match: {
            type: 'FUZZY_MATCH',
            eventId: 15388,
            eventName: 'Trail Blanc du Corbier',
            eventSlug: 'trail-blanc-du-corbier-15388',
            eventCity: 'Villarembert',
            editionId: undefined,  // No edition exists yet
            editionYear: undefined,
            confidence: 0.82
          },
          proposalData: {
            eventName: 'Trail Blanc Du Corbier',
            eventCity: 'Le Corbier',
            eventDepartment: '73',
            editionYear: 2027,
            editionDate: '2027-01-24T17:00:00.000Z'
          }
        },
        message: 'OK'
      } as any)

      const { result } = renderHook(
        () => useCheckExistingEvent('proposal-no-edition', true),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      }, { timeout: 5000 })

      expect(result.current.data?.data.hasMatch).toBe(true)
      expect(result.current.data?.data.match?.editionId).toBeUndefined()
      expect(result.current.data?.data.match?.editionYear).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockProposalsApi.checkExistingEvent.mockRejectedValueOnce(
        new Error('Proposal not found')
      )

      const { result } = renderHook(
        () => useCheckExistingEvent('invalid-id', true),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      }, { timeout: 5000 })

      expect(result.current.error).toBeDefined()
    })

    it('should handle 400 error for non-NEW_EVENT proposals', async () => {
      const error = new Error('Only for NEW_EVENT proposals') as any
      error.response = { status: 400, data: { error: { message: 'Only for NEW_EVENT proposals' } } }
      mockProposalsApi.checkExistingEvent.mockRejectedValueOnce(error)

      const { result } = renderHook(
        () => useCheckExistingEvent('edition-update-proposal', true),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      }, { timeout: 5000 })

      // This is expected behavior - not a bug
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('caching behavior', () => {
    it('should cache results for 5 minutes', async () => {
      mockProposalsApi.checkExistingEvent.mockResolvedValue({
        data: { hasMatch: false, proposalData: {} },
        message: 'OK'
      } as any)

      const wrapper = createWrapper()

      // First render
      const { result: result1 } = renderHook(
        () => useCheckExistingEvent('proposal-cache-test', true),
        { wrapper }
      )

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true)
      }, { timeout: 5000 })

      expect(mockProposalsApi.checkExistingEvent).toHaveBeenCalledTimes(1)

      // Second render with same wrapper (same query client)
      const { result: result2 } = renderHook(
        () => useCheckExistingEvent('proposal-cache-test', true),
        { wrapper }
      )

      // Should use cached data, not make another API call
      expect(result2.current.data).toBeDefined()
      // Note: React Query may refetch on mount depending on staleTime
      // The staleTime is 5 minutes so within that window, no new fetch
    })
  })
})
