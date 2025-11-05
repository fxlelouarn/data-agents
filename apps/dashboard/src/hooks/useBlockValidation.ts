import { useState, useCallback, useMemo } from 'react'
import { useUpdateProposal, useUnapproveProposal } from './useApi'
import { Proposal } from '@/types'

export interface BlockStatus {
  [blockKey: string]: {
    isValidated: boolean
    proposalIds: string[]
  }
}

interface UseBlockValidationProps {
  proposals?: Proposal[]
  blockProposals?: Record<string, string[]>
}

export const useBlockValidation = (props?: UseBlockValidationProps) => {
  const { proposals = [], blockProposals = {} } = props || {}
  const [blockStatus, setBlockStatus] = useState<BlockStatus>({})
  const updateProposalMutation = useUpdateProposal()
  const unapproveProposalMutation = useUnapproveProposal()
  
  // Synchronize blockStatus with actual approvedBlocks from backend
  const syncedBlockStatus = useMemo(() => {
    const status: BlockStatus = {}
    
    // For each block, check if ALL its proposals have this block approved
    for (const [blockKey, proposalIds] of Object.entries(blockProposals)) {
      const allProposalsApproved = proposalIds.every(proposalId => {
        const proposal = proposals.find(p => p.id === proposalId)
        if (!proposal) return false
        
        const approvedBlocks = (proposal.approvedBlocks as Record<string, boolean>) || {}
        return approvedBlocks[blockKey] === true
      })
      
      status[blockKey] = {
        isValidated: allProposalsApproved && proposalIds.length > 0,
        proposalIds
      }
      
      console.log(`[useBlockValidation] Block "${blockKey}":`, {
        isValidated: allProposalsApproved && proposalIds.length > 0,
        proposalIds,
        approvedBlocksPerProposal: proposalIds.map(id => {
          const p = proposals.find(pr => pr.id === id)
          return { id, approvedBlocks: p?.approvedBlocks }
        })
      })
    }
    
    return status
  }, [proposals, blockProposals])

  // Valider un bloc (approuver toutes ses propositions)
  const validateBlock = useCallback(async (blockKey: string, proposalIds: string[]) => {
    try {
      // Approuver toutes les propositions du bloc avec le paramètre block
      await Promise.all(
        proposalIds.map(id => 
          updateProposalMutation.mutateAsync({
            id,
            status: 'APPROVED',
            reviewedBy: 'Utilisateur',
            block: blockKey // Spécifier le bloc pour approbation partielle
          })
        )
      )

      // Marquer le bloc comme validé
      setBlockStatus(prev => ({
        ...prev,
        [blockKey]: {
          isValidated: true,
          proposalIds
        }
      }))
    } catch (error) {
      console.error(`Error validating block ${blockKey}:`, error)
      throw error
    }
  }, [updateProposalMutation])

  // Annuler la validation d'un bloc
  const unvalidateBlock = useCallback(async (blockKey: string) => {
    const block = blockStatus[blockKey]
    if (!block) return

    try {
      // Annuler l'approbation de toutes les propositions
      await Promise.all(
        block.proposalIds.map(id => unapproveProposalMutation.mutateAsync(id))
      )

      // Retirer le bloc du statut validé
      setBlockStatus(prev => {
        const { [blockKey]: _, ...rest } = prev
        return rest
      })
    } catch (error) {
      console.error(`Error unvalidating block ${blockKey}:`, error)
      throw error
    }
  }, [blockStatus, unapproveProposalMutation])

  // Valider tous les blocs
  const validateAllBlocks = useCallback(async (blocks: Record<string, string[]>) => {
    for (const [blockKey, proposalIds] of Object.entries(blocks)) {
      await validateBlock(blockKey, proposalIds)
    }
  }, [validateBlock])

  // Vérifier si un bloc est validé (utilise syncedBlockStatus au lieu de blockStatus)
  const isBlockValidated = useCallback((blockKey: string) => {
    return syncedBlockStatus[blockKey]?.isValidated || false
  }, [syncedBlockStatus])

  return {
    blockStatus: syncedBlockStatus,
    validateBlock,
    unvalidateBlock,
    validateAllBlocks,
    isBlockValidated,
    isPending: updateProposalMutation.isPending || unapproveProposalMutation.isPending
  }
}
