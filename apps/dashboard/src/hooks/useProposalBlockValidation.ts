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

    return new Promise<void>((resolve, reject) => {
      updateProposalMutation.mutate({
        id: proposalId,
        status: 'APPROVED'
      }, {
        onSuccess: () => {
          setIsValidated(true)
          resolve()
        },
        onError: (error) => {
          console.error(`Error validating block ${blockKey}:`, error)
          reject(error)
        }
      })
    })
  }, [proposalId, blockKey, updateProposalMutation])

  // Annuler la validation
  const cancel = useCallback(async () => {
    if (!proposalId) return

    return new Promise<void>((resolve, reject) => {
      unapproveProposalMutation.mutate(proposalId, {
        onSuccess: () => {
          setIsValidated(false)
          resolve()
        },
        onError: (error) => {
          console.error(`Error canceling validation for block ${blockKey}:`, error)
          reject(error)
        }
      })
    })
  }, [proposalId, blockKey, unapproveProposalMutation])

  return {
    isValidated,
    validate,
    cancel,
    isPending: updateProposalMutation.isPending || unapproveProposalMutation.isPending
  }
}
