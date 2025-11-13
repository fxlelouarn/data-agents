import { useState, useCallback } from 'react'
import { useUpdateProposal, useUnapproveProposal } from './useApi'

/**
 * Hook simplifié pour la validation d'un bloc individuel
 * Utilisé dans les composants qui gèrent un seul bloc
 */
export const useProposalBlockValidation = (
  proposalId: string | undefined,
  blockKey: string
) => {
  const [isValidated, setIsValidated] = useState(false)
  const updateProposalMutation = useUpdateProposal()
  const unapproveProposalMutation = useUnapproveProposal()

  // Valider le bloc (approuver la proposition)
  const validate = useCallback(async () => {
    if (!proposalId) return

    try {
      await updateProposalMutation.mutateAsync({
        id: proposalId,
        status: 'APPROVED',
        reviewedBy: 'Utilisateur'
      })

      setIsValidated(true)
    } catch (error) {
      console.error(`Error validating block ${blockKey}:`, error)
      throw error
    }
  }, [proposalId, blockKey, updateProposalMutation])

  // Annuler la validation
  const cancel = useCallback(async () => {
    if (!proposalId) return

    try {
      await unapproveProposalMutation.mutateAsync(proposalId)
      setIsValidated(false)
    } catch (error) {
      console.error(`Error canceling validation for block ${blockKey}:`, error)
      throw error
    }
  }, [proposalId, blockKey, unapproveProposalMutation])

  return {
    isValidated,
    validate,
    cancel,
    isPending: updateProposalMutation.isPending || unapproveProposalMutation.isPending
  }
}
