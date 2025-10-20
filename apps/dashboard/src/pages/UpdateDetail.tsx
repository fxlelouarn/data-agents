import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  LinearProgress,
  Alert,
} from '@mui/material'
import {
  PlayArrow as ApplyIcon,
  Delete as DeleteIcon,
  Replay as ReplayIcon,
  Assignment as ProposalIcon,
  SmartToy as AgentIcon,
  Schedule as ScheduleIcon,
  CheckCircle as AppliedIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'
import { useUpdate, useUpdateLogs, useApplyUpdate, useDeleteUpdate, useReplayUpdate, useUpdates } from '@/hooks/useApi'
import { UpdateStatus } from '@/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import UpdateNavigation from '@/components/updates/UpdateNavigation'

const UpdateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [replayError, setReplayError] = useState<string | null>(null)
  
  const { data: updateData, isLoading, error } = useUpdate(id!)
  const { data: logsData } = useUpdateLogs(id!)
  const applyUpdateMutation = useApplyUpdate()
  const deleteUpdateMutation = useDeleteUpdate()
  const replayUpdateMutation = useReplayUpdate()
  
  // Pour la navigation entre mises à jour
  const { data: allUpdatesData } = useUpdates({}, 1000, 0) // Récupérer toutes les mises à jour pour la navigation
  
  // Calculer la position actuelle et les options de navigation
  const currentUpdateIndex = allUpdatesData?.data ? allUpdatesData.data.findIndex(update => update.id === id) : -1
  const hasPrevious = currentUpdateIndex > 0
  const hasNext = allUpdatesData?.data ? currentUpdateIndex < allUpdatesData.data.length - 1 : false

  const handleApplyUpdate = async () => {
    try {
      await applyUpdateMutation.mutateAsync(id!)
    } catch (error) {
      console.error('Error applying update:', error)
    }
  }

  const handleDeleteUpdate = async () => {
    try {
      await deleteUpdateMutation.mutateAsync(id!)
      navigate('/updates')
    } catch (error) {
      console.error('Error deleting update:', error)
    }
  }

  const handlePreviousUpdate = () => {
    if (allUpdatesData?.data && currentUpdateIndex > 0) {
      const prevUpdate = allUpdatesData.data[currentUpdateIndex - 1]
      navigate(`/updates/${prevUpdate.id}`)
    }
  }

  const handleNextUpdate = () => {
    if (allUpdatesData?.data && currentUpdateIndex < allUpdatesData.data.length - 1) {
      const nextUpdate = allUpdatesData.data[currentUpdateIndex + 1]
      navigate(`/updates/${nextUpdate.id}`)
    }
  }

  const handleBackToList = () => {
    navigate('/updates')
  }

  const handleReplayUpdate = async () => {
    setReplayError(null) // Réinitialiser l'erreur
    try {
      // Réinitialiser la mise à jour à PENDING pour permettre le rejeu
      await replayUpdateMutation.mutateAsync(id!)
    } catch (error: any) {
      console.error('Error replaying update:', error)
      setReplayError('Erreur lors du rejeu de la mise à jour.')
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
        return <ScheduleIcon />
      case 'APPLIED':
        return <AppliedIcon />
      case 'FAILED':
        return <ErrorIcon />
      default:
        return null
    }
  }

  const getProposalTypeLabel = (type: string) => {
    switch (type) {
      case 'NEW_EVENT':
        return 'Nouvel événement'
      case 'EVENT_UPDATE':
        return 'Mise à jour événement'
      case 'EDITION_UPDATE':
        return 'Mise à jour édition'
      case 'RACE_UPDATE':
        return 'Mise à jour course'
      default:
        return type
    }
  }

  if (isLoading) return <LinearProgress />

  if (error || !updateData?.data) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Mise à jour non trouvée</Alert>
        </CardContent>
      </Card>
    )
  }

  const update = updateData.data
  const logs = logsData?.data?.logs || []

  return (
    <Box>
      {/* Affichage erreur de replay */}
      {replayError && (
        <Alert severity="error" onClose={() => setReplayError(null)} sx={{ mb: 2 }}>
          {replayError}
        </Alert>
      )}
      
      {/* Navigation et boutons d'action */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UpdateNavigation 
            navigation={{
              hasPrevious,
              hasNext,
              onPrevious: handlePreviousUpdate,
              onNext: handleNextUpdate
            }}
            onBack={handleBackToList}
            disabled={applyUpdateMutation.isPending || deleteUpdateMutation.isPending || replayUpdateMutation.isPending}
          />
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          {/* Boutons selon le statut */}
          {update.status === 'PENDING' && (
            <>
              <Button
                variant="contained"
                size="small"
                startIcon={<ApplyIcon />}
                onClick={handleApplyUpdate}
                disabled={applyUpdateMutation.isPending || deleteUpdateMutation.isPending || replayUpdateMutation.isPending}
                color="primary"
              >
                Appliquer
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={handleDeleteUpdate}
                disabled={applyUpdateMutation.isPending || deleteUpdateMutation.isPending || replayUpdateMutation.isPending}
                color="error"
              >
                Supprimer
              </Button>
            </>
          )}
          
          {update.status === 'FAILED' && (
            <>
              <Button
                variant="contained"
                size="small"
                startIcon={<ReplayIcon />}
                onClick={handleReplayUpdate}
                disabled={applyUpdateMutation.isPending || deleteUpdateMutation.isPending || replayUpdateMutation.isPending}
                color="warning"
              >
                Rejouer
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={handleDeleteUpdate}
                disabled={applyUpdateMutation.isPending || deleteUpdateMutation.isPending || replayUpdateMutation.isPending}
                color="error"
              >
                Supprimer
              </Button>
            </>
          )}
          
          {update.status === 'APPLIED' && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ReplayIcon />}
                onClick={handleReplayUpdate}
                disabled={applyUpdateMutation.isPending || deleteUpdateMutation.isPending || replayUpdateMutation.isPending}
                color="warning"
              >
                Rejouer
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={handleDeleteUpdate}
              disabled={deleteUpdateMutation.isPending || replayUpdateMutation.isPending}
                color="error"
              >
                Supprimer
              </Button>
            </>
          )}
        </Box>
      </Box>
      
      {/* Titre et statut */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Mise à jour {id?.slice(-8)}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={getStatusLabel(update.status)}
            color={getStatusColor(update.status) as any}
            size="medium"
          />
          <Chip
            label={getProposalTypeLabel(update.proposal.type)}
            variant="outlined"
            size="medium"
          />
        </Box>
      </Box>
      
      <Grid container spacing={3}>
        {/* Colonne principale - Informations */}
        <Grid item xs={12} md={8}>
          {/* Informations générales */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                {getStatusIcon(update.status)}
                Statut de la mise à jour
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Chip
                  label={getStatusLabel(update.status)}
                  color={getStatusColor(update.status) as any}
                  size="medium"
                />
                {update.status === 'FAILED' && update.errorMessage && (
                  <Typography variant="body2" color="error.main">
                    {update.errorMessage}
                  </Typography>
                )}
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Créée le</Typography>
                  <Typography variant="body1">
                    {format(new Date(update.createdAt), 'dd/MM/yyyy HH:mm', { locale: fr })}
                  </Typography>
                </Grid>
                {update.scheduledAt && (
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Programmée le</Typography>
                    <Typography variant="body1">
                      {format(new Date(update.scheduledAt), 'dd/MM/yyyy HH:mm', { locale: fr })}
                    </Typography>
                  </Grid>
                )}
                {update.appliedAt && (
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Appliquée le</Typography>
                    <Typography variant="body1">
                      {format(new Date(update.appliedAt), 'dd/MM/yyyy HH:mm', { locale: fr })}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>

          {/* Logs d'exécution */}
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Logs d'exécution
              </Typography>
              
              {logs.length > 0 ? (
                <Paper variant="outlined" sx={{ p: 0, maxHeight: 400, overflow: 'auto' }}>
                  <List dense>
                    {logs.map((log, index) => (
                      <React.Fragment key={index}>
                        <ListItem>
                          <ListItemText
                            primary={log}
                            primaryTypographyProps={{
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                              component: 'div',
                              sx: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', m: 0 }
                            }}
                          />
                        </ListItem>
                        {index < logs.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                </Paper>
              ) : (
                <Alert severity="info">
                  {update.status === 'PENDING' 
                    ? 'Aucun log disponible - La mise à jour n\'a pas encore été exécutée' 
                    : 'Aucun log disponible'
                  }
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        {/* Colonne latérale - Proposition rattachée */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ProposalIcon />
                Proposition rattachée
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">ID Proposition</Typography>
                <Typography 
                  variant="body1" 
                  component={Link} 
                  to={`/proposals/${update.proposalId}`}
                  sx={{ textDecoration: 'none', color: 'primary.main' }}
                >
                  {update.proposalId.slice(-8)}
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">Type</Typography>
                <Typography variant="body1">
                  {getProposalTypeLabel(update.proposal.type)}
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">Statut de la proposition</Typography>
                <Chip
                  label={update.proposal.status}
                  size="small"
                  variant="outlined"
                />
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AgentIcon fontSize="small" />
                  Agent
                </Typography>
                <Typography variant="body1">
                  {update.proposal.agent.name}
                </Typography>
              </Box>
              
              <Button
                component={Link}
                to={`/proposals/${update.proposalId}`}
                variant="outlined"
                size="small"
                fullWidth
              >
                Voir la proposition
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default UpdateDetail
