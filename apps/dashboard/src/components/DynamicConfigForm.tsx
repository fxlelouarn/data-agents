import React from 'react'
import {
  Grid,
  TextField,
  Switch,
  FormControlLabel,
  Typography,
  Slider,
  Box,
  MenuItem,
  Tooltip,
  IconButton,
  Chip,
  Alert,
  Button
} from '@mui/material'
import { Help as HelpIcon, Settings as SettingsIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useDatabases } from '@/hooks/useApi'

// Interface pour le schema de configuration
interface ConfigFieldSchema {
  type: 'text' | 'number' | 'boolean' | 'password' | 'select' | 'textarea' | 'database_select'
  label: string
  description?: string
  required?: boolean
  default?: any
  min?: number
  max?: number
  step?: number
  options?: Array<{ value: any; label: string }>
  rows?: number
  placeholder?: string
  validation?: {
    pattern?: string
    message?: string
  }
  category?: string
  advanced?: boolean
  order?: number
}

interface ConfigSchema {
  [fieldName: string]: ConfigFieldSchema
}

interface DynamicConfigFormProps {
  configSchema?: ConfigSchema
  values: any
  onChange: (field: string, value: any) => void
  errors?: { [field: string]: string }
  touched?: { [field: string]: boolean }
}

const DynamicConfigForm: React.FC<DynamicConfigFormProps> = ({
  configSchema = {},
  values,
  onChange,
  errors = {},
  touched = {}
}) => {
  const navigate = useNavigate()
  // Récupérer les bases de données disponibles
  const { data: databasesData, isLoading: databasesLoading, error: databasesError } = useDatabases()
  // Grouper les champs par catégorie et les trier par ordre
  const groupedFields = React.useMemo(() => {
    const groups: { [category: string]: Array<[string, ConfigFieldSchema]> } = {}
    
    // Convertir en array et trier par ordre si défini
    const sortedEntries = Object.entries(configSchema).sort(([, a], [, b]) => {
      const orderA = a.order ?? 1000 // Valeurs sans order en fin
      const orderB = b.order ?? 1000
      return orderA - orderB
    })
    
    sortedEntries.forEach(([fieldName, fieldConfig]) => {
      const category = fieldConfig.category || 'Configuration'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push([fieldName, fieldConfig])
    })
    
    return groups
  }, [configSchema])

  const renderField = (fieldName: string, fieldConfig: ConfigFieldSchema) => {
    const value = values[fieldName] ?? fieldConfig.default ?? ''
    const hasError = touched[fieldName] && Boolean(errors[fieldName])
    const errorMessage = hasError ? errors[fieldName] : undefined

    // Helper pour les props communes
    const commonProps = {
      fullWidth: true,
      error: hasError,
      helperText: errorMessage || fieldConfig.description,
      variant: 'outlined' as const,
      value,
      onChange: (e: any) => {
        let newValue = e.target.value
        
        // Conversion de types
        if (fieldConfig.type === 'number') {
          newValue = newValue === '' ? undefined : Number(newValue)
        } else if (fieldConfig.type === 'boolean') {
          newValue = e.target.checked
        }
        
        onChange(fieldName, newValue)
      }
    }

    switch (fieldConfig.type) {
      case 'boolean':
        return (
          <FormControlLabel
            key={fieldName}
            control={
              <Switch
                checked={Boolean(value)}
                onChange={commonProps.onChange}
                color="primary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography>{fieldConfig.label}</Typography>
                {fieldConfig.description && (
                  <Tooltip title={fieldConfig.description}>
                    <IconButton size="small">
                      <HelpIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            }
            sx={{ mt: 1 }}
          />
        )

      case 'number':
        if (fieldConfig.min !== undefined && fieldConfig.max !== undefined && fieldConfig.max - fieldConfig.min <= 100) {
          // Utiliser un slider pour les plages de valeurs raisonnables
          return (
            <Box key={fieldName} sx={{ mt: 2, mb: 3 }}>
              <Typography gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {fieldConfig.label}
                {fieldConfig.description && (
                  <Tooltip title={fieldConfig.description}>
                    <IconButton size="small">
                      <HelpIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Typography>
              <Box sx={{ px: 2, mt: 4 }}>
                <Slider
                  value={Number(value) || fieldConfig.default || fieldConfig.min || 0}
                  onChange={(_, newValue) => onChange(fieldName, newValue)}
                  min={fieldConfig.min}
                  max={fieldConfig.max}
                  step={fieldConfig.step || 1}
                  marks
                  valueLabelDisplay="on"
                  color={hasError ? 'error' : 'primary'}
                />
              </Box>
              {hasError && (
                <Typography variant="caption" color="error" sx={{ ml: 2 }}>
                  {errorMessage}
                </Typography>
              )}
            </Box>
          )
        } else {
          // TextField numérique standard
          return (
            <TextField
              key={fieldName}
              {...commonProps}
              type="number"
              label={fieldConfig.label}
              InputProps={{
                inputProps: {
                  min: fieldConfig.min,
                  max: fieldConfig.max,
                  step: fieldConfig.step || 1
                },
                endAdornment: fieldConfig.description ? (
                  <Tooltip title={fieldConfig.description}>
                    <IconButton size="small">
                      <HelpIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : undefined
              }}
            />
          )
        }

      case 'password':
        return (
          <TextField
            key={fieldName}
            {...commonProps}
            type="password"
            label={fieldConfig.label}
            placeholder={fieldConfig.placeholder}
            InputProps={{
              endAdornment: fieldConfig.description ? (
                <Tooltip title={fieldConfig.description}>
                  <IconButton size="small">
                    <HelpIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined
            }}
          />
        )

      case 'select':
        // Pour les champs database_select, peupler les options avec les bases de données
        let selectOptions = fieldConfig.options || []
        if (fieldName === 'sourceDatabase' && databasesData?.data) {
          const databases = databasesData.data.filter(db => db.isActive)
          selectOptions = databases.map(db => ({
            value: db.id,
            label: `${db.name} (${db.type})`
          }))
        }
        
        return (
          <TextField
            key={fieldName}
            {...commonProps}
            select
            label={fieldConfig.label}
            InputProps={{
              endAdornment: fieldConfig.description ? (
                <Tooltip title={fieldConfig.description}>
                  <IconButton size="small">
                    <HelpIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined
            }}
          >
            {selectOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        )

      case 'database_select':
        const databases = databasesData?.data || []
        const activeDatabases = databases.filter(db => db.isActive)
        
        if (databasesError) {
          // Analyser le type d'erreur pour afficher le bon message
          const isApiNotImplemented = (databasesError as any)?.response?.status === 404 || 
                                     (databasesError as any)?.response?.status === 501 ||
                                     (databasesError as any)?.message?.includes('404')
          
          if (isApiNotImplemented) {
            return (
              <Box key={fieldName}>
                <Alert 
                  severity="info" 
                  sx={{ mb: 2 }}
                >
                  <Typography variant="subtitle2" gutterBottom>
                    🛠️ API des bases de données non disponible
                  </Typography>
                  <Typography variant="body2">
                    L'API pour récupérer les bases de données n'est pas encore implémentée côté backend.
                    En attendant, vous pouvez configurer manuellement la base de données dans la configuration JSON.
                  </Typography>
                </Alert>
                <TextField
                  {...commonProps}
                  disabled
                  label={fieldConfig.label}
                  placeholder="Configurez via l'onglet JSON en attendant l'implémentation"
                  helperText="Utilisez l'onglet JSON pour saisir manuellement l'ID de la base de données"
                />
              </Box>
            )
          } else {
            // Autre type d'erreur (réseau, serveur, etc.)
            return (
              <Box key={fieldName}>
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    ❌ Erreur lors du chargement des bases de données
                  </Typography>
                  <Typography variant="body2">
                    Impossible de récupérer la liste des bases de données. Vérifiez votre connexion.
                  </Typography>
                </Alert>
                <TextField
                  {...commonProps}
                  disabled
                  label={fieldConfig.label}
                  placeholder="Erreur de chargement"
                  helperText="Essayez de recharger la page"
                />
              </Box>
            )
          }
        }
        
        if (activeDatabases.length === 0 && !databasesLoading) {
          // Distinguer entre "aucune base configurée" et "bases configurées mais inactives"
          const hasInactiveDatabases = databases.length > 0
          
          return (
            <Box key={fieldName}>
              <Alert 
                severity="warning" 
                sx={{ mb: 2 }}
                action={
                  <Button 
                    color="inherit" 
                    size="small" 
                    startIcon={<SettingsIcon />}
                    onClick={() => {
                      // Navigation vers la page des paramètres
                      navigate('/settings')
                    }}
                  >
                    {hasInactiveDatabases ? 'Activer une BDD' : 'Configurer une BDD'}
                  </Button>
                }
              >
                <Typography variant="subtitle2" gutterBottom>
                  {hasInactiveDatabases 
                    ? '⚠️ Bases de données configurées mais inactives'
                    : '📊 Aucune base de données configurée'
                  }
                </Typography>
                <Typography variant="body2">
                  {hasInactiveDatabases 
                    ? `Vous avez ${databases.length} base${databases.length > 1 ? 's' : ''} de données configurée${databases.length > 1 ? 's' : ''} mais aucune n'est activée. Activez-en au moins une pour utiliser cet agent.`
                    : 'Pour utiliser cet agent, vous devez d\'abord configurer une connexion à une base de données contenant les événements à traiter.'
                  }
                </Typography>
                {!hasInactiveDatabases && (
                  <Typography component="ul" variant="body2" sx={{ mt: 1, pl: 2 }}>
                    <li>Allez dans les paramètres du gestionnaire d'agents</li>
                    <li>Ajoutez une nouvelle connexion de base de données</li> 
                    <li>Activez-la pour qu'elle soit disponible ici</li>
                  </Typography>
                )}
              </Alert>
              <TextField
                {...commonProps}
                disabled
                label={fieldConfig.label}
                placeholder={hasInactiveDatabases 
                  ? 'Activez d\'abord une base de données' 
                  : 'Configurez d\'abord une base de données'
                }
                helperText={hasInactiveDatabases
                  ? 'Des bases sont configurées mais inactives'
                  : 'Aucune base de données configurée dans les paramètres'
                }
              />
            </Box>
          )
        }
        
        return (
          <TextField
            key={fieldName}
            {...commonProps}
            select
            label={fieldConfig.label}
            disabled={databasesLoading}
            helperText={databasesLoading ? 'Chargement des bases de données...' : (errorMessage || fieldConfig.description)}
            InputProps={{
              endAdornment: fieldConfig.description ? (
                <Tooltip title={fieldConfig.description}>
                  <IconButton size="small">
                    <HelpIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined
            }}
          >
            {activeDatabases.map((database) => (
              <MenuItem key={database.id} value={database.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography>{database.name}</Typography>
                  <Chip size="small" label={database.type} variant="outlined" />
                </Box>
              </MenuItem>
            ))}
          </TextField>
        )

      case 'textarea':
        return (
          <TextField
            key={fieldName}
            {...commonProps}
            multiline
            rows={fieldConfig.rows || 3}
            label={fieldConfig.label}
            placeholder={fieldConfig.placeholder}
            InputProps={{
              endAdornment: fieldConfig.description ? (
                <Tooltip title={fieldConfig.description}>
                  <IconButton size="small">
                    <HelpIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined
            }}
          />
        )


      case 'text':
      default:
        return (
          <TextField
            key={fieldName}
            {...commonProps}
            label={fieldConfig.label}
            placeholder={fieldConfig.placeholder}
            InputProps={{
              endAdornment: fieldConfig.description ? (
                <Tooltip title={fieldConfig.description}>
                  <IconButton size="small">
                    <HelpIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : undefined
            }}
          />
        )
    }
  }

  if (Object.keys(configSchema).length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Aucun paramètre configurable défini pour cet agent
        </Typography>
      </Box>
    )
  }

  // Fonction pour capitaliser la première lettre d'une catégorie
  const capitalizeCategory = (text: string) => {
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  // Fonction pour normaliser un type de champ
  const normalizeFieldType = (type: string, fieldConfig?: ConfigFieldSchema) => {
    // Pour les nombres avec min/max qui forment une petite plage, c'est un slider
    if (type === 'number' && fieldConfig?.min !== undefined && fieldConfig?.max !== undefined && (fieldConfig.max - fieldConfig.min) <= 100) {
      return 'slider'
    }
    // Regrouper text, password et number comme "input"
    if (['text', 'password', 'number'].includes(type)) {
      return 'input'
    }
    // Les autres types (select, switch, slider, etc.) gardent leur propre type
    return type
  }

  // Fonction pour regrouper les champs de façon intelligente
  // Les champs du même type normalisé sont groupés ensemble sur une ou deux colonnes
  const groupFieldsByType = (fields: Array<[string, ConfigFieldSchema]>) => {
    // Regrouper les champs par type normalisé
    const typeGroups: { [type: string]: Array<[string, ConfigFieldSchema]> } = {}
    
    fields.forEach(([fieldName, fieldConfig]) => {
      const normalizedType = normalizeFieldType(fieldConfig.type || 'text', fieldConfig)
      if (!typeGroups[normalizedType]) {
        typeGroups[normalizedType] = []
      }
    typeGroups[normalizedType].push([fieldName, fieldConfig])
    })
    
    return typeGroups
  }

  // Fonction pour créer des paires de champs (pour layout 2 colonnes)
  const createFieldPairs = (fields: Array<[string, ConfigFieldSchema]>, fieldType: string) => {
    // Pour les champs simples (input) et sliders, on peut les mettre 2 par 2
    // Pour les autres types (select, switch), chacun prend une ligne complète
    if (fieldType === 'input' || fieldType === 'slider') {
      const pairs: Array<Array<[string, ConfigFieldSchema]>> = []
      for (let i = 0; i < fields.length; i += 2) {
        pairs.push(fields.slice(i, i + 2))
      }
      return pairs
    } else {
      // Un champ par ligne pour les autres types (select, switch, boolean, etc.)
      return fields.map(field => [field])
    }
  }


  return (
    <Box>
      {Object.entries(groupedFields).map(([category, fields]) => {
        const fieldsByType = groupFieldsByType(fields)
        
        return (
          <Box key={category} sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Typography variant="h6" color="primary">
                {capitalizeCategory(category)}
              </Typography>
              <Chip 
                size="small" 
                label={`${fields.length} paramètre${fields.length > 1 ? 's' : ''}`}
                variant="outlined"
              />
            </Box>

            <Box>
              {Object.entries(fieldsByType).map(([fieldType, typeFields]) => {
                // Créer des paires de champs intelligentes
                const fieldPairs = createFieldPairs(typeFields, fieldType)
                
                return (
                  <Box key={fieldType} sx={{ mb: 3 }}>
                    {fieldPairs.map((pair, pairIndex) => (
                      <Grid container spacing={3} key={`${fieldType}-pair-${pairIndex}`} sx={{ mb: fieldPairs.length > pairIndex + 1 ? 0 : 0 }}>
                        {pair.map(([fieldName, fieldConfig]) => {
                          // Déterminer la taille de la grille
                          let gridSize = 12
                          // Si c'est un champ input ou slider et qu'il y a 2 champs dans la paire, utiliser 6
                          if ((fieldType === 'input' || fieldType === 'slider') && pair.length === 2) {
                            gridSize = 6
                          }
                          // Pour les autres types, toujours 12 (pleine largeur)
                          
                          return (
                            <Grid item xs={12} md={gridSize} key={fieldName}>
                              {renderField(fieldName, fieldConfig)}
                            </Grid>
                          )
                        })}
                      </Grid>
                    ))}
                  </Box>
                )
              })}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

export default DynamicConfigForm