import { useState, useCallback, useMemo } from 'react'
import { useUpdateProposal, useUnapproveProposal, useUnapproveBlock } from './useApi'
import { Proposal } from '@/types'
import { getAllDependencies, getAllDependents, BlockType } from '@data-agents/types'
import { useSnackbar } from 'notistack'

export interface BlockStatus {
  [blockKey: string]: {
    isValidated: boolean
    proposalIds: string[]
  }
}

interface UseBlockValidationProps {
  proposals?: Proposal[]
  blockProposals?: Record<string, string[]>
  // ✅ Two-Panes: proposition prioritaire (seule utilisée pour les changes, pas de merge)
  primaryProposalId?: string
  // Nouvelles props pour les valeurs sélectionnées et modifiées
  selectedChanges?: Record<string, any>
  userModifiedChanges?: Record<string, any>
  userModifiedRaceChanges?: Record<string, Record<string, any>> // ✅ Les raceId sont des strings
  // Edition protection: if true, forceProtectedEdition flag will be added to validation payload
  isEditionProtected?: boolean
}

export const useBlockValidation = (props?: UseBlockValidationProps) => {
  const {
    proposals = [],
    blockProposals = {},
    primaryProposalId,  // ✅ Two-Panes: proposition prioritaire
    selectedChanges = {},
    userModifiedChanges = {},
    userModifiedRaceChanges = {},
    isEditionProtected = false
  } = props || {}
  const { enqueueSnackbar } = useSnackbar()
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
  // ✅ proposalIds optionnel - utilise blockProposals[blockKey] par défaut
  const validateBlock = useCallback(async (blockKey: string, proposalIdsArg?: string[]) => {
    try {
      // Utiliser les proposalIds fournis ou récupérer depuis blockProposals
      const proposalIds = proposalIdsArg || blockProposals[blockKey] || []
      
      // Vérifier que les propositions existent
      if (proposalIds.length === 0) {
        console.warn('Aucune proposition à valider')
        return
      }

      // ✅ Construire le payload consolidé avec UNIQUEMENT les modifications utilisateur
      // Le backend mergera automatiquement avec proposal.changes
      const changes: Record<string, any> = { ...userModifiedChanges }

      // If edition is protected, mark that user explicitly approved
      if (isEditionProtected) {
        changes.forceProtectedEdition = true
      }

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
        userModifiedRaceChanges,
        changes
      })

      // Log détaillé des modifications de courses
      if (userModifiedRaceChanges && Object.keys(userModifiedRaceChanges).length > 0) {
        console.log(`🏁 [useBlockValidation] Modifications courses:`, {
          keysCount: Object.keys(userModifiedRaceChanges).length,
          keys: Object.keys(userModifiedRaceChanges),
          details: Object.entries(userModifiedRaceChanges).map(([key, value]) => ({
            key,
            value,
            isDeleted: (value as any)._deleted === true
          }))
        })
      }

      // ✅ Utiliser mutateAsync pour permettre await dans la cascade
      // ✅ Two-Panes: Passer primaryProposalId pour éviter le merge de toutes les propositions
      await updateProposalMutation.mutateAsync({
        proposalIds,    // 📦 Passer tous les IDs
        primaryProposalId,  // ✅ Two-Panes: proposition prioritaire (pas de merge)
        block: blockKey,
        changes         // 📦 Payload consolidé
      })

      // ✅ Attendre que React Query refetch les propositions mises à jour
      // Sinon isBlockValidated() retourne false immédiatement après
      await new Promise(resolve => setTimeout(resolve, 100))

      console.log(`✅ [useBlockValidation] Bloc "${blockKey}" validé pour ${proposalIds.length} propositions`)
    } catch (error) {
      console.error(`Error validating block ${blockKey}:`, error)
      throw error
    }
  }, [updateProposalMutation, blockProposals, primaryProposalId, userModifiedChanges, userModifiedRaceChanges, isEditionProtected])

  // Vérifier si un bloc est validé (utilise syncedBlockStatus au lieu de blockStatus)
  // ✅ Défini AVANT unvalidateBlock pour éviter la référence circulaire
  const isBlockValidated = useCallback((blockKey: string) => {
    return syncedBlockStatus[blockKey]?.isValidated || false
  }, [syncedBlockStatus])

  // Vérifier si un bloc a déjà été appliqué (changements en base)
  // Un bloc appliqué ne peut plus être annulé
  const isBlockApplied = useCallback((blockKey: string) => {
    // Parcourir toutes les propositions pour voir si ce bloc a une application APPLIED
    return proposals.some(proposal =>
      proposal.applications?.some(
        app => app.blockType === blockKey && app.status === 'APPLIED'
      )
    )
  }, [proposals])

  // Annulation "raw" d'un bloc (sans cascade inverse, sans prompt)
  const unvalidateBlockRaw = useCallback(async (blockKey: string) => {
    const block = syncedBlockStatus[blockKey]
    if (!block) return

    try {
      // Annuler l'approbation des propositions APPROVED ou PARTIALLY_APPROVED
      const approvedProposalIds = block.proposalIds.filter(id => {
        const proposal = proposals.find(p => p.id === id)
        return proposal?.status === 'APPROVED' || proposal?.status === 'PARTIALLY_APPROVED'
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

      // Le statut sera mis à jour automatiquement via syncedBlockStatus après invalidation du cache
    } catch (error) {
      console.error(`Error unvalidating block ${blockKey}:`, error)
      throw error
    }
  }, [syncedBlockStatus, proposals, unapproveBlockMutation])

  // Annuler la validation d'un bloc avec cascade inverse automatique
  const unvalidateBlock = useCallback(async (blockKey: string) => {
    // Détecter les dépendants validés (organizer, races pour edition ; rien pour event)
    const dependents = getAllDependents(blockKey as BlockType).filter(dep => isBlockValidated(dep))

    // Notification informative si des dépendants seront annulés
    if (dependents.length > 0) {
      const label = dependents.join(', ')
      enqueueSnackbar(
        `ℹ️ Annulation automatique : ${blockKey} et dépendants (${label})`,
        {
          variant: 'info',
          autoHideDuration: 3000
        }
      )
    }

    // Annuler le bloc demandé
    await unvalidateBlockRaw(blockKey)

    // Annuler automatiquement tous les dépendants séquentiellement
    for (const dep of dependents) {
      await unvalidateBlockRaw(dep)
      enqueueSnackbar(
        `✅ ${dep} annulé`,
        { variant: 'success', autoHideDuration: 2000 }
      )
    }
  }, [enqueueSnackbar, isBlockValidated, unvalidateBlockRaw])

  // Valider tous les blocs
  const validateAllBlocks = useCallback(async (blocks: Record<string, string[]>) => {
    // ✅ Valider séquentiellement pour éviter race conditions lors de la création d'applications
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

  // Vérifier si au moins un bloc est validé
  const hasValidatedBlocks = useCallback(() => {
    return Object.values(syncedBlockStatus).some(block => block.isValidated)
  }, [syncedBlockStatus])

  /**
   * Valide un bloc et toutes ses dépendances manquantes automatiquement
   *
   * @param blockKey - Bloc à valider
   * @param options - Options de validation
   * @param options.silent - Si true, pas de notifications (utile pour tests)
   *
   * @example
   * // Utilisateur clique "Valider Organisateur"
   * await validateBlockWithDependencies('organizer')
   * // → Système valide automatiquement: event → edition → organizer
   */
  const validateBlockWithDependencies = useCallback(async (
    blockKey: BlockType,
    options?: {
      silent?: boolean
    }
  ) => {
    try {
      // 1. Calculer les dépendances manquantes
      const allDeps = getAllDependencies(blockKey)
      const missingDeps = allDeps.filter(dep => !isBlockValidated(dep))

      const proposalIds = blockProposals[blockKey] || []

      if (proposalIds.length === 0) {
        console.warn(`[validateBlockWithDependencies] Aucune proposition pour le bloc "${blockKey}"`)
        return
      }

      // 2. Si pas de dépendances manquantes, validation directe
      if (missingDeps.length === 0) {
        console.log(`[validateBlockWithDependencies] Bloc "${blockKey}" sans dépendances manquantes, validation directe`)
        return validateBlock(blockKey, proposalIds)
      }

      // 3. Notification anticipée de la cascade
      if (!options?.silent) {
        const depsChain = [...missingDeps, blockKey].join(' → ')
        enqueueSnackbar(
          `Validation automatique : ${depsChain}`,
          {
            variant: 'info',
            autoHideDuration: 3000
          }
        )
      }

      console.log(`[validateBlockWithDependencies] Démarrage cascade pour "${blockKey}":`, {
        allDeps,
        missingDeps,
        alreadyValidated: allDeps.filter(dep => isBlockValidated(dep))
      })

      // 4. Valider les dépendances dans l'ordre (séquentiel)
      for (const dep of missingDeps) {
        const depProposalIds = blockProposals[dep] || []

        if (depProposalIds.length === 0) {
          console.warn(`[validateBlockWithDependencies] Aucune proposition pour la dépendance "${dep}"`)
          continue
        }

        try {
          console.log(`[validateBlockWithDependencies] Validation dépendance "${dep}"...`)
          await validateBlock(dep, depProposalIds)

          if (!options?.silent) {
            enqueueSnackbar(
              `✅ ${dep} validé`,
              { variant: 'success', autoHideDuration: 2000 }
            )
          }
        } catch (error) {
          console.error(`[validateBlockWithDependencies] Erreur validation "${dep}":`, error)
          if (!options?.silent) {
            enqueueSnackbar(
              `❌ Erreur lors de la validation de ${dep}`,
              { variant: 'error' }
            )
          }
          throw error  // Stop la cascade
        }
      }

      // 5. Valider le bloc demandé
      try {
        console.log(`[validateBlockWithDependencies] Validation finale "${blockKey}"...`)
        await validateBlock(blockKey, proposalIds)

        if (!options?.silent) {
          const message = missingDeps.length > 0
            ? `✅ ${blockKey} validé avec succès (+ ${missingDeps.length} dépendance(s))`
            : `✅ ${blockKey} validé avec succès`

          enqueueSnackbar(message, { variant: 'success' })
        }

        console.log(`[validateBlockWithDependencies] Cascade complète pour "${blockKey}" ✅`)
      } catch (error) {
        console.error(`[validateBlockWithDependencies] Erreur validation finale "${blockKey}":`, error)
        if (!options?.silent) {
          enqueueSnackbar(
            `❌ Erreur lors de la validation de ${blockKey}`,
            { variant: 'error' }
          )
        }
        throw error
      }
    } catch (error) {
      console.error(`[validateBlockWithDependencies] Erreur cascade pour "${blockKey}":`, error)
      throw error
    }
  }, [blockProposals, isBlockValidated, validateBlock, enqueueSnackbar])

  return {
    blockStatus: syncedBlockStatus,
    validateBlock,
    validateBlockWithDependencies,  // ✅ Nouveau : validation en cascade
    unvalidateBlock,
    validateAllBlocks,
    unvalidateAllBlocks,
    isBlockValidated,
    isBlockApplied,  // ✅ Nouveau : vérifie si un bloc a déjà été appliqué en base
    hasValidatedBlocks,
    isPending: updateProposalMutation.isPending || unapproveProposalMutation.isPending || unapproveBlockMutation.isPending
  }
}
