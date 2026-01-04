import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { proposalsApi } from '@/services/api'
import { Proposal, RaceData } from '@/types'

/**
 * ✅ FIX 2025-12-13: Priorité des agents pour la consolidation
 * L'ordre de priorité est basé sur la fiabilité de la source de données :
 * - FFA Scraper : Source officielle de la FFA, données très fiables
 * - Slack Event Agent : Données fournies par l'utilisateur, fiables
 * - Autres agents : Priorité par défaut
 * - Google Search Date Agent : Données extraites de pages web, moins fiables
 *
 * @returns Un score de priorité (plus élevé = plus prioritaire)
 */
function getAgentPriority(agentName: string | undefined): number {
  if (!agentName) return 50 // Priorité par défaut

  const name = agentName.toLowerCase()

  // FFA Scraper : Source officielle, priorité maximale
  if (name.includes('ffa')) return 100

  // Slack Event Agent : Données utilisateur, haute priorité
  if (name.includes('slack')) return 90

  // Google Search Date Agent : Données web extraites, priorité basse
  if (name.includes('google')) return 30

  // Autres agents : priorité par défaut
  return 50
}

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
  primaryProposalId: string // ✅ ID de la proposition prioritaire (seule utilisée pour validation/save)
  originalProposals: Proposal[] // ✅ Propositions PENDING uniquement (éditables)
  historicalProposals: Proposal[] // ✅ Propositions déjà traitées (APPROVED/REJECTED/ARCHIVED)

  // État consolidé de toutes les propositions PENDING
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaces: ConsolidatedRaceChange[]

  // Modifications utilisateur (s'appliquent à toutes les propositions du groupe)
  userModifiedChanges: Record<string, any>
  userModifiedRaceChanges: Record<string, any>

  // ✅ FIX 2025-12-10: Mapping raceId → existing-{index} pour la sauvegarde
  // Le backend attend des clés existing-{index} dans raceEdits
  raceIdToIndexMap: Record<string, string> // ex: { "147544": "existing-0", "147546": "existing-1" }

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
    agentType?: string
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
 * Différence de champ entre Working Proposal et Source
 * Utilisé pour le mode two-panes
 */
export interface FieldDiff {
  field: string
  workingValue: any
  sourceValue: any
  isDifferent: boolean
  isAbsentInSource: boolean
  isAbsentInWorking: boolean
}

/**
 * Différence de course entre Working Proposal et Source
 * Utilisé pour le mode two-panes
 */
export interface RaceDiff {
  raceId: string
  raceName: string
  existsInWorking: boolean
  existsInSource: boolean
  workingRaceId?: string   // ID dans working (pour mapping)
  sourceRaceId?: string    // ID dans source
  fieldDiffs: FieldDiff[]  // Différences champ par champ
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
  validateBlock: (blockKey: string) => Promise<void>
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Mode Two-Panes : Gestion des sources et copie
  // ═══════════════════════════════════════════════════════════════════════════

  /** Propositions sources triées par priorité (FFA > Slack > Google) */
  sourceProposals: Proposal[]

  /** Index de la source actuellement affichée dans le pane droit */
  activeSourceIndex: number

  /** Changer la source affichée */
  setActiveSourceIndex: (index: number) => void

  /** Copier un champ depuis la source active vers la working proposal */
  copyFieldFromSource: (field: string) => void

  /**
   * Copier une course depuis la source active
   * @param sourceRaceId - ID de la course dans la source
   * @param targetRaceId - ID de destination (optionnel). Si undefined, ajoute comme nouvelle course
   */
  copyRaceFromSource: (sourceRaceId: string, targetRaceId?: string) => void

  /** Copier TOUTE la proposition source (écrase la working proposal) */
  copyAllFromSource: () => void

  /** Obtenir les différences de champs entre working et source active */
  getFieldDifferences: () => FieldDiff[]

  /** Obtenir les différences de courses entre working et source active */
  getRaceDifferences: () => RaceDiff[]
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

  // ═══════════════════════════════════════════════════════════════════════════
  // États pour mode Two-Panes (groupé uniquement)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Toutes les propositions sources triées par priorité agent */
  const [sourceProposals, setSourceProposals] = useState<Proposal[]>([])

  /** Index de la source affichée dans le pane droit (par défaut: 2ème source pour voir les différences) */
  const [activeSourceIndex, setActiveSourceIndex] = useState<number>(0)

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

        // ═══════════════════════════════════════════════════════════════════
        // Mode Two-Panes: Initialiser les sources
        // ═══════════════════════════════════════════════════════════════════
        // Trier les propositions par priorité agent (FFA > Slack > Google)
        const sortedProposals = [...proposals].sort((a, b) => {
          const priorityA = getAgentPriority((a as any).agentName || (a as any).agent?.name)
          const priorityB = getAgentPriority((b as any).agentName || (b as any).agent?.name)
          return priorityB - priorityA
        })
        setSourceProposals(sortedProposals)

        // Par défaut, afficher la 2ème source (index 1) pour voir les différences
        // Si une seule source, afficher la première (index 0)
        setActiveSourceIndex(sortedProposals.length > 1 ? 1 : 0)
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
   * ✅ REFONTE Two-Panes 2025-12-28: La working proposal = copie de la proposition prioritaire UNIQUEMENT
   * Plus de fusion de toutes les propositions. L'utilisateur peut copier depuis les sources via le pane droit.
   */
  const initializeWorkingGroup = (proposals: Proposal[]): WorkingProposalGroup => {
    // Séparer les propositions en cours (PENDING ou PARTIALLY_APPROVED) des propositions finalisées
    const pendingProposals = proposals.filter(p => p.status === 'PENDING' || p.status === 'PARTIALLY_APPROVED')
    const historicalProposals = proposals.filter(p => p.status !== 'PENDING' && p.status !== 'PARTIALLY_APPROVED')
    const approvedProposals = proposals.filter(p => p.status === 'APPROVED' || p.status === 'PARTIALLY_APPROVED')

    const ids = proposals.map(p => p.id)

    // MODE LECTURE SEULE : Si aucune PENDING mais des APPROVED, afficher en lecture seule
    let proposalsToUse = pendingProposals.length > 0 ? pendingProposals : approvedProposals

    // Trier par PRIORITÉ D'AGENT : FFA > Slack > autres > Google
    proposalsToUse = proposalsToUse.sort((a, b) => {
      const priorityA = getAgentPriority((a as any).agentName || (a as any).agent?.name)
      const priorityB = getAgentPriority((b as any).agentName || (b as any).agent?.name)
      return priorityB - priorityA
    })

    // ═══════════════════════════════════════════════════════════════════════════
    // ✅ REFONTE Two-Panes: Prendre UNIQUEMENT la proposition prioritaire
    // Plus de consolidation/fusion de toutes les propositions
    // ═══════════════════════════════════════════════════════════════════════════
    const primaryProposal = proposalsToUse[0]

    if (!primaryProposal) {
      return {
        ids,
        primaryProposalId: '', // Pas de proposition prioritaire
        originalProposals: pendingProposals,
        historicalProposals,
        consolidatedChanges: [],
        consolidatedRaces: [],
        userModifiedChanges: {},
        userModifiedRaceChanges: {},
        raceIdToIndexMap: {},
        approvedBlocks: {},
        isDirty: false,
        lastSaved: null
      }
    }

    // ✅ Extraire les champs UNIQUEMENT de la proposition prioritaire (pas de fusion)
    const consolidatedChanges = extractChangesFromSingleProposal(primaryProposal)

    // ✅ Extraire les courses UNIQUEMENT de la proposition prioritaire (pas de fusion)
    const { races: consolidatedRaces, raceIdToIndexMap } = extractRacesFromSingleProposal(primaryProposal)

    // Blocs approuvés depuis la proposition prioritaire uniquement
    const approvedBlocks: Record<string, boolean> = { ...primaryProposal.approvedBlocks }

    // Extraire userModifiedChanges depuis la proposition prioritaire
    const savedRaceEdits = primaryProposal?.userModifiedChanges?.raceEdits || {}

    // Convertir les clés existing-{index} en vrais raceId
    const indexToRaceIdMap: Record<string, string> = {}
    Object.entries(raceIdToIndexMap).forEach(([raceId, indexKey]) => {
      indexToRaceIdMap[indexKey] = raceId
    })

    const userModifiedRaceChanges: Record<string, any> = {}
    Object.entries(savedRaceEdits).forEach(([key, value]) => {
      const convertedKey = indexToRaceIdMap[key] || key
      userModifiedRaceChanges[convertedKey] = value
    })

    const userModifiedChanges: Record<string, any> = {}
    if (primaryProposal?.userModifiedChanges) {
      Object.entries(primaryProposal.userModifiedChanges).forEach(([key, value]) => {
        if (key !== 'raceEdits') {
          userModifiedChanges[key] = value
        }
      })
    }

    // Ajouter les courses manuellement ajoutées (new-{timestamp})
    const finalConsolidatedRaces = [...consolidatedRaces]
    Object.entries(userModifiedRaceChanges).forEach(([raceId, raceData]: [string, any]) => {
      if (raceId.startsWith('new-') && !raceData._deleted) {
        const existsInConsolidated = consolidatedRaces.some(r => r.raceId === raceId)
        if (!existsInConsolidated) {
          finalConsolidatedRaces.push({
            raceId,
            raceName: raceData.name || 'Nouvelle course',
            proposalIds: [],
            originalFields: {},
            fields: { ...raceData, id: raceId }
          })
        }
      }
    })

    return {
      ids,
      primaryProposalId: primaryProposal.id, // ✅ Two-Panes: Seule proposition utilisée pour validation/save
      originalProposals: pendingProposals,
      historicalProposals,
      consolidatedChanges,
      consolidatedRaces: finalConsolidatedRaces,
      userModifiedChanges,
      userModifiedRaceChanges,
      raceIdToIndexMap,
      approvedBlocks,
      isDirty: false,
      lastSaved: pendingProposals.length > 0
        ? new Date(Math.max(...pendingProposals.map(p => new Date(p.updatedAt).getTime())))
        : null
    }
  }

  /**
   * ✅ NOUVEAU Two-Panes: Extraire les champs d'UNE SEULE proposition (pas de fusion)
   */
  const extractChangesFromSingleProposal = (proposal: Proposal): ConsolidatedChange[] => {
    const changes: ConsolidatedChange[] = []
    const proposalChanges = proposal.changes || {}
    const userMods = proposal.userModifiedChanges || {}
    const merged = mergeChanges(proposalChanges, userMods)

    // Aplatir la structure edition.new pour NEW_EVENT
    const flattenedMerged: Record<string, any> = {}
    Object.entries(merged).forEach(([key, value]) => {
      if (key === 'edition' && value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value).forEach(([editionField, editionValue]) => {
          if (editionField !== 'races' && editionField !== 'organizer') {
            flattenedMerged[editionField] = editionValue
          }
        })
        if (value.organizer) {
          flattenedMerged['organizer'] = value.organizer
        }
      } else if (!key.startsWith('races') && key !== 'racesToUpdate' && key !== 'racesToAdd' && key !== 'racesExisting') {
        flattenedMerged[key] = value
      }
    })

    Object.entries(flattenedMerged).forEach(([field, value]) => {
      // Extraire currentValue depuis changes[field]
      const originalValue = proposalChanges[field]
      let currentValue: any = undefined
      if (originalValue && typeof originalValue === 'object') {
        if ('old' in originalValue) currentValue = originalValue.old
        else if ('current' in originalValue) currentValue = originalValue.current
      }

      changes.push({
        field,
        options: [{
          proposalId: proposal.id,
          agentName: (proposal as any).agentName || (proposal as any).agent?.name || 'Agent',
          agentType: (proposal as any).agent?.type,
          proposedValue: value,
          confidence: (proposal as any).confidence || 0,
          createdAt: proposal.createdAt as any
        }],
        currentValue,
        selectedValue: value
      })
    })

    return changes
  }

  /**
   * ✅ NOUVEAU Two-Panes: Extraire les courses d'UNE SEULE proposition (pas de fusion)
   */
  const extractRacesFromSingleProposal = (proposal: Proposal): {
    races: ConsolidatedRaceChange[],
    raceIdToIndexMap: Record<string, string>
  } => {
    const races: ConsolidatedRaceChange[] = []
    const raceIdToIndexMap: Record<string, string> = {}

    // Extraire les valeurs ORIGINALES depuis currentData
    const originalRaces = extractRacesOriginalData(proposal)

    // Extraire les valeurs PROPOSÉES
    const merged = mergeChanges(proposal.changes, proposal.userModifiedChanges || {})
    const proposedRaces = extractRaces(merged, proposal, false)

    Object.entries(proposedRaces).forEach(([raceId, raceData]) => {
      // Construire le mapping raceId → existing-{index}
      const originalIndex = (raceData as any)._originalIndex
      if (originalIndex !== undefined && !raceId.startsWith('new-')) {
        raceIdToIndexMap[raceId] = `existing-${originalIndex}`
      }

      races.push({
        raceId,
        raceName: (raceData as any).name || 'Course',
        proposalIds: [proposal.id],
        originalFields: originalRaces[raceId] || {},
        fields: raceData
      })
    })

    return { races, raceIdToIndexMap }
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
          agentType: (p as any).agent?.type,
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
          // ✅ FIX 2025-12-10: Utiliser le vrai raceId pour éviter mélange dans propositions groupées
          // Les propositions du même groupe peuvent avoir des ordres différents dans racesToUpdate
          // Fallback vers existing-{index} si raceId absent (compatibilité)
          const raceId = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`

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
  /**
   * ✅ FIX 2025-12-10: Retourne aussi le mapping raceId → existing-{index}
   * Ce mapping est nécessaire pour convertir les clés lors de la sauvegarde
   * car le backend attend des clés existing-{index} dans raceEdits
   *
   * ✅ FIX 2025-12-13: Respecter la priorité d'agent pour les champs des courses
   * Les propositions sont triées par confiance AVANT d'arriver ici (FFA Scraper en premier).
   * On ne doit PAS écraser les champs déjà définis par un agent plus prioritaire.
   */
  const consolidateRacesFromProposals = (proposals: Proposal[]): {
    races: ConsolidatedRaceChange[],
    raceIdToIndexMap: Record<string, string>
  } => {
    const raceMap = new Map<string, ConsolidatedRaceChange>()
    const raceIdToIndexMap: Record<string, string> = {}

    proposals.forEach(p => {
      // ✅ Extraire les valeurs ORIGINALES depuis currentData ou old values
      const originalRaces = extractRacesOriginalData(p)

      // Extraire les valeurs PROPOSÉES (avec userModifiedChanges)
      const merged = mergeChanges(p.changes, p.userModifiedChanges || {})
      const races = extractRaces(merged, p, false) // false = extractNew

      Object.entries(races).forEach(([raceId, raceData]) => {
        // ✅ FIX 2025-12-10: Construire le mapping raceId → existing-{index}
        // Utiliser _originalIndex stocké dans extractRaces()
        const originalIndex = (raceData as any)._originalIndex
        if (originalIndex !== undefined && !raceId.startsWith('new-')) {
          // Ne pas écraser si déjà mappé (prendre le premier)
          if (!raceIdToIndexMap[raceId]) {
            raceIdToIndexMap[raceId] = `existing-${originalIndex}`
          }
        }

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

        // ✅ FIX 2025-12-13: NE PAS écraser les champs déjà définis par un agent plus prioritaire
        // Les propositions sont triées par confiance, donc le premier agent (FFA) a la priorité
        // On fusionne en gardant les valeurs existantes (agent prioritaire) si déjà définies
        Object.entries(raceData).forEach(([field, value]) => {
          // Ignorer les champs internes (_originalIndex, etc.)
          if (field.startsWith('_')) return

          // ✅ NE PAS écraser si le champ existe déjà (agent plus prioritaire l'a défini)
          if (!(field in entry.fields)) {
            entry.fields[field] = value
          }
        })
      })
    })

    return {
      races: Array.from(raceMap.values()),
      raceIdToIndexMap
    }
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
          // ✅ FIX 2025-12-10: Utiliser le vrai raceId pour éviter mélange dans propositions groupées
          // Les propositions du même groupe peuvent avoir des ordres différents dans racesToUpdate
          // Fallback vers existing-{index} si raceId absent (compatibilité)
          const raceId = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`
          // ✅ NOUVEAU: Ne mettre dans raceData QUE les champs qui ont des updates
          // Les autres champs (currentData) seront dans originalFields
          const raceData: any = {
            id: raceId,
            name: raceUpdate.raceName || 'Course',
            // ✅ Stocker l'index original pour le mapping vers userModifiedChanges
            _originalIndex: index
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
        // ✅ Two-Panes: Sauvegarder UNIQUEMENT sur la proposition prioritaire
        const currentWorkingGroup = workingGroupRef.current
        if (!currentWorkingGroup) return
        const primaryId = currentWorkingGroup.primaryProposalId
        if (!primaryId) return
        const diff = buildGroupDiff(currentWorkingGroup)
        await proposalsApi.updateUserModifications(primaryId, diff)
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
   * Si value === undefined, supprime l'entrée de userModifiedChanges (réinitialisation)
   */
  const updateField = useCallback((field: string, value: any) => {
    if (isGroupMode) {
      setWorkingGroup(prev => {
        if (!prev) return prev
        const next = { ...prev }

        // Si value === undefined, supprimer l'entrée (réinitialisation)
        if (value === undefined) {
          const { [field]: _, ...rest } = next.userModifiedChanges
          next.userModifiedChanges = rest
          // Réinitialiser la valeur sélectionnée à la valeur proposée par défaut
          const idx = next.consolidatedChanges.findIndex(c => c.field === field)
          if (idx >= 0) {
            const originalValue = next.consolidatedChanges[idx].options[0]?.proposedValue
            next.consolidatedChanges[idx] = { ...next.consolidatedChanges[idx], selectedValue: originalValue }
          }
        } else {
          // Mettre à jour la sélection utilisateur au niveau groupe
          next.userModifiedChanges = { ...next.userModifiedChanges, [field]: value }
          // Mettre à jour la valeur sélectionnée si le champ est consolidé
          const idx = next.consolidatedChanges.findIndex(c => c.field === field)
          if (idx >= 0) {
            next.consolidatedChanges[idx] = { ...next.consolidatedChanges[idx], selectedValue: value }
          }
        }
        next.isDirty = true
        return next
      })
    } else {
      setWorkingProposal(prev => {
        if (!prev) return prev

        // Si value === undefined, supprimer l'entrée (réinitialisation)
        if (value === undefined) {
          const { [field]: _, ...rest } = prev.userModifiedChanges
          return {
            ...prev,
            userModifiedChanges: rest,
            isDirty: true
          }
        }

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
   * Si value === undefined, supprime l'entrée du champ (réinitialisation)
   */
  const updateRace = useCallback((raceId: string, field: string, value: any) => {
    if (isGroupMode) {
      setWorkingGroup(prev => {
        if (!prev) return prev
        const next = { ...prev }
        const current = next.userModifiedRaceChanges[raceId] || {}

        // Si value === undefined, supprimer l'entrée du champ (réinitialisation)
        if (value === undefined) {
          const { [field]: _, ...restFields } = current
          // Si plus de champs modifiés pour cette course, supprimer l'entrée de la course
          if (Object.keys(restFields).length === 0) {
            const { [raceId]: __, ...restRaces } = next.userModifiedRaceChanges
            next.userModifiedRaceChanges = restRaces
          } else {
            next.userModifiedRaceChanges = { ...next.userModifiedRaceChanges, [raceId]: restFields }
          }
        } else {
          next.userModifiedRaceChanges = { ...next.userModifiedRaceChanges, [raceId]: { ...current, [field]: value } }
        }
        next.isDirty = true
        return next
      })
    } else {
      setWorkingProposal(prev => {
        if (!prev) return prev

        const current = prev.userModifiedRaceChanges[raceId] || {}

        // Si value === undefined, supprimer l'entrée du champ (réinitialisation)
        if (value === undefined) {
          const { [field]: _, ...restFields } = current
          // Si plus de champs modifiés pour cette course, supprimer l'entrée de la course
          if (Object.keys(restFields).length === 0) {
            const { [raceId]: __, ...restRaces } = prev.userModifiedRaceChanges
            return {
              ...prev,
              userModifiedRaceChanges: restRaces,
              isDirty: true
            }
          }
          return {
            ...prev,
            userModifiedRaceChanges: {
              ...prev.userModifiedRaceChanges,
              [raceId]: restFields
            },
            isDirty: true
          }
        }

        // ✅ Aligné sur mode groupé : mettre à jour userModifiedRaceChanges, pas races
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

        // 1. Ajouter à userModifiedRaceChanges (pour le diff/save)
        next.userModifiedRaceChanges = {
          ...next.userModifiedRaceChanges,
          [tempId]: { ...race, id: tempId }
        }

        // 2. Ajouter à consolidatedRaces (pour l'affichage dans RacesChangesTable)
        next.consolidatedRaces = [
          ...next.consolidatedRaces,
          {
            raceId: tempId,
            raceName: race.name || 'Nouvelle course',
            proposalIds: [],  // Pas de proposition source (course manuelle)
            originalFields: {},  // Pas de valeur originale (nouvelle course)
            fields: { ...race, id: tempId }  // Les champs saisis par l'utilisateur
          }
        ]

        next.isDirty = true
        return next
      })
    } else {
      setWorkingProposal(prev => {
        if (!prev) return prev

        // Générer un ID temporaire
        const tempId = `new-${Date.now()}`

        // 1. Ajouter à userModifiedRaceChanges (pour le diff/save)
        const nextUserModifiedRaceChanges = {
          ...prev.userModifiedRaceChanges,
          [tempId]: { ...race, id: tempId }
        }

        // 2. Ajouter à races (pour l'affichage)
        const nextRaces = {
          ...prev.races,
          [tempId]: { ...race, id: tempId }
        }

        return {
          ...prev,
          userModifiedRaceChanges: nextUserModifiedRaceChanges,
          races: nextRaces,
          isDirty: true
        }
      })
    }

    if (autosave) {
      scheduleAutosave()
    }
  }, [autosave, scheduleAutosave])

  // ═══════════════════════════════════════════════════════════════════════════
  // Mode Two-Panes : Fonctions de copie depuis les sources
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extraire la valeur d'un champ depuis une proposition source
   * Gère les différents formats de données (NEW_EVENT, EDITION_UPDATE, etc.)
   */
  const extractFieldValueFromProposal = useCallback((proposal: Proposal, field: string): any => {
    const changes = proposal.changes || {}
    const userMods = proposal.userModifiedChanges || {}

    // 1. Vérifier d'abord dans userModifiedChanges
    if (field in userMods) {
      return userMods[field]
    }

    // 2. Chercher dans changes avec extraction de la valeur "new"
    if (field in changes) {
      return extractNewValue(changes[field])
    }

    // 3. Chercher dans edition.new pour NEW_EVENT
    if (changes.edition) {
      const editionData = extractNewValue(changes.edition)
      if (editionData && typeof editionData === 'object' && field in editionData) {
        return editionData[field]
      }
    }

    return undefined
  }, [])

  /**
   * Extraire les courses depuis une proposition source
   */
  const extractRacesFromProposal = useCallback((proposal: Proposal): Record<string, RaceData> => {
    const changes = proposal.changes || {}
    const userMods = proposal.userModifiedChanges || {}
    const merged = mergeChanges(changes, userMods)
    return extractRaces(merged, proposal, false)
  }, [])

  /**
   * Copier un champ depuis la source active vers la working proposal
   */
  const copyFieldFromSource = useCallback((field: string) => {
    console.log('🔄 copyFieldFromSource called:', { field, isGroupMode, sourceProposalsLength: sourceProposals.length, activeSourceIndex })
    
    if (!isGroupMode || sourceProposals.length === 0) {
      console.log('❌ copyFieldFromSource: early return (not group mode or no sources)')
      return
    }

    const sourceProposal = sourceProposals[activeSourceIndex]
    if (!sourceProposal) {
      console.log('❌ copyFieldFromSource: no source proposal at index', activeSourceIndex)
      return
    }

    const value = extractFieldValueFromProposal(sourceProposal, field)
    console.log('📋 copyFieldFromSource: extracted value =', value, 'for field', field)
    
    if (value !== undefined) {
      console.log('✅ copyFieldFromSource: calling updateField with', field, value)
      updateField(field, value)
    } else {
      console.log('⚠️ copyFieldFromSource: value is undefined, not updating')
    }
  }, [isGroupMode, sourceProposals, activeSourceIndex, extractFieldValueFromProposal, updateField])

  /**
   * Copier une course depuis la source active
   * @param sourceRaceId - ID de la course dans la source
   * @param targetRaceId - ID de destination (optionnel). Si undefined, ajoute comme nouvelle course
   */
  const copyRaceFromSource = useCallback((sourceRaceId: string, targetRaceId?: string) => {
    if (!isGroupMode || sourceProposals.length === 0) return

    const sourceProposal = sourceProposals[activeSourceIndex]
    if (!sourceProposal) return

    const sourceRaces = extractRacesFromProposal(sourceProposal)
    const sourceRace = sourceRaces[sourceRaceId]
    if (!sourceRace) return

    if (targetRaceId) {
      // Remplacer une course existante : copier UNIQUEMENT les champs qui diffèrent
      setWorkingGroup(prev => {
        if (!prev) return prev

        // Trouver la course cible dans consolidatedRaces pour comparer
        const targetRace = prev.consolidatedRaces.find(r => r.raceId === targetRaceId)
        
        // Champs à ignorer (métadonnées)
        const ignoredFields = ['id', '_originalIndex', 'raceId', 'proposalIds']
        
        // Extraire uniquement les champs qui diffèrent
        const diffFields: Record<string, any> = {}
        
        Object.entries(sourceRace).forEach(([field, sourceValue]) => {
          if (ignoredFields.includes(field)) return
          
          // Récupérer la valeur actuelle dans la working race
          let workingValue: any = undefined
          
          // Chercher dans userModifiedRaceChanges d'abord
          if (prev.userModifiedRaceChanges[targetRaceId]?.[field] !== undefined) {
            workingValue = prev.userModifiedRaceChanges[targetRaceId][field]
          } else if (targetRace) {
            // Sinon dans consolidatedRaces.fields
            const fieldData = targetRace.fields[field]
            if (fieldData && typeof fieldData === 'object' && 'options' in fieldData) {
              workingValue = fieldData.options[0]?.proposedValue
            } else {
              workingValue = fieldData
            }
          }
          
          // Comparer les valeurs (en tenant compte des dates)
          const sourceStr = JSON.stringify(sourceValue)
          const workingStr = JSON.stringify(workingValue)
          
          if (sourceStr !== workingStr) {
            diffFields[field] = sourceValue
          }
        })
        
        // Si aucune différence, ne rien faire
        if (Object.keys(diffFields).length === 0) {
          console.log('📋 [copyRaceFromSource] Aucune différence à copier')
          return prev
        }
        
        console.log('📋 [copyRaceFromSource] Copie des champs différents:', Object.keys(diffFields))

        const next = { ...prev }
        next.userModifiedRaceChanges = {
          ...next.userModifiedRaceChanges,
          [targetRaceId]: {
            ...(next.userModifiedRaceChanges[targetRaceId] || {}),
            ...diffFields
          }
        }
        next.isDirty = true
        return next
      })

      if (autosave) {
        scheduleAutosave()
      }
    } else {
      // Ajouter comme nouvelle course
      addRace(sourceRace)
    }
  }, [isGroupMode, sourceProposals, activeSourceIndex, extractRacesFromProposal, addRace, autosave, scheduleAutosave])

  /**
   * Copier TOUTE la proposition source vers la working proposal
   * Ne copie que les champs qui diffèrent (pas de reset complet)
   */
  const copyAllFromSource = useCallback(() => {
    if (!isGroupMode || sourceProposals.length === 0) return

    const sourceProposal = sourceProposals[activeSourceIndex]
    if (!sourceProposal) return

    setWorkingGroup(prev => {
      if (!prev) return prev

      const newUserModifiedChanges = { ...prev.userModifiedChanges }
      const newUserModifiedRaceChanges = { ...prev.userModifiedRaceChanges }

      // ═══════════════════════════════════════════════════════════════════
      // 1. Copier les champs (Event/Edition) qui diffèrent
      // ═══════════════════════════════════════════════════════════════════
      const sourceChanges = sourceProposal.changes || {}
      const sourceUserMods = sourceProposal.userModifiedChanges || {}
      const mergedSource = mergeChanges(sourceChanges, sourceUserMods)

      // Aplatir la structure pour NEW_EVENT
      const flattenedSource: Record<string, any> = {}
      Object.entries(mergedSource).forEach(([key, value]) => {
        if (key === 'edition' && value && typeof value === 'object' && !Array.isArray(value)) {
          Object.entries(value).forEach(([editionField, editionValue]) => {
            if (editionField !== 'races' && editionField !== 'organizer') {
              flattenedSource[editionField] = editionValue
            }
          })
          if (value.organizer) {
            flattenedSource['organizer'] = value.organizer
          }
        } else if (key !== 'races' && key !== 'racesToUpdate' && key !== 'racesToAdd' && key !== 'racesExisting') {
          flattenedSource[key] = value
        }
      })

      // Pour chaque champ de la source, comparer avec working et copier si différent
      Object.entries(flattenedSource).forEach(([field, sourceValue]) => {
        if (sourceValue === undefined) return

        // Valeur dans working
        const workingChange = prev.consolidatedChanges.find(c => c.field === field)
        const workingValue = prev.userModifiedChanges[field]
          ?? workingChange?.selectedValue
          ?? workingChange?.options[0]?.proposedValue

        // Comparer
        if (JSON.stringify(workingValue) !== JSON.stringify(sourceValue)) {
          newUserModifiedChanges[field] = sourceValue
        }
      })

      // ═══════════════════════════════════════════════════════════════════
      // 2. Copier les courses qui diffèrent
      // ═══════════════════════════════════════════════════════════════════
      const sourceRaces = extractRacesFromProposal(sourceProposal)
      const ignoredFields = ['id', '_originalIndex', '_isNew', '_deleted', '_copiedFromSource']

      // Map des courses working par nom pour matching
      const workingRacesByName = new Map<string, ConsolidatedRaceChange>()
      prev.consolidatedRaces.forEach(r => {
        const name = (r.raceName || '').toLowerCase().trim()
        if (name) workingRacesByName.set(name, r)
      })

      const processedWorkingRaces = new Set<string>()

      // Pour chaque course source
      Object.entries(sourceRaces).forEach(([sourceRaceId, sourceRaceData]) => {
        // Chercher la course correspondante dans working (par ID ou par nom)
        let workingRace = prev.consolidatedRaces.find(r => r.raceId === sourceRaceId)
        if (!workingRace) {
          const sourceName = (sourceRaceData.name || '').toLowerCase().trim()
          workingRace = workingRacesByName.get(sourceName)
        }

        if (workingRace && !processedWorkingRaces.has(workingRace.raceId)) {
          processedWorkingRaces.add(workingRace.raceId)

          // Course existante - ne copier que les champs différents
          const diffFields: Record<string, any> = {}
          Object.entries(sourceRaceData).forEach(([field, sourceVal]) => {
            if (ignoredFields.includes(field)) return
            if (sourceVal === undefined) return

            const workingVal = prev.userModifiedRaceChanges[workingRace!.raceId]?.[field]
              ?? workingRace!.fields[field]

            if (JSON.stringify(workingVal) !== JSON.stringify(sourceVal)) {
              diffFields[field] = sourceVal
            }
          })

          if (Object.keys(diffFields).length > 0) {
            newUserModifiedRaceChanges[workingRace.raceId] = {
              ...(prev.userModifiedRaceChanges[workingRace.raceId] || {}),
              ...diffFields
            }
          }
        } else if (!workingRace) {
          // Nouvelle course à ajouter depuis la source
          const newRaceId = `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          newUserModifiedRaceChanges[newRaceId] = {
            ...sourceRaceData,
            _isNew: true,
            _copiedFromSource: sourceRaceId
          }
        }
      })

      return {
        ...prev,
        userModifiedChanges: newUserModifiedChanges,
        userModifiedRaceChanges: newUserModifiedRaceChanges,
        isDirty: true
      }
    })

    if (autosave) {
      scheduleAutosave()
    }
  }, [isGroupMode, sourceProposals, activeSourceIndex, extractRacesFromProposal, autosave, scheduleAutosave])

  /**
   * Obtenir les différences de champs entre working et source active
   */
  const getFieldDifferences = useCallback((): FieldDiff[] => {
    if (!isGroupMode || !workingGroup || sourceProposals.length === 0) return []

    const sourceProposal = sourceProposals[activeSourceIndex]
    if (!sourceProposal) return []

    const diffs: FieldDiff[] = []
    const allFields = new Set<string>()

    // Collecter tous les champs de la working proposal
    workingGroup.consolidatedChanges.forEach(c => allFields.add(c.field))

    // Collecter tous les champs de la source
    const sourceChanges = sourceProposal.changes || {}
    const sourceUserMods = sourceProposal.userModifiedChanges || {}
    const merged = mergeChanges(sourceChanges, sourceUserMods)

    // Aplatir pour NEW_EVENT
    Object.entries(merged).forEach(([key, value]) => {
      if (key === 'edition' && value && typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value).forEach(([editionField]) => {
          if (editionField !== 'races' && editionField !== 'organizer') {
            allFields.add(editionField)
          }
        })
      } else {
        allFields.add(key)
      }
    })

    // Comparer chaque champ
    allFields.forEach(field => {
      // Valeur dans working
      const workingChange = workingGroup.consolidatedChanges.find(c => c.field === field)
      const workingValue = workingGroup.userModifiedChanges[field]
        ?? workingChange?.selectedValue
        ?? workingChange?.options[0]?.proposedValue

      // Valeur dans source
      const sourceValue = extractFieldValueFromProposal(sourceProposal, field)

      const isAbsentInWorking = workingValue === undefined
      const isAbsentInSource = sourceValue === undefined

      // Comparaison profonde pour les objets
      const isDifferent = !isAbsentInWorking && !isAbsentInSource &&
        JSON.stringify(workingValue) !== JSON.stringify(sourceValue)

      diffs.push({
        field,
        workingValue,
        sourceValue,
        isDifferent,
        isAbsentInSource,
        isAbsentInWorking
      })
    })

    return diffs
  }, [isGroupMode, workingGroup, sourceProposals, activeSourceIndex, extractFieldValueFromProposal])

  /**
   * Obtenir les différences de courses entre working et source active
   */
  const getRaceDifferences = useCallback((): RaceDiff[] => {
    if (!isGroupMode || !workingGroup || sourceProposals.length === 0) return []

    const sourceProposal = sourceProposals[activeSourceIndex]
    if (!sourceProposal) return []

    const diffs: RaceDiff[] = []
    const sourceRaces = extractRacesFromProposal(sourceProposal)

    // Map des courses par nom pour matching approximatif
    const workingRacesByName = new Map<string, ConsolidatedRaceChange>()
    workingGroup.consolidatedRaces.forEach(r => {
      const name = (r.raceName || '').toLowerCase().trim()
      if (name) workingRacesByName.set(name, r)
    })

    const sourceRacesByName = new Map<string, { raceId: string; raceData: RaceData }>()
    Object.entries(sourceRaces).forEach(([raceId, raceData]) => {
      const name = (raceData.name || '').toLowerCase().trim()
      if (name) sourceRacesByName.set(name, { raceId, raceData })
    })

    const processedWorkingRaces = new Set<string>()
    const processedSourceRaces = new Set<string>()

    // 1. Matcher par ID exact
    workingGroup.consolidatedRaces.forEach(workingRace => {
      const sourceRace = sourceRaces[workingRace.raceId]
      if (sourceRace) {
        processedWorkingRaces.add(workingRace.raceId)
        processedSourceRaces.add(workingRace.raceId)

        // Comparer les champs
        const fieldDiffs: FieldDiff[] = []
        const allFields = new Set([...Object.keys(workingRace.fields), ...Object.keys(sourceRace)])

        allFields.forEach(field => {
          if (field === 'id' || field.startsWith('_')) return

          const workingVal = workingGroup.userModifiedRaceChanges[workingRace.raceId]?.[field]
            ?? workingRace.fields[field]
          const sourceVal = (sourceRace as any)[field]

          fieldDiffs.push({
            field,
            workingValue: workingVal,
            sourceValue: sourceVal,
            isDifferent: JSON.stringify(workingVal) !== JSON.stringify(sourceVal),
            isAbsentInSource: sourceVal === undefined,
            isAbsentInWorking: workingVal === undefined
          })
        })

        diffs.push({
          raceId: workingRace.raceId,
          raceName: workingRace.raceName,
          existsInWorking: true,
          existsInSource: true,
          workingRaceId: workingRace.raceId,
          sourceRaceId: workingRace.raceId,
          fieldDiffs
        })
      }
    })

    // 2. Matcher par nom pour les courses non matchées
    workingGroup.consolidatedRaces.forEach(workingRace => {
      if (processedWorkingRaces.has(workingRace.raceId)) return

      const workingName = (workingRace.raceName || '').toLowerCase().trim()
      const sourceMatch = sourceRacesByName.get(workingName)

      if (sourceMatch && !processedSourceRaces.has(sourceMatch.raceId)) {
        processedWorkingRaces.add(workingRace.raceId)
        processedSourceRaces.add(sourceMatch.raceId)

        const fieldDiffs: FieldDiff[] = []
        const allFields = new Set([...Object.keys(workingRace.fields), ...Object.keys(sourceMatch.raceData)])

        allFields.forEach(field => {
          if (field === 'id' || field.startsWith('_')) return

          const workingVal = workingGroup.userModifiedRaceChanges[workingRace.raceId]?.[field]
            ?? workingRace.fields[field]
          const sourceVal = (sourceMatch.raceData as any)[field]

          fieldDiffs.push({
            field,
            workingValue: workingVal,
            sourceValue: sourceVal,
            isDifferent: JSON.stringify(workingVal) !== JSON.stringify(sourceVal),
            isAbsentInSource: sourceVal === undefined,
            isAbsentInWorking: workingVal === undefined
          })
        })

        diffs.push({
          raceId: workingRace.raceId,
          raceName: workingRace.raceName,
          existsInWorking: true,
          existsInSource: true,
          workingRaceId: workingRace.raceId,
          sourceRaceId: sourceMatch.raceId,
          fieldDiffs
        })
      }
    })

    // 3. Courses uniquement dans working (pas dans source)
    workingGroup.consolidatedRaces.forEach(workingRace => {
      if (processedWorkingRaces.has(workingRace.raceId)) return

      diffs.push({
        raceId: workingRace.raceId,
        raceName: workingRace.raceName,
        existsInWorking: true,
        existsInSource: false,
        workingRaceId: workingRace.raceId,
        fieldDiffs: []
      })
    })

    // 4. Courses uniquement dans source (pas dans working)
    Object.entries(sourceRaces).forEach(([raceId, raceData]) => {
      if (processedSourceRaces.has(raceId)) return

      diffs.push({
        raceId,
        raceName: raceData.name || 'Course',
        existsInWorking: false,
        existsInSource: true,
        sourceRaceId: raceId,
        fieldDiffs: []
      })
    })

    return diffs
  }, [isGroupMode, workingGroup, sourceProposals, activeSourceIndex, extractRacesFromProposal])

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
        // ✅ FIX 2025-12-10: Convertir le vrai raceId en existing-{index} pour le backend
        // Le backend attend des clés existing-{index} dans raceEdits
        const saveKey = working.raceIdToIndexMap?.[raceId] || raceId

        if (changes._deleted) {
          // Course marquée pour suppression
          const numericId = parseInt(raceId)
          if (!isNaN(numericId)) {
            // ID numérique = course existante à supprimer
            racesToDelete.push(numericId)
          }
          // ✅ FIX: Aussi ajouter dans raceEdits avec _deleted pour le backend
          raceEdits[saveKey] = changes
        } else {
          // Course avec modifications (pas supprimée)
          raceEdits[saveKey] = changes
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
  const validateBlock = useCallback(async (blockKey: string) => {
    try {
      // Sauvegarder d'abord les modifications locales
      await save()

      if (isGroupMode) {
        if (!workingGroup) return
        // ✅ Two-Panes: Utiliser UNIQUEMENT la proposition prioritaire pour éviter fusion backend
        const primaryId = workingGroup.primaryProposalId
        if (!primaryId) {
          enqueueSnackbar('Aucune proposition prioritaire trouvée', { variant: 'error' })
          return
        }
        const payload = getPayloadForBlock(blockKey)
        await proposalsApi.validateBlock(primaryId, blockKey, payload)
        setWorkingGroup(prev => {
          if (!prev) return prev
          return {
            ...prev,
            approvedBlocks: { ...prev.approvedBlocks, [blockKey]: true }
          }
        })
        enqueueSnackbar(`Bloc "${blockKey}" validé`, { variant: 'success' })
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
    try {
      if (isGroupMode) {
        if (!workingGroup) return

        // ✅ Two-Panes: Utiliser UNIQUEMENT la proposition prioritaire
        const primaryId = workingGroup.primaryProposalId
        if (!primaryId) {
          enqueueSnackbar('Aucune proposition prioritaire trouvée', { variant: 'error' })
          return
        }

        await proposalsApi.unvalidateBlock(primaryId, blockKey)

        setWorkingGroup(prev => {
          if (!prev) return prev

          const newApprovedBlocks = { ...prev.approvedBlocks }
          delete newApprovedBlocks[blockKey]

          return {
            ...prev,
            approvedBlocks: newApprovedBlocks
          }
        })

        enqueueSnackbar(`Bloc "${blockKey}" dévalidé`, { variant: 'success' })
      } else {
        if (!workingProposal) return

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
      }
    } catch (err) {
      enqueueSnackbar('Erreur lors de la dévalidation du bloc', { variant: 'error' })
      throw err
    }
  }, [isGroupMode, workingGroup, workingProposal, queryClient, enqueueSnackbar])

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
      // Races - ✅ FIX 2025-12-10: Convertir les clés raceId en existing-{index}
      if (blockKey === 'races' && workingGroup.userModifiedRaceChanges) {
        const convertedRaces: Record<string, any> = {}
        Object.entries(workingGroup.userModifiedRaceChanges).forEach(([raceId, changes]) => {
          const saveKey = workingGroup.raceIdToIndexMap?.[raceId] || raceId
          convertedRaces[saveKey] = changes
        })
        payload.races = convertedRaces
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
      // ✅ FIX 2025-12-10: Convertir les clés raceId en existing-{index}
      if (workingGroup.userModifiedRaceChanges && Object.keys(workingGroup.userModifiedRaceChanges).length > 0) {
        const convertedRaceEdits: Record<string, any> = {}
        Object.entries(workingGroup.userModifiedRaceChanges).forEach(([raceId, changes]) => {
          const saveKey = workingGroup.raceIdToIndexMap?.[raceId] || raceId
          convertedRaceEdits[saveKey] = changes
        })
        base.raceEdits = convertedRaceEdits
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
      validateBlock: (blockKey: string) => validateBlock(blockKey),
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
      isBlockValidated,

      // ═══════════════════════════════════════════════════════════════════════
      // Mode Two-Panes : Gestion des sources et copie
      // ═══════════════════════════════════════════════════════════════════════
      sourceProposals,
      activeSourceIndex,
      setActiveSourceIndex,
      copyFieldFromSource,
      copyRaceFromSource,
      copyAllFromSource,
      getFieldDifferences,
      getRaceDifferences
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
