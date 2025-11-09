import { useState, useCallback, useMemo } from 'react'
import { useUpdateProposal, useUnapproveProposal, useUnapproveBlock } from './useApi'
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
  const unapproveBlockMutation = useUnapproveBlock()
  
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
    const block = syncedBlockStatus[blockKey]
    if (!block) return

    try {
      // Annuler l'approbation seulement des propositions APPROVED
      const approvedProposalIds = block.proposalIds.filter(id => {
        const proposal = proposals.find(p => p.id === id)
        return proposal?.status === 'APPROVED'
      })
      
      if (approvedProposalIds.length > 0) {
        // Annuler uniquement le bloc spécifique de chaque proposition
        for (const id of approvedProposalIds) {
          try {
            await unapproveBlockMutation.mutateAsync({ id, block: blockKey })
            console.log(`[useBlockValidation] Bloc "${blockKey}" annulé pour la proposition ${id}`)
          } catch (error: any) {
            // Ignorer l'erreur si le bloc n'est plus approuvé
            if (error?.response?.data?.alreadyUnapproved) {
              console.log(`[useBlockValidation] Bloc "${blockKey}" déjà annulé pour ${id}, ignoré`)
              continue
            }
            // Propager les autres erreurs
            throw error
          }
        }
      }

      // Retirer le bloc du statut validé
      setBlockStatus(prev => {
        const { [blockKey]: _, ...rest } = prev
        return rest
      })
    } catch (error) {
      console.error(`Error unvalidating block ${blockKey}:`, error)
      throw error
    }
  }, [syncedBlockStatus, proposals, unapproveBlockMutation])

  // Valider tous les blocs
  const validateAllBlocks = useCallback(async (blocks: Record<string, string[]>) => {
    console.log('[validateAllBlocks] Démarrage validation de tous les blocs:', {
      blocks,
      blockKeys: Object.keys(blocks)
    })
    
    for (const [blockKey, proposalIds] of Object.entries(blocks)) {
      console.log(`[validateAllBlocks] Validation du bloc "${blockKey}" avec ${proposalIds.length} proposition(s)...`)
      try {
        await validateBlock(blockKey, proposalIds)
        console.log(`[validateAllBlocks] ✅ Bloc "${blockKey}" validé`)
      } catch (error) {
        console.error(`[validateAllBlocks] ❌ Erreur validation bloc "${blockKey}":`, error)
        // Continuer avec les autres blocs même en cas d'erreur
      }
    }
    
    console.log('[validateAllBlocks] ✅ Validation de tous les blocs terminée')
  }, [validateBlock])

  // Annuler la validation de tous les blocs
  const unvalidateAllBlocks = useCallback(async () => {
    const validatedBlocks = Object.keys(syncedBlockStatus).filter(
      blockKey => syncedBlockStatus[blockKey].isValidated
    )
    
    for (const blockKey of validatedBlocks) {
      await unvalidateBlock(blockKey)
    }
  }, [syncedBlockStatus, unvalidateBlock])

  // Vérifier si un bloc est validé (utilise syncedBlockStatus au lieu de blockStatus)
  const isBlockValidated = useCallback((blockKey: string) => {
    return syncedBlockStatus[blockKey]?.isValidated || false
  }, [syncedBlockStatus])

  // Vérifier si au moins un bloc est validé
  const hasValidatedBlocks = useCallback(() => {
    return Object.values(syncedBlockStatus).some(block => block.isValidated)
  }, [syncedBlockStatus])

  return {
    blockStatus: syncedBlockStatus,
    validateBlock,
    unvalidateBlock,
    validateAllBlocks,
    unvalidateAllBlocks,
    isBlockValidated,
    hasValidatedBlocks,
    isPending: updateProposalMutation.isPending || unapproveProposalMutation.isPending || unapproveBlockMutation.isPending
  }
}
