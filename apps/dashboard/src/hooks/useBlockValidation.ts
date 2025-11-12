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
  // Nouvelles props pour les valeurs sélectionnées et modifiées
  selectedChanges?: Record<string, any>
  userModifiedChanges?: Record<string, any>
  userModifiedRaceChanges?: Record<string, Record<string, any>> // ✅ Les raceId sont des strings
}

export const useBlockValidation = (props?: UseBlockValidationProps) => {
  const { 
    proposals = [], 
    blockProposals = {},
    selectedChanges = {},
    userModifiedChanges = {},
    userModifiedRaceChanges = {}
  } = props || {}
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
    }
    
    return status
  }, [proposals, blockProposals])

  // Valider un bloc (approuver toutes ses propositions)
  const validateBlock = useCallback(async (blockKey: string, proposalIds: string[]) => {
    try {
      // Approuver toutes les propositions du bloc
      await Promise.all(
        proposalIds.map(id => {
          const proposal = proposals.find(p => p.id === id)
          if (!proposal) {
            console.warn(`Proposition ${id} introuvable`)
            return Promise.resolve()
          }
          
          // ✅ Construire le payload avec UNIQUEMENT les modifications utilisateur
          // Le backend mergera automatiquement avec proposal.changes
          const payload: Record<string, any> = { ...userModifiedChanges }
          
          // Ajouter les modifications de courses si bloc "races"
          if (blockKey === 'races' && userModifiedRaceChanges && Object.keys(userModifiedRaceChanges).length > 0) {
            payload.raceEdits = userModifiedRaceChanges
          }
          
          console.log(`✅ [useBlockValidation] Bloc "${blockKey}" - Envoi modifications uniquement:`, {
            blockKey,
            proposalId: id,
            userModifiedChanges,
            userModifiedRaceChanges: blockKey === 'races' ? userModifiedRaceChanges : undefined,
            payload
          })
          
          return updateProposalMutation.mutateAsync({
            id,
            status: 'APPROVED',
            reviewedBy: 'Utilisateur',
            block: blockKey,
            userModifiedChanges: payload // ✅ Modifications utilisateur seulement
          })
        })
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
          } catch (error: any) {
            // Ignorer l'erreur si le bloc n'est plus approuvé
            if (error?.response?.data?.alreadyUnapproved) {
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
    for (const [blockKey, proposalIds] of Object.entries(blocks)) {
      try {
        await validateBlock(blockKey, proposalIds)
      } catch (error) {
        console.error(`Erreur validation bloc "${blockKey}":`, error)
        // Continuer avec les autres blocs même en cas d'erreur
      }
    }
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
