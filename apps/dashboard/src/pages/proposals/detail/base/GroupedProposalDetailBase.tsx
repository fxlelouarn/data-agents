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
import ProposalHeader from '@/components/proposals/ProposalHeader'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'
import { useProposalLogic } from '@/hooks/useProposalLogic'
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

export interface RaceChange {
  raceIndex: number
  raceName: string
  proposalIds: string[]
  fields: Record<string, any>
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
  consolidatedRaceChanges: RaceChange[]
  averageConfidence: number
  allPending: boolean
  hasApproved: boolean
  allApproved: boolean
  editionTimezone: string
  isNewEvent: boolean
  getEventTitle: (proposal: any, isNewEvent: boolean) => string
  getEditionYear: (proposal: any) => string | undefined
  // Actions spécifiques aux courses
  handleApproveRace: (raceData: any) => Promise<void>
  handleApproveAllRaces: () => Promise<void>
  handleRejectAllRaces: () => Promise<void>
  handleRaceFieldModify: (raceIndex: number, fieldName: string, newValue: any) => void
  userModifiedRaceChanges: Record<number, Record<string, any>>
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
  const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
  const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<number, Record<string, any>>>({})
  
  // Hooks API
  const { data: groupProposalsData, isLoading } = useProposalGroup(groupKey || '')
  const { data: allProposalsData } = useProposals({}, 100)
  const updateProposalMutation = useUpdateProposal()
  const bulkArchiveMutation = useBulkArchiveProposals()
  const unapproveProposalMutation = useUnapproveProposal()
  const killEventMutation = useKillEvent()
  const reviveEventMutation = useReviveEvent()
  
  const {
    selectedChanges,
    setSelectedChanges,
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear,
    consolidateChanges,
    consolidateRaceChanges
  } = useProposalLogic()
  
  
  // Handlers
  const handleSelectField = (fieldName: string, selectedValue: any) => {
    setSelectedChanges(prev => ({ ...prev, [fieldName]: selectedValue }))
  }
  
  const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
    setUserModifiedChanges(prev => ({
      ...prev,
      [fieldName]: newValue
    }))
    
    setSelectedChanges(prev => ({
      ...prev,
      [fieldName]: newValue
    }))
  }
  
  const handleRaceFieldModify = (raceIndex: number, fieldName: string, newValue: any) => {
    setUserModifiedRaceChanges(prev => ({
      ...prev,
      [raceIndex]: {
        ...prev[raceIndex],
        [fieldName]: newValue
      }
    }))
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

  // Navigation
  const isNewEvent = Boolean(groupKey?.startsWith('new-event-'))
  
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

  // Récupérer les propositions du groupe
  const groupProposals = useMemo(() => {
    if (!groupProposalsData?.data || !groupKey) return []
    
    return groupProposalsData.data.sort((a, b) => {
      const confidenceA = a.confidence || 0
      const confidenceB = b.confidence || 0
      return confidenceB - confidenceA
    })
  }, [groupProposalsData?.data, groupKey])
  
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

  // Consolider les changements
  const consolidatedChanges = useMemo(() => {
    const changes = consolidateChanges(groupProposals, isNewEvent)
    const isEventUpdateDisplay = groupProposals.length > 0 && groupProposals[0]?.type === 'EVENT_UPDATE'
    
    // Filtrer calendarStatus et timeZone pour EVENT_UPDATE uniquement
    return isEventUpdateDisplay
      ? changes.filter(c => c.field !== 'calendarStatus' && c.field !== 'timeZone')
      : changes
  }, [groupProposals, isNewEvent, consolidateChanges])
  
  // Déterminer si l'édition est annulée
  const isEditionCanceled = useMemo(() => {
    const calendarStatus = userModifiedChanges['calendarStatus'] || 
                          selectedChanges['calendarStatus'] || 
                          consolidatedChanges.find(c => c.field === 'calendarStatus')?.options[0]?.proposedValue
    return calendarStatus === 'CANCELED'
  }, [selectedChanges, userModifiedChanges, consolidatedChanges])
  
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
  
  // Ref pour éviter les boucles infinies
  const lastComputedDatesRef = useRef<{startDate?: string, endDate?: string}>({})
  
  // Ajuster automatiquement startDate et endDate si des courses sont modifiées
  useEffect(() => {
    const hasManualStartDate = userModifiedChanges['startDate'] !== undefined
    const hasManualEndDate = userModifiedChanges['endDate'] !== undefined
    
    if (hasManualStartDate && hasManualEndDate) {
      return
    }
    
    const raceStartDates: Date[] = []
    
    consolidatedRaceChangesWithCascade.forEach(raceChange => {
      const startDateField = raceChange.fields['startDate']
      if (startDateField) {
        const modifiedDate = userModifiedRaceChanges[raceChange.raceIndex]?.['startDate']
        const dateValue = modifiedDate || startDateField.options[0]?.proposedValue
        if (dateValue) {
          raceStartDates.push(new Date(dateValue))
        }
      }
    })
    
    if (raceStartDates.length > 0) {
      const minRaceDate = new Date(Math.min(...raceStartDates.map(d => d.getTime())))
      const maxRaceDate = new Date(Math.max(...raceStartDates.map(d => d.getTime())))
      
      const updates: Record<string, string> = {}
      
      if (!hasManualStartDate) {
        const newStartDate = minRaceDate.toISOString()
        if (newStartDate !== lastComputedDatesRef.current.startDate) {
          updates.startDate = newStartDate
        }
      }
      
      if (!hasManualEndDate) {
        const newEndDate = maxRaceDate.toISOString()
        if (newEndDate !== lastComputedDatesRef.current.endDate) {
          updates.endDate = newEndDate
        }
      }
      
      if (Object.keys(updates).length > 0) {
        lastComputedDatesRef.current = { ...lastComputedDatesRef.current, ...updates }
        setSelectedChanges(prev => ({
          ...prev,
          ...updates
        }))
      }
    }
  }, [consolidatedRaceChangesWithCascade, userModifiedRaceChanges, userModifiedChanges])

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
              appliedChanges: { [`races[${raceData.raceIndex}]`]: raceInProposal }
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
                appliedChanges: { [`races[${raceChange.raceIndex}]`]: raceInProposal }
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
              userModifiedChanges: Object.keys(userModifiedChanges).length > 0 ? userModifiedChanges : undefined,
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

  const handleUnapproveAll = async () => {
    try {
      const approvedProposals = groupProposals.filter(p => p.status === 'APPROVED')
      for (const proposal of approvedProposals) {
        await unapproveProposalMutation.mutateAsync(proposal.id)
      }
      
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
    } catch (error) {
      console.error('Error unapproving proposals:', error)
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
  const blockProposals = useMemo(() => {
    const blocks: Record<string, string[]> = {}
    
    // Bloc Edition
    const editionProposalIds = groupProposals
      .filter(p => consolidatedChanges.some(c => 
        !['organizer', 'racesToAdd'].includes(c.field) &&
        c.options.some(o => o.proposalId === p.id)
      ))
      .map(p => p.id)
    if (editionProposalIds.length > 0) {
      blocks['edition'] = editionProposalIds
      console.log('[DEBUG] Bloc Edition:', editionProposalIds)
    }

    // Bloc Organisateur
    const organizerProposalIds = groupProposals
      .filter(p => consolidatedChanges.some(c => 
        c.field === 'organizer' &&
        c.options.some(o => o.proposalId === p.id)
      ))
      .map(p => p.id)
    if (organizerProposalIds.length > 0) {
      blocks['organizer'] = organizerProposalIds
    }

    // Bloc Courses
    const raceProposalIds = groupProposals
      .filter(p => consolidatedRaceChangesWithCascade.some(rc =>
        rc.proposalIds.includes(p.id)
      ))
      .map(p => p.id)
    if (raceProposalIds.length > 0) {
      blocks['races'] = raceProposalIds
    }

    // Bloc Événement (si NEW_EVENT ou EVENT_UPDATE)
    if (isNewEvent || groupProposals[0]?.type === 'EVENT_UPDATE') {
      blocks['event'] = groupProposals
        .filter(p => ['NEW_EVENT', 'EVENT_UPDATE'].includes(p.type))
        .map(p => p.id)
    }

    return blocks
  }, [groupProposals, consolidatedChanges, consolidatedRaceChangesWithCascade, isNewEvent])
  
  // Hook de validation par blocs (APRÈS blockProposals pour éviter la dépendance circulaire)
  const {
    blockStatus,
    validateBlock,
    unvalidateBlock,
    validateAllBlocks: validateAllBlocksBase,
    isBlockValidated,
    isPending: isBlockPending
  } = useBlockValidation({
    proposals: groupProposals,
    blockProposals
  })
  
  const hasApproved = groupProposals.some(p => p.status === 'APPROVED')
  const allApproved = groupProposals.every(p => p.status === 'APPROVED')

  // Context pour le render
  const context: GroupedProposalContext = {
    groupProposals,
    consolidatedChanges,
    consolidatedRaceChanges: consolidatedRaceChangesWithCascade,
    selectedChanges,
    userModifiedChanges,
    userModifiedRaceChanges,
    handleFieldSelect: handleSelectField,
    handleFieldModify,
    handleApproveField,
    handleApproveAll,
    handleRejectAll,
    handleApproveRace,
    handleApproveAllRaces,
    handleRejectAllRaces,
    handleRaceFieldModify,
    handleKillEvent,
    handleReviveEvent,
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear,
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
          isValidateAllBlocksPending={isBlockPending}
          // showApproveAllButton={allPending && !isEventDead}  // ❌ OBSOLETE - Remplacé par validation par blocs
          // onApproveAll={handleApproveAll}                      // ❌ OBSOLETE - Remplacé par validation par blocs
          showKillEventButton={allPending && !isEventDead && !isNewEvent && Boolean(eventId)}
          onKillEvent={() => setKillDialogOpen(true)}
          showArchiveButton={allPending}
          onArchive={handleArchive}
          showUnapproveButton={hasApproved}
          onUnapprove={handleUnapproveAll}
          disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || unapproveProposalMutation.isPending}
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
    </Box>
  )
}

export default GroupedProposalDetailBase
