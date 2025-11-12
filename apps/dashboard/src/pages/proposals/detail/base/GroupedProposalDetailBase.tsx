import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
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
  DialogActions,
  TextField,
  Button,
  Typography
} from '@mui/material'
import ConfirmDatePropagationModal from '@/components/proposals/modals/ConfirmDatePropagationModal'
import ConfirmEditionDateUpdateModal from '@/components/proposals/modals/ConfirmEditionDateUpdateModal'
import ProposalHeader from '@/components/proposals/ProposalHeader'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'
import { useProposalLogic } from '@/hooks/useProposalLogic'
import { useProposalEditor, ConsolidatedRaceChange, isGroupReturn } from '@/hooks/useProposalEditor'
import { useBlockValidation } from '@/hooks/useBlockValidation'
import { 
  useProposals, 
  useUpdateProposal, 
  useBulkArchiveProposals, 
  useUnapproveProposal, 
  useKillEvent, 
  useReviveEvent, 
  useProposalGroup 
} from '@/hooks/useApi'
import type { Proposal } from '@/types'
import { isFieldInBlock, getBlockForField } from '@/utils/blockFieldMapping'

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
  groupProposals: Proposal[]
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaceChanges: ConsolidatedRaceChange[]
  averageConfidence: number
  allPending: boolean
  hasApproved: boolean
  allApproved: boolean
  editionTimezone: string
  isNewEvent: boolean
  getEventTitle: (proposal: any, isNewEvent: boolean) => string
  getEditionYear: (proposal: any) => string | undefined
  handleEditionStartDateChange: (fieldName: string, newValue: any) => void
  // Actions spécifiques aux courses
  handleApproveRace: (raceData: any) => Promise<void>
  handleApproveAllRaces: () => Promise<void>
  handleRejectAllRaces: () => Promise<void>
  handleRaceFieldModify: (raceId: string, fieldName: string, newValue: any) => void
  userModifiedRaceChanges: Record<string, Record<string, any>>
  // Actions événement mort
  handleKillEvent: () => Promise<void>
  handleReviveEvent: () => Promise<void>
  // État UI
  killDialogOpen: boolean
  setKillDialogOpen: (open: boolean) => void
  isEditionCanceled: boolean
  // Validation par blocs
  validateBlock: (blockKey: string, proposalIds: string[]) => Promise<void>
  unvalidateBlock: (blockKey: string) => Promise<void>
  validateAllBlocks: () => Promise<void>
  isBlockValidated: (blockKey: string) => boolean
  isBlockPending: boolean
  blockProposals: Record<string, string[]>
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
    raceIndex: number
  } | null>(null)
  
  // Hooks API (DOIT être déclaré AVANT proposalIds qui l'utilise)
  const { data: groupProposalsData, isLoading } = useProposalGroup(groupKey || '')
  const { data: allProposalsData } = useProposals({}, 100)
  const updateProposalMutation = useUpdateProposal()
  const bulkArchiveMutation = useBulkArchiveProposals()
  const unapproveProposalMutation = useUnapproveProposal()
  const killEventMutation = useKillEvent()
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
    isDirty: isEditorDirty
  } = editorResult
  
  
  // ✅ PHASE 4: Import fonctions d'affichage uniquement
  // consolidateChanges/consolidateRaceChanges sont désormais dans useProposalEditor
  // mais on les garde ici temporairement pour compatibilité
  const {
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear
  } = useProposalLogic()
  
  // ⚠️ LEGACY: États locaux conservés pour compatibilité avec le code existant
  // À migrer vers workingGroup.userModifiedChanges dans une phase future
  const [selectedChanges, setSelectedChanges] = useState<Record<string, any>>({})
  
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
  
  // ⚠️ LEGACY: Fonctions de consolidation (seront remplacées par workingGroup)
  const consolidateChanges = (proposals: any[], isNewEvent: boolean) => {
    if (!workingGroup) return []
    return workingGroup.consolidatedChanges
  }
  
  const consolidateRaceChanges = (proposals: any[]) => {
    if (!workingGroup) return []
    return workingGroup.consolidatedRaces
  }
  
  // Consolider les changements (DOIT être avant les handlers qui l'utilisent)
  const consolidatedChanges = useMemo(() => {
    const changes = consolidateChanges(groupProposals, isNewEvent)
    const isEventUpdateDisplay = groupProposals.length > 0 && groupProposals[0]?.type === 'EVENT_UPDATE'
    
    // Filtrer calendarStatus et timeZone pour EVENT_UPDATE uniquement
    return isEventUpdateDisplay
      ? changes.filter(c => c.field !== 'calendarStatus' && c.field !== 'timeZone')
      : changes
  }, [groupProposals, isNewEvent, consolidateChanges])
  
  const consolidatedRaceChanges = useMemo(() =>
    consolidateRaceChanges(groupProposals),
    [groupProposals, consolidateRaceChanges]
  )
  
  // Cascade startDate changes to races
  const consolidatedRaceChangesWithCascade = useMemo(() => {
    const startDateChange = consolidatedChanges.find(c => c.field === 'startDate')
    const editionStartDate = selectedChanges['startDate'] || startDateChange?.options[0]?.proposedValue
    
    if (!editionStartDate) return consolidatedRaceChanges
    
    return consolidatedRaceChanges.map(raceChange => ({
      ...raceChange,
      fields: Object.entries(raceChange.fields).reduce((acc, [fieldName, fieldData]) => {
        if (fieldName === 'startDate') {
          return {
            ...acc,
            [fieldName]: {
              ...fieldData,
              options: [{
                ...fieldData.options[0],
                proposedValue: editionStartDate
              }]
            }
          }
        }
        return { ...acc, [fieldName]: fieldData }
      }, {})
    }))
  }, [consolidatedRaceChanges, consolidatedChanges, selectedChanges])
  
  // Handler pour la modification de Edition.startDate (déclaré en premier car utilisé par handleSelectField)
  const handleEditionStartDateChange = (fieldName: string, newValue: any) => {
    if (fieldName !== 'startDate' || !newValue) {
      // Pas startDate, appliquer directement
      updateFieldEditor(fieldName, newValue)
      setSelectedChanges(prev => ({ ...prev, [fieldName]: newValue }))
      return
    }
    
    // Compter les courses proposées
    const firstProposal = groupProposals[0]
    const changes = firstProposal?.changes
    const existingRaces = firstProposal?.existingRaces || []
    const racesToAdd = changes?.racesToAdd?.new || changes?.racesToAdd || changes?.races || []
    const racesToUpdate = changes?.racesToUpdate?.new || changes?.racesToUpdate || []
    const racesCount = existingRaces.length + (Array.isArray(racesToAdd) ? racesToAdd.length : 0) + (Array.isArray(racesToUpdate) ? racesToUpdate.length : 0)
    
    if (racesCount > 0) {
      // Ouvrir la modale pour demander si on propage aux courses
      setDatePropagationModal({
        open: true,
        newStartDate: newValue
      })
    } else {
      // Pas de courses, appliquer directement
      updateFieldEditor(fieldName, newValue)
      setSelectedChanges(prev => ({ ...prev, [fieldName]: newValue }))
    }
  }
  
  // Handlers
  const handleSelectField = (fieldName: string, selectedValue: any) => {
    // Si c'est startDate, déléguer à handleEditionStartDateChange
    if (fieldName === 'startDate') {
      handleEditionStartDateChange(fieldName, selectedValue)
      return
    }
    
    // Utiliser le hook pour mettre à jour
    updateFieldEditor(fieldName, selectedValue)
    
    // Garder selectedChanges pour compatibilité
    setSelectedChanges(prev => ({ ...prev, [fieldName]: selectedValue }))
  }
  
  const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
    // Utiliser le hook pour mettre à jour
    updateFieldEditor(fieldName, newValue)
    
    // Garder selectedChanges pour compatibilité
    setSelectedChanges(prev => ({
      ...prev,
      [fieldName]: newValue
    }))
  }
  
  const handleRaceFieldModify = (raceId: string, fieldName: string, newValue: any) => {
    // Si c'est une modification de startDate d'une course, vérifier si elle sort de la plage d'édition
    if (fieldName === 'startDate' && newValue) {
      const newRaceDate = new Date(newValue)
      const currentStartDate = selectedChanges.startDate || consolidatedChanges.find(c => c.field === 'startDate')?.options[0]?.proposedValue
      const currentEndDate = selectedChanges.endDate || consolidatedChanges.find(c => c.field === 'endDate')?.options[0]?.proposedValue
      
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
          raceIndex: 0
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
          raceIndex: 0
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
    const selectedValue = selectedChanges[fieldName]
    if (selectedValue === undefined) return
    
    const change = consolidatedChanges.find(c => c.field === fieldName)
    if (!change) return
    
    try {
      for (const option of change.options) {
        const optionValueStr = JSON.stringify(option.proposedValue)
        const selectedValueStr = JSON.stringify(selectedValue)
        
        if (optionValueStr === selectedValueStr) {
          await updateProposalMutation.mutateAsync({
            id: option.proposalId,
            status: 'APPROVED',
            reviewedBy: 'Utilisateur',
            appliedChanges: { [fieldName]: selectedValue }
          })
        } else {
          await updateProposalMutation.mutateAsync({
            id: option.proposalId,
            status: 'REJECTED',
            reviewedBy: 'Utilisateur'
          })
        }
      }
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
        keys.add(`${proposal.eventId || 'unknown'}-${proposal.editionId || 'unknown'}`)
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
  
  // Extraire la timezone de l'édition
  const editionTimezone = useMemo(() => {
    if (selectedChanges.timeZone) {
      return selectedChanges.timeZone
    }
    
    if (groupProposals.length === 0) return 'Europe/Paris'
    const firstProposal = groupProposals[0]
    if (!firstProposal?.changes) return 'Europe/Paris'
    const changes = firstProposal.changes as any
    
    if (changes.timeZone) {
      if (typeof changes.timeZone === 'string') return changes.timeZone
      if (typeof changes.timeZone === 'object' && 'proposed' in changes.timeZone) return changes.timeZone.proposed
      if (typeof changes.timeZone === 'object' && 'new' in changes.timeZone) return changes.timeZone.new
      if (typeof changes.timeZone === 'object' && 'current' in changes.timeZone) return changes.timeZone.current
    }
    return 'Europe/Paris'
  }, [groupProposals, selectedChanges.timeZone])
  
  // Déterminer si l'édition est annulée
  const isEditionCanceled = useMemo(() => {
    const calendarStatus = workingGroup?.userModifiedChanges?.['calendarStatus'] || 
                          selectedChanges['calendarStatus'] || 
                          consolidatedChanges.find(c => c.field === 'calendarStatus')?.options[0]?.proposedValue
    return calendarStatus === 'CANCELED'
  }, [selectedChanges, workingGroup, consolidatedChanges])
  
  // Ref pour éviter les boucles infinies
  const lastComputedDatesRef = useRef<{startDate?: string, endDate?: string}>({})
  

  // Auto-sélection des meilleures valeurs au chargement
  useEffect(() => {
    const newSelections: Record<string, any> = {}
    
    consolidatedChanges.forEach(change => {
      if (!selectedChanges[change.field] && change.options.length > 0) {
        newSelections[change.field] = change.options[0].proposedValue
      }
    })
    
    if (Object.keys(newSelections).length > 0) {
      setSelectedChanges(prev => ({ ...prev, ...newSelections }))
    }
  }, [consolidatedChanges, selectedChanges, setSelectedChanges])

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
              reviewedBy: 'Utilisateur',
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
                reviewedBy: 'Utilisateur',
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
          status: 'REJECTED',
          reviewedBy: 'Utilisateur'
        })
      }
      
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
    } catch (error) {
      console.error('Error rejecting all races:', error)
    }
  }

  const handleApproveAll = async () => {
    try {
      // Merger les modifications d'édition et de courses
      const allUserModifications = {
        ...(workingGroup?.userModifiedChanges || {})
      }
      
      // Ajouter les modifications de courses si présentes
      const raceChanges = workingGroup?.userModifiedRaceChanges || {}
      if (Object.keys(raceChanges).length > 0) {
        allUserModifications.raceEdits = raceChanges
      }
      
      for (const change of consolidatedChanges) {
        const fieldName = change.field
        const selectedValue = selectedChanges[fieldName]
        
        if (selectedValue === undefined) continue
        
        for (const option of change.options) {
          const optionValueStr = JSON.stringify(option.proposedValue)
          const selectedValueStr = JSON.stringify(selectedValue)
          
          if (optionValueStr === selectedValueStr) {
            await updateProposalMutation.mutateAsync({
              id: option.proposalId,
              status: 'APPROVED',
              reviewedBy: 'Utilisateur',
              appliedChanges: { [fieldName]: selectedValue },
              userModifiedChanges: Object.keys(allUserModifications).length > 0 ? allUserModifications : undefined,
              modificationReason: 'Modifications manuelles appliquées',
              modifiedBy: 'Utilisateur'
            })
          } else {
            await updateProposalMutation.mutateAsync({
              id: option.proposalId,
              status: 'REJECTED',
              reviewedBy: 'Utilisateur'
            })
          }
        }
      }
      
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
    } catch (error) {
      console.error('Error approving proposals:', error)
    }
  }

  const handleRejectAll = async () => {
    try {
      for (const proposal of groupProposals) {
        await updateProposalMutation.mutateAsync({
          id: proposal.id,
          status: 'REJECTED',
          reviewedBy: 'Utilisateur'
        })
      }
      
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
        reviewedBy: 'Utilisateur',
        archiveReason: undefined // Pas de raison requise
      })
    } catch (error) {
      console.error('Error archiving proposals:', error)
    }
  }

  const handleKillEvent = async () => {
    try {
      const eventId = firstProposal?.eventId
      if (!eventId) {
        console.error('No eventId found')
        return
      }
      await killEventMutation.mutateAsync(eventId)
      setKillDialogOpen(false)
    } catch (error) {
      console.error('Error killing event:', error)
    }
  }

  const handleReviveEvent = async () => {
    try {
      const eventId = firstProposal?.eventId
      if (!eventId) {
        console.error('No eventId found')
        return
      }
      await reviveEventMutation.mutateAsync(eventId)
    } catch (error) {
      console.error('Error reviving event:', error)
    }
  }
  
  // Confirmer la propagation de startDate aux courses
  const confirmDatePropagation = async () => {
    if (!datePropagationModal) return
    
    const newStartDate = datePropagationModal.newStartDate
    
    // Appliquer la nouvelle startDate à l'édition via le hook
    updateFieldEditor('startDate', newStartDate)
    setSelectedChanges(prev => ({ ...prev, startDate: newStartDate }))
    
    // Propager à toutes les courses (utiliser la structure raceEdits compatible avec RacesChangesTable)
    const firstProposal = groupProposals[0]
    const newRaceEdits: Record<string, Record<string, any>> = {}
    const existingRaceEdits = workingGroup?.userModifiedChanges?.raceEdits || {}
    
    // Courses existantes (existingRaces)
    const existingRaces = firstProposal?.existingRaces || []
    if (Array.isArray(existingRaces)) {
      existingRaces.forEach((_: any, index: number) => {
        const key = `existing-${index}`
        newRaceEdits[key] = {
          ...(existingRaceEdits[key] || {}),
          startDate: newStartDate
        }
      })
    }
    
    // Nouvelles courses (racesToAdd)
    const changes = firstProposal?.changes
    const races = changes?.racesToAdd?.new || changes?.racesToAdd || changes?.races || []
    if (Array.isArray(races)) {
      races.forEach((_: any, index: number) => {
        const key = `new-${index}`
        newRaceEdits[key] = {
          ...(existingRaceEdits[key] || {}),
          startDate: newStartDate
        }
      })
    }
      
      // Sauvegarder via updateProposal pour synchroniser avec le backend (seulement si on a des modifications)
      if (Object.keys(newRaceEdits).length > 0 && firstProposal?.id) {
        try {
          await updateProposalMutation.mutateAsync({
            id: firstProposal.id,
            userModifiedChanges: {
              ...(workingGroup?.userModifiedChanges || {}),
              raceEdits: {
                ...(workingGroup?.userModifiedChanges?.raceEdits || {}),
                ...newRaceEdits
              }
            }
          })
        } catch (error) {
          console.error('Error updating race dates:', error)
        }
      }
    
    setDatePropagationModal(null)
  }
  
  // Confirmer la mise à jour de Edition.startDate/endDate depuis une course
  const confirmEditionDateUpdate = () => {
    if (!editionDateUpdateModal) return
    
    const { dateType, newRaceDate, raceIndex } = editionDateUpdateModal
    
    // Mettre à jour la date de l'édition via le hook
    updateFieldEditor(dateType, newRaceDate)
    setSelectedChanges(prev => ({ ...prev, [dateType]: newRaceDate }))
    
    // Appliquer aussi la modification de la course via le hook
    updateRaceEditor(raceIndex.toString(), 'startDate', newRaceDate)
    
    setEditionDateUpdateModal(null)
  }

  // Calculs pour l'interface
  const firstProposal = groupProposals[0]
  const eventId = firstProposal?.eventId
  const eventStatus = firstProposal?.eventStatus
  const isEventDead = eventStatus === 'DEAD'

  const proposalsWithValidConfidence = groupProposals.filter(p => p.confidence !== undefined && p.confidence !== null && p.confidence > 0)
  const averageConfidence = proposalsWithValidConfidence.length > 0
    ? proposalsWithValidConfidence.reduce((sum, p) => sum + p.confidence!, 0) / proposalsWithValidConfidence.length
    : 0
  const allPending = groupProposals.every(p => p.status === 'PENDING')
  
  // Identifier les propositions par bloc
  // ✅ Phase 2 Étape 3 : Utiliser workingGroup si disponible
  const blockProposals = useMemo(() => {
    const blocks: Record<string, string[]> = {}
    
    // Utiliser les données consolidées du hook si disponibles, sinon fallback
    const changes = workingGroup?.consolidatedChanges || consolidatedChanges
    const raceChanges = workingGroup?.consolidatedRaces || consolidatedRaceChangesWithCascade
    const proposals = workingGroup?.originalProposals || groupProposals
    
    // Bloc Event - uniquement les champs appartenant à l'événement
    if (isNewEvent || proposals[0]?.type === 'EVENT_UPDATE') {
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
  
  // Hook de validation par blocs (APRÈS blockProposals pour éviter la dépendance circulaire)
  // ✅ Phase 2 Étape 3 : Utiliser workingGroup si disponible
  
  // Extraire les valeurs proposées depuis consolidatedChanges pour le payload
  const proposedValues = useMemo(() => {
    if (!workingGroup) return selectedChanges
    
    const values: Record<string, any> = {}
    workingGroup.consolidatedChanges.forEach(change => {
      // Prendre la selectedValue si elle existe, sinon la première option
      const value = change.selectedValue !== undefined 
        ? change.selectedValue 
        : change.options[0]?.proposedValue
      
      if (value !== undefined) {
        values[change.field] = value
      }
    })
    return values
  }, [workingGroup, selectedChanges])
  
  const {
    blockStatus,
    validateBlock: validateBlockBase,
    unvalidateBlock: unvalidateBlockBase,
    validateAllBlocks: validateAllBlocksBase,
    unvalidateAllBlocks,
    isBlockValidated,
    hasValidatedBlocks,
    isPending: isBlockPending
  } = useBlockValidation({
    proposals: workingGroup?.originalProposals || groupProposals,
    blockProposals,
    // Passer les valeurs proposées + modifiées pour construire le payload complet
    selectedChanges: proposedValues, // ✅ Valeurs proposées ou sélectionnées
    userModifiedChanges: workingGroup?.userModifiedChanges || {},
    userModifiedRaceChanges: workingGroup?.userModifiedRaceChanges || {}
  })
  
  // Wrapper pour logger les validations de blocs
  const validateBlock = async (blockKey: string, proposalIds: string[]) => {
    await validateBlockBase(blockKey, proposalIds)
  }
  
  const unvalidateBlock = async (blockKey: string) => {
    await unvalidateBlockBase(blockKey)
  }
  
  const hasApproved = groupProposals.some(p => p.status === 'APPROVED')
  const allApproved = groupProposals.every(p => p.status === 'APPROVED')

  // Context pour le render
  // ✅ Phase 2 Step 6 : Utiliser workingGroup exclusivement
  const context: GroupedProposalContext = {
    // Données consolidées depuis le hook (ou fallback)
    groupProposals: workingGroup?.originalProposals || groupProposals,
    consolidatedChanges: workingGroup?.consolidatedChanges || consolidatedChanges,
    consolidatedRaceChanges: workingGroup?.consolidatedRaces || consolidatedRaceChangesWithCascade,
    
    // États de modifications utilisateur depuis le hook
    selectedChanges: workingGroup ? {} : selectedChanges, // ✅ Plus besoin en mode hook, les valeurs sont dans consolidatedChanges[i].selectedValue
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
    averageConfidence,
    allPending,
    hasApproved,
    allApproved,
    editionTimezone,
    isNewEvent,
    killDialogOpen,
    setKillDialogOpen,
    isEditionCanceled,
    isReadOnly: false, // ✅ PHASE 3: Édition activée dans la vue groupée
    
    // Validation par blocs
    validateBlock,
    unvalidateBlock,
    validateAllBlocks: () => validateAllBlocksBase(blockProposals),
    isBlockValidated,
    isBlockPending,
    blockProposals
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
          showValidateAllBlocksButton={allPending && !isEventDead && Object.keys(blockProposals).length > 0}
          onValidateAllBlocks={() => validateAllBlocksBase(blockProposals)}
          showUnvalidateAllBlocksButton={hasValidatedBlocks()}
          onUnvalidateAllBlocks={unvalidateAllBlocks}
          isValidateAllBlocksPending={isBlockPending}
          showKillEventButton={allPending && !isEventDead && !isNewEvent && Boolean(eventId)}
          onKillEvent={() => setKillDialogOpen(true)}
          showArchiveButton={allPending}
          onArchive={handleArchive}
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
            label: allPending ? 'En attente' : 'Traité',
            color: allPending ? 'warning' : 'default'
          },
          {
            label: `${Math.round((averageConfidence || 0) * 100)}% confiance`,
            color: (averageConfidence || 0) > 0.8 ? 'success' : (averageConfidence || 0) > 0.6 ? 'warning' : 'error'
          }
        ]}
        {...customHeaderProps}
      />

      <Grid container spacing={3}>
        <Grid item xs={12} md={renderSidebar ? 8 : 12}>
          {renderMainContent(context)}
        </Grid>
        
        {renderSidebar && (
          <Grid item xs={12} md={4}>
            {renderSidebar(context)}
          </Grid>
        )}
      </Grid>

      {/* Dialog de confirmation pour tuer l'événement */}
      <Dialog open={killDialogOpen} onClose={() => setKillDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tuer l'événement</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 2 }}>
            Êtes-vous sûr de vouloir tuer cet événement ? Cette action :
          </Typography>
          <Typography component="ul" sx={{ mt: 2, pl: 2 }}>
            <li>Marque l'événement comme DEAD dans la base de données</li>
            <li>Rend tous les tableaux non éditables</li>
            <li>Empêche toute approbation de proposition</li>
            <li>Peut être annulée avec le bouton "Ressusciter l'événement"</li>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKillDialogOpen(false)}>Annuler</Button>
          <Button
            onClick={handleKillEvent}
            color="error"
            variant="contained"
            disabled={killEventMutation.isPending}
          >
            Tuer l'événement
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Modale de confirmation pour propager Edition.startDate aux courses */}
      {datePropagationModal && (
        <ConfirmDatePropagationModal
          open={datePropagationModal.open}
          onClose={() => {
            // Annuler = appliquer juste à l'édition sans propager via le hook
            updateFieldEditor('startDate', datePropagationModal.newStartDate)
            setSelectedChanges(prev => ({ ...prev, startDate: datePropagationModal.newStartDate }))
            setDatePropagationModal(null)
          }}
          onConfirm={confirmDatePropagation}
          newStartDate={datePropagationModal.newStartDate}
          affectedRacesCount={(() => {
            const firstProposal = groupProposals[0]
            const changes = firstProposal?.changes
            const existingRaces = firstProposal?.existingRaces || []
            const racesToAdd = changes?.racesToAdd?.new || changes?.racesToAdd || changes?.races || []
            const racesToUpdate = changes?.racesToUpdate?.new || changes?.racesToUpdate || []
            return existingRaces.length + (Array.isArray(racesToAdd) ? racesToAdd.length : 0) + (Array.isArray(racesToUpdate) ? racesToUpdate.length : 0)
          })()}
        />
      )}
      
      {/* Modale de confirmation pour mettre à jour Edition.startDate/endDate depuis une course */}
      {editionDateUpdateModal && (
        <ConfirmEditionDateUpdateModal
          open={editionDateUpdateModal.open}
          onClose={() => {
            // Annuler = appliquer juste la modification de la course via le hook
            const { raceIndex, newRaceDate } = editionDateUpdateModal
            updateRaceEditor(raceIndex.toString(), 'startDate', newRaceDate)
            setEditionDateUpdateModal(null)
          }}
          onConfirm={confirmEditionDateUpdate}
          dateType={editionDateUpdateModal.dateType}
          currentEditionDate={editionDateUpdateModal.currentEditionDate}
          newRaceDate={editionDateUpdateModal.newRaceDate}
          raceName={editionDateUpdateModal.raceName}
        />
      )}
    </Box>
  )
}

export default GroupedProposalDetailBase
