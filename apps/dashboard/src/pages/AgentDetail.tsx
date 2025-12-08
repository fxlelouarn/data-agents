import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Button,
  Grid,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material'
import {
  Edit as EditIcon,
  PlayArrow as PlayIcon,
  Delete as DeleteIcon,
  Pause as PauseIcon
} from '@mui/icons-material'
import { useAgent, useRunAgent, useAgents, useFailureReport, useToggleAgent, useDeleteAgent } from '@/hooks/useApi'
import AgentNavigation from '@/components/agents/AgentNavigation'
import ScraperProgressCard from '@/components/ScraperProgressCard'
import DynamicConfigDisplay from '@/components/DynamicConfigDisplay'
import type { FrequencyConfig } from '@data-agents/types'

/**
 * Formate une configuration de fréquence en texte lisible
 */
function formatFrequency(config: FrequencyConfig | string | undefined): string {
  if (!config) return '-'
  if (typeof config === 'string') return config // Fallback pour ancien format cron

  switch (config.type) {
    case 'interval': {
      const hours = Math.floor((config.intervalMinutes || 0) / 60)
      const minutes = (config.intervalMinutes || 0) % 60
      let interval = ''
      if (hours > 0 && minutes > 0) interval = `${hours}h${minutes}min`
      else if (hours > 0) interval = `${hours}h`
      else interval = `${minutes}min`

      let result = `Toutes les ${interval}`
      if (config.jitterMinutes) {
        const jH = Math.floor(config.jitterMinutes / 60)
        const jM = config.jitterMinutes % 60
        let jitter = jH > 0 ? `${jH}h` : ''
        if (jM > 0) jitter += `${jM}min`
        result += ` ± ${jitter}`
      }
      if (config.windowStart && config.windowEnd) {
        result += ` (${config.windowStart}-${config.windowEnd})`
      }
      return result
    }
    case 'daily':
      return `Quotidien (${config.windowStart}-${config.windowEnd})`
    case 'weekly': {
      const dayNames = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
      const days = (config.daysOfWeek || []).sort().map(d => dayNames[d]).join(', ')
      return `Hebdo ${days} (${config.windowStart}-${config.windowEnd})`
    }
    default:
      return '-'
  }
}

const AgentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: agentData, isLoading } = useAgent(id!)
  const { data: allAgentsData } = useAgents({ includeInactive: true })
  // const { data: databasesData } = useDatabases() // Unused for now
  const { data: failureReportData } = useFailureReport()
  const runAgentMutation = useRunAgent()
  const toggleAgentMutation = useToggleAgent()
  const deleteAgentMutation = useDeleteAgent()
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [logDetailDialogOpen, setLogDetailDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // const [configTab, setConfigTab] = useState<'form' | 'json'>('form') // Unused for now

  // Navigation logic
  const currentAgentIndex = allAgentsData?.data ? allAgentsData.data.findIndex(agent => agent.id === id) : -1
  const hasPrevious = currentAgentIndex > 0
  const hasNext = allAgentsData?.data ? currentAgentIndex < allAgentsData.data.length - 1 : false

  const handlePreviousAgent = () => {
    if (allAgentsData?.data && currentAgentIndex > 0) {
      const prevAgent = allAgentsData.data[currentAgentIndex - 1]
      navigate(`/agents/${prevAgent.id}`)
    }
  }

  const handleNextAgent = () => {
    if (allAgentsData?.data && currentAgentIndex < allAgentsData.data.length - 1) {
      const nextAgent = allAgentsData.data[currentAgentIndex + 1]
      navigate(`/agents/${nextAgent.id}`)
    }
  }

  const handleBackToList = () => {
    navigate('/agents')
  }

  // Tous les hooks et useMemo doivent être ici, avant les returns conditionnels
  const agent = agentData?.data

  // Détection des agents auto-désactivés
  const isAutoDisabled = React.useMemo(() => {
    if (!agent || agent.isActive) return false

    // Vérifier dans le rapport d'échecs
    if (failureReportData?.data?.agents) {
      return failureReportData.data.agents.some(failedAgent =>
        failedAgent.agentId === agent.id && failedAgent.shouldDisable
      )
    }

    return false
  }, [agent, failureReportData])

  const agentTypeLabels = {
    EXTRACTOR: 'Extracteur',
    COMPARATOR: 'Comparateur',
    VALIDATOR: 'Validateur',
    CLEANER: 'Nettoyeur',
    DUPLICATOR: 'Duplicateur',
    SPECIFIC_FIELD: 'Champ spécifique'
  }

  // Schema de configuration et valeurs
  const configSchema = agent?.config?.configSchema || {}
  const currentConfigValues = React.useMemo(() => {
    if (!agent?.config) return {}
    const { configSchema, ...configValues } = agent.config
    return configValues
  }, [agent?.config])

  const handleRunAgent = async () => {
    try {
      await runAgentMutation.mutateAsync(id!)
    } catch (error) {
      console.error('Error running agent:', error)
    }
  }

  const handleToggleAgent = async () => {
    try {
      await toggleAgentMutation.mutateAsync(id!)
    } catch (error) {
      console.error('Error toggling agent:', error)
    }
  }

  const handleDeleteAgent = async () => {
    try {
      await deleteAgentMutation.mutateAsync(id!)
      setDeleteDialogOpen(false)
      navigate('/agents')
    } catch (error) {
      console.error('Error deleting agent:', error)
    }
  }

  const handleLogClick = (log: any) => {
    setSelectedLog(log)
    setLogDetailDialogOpen(true)
  }

  const handleLogDetailClose = () => {
    setLogDetailDialogOpen(false)
    setSelectedLog(null)
  }

  if (isLoading) return <LinearProgress />

  if (!agent) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Agent non trouvé</Alert>
        </CardContent>
      </Card>
    )
  }


  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AgentNavigation
            navigation={{
              hasPrevious,
              hasNext,
              onPrevious: handlePreviousAgent,
              onNext: handleNextAgent
            }}
            onBack={handleBackToList}
            disabled={runAgentMutation.isPending}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant={agent.isActive ? "contained" : "outlined"}
            size="small"
            startIcon={<PlayIcon />}
            onClick={handleRunAgent}
            disabled={runAgentMutation.isPending}
            color={agent.isActive ? "primary" : "warning"}
            sx={{
              // Style spécial pour les agents inactifs
              ...(!agent.isActive && {
                borderColor: 'warning.main',
                '&:hover': {
                  backgroundColor: 'warning.light',
                  borderColor: 'warning.main'
                }
              })
            }}
          >
            {agent.isActive ? 'Exécuter' : isAutoDisabled ? 'Tester (auto-désactivé)' : 'Tester (inactif)'}
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={agent.isActive ? <PauseIcon /> : <PlayIcon />}
            onClick={handleToggleAgent}
            disabled={toggleAgentMutation.isPending}
            color={agent.isActive ? 'warning' : 'success'}
          >
            {agent.isActive ? 'Désactiver' : 'Activer'}
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            component={Link}
            to={`/agents/${id}/edit`}
          >
            Modifier
          </Button>

        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          {agent.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={agent.isActive ? 'Actif' : 'Inactif'}
            color={agent.isActive ? 'success' : 'error'}
            size="medium"
          />
          {isAutoDisabled && (
            <Chip
              label="Auto-désactivé"
              color="error"
              variant="filled"
              size="medium"
            />
          )}
          <Chip
            label={agentTypeLabels[agent.type as keyof typeof agentTypeLabels]}
            variant="outlined"
            size="medium"
          />
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Colonne principale - Activités */}
        <Grid item xs={12} md={8}>
          {/* Statistiques */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Statistiques</Typography>
              <Grid container spacing={3}>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center', p: 2, backgroundColor: 'primary.light', borderRadius: 2 }}>
                    <Typography variant="h3" sx={{ color: 'primary.contrastText', fontWeight: 'bold' }}>
                      {agent.runs?.length || 0}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'primary.contrastText' }}>
                      Exécutions
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center', p: 2, backgroundColor: 'success.light', borderRadius: 2 }}>
                    <Typography variant="h3" sx={{ color: 'success.contrastText', fontWeight: 'bold' }}>
                      -
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'success.contrastText' }}>
                      Propositions
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Derniers logs */}
          {agent.logs && agent.logs.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Derniers logs</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    component={Link}
                    to={`/agents/${id}/logs`}
                  >
                    Voir tout
                  </Button>
                </Box>
                <List dense>
                  {agent.logs.slice(0, 8).map((log: any) => (
                    <ListItem
                      key={log.id}
                      button
                      onClick={() => handleLogClick(log)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: 'action.hover' }
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              size="small"
                              label={log.level}
                              color={log.level === 'ERROR' ? 'error' :
                                     log.level === 'WARN' ? 'warning' : 'info'}
                            />
                            <Typography variant="body2" sx={{ flexGrow: 1 }}>
                              {log.message.length > 80 ? `${log.message.substring(0, 80)}...` : log.message}
                            </Typography>
                          </Box>
                        }
                        secondary={new Date(log.timestamp).toLocaleString('fr-FR')}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}

          {/* Dernières exécutions */}
          {agent.runs && agent.runs.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>Dernières exécutions</Typography>
                <List dense>
                  {agent.runs.slice(0, 8).map((run: any) => (
                    <ListItem key={run.id}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip
                                size="small"
                                label={run.status}
                                color={run.status === 'SUCCESS' ? 'success' :
                                       run.status === 'FAILED' ? 'error' : 'default'}
                              />
                              <Typography variant="body2">
                                {run.duration ? `${run.duration}ms` : '-'}
                              </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {new Date(run.startedAt).toLocaleString('fr-FR')}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Colonne secondaire - Détails de l'agent */}
        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Détails de l'agent</Typography>
              <List dense>
                <ListItem>
                  <ListItemText primary="Description" secondary={agent.description || 'Aucune description'} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Type" secondary={agentTypeLabels[agent.type as keyof typeof agentTypeLabels]} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Fréquence" secondary={formatFrequency(agent.frequency as unknown as FrequencyConfig)} />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Créé le"
                    secondary={new Date(agent.createdAt).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Dernière modification"
                    secondary={new Date(agent.updatedAt).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>

          {/* Progression du scraping (pour agents scraper) */}
          {(agent.name.toLowerCase().includes('ffa') || agent.name.toLowerCase().includes('scraper')) && (
            <ScraperProgressCard agentId={agent.id} agentName={agent.name} />
          )}
        </Grid>
      </Grid>

      {/* Configuration de l'agent */}
      {Object.keys(configSchema).length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Configuration</Typography>
          <DynamicConfigDisplay
            configSchema={configSchema}
            values={currentConfigValues}
          />
        </Box>
      )}

      {/* Dialog des détails du log */}
      <Dialog
        open={logDetailDialogOpen}
        onClose={handleLogDetailClose}
        maxWidth="md"
        fullWidth
        aria-labelledby="log-detail-dialog-title"
      >
        <DialogTitle id="log-detail-dialog-title">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            Détails du log
            {selectedLog && (
              <Chip
                size="small"
                label={selectedLog.level}
                color={selectedLog.level === 'ERROR' ? 'error' :
                       selectedLog.level === 'WARN' ? 'warning' : 'info'}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedLog && (
            <Box sx={{ mt: 1 }}>
              {/* Informations générales */}
              <Typography variant="h6" gutterBottom>Informations générales</Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Horodatage"
                    secondary={new Date(selectedLog.timestamp).toLocaleString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Niveau" secondary={selectedLog.level} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Run ID" secondary={selectedLog.runId || 'Non spécifié'} />
                </ListItem>
              </List>

              {/* Message */}
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Message</Typography>
              <Box
                sx={{
                  backgroundColor: '#f5f5f5',
                  padding: 2,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {selectedLog.message}
              </Box>

              {/* Données additionnelles */}
              {selectedLog.data && Object.keys(selectedLog.data).length > 0 && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Données additionnelles</Typography>
                  <Box
                    sx={{
                      backgroundColor: '#f5f5f5',
                      padding: 2,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}
                  >
                    <pre>{JSON.stringify(selectedLog.data, null, 2)}</pre>
                  </Box>
                </>
              )}

              {/* Métadonnées */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Métadonnées</Typography>
                  <Box
                    sx={{
                      backgroundColor: '#f5f5f5',
                      padding: 2,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}
                  >
                    <pre>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleLogDetailClose}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de confirmation de suppression */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Désinstaller l'agent</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Êtes-vous sûr de vouloir désinstaller l'agent "{agent.name}" ?
            <br /><br />
            Cette action supprimera définitivement :
            <br />• L'agent et sa configuration
            <br />• Tous les runs associés
            <br />• Tous les logs associés
            <br />• Toutes les propositions générées
            <br /><br />
            <strong>Cette action est irréversible.</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleteAgentMutation.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={handleDeleteAgent}
            color="error"
            variant="contained"
            disabled={deleteAgentMutation.isPending}
            startIcon={deleteAgentMutation.isPending ? null : <DeleteIcon />}
          >
            {deleteAgentMutation.isPending ? 'Désinstallation...' : 'Désinstaller'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default AgentDetail
