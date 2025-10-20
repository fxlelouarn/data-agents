import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  Switch,
  FormControlLabel,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material'
import {
  Settings as SettingsIcon,
  Storage as DatabaseIcon,
  BugReport as TestIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  Warning as WarningIcon
} from '@mui/icons-material'
// import { useSnackbar } from 'notistack' // Unused for now
import { 
  useDatabases, 
  useCreateDatabase, 
  useUpdateDatabase, 
  useToggleDatabase, 
  useTestDatabase, 
  useDeleteDatabase,
  useSettings,
  useUpdateSettings,
  useFailureReport,
  useCheckFailures
} from '@/hooks/useApi'
import DatabaseForm from '@/components/DatabaseForm'

const Settings: React.FC = () => {
  // const { enqueueSnackbar } = useSnackbar() // Unused for now
  const { data: databasesData, isLoading: databasesLoading } = useDatabases(true) // includeInactive = true
  const createDatabaseMutation = useCreateDatabase()
  const updateDatabaseMutation = useUpdateDatabase()
  const toggleDatabaseMutation = useToggleDatabase()
  const testDatabaseMutation = useTestDatabase()
  const deleteDatabaseMutation = useDeleteDatabase()
  
  // Settings hooks
  const { data: settingsData, isLoading: settingsLoading } = useSettings()
  const updateSettingsMutation = useUpdateSettings()
  const { data: failureReportData } = useFailureReport()
  const checkFailuresMutation = useCheckFailures()
  
  const databases = databasesData?.data || []
  const systemSettings = settingsData?.data
  const failureReport = failureReportData?.data
  
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | 'testing'>>({})
  
  const [editingDatabase, setEditingDatabase] = useState<any>(null)
  const [databaseFormOpen, setDatabaseFormOpen] = useState(false)
  
  // Handlers pour Meilisearch avec débounce
  const [meilisearchTimeouts, setMeilisearchTimeouts] = useState<{
    url?: NodeJS.Timeout,
    apiKey?: NodeJS.Timeout
  }>({})
  
  // État local pour les paramètres Meilisearch
  const [meilisearchSettings, setMeilisearchSettings] = useState({
    url: (systemSettings as any)?.meilisearchUrl || '',
    apiKey: (systemSettings as any)?.meilisearchApiKey || ''
  })
  
  // Synchroniser avec les settings du serveur
  useEffect(() => {
    if (systemSettings) {
      setMeilisearchSettings({
        url: (systemSettings as any).meilisearchUrl || '',
        apiKey: (systemSettings as any).meilisearchApiKey || ''
      })
    }
  }, [systemSettings])

  // Cleanup des timeouts
  useEffect(() => {
    return () => {
      Object.values(meilisearchTimeouts).forEach(timeout => {
        if (timeout) clearTimeout(timeout)
      })
    }
  }, [meilisearchTimeouts])


  // TODO: Handlers pour les paramètres système (non utilisés actuellement)
  /*
  const handleSaveSystemSettings = async () => {
    if (!systemSettings) return
    
    const updatedSettings = {
      maxConsecutiveFailures: systemSettings.maxConsecutiveFailures,
      enableAutoDisabling: systemSettings.enableAutoDisabling,
      checkIntervalMinutes: systemSettings.checkIntervalMinutes
    }
    
    updateSettingsMutation.mutate(updatedSettings)
  }

  const handleSystemSettingChange = (field: string, value: any) => {
    console.log('System setting change:', field, value)
  }
  */

  const handleCheckFailures = () => {
    checkFailuresMutation.mutate()
  }

  const handleMeilisearchUrlChange = (value: string) => {
    const trimmedValue = value.trim() || null
    setMeilisearchSettings(prev => ({ ...prev, url: value }))
    
    // Clear existing timeout
    if (meilisearchTimeouts.url) {
      clearTimeout(meilisearchTimeouts.url)
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      updateSettingsMutation.mutate({ meilisearchUrl: trimmedValue } as any)
    }, 500) // Débounce de 500ms
    
    setMeilisearchTimeouts(prev => ({ ...prev, url: timeout }))
  }

  const handleMeilisearchApiKeyChange = (value: string) => {
    const trimmedValue = value.trim() || null
    setMeilisearchSettings(prev => ({ ...prev, apiKey: value }))
    
    // Clear existing timeout
    if (meilisearchTimeouts.apiKey) {
      clearTimeout(meilisearchTimeouts.apiKey)
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      updateSettingsMutation.mutate({ meilisearchApiKey: trimmedValue } as any)
    }, 500) // Débounce de 500ms
    
    setMeilisearchTimeouts(prev => ({ ...prev, apiKey: timeout }))
  }


  const handleAddDatabase = () => {
    setEditingDatabase(null)
    setDatabaseFormOpen(true)
  }

  const handleEditDatabase = (database: any) => {
    setEditingDatabase(database)
    setDatabaseFormOpen(true)
  }

  const handleDatabaseFormSubmit = (config: any) => {
    if (editingDatabase) {
      updateDatabaseMutation.mutate({ id: editingDatabase.id, data: config })
    } else {
      createDatabaseMutation.mutate(config)
    }
    setDatabaseFormOpen(false)
  }

  const handleDatabaseFormClose = () => {
    setEditingDatabase(null)
    setDatabaseFormOpen(false)
  }

  const handleToggleDatabase = (database: any) => {
    toggleDatabaseMutation.mutate(database.id)
  }
  
  const handleTestDatabase = async (database: any) => {
    setTestResults(prev => ({ ...prev, [database.id]: 'testing' }))
    try {
      const result = await testDatabaseMutation.mutateAsync(database.id)
      setTestResults(prev => ({ 
        ...prev, 
        [database.id]: result.data.isHealthy ? 'success' : 'error' 
      }))
    } catch (error) {
      setTestResults(prev => ({ ...prev, [database.id]: 'error' }))
    }
  }
  
  const handleDeleteDatabase = (database: any) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer la base de données "${database.name}" ?`)) {
      deleteDatabaseMutation.mutate(database.id)
    }
  }

  const getConnectionStatusIcon = (database: any) => {
    const result = testResults[database.id]
    switch (result) {
      case 'testing':
        return <TestIcon color="info" />
      case 'success':
        return <SuccessIcon color="success" />
      case 'error':
        return <ErrorIcon color="error" />
      default:
        return <DatabaseIcon color={database.isActive ? 'primary' : 'disabled'} />
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <SettingsIcon sx={{ mr: 2, fontSize: 32 }} />
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Administration
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Paramètres de fiabilité des agents */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                🛑 Fiabilité des agents
              </Typography>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                Configuration de la désactivation automatique des agents en échec répété.
              </Alert>
              
              {settingsLoading ? (
                <Typography>Chargement des paramètres...</Typography>
              ) : systemSettings ? (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={systemSettings.enableAutoDisabling}
                          onChange={(e) => 
                            updateSettingsMutation.mutate({ enableAutoDisabling: e.target.checked })
                          }
                        />
                      }
                      label="Activer la désactivation automatique des agents"
                    />
                  </Grid>
                  
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Échecs consécutifs max"
                      type="number"
                      value={systemSettings.maxConsecutiveFailures}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 3
                        updateSettingsMutation.mutate({ maxConsecutiveFailures: value })
                      }}
                      InputProps={{ inputProps: { min: 1, max: 10 } }}
                      helperText="Nombre d'échecs avant désactivation"
                    />
                  </Grid>
                  
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="Intervalle de vérification (min)"
                      type="number"
                      value={systemSettings.checkIntervalMinutes}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 5
                        updateSettingsMutation.mutate({ checkIntervalMinutes: value })
                      }}
                      InputProps={{ inputProps: { min: 1, max: 60 } }}
                      helperText="Fréquence de vérification périodique"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Button
                      variant="outlined"
                      onClick={handleCheckFailures}
                      disabled={checkFailuresMutation.isPending}
                      fullWidth
                    >
                      {checkFailuresMutation.isPending ? 'Vérification...' : 'Vérifier les agents maintenant'}
                    </Button>
                  </Grid>
                  
                  {failureReport && (
                    <Grid item xs={12}>
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          📋 Rapport d'échecs
                        </Typography>
                        <Grid container spacing={1}>
                          <Grid item xs={4}>
                            <Paper sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="h6" color="error">
                                {failureReport.summary.agentsAtRisk}
                              </Typography>
                              <Typography variant="caption">
                                À risque
                              </Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={4}>
                            <Paper sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="h6" color="warning.main">
                                {failureReport.summary.agentsWithWarnings}
                              </Typography>
                              <Typography variant="caption">
                                Avertissement
                              </Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={4}>
                            <Paper sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="h6" color="info.main">
                                {failureReport.summary.totalAgentsWithFailures}
                              </Typography>
                              <Typography variant="caption">
                                Avec échecs
                              </Typography>
                            </Paper>
                          </Grid>
                        </Grid>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              ) : (
                <Typography color="error">Impossible de charger les paramètres</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>


        {/* Configuration Meilisearch */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                🔍 Configuration Meilisearch
              </Typography>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                Configurez Meilisearch pour la recherche d'événements dans l'autocomplétion des propositions.
              </Alert>
              
              {settingsLoading ? (
                <Typography>Chargement des paramètres...</Typography>
              ) : systemSettings ? (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="URL Meilisearch"
                      value={meilisearchSettings.url}
                      onChange={(e) => handleMeilisearchUrlChange(e.target.value)}
                      placeholder="https://your-meilisearch-instance.com"
                      helperText="URL de votre instance Meilisearch"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Clé API Meilisearch"
                      type="password"
                      value={meilisearchSettings.apiKey}
                      onChange={(e) => handleMeilisearchApiKeyChange(e.target.value)}
                      placeholder="Clé API de recherche"
                      helperText="Clé API pour accéder à Meilisearch"
                    />
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Chip
                        label={(meilisearchSettings.url.trim() && meilisearchSettings.apiKey.trim()) ? 'Configuré' : 'Non configuré'}
                        color={(meilisearchSettings.url.trim() && meilisearchSettings.apiKey.trim()) ? 'success' : 'default'}
                        variant="outlined"
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={!meilisearchSettings.url.trim() || !meilisearchSettings.apiKey.trim()}
                        onClick={async () => {
                          try {
                            const response = await fetch('/api/events/test-meilisearch', { method: 'POST' })
                            const data = await response.json()
                            
                            if (data.success) {
                              alert(`✅ Connexion réussie: ${data.data.message}`)
                            } else {
                              // L'erreur peut être dans data.message ou data.data.message
                              const errorMessage = data.message || data.data?.message || 'Erreur inconnue'
                              alert(`❌ Échec de connexion: ${errorMessage}`)
                            }
                          } catch (error) {
                            console.error('Erreur lors du test de connexion:', error)
                            alert('❌ Erreur lors du test de connexion')
                          }
                        }}
                      >
                        Tester la connexion
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              ) : (
                <Typography color="error">Impossible de charger les paramètres Meilisearch</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Bases de données */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  💾 Bases de données cibles
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleAddDatabase}
                >
                  Ajouter
                </Button>
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                Configurez les bases de données où les agents appliqueront leurs modifications approuvées.
              </Alert>

              {databasesLoading ? (
                <Typography>Chargement des bases de données...</Typography>
              ) : databases.length === 0 ? (
                <Typography color="text.secondary">Aucune base de données configurée</Typography>
              ) : (
                <List>
                  {databases.map((database) => (
                  <ListItem key={database.id} sx={{ mb: 1, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                      {getConnectionStatusIcon(database)}
                    </Box>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {database.name}
                          {/* Note: isDefault n'est pas encore implémenté dans l'API */}
                          {database.isActive && <Chip size="small" label="Actif" color="success" variant="outlined" />}
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {database.type} • {database.host}:{database.port}/{database.database}
                          </Typography>
                          {database.description && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              {database.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button
                          size="small"
                          onClick={() => handleTestDatabase(database)}
                          disabled={testResults[database.id] === 'testing'}
                        >
                          Test
                        </Button>
                        <IconButton
                          size="small"
                          onClick={() => handleEditDatabase(database)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleDatabase(database)}
                        >
                          <Switch size="small" checked={database.isActive} />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteDatabase(database)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </ListItemSecondaryAction>
                  </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        
        {/* Rapport détaillé des échecs */}
        {failureReport && failureReport.agents.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  🚨 Agents en échec
                </Typography>
                
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {failureReport.summary.agentsAtRisk} agent(s) risque(nt) d'être désactivé(s) automatiquement.
                </Alert>
                
                {failureReport.agents.map((agent) => (
                  <Accordion key={agent.agentId} sx={{ mb: 1 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1">
                            {agent.agentName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {agent.agentId}
                          </Typography>
                        </Box>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip 
                            icon={agent.shouldDisable ? <ErrorIcon /> : <WarningIcon />}
                            label={`${agent.consecutiveFailures} échec(s)`}
                            color={agent.shouldDisable ? 'error' : 'warning'}
                            size="small"
                          />
                          {agent.shouldDisable && (
                            <Chip 
                              label="À désactiver"
                              color="error"
                              variant="outlined"
                              size="small"
                            />
                          )}
                        </Box>
                      </Box>
                    </AccordionSummary>
                    
                    <AccordionDetails>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2" gutterBottom>
                            📋 Informations
                          </Typography>
                          <List dense>
                            <ListItem>
                              <ListItemText 
                                primary="Échecs consécutifs"
                                secondary={`${agent.consecutiveFailures} / ${failureReport.settings.maxConsecutiveFailures}`}
                              />
                            </ListItem>
                            <ListItem>
                              <ListItemText 
                                primary="Dernier échec"
                                secondary={new Date(agent.lastFailureAt).toLocaleString()}
                              />
                            </ListItem>
                            <ListItem>
                              <ListItemText 
                                primary="Statut"
                                secondary={
                                  agent.shouldDisable 
                                    ? "🔴 Sera désactivé automatiquement" 
                                    : "🟡 Surveillé"
                                }
                              />
                            </ListItem>
                          </List>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2" gutterBottom>
                            📅 Derniers échecs
                          </Typography>
                          <List dense>
                            {agent.recentRuns.slice(0, 3).map((run) => (
                              <ListItem key={run.id}>
                                <ListItemText 
                                  primary={new Date(run.startedAt).toLocaleString()}
                                  secondary={
                                    <Box>
                                      <Typography variant="caption" color="error">
                                        {run.error?.substring(0, 100)}
                                        {run.error && run.error.length > 100 && '...'}
                                      </Typography>
                                    </Box>
                                  }
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Grid>
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
      
      {/* Formulaire d'ajout/modification de base de données */}
      <DatabaseForm
        open={databaseFormOpen}
        onClose={handleDatabaseFormClose}
        onSubmit={handleDatabaseFormSubmit}
        editingDatabase={editingDatabase}
        validateDatabase={(config: any) => {
          if (!config.name?.trim()) return 'Le nom est requis'
          if (!config.type) return 'Le type est requis'
          return null
        }}
      />
    </Box>
  )
}

export default Settings
