import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Button,
  Typography
} from '@mui/material'
import ProposalHeader from '@/components/proposals/ProposalHeader'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'
import { useProposalLogic } from '@/hooks/useProposalLogic'
import { 
  useProposal,
  useProposals, 
  useUpdateProposal, 
  useUnapproveProposal, 
  useKillEvent, 
  useReviveEvent
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
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaceChanges: RaceChange[]
  selectedChanges: Record<string, any>
  userModifiedChanges: Record<string, any>
  userModifiedRaceChanges: Record<number, Record<string, any>>
  handleFieldSelect: (fieldName: string, value: any) => void
  handleFieldModify: (fieldName: string, newValue: any, reason?: string) => void
  handleApproveAll: () => Promise<void>
  handleRejectAll: () => Promise<void>
  handleRaceFieldModify: (raceIndex: number, fieldName: string, newValue: any) => void
  handleKillEvent: () => Promise<void>
  handleReviveEvent: () => Promise<void>
  formatValue: (value: any, isSimple?: boolean, timezone?: string) => React.ReactNode
  formatAgentsList: (agents: Array<{agentName: string, confidence: number}>) => string
  getEventTitle: (proposal: any, isNewEvent: boolean) => string
  getEditionYear: (proposal: any) => string | undefined
  isLoading: boolean
  isPending: boolean
  isEventDead: boolean
  editionTimezone: string
  isNewEvent: boolean
  allPending: boolean
  hasApproved: boolean
  killDialogOpen: boolean
  setKillDialogOpen: (open: boolean) => void
  isEditionCanceled: boolean
}

export interface ProposalDetailBaseProps {
  proposalId: string
  renderMainContent: (context: ProposalContext) => React.ReactNode
  renderSidebar?: (context: ProposalContext) => React.ReactNode
  customHeaderProps?: Partial<React.ComponentProps<typeof ProposalHeader>>
  hideNavigation?: boolean
}

const ProposalDetailBase: React.FC<ProposalDetailBaseProps> = ({ 
  proposalId,
  renderMainContent,
  renderSidebar,
  customHeaderProps,
  hideNavigation = false
}) => {
  const navigate = useNavigate()
  const [killDialogOpen, setKillDialogOpen] = useState(false)
  const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
  const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<number, Record<string, any>>>({})
  
  // Hooks API
  const { data: proposalData, isLoading } = useProposal(proposalId)
  const { data: allProposalsData } = useProposals({}, 100)
  const updateProposalMutation = useUpdateProposal()
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
  
  // Navigation
  const isNewEvent = Boolean(proposalData?.data?.type === 'NEW_EVENT')
  
  const allProposals = allProposalsData?.data || []
  const currentIndex = allProposals.findIndex(p => p.id === proposalId)
  const canGoToPrev = currentIndex > 0
  const canGoToNext = currentIndex >= 0 && currentIndex < allProposals.length - 1
  
  const navigateToProposal = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex >= 0 && newIndex < allProposals.length) {
      navigate(`/proposals/${allProposals[newIndex].id}`)
    }
  }
  
  // Extraire la timezone de l'édition
  const editionTimezone = useMemo(() => {
    if (selectedChanges.timeZone) {
      return selectedChanges.timeZone
    }
    
    if (!proposalData?.data?.changes) return 'Europe/Paris'
    const changes = proposalData.data.changes as any
    
    if (changes.timeZone) {
      if (typeof changes.timeZone === 'string') return changes.timeZone
      if (typeof changes.timeZone === 'object' && 'proposed' in changes.timeZone) return changes.timeZone.proposed
      if (typeof changes.timeZone === 'object' && 'new' in changes.timeZone) return changes.timeZone.new
      if (typeof changes.timeZone === 'object' && 'current' in changes.timeZone) return changes.timeZone.current
    }
    return 'Europe/Paris'
  }, [proposalData, selectedChanges.timeZone])
  
  // Consolider les changements
  const consolidatedChanges = useMemo(() => {
    if (!proposalData?.data) return []
    
    const changes = consolidateChanges([proposalData.data], isNewEvent)
    const isEventUpdateDisplay = proposalData.data.type === 'EVENT_UPDATE'
    
    if (!isEventUpdateDisplay) {
      // Ajouter timeZone si absent
      const hasTimezone = changes.some(c => c.field === 'timeZone')
      if (!hasTimezone) {
        changes.unshift({
          field: 'timeZone',
          options: [{
            proposalId: proposalData.data.id,
            agentName: proposalData.data.agent.name,
            proposedValue: editionTimezone,
            confidence: 1,
            createdAt: proposalData.data.createdAt
          }],
          currentValue: editionTimezone
        })
      }
      
      // Ajouter calendarStatus si absent
      const hasCalendarStatus = changes.some(c => c.field === 'calendarStatus')
      if (!hasCalendarStatus) {
        const currentCalendarStatus = (proposalData.data.changes as any)?.calendarStatus?.current || 'TO_BE_CONFIRMED'
        changes.unshift({
          field: 'calendarStatus',
          options: [{
            proposalId: proposalData.data.id,
            agentName: 'Système',
            proposedValue: 'CONFIRMED',
            confidence: 1,
            createdAt: proposalData.data.createdAt
          }],
          currentValue: currentCalendarStatus
        })
      }
      
      // Ajouter endDate si absent et startDate présent
      const hasEndDate = changes.some(c => c.field === 'endDate')
      const startDateChange = changes.find(c => c.field === 'startDate')
      if (!hasEndDate && startDateChange) {
        const proposedStartDate = startDateChange.options[0]?.proposedValue
        const currentEndDate = (proposalData.data.changes as any)?.endDate
        
        changes.push({
          field: 'endDate',
          options: [{
            proposalId: proposalData.data.id,
            agentName: proposalData.data.agent.name,
            proposedValue: proposedStartDate,
            confidence: 1,
            createdAt: proposalData.data.createdAt
          }],
          currentValue: currentEndDate || null
        })
      }
    }
    
    return isEventUpdateDisplay
      ? changes.filter(c => c.field !== 'calendarStatus' && c.field !== 'timeZone')
      : changes
  }, [proposalData, isNewEvent, consolidateChanges, editionTimezone])
  
  const isEditionCanceled = useMemo(() => {
    const calendarStatus = userModifiedChanges['calendarStatus'] || 
                          selectedChanges['calendarStatus'] || 
                          consolidatedChanges.find(c => c.field === 'calendarStatus')?.options[0]?.proposedValue
    return calendarStatus === 'CANCELED'
  }, [selectedChanges, userModifiedChanges, consolidatedChanges])
  
  const consolidatedRaceChanges = useMemo(() => {
    if (!proposalData?.data) return []
    return consolidateRaceChanges([proposalData.data])
  }, [proposalData, consolidateRaceChanges])
  
  // Auto-sélection des meilleures valeurs au chargement
  React.useEffect(() => {
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
  const handleApproveAll = async () => {
    try {
      const changesToApprove = { ...proposalData!.data!.changes }
      Object.entries(selectedChanges).forEach(([field, selectedValue]) => {
        if (changesToApprove[field]) {
          changesToApprove[field] = selectedValue
        }
      })
      
      await updateProposalMutation.mutateAsync({
        id: proposalData!.data!.id,
        status: 'APPROVED',
        reviewedBy: 'Utilisateur',
        appliedChanges: changesToApprove,
        userModifiedChanges: Object.keys(userModifiedChanges).length > 0 ? userModifiedChanges : undefined,
        modificationReason: 'Modifications manuelles appliquées',
        modifiedBy: 'Utilisateur'
      })
    } catch (error) {
      console.error('Error approving proposal:', error)
    }
  }
  
  const handleRejectAll = async () => {
    try {
      await updateProposalMutation.mutateAsync({
        id: proposalData!.data!.id,
        status: 'REJECTED',
        reviewedBy: 'Utilisateur'
      })
    } catch (error) {
      console.error('Error rejecting proposal:', error)
    }
  }
  
  const handleUnapprove = async () => {
    try {
      await unapproveProposalMutation.mutateAsync(proposalData!.data!.id)
    } catch (error) {
      console.error('Error unapproving proposal:', error)
    }
  }
  
  const handleKillEvent = async () => {
    try {
      const eventId = proposalData?.data?.eventId
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
      const eventId = proposalData?.data?.eventId
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
  const proposal = proposalData?.data
  const eventId = proposal?.eventId
  const eventStatus = proposal?.eventStatus
  const isEventDead = eventStatus === 'DEAD'
  const allPending = proposal?.status === 'PENDING'
  const hasApproved = proposal?.status === 'APPROVED'
  
  // Context pour le render
  const context: ProposalContext = {
    proposal: proposal!,
    consolidatedChanges,
    consolidatedRaceChanges,
    selectedChanges,
    userModifiedChanges,
    userModifiedRaceChanges,
    handleFieldSelect: handleSelectField,
    handleFieldModify,
    handleApproveAll,
    handleRejectAll,
    handleRaceFieldModify,
    handleKillEvent,
    handleReviveEvent,
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear,
    isLoading,
    isPending: updateProposalMutation.isPending,
    isEventDead,
    editionTimezone,
    isNewEvent,
    allPending,
    hasApproved,
    killDialogOpen,
    setKillDialogOpen,
    isEditionCanceled
  }
  
  if (isLoading) return <LinearProgress />
  
  if (!proposal) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Proposition non trouvée</Alert>
        </CardContent>
      </Card>
    )
  }
  
  const isEventUpdateDisplay = proposal.type === 'EVENT_UPDATE'
  
  return (
    <Box>
      {!hideNavigation && (
        <ProposalNavigation
          navigation={{
            hasPrevious: canGoToPrev,
            hasNext: canGoToNext,
            onPrevious: () => navigateToProposal('prev'),
            onNext: () => navigateToProposal('next')
          }}
          showArchiveButton={false}
          showUnapproveButton={hasApproved}
          onUnapprove={handleUnapprove}
          disabled={updateProposalMutation.isPending || unapproveProposalMutation.isPending}
          showBackButton={true}
        />
      )}
      
      <ProposalHeader
        title={isNewEvent ? 'Nouvel événement proposé' : 'Proposition de modification'}
        eventTitle={!isNewEvent && proposal.eventId ? (getEventTitle(proposal, isNewEvent) || `Event ID: ${proposal.eventId}`) : undefined}
        editionYear={!isNewEvent && !isEventUpdateDisplay && proposal.editionId ? (getEditionYear(proposal) ? `${getEditionYear(proposal)} (${proposal.editionId})` : `Edition ID: ${proposal.editionId}`) : undefined}
        chips={[
          {
            label: allPending ? 'En attente' : hasApproved ? 'Approuvé' : 'Traité',
            color: allPending ? 'warning' : hasApproved ? 'success' : 'default'
          },
          {
            label: `${Math.round((proposal.confidence || 0) * 100)}% confiance`,
            color: (proposal.confidence || 0) > 0.8 ? 'success' : (proposal.confidence || 0) > 0.6 ? 'warning' : 'error'
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

export default ProposalDetailBase
