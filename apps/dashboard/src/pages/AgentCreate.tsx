import React, { useState } from 'react'
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
} from '@mui/material'
import { Save as SaveIcon, Cancel as CancelIcon } from '@mui/icons-material'
import { useCreateAgent } from '@/hooks/useApi'
import DynamicConfigForm from '@/components/DynamicConfigForm'
import { AgentType } from '@/types'

// Types d'agents disponibles avec leurs configurations
const agentTypeLabels: Record<string, string> = {
  GOOGLE_SEARCH_DATE: 'Google Search Date Agent',
  FFA_SCRAPER: 'FFA Scraper Agent',
  AUTO_VALIDATOR: 'Auto Validator Agent',
}

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

// Schémas de configuration par type d'agent
const agentConfigSchemas: Record<string, any> = {
  FFA_SCRAPER: {
    sourceDatabase: {
      type: 'database_select',
      label: 'Base de données',
      description: 'Base de données Miles Republic à utiliser',
      required: true,
      category: 'Configuration générale',
      order: 1,
    },
    ligues: {
      type: 'text',
      label: 'Ligues FFA',
      description: 'Codes des ligues FFA séparés par des virgules (ex: ARA,IDF,PAC) ou "*" pour toutes',
      required: true,
      default: '*',
      category: 'Configuration générale',
      order: 2,
      placeholder: '* (toutes les ligues)',
    },
    monthsAhead: {
      type: 'number',
      label: 'Nombre de mois à scraper',
      description: 'Nombre de mois à scraper à partir d\'aujourd\'hui',
      required: false,
      default: 3,
      min: 1,
      max: 12,
      category: 'Configuration générale',
      order: 3,
    },
    batchSize: {
      type: 'number',
      label: 'Taille des lots',
      description: 'Nombre de compétitions à traiter par lot',
      required: false,
      default: 10,
      min: 1,
      max: 100,
      category: 'Performance',
      order: 4,
    },
  },
  GOOGLE_SEARCH_DATE: {
    sourceDatabase: {
      type: 'database_select',
      label: 'Base de données',
      description: 'Base de données Miles Republic à utiliser',
      required: true,
      category: 'Configuration générale',
      order: 1,
    },
    googleApiKey: {
      type: 'password',
      label: 'Clé API Google',
      description: 'Clé d\'API Google Custom Search',
      required: true,
      category: 'Configuration générale',
      order: 2,
    },
    searchEngineId: {
      type: 'text',
      label: 'Search Engine ID',
      description: 'ID du moteur de recherche personnalisé Google',
      required: true,
      category: 'Configuration générale',
      order: 3,
    },
    batchSize: {
      type: 'number',
      label: 'Taille des lots',
      description: 'Nombre d\'événements à traiter par lot',
      required: false,
      default: 10,
      min: 1,
      max: 50,
      category: 'Performance',
      order: 4,
    },
  },
  AUTO_VALIDATOR: {
    milesRepublicDatabase: {
      type: 'database_select',
      label: 'Base Miles Republic',
      description: 'Connexion à Miles Republic pour vérifier isFeatured et customerType',
      required: true,
      category: 'Validation',
      order: 1,
    },
    minConfidence: {
      type: 'number',
      label: 'Confiance minimale',
      description: 'Confiance minimale requise pour auto-valider (0.5 à 1.0)',
      required: true,
      default: 0.7,
      min: 0.5,
      max: 1.0,
      category: 'Validation',
      order: 2,
    },
    maxProposalsPerRun: {
      type: 'number',
      label: 'Propositions max par run',
      description: 'Nombre maximum de propositions à traiter par exécution',
      required: false,
      default: 100,
      min: 10,
      max: 500,
      category: 'Validation',
      order: 3,
    },
    enableEditionBlock: {
      type: 'switch',
      label: 'Valider bloc Edition',
      description: 'Valider automatiquement les modifications d\'édition (dates, URLs)',
      required: false,
      default: true,
      category: 'Blocs',
      order: 4,
    },
    enableOrganizerBlock: {
      type: 'switch',
      label: 'Valider bloc Organisateur',
      description: 'Valider automatiquement les modifications d\'organisateur',
      required: false,
      default: true,
      category: 'Blocs',
      order: 5,
    },
    enableRacesBlock: {
      type: 'switch',
      label: 'Valider bloc Courses',
      description: 'Valider les modifications de courses existantes (jamais de nouvelles courses)',
      required: false,
      default: true,
      category: 'Blocs',
      order: 6,
    },
    dryRun: {
      type: 'switch',
      label: 'Mode simulation',
      description: 'Simuler sans appliquer les validations (pour tester)',
      required: false,
      default: false,
      category: 'Avancé',
      order: 7,
    },
  },
}

// Mapping des types d'agents registrés vers les types AgentType
const agentTypeMapping: Record<string, AgentType> = {
  GOOGLE_SEARCH_DATE: 'EXTRACTOR',
  FFA_SCRAPER: 'EXTRACTOR',
  AUTO_VALIDATOR: 'VALIDATOR',
}

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

const AgentCreate: React.FC = () => {
  const navigate = useNavigate()
  const createMutation = useCreateAgent()

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

    console.log('🔧 Initializing config with defaults:', defaultConfig)

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

    console.log('🔍 Validation - formData:', formData)
    console.log('🔍 Validation - selectedAgentType:', selectedAgentType)

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
        console.log(`🔍 Checking field ${fieldName}:`, value, 'required:', fieldConfig.required)
        if (fieldConfig.required && !value) {
          newErrors[fieldName] = `${fieldConfig.label} est requis`
        }
      })
    }

    // Traiter les ligues (convertir en array)
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

    console.log('🔍 Validation errors:', newErrors)
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    console.log('🚀 handleSubmit called')

    if (!validateForm()) {
      console.log('❌ Validation failed')
      return
    }

    console.log('✅ Validation passed')

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

    console.log('📦 Agent data to send:', agentData)

    try {
      console.log('🔄 Calling createMutation.mutateAsync...')
      const response = await createMutation.mutateAsync(agentData)
      console.log('✅ Response received:', response)
      // Rediriger vers la page de détails de l'agent créé
      if (response.data?.id) {
        navigate(`/agents/${response.data.id}`)
      } else {
        navigate('/agents')
      }
    } catch (error) {
      // L'erreur est gérée par le hook useCreateAgent
      console.error('❌ Erreur lors de la création:', error)
    }
  }

  const handleCancel = () => {
    navigate('/agents')
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
                  {Object.entries(agentTypeLabels).map(([type, label]) => (
                    <MenuItem key={type} value={type}>
                      {label}
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
                        } catch (error) {
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
