import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { proposalsApi } from '@/services/api'
import { Proposal, RaceData } from '@/types'

/**
 * État consolidé d'une proposition
 * ✅ Aligné sur WorkingProposalGroup : changes proposés + userModifiedChanges séparés
 */
export interface WorkingProposal {
  id: string
  originalProposal: Proposal // Proposition backend (immuable)
  
  // État proposé (SANS modifications utilisateur)
  changes: Record<string, any> // Changements proposés par l'agent (extracted from proposal.changes)
  races: Record<string, RaceData> // Courses proposées par l'agent
  
  // Modifications utilisateur (stockées séparément)
  userModifiedChanges: Record<string, any>
  userModifiedRaceChanges: Record<string, any>
  
  // Blocs validés
  approvedBlocks: Record<string, boolean>
  
  // Métadonnées
  isDirty: boolean // Y a-t-il des modifications non sauvegardées ?
  lastSaved: Date | null
}

/**
 * État consolidé pour un groupe de propositions
 * Utilisé pour les vues groupées où plusieurs agents proposent des modifications
 */
export interface WorkingProposalGroup {
  ids: string[] // IDs de toutes les propositions (PENDING + historiques)
  originalProposals: Proposal[] // ✅ Propositions PENDING uniquement (éditables)
  historicalProposals: Proposal[] // ✅ Propositions déjà traitées (APPROVED/REJECTED/ARCHIVED)
  
  // État consolidé de toutes les propositions PENDING
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaces: ConsolidatedRaceChange[]
  
  // Modifications utilisateur (s'appliquent à toutes les propositions du groupe)
  userModifiedChanges: Record<string, any>
  userModifiedRaceChanges: Record<string, any>
  
  // Blocs validés (agrégés de toutes les propositions PENDING)
  approvedBlocks: Record<string, boolean>
  
  // Métadonnées
  isDirty: boolean
  lastSaved: Date | null
}

/**
 * Changement consolidé provenant de plusieurs propositions
 */
export interface ConsolidatedChange {
  field: string
  options: Array<{
    proposalId: string
    agentName: string
    proposedValue: any
    confidence: number
    createdAt: string
  }>
  currentValue: any
  selectedValue?: any // Valeur sélectionnée par l'utilisateur
}

/**
 * Changement consolidé pour une course
 */
export interface ConsolidatedRaceChange {
  raceId: string // ID de la course (existante ou temporaire)
  raceName: string
  proposalIds: string[] // IDs des propositions qui modifient cette course
  originalFields: Record<string, any> // ✅ Valeurs originales de la base (pour "Valeur actuelle")
  fields: Record<string, any> // Champs proposés consolidés
  userModifications?: Record<string, any> // Modifications utilisateur
}

/**
 * Options de configuration du hook
 */
export interface UseProposalEditorOptions {
  autosave?: boolean // true par défaut
  autosaveDelay?: number // 2000ms par défaut
}

/**
 * Valeur de retour du hook (mode simple)
 */
export interface UseProposalEditorReturn {
  // État
  workingProposal: WorkingProposal | null
  isLoading: boolean
  isSaving: boolean
  error: Error | null
  
  // Actions d'édition
  updateField: (field: string, value: any) => void
  updateRace: (raceId: string, field: string, value: any) => void
  deleteRace: (raceId: string) => void
  addRace: (race: RaceData) => void
  
  // Actions de validation
  validateBlock: (blockKey: string) => Promise<void>
  unvalidateBlock: (blockKey: string) => Promise<void>
  
  // Sauvegarde
  save: () => Promise<void>
  
  // Export
  getPayload: () => Record<string, any>
  
  // Utilitaires
  reset: () => void // Réinitialiser aux valeurs backend
  hasUnsavedChanges: () => boolean
}

/**
 * Valeur de retour du hook (mode groupé)
 */
export interface UseProposalEditorGroupReturn {
  // État
  workingGroup: WorkingProposalGroup | null
  isLoading: boolean
  isSaving: boolean
  error: Error | null
  isDirty: boolean
  
  // Actions d'édition
  updateField: (field: string, value: any) => void
  selectOption: (field: string, proposalId: string) => void // Sélectionner une option parmi les propositions
  updateRace: (raceId: string, field: string, value: any) => void
  deleteRace: (raceId: string) => void
  addRace: (race: RaceData) => void
  
  // Actions de validation
  validateBlock: (blockKey: string, proposalIds: string[]) => Promise<void>
  unvalidateBlock: (blockKey: string) => Promise<void>
  validateAllBlocks: () => Promise<void>
  
  // Sauvegarde
  save: () => Promise<void>
  
  // Export
  getPayload: () => Record<string, any>
  
  // Utilitaires
  reset: () => void
  hasUnsavedChanges: () => boolean
  isBlockValidated: (blockKey: string) => boolean
}

/**
 * Type guard pour vérifier si le retour est en mode groupé
 */
export function isGroupReturn(result: UseProposalEditorReturn | UseProposalEditorGroupReturn): result is UseProposalEditorGroupReturn {
  return 'workingGroup' in result
}

/**
 * Hook pour éditer une ou plusieurs propositions
 * Gère l'état consolidé, la sauvegarde automatique et la validation
 * 
 * @param proposalId - ID unique (mode simple) ou array d'IDs (mode groupé)
 * @param options - Options de configuration
 * @returns Interface différente selon le mode (simple vs groupé)
 */
export function useProposalEditor(
  proposalId: string | string[],
  options: UseProposalEditorOptions = {}
): UseProposalEditorReturn | UseProposalEditorGroupReturn {
  const { autosave = true, autosaveDelay = 2000 } = options
  
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  
  // Déterminer le mode (simple ou groupé)
  const isGroupMode = Array.isArray(proposalId)
  
  // États pour mode simple
  const [workingProposal, setWorkingProposal] = useState<WorkingProposal | null>(null)
  
  // États pour mode groupé
  const [workingGroup, setWorkingGroup] = useState<WorkingProposalGroup | null>(null)
  
  // États communs
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Refs pour toujours avoir les dernières valeurs dans save()
  const workingGroupRef = useRef<WorkingProposalGroup | null>(null)
  const workingProposalRef = useRef<WorkingProposal | null>(null)
  
  // Synchroniser les refs avec les états
  useEffect(() => {
    workingGroupRef.current = workingGroup
  }, [workingGroup])
  
  useEffect(() => {
    workingProposalRef.current = workingProposal
  }, [workingProposal])
  
  /**
   * Charger la(les) proposition(s) depuis le backend et initialiser l'état
   */
  const loadProposal = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      if (isGroupMode) {
        // Mode groupé: charger plusieurs propositions
        const ids = proposalId as string[]
        const responses = await Promise.all(
          ids.map(id => proposalsApi.getById(id))
        )
        const proposals = responses.map(r => r.data)
        
        // Initialiser l'état consolidé du groupe
        const group = initializeWorkingGroup(proposals)
        setWorkingGroup(group)
      } else {
        // Mode simple: charger une seule proposition
        const response = await proposalsApi.getById(proposalId as string)
        const proposal = response.data
        
        // Initialiser l'état consolidé
        const working = initializeWorkingProposal(proposal)
        setWorkingProposal(working)
      }
    } catch (err) {
      setError(err as Error)
      enqueueSnackbar('Erreur lors du chargement de la proposition', { variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [proposalId, isGroupMode, enqueueSnackbar])
  
  /**
   * Construire l'état groupé initial à partir de plusieurs propositions
   * ✅ Filtre PENDING vs historiques pour éviter pollution de l'état
   */
  const initializeWorkingGroup = (proposals: Proposal[]): WorkingProposalGroup => {
    // ✅ Séparer les propositions en cours (PENDING ou PARTIALLY_APPROVED) des propositions finalisées
    const pendingProposals = proposals.filter(p => p.status === 'PENDING' || p.status === 'PARTIALLY_APPROVED')
    const historicalProposals = proposals.filter(p => p.status !== 'PENDING' && p.status !== 'PARTIALLY_APPROVED')
    const approvedProposals = proposals.filter(p => p.status === 'APPROVED')
    
    const ids = proposals.map(p => p.id) // Garder tous les IDs pour navigation

    // ✅ MODE LECTURE SEULE : Si aucune PENDING mais des APPROVED, afficher en lecture seule
    // Utiliser uniquement les APPROVED (pas REJECTED/ARCHIVED) pour éviter la pollution
    const proposalsToConsolidate = pendingProposals.length > 0 ? pendingProposals : approvedProposals

    // ✅ Consolidation (PENDING en priorité, sinon APPROVED en lecture seule)
    const consolidatedChanges = consolidateChangesFromProposals(proposalsToConsolidate)
    const consolidatedRaces = consolidateRacesFromProposals(proposalsToConsolidate)

    // ✅ Blocs approuvés (PENDING ou APPROVED)
    const approvedBlocks: Record<string, boolean> = {}
    const allBlockKeys = new Set<string>()
    proposalsToConsolidate.forEach(p => Object.keys(p.approvedBlocks || {}).forEach(k => allBlockKeys.add(k)))
    allBlockKeys.forEach(blockKey => {
      approvedBlocks[blockKey] = proposalsToConsolidate.every(p => p.approvedBlocks?.[blockKey])
    })

    // Extraire userModifiedChanges depuis la première proposition (PENDING ou APPROVED)
    const firstProposal = proposalsToConsolidate[0]
    const userModifiedRaceChanges = firstProposal?.userModifiedChanges?.raceEdits || {}
    
    // Extraire les autres modifications utilisateur (hors raceEdits)
    const userModifiedChanges: Record<string, any> = {}
    if (firstProposal?.userModifiedChanges) {
      Object.entries(firstProposal.userModifiedChanges).forEach(([key, value]) => {
        if (key !== 'raceEdits') {
          userModifiedChanges[key] = value
        }
      })
    }

    return {
      ids,
      originalProposals: pendingProposals, // ✅ Seules les PENDING pour l'édition
      historicalProposals, // ✅ Propositions déjà traitées (historique)
      consolidatedChanges,
      consolidatedRaces,
      userModifiedChanges, // ✅ Préserver les modifs édition sauvegardées
      userModifiedRaceChanges, // ✅ Préserver les modifs de courses sauvegardées
      approvedBlocks,
      isDirty: false,
      lastSaved: pendingProposals.length > 0 
        ? new Date(Math.max(...pendingProposals.map(p => new Date(p.updatedAt).getTime())))
        : null // Pas de PENDING = pas de lastSaved
    }
  }

  /**
   * Initialiser l'état consolidé depuis une proposition backend
   * ✅ Aligné sur initializeWorkingGroup : stockage séparé des propositions et modifications
   */
  const initializeWorkingProposal = (proposal: Proposal): WorkingProposal => {
    // 1. Extraire les changements PROPOSES (sans userModifiedChanges)
    const proposedChanges: Record<string, any> = {}
    Object.entries(proposal.changes).forEach(([field, value]) => {
      proposedChanges[field] = extractNewValue(value)
    })
    
    // 2. Extraire les courses PROPOSEES (sans userModifiedChanges)
    const proposedRaces = extractRaces(proposedChanges, proposal)
    
    // 3. Retirer les courses des changes (elles sont dans races)
    const cleanedChanges = { ...proposedChanges }
    delete cleanedChanges.races
    delete cleanedChanges.racesToAdd
    delete cleanedChanges.racesToUpdate
    Object.keys(cleanedChanges).forEach(key => {
      if (key.startsWith('race_')) {
        delete cleanedChanges[key]
      }
    })
    
    // 4. ✅ Extraire userModifiedChanges SÉPARÉMENT (comme WorkingProposalGroup)
    const userModifiedChanges: Record<string, any> = {}
    const userModifiedRaceChanges: Record<string, any> = {}
    
    if (proposal.userModifiedChanges) {
      Object.entries(proposal.userModifiedChanges).forEach(([key, value]) => {
        if (key === 'raceEdits') {
          // Les modifications de courses sont dans raceEdits
          Object.assign(userModifiedRaceChanges, value)
        } else {
          userModifiedChanges[key] = value
        }
      })
    }
    
    return {
      id: proposal.id,
      originalProposal: proposal,
      changes: cleanedChanges, // ✅ SANS userModifiedChanges
      races: proposedRaces, // ✅ SANS userModifiedRaceChanges
      userModifiedChanges, // ✅ Stocké séparément
      userModifiedRaceChanges, // ✅ Stocké séparément
      approvedBlocks: proposal.approvedBlocks || {},
      isDirty: false,
      lastSaved: new Date(proposal.updatedAt)
    }
  }
  
  /**
   * Merger les changements proposés avec les modifications utilisateur
   */
  const mergeChanges = (
    proposedChanges: Record<string, any>,
    userModifications: Record<string, any>
  ): Record<string, any> => {
    const result: Record<string, any> = {}
    
    // 1. Ajouter tous les changements proposés
    Object.entries(proposedChanges).forEach(([field, value]) => {
      result[field] = extractNewValue(value)
    })
    
    // 2. Écraser avec les modifications utilisateur
    Object.entries(userModifications).forEach(([field, value]) => {
      result[field] = value
    })
    
    return result
  }
  
  /**
   * Consolider les changements de plusieurs propositions
   */
  const consolidateChangesFromProposals = (proposals: Proposal[]): ConsolidatedChange[] => {
    const map = new Map<string, ConsolidatedChange>()

    proposals.forEach(p => {
      const merged = mergeChanges(p.changes, p.userModifiedChanges || {})
      
      // ✅ NOUVEAU : Aplatir la structure edition.new pour NEW_EVENT
      const flattenedMerged: Record<string, any> = {}
      Object.entries(merged).forEach(([key, value]) => {
        if (key === 'edition' && value && typeof value === 'object' && !Array.isArray(value)) {
          // Déplier les champs de l'édition au niveau racine
          Object.entries(value).forEach(([editionField, editionValue]) => {
            if (editionField !== 'races' && editionField !== 'organizer') {
              flattenedMerged[editionField] = editionValue
            }
          })
          // Garder organizer dans edition pour le traitement spécial
          if (value.organizer) {
            flattenedMerged['organizer'] = value.organizer
          }
        } else {
          flattenedMerged[key] = value
        }
      })
      
      Object.entries(flattenedMerged).forEach(([field, value]) => {
        if (!map.has(field)) {
          // ✅ Extraire currentValue depuis p.changes[field]
          const originalValue = p.changes[field]
          let currentValue: any = undefined
          
          // Extraire la valeur "old" ou "current" selon le format
          if (originalValue && typeof originalValue === 'object') {
            if ('old' in originalValue) {
              currentValue = originalValue.old
            } else if ('current' in originalValue) {
              currentValue = originalValue.current
            }
          }
          
          map.set(field, {
            field,
            options: [],
            currentValue
          })
        }
        const entry = map.get(field)!
        entry.options.push({
          proposalId: p.id,
          agentName: (p as any).agentName || (p as any).agent?.name || 'Agent',
          proposedValue: value,
          confidence: (p as any).confidence || 0,
          createdAt: p.createdAt as any
        })
      })
    })

    return Array.from(map.values())
  }

  /**
   * Extraire les données originales des courses depuis currentData (FFA Scraper v2)
   */
  const extractRacesOriginalData = (proposal: Proposal): Record<string, RaceData> => {
    const races: Record<string, RaceData> = {}
    
    // ✅ NOUVEAU: Chercher racesToUpdate.new[].currentData
    const changes = proposal.changes
    if (changes.racesToUpdate && typeof changes.racesToUpdate === 'object') {
      const racesToUpdateObj = extractNewValue(changes.racesToUpdate)
      if (Array.isArray(racesToUpdateObj)) {
        racesToUpdateObj.forEach((raceUpdate: any, index: number) => {
          // ✅ FIX 2025-11-18: Utiliser existing-{index} pour matcher avec extractRaces()
          const raceId = `existing-${index}`
          
          // ✅ Utiliser currentData si disponible (FFA Scraper enrichi + Google Agent)
          if (raceUpdate.currentData && typeof raceUpdate.currentData === 'object') {
            races[raceId] = {
              id: raceId,
              name: raceUpdate.currentData.name || raceUpdate.raceName || 'Course',
              startDate: raceUpdate.currentData.startDate,
              runDistance: raceUpdate.currentData.runDistance,
              bikeDistance: raceUpdate.currentData.bikeDistance,       // ✅ AJOUT
              walkDistance: raceUpdate.currentData.walkDistance,       // ✅ AJOUT
              swimDistance: raceUpdate.currentData.swimDistance,       // ✅ AJOUT
              runPositiveElevation: raceUpdate.currentData.runPositiveElevation,
              categoryLevel1: raceUpdate.currentData.categoryLevel1,
              categoryLevel2: raceUpdate.currentData.categoryLevel2,
              timeZone: raceUpdate.currentData.timeZone
            }
          } else {
            // Fallback: extraire les valeurs "old" depuis updates
            const oldData: any = { id: raceId, name: raceUpdate.raceName || 'Course' }
            if (raceUpdate.updates && typeof raceUpdate.updates === 'object') {
              Object.entries(raceUpdate.updates).forEach(([field, value]: [string, any]) => {
                oldData[field] = extractOldValue(value)
              })
            }
            races[raceId] = oldData
          }
        })
      }
    }
    
    // ✅ Chercher racesExisting (courses sans changement)
    if (changes.racesExisting && typeof changes.racesExisting === 'object') {
      const racesExistingObj = extractNewValue(changes.racesExisting)
      if (Array.isArray(racesExistingObj)) {
        racesExistingObj.forEach((raceInfo: any) => {
          const raceId = raceInfo.raceId ? raceInfo.raceId.toString() : `existing-${Math.random()}`
          // ✅ Utiliser currentData si disponible (backend enrichi), sinon niveau racine
          const source = raceInfo.currentData || raceInfo
          races[raceId] = {
            id: raceId,
            name: source.name || raceInfo.raceName || 'Course',
            startDate: source.startDate,
            runDistance: source.runDistance,
            bikeDistance: source.bikeDistance,
            walkDistance: source.walkDistance,
            swimDistance: source.swimDistance,
            runPositiveElevation: source.runPositiveElevation,
            categoryLevel1: source.categoryLevel1,
            categoryLevel2: source.categoryLevel2
          }
        })
      }
    }
    
    // Fallback: utiliser extractRaces avec extractOld=true pour les autres structures
    if (Object.keys(races).length === 0) {
      return extractRaces(proposal.changes, proposal, true)
    }
    
    return races
  }
  
  /**
   * Consolider les courses de plusieurs propositions
   */
  const consolidateRacesFromProposals = (proposals: Proposal[]): ConsolidatedRaceChange[] => {
    const raceMap = new Map<string, ConsolidatedRaceChange>()

    proposals.forEach(p => {
      // ✅ Extraire les valeurs ORIGINALES depuis currentData ou old values
      const originalRaces = extractRacesOriginalData(p)
      
      // Extraire les valeurs PROPOSÉES (avec userModifiedChanges)
      const merged = mergeChanges(p.changes, p.userModifiedChanges || {})
      const races = extractRaces(merged, p, false) // false = extractNew
      
      Object.entries(races).forEach(([raceId, raceData]) => {
        if (!raceMap.has(raceId)) {
          raceMap.set(raceId, {
            raceId,
            raceName: (raceData as any).name || 'Course',
            proposalIds: [],
            originalFields: originalRaces[raceId] || {}, // ✅ Depuis currentData
            fields: {}
          })
        }
        const entry = raceMap.get(raceId)!
        entry.proposalIds.push(p.id)
        // Fusion simple des champs proposés (UNIQUEMENT ceux dans updates)
        entry.fields = { ...entry.fields, ...raceData }
      })
    })

    return Array.from(raceMap.values())
  }

  /**
   * Extraire la valeur "new" d'un changement
   * Gère les formats: { new: value }, { proposed: value }, ou valeur directe
   */
  const extractNewValue = (value: any): any => {
    if (value === null || value === undefined) return value
    
    if (typeof value === 'object') {
      // Format agent: { old: ..., new: ..., confidence: ... }
      if ('new' in value) return value.new
      
      // Format alternatif: { proposed: ... }
      if ('proposed' in value) return value.proposed
      
      // Format GoogleSearchDateAgent: { new: ..., confidence: ... }
      if ('confidence' in value && Object.keys(value).length === 2) {
        return value.new
      }
    }
    
    return value
  }
  
  /**
   * Extraire la valeur "old" d'un changement (pour originalFields)
   * Gère les formats: { old: value }, { current: value }, ou valeur directe
   */
  const extractOldValue = (value: any): any => {
    if (value === null || value === undefined) return value
    
    if (typeof value === 'object') {
      // Format agent: { old: ..., new: ..., confidence: ... }
      if ('old' in value) return value.old
      
      // Format alternatif: { current: ... }
      if ('current' in value) return value.current
    }
    
    return value
  }
  
  /**
   * Extraire et normaliser les courses
   * Convertit les structures race_0, race_1... en { raceId: RaceData }
   * @param extractOld - Si true, extrait les valeurs "old" des updates au lieu de "new"
   */
  const extractRaces = (
    changes: Record<string, any>,
    proposal: Proposal,
    extractOld: boolean = false
  ): Record<string, RaceData> => {
    const races: Record<string, RaceData> = {}
    
    // 0. Chercher structure NEW_EVENT: changes.edition.new.races
    if (changes.edition && typeof changes.edition === 'object') {
      const editionData = extractNewValue(changes.edition)
      if (editionData && typeof editionData === 'object' && editionData.races && Array.isArray(editionData.races)) {
        editionData.races.forEach((race: any, index: number) => {
          const raceId = `new-${index}`
          races[raceId] = normalizeRace(race, raceId)
        })
        // Si on a trouvé des courses ici, on peut retourner directement
        if (Object.keys(races).length > 0) {
          return races
        }
      }
    }
    
    // 1. Chercher structure imbriquée: changes.races (FFA Scraper - NEW_EVENT)
    if (changes.races && typeof changes.races === 'object') {
      const racesObj = extractNewValue(changes.races)
      
      if (Array.isArray(racesObj)) {
        // Races à créer (NEW_EVENT)
        racesObj.forEach((race, index) => {
          const raceId = `new-${index}`
          races[raceId] = normalizeRace(race, raceId)
        })
      } else if (typeof racesObj === 'object') {
        // Races existantes avec IDs (EDITION_UPDATE)
        Object.entries(racesObj).forEach(([raceId, raceData]) => {
          races[raceId] = normalizeRace(raceData, raceId)
        })
      }
    }
    
    // 1b. Chercher changes.racesToAdd (FFA Scraper - EDITION_UPDATE)
    if (changes.racesToAdd && typeof changes.racesToAdd === 'object') {
      const racesToAddObj = extractNewValue(changes.racesToAdd)
      if (Array.isArray(racesToAddObj)) {
        racesToAddObj.forEach((race, index) => {
          const raceId = `new-${index}`
          races[raceId] = normalizeRace(race, raceId)
        })
      }
    }
    
    // 1c. Chercher changes.racesToUpdate (FFA Scraper - EDITION_UPDATE)
    if (changes.racesToUpdate && typeof changes.racesToUpdate === 'object') {
      const racesToUpdateObj = extractNewValue(changes.racesToUpdate)
      if (Array.isArray(racesToUpdateObj)) {
        racesToUpdateObj.forEach((raceUpdate: any, index: number) => {
          // ✅ Utiliser existing-{index} comme clé (convention backend)
          // Le backend mappe cet index vers existingRaces[index] pour récupérer le vrai raceId
          const raceId = `existing-${index}`
          // ✅ NOUVEAU: Ne mettre dans raceData QUE les champs qui ont des updates
          // Les autres champs (currentData) seront dans originalFields
          const raceData: any = { 
            id: raceId,
            name: raceUpdate.raceName || 'Course'
          }
          
          // ✅ Appliquer UNIQUEMENT les updates (champs qui changent)
          if (raceUpdate.updates && typeof raceUpdate.updates === 'object') {
            Object.entries(raceUpdate.updates).forEach(([field, value]: [string, any]) => {
              raceData[field] = extractOld ? extractOldValue(value) : extractNewValue(value)
            })
          }
          
          races[raceId] = normalizeRace(raceData, raceId, extractOld)
        })
      }
    }
    
    // 1d. ✅ Chercher changes.racesExisting (FFA Scraper - EDITION_UPDATE)
    // Courses existantes sans changement (affichage informatif uniquement)
    if (changes.racesExisting && typeof changes.racesExisting === 'object') {
      const racesExistingObj = extractNewValue(changes.racesExisting)
      if (Array.isArray(racesExistingObj)) {
        racesExistingObj.forEach((raceInfo: any) => {
          const raceId = raceInfo.raceId ? raceInfo.raceId.toString() : `existing-${Math.random()}`
          // Pour les courses existantes sans changement, on met tout dans raceData
          // car il n'y a pas de distinction old/new
          const raceData: any = { 
            id: raceId,
            name: raceInfo.raceName || 'Course',
            runDistance: raceInfo.runDistance,
            walkDistance: raceInfo.walkDistance,
            bikeDistance: raceInfo.bikeDistance,
            swimDistance: raceInfo.swimDistance,
            runPositiveElevation: raceInfo.runPositiveElevation,
            categoryLevel1: raceInfo.categoryLevel1,
            categoryLevel2: raceInfo.categoryLevel2,
            startDate: raceInfo.startDate,
            _isExistingUnchanged: true // ✅ Marqueur pour l'affichage
          }
          
          races[raceId] = normalizeRace(raceData, raceId, extractOld)
        })
      }
    }
    
    // 2. Chercher structure plate: race_0, race_1... (legacy)
    Object.entries(changes).forEach(([key, value]) => {
      if (key.startsWith('race_')) {
        const index = key.replace('race_', '')
        const raceId = `legacy-${index}`
        // normalizeRace va extraire la valeur new/old, donc on passe la valeur brute
        races[raceId] = normalizeRace(value, raceId, extractOld)
      }
    })
    
    // 3. Chercher dans changes.raceEdits (déjà mergé depuis userModifiedChanges)
    if (changes.raceEdits) {
      Object.entries(changes.raceEdits).forEach(([key, edits]) => {
        // key format: "142064", "142065", "new-0", etc.
        if (!races[key]) {
          // ✅ Clé orpheline: modification utilisateur sur une course qui n'existe pas dans la proposition
          // Ne pas créer de course fantôme, ignorer silencieusement
          return
        }
        
        // Merger les éditions
        Object.assign(races[key], edits)
      })
    }
    
    return races
  }
  
  /**
   * Normaliser une course en RaceData
   * @param extractOld - Si true, extrait les valeurs "old" au lieu de "new"
   */
  const normalizeRace = (race: any, raceId: string, extractOld: boolean = false): RaceData => {
    if (!race || typeof race !== 'object') {
      return { id: raceId, name: 'Course sans nom' }
    }
    
    // ✅ Préserver le marqueur _isExistingUnchanged AVANT extraction
    const isExistingUnchanged = race._isExistingUnchanged === true
    
    // ✅ Extraire TOUTES les valeurs new/old selon le paramètre
    const normalized: any = { id: raceId }
    
    Object.entries(race).forEach(([key, value]) => {
      normalized[key] = extractOld ? extractOldValue(value) : extractNewValue(value)
    })
    
    // S'assurer qu'il y a un nom
    if (!normalized.name && !normalized.raceName) {
      normalized.name = 'Course sans nom'
    }
    
    return {
      id: raceId,
      name: normalized.name || normalized.raceName || 'Course sans nom',
      distance: normalized.distance || normalized.runDistance,
      runDistance: normalized.runDistance || normalized.distance, // ✅ Préserver runDistance
      startDate: normalized.startDate,
      price: normalized.price,
      elevation: normalized.elevation || normalized.runPositiveElevation,
      runPositiveElevation: normalized.runPositiveElevation || normalized.elevation, // ✅ Préserver runPositiveElevation
      ...normalized,
      // ✅ Remettre le marqueur après le spread
      ...(isExistingUnchanged && { _isExistingUnchanged: true })
    }
  }
  
  /**
   * Sauvegarder les modifications en backend
   */
  const save = useCallback(async () => {
    if (isSaving) return

    setIsSaving(true)
    try {
      if (isGroupMode) {
        // En mode groupé, on persiste les modifications utilisateur sur TOUTES les propositions
        const currentWorkingGroup = workingGroupRef.current
        if (!currentWorkingGroup) return
        const diff = buildGroupDiff(currentWorkingGroup)
        await Promise.all(
          currentWorkingGroup.ids.map(id => proposalsApi.updateUserModifications(id, diff))
        )
        setWorkingGroup(prev => {
          if (!prev) return prev
          return { ...prev, isDirty: false, lastSaved: new Date() }
        })
        // ⚠️ NE PAS invalider le cache ici : cela déclencherait un refetch qui écraserait l'état local
        // L'état local est déjà à jour et sera rechargé au prochain mount du composant
        // enqueueSnackbar('Modifications groupées sauvegardées', { variant: 'success' })
      } else {
        const currentWorkingProposal = workingProposalRef.current
        if (!currentWorkingProposal) return
        // Calculer le diff entre working et original
        const diff = calculateDiff(currentWorkingProposal)
        // Envoyer seulement le diff au backend
        await proposalsApi.updateUserModifications(currentWorkingProposal.id, diff)
        // Mettre à jour l'état
        setWorkingProposal(prev => {
          if (!prev) return prev
          
          return {
            ...prev,
            isDirty: false,
            lastSaved: new Date(),
            originalProposal: {
              ...prev.originalProposal,
              userModifiedChanges: diff
            }
          }
        })
        // ⚠️ NE PAS invalider le cache ici : cela déclencherait un refetch qui écraserait l'état local
        // L'état local est déjà à jour et sera rechargé au prochain mount du composant
        // enqueueSnackbar('Modifications sauvegardées', { variant: 'success' })
      }
    } catch (err) {
      enqueueSnackbar('Erreur lors de la sauvegarde', { variant: 'error' })
      throw err
    } finally {
      setIsSaving(false)
    }
  }, [isGroupMode, isSaving, enqueueSnackbar])
  
  /**
   * Planifier une sauvegarde automatique (debounced)
   */
  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
    }
    
    autosaveTimerRef.current = setTimeout(() => {
      save()
    }, autosaveDelay)
  }, [save, autosaveDelay])
  
  /**
   * Mettre à jour un champ
   */
  const updateField = useCallback((field: string, value: any) => {
    if (isGroupMode) {
      setWorkingGroup(prev => {
        if (!prev) return prev
        // Mettre à jour la sélection utilisateur au niveau groupe
        const next = { ...prev }
        next.userModifiedChanges = { ...next.userModifiedChanges, [field]: value }
        // Mettre à jour la valeur sélectionnée si le champ est consolidé
        const idx = next.consolidatedChanges.findIndex(c => c.field === field)
        if (idx >= 0) {
          next.consolidatedChanges[idx] = { ...next.consolidatedChanges[idx], selectedValue: value }
        }
        next.isDirty = true
        return next
      })
    } else {
      setWorkingProposal(prev => {
        if (!prev) return prev
        
        // ✅ Aligné sur mode groupé : mettre à jour userModifiedChanges, pas changes
        return {
          ...prev,
          userModifiedChanges: {
            ...prev.userModifiedChanges,
            [field]: value
          },
          isDirty: true
        }
      })
    }
    
    // Déclencher autosave si activé
    if (autosave) {
      scheduleAutosave()
    }
  }, [autosave, scheduleAutosave])
  
  /**
   * Mettre à jour une course
   */
  const updateRace = useCallback((raceId: string, field: string, value: any) => {
    if (isGroupMode) {
      setWorkingGroup(prev => {
        if (!prev) return prev
        const next = { ...prev }
        const current = next.userModifiedRaceChanges[raceId] || {}
        next.userModifiedRaceChanges = { ...next.userModifiedRaceChanges, [raceId]: { ...current, [field]: value } }
        next.isDirty = true
        return next
      })
    } else {
      setWorkingProposal(prev => {
        if (!prev) return prev
        
        // ✅ Aligné sur mode groupé : mettre à jour userModifiedRaceChanges, pas races
        const current = prev.userModifiedRaceChanges[raceId] || {}
        return {
          ...prev,
          userModifiedRaceChanges: {
            ...prev.userModifiedRaceChanges,
            [raceId]: { ...current, [field]: value }
          },
          isDirty: true
        }
      })
    }
    
    if (autosave) {
      scheduleAutosave()
    }
  }, [autosave, scheduleAutosave])
  
  /**
   * Supprimer une course (soft delete avec toggle)
   * Marque la course comme _deleted ou annule le marquage
   */
  const deleteRace = useCallback((raceId: string) => {
    if (isGroupMode) {
      setWorkingGroup(prev => {
        if (!prev) return prev
        const next = { ...prev }
        
        // Toggle du marqueur _deleted
        const current = next.userModifiedRaceChanges[raceId] || {}
        const isCurrentlyDeleted = current._deleted === true
        
        if (isCurrentlyDeleted) {
          // Annuler la suppression : retirer le marqueur
          const { _deleted, ...rest } = current
          if (Object.keys(rest).length === 0) {
            // Plus aucune modification, supprimer l'entrée complète
            const changes = { ...next.userModifiedRaceChanges }
            delete changes[raceId]
            next.userModifiedRaceChanges = changes
          } else {
            // Garder les autres modifications
            next.userModifiedRaceChanges = {
              ...next.userModifiedRaceChanges,
              [raceId]: rest
            }
          }
        } else {
          // Marquer comme supprimée
          next.userModifiedRaceChanges = {
            ...next.userModifiedRaceChanges,
            [raceId]: { ...current, _deleted: true }
          }
        }
        
        next.isDirty = true
        return next
      })
    } else {
      setWorkingProposal(prev => {
        if (!prev) return prev
        
        // Toggle du marqueur _deleted
        const current = prev.userModifiedRaceChanges[raceId] || {}
        const isCurrentlyDeleted = current._deleted === true
        
        if (isCurrentlyDeleted) {
          // Annuler la suppression
          const { _deleted, ...rest } = current
          if (Object.keys(rest).length === 0) {
            const changes = { ...prev.userModifiedRaceChanges }
            delete changes[raceId]
            return {
              ...prev,
              userModifiedRaceChanges: changes,
              isDirty: true
            }
          } else {
            return {
              ...prev,
              userModifiedRaceChanges: {
                ...prev.userModifiedRaceChanges,
                [raceId]: rest
              },
              isDirty: true
            }
          }
        } else {
          // Marquer comme supprimée
          return {
            ...prev,
            userModifiedRaceChanges: {
              ...prev.userModifiedRaceChanges,
              [raceId]: { ...current, _deleted: true }
            },
            isDirty: true
          }
        }
      })
    }
    
    if (autosave) {
      scheduleAutosave()
    }
  }, [autosave, scheduleAutosave])
  
  /**
   * Ajouter une nouvelle course
   */
  const addRace = useCallback((race: RaceData) => {
    if (isGroupMode) {
      setWorkingGroup(prev => {
        if (!prev) return prev
        const tempId = `new-${Date.now()}`
        const next = { ...prev }
        next.userModifiedRaceChanges = {
          ...next.userModifiedRaceChanges,
          [tempId]: { ...race, id: tempId }
        }
        next.isDirty = true
        return next
      })
    } else {
      setWorkingProposal(prev => {
        if (!prev) return prev
        
        // Générer un ID temporaire
        const tempId = `new-${Date.now()}`
        
        // ✅ Aligné sur mode groupé : ajouter à userModifiedRaceChanges
        return {
          ...prev,
          userModifiedRaceChanges: {
            ...prev.userModifiedRaceChanges,
            [tempId]: { ...race, id: tempId }
          },
          isDirty: true
        }
      })
    }
    
    if (autosave) {
      scheduleAutosave()
    }
  }, [autosave, scheduleAutosave])
  
  /**
   * Construire le diff groupé à appliquer à chaque proposition
   * IMPORTANT : Ne renvoie QUE les modifications utilisateur, pas les valeurs proposées
   * Les valeurs proposées sont incluses lors de la validation des blocs, pas lors de l'autosave
   */
  const buildGroupDiff = (working: WorkingProposalGroup): Record<string, any> => {
    const diff: Record<string, any> = {}

    // 1. Modifications utilisateur uniquement (champs édités manuellement)
    Object.assign(diff, working.userModifiedChanges)

    // 2. Construire raceEdits et racesToDelete depuis userModifiedRaceChanges
    if (working.userModifiedRaceChanges && Object.keys(working.userModifiedRaceChanges).length > 0) {
      const raceEdits: Record<string, any> = {}
      const racesToDelete: number[] = []
      
      Object.entries(working.userModifiedRaceChanges).forEach(([raceId, changes]) => {
        if (changes._deleted) {
          // Course marquée pour suppression
          const numericId = parseInt(raceId)
          if (!isNaN(numericId)) {
            // ID numérique = course existante à supprimer
            racesToDelete.push(numericId)
          }
          // Si c'est new-X, on l'ignore simplement (pas créée)
        } else {
          // Course avec modifications (pas supprimée)
          raceEdits[raceId] = changes
        }
      })
      
      if (Object.keys(raceEdits).length > 0) {
        diff.raceEdits = raceEdits
      }
      if (racesToDelete.length > 0) {
        diff.racesToDelete = racesToDelete
      }
    }

    return diff
  }

  /**
   * Calculer le diff entre working et original
   * ✅ Aligné sur buildGroupDiff : renvoie UNIQUEMENT les modifications utilisateur
   */
  const calculateDiff = (working: WorkingProposal): Record<string, any> => {
    const diff: Record<string, any> = {}
    
    // 1. Modifications utilisateur uniquement (champs édités manuellement)
    Object.assign(diff, working.userModifiedChanges)
    
    // 2. Construire raceEdits et racesToDelete depuis userModifiedRaceChanges
    if (working.userModifiedRaceChanges && Object.keys(working.userModifiedRaceChanges).length > 0) {
      const raceEdits: Record<string, any> = {}
      const racesToDelete: number[] = []
      
      Object.entries(working.userModifiedRaceChanges).forEach(([raceId, changes]) => {
        if (changes._deleted) {
          // Course marquée pour suppression
          const numericId = parseInt(raceId)
          if (!isNaN(numericId)) {
            // ID numérique = course existante à supprimer
            racesToDelete.push(numericId)
          }
          // Si c'est new-X, on l'ignore simplement (pas créée)
        } else {
          // Course avec modifications (pas supprimée)
          raceEdits[raceId] = changes
        }
      })
      
      if (Object.keys(raceEdits).length > 0) {
        diff.raceEdits = raceEdits
      }
      if (racesToDelete.length > 0) {
        diff.racesToDelete = racesToDelete
      }
    }
    
    return diff
  }
  
  /**
   * Valider un bloc
   */
  const validateBlock = useCallback(async (blockKey: string, proposalIds?: string[]) => {
    try {
      // Sauvegarder d'abord les modifications locales
      await save()

      if (isGroupMode) {
        if (!workingGroup) return
        const ids = proposalIds && proposalIds.length > 0 ? proposalIds : workingGroup.ids
        const payload = getPayloadForBlock(blockKey)
        await Promise.all(ids.map(id => proposalsApi.validateBlock(id, blockKey, payload)))
        setWorkingGroup(prev => {
          if (!prev) return prev
          return {
            ...prev,
            approvedBlocks: { ...prev.approvedBlocks, [blockKey]: true }
          }
        })
        enqueueSnackbar(`Bloc "${blockKey}" validé pour ${ids.length} proposition(s)`, { variant: 'success' })
      } else {
        if (!workingProposal) return
        const payload = getPayloadForBlock(blockKey)
        await proposalsApi.validateBlock(workingProposal.id, blockKey, payload)
        setWorkingProposal(prev => {
          if (!prev) return prev
          return {
            ...prev,
            approvedBlocks: {
              ...prev.approvedBlocks,
              [blockKey]: true
            }
          }
        })
        queryClient.invalidateQueries({ queryKey: ['proposals', workingProposal.id] })
        enqueueSnackbar(`Bloc "${blockKey}" validé`, { variant: 'success' })
      }
    } catch (err) {
      enqueueSnackbar('Erreur lors de la validation du bloc', { variant: 'error' })
      throw err
    }
  }, [isGroupMode, workingGroup, workingProposal, queryClient, enqueueSnackbar, save])
  
  /**
   * Annuler la validation d'un bloc
   */
  const unvalidateBlock = useCallback(async (blockKey: string) => {
    if (!workingProposal) return
    
    try {
      await proposalsApi.unvalidateBlock(workingProposal.id, blockKey)
      
      setWorkingProposal(prev => {
        if (!prev) return prev
        
        const newApprovedBlocks = { ...prev.approvedBlocks }
        delete newApprovedBlocks[blockKey]
        
        return {
          ...prev,
          approvedBlocks: newApprovedBlocks
        }
      })
      
      queryClient.invalidateQueries({ queryKey: ['proposals', workingProposal.id] })
      
      enqueueSnackbar(`Bloc "${blockKey}" dévalidé`, { variant: 'success' })
    } catch (err) {
      enqueueSnackbar('Erreur lors de la dévalidation du bloc', { variant: 'error' })
      throw err
    }
  }, [workingProposal, queryClient, enqueueSnackbar])
  
  /**
   * Construire le payload pour un bloc spécifique
   */
  const getPayloadForBlock = (blockKey: string): Record<string, any> => {
    if (isGroupMode) {
      if (!workingGroup) return {}
      const payload: Record<string, any> = {}
      // Champs du bloc depuis consolidatedChanges (priorité userModified / selectedValue)
      const { getBlockForField } = require('@/utils/blockFieldMapping')
      workingGroup.consolidatedChanges.forEach(c => {
        if (getBlockForField(c.field) === blockKey) {
          const value = workingGroup.userModifiedChanges[c.field] ?? c.selectedValue
          if (value !== undefined) {
            payload[c.field] = value
          }
        }
      })
      // Races
      if (blockKey === 'races' && workingGroup.userModifiedRaceChanges) {
        payload.races = workingGroup.userModifiedRaceChanges
      }
      return payload
    }

    if (!workingProposal) return {}
    if (blockKey === 'races') {
      return {
        races: workingProposal.races
      }
    }
    // Pour les autres blocs, filtrer les champs du bloc
    const blockFields = getFieldsForBlock(blockKey, workingProposal.changes)
    const payload: Record<string, any> = {}
    blockFields.forEach(field => {
      if (field in workingProposal.changes) {
        payload[field] = workingProposal.changes[field]
      }
    })
    return payload
  }
  
  /**
   * Obtenir les champs d'un bloc
   */
  const getFieldsForBlock = (blockKey: string, changes: Record<string, any>): string[] => {
    // Import dynamique pour éviter la dépendance circulaire
    const { getBlockForField } = require('@/utils/blockFieldMapping')
    
    return Object.keys(changes).filter(field => getBlockForField(field) === blockKey)
  }
  
  /**
   * Obtenir le payload complet pour l'application
   */
  const getPayload = useCallback((): Record<string, any> => {
    if (isGroupMode) {
      if (!workingGroup) return {}
      const base: Record<string, any> = {}
      workingGroup.consolidatedChanges.forEach(c => {
        const value = workingGroup.userModifiedChanges[c.field] ?? c.selectedValue
        if (value !== undefined) base[c.field] = value
      })
      if (workingGroup.userModifiedRaceChanges && Object.keys(workingGroup.userModifiedRaceChanges).length > 0) {
        base.raceEdits = workingGroup.userModifiedRaceChanges
      }
      return base
    }

    if (!workingProposal) return {}
    return {
      ...workingProposal.changes,
      races: workingProposal.races
    }
  }, [isGroupMode, workingGroup, workingProposal])
  
  /**
   * Réinitialiser aux valeurs backend
   */
  const reset = useCallback(() => {
    if (isGroupMode) {
      if (!workingGroup) return
      const working = initializeWorkingGroup(workingGroup.originalProposals)
      setWorkingGroup(working)
    } else {
      if (!workingProposal) return
      const working = initializeWorkingProposal(workingProposal.originalProposal)
      setWorkingProposal(working)
    }
    enqueueSnackbar('Modifications annulées', { variant: 'info' })
  }, [isGroupMode, workingGroup, workingProposal, enqueueSnackbar])
  
  /**
   * Vérifier s'il y a des modifications non sauvegardées
   */
  const hasUnsavedChanges = useCallback(() => {
    if (isGroupMode) return workingGroup?.isDirty || false
    return workingProposal?.isDirty || false
  }, [isGroupMode, workingGroup, workingProposal])
  
  // Charger la proposition au montage
  useEffect(() => {
    loadProposal()
  }, [loadProposal])
  
  // Nettoyer le timer au démontage
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [])
  
  if (isGroupMode) {
    const isBlockValidated = (blockKey: string) => !!workingGroup?.approvedBlocks?.[blockKey]
    const selectOption = (field: string, proposalId: string) => {
      if (!workingGroup) return
      const change = workingGroup.consolidatedChanges.find(c => c.field === field)
      const selected = change?.options.find(o => o.proposalId === proposalId)
      if (selected) updateField(field, selected.proposedValue)
    }

    return {
      workingGroup,
      isLoading,
      isSaving,
      error,
      isDirty: workingGroup?.isDirty || false,
      updateField,
      selectOption,
      updateRace,
      deleteRace,
      addRace,
      validateBlock: (blockKey: string, proposalIds: string[]) => validateBlock(blockKey, proposalIds),
      unvalidateBlock,
      validateAllBlocks: async () => {
        if (!workingGroup) return
        // Valider tous les blocs présents dans consolidatedChanges
        const { getBlockForField } = require('@/utils/blockFieldMapping')
        const blocks = new Set<string>()
        workingGroup.consolidatedChanges.forEach(c => blocks.add(getBlockForField(c.field)))
        await Promise.all(Array.from(blocks).map((b: string) => validateBlock(b)))
      },
      save,
      getPayload,
      reset,
      hasUnsavedChanges,
      isBlockValidated
    }
  }

  return {
    workingProposal,
    isLoading,
    isSaving,
    error,
    updateField,
    updateRace,
    deleteRace,
    addRace,
    validateBlock: (blockKey: string) => validateBlock(blockKey),
    unvalidateBlock,
    save,
    getPayload,
    reset,
    hasUnsavedChanges
  }
}
