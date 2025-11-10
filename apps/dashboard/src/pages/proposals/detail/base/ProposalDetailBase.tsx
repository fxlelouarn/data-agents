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
import ConfirmDatePropagationModal from '@/components/proposals/modals/ConfirmDatePropagationModal'
import ConfirmEditionDateUpdateModal from '@/components/proposals/modals/ConfirmEditionDateUpdateModal'
import ProposalHeader from '@/components/proposals/ProposalHeader'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'
import { useProposalLogic } from '@/hooks/useProposalLogic'
import { useBlockValidation } from '@/hooks/useBlockValidation'
import { 
  useProposal,
  useProposals, 
  useUpdateProposal, 
  useUnapproveProposal, 
  useKillEvent, 
  useReviveEvent
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
  handleEditionStartDateChange: (fieldName: string, newValue: any) => void
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
  // Validation par blocs
  validateBlock: (blockKey: string, proposalIds: string[]) => Promise<void>
  unvalidateBlock: (blockKey: string) => Promise<void>
  isBlockValidated: (blockKey: string) => boolean
  isBlockPending: boolean
  blockProposals: Record<string, string[]>
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
  
  // Handler pour la modification de Edition.startDate (déclaré en premier car utilisé par handleSelectField)
  const handleEditionStartDateChange = (fieldName: string, newValue: any) => {
    if (fieldName !== 'startDate' || !newValue) {
      // Pas startDate, appliquer directement
      setUserModifiedChanges(prev => ({ ...prev, [fieldName]: newValue }))
      setSelectedChanges(prev => ({ ...prev, [fieldName]: newValue }))
      return
    }
    
    // Compter les courses proposées (supporter plusieurs structures)
    const changes = proposalData?.data?.changes
    const existingRaces = proposalData?.data?.existingRaces || []
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
      setUserModifiedChanges(prev => ({ ...prev, [fieldName]: newValue }))
      setSelectedChanges(prev => ({ ...prev, [fieldName]: newValue }))
    }
  }
  
  // Handlers
  const handleSelectField = (fieldName: string, selectedValue: any) => {
    // Si c'est startDate, déléguer à handleEditionStartDateChange
    if (fieldName === 'startDate') {
      handleEditionStartDateChange(fieldName, selectedValue)
    } else {
      setSelectedChanges(prev => ({ ...prev, [fieldName]: selectedValue }))
    }
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
    // Si c'est une modification de startDate d'une course, vérifier si elle sort de la plage d'édition
    if (fieldName === 'startDate' && newValue) {
      const newRaceDate = new Date(newValue)
      const currentStartDate = selectedChanges.startDate || consolidatedChanges.find(c => c.field === 'startDate')?.options[0]?.proposedValue
      const currentEndDate = selectedChanges.endDate || consolidatedChanges.find(c => c.field === 'endDate')?.options[0]?.proposedValue
      
      // Récupérer le nom de la course
      const races = proposalData?.data?.changes?.racesToAdd || proposalData?.data?.changes?.races || []
      const raceName = races[raceIndex]?.name || `Course ${raceIndex + 1}`
      
      // Si la course est AVANT la startDate de l'édition
      if (currentStartDate && newRaceDate < new Date(currentStartDate)) {
        setEditionDateUpdateModal({
          open: true,
          dateType: 'startDate',
          currentEditionDate: currentStartDate,
          newRaceDate: newValue,
          raceName,
          raceIndex
        })
        return // Attendre la confirmation avant de sauvegarder
      }
      
      // Si la course est APRÈS la endDate de l'édition
      if (currentEndDate && newRaceDate > new Date(currentEndDate)) {
        setEditionDateUpdateModal({
          open: true,
          dateType: 'endDate',
          currentEditionDate: currentEndDate,
          newRaceDate: newValue,
          raceName,
          raceIndex
        })
        return // Attendre la confirmation avant de sauvegarder
      }
    }
    
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
    
    // Filtrer calendarStatus et timeZone pour EVENT_UPDATE uniquement
    return isEventUpdateDisplay
      ? changes.filter(c => c.field !== 'calendarStatus' && c.field !== 'timeZone')
      : changes
  }, [proposalData, isNewEvent, consolidateChanges])
  
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
  
  // Définir proposal avant de l'utiliser
  const proposal = proposalData?.data
  
  // Identifier les propositions par bloc (pour propositions individuelles)
  const blockProposals = useMemo(() => {
    if (!proposal) return {}
    
    const blocks: Record<string, string[]> = {}
    
    // Bloc Event - uniquement les champs appartenant à l'événement
    if (isNewEvent || proposal.type === 'EVENT_UPDATE') {
      const hasEventChanges = consolidatedChanges.some(c => 
        isFieldInBlock(c.field, 'event')
      )
      if (hasEventChanges) {
        blocks['event'] = [proposal.id]
        console.log('[DEBUG] Bloc Event (single):', [proposal.id])
      }
    }
    
    // Bloc Edition - uniquement les champs appartenant à l'édition
    const hasEditionChanges = consolidatedChanges.some(c => 
      isFieldInBlock(c.field, 'edition')
    )
    if (hasEditionChanges) {
      blocks['edition'] = [proposal.id]
      console.log('[DEBUG] Bloc Edition (single):', [proposal.id])
    }
    
    // Bloc Organisateur
    const hasOrganizerChange = consolidatedChanges.some(c => 
      isFieldInBlock(c.field, 'organizer')
    )
    if (hasOrganizerChange) {
      blocks['organizer'] = [proposal.id]
      console.log('[DEBUG] Bloc Organizer (single):', [proposal.id])
    }
    
    // Bloc Courses (modifications de courses existantes OU courses à ajouter)
    const hasRaceChanges = consolidatedRaceChanges.length > 0
    const hasRacesToAdd = consolidatedChanges.some(c => 
      isFieldInBlock(c.field, 'races')
    )
    // Vérifier aussi racesToUpdate (champ de metadata pour les courses proposées par FFA)
    const hasRacesToUpdate = proposal.changes?.racesToUpdate && 
                             Array.isArray(proposal.changes.racesToUpdate) && 
                             proposal.changes.racesToUpdate.length > 0
    // Vérifier aussi existingRaces (courses enrichies pour l'UI)
    const hasExistingRaces = proposal.existingRaces && 
                             Array.isArray(proposal.existingRaces) && 
                             proposal.existingRaces.length > 0
    
    if (hasRaceChanges || hasRacesToAdd || hasRacesToUpdate || hasExistingRaces) {
      blocks['races'] = [proposal.id]
      console.log('[DEBUG] Bloc Courses (single):', [proposal.id])
    }
    
    return blocks
  }, [proposal, consolidatedChanges, consolidatedRaceChanges, isNewEvent])
  
  // Hook de validation par blocs
  const {
    validateBlock,
    unvalidateBlock,
    validateAllBlocks: validateAllBlocksBase,
    unvalidateAllBlocks,
    isBlockValidated,
    hasValidatedBlocks,
    isPending: isBlockPending
  } = useBlockValidation({
    proposals: proposal ? [proposal] : [],
    blockProposals
  })
  
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
  
  // Confirmer la propagation de startDate aux courses
  const confirmDatePropagation = async () => {
    if (!datePropagationModal) return
    
    const newStartDate = datePropagationModal.newStartDate
    
    // Appliquer la nouvelle startDate à l'édition
    setUserModifiedChanges(prev => ({ ...prev, startDate: newStartDate }))
    setSelectedChanges(prev => ({ ...prev, startDate: newStartDate }))
    
    // Propager à toutes les courses (utiliser la structure raceEdits compatible avec RacesChangesTable)
    const newRaceEdits: Record<string, Record<string, any>> = {}
    
    // Courses existantes (existingRaces)
    const existingRaces = proposalData?.data?.existingRaces || []
    if (Array.isArray(existingRaces)) {
      existingRaces.forEach((_: any, index: number) => {
        const key = `existing-${index}`
        newRaceEdits[key] = {
          ...(userModifiedChanges.raceEdits?.[key] || {}),
          startDate: newStartDate
        }
      })
    }
    
    // Nouvelles courses (racesToAdd)
    const changes = proposalData?.data?.changes
    const races = changes?.racesToAdd?.new || changes?.racesToAdd || changes?.races || []
    if (Array.isArray(races)) {
      races.forEach((_: any, index: number) => {
        const key = `new-${index}`
        newRaceEdits[key] = {
          ...(userModifiedChanges.raceEdits?.[key] || {}),
          startDate: newStartDate
        }
      })
    }
      
      // Sauvegarder via updateProposal pour synchroniser avec le backend (seulement si on a des modifications)
      if (Object.keys(newRaceEdits).length > 0 && proposalData?.data?.id) {
        try {
          await updateProposalMutation.mutateAsync({
            id: proposalData.data.id,
            userModifiedChanges: {
              ...userModifiedChanges,
              raceEdits: {
                ...userModifiedChanges.raceEdits,
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
    
    // Mettre à jour la date de l'édition
    setUserModifiedChanges(prev => ({ ...prev, [dateType]: newRaceDate }))
    setSelectedChanges(prev => ({ ...prev, [dateType]: newRaceDate }))
    
    // Appliquer aussi la modification de la course
    setUserModifiedRaceChanges(prev => ({
      ...prev,
      [raceIndex]: {
        ...prev[raceIndex],
        startDate: newRaceDate
      }
    }))
    
    setEditionDateUpdateModal(null)
  }
  
  // Calculs pour l'interface
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
    handleEditionStartDateChange,
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
    isEditionCanceled,
    // Validation par blocs
    validateBlock,
    unvalidateBlock,
    isBlockValidated,
    isBlockPending,
    blockProposals
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
          showValidateAllBlocksButton={allPending && !isEventDead && Object.keys(blockProposals).length > 0}
          onValidateAllBlocks={() => validateAllBlocksBase(blockProposals)}
          showUnvalidateAllBlocksButton={hasValidatedBlocks()}
          onUnvalidateAllBlocks={unvalidateAllBlocks}
          isValidateAllBlocksPending={isBlockPending}
          showArchiveButton={false}
          disabled={updateProposalMutation.isPending}
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
      
      {/* Modale de confirmation pour propager Edition.startDate aux courses */}
      {datePropagationModal && (
        <ConfirmDatePropagationModal
          open={datePropagationModal.open}
          onClose={() => {
            // Annuler = appliquer juste à l'édition sans propager
            setUserModifiedChanges(prev => ({ ...prev, startDate: datePropagationModal.newStartDate }))
            setSelectedChanges(prev => ({ ...prev, startDate: datePropagationModal.newStartDate }))
            setDatePropagationModal(null)
          }}
          onConfirm={confirmDatePropagation}
          newStartDate={datePropagationModal.newStartDate}
          affectedRacesCount={(() => {
            const changes = proposalData?.data?.changes
            const existingRaces = proposalData?.data?.existingRaces || []
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
            // Annuler = appliquer juste la modification de la course
            const { raceIndex, newRaceDate } = editionDateUpdateModal
            setUserModifiedRaceChanges(prev => ({
              ...prev,
              [raceIndex]: {
                ...prev[raceIndex],
                startDate: newRaceDate
              }
            }))
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

export default ProposalDetailBase
