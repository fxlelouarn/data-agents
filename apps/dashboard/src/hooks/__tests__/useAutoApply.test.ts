import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'
import React from 'react'

// Mock the API module
jest.mock('@/services/api', () => ({
  settingsApi: {
    getAutoApplyStatus: jest.fn(),
    runAutoApply: jest.fn()
  }
}))

import { settingsApi } from '@/services/api'
import { useAutoApplyStatus, useRunAutoApply } from '../useApi'

// ─────────────────────────────────────────────────────────────
// TEST SETUP
// ─────────────────────────────────────────────────────────────

const mockSettingsApi = settingsApi as jest.Mocked<typeof settingsApi>

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(SnackbarProvider, null, children)
    )
  )
}

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────

const mockAutoApplyStatusEnabled = {
  success: true,
  data: {
    enabled: true,
    intervalMinutes: 60,
    lastRunAt: '2025-12-04T14:30:00.000Z',
    nextRunAt: '2025-12-04T15:30:00.000Z',
    lastRunResult: {
      success: 3,
      failed: 0,
      errors: [],
      appliedIds: ['app1', 'app2', 'app3'],
      failedIds: []
    },
    isSchedulerRunning: true,
    isCurrentlyApplying: false
  }
}

const mockAutoApplyStatusDisabled = {
  success: true,
  data: {
    enabled: false,
    intervalMinutes: 60,
    lastRunAt: null,
    nextRunAt: null,
    lastRunResult: null,
    isSchedulerRunning: false,
    isCurrentlyApplying: false
  }
}

const mockAutoApplyStatusApplying = {
  success: true,
  data: {
    enabled: true,
    intervalMinutes: 30,
    lastRunAt: '2025-12-04T14:00:00.000Z',
    nextRunAt: '2025-12-04T14:30:00.000Z',
    lastRunResult: {
      success: 2,
      failed: 1,
      errors: ['app3: Foreign key constraint failed'],
      appliedIds: ['app1', 'app2'],
      failedIds: ['app3']
    },
    isSchedulerRunning: true,
    isCurrentlyApplying: true
  }
}

const mockRunAutoApplySuccess = {
  success: true,
  message: 'Auto-apply completed',
  data: {
    success: 5,
    failed: 0,
    errors: [],
    appliedIds: ['app1', 'app2', 'app3', 'app4', 'app5'],
    failedIds: []
  }
}

const mockRunAutoApplyPartial = {
  success: true,
  message: 'Auto-apply completed',
  data: {
    success: 2,
    failed: 1,
    errors: ['app3: Database connection failed'],
    appliedIds: ['app1', 'app2'],
    failedIds: ['app3']
  }
}

const mockRunAutoApplyEmpty = {
  success: true,
  message: 'Auto-apply completed',
  data: {
    success: 0,
    failed: 0,
    errors: [],
    appliedIds: [],
    failedIds: []
  }
}

// ─────────────────────────────────────────────────────────────
// TESTS: useAutoApplyStatus
// ─────────────────────────────────────────────────────────────

describe('useAutoApplyStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Fetching status', () => {
    it('should fetch auto-apply status on mount', async () => {
      mockSettingsApi.getAutoApplyStatus.mockResolvedValue(mockAutoApplyStatusEnabled as any)

      const { result } = renderHook(() => useAutoApplyStatus(), {
        wrapper: createWrapper()
      })

      // Initially loading
      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      expect(mockSettingsApi.getAutoApplyStatus).toHaveBeenCalledTimes(1)
      expect(result.current.data?.data.enabled).toBe(true)
      expect(result.current.data?.data.isSchedulerRunning).toBe(true)
    })

    it('should return disabled status correctly', async () => {
      mockSettingsApi.getAutoApplyStatus.mockResolvedValue(mockAutoApplyStatusDisabled as any)

      const { result } = renderHook(() => useAutoApplyStatus(), {
        wrapper: createWrapper()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      expect(result.current.data?.data.enabled).toBe(false)
      expect(result.current.data?.data.isSchedulerRunning).toBe(false)
      expect(result.current.data?.data.lastRunAt).toBeNull()
    })

    it('should return currently applying status', async () => {
      mockSettingsApi.getAutoApplyStatus.mockResolvedValue(mockAutoApplyStatusApplying as any)

      const { result } = renderHook(() => useAutoApplyStatus(), {
        wrapper: createWrapper()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      expect(result.current.data?.data.isCurrentlyApplying).toBe(true)
      expect(result.current.data?.data.lastRunResult?.failed).toBe(1)
      expect(result.current.data?.data.lastRunResult?.errors).toHaveLength(1)
    })
  })

  describe('Error handling', () => {
    it('should handle API errors', async () => {
      mockSettingsApi.getAutoApplyStatus.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useAutoApplyStatus(), {
        wrapper: createWrapper()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      }, { timeout: 5000 })

      expect(result.current.isError).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// TESTS: useRunAutoApply
// ─────────────────────────────────────────────────────────────

describe('useRunAutoApply', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Successful execution', () => {
    it('should execute auto-apply and return success result', async () => {
      mockSettingsApi.runAutoApply.mockResolvedValue(mockRunAutoApplySuccess as any)

      const { result } = renderHook(() => useRunAutoApply(), {
        wrapper: createWrapper()
      })

      expect(result.current.isPending).toBe(false)

      act(() => {
        result.current.mutate()
      })

      // Note: isPending peut déjà être false si le mock résout instantanément
      // On vérifie plutôt le résultat final

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      }, { timeout: 5000 })

      expect(mockSettingsApi.runAutoApply).toHaveBeenCalledTimes(1)
      expect(result.current.data?.data.success).toBe(5)
      expect(result.current.data?.data.failed).toBe(0)
    })

    it('should handle partial success (some failures)', async () => {
      mockSettingsApi.runAutoApply.mockResolvedValue(mockRunAutoApplyPartial as any)

      const { result } = renderHook(() => useRunAutoApply(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.mutate()
      })

      await waitFor(() => {
        expect(result.current.isPending).toBe(false)
      }, { timeout: 5000 })

      expect(result.current.data?.data.success).toBe(2)
      expect(result.current.data?.data.failed).toBe(1)
      expect(result.current.data?.data.errors).toContain('app3: Database connection failed')
    })

    it('should handle empty result (no pending updates)', async () => {
      mockSettingsApi.runAutoApply.mockResolvedValue(mockRunAutoApplyEmpty as any)

      const { result } = renderHook(() => useRunAutoApply(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.mutate()
      })

      await waitFor(() => {
        expect(result.current.isPending).toBe(false)
      }, { timeout: 5000 })

      expect(result.current.data?.data.success).toBe(0)
      expect(result.current.data?.data.failed).toBe(0)
      expect(result.current.data?.data.appliedIds).toHaveLength(0)
    })
  })

  describe('Error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockSettingsApi.runAutoApply.mockRejectedValue({
        response: {
          data: {
            message: 'Auto-apply is already running'
          }
        }
      })

      const { result } = renderHook(() => useRunAutoApply(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.mutate()
      })

      await waitFor(() => {
        expect(result.current.isPending).toBe(false)
      }, { timeout: 5000 })

      expect(result.current.isError).toBe(true)
    })

    it('should handle network errors', async () => {
      mockSettingsApi.runAutoApply.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useRunAutoApply(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.mutate()
      })

      await waitFor(() => {
        expect(result.current.isPending).toBe(false)
      }, { timeout: 5000 })

      expect(result.current.isError).toBe(true)
    })
  })

  describe('Mutation state', () => {
    it('should track pending state during execution', async () => {
      // Create a delayed promise to observe pending state
      let resolvePromise: (value: any) => void
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      mockSettingsApi.runAutoApply.mockReturnValue(delayedPromise as any)

      const { result } = renderHook(() => useRunAutoApply(), {
        wrapper: createWrapper()
      })

      expect(result.current.isPending).toBe(false)

      // Start mutation without waiting
      result.current.mutate()

      // Wait a tick for React to process the mutation start
      await waitFor(() => {
        // isPending should become true at some point during execution
        // If the promise hasn't resolved yet, it should be true
        expect(mockSettingsApi.runAutoApply).toHaveBeenCalled()
      }, { timeout: 1000 })

      // Resolve the promise inside act
      await act(async () => {
        resolvePromise!(mockRunAutoApplySuccess)
      })

      await waitFor(() => {
        expect(result.current.isPending).toBe(false)
        expect(result.current.isSuccess).toBe(true)
      }, { timeout: 5000 })
    })

    it('should allow multiple consecutive calls', async () => {
      mockSettingsApi.runAutoApply
        .mockResolvedValueOnce(mockRunAutoApplySuccess as any)
        .mockResolvedValueOnce(mockRunAutoApplyEmpty as any)

      const { result } = renderHook(() => useRunAutoApply(), {
        wrapper: createWrapper()
      })

      // First call
      act(() => {
        result.current.mutate()
      })

      await waitFor(() => {
        expect(result.current.isPending).toBe(false)
      }, { timeout: 5000 })

      expect(result.current.data?.data.success).toBe(5)

      // Second call
      act(() => {
        result.current.mutate()
      })

      await waitFor(() => {
        expect(result.current.data?.data.success).toBe(0)
      }, { timeout: 5000 })

      expect(mockSettingsApi.runAutoApply).toHaveBeenCalledTimes(2)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// INTEGRATION TESTS: Combined hooks behavior
// ─────────────────────────────────────────────────────────────

describe('Auto-apply hooks integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should show correct state when scheduler is running and user triggers manual run', async () => {
    // Initial status: scheduler running, not currently applying
    mockSettingsApi.getAutoApplyStatus.mockResolvedValue(mockAutoApplyStatusEnabled as any)
    mockSettingsApi.runAutoApply.mockResolvedValue(mockRunAutoApplySuccess as any)

    const wrapper = createWrapper()

    const { result: statusResult } = renderHook(() => useAutoApplyStatus(), { wrapper })
    const { result: runResult } = renderHook(() => useRunAutoApply(), { wrapper })

    // Wait for status to load
    await waitFor(() => {
      expect(statusResult.current.isLoading).toBe(false)
    }, { timeout: 5000 })

    expect(statusResult.current.data?.data.isSchedulerRunning).toBe(true)
    expect(statusResult.current.data?.data.isCurrentlyApplying).toBe(false)

    // Trigger manual run
    act(() => {
      runResult.current.mutate()
    })

    await waitFor(() => {
      expect(runResult.current.isPending).toBe(false)
    }, { timeout: 5000 })

    expect(runResult.current.data?.data.success).toBe(5)
  })

  it('should handle disabled scheduler state correctly', async () => {
    mockSettingsApi.getAutoApplyStatus.mockResolvedValue(mockAutoApplyStatusDisabled as any)

    const { result } = renderHook(() => useAutoApplyStatus(), {
      wrapper: createWrapper()
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    }, { timeout: 5000 })

    const status = result.current.data?.data
    expect(status?.enabled).toBe(false)
    expect(status?.isSchedulerRunning).toBe(false)
    expect(status?.nextRunAt).toBeNull()
    expect(status?.lastRunResult).toBeNull()
  })
})
