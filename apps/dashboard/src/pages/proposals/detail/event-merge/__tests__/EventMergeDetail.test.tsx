/**
 * Tests for EventMergeDetail component
 *
 * Validates:
 * - Correct display of merge data (keepEvent vs duplicateEvent)
 * - Status-based UI changes (PENDING shows buttons, APPROVED/REJECTED shows alerts)
 * - Action button functionality (approve, reject, archive)
 * - New name display when provided
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'
import { BrowserRouter } from 'react-router-dom'
import EventMergeDetail from '../EventMergeDetail'
import { useUpdateProposal } from '@/hooks/useApi'
import type { Proposal } from '@/types'

// ─────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────

jest.mock('@/hooks/useApi', () => ({
  useUpdateProposal: jest.fn(),
  useUpdates: jest.fn().mockReturnValue({ data: { data: [] } }),
  useEventDetails: jest.fn().mockReturnValue({ data: null, isLoading: false }),
}))

const mockUseUpdateProposal = useUpdateProposal as jest.Mock

// ─────────────────────────────────────────────────────────────
// TEST DATA
// ─────────────────────────────────────────────────────────────

const createMockProposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: 'proposal-123',
  type: 'EVENT_MERGE',
  status: 'PENDING',
  agentId: 'agent-1',
  eventId: '100',
  changes: {
    merge: {
      keepEventId: 100,
      keepEventName: 'Marathon de Paris',
      keepEventCity: 'Paris',
      keepEventEditionsCount: 5,
      duplicateEventId: 200,
      duplicateEventName: 'Marathon Paris',
      duplicateEventCity: 'Paris',
      duplicateEventEditionsCount: 1,
      newEventName: null,
    }
  },
  justification: [
    { type: 'user_action', content: 'Fusion manuelle', message: 'Fusion manuelle' }
  ],
  confidence: 1.0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  agent: { name: 'Manual Actions', type: 'EXTRACTOR' },
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
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider maxSnack={3}>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  )
}

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────

describe('EventMergeDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseUpdateProposal.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    })
  })

  describe('Display', () => {
    it('should render merge proposal header', () => {
      const proposal = createMockProposal()

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Proposition de fusion d'événements/i)).toBeInTheDocument()
      expect(screen.getByText(/proposal-123/i)).toBeInTheDocument()
    })

    it('should display keepEvent information', () => {
      const proposal = createMockProposal()

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText('Événement conservé')).toBeInTheDocument()
      expect(screen.getByText('Marathon de Paris')).toBeInTheDocument()
      expect(screen.getByText(/Éditions \(5/)).toBeInTheDocument()
    })

    it('should display duplicateEvent information', () => {
      const proposal = createMockProposal()

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Événement doublon \(sera supprimé\)/i)).toBeInTheDocument()
      expect(screen.getByText('Marathon Paris')).toBeInTheDocument()
      expect(screen.getByText(/Éditions \(1\)/)).toBeInTheDocument()
    })

    it('should display merge summary alert', () => {
      const proposal = createMockProposal()

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Marathon Paris.*sera fusionné dans.*Marathon de Paris/i)).toBeInTheDocument()
    })

    it('should display new name when provided', () => {
      const proposal = createMockProposal({
        changes: {
          merge: {
            keepEventId: 100,
            keepEventName: 'Old Name',
            keepEventCity: 'Paris',
            keepEventEditionsCount: 3,
            duplicateEventId: 200,
            duplicateEventName: 'Duplicate',
            duplicateEventCity: 'Paris',
            duplicateEventEditionsCount: 1,
            newEventName: 'Nouveau Nom Unifié',
          }
        }
      })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText('Nouveau Nom Unifié')).toBeInTheDocument()
      expect(screen.getByText(/Ancien nom : Old Name/i)).toBeInTheDocument()
    })

    it('should display justification when present', () => {
      const proposal = createMockProposal({
        justification: [
          { type: 'user_action', content: 'Test reason', message: 'Doublons détectés lors du nettoyage' }
        ]
      })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText('Justification')).toBeInTheDocument()
      expect(screen.getByText('Doublons détectés lors du nettoyage')).toBeInTheDocument()
    })
  })

  describe('Status-based UI', () => {
    it('should show action buttons when status is PENDING', () => {
      const proposal = createMockProposal({ status: 'PENDING' })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByRole('button', { name: /Approuver/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Rejeter/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Archiver/i })).toBeInTheDocument()
    })

    it('should NOT show action buttons when status is APPROVED', () => {
      const proposal = createMockProposal({ status: 'APPROVED' })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.queryByRole('button', { name: /Approuver/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Rejeter/i })).not.toBeInTheDocument()
    })

    it('should show success alert when status is APPROVED', () => {
      const proposal = createMockProposal({ status: 'APPROVED' })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Cette proposition a été approuvée/i)).toBeInTheDocument()
      expect(screen.getByText(/Mises à jour/i)).toBeInTheDocument()
    })

    it('should show error alert when status is REJECTED', () => {
      const proposal = createMockProposal({ status: 'REJECTED' })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Cette proposition a été rejetée/i)).toBeInTheDocument()
    })

    it('should show info alert when status is ARCHIVED', () => {
      const proposal = createMockProposal({ status: 'ARCHIVED' })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Cette proposition a été archivée/i)).toBeInTheDocument()
    })

    it('should display correct status chip', () => {
      const proposal = createMockProposal({ status: 'PENDING' })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByText('En attente')).toBeInTheDocument()
    })
  })

  describe('Action buttons', () => {
    it('should call updateMutation with APPROVED status when clicking Approuver', () => {
      const mockMutate = jest.fn()
      mockUseUpdateProposal.mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      })

      const proposal = createMockProposal()

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole('button', { name: /Approuver/i }))

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'proposal-123',
        status: 'APPROVED',
      })
    })

    it('should call updateMutation with REJECTED status when clicking Rejeter', () => {
      const mockMutate = jest.fn()
      mockUseUpdateProposal.mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      })

      const proposal = createMockProposal()

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole('button', { name: /Rejeter/i }))

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'proposal-123',
        status: 'REJECTED',
      })
    })

    it('should call updateMutation with ARCHIVED status when clicking Archiver', () => {
      const mockMutate = jest.fn()
      mockUseUpdateProposal.mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      })

      const proposal = createMockProposal()

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole('button', { name: /Archiver/i }))

      expect(mockMutate).toHaveBeenCalledWith({
        id: 'proposal-123',
        status: 'ARCHIVED',
      })
    })

    it('should disable buttons when mutation is pending', () => {
      mockUseUpdateProposal.mockReturnValue({
        mutate: jest.fn(),
        isPending: true,
      })

      const proposal = createMockProposal()

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      expect(screen.getByRole('button', { name: /Approuver/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Rejeter/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Archiver/i })).toBeDisabled()
    })
  })

  describe('Edge cases', () => {
    it('should handle missing merge data gracefully', () => {
      const proposal = createMockProposal({
        changes: {} // No merge data
      })

      // Should not throw
      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      // Should still render header
      expect(screen.getByText(/Proposition de fusion d'événements/i)).toBeInTheDocument()
    })

    it('should handle zero editions count', () => {
      const proposal = createMockProposal({
        changes: {
          merge: {
            keepEventId: 100,
            keepEventName: 'Event A',
            keepEventCity: 'City',
            keepEventEditionsCount: 0,
            duplicateEventId: 200,
            duplicateEventName: 'Event B',
            duplicateEventCity: 'City',
            duplicateEventEditionsCount: 0,
            newEventName: null,
          }
        }
      })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      const chips = screen.getAllByText(/Éditions \(0\)/)
      expect(chips).toHaveLength(2)
    })

    it('should handle empty justification array', () => {
      const proposal = createMockProposal({
        justification: []
      })

      render(<EventMergeDetail proposal={proposal} />, { wrapper: createWrapper() })

      // Should not show justification section
      expect(screen.queryByText('Justification')).not.toBeInTheDocument()
    })
  })
})
