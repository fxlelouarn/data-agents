import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Button,
  Paper,
  Divider,
  Grid,
  LinearProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  ArrowBack as BackIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  HourglassEmpty as PendingIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { useUpdates, useApplyUpdate, useReplayUpdate, useDeleteUpdate } from '@/hooks/useApi'
import { DataUpdate, UpdateStatus } from '@/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import BlockChangesTable from '@/components/updates/BlockChangesTable'
import { sortBlocksByDependencies, explainExecutionOrder } from '@/utils/block-execution-order'

const UpdateGroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set())

  // Récupérer toutes les updates et filtrer par proposalIds
  const { data: updatesData, isLoading, error } = useUpdates({}, 1000, 0)
  const applyUpdateMutation = useApplyUpdate()
  const replayUpdateMutation = useReplayUpdate()
  const deleteUpdateMutation = useDeleteUpdate()

  // Trouver l'update correspondant au groupId
  const targetUpdate = React.useMemo(() => {
    if (!updatesData?.data || !groupId) return null
    return (updatesData.data as DataUpdate[]).find(app => app.id === groupId)
  }, [updatesData, groupId])

  // Filtrer les updates appartenant à ce groupe
  const groupUpdates = React.useMemo(() => {
    if (!targetUpdate || !updatesData?.data) return []

    const proposalIds = targetUpdate.proposalIds || (targetUpdate.proposalId ? [targetUpdate.proposalId] : [])

    return (updatesData.data as DataUpdate[]).filter(app => {
      const appProposalIds = app.proposalIds || [app.proposalId]
      return proposalIds.some(id => appProposalIds.includes(id))
    })
  }, [updatesData, targetUpdate])

  // Métadonnées du groupe
  const groupMetadata = React.useMemo(() => {
    if (groupUpdates.length === 0) return null

    const firstApp = groupUpdates[0]
    const blocks = [...new Set(groupUpdates.map(a => a.blockType).filter(Boolean))] as string[]
    const hasAnyPending = groupUpdates.some(a => a.status === 'PENDING')
    const allApplied = groupUpdates.every(a => a.status === 'APPLIED')

    return {
      eventName: firstApp.context?.eventName || firstApp.proposal?.eventName || 'Événement',
      eventId: firstApp.proposal?.eventId,
      editionYear: firstApp.context?.editionYear,
      editionId: firstApp.proposal?.editionId,
      proposalType: firstApp.proposal?.type,
      agentName: firstApp.proposal?.agent?.name,
      blocks,
      status: hasAnyPending ? 'PENDING' : allApplied ? 'APPLIED' : 'FAILED',
      createdAt: firstApp.scheduledAt,
    }
  }, [groupUpdates])

  const handleToggleApp = (appId: string) => {
    setExpandedApps(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(appId)) {
        newExpanded.delete(appId)
      } else {
        newExpanded.add(appId)
      }
      return newExpanded
    })
  }

  const handleApplyUpdate = async (updateId: string) => {
    try {
      await applyUpdateMutation.mutateAsync(updateId)
    } catch (error) {
      console.error('Error applying update:', error)
    }
  }

  const handleDeleteUpdate = async (updateId: string) => {
    try {
      await deleteUpdateMutation.mutateAsync(updateId)
      // Retour à la liste si toutes les apps sont supprimées
      if (groupUpdates.length === 1) {
        navigate('/updates')
      }
    } catch (error) {
      console.error('Error deleting update:', error)
    }
  }

  const handleApplyAllBlocks = async () => {
    try {
      const pendingApps = groupUpdates.filter(a => a.status === 'PENDING')

      // ✅ Tri topologique pour respecter les dépendances (event → edition → organizer → races)
      const sortedApps = sortBlocksByDependencies(
        pendingApps.map(app => ({
          blockType: app.blockType as any,
          id: app.id
        }))
      )

      console.log('📋 ' + explainExecutionOrder(sortedApps))
      console.log('   Applications:', sortedApps.map(a => `${a.blockType}(${a.id.slice(-6)})`).join(', '))

      // Appliquer tous les blocs en séquence (ordre respecté)
      for (const app of sortedApps) {
        console.log(`  → Application bloc "${app.blockType || 'unknown'}"...`)
        await applyUpdateMutation.mutateAsync(app.id)
      }

      console.log('✅ Tous les blocs appliqués avec succès')
    } catch (error) {
      console.error('Error applying all blocks:', error)
    }
  }

  const handleReplayAllBlocks = async () => {
    try {
      const failedApps = groupUpdates.filter(a => a.status === 'FAILED')

      // ✅ Tri topologique pour respecter les dépendances (event → edition → organizer → races)
      const sortedApps = sortBlocksByDependencies(
        failedApps.map(app => ({
          blockType: app.blockType as any,
          id: app.id
        }))
      )

      console.log('🔄 Rejeu - ' + explainExecutionOrder(sortedApps))
      console.log('   Applications:', sortedApps.map(a => `${a.blockType}(${a.id.slice(-6)})`).join(', '))

      // Rejouer tous les blocs en erreur en séquence (ordre respecté)
      for (const app of sortedApps) {
        console.log(`  → Rejeu bloc "${app.blockType || 'unknown'}"...`)
        // 1. Reset à PENDING via /replay
        await replayUpdateMutation.mutateAsync(app.id)
        // 2. Appliquer via /apply
        await applyUpdateMutation.mutateAsync(app.id)
      }

      console.log('✅ Tous les blocs rejoués avec succès')
    } catch (error) {
      console.error('Error replaying all blocks:', error)
    }
  }

  const getStatusColor = (status: UpdateStatus) => {
    switch (status) {
      case 'PENDING':
        return 'warning'
      case 'APPLIED':
        return 'success'
      case 'FAILED':
        return 'error'
      default:
        return 'default'
    }
  }

  const getStatusLabel = (status: UpdateStatus) => {
    switch (status) {
      case 'PENDING':
        return 'En attente'
      case 'APPLIED':
        return 'Appliquée'
      case 'FAILED':
        return 'Échec'
      default:
        return status
    }
  }

  const getStatusIcon = (status: UpdateStatus) => {
    switch (status) {
      case 'PENDING':
        return <PendingIcon />
      case 'APPLIED':
        return <CheckCircleIcon />
      case 'FAILED':
        return <CancelIcon />
      default:
        return null
    }
  }

  const blockLabels: Record<string, string> = {
    event: 'Événement',
    edition: 'Édition',
    organizer: 'Organisateur',
    races: 'Courses',
  }

  if (isLoading) return <LinearProgress />

  if (error || !groupMetadata) {
    return (
      <Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/updates')} sx={{ mb: 2 }}>
          Retour
        </Button>
        <Alert severity="error">Erreur lors du chargement du groupe de mises à jour</Alert>
      </Box>
    )
  }

  return (
    <Box>
      {/* Barre de navigation (style ProposalNavigation) */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        {/* Gauche: Bouton retour */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<BackIcon />}
            onClick={() => navigate('/updates')}
          >
            Retour
          </Button>
        </Box>

        {/* Droite: Actions principales */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {/* Bouton "Rejouer tous les blocs" si au moins un bloc en erreur */}
          {groupUpdates.some(a => a.status === 'FAILED') && (
            <Button
              variant="contained"
              color="error"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleReplayAllBlocks}
              disabled={replayUpdateMutation.isPending || applyUpdateMutation.isPending}
            >
              Rejouer tous les blocs
            </Button>
          )}

          {/* Bouton "Appliquer tous les blocs" si au moins un bloc en attente */}
          {groupUpdates.some(a => a.status === 'PENDING') && (
            <Button
              variant="contained"
              color="success"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleApplyAllBlocks}
              disabled={applyUpdateMutation.isPending}
            >
              Appliquer tous les blocs
            </Button>
          )}

          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              // Construire l'URL de la proposition groupée : eventId-editionId
              if (groupMetadata?.eventId && groupMetadata?.editionId) {
                navigate(`/proposals/group/${groupMetadata.eventId}-${groupMetadata.editionId}`)
              }
            }}
            disabled={!groupMetadata?.eventId || !groupMetadata?.editionId}
          >
            Voir la proposition
          </Button>
        </Box>
      </Box>

      {/* Header: Titre + Badge */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            {groupMetadata.eventName}
            {groupMetadata.eventId && (
              <Typography component="span" variant="h6" color="text.secondary" sx={{ ml: 1 }}>
                (ID: {groupMetadata.eventId})
              </Typography>
            )}
          </Typography>
          <Chip
            label={getStatusLabel(groupMetadata.status as UpdateStatus)}
            color={getStatusColor(groupMetadata.status as UpdateStatus) as any}
            icon={getStatusIcon(groupMetadata.status as UpdateStatus) || undefined}
          />
        </Box>

        {groupMetadata.editionYear && (
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            Édition {groupMetadata.editionYear}
            {groupMetadata.editionId && (
              <Typography component="span" variant="body2" sx={{ ml: 1 }}>
                (ID: {groupMetadata.editionId})
              </Typography>
            )}
          </Typography>
        )}
      </Box>

      {/* Métadonnées */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary" display="block">
                Agent
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {groupMetadata.agentName}
              </Typography>
            </Grid>

            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary" display="block">
                Type de proposition
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {groupMetadata.proposalType}
              </Typography>
            </Grid>

            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary" display="block">
                Blocs modifiés
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                {groupMetadata.blocks.map(block => (
                  <Chip
                    key={block}
                    label={blockLabels[block] || block}
                    size="small"
                    variant="outlined"
                  />
                ))}
                {groupMetadata.blocks.length === 0 && (
                  <Chip label="Tous les blocs" size="small" variant="outlined" />
                )}
              </Box>
            </Grid>

            <Grid item xs={12} md={3}>
              <Typography variant="caption" color="text.secondary" display="block">
                Date de création
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {groupMetadata.createdAt
                  ? format(new Date(groupMetadata.createdAt), 'dd/MM/yyyy HH:mm', { locale: fr })
                  : '-'}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Statistiques */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {groupUpdates.filter(a => a.status === 'PENDING').length} application(s) en attente
            </Typography>
            <Typography variant="body2" color="text.secondary">
              •
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {groupUpdates.filter(a => a.status === 'APPLIED').length} application(s) appliquée(s)
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Liste des applications */}
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
        Applications individuelles ({groupUpdates.length})
      </Typography>

      {groupUpdates.map((app, index) => {
        const isExpanded = expandedApps.has(app.id)

        return (
          <Accordion
            key={app.id}
            expanded={isExpanded}
            onChange={() => handleToggleApp(app.id)}
            sx={{ mb: 2 }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 2 }}>
                {/* Bloc */}
                {app.blockType && (
                  <Chip
                    label={blockLabels[app.blockType as string] || app.blockType}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}

                {/* Statut */}
                <Chip
                  label={getStatusLabel(app.status)}
                  color={getStatusColor(app.status) as any}
                  size="small"
                  icon={getStatusIcon(app.status) || undefined}
                />

                {/* Dates */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {app.appliedAt && (
                    <Typography variant="body2" color="text.secondary">
                      Appliquée le{' '}
                      {format(new Date(app.appliedAt), 'dd/MM/yyyy HH:mm', { locale: fr })}
                    </Typography>
                  )}
                </Box>

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 1 }} onClick={e => e.stopPropagation()}>
                  {app.status === 'PENDING' && (
                    <Tooltip title="Appliquer maintenant">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleApplyUpdate(app.id)}
                        disabled={applyUpdateMutation.isPending}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}

                  {app.status === 'FAILED' && (
                    <Tooltip title="Rejouer">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={async () => {
                          try {
                            // 1. Reset à PENDING via /replay
                            await replayUpdateMutation.mutateAsync(app.id)
                            // 2. Appliquer via /apply
                            await applyUpdateMutation.mutateAsync(app.id)
                          } catch (error) {
                            console.error('Error replaying block:', error)
                          }
                        }}
                        disabled={replayUpdateMutation.isPending || applyUpdateMutation.isPending}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}

                  {app.status === 'APPLIED' && (
                    <Tooltip title="Supprimer">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteUpdate(app.id)}
                        disabled={deleteUpdateMutation.isPending}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={{ bgcolor: 'action.hover' }}>
              {/* Détails des changements avec BlockChangesTable */}
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  Changements
                </Typography>

                {app.blockType ? (
                  <BlockChangesTable
                    blockType={app.blockType}
                    appliedChanges={app.appliedChanges}  // ✅ NOUVEAU: Payload complet
                    isApplied={app.status === 'APPLIED'}  // ✅ Indicateur visuel

                    // ⚠️ LEGACY: Fallback pour applications anciennes
                    changes={!app.appliedChanges ? app.proposal?.changes : undefined}
                    userModifiedChanges={!app.appliedChanges ? app.proposal?.userModifiedChanges : undefined}
                  />
                ) : (
                  // Fallback pour applications legacy sans blockType
                  app.appliedChanges && Object.keys(app.appliedChanges).length > 0 ? (
                    <Box>
                      {Object.entries(app.appliedChanges).map(([key, value]) => (
                        <Box key={key} sx={{ mb: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            {key}
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Aucun changement détaillé disponible
                    </Typography>
                  )
                )}

                {/* Message d'erreur si échec */}
                {app.status === 'FAILED' && app.errorMessage && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    <Typography variant="caption" display="block" sx={{ fontWeight: 600, mb: 0.5 }}>
                      Erreur lors de l'application
                    </Typography>
                    <Typography variant="body2">{app.errorMessage}</Typography>
                  </Alert>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        )
      })}

      {groupUpdates.length === 0 && (
        <Alert severity="info">Aucune application trouvée pour ce groupe</Alert>
      )}
    </Box>
  )
}

export default UpdateGroupDetail
