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
  // ⚠️ MODE GROUPÉ : Un seul appel API avec tous les IDs
  const validateBlock = useCallback(async (blockKey: string, proposalIds: string[]) => {
    try {
      // Vérifier que les propositions existent
      if (proposalIds.length === 0) {
        console.warn('Aucune proposition à valider')
        return
      }
      
      // ✅ Construire le payload consolidé avec UNIQUEMENT les modifications utilisateur
      // Le backend mergera automatiquement avec proposal.changes
      const changes: Record<string, any> = { ...userModifiedChanges }
      
      // ✅ FIX 2025-11-17 : Construire racesToAddFiltered POUR TOUS LES BLOCS
      // Les suppressions de nouvelles courses doivent être incluses même si on valide
      // le bloc "edition" ou "event" au lieu du bloc "races"
      if (userModifiedRaceChanges && Object.keys(userModifiedRaceChanges).length > 0) {
        changes.raceEdits = userModifiedRaceChanges
        
        // Construire racesToAddFiltered depuis les clés "new-{index}" marquées _deleted
        const racesToAddFiltered: number[] = []
        
        Object.entries(userModifiedRaceChanges).forEach(([key, mods]: [string, any]) => {
          // Chercher les clés "new-{index}" marquées _deleted
          if (key.startsWith('new-') && mods._deleted === true) {
            const index = parseInt(key.replace('new-', ''))
            if (!isNaN(index)) {
              racesToAddFiltered.push(index)
            }
          }
        })
        
        if (racesToAddFiltered.length > 0) {
          changes.racesToAddFiltered = racesToAddFiltered
          console.log(`✅ [useBlockValidation] Bloc "${blockKey}" - Courses à filtrer (indices):`, racesToAddFiltered)
        }
      }
      
      console.log(`📦 [useBlockValidation] MODE GROUPÉ - Bloc "${blockKey}":`, {
        blockKey,
        proposalIds,
        proposalCount: proposalIds.length,
        userModifiedChanges,
        userModifiedRaceChanges: blockKey === 'races' ? userModifiedRaceChanges : undefined,
        changes
      })
      
      // ✅ UN SEUL APPEL API pour tout le groupe (non-bloquant pour UX réactive)
      updateProposalMutation.mutate({
        proposalIds,    // 📦 Passer tous les IDs
        block: blockKey,
        changes         // 📦 Payload consolidé
      }, {
        onSuccess: () => {
          // Marquer le bloc comme validé après succès API
          setBlockStatus(prev => ({
            ...prev,
            [blockKey]: {
              isValidated: true,
              proposalIds
            }
          }))
          console.log(`✅ [useBlockValidation] Bloc "${blockKey}" validé pour ${proposalIds.length} propositions`)
        },
        onError: (error) => {
          console.error(`❌ [useBlockValidation] Erreur validation bloc "${blockKey}":`, error)
        }
      })
    } catch (error) {
      console.error(`Error validating block ${blockKey}:`, error)
      throw error
    }
  }, [updateProposalMutation, userModifiedChanges, userModifiedRaceChanges])

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
        // Annuler uniquement le bloc spécifique de chaque proposition (en parallèle, non-bloquant)
        const promises = approvedProposalIds.map(id => 
          new Promise<void>((resolve, reject) => {
            unapproveBlockMutation.mutate({ id, block: blockKey }, {
              onSuccess: () => resolve(),
              onError: (error: any) => {
                // Ignorer l'erreur si le bloc n'est plus approuvé
                if (error?.response?.data?.alreadyUnapproved) {
                  resolve()
                } else {
                  reject(error)
                }
              }
            })
          })
        )
        await Promise.all(promises)
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
