import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Chip,
  Alert,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Stack,
  Skeleton,
} from '@mui/material'
import {
  Merge as MergeIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Archive as ArchiveIcon,
  Event as EventIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  CalendarMonth as CalendarMonthIcon,
  OpenInNew as OpenInNewIcon,
  DirectionsRun as DirectionsRunIcon,
} from '@mui/icons-material'
import { useUpdateProposal, useEventDetails, useUpdates } from '@/hooks/useApi'
import { proposalStatusLabels, proposalStatusColors } from '@/constants/proposals'
import { Proposal } from '@/types'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'

interface EventMergeDetailProps {
  proposal: Proposal
}

interface EditionInfo {
  id: number
  year: number
}

interface RaceInfo {
  id: number
  name: string
  runDistance: number | null
  runPositiveElevation: number | null
  categoryLevel1: string | null
  categoryLevel2: string | null
}

interface EditionWithRaces extends EditionInfo {
  calendarStatus?: string
  races?: RaceInfo[]
}

// Helper pour formater les infos d'une course
const formatRaceInfo = (race: RaceInfo): string => {
  const parts: string[] = []
  if (race.runDistance) {
    parts.push(`${race.runDistance} km`)
  }
  if (race.runPositiveElevation) {
    parts.push(`D+${race.runPositiveElevation}m`)
  }
  return parts.length > 0 ? parts.join(' • ') : ''
}

// Helper pour obtenir le label du calendarStatus
const getCalendarStatusLabel = (status: string | undefined): { label: string; color: 'success' | 'warning' | 'error' | 'default' } => {
  switch (status) {
    case 'LIVE':
      return { label: 'Live', color: 'success' }
    case 'VALIDATED':
      return { label: 'Validé', color: 'success' }
    case 'PENDING':
      return { label: 'En attente', color: 'warning' }
    case 'CANCELLED':
      return { label: 'Annulé', color: 'error' }
    case 'DRAFT':
      return { label: 'Brouillon', color: 'default' }
    default:
      return { label: status || 'N/A', color: 'default' }
  }
}

const EventMergeDetail: React.FC<EventMergeDetailProps> = ({ proposal }) => {
  const navigate = useNavigate()
  const updateMutation = useUpdateProposal()

  // Récupérer les mises à jour liées à cette proposition
  const { data: updatesData } = useUpdates({}, 100, 0)
  const relatedUpdates = React.useMemo(() => {
    if (!updatesData?.data) return []
    return updatesData.data.filter((u: any) => u.proposalId === proposal.id)
  }, [updatesData, proposal.id])

  // Extraire les données de fusion depuis changes
  const mergeData = (proposal.changes as any)?.merge || {}
  const {
    keepEventId,
    keepEventName,
    keepEventCity,
    keepEventEditionsCount,
    keepEventEditions: storedKeepEditions,
    duplicateEventId,
    duplicateEventName,
    duplicateEventCity,
    duplicateEventEditionsCount,
    duplicateEventEditions: storedDuplicateEditions,
    newEventName,
    copyMissingEditions,
    editionsToCopy,
  } = mergeData

  // Récupérer les éditions depuis l'API si non stockées dans la proposition
  const { data: keepEventData, isLoading: isLoadingKeep } = useEventDetails(
    !storedKeepEditions && keepEventId ? keepEventId : null
  )
  const { data: duplicateEventData, isLoading: isLoadingDuplicate } = useEventDetails(
    !storedDuplicateEditions && duplicateEventId ? duplicateEventId : null
  )

  const isPending = proposal.status === 'PENDING'
  const isApproved = proposal.status === 'APPROVED'
  const isRejected = proposal.status === 'REJECTED'
  const isArchived = proposal.status === 'ARCHIVED'

  const handleApprove = () => {
    updateMutation.mutate({ id: proposal.id, status: 'APPROVED' })
  }

  const handleReject = () => {
    updateMutation.mutate({ id: proposal.id, status: 'REJECTED' })
  }

  const handleArchive = () => {
    updateMutation.mutate({ id: proposal.id, status: 'ARCHIVED' })
  }

  const handleViewUpdates = () => {
    if (relatedUpdates.length > 0) {
      navigate(`/updates/group/${relatedUpdates[0].id}`)
    }
  }

  const isLoading = updateMutation.isPending
  const isLoadingEditions = isLoadingKeep || isLoadingDuplicate

  // Utiliser les éditions stockées ou celles récupérées via API (avec infos complètes)
  const keepEventEditions: EditionWithRaces[] = storedKeepEditions || keepEventData?.editions?.map((e: any) => ({
    id: e.id,
    year: e.year,
    calendarStatus: e.calendarStatus,
    races: e.races
  })) || []
  const duplicateEventEditions: EditionWithRaces[] = storedDuplicateEditions || duplicateEventData?.editions?.map((e: any) => ({
    id: e.id,
    year: e.year,
    calendarStatus: e.calendarStatus,
    races: e.races
  })) || []

  // Récupérer les slugs pour les liens Miles Republic
  const keepEventSlug = keepEventData?.slug
  const duplicateEventSlug = duplicateEventData?.slug

  // Construire l'URL Miles Republic
  const getMilesRepublicUrl = (slug: string | null | undefined, eventId: number) => {
    if (slug) {
      return `https://fr.milesrepublic.com/event/${slug}-${eventId}`
    }
    return null
  }

  // Trier les éditions par année décroissante
  const sortedKeepEditions = keepEventEditions
    .slice()
    .sort((a, b) => b.year - a.year)
  const sortedDuplicateEditions = duplicateEventEditions
    .slice()
    .sort((a, b) => b.year - a.year)
  const sortedEditionsToCopy = (editionsToCopy as EditionInfo[] || [])
    .slice()
    .sort((a, b) => b.year - a.year)

  // Édition la plus récente pour afficher les courses
  const latestKeepEdition = sortedKeepEditions[0]
  const latestDuplicateEdition = sortedDuplicateEditions[0]

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Navigation */}
      <ProposalNavigation
        showBackButton={true}
        onBack={() => navigate('/proposals')}
        showArchiveButton={isPending}
        onArchive={handleArchive}
        showUpdatesButton={isApproved && relatedUpdates.length > 0}
        onViewUpdates={handleViewUpdates}
        updatesCount={relatedUpdates.length}
        disabled={isLoading}
      />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <MergeIcon color="warning" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h5">
              Proposition de fusion d'événements
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ID: {proposal.id}
            </Typography>
          </Box>
        </Box>
        <Chip
          label={proposalStatusLabels[proposal.status] || proposal.status}
          color={proposalStatusColors[proposal.status] as any || 'default'}
          size="medium"
        />
      </Box>

      {/* Résumé de la fusion */}
      <Alert
        severity={isApproved ? 'success' : isRejected ? 'error' : 'warning'}
        sx={{ mb: 3 }}
        icon={<MergeIcon />}
      >
        <Typography variant="body1">
          <strong>Fusion :</strong> L'événement "{duplicateEventName}" (ID: {duplicateEventId})
          sera fusionné dans "{keepEventName}" (ID: {keepEventId})
        </Typography>
        {newEventName && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Le nom de l'événement conservé sera changé en : <strong>"{newEventName}"</strong>
          </Typography>
        )}
      </Alert>

      {/* Détails des deux événements */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Événement à conserver */}
        <Grid item xs={12} md={6}>
          <Card
            variant="outlined"
            sx={{
              borderColor: 'success.main',
              borderWidth: 2,
              height: '100%'
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CheckCircleIcon color="success" />
                <Typography variant="h6" color="success.main">
                  Événement conservé
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <EventIcon color="primary" />
                {getMilesRepublicUrl(keepEventSlug, keepEventId) ? (
                  <Typography
                    component="a"
                    href={getMilesRepublicUrl(keepEventSlug, keepEventId)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="subtitle1"
                    fontWeight="bold"
                    sx={{
                      color: 'primary.main',
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5
                    }}
                  >
                    {newEventName || keepEventName}
                    <OpenInNewIcon fontSize="small" sx={{ opacity: 0.7 }} />
                  </Typography>
                ) : (
                  <Typography variant="subtitle1" fontWeight="bold">
                    {newEventName || keepEventName}
                  </Typography>
                )}
              </Box>

              {newEventName && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, ml: 4 }}>
                  (Ancien nom : {keepEventName})
                </Typography>
              )}

              <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
                {keepEventCity} • ID: {keepEventId}
              </Typography>

              {/* Liste des éditions */}
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CalendarMonthIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  Éditions ({keepEventEditionsCount || sortedKeepEditions.length}{copyMissingEditions && sortedEditionsToCopy.length > 0 ? ` + ${sortedEditionsToCopy.length}` : ''}) :
                </Typography>
              </Box>
              {isLoadingEditions ? (
                <Skeleton variant="rectangular" height={32} sx={{ borderRadius: 1 }} />
              ) : (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ gap: 0.5 }}>
                  {/* Éditions existantes avec calendarStatus */}
                  {sortedKeepEditions.map((edition: EditionWithRaces) => {
                    const statusInfo = getCalendarStatusLabel(edition.calendarStatus)
                    return (
                      <Chip
                        key={edition.id}
                        label={`${edition.year} (${statusInfo.label})`}
                        size="small"
                        variant="outlined"
                        color={statusInfo.color}
                      />
                    )
                  })}
                  {/* Éditions qui seront ajoutées */}
                  {copyMissingEditions && sortedEditionsToCopy.map((edition: EditionInfo) => (
                    <Chip
                      key={`new-${edition.id}`}
                      label={edition.year}
                      size="small"
                      color="info"
                      icon={<AddIcon />}
                    />
                  ))}
                </Stack>
              )}

              {/* Courses de l'édition la plus récente */}
              {latestKeepEdition?.races && latestKeepEdition.races.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <DirectionsRunIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      Courses {latestKeepEdition.year} ({latestKeepEdition.races.length}) :
                    </Typography>
                  </Box>
                  <Stack spacing={0.5}>
                    {latestKeepEdition.races.slice(0, 5).map((race: RaceInfo) => (
                      <Typography key={race.id} variant="body2" sx={{ ml: 3 }}>
                        • {race.name} {formatRaceInfo(race) && <Typography component="span" color="text.secondary">({formatRaceInfo(race)})</Typography>}
                      </Typography>
                    ))}
                    {latestKeepEdition.races.length > 5 && (
                      <Typography variant="body2" color="text.secondary" sx={{ ml: 3 }}>
                        ... et {latestKeepEdition.races.length - 5} autres courses
                      </Typography>
                    )}
                  </Stack>
                </>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="body2" color="text.secondary">
                Cet événement recevra l'ID de redirection (oldSlugId) de l'événement doublon.
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Événement doublon */}
        <Grid item xs={12} md={6}>
          <Card
            variant="outlined"
            sx={{
              borderColor: 'error.main',
              borderWidth: 2,
              height: '100%',
              opacity: 0.9
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <DeleteIcon color="error" />
                <Typography variant="h6" color="error.main">
                  Événement doublon (sera supprimé)
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <EventIcon color="disabled" />
                {getMilesRepublicUrl(duplicateEventSlug, duplicateEventId) ? (
                  <Typography
                    component="a"
                    href={getMilesRepublicUrl(duplicateEventSlug, duplicateEventId)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="subtitle1"
                    fontWeight="bold"
                    sx={{
                      textDecoration: 'line-through',
                      color: 'text.secondary',
                      '&:hover': { color: 'primary.main' },
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5
                    }}
                  >
                    {duplicateEventName}
                    <OpenInNewIcon fontSize="small" sx={{ opacity: 0.7 }} />
                  </Typography>
                ) : (
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                    {duplicateEventName}
                  </Typography>
                )}
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
                {duplicateEventCity} • ID: {duplicateEventId}
              </Typography>

              {/* Liste des éditions */}
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CalendarMonthIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  Éditions ({duplicateEventEditionsCount || sortedDuplicateEditions.length}) :
                </Typography>
              </Box>
              {isLoadingEditions ? (
                <Skeleton variant="rectangular" height={32} sx={{ borderRadius: 1 }} />
              ) : (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ gap: 0.5 }}>
                  {sortedDuplicateEditions.map((edition: EditionWithRaces) => {
                    const statusInfo = getCalendarStatusLabel(edition.calendarStatus)
                    return (
                      <Chip
                        key={edition.id}
                        label={`${edition.year} (${statusInfo.label})`}
                        size="small"
                        variant="outlined"
                        color="default"
                      />
                    )
                  })}
                </Stack>
              )}

              {/* Courses de l'édition la plus récente */}
              {latestDuplicateEdition?.races && latestDuplicateEdition.races.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <DirectionsRunIcon fontSize="small" color="action" />
                    <Typography variant="body2" color="text.secondary">
                      Courses {latestDuplicateEdition.year} ({latestDuplicateEdition.races.length}) :
                    </Typography>
                  </Box>
                  <Stack spacing={0.5}>
                    {latestDuplicateEdition.races.slice(0, 5).map((race: RaceInfo) => (
                      <Typography key={race.id} variant="body2" sx={{ ml: 3 }}>
                        • {race.name} {formatRaceInfo(race) && <Typography component="span" color="text.secondary">({formatRaceInfo(race)})</Typography>}
                      </Typography>
                    ))}
                    {latestDuplicateEdition.races.length > 5 && (
                      <Typography variant="body2" color="text.secondary" sx={{ ml: 3 }}>
                        ... et {latestDuplicateEdition.races.length - 5} autres courses
                      </Typography>
                    )}
                  </Stack>
                </>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="body2" color="text.secondary">
                Cet événement sera marqué comme <strong>DELETED</strong>.
                {copyMissingEditions && sortedEditionsToCopy.length > 0
                  ? ' Les éditions marquées seront copiées vers l\'événement conservé.'
                  : ' Ses éditions resteront liées mais ne seront plus accessibles.'
                }
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Justification */}
      {proposal.justification && Array.isArray(proposal.justification) && proposal.justification.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Justification
          </Typography>
          <List dense disablePadding>
            {(proposal.justification as any[]).map((j, idx) => (
              <ListItem key={idx} disablePadding sx={{ py: 0.5 }}>
                <ListItemText
                  primary={j.message}
                  secondary={j.type}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Boutons d'action */}
      {isPending && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Actions
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              color="success"
              startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
              onClick={handleApprove}
              disabled={isLoading}
            >
              Approuver
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <CancelIcon />}
              onClick={handleReject}
              disabled={isLoading}
            >
              Rejeter
            </Button>
          </Box>
        </Paper>
      )}

      {/* Statut final */}
      {isApproved && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Cette proposition a été approuvée. L'application de la fusion sera visible dans la page "Mises à jour".
        </Alert>
      )}

      {isRejected && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Cette proposition a été rejetée.
        </Alert>
      )}

      {isArchived && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Cette proposition a été archivée.
        </Alert>
      )}
    </Box>
  )
}

export default EventMergeDetail
