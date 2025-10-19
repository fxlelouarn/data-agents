import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  LinearProgress,
  Alert,
  Grid,
  IconButton,
  Tooltip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tab,
  Tabs
} from '@mui/material'
import DynamicConfigForm from '@/components/DynamicConfigForm'
import {
  Save as SaveIcon,
  Cancel as CancelIcon,
  Delete as DeleteIcon,
  Help as HelpIcon,
  ExpandMore as ExpandMoreIcon,
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { useAgent, useUpdateAgent, useDeleteAgent, useAgentValidation, useReinstallAgent, useResetAgentCursor } from '@/hooks/useApi'
import { AgentType } from '@/types'

// Validation schema avec Yup
const validationSchema = Yup.object({
  name: Yup.string()
    .required('Le nom est obligatoire')
    .min(3, 'Le nom doit contenir au moins 3 caractères')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
  description: Yup.string()
    .max(500, 'La description ne peut pas dépasser 500 caractères'),
  type: Yup.string()
    .oneOf(['EXTRACTOR', 'COMPARATOR', 'VALIDATOR', 'CLEANER', 'DUPLICATOR', 'SPECIFIC_FIELD'])
    .required('Le type est obligatoire'),
  frequency: Yup.string()
    .required('La fréquence est obligatoire')
    .test('is-valid-cron', 'Format cron invalide (ex: 0 6 * * 1, */5 * * * *, 0 */2 * * *)', function(value) {
      if (!value) return false
      
      // Vérification de base : 5 champs séparés par des espaces
      const fields = value.trim().split(/\s+/)
      if (fields.length !== 5) return false
      
      // Vérification que chaque champ contient uniquement des caractères valides pour cron
      const cronFieldPattern = /^[*\/\d,-]+$|^[A-Z]{3}$|^[A-Z]{3}-[A-Z]{3}$|^[A-Z]{3},[A-Z]{3}$/
      const monthDayPattern = /^[*\/\d,-]+$|^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$|^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/
      const weekDayPattern = /^[*\/\d,-]+$|^(SUN|MON|TUE|WED|THU|FRI|SAT)$|^(SUN|MON|TUE|WED|THU|FRI|SAT)-(SUN|MON|TUE|WED|THU|FRI|SAT)$/
      
      // Vérifier minute, heure, jour du mois
      for (let i = 0; i < 3; i++) {
        if (!cronFieldPattern.test(fields[i])) return false
      }
      
      // Vérifier mois (peut avoir des noms)
      if (!monthDayPattern.test(fields[3])) return false
      
      // Vérifier jour de la semaine (peut avoir des noms)
      if (!weekDayPattern.test(fields[4])) return false
      
      return true
    }),
  isActive: Yup.boolean(),
  config: Yup.string()
    .test('is-json', 'Configuration JSON invalide', function(value) {
      if (!value) return true
      try {
        JSON.parse(value)
        return true
      } catch {
        return false
      }
    })
})

const AgentEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [configTab, setConfigTab] = useState<'form' | 'json'>('form')
  
  const { data: agentData, isLoading } = useAgent(id!)
  const { data: validationData } = useAgentValidation(id!)
  const updateAgentMutation = useUpdateAgent()
  const deleteAgentMutation = useDeleteAgent()
  const reinstallAgentMutation = useReinstallAgent()
  const resetCursorMutation = useResetAgentCursor()
  // const runAgentMutation = useRunAgent() // Unused for now
  // const toggleAgentMutation = useToggleAgent() // Unused for now

  // Mappages pour l'affichage
  const agentTypeLabels = {
    EXTRACTOR: 'Extracteur',
    COMPARATOR: 'Comparateur',
    VALIDATOR: 'Validateur', 
    CLEANER: 'Nettoyeur',
    DUPLICATOR: 'Duplicateur',
    SPECIFIC_FIELD: 'Champ spécifique'
  }

  const frequencyPresets = [
    { value: '0 6 * * 1', label: 'Lundi à 6h00' },
    { value: '0 */2 * * *', label: 'Toutes les 2 heures' },
    { value: '0 0 * * *', label: 'Tous les jours à minuit' },
    { value: '0 2 * * 0', label: 'Dimanche à 2h00' },
    { value: '*/30 * * * *', label: 'Toutes les 30 minutes' },
    { value: '0 8,12,16,20 * * *', label: '4 fois par jour' }
  ]

  // Extraire le schema de configuration et les valeurs actuelles
  const configSchema = agentData?.data?.config?.configSchema || {}
  const currentConfigValues = React.useMemo(() => {
    if (!agentData?.data?.config) return {}
    const { configSchema, ...configValues } = agentData.data.config
    return configValues
  }, [agentData?.data?.config])

  const formik = useFormik({
    initialValues: {
      name: agentData?.data?.name || '',
      description: agentData?.data?.description || '',
      type: (agentData?.data?.type || 'EXTRACTOR') as AgentType,
      frequency: agentData?.data?.frequency || '0 6 * * 1',
      isActive: agentData?.data?.isActive ?? true,
      config: agentData?.data ? JSON.stringify(agentData.data.config, null, 2) : '{}',
      dynamicConfig: currentConfigValues
    },
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values) => {
      try {
        let configObject
        
        if (configTab === 'form' && Object.keys(configSchema).length > 0) {
          // Utiliser les valeurs du formulaire dynamique
          configObject = {
            ...values.dynamicConfig,
            configSchema // Préserver le schema
          }
        } else {
          // Utiliser le JSON brut
          configObject = JSON.parse(values.config)
        }
        
        await updateAgentMutation.mutateAsync({
          id: id!,
          data: {
            name: values.name,
            description: values.description || undefined,
            type: values.type,
            frequency: values.frequency,
            isActive: values.isActive,
            config: configObject
          }
        })
      } catch (error) {
        console.error('Error updating agent:', error)
      }
    }
  })

  const handleDelete = async () => {
    try {
      await deleteAgentMutation.mutateAsync(id!)
      setDeleteDialogOpen(false)
      navigate('/agents')
    } catch (error) {
      console.error('Error deleting agent:', error)
    }
  }

  const handleReinstallAgent = async () => {
    try {
      await reinstallAgentMutation.mutateAsync(id!)
      alert('Agent réinstallé avec succès ! Le paramètre cooldownDays a été ajouté au schéma.')
    } catch (error) {
      console.error('Error reinstalling agent:', error)
      alert('Erreur lors de la réinstallation de l\'agent.')
    }
  }

  const handleResetCursor = async () => {
    try {
      await resetCursorMutation.mutateAsync(id!)
    } catch (error) {
      console.error('Error resetting cursor:', error)
    }
  }

  // TODO: Functions not used in current UI but may be needed later
  /*
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
  
  const handleReinstallAgent = async () => {
    try {
      await formik.handleSubmit()
      window.alert('Agent réinstallé avec succès ! Les nouvelles configurations ont été appliquées.')
    } catch (error) {
      console.error('Error reinstalling agent:', error)
      window.alert('Erreur lors de la réinstallation de l\'agent.')
    }
  }
  */

  const handleBackToAgent = () => {
    navigate(`/agents/${id}`)
  }

  const handleCancel = () => {
    if (formik.dirty) {
      const confirmLeave = window.confirm('Vous avez des modifications non sauvegardées. Êtes-vous sûr de vouloir quitter ?')
      if (!confirmLeave) return
    }
    navigate(`/agents/${id}`)
  }

  if (isLoading) return <LinearProgress />

  if (!agentData?.data) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Agent non trouvé</Alert>
        </CardContent>
      </Card>
    )
  }

  const agent = agentData.data

  return (
    <Box>
      {/* Header de navigation */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={handleBackToAgent}
          >
            Retour à l'agent
          </Button>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => handleResetCursor()}
              disabled={resetCursorMutation.isPending}
              color="warning"
              title="Réinitialise le curseur de traitement de l'agent à zéro"
            >
              {resetCursorMutation.isPending ? 'Réinitialisation...' : 'Réinitialiser'}
            </Button>
            
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleReinstallAgent}
              disabled={reinstallAgentMutation.isPending}
              color="info"
            >
              {reinstallAgentMutation.isPending ? 'Réinstallation...' : 'Réinstaller'}
            </Button>
            
            <Button
              variant="outlined"
              size="small"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deleteAgentMutation.isPending}
              color="error"
            >
              Désinstaller
            </Button>
          </Box>
        </Box>
        
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Édition - {agent.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Chip 
              label={formik.values.isActive ? 'Actif' : 'Inactif'}
              color={formik.values.isActive ? 'success' : 'error'}
            />
            <Chip 
              label={agentTypeLabels[formik.values.type] || formik.values.type}
              variant="outlined"
            />
          </Box>
        </Box>
      </Box>

      {/* Alertes de configuration */}
      {validationData?.data && !validationData.data.isValid && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            ❌ Configuration incomplète
          </Typography>
          <Typography variant="body2">
            Cet agent ne peut pas fonctionner car sa configuration contient des erreurs :
          </Typography>
          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
            {validationData.data.errors
              .filter(error => error.severity === 'error')
              .map((error, index) => (
                <li key={index}>
                  <Typography variant="body2" color="error">
                    <strong>{error.field}</strong>: {error.message}
                  </Typography>
                </li>
              ))
            }
          </Box>
        </Alert>
      )}

      {validationData?.data?.errors.some(e => e.severity === 'warning') && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            ⚠️ Avertissements de configuration
          </Typography>
          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
            {validationData.data.errors
              .filter(error => error.severity === 'warning')
              .map((error, index) => (
                <li key={index}>
                  <Typography variant="body2">
                    <strong>{error.field}</strong>: {error.message}
                  </Typography>
                </li>
              ))
            }
          </Box>
        </Alert>
      )}

      <form onSubmit={formik.handleSubmit}>
        <Grid container spacing={3}>
          {/* Informations de base */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 3 }}>
                  Informations générales
                </Typography>

                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      name="name"
                      label="Nom de l'agent"
                      value={formik.values.name}
                      onChange={formik.handleChange}
                      error={formik.touched.name && Boolean(formik.errors.name)}
                      helperText={formik.touched.name && formik.errors.name}
                      variant="outlined"
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      name="description"
                      label="Description"
                      value={formik.values.description}
                      onChange={formik.handleChange}
                      error={formik.touched.description && Boolean(formik.errors.description)}
                      helperText={formik.touched.description && formik.errors.description}
                      variant="outlined"
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      select
                      fullWidth
                      name="type"
                      label="Type d'agent"
                      value={formik.values.type}
                      onChange={formik.handleChange}
                      error={formik.touched.type && Boolean(formik.errors.type)}
                      helperText={formik.touched.type && formik.errors.type}
                      variant="outlined"
                    >
                      {Object.entries(agentTypeLabels).map(([value, label]) => (
                        <MenuItem key={value} value={value}>
                          {label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          name="isActive"
                          checked={formik.values.isActive}
                          onChange={formik.handleChange}
                          color="success"
                        />
                      }
                      label="Agent actif"
                      sx={{ mt: 1 }}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Configuration avancée */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 3 }}>
                  Configuration avancée
                </Typography>

                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <Box sx={{ mb: 2 }}>
                      <TextField
                        fullWidth
                        name="frequency"
                        label="Fréquence d'exécution (Cron)"
                        value={formik.values.frequency}
                        onChange={formik.handleChange}
                        error={formik.touched.frequency && Boolean(formik.errors.frequency)}
                        helperText={formik.touched.frequency && formik.errors.frequency || "Format: minute heure jour mois jour_semaine"}
                        variant="outlined"
                        InputProps={{
                          endAdornment: (
                            <Tooltip title="Aide pour les expressions cron">
                              <IconButton 
                                href="https://crontab.guru/" 
                                target="_blank" 
                                size="small"
                              >
                                <HelpIcon />
                              </IconButton>
                            </Tooltip>
                          )
                        }}
                      />
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Fréquences prédéfinies :
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {frequencyPresets.map((preset) => (
                        <Chip
                          key={preset.value}
                          label={preset.label}
                          variant={formik.values.frequency === preset.value ? "filled" : "outlined"}
                          onClick={() => formik.setFieldValue('frequency', preset.value)}
                          size="small"
                        />
                      ))}
                    </Box>
                  </Grid>

                  <Grid item xs={12}>
                    {Object.keys(configSchema).length > 0 ? (
                      <Box>
                        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                          <Tabs 
                            value={configTab} 
                            onChange={(_, newValue) => setConfigTab(newValue)}
                            aria-label="Configuration tabs"
                          >
                            <Tab label="Formulaire" value="form" />
                            <Tab label="JSON" value="json" />
                          </Tabs>
                        </Box>
                        
                        {configTab === 'form' ? (
                          <DynamicConfigForm
                            configSchema={configSchema}
                            values={formik.values.dynamicConfig || {}}
                            onChange={(field, value) => {
                              formik.setFieldValue(`dynamicConfig.${field}`, value)
                              
                              // Synchroniser avec le JSON
                              const updatedConfig = {
                                ...formik.values.dynamicConfig,
                                [field]: value,
                                configSchema
                              }
                              formik.setFieldValue('config', JSON.stringify(updatedConfig, null, 2))
                            }}
                            errors={formik.errors.dynamicConfig as any || {}}
                            touched={formik.touched.dynamicConfig as any || {}}
                          />
                        ) : (
                          <TextField
                            fullWidth
                            multiline
                            rows={12}
                            name="config"
                            label="Configuration (JSON)"
                            value={formik.values.config}
                            onChange={(e) => {
                              formik.handleChange(e)
                              
                              // Essayer de parser et synchroniser le formulaire
                              try {
                                const parsed = JSON.parse(e.target.value)
                                const { configSchema: _, ...configValues } = parsed
                                formik.setFieldValue('dynamicConfig', configValues)
                              } catch {
                                // Ignore parsing errors during typing
                              }
                            }}
                            error={formik.touched.config && Boolean(formik.errors.config)}
                            helperText={formik.touched.config && formik.errors.config}
                            variant="outlined"
                            sx={{
                              '& .MuiInputBase-input': {
                                fontFamily: 'monospace',
                                fontSize: '0.875rem'
                              }
                            }}
                          />
                        )}
                      </Box>
                    ) : (
                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>Configuration JSON</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <TextField
                            fullWidth
                            multiline
                            rows={8}
                            name="config"
                            label="Configuration (JSON)"
                            value={formik.values.config}
                            onChange={formik.handleChange}
                            error={formik.touched.config && Boolean(formik.errors.config)}
                            helperText={formik.touched.config && formik.errors.config}
                            variant="outlined"
                            sx={{
                              '& .MuiInputBase-input': {
                                fontFamily: 'monospace',
                                fontSize: '0.875rem'
                              }
                            }}
                          />
                        </AccordionDetails>
                      </Accordion>
                    )}
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Boutons d'action */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                startIcon={<CancelIcon />}
                onClick={handleCancel}
                disabled={updateAgentMutation.isPending}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={<SaveIcon />}
                disabled={updateAgentMutation.isPending || !formik.isValid}
              >
                {updateAgentMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </form>

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
            onClick={handleDelete} 
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

export default AgentEdit
