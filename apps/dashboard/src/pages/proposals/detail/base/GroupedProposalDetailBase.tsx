import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  Box,
  LinearProgress,
  Alert,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Button,
  Typography
} from '@mui/material'
import { Warning as WarningIcon } from '@mui/icons-material'
import ConfirmDatePropagationModal from '@/components/proposals/modals/ConfirmDatePropagationModal'
import ConfirmEditionDateUpdateModal from '@/components/proposals/modals/ConfirmEditionDateUpdateModal'
import ProposalHeader from '@/components/proposals/ProposalHeader'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'
import EditionProtectionBanner from '@/components/proposals/EditionProtectionBanner'
import { useProposalLogic } from '@/hooks/useProposalLogic'
import { useProposalEditor, ConsolidatedRaceChange, isGroupReturn } from '@/hooks/useProposalEditor'
import { useBlockValidation } from '@/hooks/useBlockValidation'
import { BlockType } from '@data-agents/types'
import {
  useProposals,
  useUpdateProposal,
  useBulkArchiveProposals,
  useUnapproveProposal,
  useProposalGroup,
  useUpdates,
  useReviveEvent
} from '@/hooks/useApi'
import type { Proposal } from '@/types'
import { isFieldInBlock, getBlockForField } from '@/utils/blockFieldMapping'
import { proposalsApi } from '@/services/api'

function useEditionProtection(editionId: string | undefined | null) {
  return useQuery({
    queryKey: ['edition-protection', editionId],
    queryFn: () => proposalsApi.getEditionProtection(parseInt(editionId!)),
    enabled: !!editionId && !isNaN(parseInt(editionId)),
    staleTime: 60_000,
  })
}

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
}

export interface ProposalContext {
  proposal: Proposal
  selectedChanges: Record<string, any>
  userModifiedChanges: Record<string, any>
  handleFieldSelect: (fieldName: string, value: any) => void
  handleFieldModify: (fieldName: string, newValue: any, reason?: string) => void
  handleApproveField: (fieldName: string) => Promise<void>
  handleApproveAll: () => Promise<void>
  handleRejectAll: () => Promise<void>
  formatValue: (value: any, isSimple?: boolean, timezone?: string) => React.ReactNode
  formatAgentsList: (agents: Array<{agentName: string, confidence: number}>) => string
  isLoading: boolean
  isPending: boolean
  isEventDead: boolean
}

export interface GroupedProposalContext extends Omit<ProposalContext, 'proposal'> {
  groupProposals: Proposal[] // ✅ Propositions PENDING uniquement (éditables)
  allGroupProposals: Proposal[] // ✅ Toutes les propositions (PENDING + historiques)
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaceChanges: ConsolidatedRaceChange[]
  averageConfidence: number
  allPending: boolean
  hasApproved: boolean
  allApproved: boolean
  isAllApproved: boolean // ✅ Mode lecture seule (toutes APPROVED)
  editionTimezone: string
  isNewEvent: boolean
  isFeatured?: boolean // ✅ Indicateur si l'événement est mis en avant
  getEventTitle: (proposal: any, isNewEvent: boolean) => string
  getEditionYear: (proposal: any) => string | undefined
  handleEditionStartDateChange: (fieldName: string, newValue: any) => void
  // Actions spécifiques aux courses
  handleApproveRace: (raceData: any) => Promise<void>
  handleApproveAllRaces: () => Promise<void>
  handleRejectAllRaces: () => Promise<void>
  handleRaceFieldModify: (raceId: string, fieldName: string, newValue: any) => void
  handleDeleteRace: (raceId: string) => void
  handleAddRace: (race: any) => void
  userModifiedRaceChanges: Record<string, Record<string, any>>
  // Actions événement mort
  handleKillEvent: () => Promise<void>
  handleReviveEvent: () => Promise<void>
  // État UI
  killDialogOpen: boolean
  setKillDialogOpen: (open: boolean) => void
  isEditionCanceled: boolean
  // Validation par blocs
  // ✅ proposalIds optionnel car les vues simples n'ont pas besoin de le passer
  validateBlock: (blockKey: string, proposalIds?: string[]) => Promise<void>
  validateBlockWithDependencies: (blockKey: string) => Promise<void>  // ✅ Nouveau
  unvalidateBlock: (blockKey: string) => Promise<void>
  validateAllBlocks: () => Promise<void>
  isBlockValidated: (blockKey: string) => boolean
  isBlockApplied: (blockKey: string) => boolean  // ✅ Nouveau : vérifie si le bloc est déjà appliqué en base
  isBlockPending: boolean
  blockProposals: Record<string, string[]>
  // Archivage individuel d'une sous-proposition
  handleArchiveSingleProposal: (proposalId: string) => Promise<void>
  isArchiving: boolean
  // ✅ Two-Panes: Fonctions de copie depuis les sources
  sourceProposals: Proposal[]
  activeSourceIndex: number
  setActiveSourceIndex: (index: number) => void
  copyFieldFromSource: (field: string) => void
  copyRaceFromSource: (sourceRaceId: string, targetRaceId?: string) => void
  copyAllFromSource: () => void
  getFieldDifferences: () => import('@/hooks/useProposalEditor').FieldDiff[]
  getRaceDifferences: () => import('@/hooks/useProposalEditor').RaceDiff[]
}

export interface GroupedProposalDetailBaseProps {
  groupKey: string
  renderMainContent: (context: GroupedProposalContext) => React.ReactNode
  renderSidebar?: (context: GroupedProposalContext) => React.ReactNode
  customHeaderProps?: Partial<React.ComponentProps<typeof ProposalHeader>>
  hideNavigation?: boolean
}

const GroupedProposalDetailBase: React.FC<GroupedProposalDetailBaseProps> = ({
  groupKey,
  renderMainContent,
  renderSidebar,
  customHeaderProps,
  hideNavigation = false
}) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [killDialogOpen, setKillDialogOpen] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [isKilledLocally, setIsKilledLocally] = useState(false)
  const [featuredEventConfirmOpen, setFeaturedEventConfirmOpen] = useState(false)

  // ✅ PHASE 2 STEP 6: Suppression des anciens états locaux (remplacés par workingGroup)

  // États pour les modales de synchronisation de dates
  const [datePropagationModal, setDatePropagationModal] = useState<{
    open: boolean
    newStartDate: string
  } | null>(null)
  const [editionDateUpdateModal, setEditionDateUpdateModal] = useState<{
    open: boolean
    dateType: 'startDate' | 'endDate'
    currentEditionDate: string
    newRaceDate: string
    raceName: string
    raceId: string  // ✅ Fix: utiliser raceId au lieu de raceIndex
  } | null>(null)

  // ✅ Flag pour désactiver la cascade automatique lors de la mise à jour de date d'édition depuis une course
  // Quand on modifie une course qui sort des bornes de l'édition et qu'on accepte d'ajuster l'édition,
  // on ne veut PAS que toutes les autres courses soient affectées
  const [skipDateCascade, setSkipDateCascade] = useState(false)

  // ✅ Stocker eventId/editionId pour qu'ils restent disponibles même après le kill
  // (quand les propositions passent en REJECTED et sont filtrées par l'API)
  const [savedEventId, setSavedEventId] = useState<string | null>(null)
  const [savedEditionId, setSavedEditionId] = useState<string | null>(null)

  // Hooks API (DOIT être déclaré AVANT proposalIds qui l'utilise)
  const { data: groupProposalsData, isLoading, refetch: refetchGroup } = useProposalGroup(groupKey || '')
  const { data: allProposalsData } = useProposals({}, 100)
  const updateProposalMutation = useUpdateProposal()
  const bulkArchiveMutation = useBulkArchiveProposals()
  const unapproveProposalMutation = useUnapproveProposal()
  const reviveEventMutation = useReviveEvent()

  // 🚀 PHASE 2: Initialisation du hook useProposalEditor pour le mode groupé
  const proposalIds = useMemo(() => {
    if (!groupProposalsData?.data || !groupKey) return []
    const proposals = groupProposalsData.data.sort((a, b) => {
      const confidenceA = a.confidence || 0
      const confidenceB = b.confidence || 0
      return confidenceB - confidenceA
    })
    return proposals.map(p => p.id)
  }, [groupProposalsData?.data, groupKey])

  const editorResult = useProposalEditor(proposalIds, { autosave: true })

  // Type narrowing pour mode groupé
  if (!isGroupReturn(editorResult)) {
    throw new Error('useProposalEditor doit retourner un mode groupé pour GroupedProposalDetailBase')
  }

  const {
    workingGroup,
    isLoading: isEditorLoading,
    updateField: updateFieldEditor,
    selectOption,
    updateRace: updateRaceEditor,
    deleteRace: deleteRaceEditor,
    addRace: addRaceEditor,
    validateBlock: validateBlockEditor,
    validateAllBlocks: validateAllBlocksEditor,
    isBlockValidated: isBlockValidatedEditor,
    save: saveEditor,
    isDirty: isEditorDirty,
    // ✅ Two-Panes: Fonctions de copie depuis les sources
    sourceProposals,
    activeSourceIndex,
    setActiveSourceIndex,
    copyFieldFromSource,
    copyRaceFromSource,
    copyAllFromSource,
    getFieldDifferences,
    getRaceDifferences
  } = editorResult


  // ✅ Phase 4: Import fonctions d'affichage uniquement
  const {
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear
  } = useProposalLogic()

  // Navigation
  const isNewEvent = Boolean(groupKey?.startsWith('new-event-'))

  // Récupérer les propositions du groupe
  const groupProposals = useMemo(() => {
    if (!groupProposalsData?.data || !groupKey) return []

    return groupProposalsData.data.sort((a, b) => {
      const confidenceA = a.confidence || 0
      const confidenceB = b.confidence || 0
      return confidenceB - confidenceA
    })
  }, [groupProposalsData?.data, groupKey])

  // ✅ Sauvegarder eventId/editionId quand les propositions sont chargées
  // Ces valeurs restent disponibles même après le kill (quand groupProposals devient vide)
  useEffect(() => {
    if (groupProposals.length > 0 && !savedEventId) {
      const first = groupProposals[0]
      if (first.eventId) setSavedEventId(first.eventId)
      if (first.editionId) setSavedEditionId(first.editionId)
    }
  }, [groupProposals, savedEventId])

  // ✅ Phase 4: Consolider les changements depuis workingGroup
  const consolidatedChanges = useMemo(() => {
    if (!workingGroup) {
      console.log('🚨 [PARTIALLY_APPROVED DEBUG] workingGroup est null')
      return []
    }

    console.log('🔍 [PARTIALLY_APPROVED DEBUG] workingGroup:', {
      proposalCount: workingGroup.originalProposals.length,
      statuses: workingGroup.originalProposals.map(p => p.status),
      consolidatedChangesCount: workingGroup.consolidatedChanges.length,
      approvedBlocks: workingGroup.originalProposals[0]?.approvedBlocks
    })

    const isEventUpdateDisplay = workingGroup.originalProposals[0]?.type === 'EVENT_UPDATE'

    // Filtrer calendarStatus et timeZone pour EVENT_UPDATE uniquement
    const filtered = isEventUpdateDisplay
      ? workingGroup.consolidatedChanges.filter(c =>
          c.field !== 'calendarStatus' && c.field !== 'timeZone'
        )
      : workingGroup.consolidatedChanges

    console.log('🔍 [PARTIALLY_APPROVED DEBUG] consolidatedChanges:', {
      count: filtered.length,
      fields: filtered.map(c => c.field)
    })

    return filtered
  }, [workingGroup])

  const consolidatedRaceChanges = useMemo(() => {
    const races = workingGroup?.consolidatedRaces || []
    console.log('🔍 [PARTIALLY_APPROVED DEBUG] consolidatedRaceChanges:', {
      count: races.length,
      raceIds: races.map(r => r.raceId)  // ✅ Fix: raceId au lieu de id
    })
    return races
  }, [workingGroup])

  // ✅ Phase 4: Cascade startDate changes to races depuis workingGroup
  // ⚠️ ATTENTION : Ne devrait s'activer QUE si l'utilisateur a MANUELLEMENT modifié startDate
  // Sinon, on écrase les heures proposées par l'agent pour chaque course !
  const consolidatedRaceChangesWithCascade = useMemo(() => {
    if (!workingGroup) return []

    // Récupérer startDate depuis workingGroup
    const startDateChange = workingGroup.consolidatedChanges.find(c => c.field === 'startDate')

    // ⚠️ NE PAS utiliser la cascade si l'utilisateur n'a PAS modifié startDate
    // selectedValue est défini UNIQUEMENT si l'utilisateur a fait une modification manuelle
    const editionStartDate = startDateChange?.selectedValue

    // Si pas de modification manuelle, retourner les courses SANS cascade
    if (!editionStartDate) return workingGroup.consolidatedRaces

    // ✅ Si skipDateCascade est activé, ne PAS propager aux courses
    // Ce flag est activé quand on ajuste la date d'édition depuis une modification de course
    if (skipDateCascade) return workingGroup.consolidatedRaces

    // Propager startDate aux courses
    return workingGroup.consolidatedRaces.map(raceChange => ({
      ...raceChange,
      fields: Object.entries(raceChange.fields).reduce((acc, [fieldName, fieldData]) => {
        if (fieldName === 'startDate' && fieldData !== undefined) {
          // ✅ Gérer 3 formats possibles:
          // 1. ConsolidatedChange: { options: [...], currentValue: ... }
          if (fieldData && typeof fieldData === 'object' && 'options' in fieldData && Array.isArray(fieldData.options)) {
            const firstOption = fieldData.options[0]
            if (!firstOption) {
              return { ...acc, [fieldName]: fieldData }
            }
            return {
              ...acc,
              [fieldName]: {
                ...fieldData,
                options: [{
                  ...firstOption,
                  proposedValue: editionStartDate
                }]
              }
            }
          }

          // 2. Format agent: { old: ..., new: ..., confidence: ... }
          if (fieldData && typeof fieldData === 'object' && 'new' in fieldData) {
            return {
              ...acc,
              [fieldName]: {
                ...fieldData,
                new: editionStartDate
              }
            }
          }

          // 3. Valeur primitive - remplacer directement
          return {
            ...acc,
            [fieldName]: editionStartDate
          }
        }
        return { ...acc, [fieldName]: fieldData }
      }, {})
    }))
  }, [workingGroup, skipDateCascade])

  // Handler pour la modification de Edition.startDate (déclaré en premier car utilisé par handleSelectField)
  const handleEditionStartDateChange = (fieldName: string, newValue: any) => {
    if (fieldName !== 'startDate' || !newValue) {
      // Pas startDate, appliquer directement
      updateFieldEditor(fieldName, newValue)
      return
    }

    // Compter toutes les courses consolidées (y compris racesExisting "Info")
    const racesCount = workingGroup?.consolidatedRaces?.length || 0

    if (racesCount > 0) {
      // Ouvrir la modale pour demander si on propage aux courses
      setDatePropagationModal({
        open: true,
        newStartDate: newValue
      })
    } else {
      // Pas de courses, appliquer directement
      updateFieldEditor(fieldName, newValue)
    }
  }

  // ✅ Phase 4: Handlers simplifiés (plus de selectedChanges)
  const handleSelectField = (fieldName: string, selectedValue: any, proposalId?: string) => {
    // Si c'est startDate, déléguer à handleEditionStartDateChange
    if (fieldName === 'startDate') {
      handleEditionStartDateChange(fieldName, selectedValue)
      return
    }

    // Si proposalId fourni, utiliser selectOption (sélectionner parmi options)
    if (proposalId) {
      selectOption(fieldName, proposalId)
    } else {
      // Sinon, mettre à jour directement (modification manuelle)
      updateFieldEditor(fieldName, selectedValue)
    }
  }

  const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
    // Utiliser le hook pour mettre à jour
    updateFieldEditor(fieldName, newValue)
    // Plus besoin de setSelectedChanges, workingGroup.userModifiedChanges est mis à jour
  }

  const handleRaceFieldModify = (raceId: string, fieldName: string, newValue: any) => {
    // Si c'est une modification de startDate d'une course, vérifier si elle sort de la plage d'édition
    if (fieldName === 'startDate' && newValue) {
      const newRaceDate = new Date(newValue)

      // ✅ Phase 4: Récupérer les dates depuis workingGroup
      const startDateChange = workingGroup?.consolidatedChanges.find(c => c.field === 'startDate')
      const endDateChange = workingGroup?.consolidatedChanges.find(c => c.field === 'endDate')
      const currentStartDate = startDateChange?.selectedValue || startDateChange?.options[0]?.proposedValue
      const currentEndDate = endDateChange?.selectedValue || endDateChange?.options[0]?.proposedValue

      // Récupérer le nom de la course depuis consolidatedRaceChanges
      const raceChange = consolidatedRaceChangesWithCascade.find(r => r.raceId === raceId)
      const raceName = raceChange?.raceName || 'Course'

      // Si la course est AVANT la startDate de l'édition
      if (currentStartDate && newRaceDate < new Date(currentStartDate)) {
        setEditionDateUpdateModal({
          open: true,
          dateType: 'startDate',
          currentEditionDate: currentStartDate,
          newRaceDate: newValue,
          raceName,
          raceId  // ✅ Fix: passer le vrai raceId
        })
        return
      }

      // Si la course est APRÈS la endDate de l'édition
      if (currentEndDate && newRaceDate > new Date(currentEndDate)) {
        setEditionDateUpdateModal({
          open: true,
          dateType: 'endDate',
          currentEditionDate: currentEndDate,
          newRaceDate: newValue,
          raceName,
          raceId  // ✅ Fix: passer le vrai raceId
        })
        return
      }
    }

    // Utiliser le hook pour mettre à jour (sauvegarde lors de la validation du bloc)
    updateRaceEditor(raceId, fieldName, newValue)
    // ❌ Ne PAS appeler saveEditor() ici : race condition React
    // Le state n'est pas encore mis à jour quand saveEditor() est appelé
    // Les modifications seront sauvegardées lors de validateBlock() qui appelle save()
  }

  const handleApproveField = async (fieldName: string) => {
    const change = consolidatedChanges.find(c => c.field === fieldName)
    if (!change) return

    // ✅ Phase 4: Récupérer la valeur depuis consolidatedChanges.selectedValue
    const selectedValue = change.selectedValue !== undefined
      ? change.selectedValue
      : change.options[0]?.proposedValue

    if (selectedValue === undefined) return

    try {
      // ⚡ Optimisation: Mutations en parallèle, non-bloquantes
      const promises = change.options.map(option => {
        const optionValueStr = JSON.stringify(option.proposedValue)
        const selectedValueStr = JSON.stringify(selectedValue)

        return new Promise<void>((resolve, reject) => {
          if (optionValueStr === selectedValueStr) {
            updateProposalMutation.mutate({
              id: option.proposalId,
              status: 'APPROVED',
              appliedChanges: { [fieldName]: selectedValue }
            }, {
              onSuccess: () => resolve(),
              onError: reject
            })
          } else {
            updateProposalMutation.mutate({
              id: option.proposalId,
              status: 'REJECTED'
            }, {
              onSuccess: () => resolve(),
              onError: reject
            })
          }
        })
      })

      await Promise.all(promises)
    } catch (error) {
      console.error('Error approving/rejecting field:', error)
    }
  }

  // Navigation groupes
  const allGroupKeys = useMemo(() => {
    if (!allProposalsData?.data) return []
    const keys = new Set<string>()
    allProposalsData.data.forEach(proposal => {
      if (proposal.type === 'NEW_EVENT') {
        keys.add(`new-event-${proposal.id}`)
      } else {
        // Format: {eventId}-{editionId} ou {eventId}-null si pas d'editionId
        keys.add(`${proposal.eventId || 'unknown'}-${proposal.editionId || 'null'}`)
      }
    })
    return Array.from(keys)
  }, [allProposalsData?.data])

  const currentIndex = allGroupKeys.indexOf(groupKey || '')
  const canGoToPrev = currentIndex > 0
  const canGoToNext = currentIndex >= 0 && currentIndex < allGroupKeys.length - 1

  const navigateToGroup = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex >= 0 && newIndex < allGroupKeys.length) {
      navigate(`/proposals/group/${allGroupKeys[newIndex]}`)
    }
  }

  // ✅ Phase 4: Extraire la timezone de l'édition depuis workingGroup
  const editionTimezone = useMemo(() => {
    if (!workingGroup) return 'Europe/Paris'

    // 1. Chercher timeZone dans userModifiedChanges (priorité)
    if (workingGroup.userModifiedChanges?.timeZone) {
      return workingGroup.userModifiedChanges.timeZone
    }

    // 2. Sinon chercher dans consolidatedChanges
    const timeZoneChange = workingGroup.consolidatedChanges.find(c => c.field === 'timeZone')
    if (timeZoneChange?.selectedValue) {
      return timeZoneChange.selectedValue
    }
    if (timeZoneChange?.options[0]?.proposedValue) {
      return timeZoneChange.options[0].proposedValue
    }

    // 3. Chercher dans racesToUpdate[].currentData.timeZone (données des courses)
    const racesToUpdateChange = workingGroup.consolidatedChanges.find(c => c.field === 'racesToUpdate')
    const racesToUpdate = racesToUpdateChange?.options?.[0]?.proposedValue
    if (Array.isArray(racesToUpdate) && racesToUpdate.length > 0) {
      const firstRaceTimezone = racesToUpdate[0]?.currentData?.timeZone
      if (firstRaceTimezone) {
        return firstRaceTimezone
      }
    }

    return 'Europe/Paris' // Fallback
  }, [workingGroup])

  // ✅ Phase 4: Déterminer si l'édition est annulée depuis workingGroup
  const isEditionCanceled = useMemo(() => {
    if (!workingGroup) return false

    // Chercher calendarStatus dans userModifiedChanges (priorité)
    if (workingGroup.userModifiedChanges?.calendarStatus) {
      return workingGroup.userModifiedChanges.calendarStatus === 'CANCELED'
    }

    // Sinon chercher dans consolidatedChanges
    const calendarStatusChange = workingGroup.consolidatedChanges.find(c => c.field === 'calendarStatus')
    const calendarStatus = calendarStatusChange?.selectedValue || calendarStatusChange?.options[0]?.proposedValue
    return calendarStatus === 'CANCELED'
  }, [workingGroup])

  // Ref pour éviter les boucles infinies
  const lastComputedDatesRef = useRef<{startDate?: string, endDate?: string}>({})

  // ✅ Phase 4: Plus besoin d'auto-sélection, géré par le hook useProposalEditor

  // Actions principales
  const handleApproveRace = async (raceData: any) => {
    try {
      const raceProposalIds = raceData.proposalIds
      const concernedProposals = groupProposals.filter(p => raceProposalIds.includes(p.id))

      for (const proposal of concernedProposals) {
        const racesData = proposal.changes.races
        if (racesData && Array.isArray(racesData)) {
          const raceInProposal = racesData.find((race: any) =>
            (race.name || `Course ${racesData.indexOf(race) + 1}`) === raceData.raceName
          )

          if (raceInProposal) {
            await updateProposalMutation.mutateAsync({
              id: proposal.id,
              status: 'APPROVED',
              appliedChanges: { [`races[${raceData.raceId}]`]: raceInProposal }
            })
          }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
    } catch (error) {
      console.error('Error approving race changes:', error)
    }
  }

  const handleApproveAllRaces = async () => {
    try {
      for (const raceChange of consolidatedRaceChanges) {
        const raceProposalIds = raceChange.proposalIds
        const concernedProposals = groupProposals.filter(p => raceProposalIds.includes(p.id))

        for (const proposal of concernedProposals) {
          const racesData = proposal.changes.races
          if (racesData && Array.isArray(racesData)) {
            const raceInProposal = racesData.find((race: any) =>
              (race.name || `Course ${racesData.indexOf(race) + 1}`) === raceChange.raceName
            )

            if (raceInProposal) {
              await updateProposalMutation.mutateAsync({
                id: proposal.id,
                status: 'APPROVED',
                appliedChanges: { [`races[${raceChange.raceId}]`]: raceInProposal }
              })
            }
          }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
    } catch (error) {
      console.error('Error approving all races:', error)
    }
  }

  const handleRejectAllRaces = async () => {
    try {
      const raceProposalIds = consolidatedRaceChanges.flatMap(race => race.proposalIds)
      const uniqueProposalIds = Array.from(new Set(raceProposalIds))
      const concernedProposals = groupProposals.filter(p => uniqueProposalIds.includes(p.id))

      for (const proposal of concernedProposals) {
        await updateProposalMutation.mutateAsync({
          id: proposal.id,
          status: 'REJECTED'
        })
      }

      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
    } catch (error) {
      console.error('Error rejecting all races:', error)
    }
  }

  const handleApproveAll = async () => {
    try {
      // ✅ Phase 4: Merger les modifications d'édition et de courses depuis workingGroup
      const allUserModifications = {
        ...(workingGroup?.userModifiedChanges || {})
      }

      // Ajouter les modifications de courses si présentes
      const raceChanges = workingGroup?.userModifiedRaceChanges || {}
      if (Object.keys(raceChanges).length > 0) {
        allUserModifications.raceEdits = raceChanges
      }

      // ⚡ Optimisation: Collecter toutes les mutations, puis exécuter en parallèle
      const mutations: Promise<void>[] = []

      for (const change of consolidatedChanges) {
        const fieldName = change.field
        // ✅ Récupérer la valeur depuis consolidatedChanges.selectedValue
        const selectedValue = change.selectedValue !== undefined
          ? change.selectedValue
          : change.options[0]?.proposedValue

        if (selectedValue === undefined) continue

        for (const option of change.options) {
          const optionValueStr = JSON.stringify(option.proposedValue)
          const selectedValueStr = JSON.stringify(selectedValue)

          mutations.push(new Promise<void>((resolve, reject) => {
            if (optionValueStr === selectedValueStr) {
              updateProposalMutation.mutate({
                id: option.proposalId,
                status: 'APPROVED',
                appliedChanges: { [fieldName]: selectedValue },
                userModifiedChanges: Object.keys(allUserModifications).length > 0 ? allUserModifications : undefined,
                modificationReason: 'Modifications manuelles appliquées'
              }, {
                onSuccess: () => resolve(),
                onError: reject
              })
            } else {
              updateProposalMutation.mutate({
                id: option.proposalId,
                status: 'REJECTED'
              }, {
                onSuccess: () => resolve(),
                onError: reject
              })
            }
          }))
        }
      }

      // Attendre toutes les mutations en parallèle
      await Promise.all(mutations)
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
    } catch (error) {
      console.error('Error approving proposals:', error)
    }
  }

  const handleRejectAll = async () => {
    try {
      // ⚡ Optimisation: Mutations en parallèle
      const promises = groupProposals.map(proposal =>
        new Promise<void>((resolve, reject) => {
          updateProposalMutation.mutate({
            id: proposal.id,
            status: 'REJECTED'
          }, {
            onSuccess: () => resolve(),
            onError: reject
          })
        })
      )

      await Promise.all(promises)
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
    } catch (error) {
      console.error('Error rejecting proposals:', error)
    }
  }

  const handleArchive = async () => {
    try {
      const proposalIds = groupProposals.map(p => p.id)
      await bulkArchiveMutation.mutateAsync({
        proposalIds,
        archiveReason: undefined // Pas de raison requise
      })
      // ✅ Rediriger vers la liste des propositions après archivage
      // Car le groupe sera vide (l'API exclut les propositions ARCHIVED)
      navigate('/proposals')
    } catch (error) {
      console.error('Error archiving proposals:', error)
    }
  }

  // Archiver une seule sous-proposition du groupe
  const handleArchiveSingleProposal = async (proposalId: string) => {
    try {
      await bulkArchiveMutation.mutateAsync({
        proposalIds: [proposalId],
        archiveReason: 'Archivage individuel depuis la vue groupée'
      })
      // Recharger le groupe pour afficher les sous-propositions restantes
      const result = await refetchGroup()
      // Si le groupe est vide après l'archivage, retourner à la liste
      if (!result.data?.data || result.data.data.length === 0) {
        navigate('/proposals')
      }
    } catch (error) {
      console.error('Error archiving single proposal:', error)
    }
  }

  const handleKillEvent = async () => {
    try {
      const eventId = firstProposal?.eventId
      if (!eventId) {
        console.error('No eventId found')
        return
      }

      // 1. Rejeter toutes les propositions du groupe et marquer killEvent = true
      // L'événement sera tué lors de l'application d'une de ces propositions
      // ⚡ Optimisation: Mutations en parallèle, non-bloquantes
      const promises = groupProposals.map(proposal =>
        new Promise<void>((resolve, reject) => {
          updateProposalMutation.mutate({
            id: proposal.id,
            status: 'REJECTED',
            modificationReason: 'Événement tué',
            killEvent: true // ✅ Marquer pour kill lors de l'application
          }, {
            onSuccess: () => resolve(),
            onError: reject
          })
        })
      )
      await Promise.all(promises)

      // 2. Marquer localement comme tué IMMÉDIATEMENT pour désactiver les blocs
      setIsKilledLocally(true)

      // 3. Rafraîchir le cache pour mettre à jour l'UI
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
      await queryClient.invalidateQueries({ queryKey: ['proposal-groups'] })
      await queryClient.refetchQueries({ queryKey: ['proposal-groups', groupKey] })

      setKillDialogOpen(false)
    } catch (error) {
      console.error('Error killing event:', error)
    }
  }

  const handleReviveEvent = async () => {
    // ✅ Utiliser savedEventId/savedEditionId car après le kill, groupProposals est vide
    // (l'API filtre les propositions REJECTED)
    const eventId = firstProposal?.eventId || savedEventId
    const editionId = firstProposal?.editionId || savedEditionId
    if (!eventId) {
      console.error('No eventId found (neither from proposal nor saved state)')
      return
    }

    // Utiliser le hook useReviveEvent qui:
    // 1. Remet les propositions REJECTED en PENDING côté backend
    // 2. Crée une ProposalApplication pour remettre l'événement en LIVE
    // 3. Invalide les caches automatiquement
    reviveEventMutation.mutate(
      { eventId, editionId: editionId || undefined },
      {
        onSuccess: () => {
          // Retirer le marqueur local
          setIsKilledLocally(false)
          // Refetch pour mettre à jour l'UI
          queryClient.refetchQueries({ queryKey: ['proposal-groups', groupKey] })
        },
        onError: (error) => {
          console.error('Error reviving event:', error)
        }
      }
    )
  }

  // ✅ Phase 4: Confirmer la propagation de startDate aux courses
  const confirmDatePropagation = async () => {
    if (!datePropagationModal) return

    const newStartDate = datePropagationModal.newStartDate

    console.log('🔄 [DATE PROPAGATION] Début de la propagation:', {
      newStartDate,
      groupProposalsCount: groupProposals.length,
      firstProposalId: groupProposals[0]?.id
    })

    // Appliquer la nouvelle startDate à l'édition via le hook
    updateFieldEditor('startDate', newStartDate)
    console.log('📅 [DATE PROPAGATION] startDate mise à jour pour l\'édition')

    // ✅ Propager à TOUTES les courses via workingGroup.consolidatedRaces
    // Cela inclut racesToUpdate, racesToAdd ET racesExisting (courses "Info")
    const allRaces = workingGroup?.consolidatedRaces || []
    console.log(`🏁 [DATE PROPAGATION] ${allRaces.length} courses à propager`)

    allRaces.forEach((race) => {
      console.log(`  ✅ Propagation vers course ${race.raceId}:`, {
        raceName: race.fields?.name || race.originalFields?.name,
        newStartDate
      })
      updateRaceEditor(race.raceId, 'startDate', newStartDate)
    })

    // ✅ FIX 2025-11-17 : Sauvegarder explicitement via le hook
    // Cela sauvegarde à la fois startDate ET toutes les modifications de courses
    console.log('💾 [DATE PROPAGATION] Sauvegarde via saveEditor()')
    saveEditor()

    setDatePropagationModal(null)
    console.log('✅ [DATE PROPAGATION] Propagation terminée')
  }

  // ✅ Phase 4: Confirmer la mise à jour de Edition.startDate/endDate depuis une course
  const confirmEditionDateUpdate = () => {
    if (!editionDateUpdateModal) return

    const { dateType, newRaceDate, raceId } = editionDateUpdateModal

    // ✅ Activer le flag pour désactiver la cascade automatique
    // On ne veut PAS que la modification de l'édition propage à toutes les courses
    setSkipDateCascade(true)

    // Mettre à jour la date de l'édition via le hook
    updateFieldEditor(dateType, newRaceDate)

    // Appliquer aussi la modification de la course via le hook
    updateRaceEditor(raceId, 'startDate', newRaceDate)

    setEditionDateUpdateModal(null)
  }

// Calculs pour l'interface
  const firstProposal = groupProposals[0]
  const eventId = firstProposal?.eventId
  const eventStatus = firstProposal?.eventStatus
  const isFeatured = firstProposal?.isFeatured

  // ✅ Récupérer les ProposalApplications liées à ce groupe
  const firstProposalId = firstProposal?.id
  const { data: updatesData } = useUpdates(
    { proposalId: firstProposalId },
    100, // Limit
    0
  )
  const relatedUpdates = updatesData?.data || []
  const hasUpdates = relatedUpdates.length > 0
  // ✅ Événement mort si Event.status = DEAD OU si au moins une proposition est marquée killEvent OU si tué localement
  const hasKillMarker = groupProposals.some(p => (p as any).killEvent === true)
  const isEventDead = isKilledLocally || eventStatus === 'DEAD' || hasKillMarker

  // ✅ Calculer la confiance avec TOUTES les propositions (PENDING + APPROVED)
  // Car si toutes sont APPROVED, on veut quand même afficher leur confiance
  const proposalsWithValidConfidence = groupProposals.filter(p => p.confidence !== undefined && p.confidence !== null && p.confidence > 0)
  const averageConfidence = proposalsWithValidConfidence.length > 0
    ? proposalsWithValidConfidence.reduce((sum, p) => sum + p.confidence!, 0) / proposalsWithValidConfidence.length
    : 0
  // ✅ hasPending = vrai s'il y a AU MOINS UNE proposition PENDING ou PARTIALLY_APPROVED
  // Utilisé pour afficher le chip "En attente" et activer les boutons d'édition
  const hasPending = groupProposals.some(p => p.status === 'PENDING' || p.status === 'PARTIALLY_APPROVED')
  // ✅ allPending = vrai si TOUTES les propositions sont PENDING ou PARTIALLY_APPROVED (pour compatibilité)
  const allPending = groupProposals.every(p => p.status === 'PENDING' || p.status === 'PARTIALLY_APPROVED')

  // Identifier les propositions par bloc
  // ✅ Phase 2 Étape 3 : Utiliser workingGroup si disponible
  const blockProposals = useMemo(() => {
    const blocks: Record<string, string[]> = {}

    // Utiliser les données consolidées du hook si disponibles, sinon fallback
    const changes = workingGroup?.consolidatedChanges || consolidatedChanges
    const raceChanges = workingGroup?.consolidatedRaces || consolidatedRaceChangesWithCascade
    // ✅ Utiliser TOUTES les propositions (PENDING + APPROVED) pour calculer blockProposals
    // Sinon aucun bouton d'annulation n'apparaît pour les propositions APPROVED
    const proposals = groupProposals

    // Bloc Event - uniquement les champs appartenant à l'événement
    // ✅ Inclure NEW_EVENT, EVENT_UPDATE ET EDITION_UPDATE (qui peut modifier Event)
    if (isNewEvent || proposals[0]?.type === 'EVENT_UPDATE' || proposals[0]?.type === 'EDITION_UPDATE') {
      const eventProposalIds = proposals
        .filter(p => changes.some(c =>
          isFieldInBlock(c.field, 'event') &&
          c.options.some(o => o.proposalId === p.id)
        ))
        .map(p => p.id)

      if (eventProposalIds.length > 0) {
        blocks['event'] = eventProposalIds
      }
    }

    // Bloc Edition - uniquement les champs appartenant à l'édition
    const editionProposalIds = proposals
      .filter(p => changes.some(c =>
        isFieldInBlock(c.field, 'edition') &&
        c.options.some(o => o.proposalId === p.id)
      ))
      .map(p => p.id)

    if (editionProposalIds.length > 0) {
      blocks['edition'] = editionProposalIds
    }

    // Bloc Organisateur
    const organizerProposalIds = proposals
      .filter(p => changes.some(c =>
        isFieldInBlock(c.field, 'organizer') &&
        c.options.some(o => o.proposalId === p.id)
      ))
      .map(p => p.id)

    if (organizerProposalIds.length > 0) {
      blocks['organizer'] = organizerProposalIds
    }

    // Bloc Courses (modifications de courses existantes OU courses à ajouter)
    const raceProposalIds = proposals
      .filter(p => {
        // Courses modifiées
        const hasRaceChanges = raceChanges.some(rc =>
          rc.proposalIds.includes(p.id)
        )
        // Courses à ajouter via consolidatedChanges
        const hasRacesToAdd = changes.some(c =>
          isFieldInBlock(c.field, 'races') &&
          c.options.some(o => o.proposalId === p.id)
        )
        // Vérifier aussi racesToUpdate (champ de metadata pour les courses proposées par FFA)
        const hasRacesToUpdate = p.changes?.racesToUpdate &&
                                 Array.isArray(p.changes.racesToUpdate) &&
                                 p.changes.racesToUpdate.length > 0
        // Vérifier aussi existingRaces (courses enrichies pour l'UI)
        const hasExistingRaces = p.existingRaces &&
                                 Array.isArray(p.existingRaces) &&
                                 p.existingRaces.length > 0

        return hasRaceChanges || hasRacesToAdd || hasRacesToUpdate || hasExistingRaces
      })
      .map(p => p.id)

    if (raceProposalIds.length > 0) {
      blocks['races'] = raceProposalIds
    }

    return blocks
  }, [groupProposals, consolidatedChanges, consolidatedRaceChangesWithCascade, isNewEvent, workingGroup])

  const editionId = groupProposals[0]?.editionId
  const { data: protectionData } = useEditionProtection(editionId)

  // Hook de validation par blocs (APRÈS blockProposals pour éviter la dépendance circulaire)
  // ✅ Phase 4: Hook de validation par blocs utilise directement workingGroup
  const {
    blockStatus,
    validateBlock: validateBlockBase,
    validateBlockWithDependencies: validateBlockWithDependenciesBase,  // ✅ Nouveau
    unvalidateBlock: unvalidateBlockBase,
    validateAllBlocks: validateAllBlocksBase,
    unvalidateAllBlocks,
    isBlockValidated: isBlockValidatedLegacy,
    hasValidatedBlocks,
    isPending: isBlockPending
  } = useBlockValidation({
    // ✅ Utiliser TOUTES les propositions pour permettre l'annulation des blocs APPROVED
    proposals: groupProposals,
    blockProposals,
    // ✅ Two-Panes: Utiliser la proposition prioritaire (pas de merge de toutes les propositions)
    primaryProposalId: workingGroup?.primaryProposalId,
    // ✅ Phase 4: Construire selectedChanges depuis workingGroup.consolidatedChanges
    selectedChanges: (() => {
      if (!workingGroup) return {}
      const values: Record<string, any> = {}
      workingGroup.consolidatedChanges.forEach(change => {
        const value = change.selectedValue !== undefined
          ? change.selectedValue
          : change.options[0]?.proposedValue
        if (value !== undefined) {
          values[change.field] = value
        }
      })
      return values
    })(),
    userModifiedChanges: workingGroup?.userModifiedChanges || {},
    userModifiedRaceChanges: workingGroup?.userModifiedRaceChanges || {},
    isEditionProtected: protectionData?.data?.protected ?? false
  })

  // ✅ Fonction pour vérifier si un bloc a déjà été appliqué en base
  // Un bloc appliqué ne peut plus être annulé
  const isBlockApplied = (blockKey: string) => {
    return groupProposals.some(proposal =>
      proposal.applications?.some(
        app => app.blockType === blockKey && app.status === 'APPLIED'
      )
    )
  }

  // ✅ UTILISER isBlockValidatedEditor du hook useProposalEditor (source de vérité)
  const isBlockValidated = isBlockValidatedEditor

  // Wrapper pour logger les validations de blocs
  // ✅ Phase 4: Utiliser automatiquement la validation en cascade
  // ✅ proposalIds optionnel pour compatibilité avec les vues simples
  const validateBlock = async (blockKey: string, _proposalIds?: string[]) => {
    await validateBlockWithDependenciesBase(blockKey as any, { silent: false })
  }

  // ✅ Wrapper pour validation en cascade
  const validateBlockWithDependencies = async (blockKey: string) => {
    await validateBlockWithDependenciesBase(blockKey as BlockType, { silent: false })
  }

  const unvalidateBlock = async (blockKey: string) => {
    await unvalidateBlockBase(blockKey)
  }

  const hasApproved = groupProposals.some(p => p.status === 'APPROVED')
  const allApproved = groupProposals.every(p => p.status === 'APPROVED')
  // ✅ Mode lecture seule si aucune proposition PENDING ET tous les blocs existants sont validés
  // Cela évite de désactiver tous les blocs dès qu'on en valide un seul
  // ✅ Utiliser isBlockValidatedEditor (source de vérité depuis useProposalEditor)
  const allBlocksValidated = Object.keys(blockProposals).length > 0 &&
    Object.keys(blockProposals).every(blockKey => isBlockValidatedEditor(blockKey))
  const isAllApproved = !hasPending && allApproved && allBlocksValidated

  // Context pour le render
  // ✅ Phase 4 : Single Source of Truth totale avec workingGroup
  const context: GroupedProposalContext = {
    // Données consolidées depuis le hook
    groupProposals: workingGroup?.originalProposals || groupProposals, // ✅ PENDING uniquement
    allGroupProposals: groupProposals, // ✅ Toutes les propositions (PENDING + historiques)
    consolidatedChanges: consolidatedChanges, // Déjà depuis workingGroup après nettoyage
    consolidatedRaceChanges: consolidatedRaceChangesWithCascade, // Déjà depuis workingGroup après nettoyage

    // États de modifications utilisateur depuis le hook
    selectedChanges: {}, // ✅ Obsolète, garder pour compatibilité interface mais vide
    userModifiedChanges: workingGroup?.userModifiedChanges || {},
    userModifiedRaceChanges: workingGroup?.userModifiedRaceChanges || {},

    // Handlers (priorité au hook si disponible)
    handleFieldSelect: handleSelectField,
    handleFieldModify, // ✅ Déjà adapté à l'Étape 2 pour utiliser updateFieldEditor
    handleEditionStartDateChange,
    handleApproveField,
    handleApproveAll,
    handleRejectAll,
    handleApproveRace,
    handleApproveAllRaces,
    handleRejectAllRaces,
    handleRaceFieldModify, // ✅ Déjà adapté à l'Étape 2 pour utiliser updateRaceEditor
    handleDeleteRace: deleteRaceEditor, // ✅ Suppression de course via le hook
    handleAddRace: addRaceEditor, // ✅ Ajout de course via le hook
    handleKillEvent,
    handleReviveEvent,

    // Utilitaires (inchangés)
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear,

// États UI (inchangés)
    isLoading,
    isPending: updateProposalMutation.isPending || bulkArchiveMutation.isPending,
    isEventDead,
    isFeatured, // ✅ Indicateur si l'événement est mis en avant
    averageConfidence,
    allPending: hasPending, // ✅ Utiliser hasPending pour les boutons d'édition
    hasApproved,
    allApproved,
    isAllApproved, // ✅ Mode lecture seule (toutes APPROVED)
    editionTimezone,
    isNewEvent,
    killDialogOpen,
    setKillDialogOpen,
    isEditionCanceled,

    // Validation par blocs
    validateBlock,
    validateBlockWithDependencies,  // ✅ Nouveau
    unvalidateBlock,
    validateAllBlocks: () => validateAllBlocksBase(blockProposals),
    isBlockValidated,
    isBlockApplied,  // ✅ Nouveau : vérifie si le bloc est déjà appliqué en base
    isBlockPending,
    blockProposals,
    // Archivage individuel d'une sous-proposition
    handleArchiveSingleProposal,
    isArchiving: bulkArchiveMutation.isPending,
    // ✅ Two-Panes: Fonctions de copie depuis les sources
    sourceProposals,
    activeSourceIndex,
    setActiveSourceIndex,
    copyFieldFromSource,
    copyRaceFromSource,
    copyAllFromSource,
    getFieldDifferences,
    getRaceDifferences
  }

  if (isLoading) return <LinearProgress />

  if (groupProposals.length === 0) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Groupe de propositions introuvable</Alert>
        </CardContent>
      </Card>
    )
  }

  const isEventUpdateDisplay = groupProposals.length > 0 && groupProposals[0]?.type === 'EVENT_UPDATE'

  return (
    <Box>
      {!hideNavigation && (
        <ProposalNavigation
          navigation={{
            hasPrevious: canGoToPrev,
            hasNext: canGoToNext,
            onPrevious: () => navigateToGroup('prev'),
            onNext: () => navigateToGroup('next')
          }}
          showValidateAllBlocksButton={hasPending && !isEventDead && Object.keys(blockProposals).length > 0 && !allBlocksValidated}
          onValidateAllBlocks={async () => {
            if (isFeatured) {
              setFeaturedEventConfirmOpen(true)
            } else {
              await validateAllBlocksBase(blockProposals)
            }
          }}
          showUnvalidateAllBlocksButton={hasValidatedBlocks()}
          onUnvalidateAllBlocks={unvalidateAllBlocks}
          isValidateAllBlocksPending={isBlockPending}
          showKillEventButton={hasPending && !isEventDead && !isNewEvent && Boolean(eventId)}
          onKillEvent={() => setKillDialogOpen(true)}
          showReviveEventButton={isEventDead && !isNewEvent && Boolean(eventId)}
          onReviveEvent={handleReviveEvent}
          showArchiveButton={hasPending}
          onArchive={handleArchive}
          showUpdatesButton={hasUpdates}
          onViewUpdates={() => {
            // Naviguer vers la vue groupée des updates
            if (relatedUpdates.length > 0) {
              navigate(`/updates/group/${relatedUpdates[0].id}`)
            }
          }}
          updatesCount={relatedUpdates.length}
          disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending}
          showBackButton={true}
        />
      )}

      <ProposalHeader
        title={isNewEvent ? 'Nouvel événement proposé' : 'Proposition de modification'}
        eventTitle={!isNewEvent && firstProposal?.eventId ? (getEventTitle(firstProposal, isNewEvent) || `Event ID: ${firstProposal.eventId}`) : undefined}
        editionYear={!isNewEvent && !isEventUpdateDisplay && firstProposal?.editionId ? (getEditionYear(firstProposal) ? `${getEditionYear(firstProposal)} (${firstProposal.editionId})` : `Edition ID: ${firstProposal.editionId}`) : undefined}
        chips={[
          {
            label: `${groupProposals.length} propositions groupées`,
            variant: 'outlined',
            show: groupProposals.length > 1
          },
          {
            label: hasPending ? 'En attente' : 'Traité',
            color: hasPending ? 'warning' : 'default'
          },
          {
            label: `${Math.round((averageConfidence || 0) * 100)}% confiance`,
            color: (averageConfidence || 0) > 0.8 ? 'success' : (averageConfidence || 0) > 0.6 ? 'warning' : 'error'
          }
        ]}
        {...customHeaderProps}
      />

      {protectionData?.data?.protected && (
        <EditionProtectionBanner reasons={protectionData.data.reasons} />
      )}

      {(() => {
        // Évaluer le contenu du sidebar une seule fois
        const sidebarContent = renderSidebar ? renderSidebar(context) : null
        const hasSidebar = sidebarContent !== null

        return (
          <Grid container spacing={3}>
            <Grid item xs={12} md={hasSidebar ? 8 : 12}>
              {renderMainContent(context)}
            </Grid>

            {hasSidebar && (
              <Grid item xs={12} md={4}>
                {sidebarContent}
              </Grid>
            )}
          </Grid>
        )
      })()}

      {/* Dialog de confirmation pour tuer l'événement */}
      <Dialog open={killDialogOpen} onClose={() => setKillDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tuer l'événement</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 2 }}>
            Êtes-vous sûr de vouloir tuer cet événement ? Cette action :
          </Typography>
          <Typography component="ul" sx={{ mt: 2, pl: 2 }}>
            <li>Rejette automatiquement toutes les propositions de ce groupe</li>
            <li>Marque ces propositions pour tuer l'événement lors de leur application</li>
            <li>Désactive tous les blocs (non éditables)</li>
            <li>L'événement sera marqué DEAD dans Miles Republic lors de l'application</li>
            <li>Peut être annulée avec le bouton "Ressusciter l'événement"</li>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKillDialogOpen(false)}>Annuler</Button>
          <Button
            onClick={handleKillEvent}
            color="error"
            variant="contained"
            disabled={updateProposalMutation.isPending}
          >
            {updateProposalMutation.isPending ? 'En cours...' : 'Tuer l\'événement'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modale de confirmation pour propager Edition.startDate aux courses */}
      {datePropagationModal && (
        <ConfirmDatePropagationModal
          open={datePropagationModal.open}
          onClose={() => {
            // ✅ Phase 4: Annuler = appliquer juste à l'édition sans propager via le hook
            updateFieldEditor('startDate', datePropagationModal.newStartDate)
            setDatePropagationModal(null)
          }}
          onConfirm={confirmDatePropagation}
          newStartDate={datePropagationModal.newStartDate}
          affectedRacesCount={workingGroup?.consolidatedRaces?.length || 0}
        />
      )}

{/* Modale de confirmation pour mettre à jour Edition.startDate/endDate depuis une course */}
      <ConfirmEditionDateUpdateModal
        open={editionDateUpdateModal?.open || false}
        currentEditionDate={editionDateUpdateModal?.currentEditionDate || ''}
        newRaceDate={editionDateUpdateModal?.newRaceDate || ''}
        raceName={editionDateUpdateModal?.raceName || ''}
        dateType={editionDateUpdateModal?.dateType || 'startDate'}
        onClose={() => setEditionDateUpdateModal(null)}
        onConfirm={confirmEditionDateUpdate}
      />

      {/* Dialog de confirmation pour les événements mis en avant */}
      <Dialog open={featuredEventConfirmOpen} onClose={() => setFeaturedEventConfirmOpen(false)}>
        <DialogTitle>
          <WarningIcon sx={{ verticalAlign: 'middle', mr: 1, color: 'warning.main' }} />
          Confirmation requise
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Cet événement est actuellement mis en avant sur la page d'accueil.
            Êtes-vous sûr de vouloir valider toutes les modifications ?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFeaturedEventConfirmOpen(false)} color="primary">
            Annuler
          </Button>
          <Button
            onClick={async () => {
              setFeaturedEventConfirmOpen(false)
              await validateAllBlocksBase(blockProposals)
            }}
            color="warning"
            variant="contained"
            autoFocus
          >
            Valider
          </Button>
</DialogActions>
      </Dialog>
    </Box>
  )
}

export default GroupedProposalDetailBase
