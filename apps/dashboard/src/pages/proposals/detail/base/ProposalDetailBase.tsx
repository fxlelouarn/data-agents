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
import { useBlockValidation } from '@/hooks/useBlockValidation'
import { useProposalEditor, ConsolidatedRaceChange, isGroupReturn } from '@/hooks/useProposalEditor'
import {
  useProposal,
  useProposals,
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

export interface ProposalContext {
  proposal: Proposal
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaceChanges: ConsolidatedRaceChange[]
  selectedChanges: Record<string, any>
  userModifiedChanges: Record<string, any>
  userModifiedRaceChanges: Record<string, Record<string, any>>
  handleFieldSelect: (fieldName: string, value: any) => void
  handleFieldModify: (fieldName: string, newValue: any, reason?: string) => void
  handleEditionStartDateChange: (fieldName: string, newValue: any) => void
  handleApproveAll: () => Promise<void>
  handleRejectAll: () => Promise<void>
  handleRaceFieldModify: (raceId: string, fieldName: string, newValue: any) => void
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
  isReadOnly: boolean // ⚠️ PHASE 3: Flag pour désactiver toute édition
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

  // ⚠️ PHASE 3: ProposalDetailBase est maintenant LECTURE SEULE
  // Toute édition doit passer par GroupedProposalDetailBase (même pour 1 proposition)

  // Hooks API (lecture seule)
  const { data: proposalData, isLoading } = useProposal(proposalId)
  const { data: allProposalsData } = useProposals({}, 100)
  const unapproveProposalMutation = useUnapproveProposal()
  const killEventMutation = useKillEvent()
  const reviveEventMutation = useReviveEvent()

  // Fonctions utilitaires pour l'affichage
  const {
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear
  } = useProposalLogic()

  // Utiliser useProposalEditor pour la consolidation (lecture seule)
  const editorResult = useProposalEditor(proposalId, { autosave: false })
  const workingProposal = !isGroupReturn(editorResult) ? editorResult.workingProposal : null

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

  // Définir proposal avant de l'utiliser
  const proposal = proposalData?.data

  // Extraire la timezone de l'édition (lecture seule)
  const editionTimezone = useMemo(() => {
    if (!proposalData?.data?.changes) return 'Europe/Paris'
    const changes = proposalData.data.changes as any

    // 1. Chercher dans changes.timeZone
    if (changes.timeZone) {
      if (typeof changes.timeZone === 'string') return changes.timeZone
      if (typeof changes.timeZone === 'object' && 'proposed' in changes.timeZone) return changes.timeZone.proposed
      if (typeof changes.timeZone === 'object' && 'new' in changes.timeZone) return changes.timeZone.new
      if (typeof changes.timeZone === 'object' && 'current' in changes.timeZone) return changes.timeZone.current
    }

    // 2. Chercher dans racesToUpdate[].currentData.timeZone
    const racesToUpdate = changes.racesToUpdate?.new || changes.racesToUpdate
    if (Array.isArray(racesToUpdate) && racesToUpdate.length > 0) {
      const firstRaceTimezone = racesToUpdate[0]?.currentData?.timeZone
      if (firstRaceTimezone) {
        return firstRaceTimezone
      }
    }

    return 'Europe/Paris'
  }, [proposalData])

  // Consolider les changements (lecture seule - utilise useProposalEditor)
  const consolidatedChanges = useMemo(() => {
    if (!workingProposal) return []

    // Extraire les changements consolidés depuis workingProposal
    const changes: ConsolidatedChange[] = Object.entries(workingProposal.changes).map(([field, value]) => ({
      field,
      options: [{
        proposalId: workingProposal.id,
        agentName: workingProposal.originalProposal.agent?.name || 'Agent',
        proposedValue: value,
        confidence: workingProposal.originalProposal.confidence || 0,
        createdAt: workingProposal.originalProposal.createdAt
      }],
      currentValue: undefined // Pas de currentValue en mode simple
    }))

    const isEventUpdateDisplay = proposalData?.data?.type === 'EVENT_UPDATE'
    return isEventUpdateDisplay
      ? changes.filter(c => c.field !== 'calendarStatus' && c.field !== 'timeZone')
      : changes
  }, [workingProposal, proposalData])

  const isEditionCanceled = useMemo(() => {
    const calendarStatus = consolidatedChanges.find(c => c.field === 'calendarStatus')?.options[0]?.proposedValue
    return calendarStatus === 'CANCELED'
  }, [consolidatedChanges])

  // Consolider les courses (lecture seule - utilise useProposalEditor)
  const consolidatedRaceChanges: ConsolidatedRaceChange[] = useMemo(() => {
    if (!workingProposal) return []

    // ✅ Extraire originalFields depuis currentData (ajouté dans FFA Scraper + Google Agent)
    const racesCurrentData: Record<string, any> = {}
    const proposalChanges = workingProposal.originalProposal.changes as any

    if (proposalChanges.racesToUpdate && typeof proposalChanges.racesToUpdate === 'object') {
      const racesToUpdateValue = proposalChanges.racesToUpdate.new || proposalChanges.racesToUpdate
      if (Array.isArray(racesToUpdateValue)) {
        racesToUpdateValue.forEach((raceUpdate: any) => {
          if (raceUpdate.currentData && raceUpdate.raceId) {
            racesCurrentData[raceUpdate.raceId.toString()] = raceUpdate.currentData
          }
        })
      }
    }

    // Extraire les courses consolidées depuis workingProposal
    return Object.entries(workingProposal.races).map(([raceId, raceData]) => ({
      raceId,
      raceName: (raceData as any).name || 'Course',
      proposalIds: [workingProposal.id],
      originalFields: racesCurrentData[raceId] || {}, // ✅ Depuis currentData
      fields: {
        // Convertir les champs de course en format ConsolidatedChange
        ...(Object.fromEntries(
          Object.entries(raceData).map(([field, value]) => [
            field,
            {
              field,
              options: [{
                proposalId: workingProposal.id,
                agentName: workingProposal.originalProposal.agent?.name || 'Agent',
                proposedValue: value,
                confidence: workingProposal.originalProposal.confidence || 0,
                createdAt: workingProposal.originalProposal.createdAt
              }],
              currentValue: undefined
            }
          ])
        ))
      },
      userModifications: undefined
    }))
  }, [workingProposal])

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
      }
    }

    // Bloc Edition - uniquement les champs appartenant à l'édition
    const hasEditionChanges = consolidatedChanges.some(c =>
      isFieldInBlock(c.field, 'edition')
    )
    if (hasEditionChanges) {
      blocks['edition'] = [proposal.id]
    }

    // Bloc Organisateur
    const hasOrganizerChange = consolidatedChanges.some(c =>
      isFieldInBlock(c.field, 'organizer')
    )
    if (hasOrganizerChange) {
      blocks['organizer'] = [proposal.id]
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
    }

    return blocks
  }, [proposal, consolidatedChanges, consolidatedRaceChanges, isNewEvent])

  // ⚠️ Validation par blocs : Lecture seule (pas d'édition)
  // Hook de validation désactivé car ProposalDetailBase est maintenant lecture seule
  const {
    validateBlock: validateBlockBase,
    unvalidateBlock: unvalidateBlockBase,
    isBlockValidated,
    isPending: isBlockPending
  } = useBlockValidation({
    proposals: proposal ? [proposal] : [],
    blockProposals,
    selectedChanges: {}, // Vide - lecture seule
    userModifiedChanges: {}, // Vide - lecture seule
    userModifiedRaceChanges: {} // Vide - lecture seule
  })

  // Wrappers (lecture seule)
  const validateBlock = async (blockKey: string, proposalIds: string[]) => {
    await validateBlockBase(blockKey, proposalIds)
  }

  const unvalidateBlock = async (blockKey: string) => {
    await unvalidateBlockBase(blockKey)
  }

  // ⚠️ Actions désactivées (lecture seule)
  // Pour éditer, l'utilisateur doit cliquer sur "Editer cette proposition"
  const handleApproveAll = async () => {
    console.warn('⚠️ ProposalDetailBase est en lecture seule. Utilisez GroupedProposalDetailBase pour éditer.')
  }

  const handleRejectAll = async () => {
    console.warn('⚠️ ProposalDetailBase est en lecture seule. Utilisez GroupedProposalDetailBase pour éditer.')
  }

  const handleUnapprove = async () => {
    return new Promise<void>((resolve, reject) => {
      unapproveProposalMutation.mutate(proposalData!.data!.id, {
        onSuccess: () => resolve(),
        onError: (error) => {
          console.error('Error unapproving proposal:', error)
          reject(error)
        }
      })
    })
  }

  const handleKillEvent = async () => {
    const eventId = proposalData?.data?.eventId
    if (!eventId) {
      console.error('No eventId found')
      return
    }

    killEventMutation.mutate(eventId, {
      onSuccess: () => {
        setKillDialogOpen(false)
      },
      onError: (error) => {
        console.error('Error killing event:', error)
      }
    })
  }

  const handleReviveEvent = async () => {
    const eventId = proposalData?.data?.eventId
    if (!eventId) {
      console.error('No eventId found')
      return
    }

    reviveEventMutation.mutate(eventId, {
      onError: (error) => {
        console.error('Error reviving event:', error)
      }
    })
  }

  // Handler pour éditer la proposition (PHASE 3)
  const handleEdit = () => {
    if (!proposal) return

    let groupKey: string
    if (proposal.type === 'NEW_EVENT') {
      // Format: new-event-{proposalId}
      groupKey = `new-event-${proposalId}`
    } else {
      // Format: {eventId}-{editionId}
      groupKey = `${proposal.eventId}-${proposal.editionId}`
    }

    navigate(`/proposals/group/${groupKey}`)
  }

  // Calculs pour l'interface
  const eventId = proposal?.eventId
  const eventStatus = proposal?.eventStatus
  const isEventDead = eventStatus === 'DEAD'
  const allPending = proposal?.status === 'PENDING'
  const hasApproved = proposal?.status === 'APPROVED'

  // ⚠️ Context pour le render (lecture seule)
  const context: ProposalContext = {
    proposal: proposal!,
    consolidatedChanges,
    consolidatedRaceChanges,

    // ⚠️ États vides (lecture seule)
    selectedChanges: {},
    userModifiedChanges: {},
    userModifiedRaceChanges: {},

    // ⚠️ Handlers désactivés (lecture seule)
    handleFieldSelect: () => console.warn('⚠️ Lecture seule'),
    handleFieldModify: () => console.warn('⚠️ Lecture seule'),
    handleEditionStartDateChange: () => console.warn('⚠️ Lecture seule'),
    handleApproveAll,
    handleRejectAll,
    handleRaceFieldModify: () => console.warn('⚠️ Lecture seule'),
    handleKillEvent,
    handleReviveEvent,

    // Utilitaires (lecture seule)
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear,

    // États UI
    isLoading,
    isPending: false, // Pas d'édition
    isEventDead,
    editionTimezone,
    isNewEvent,
    allPending,
    hasApproved,
    killDialogOpen,
    setKillDialogOpen,
    isEditionCanceled,
    isReadOnly: true, // ⚠️ PHASE 3: Désactiver toute édition

    // Validation par blocs (lecture seule)
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
          showEditButton={true}
          onEdit={handleEdit}
          showValidateAllBlocksButton={false} // Désactivé en lecture seule
          onValidateAllBlocks={async () => {}}
          showUnvalidateAllBlocksButton={false} // Désactivé en lecture seule
          onUnvalidateAllBlocks={async () => {}}
          isValidateAllBlocksPending={false}
          showArchiveButton={false}
          disabled={false}
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
