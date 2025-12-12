import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
  Skeleton,
} from '@mui/material'
import { Save as SaveIcon, Cancel as CancelIcon } from '@mui/icons-material'
import { useCreateAgent, useAvailableAgents } from '@/hooks/useApi'
import DynamicConfigForm from '@/components/DynamicConfigForm'
import { AgentType } from '@/types'

// Options de fréquence prédéfinies
const frequencyOptions = [
  {
    label: 'Toutes les 2 heures',
    value: { type: 'interval' as const, intervalMinutes: 120, jitterMinutes: 30 }
  },
  {
    label: 'Toutes les 4 heures',
    value: { type: 'interval' as const, intervalMinutes: 240, jitterMinutes: 60 }
  },
  {
    label: '1x par jour (02h-05h)',
    value: { type: 'daily' as const, windowStart: '02:00', windowEnd: '05:00' }
  },
  {
    label: '1x par jour (06h-09h)',
    value: { type: 'daily' as const, windowStart: '06:00', windowEnd: '09:00' }
  },
  {
    label: '1x par jour (nuit, 00h-06h)',
    value: { type: 'daily' as const, windowStart: '00:00', windowEnd: '06:00' }
  },
  {
    label: 'Lun-Ven (08h-10h)',
    value: { type: 'weekly' as const, windowStart: '08:00', windowEnd: '10:00', daysOfWeek: [1, 2, 3, 4, 5] }
  },
]

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`config-tabpanel-${index}`}
      aria-labelledby={`config-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  )
}

/**
 * Convertit le ConfigSchema du backend vers le format attendu par DynamicConfigForm
 */
function convertConfigSchemaForForm(configSchema: {
  fields: Array<{
    name: string
    label: string
    type: string
    category?: string
    required?: boolean
    defaultValue?: any
    description?: string
    helpText?: string
    placeholder?: string
    options?: Array<{ value: string; label: string }>
    validation?: { required?: boolean; min?: number; max?: number; step?: number }
  }>
}): Record<string, any> {
  const result: Record<string, any> = {}

  configSchema.fields.forEach((field, index) => {
    result[field.name] = {
      type: field.type === 'select' ? 'select' : field.type,
      label: field.label,
      description: field.description || field.helpText,
      required: field.required || field.validation?.required,
      default: field.defaultValue,
      category: field.category || 'Configuration générale',
      order: index + 1,
      placeholder: field.placeholder,
      options: field.options,
      min: field.validation?.min,
      max: field.validation?.max,
      step: field.validation?.step,
    }
  })

  return result
}

const AgentCreate: React.FC = () => {
  const navigate = useNavigate()
  const createMutation = useCreateAgent()
  const { data: availableAgentsResponse, isLoading: isLoadingAgents, error: agentsError } = useAvailableAgents()

  const [selectedAgentType, setSelectedAgentType] = useState<string>('')
  const [selectedFrequencyIndex, setSelectedFrequencyIndex] = useState<number>(2) // Default: 1x par jour (02h-05h)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    config: {} as Record<string, any>,
  })
  const [tabValue, setTabValue] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Données des agents disponibles depuis l'API
  const availableAgents = availableAgentsResponse?.data || []

  // Construire les maps pour accès rapide
  const agentTypeLabels = useMemo(() => {
    const labels: Record<string, string> = {}
    availableAgents.forEach(agent => {
      labels[agent.type] = agent.label
    })
    return labels
  }, [availableAgents])

  const agentTypeMapping = useMemo(() => {
    const mapping: Record<string, AgentType> = {}
    availableAgents.forEach(agent => {
      mapping[agent.type] = agent.agentType as AgentType
    })
    return mapping
  }, [availableAgents])

  const agentConfigSchemas = useMemo(() => {
    const schemas: Record<string, any> = {}
    availableAgents.forEach(agent => {
      schemas[agent.type] = convertConfigSchemaForForm(agent.configSchema)
    })
    return schemas
  }, [availableAgents])

  // Agent sélectionné
  const selectedAgent = useMemo(() => {
    return availableAgents.find(a => a.type === selectedAgentType)
  }, [availableAgents, selectedAgentType])

  const handleAgentTypeChange = (agentType: string) => {
    setSelectedAgentType(agentType)

    // Initialiser la config avec les valeurs par défaut du schéma
    const schema = agentConfigSchemas[agentType]
    const defaultConfig: Record<string, any> = {}

    if (schema) {
      Object.entries(schema).forEach(([fieldName, fieldConfig]: [string, any]) => {
        if (fieldConfig.default !== undefined) {
          defaultConfig[fieldName] = fieldConfig.default
        }
      })
    }

    console.log('Initializing config with defaults:', defaultConfig)

    setFormData({
      ...formData,
      config: defaultConfig,
    })
    setErrors({})
    setTouched({})
  }

  const handleConfigChange = (field: string, value: any) => {
    setFormData({
      ...formData,
      config: {
        ...formData.config,
        [field]: value,
      },
    })
    setTouched({
      ...touched,
      [field]: true,
    })
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Validation des champs généraux
    if (!formData.name.trim()) {
      newErrors.name = 'Le nom est requis'
    }
    if (!selectedAgentType) {
      newErrors.agentType = 'Le type d\'agent est requis'
    }
    if (selectedFrequencyIndex < 0 || selectedFrequencyIndex >= frequencyOptions.length) {
      newErrors.frequency = 'La fréquence est requise'
    }

    // Validation des champs de configuration spécifiques
    const schema = agentConfigSchemas[selectedAgentType]
    if (schema) {
      Object.entries(schema).forEach(([fieldName, fieldConfig]: [string, any]) => {
        const value = formData.config[fieldName]
        if (fieldConfig.required && !value) {
          newErrors[fieldName] = `${fieldConfig.label} est requis`
        }
      })
    }

    // Traiter les ligues (convertir en array) - spécifique FFA_SCRAPER
    if (selectedAgentType === 'FFA_SCRAPER' && formData.config.ligues) {
      if (typeof formData.config.ligues === 'string') {
        const liguesStr = formData.config.ligues.trim()
        // Si c'est "*", utiliser toutes les ligues
        if (liguesStr === '*') {
          formData.config.ligues = ['ARA', 'BFC', 'BRE', 'CEN', 'COR', 'G-E', 'GUA', 'GUY', 'H-F', 'I-F', 'MAR', 'MAY', 'N-A', 'N-C', 'NOR', 'OCC', 'PCA', 'P-F', 'P-L', 'REU', 'W-F']
        } else {
          formData.config.ligues = liguesStr.split(',').map((l: string) => l.trim())
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }

    const agentData = {
      name: formData.name,
      description: formData.description || undefined,
      type: agentTypeMapping[selectedAgentType] || 'EXTRACTOR',
      frequency: frequencyOptions[selectedFrequencyIndex].value,
      config: {
        ...formData.config,
        agentType: selectedAgentType,
      },
    }

    try {
      const response = await createMutation.mutateAsync(agentData)
      // Rediriger vers la page de détails de l'agent créé
      if (response.data?.id) {
        navigate(`/agents/${response.data.id}`)
      } else {
        navigate('/agents')
      }
    } catch (error) {
      // L'erreur est gérée par le hook useCreateAgent
      console.error('Erreur lors de la création:', error)
    }
  }

  const handleCancel = () => {
    navigate('/agents')
  }

  // État de chargement
  if (isLoadingAgents) {
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Créer un agent
          </Typography>
        </Box>
        <Card>
          <CardContent>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Skeleton variant="text" width="40%" height={40} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Skeleton variant="rectangular" height={56} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Skeleton variant="rectangular" height={56} />
              </Grid>
              <Grid item xs={12}>
                <Skeleton variant="rectangular" height={80} />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>
    )
  }

  // Erreur de chargement
  if (agentsError) {
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Créer un agent
          </Typography>
        </Box>
        <Alert severity="error">
          Erreur lors du chargement des types d'agents disponibles. Veuillez réessayer.
        </Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Créer un agent
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Grid container spacing={3}>
            {/* Informations générales */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Informations générales
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth error={Boolean(errors.agentType)}>
                <InputLabel>Type d'agent *</InputLabel>
                <Select
                  value={selectedAgentType}
                  label="Type d'agent *"
                  onChange={(e) => handleAgentTypeChange(e.target.value)}
                >
                  {availableAgents.map((agent) => (
                    <MenuItem key={agent.type} value={agent.type}>
                      {agent.label}
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ ml: 1, color: 'text.secondary' }}
                      >
                        v{agent.version}
                      </Typography>
                    </MenuItem>
                  ))}
                </Select>
                {errors.agentType && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                    {errors.agentType}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Nom de l'agent *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={Boolean(errors.name)}
                helperText={errors.name}
              />
            </Grid>

            {selectedAgent && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ mb: 0 }}>
                  {selectedAgent.description}
                </Alert>
              </Grid>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                multiline
                rows={2}
                helperText="Description optionnelle de ce que fait cet agent"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Fréquence *</InputLabel>
                <Select
                  value={selectedFrequencyIndex}
                  label="Fréquence *"
                  onChange={(e) => setSelectedFrequencyIndex(e.target.value as number)}
                >
                  {frequencyOptions.map((option, index) => (
                    <MenuItem key={index} value={index}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                }
                label="Agent actif"
              />
            </Grid>

            {/* Configuration spécifique */}
            {selectedAgentType && agentConfigSchemas[selectedAgentType] && (
              <>
                <Grid item xs={12}>
                  <Typography variant="h6" sx={{ mt: 2, mb: 2 }}>
                    Configuration spécifique
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                    <Tab label="Formulaire" />
                    <Tab label="JSON" />
                  </Tabs>

                  <TabPanel value={tabValue} index={0}>
                    <DynamicConfigForm
                      configSchema={agentConfigSchemas[selectedAgentType]}
                      values={formData.config}
                      onChange={handleConfigChange}
                      errors={errors}
                      touched={touched}
                    />
                  </TabPanel>

                  <TabPanel value={tabValue} index={1}>
                    <TextField
                      fullWidth
                      multiline
                      rows={12}
                      value={JSON.stringify(formData.config, null, 2)}
                      onChange={(e) => {
                        try {
                          const config = JSON.parse(e.target.value)
                          setFormData({ ...formData, config })
                        } catch {
                          // Invalid JSON, keep current value
                        }
                      }}
                      helperText="Éditez la configuration en JSON"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  </TabPanel>
                </Grid>
              </>
            )}

            {!selectedAgentType && (
              <Grid item xs={12}>
                <Alert severity="info">
                  Sélectionnez un type d'agent pour afficher les options de configuration
                </Alert>
              </Grid>
            )}

            {/* Actions */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<CancelIcon />}
                  onClick={handleCancel}
                  disabled={createMutation.isPending}
                >
                  Annuler
                </Button>
                <Button
                  variant="contained"
                  startIcon={createMutation.isPending ? <CircularProgress size={20} /> : <SaveIcon />}
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                >
                  Créer l'agent
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  )
}

export default AgentCreate
