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
  Chip,
  Card,
  CardContent,
  Divider
} from '@mui/material'
import { ConfigField, ConfigCategory, ConfigSchema } from '@data-agents/types'

interface DynamicConfigDisplayProps {
  configSchema: ConfigSchema
  values: any
}

const DynamicConfigDisplay: React.FC<DynamicConfigDisplayProps> = ({
  configSchema,
  values
}) => {
  // Normaliser le configSchema (support ancien format objet plat)
  const normalizedSchema = React.useMemo(() => {
    // Si c'est déjà le nouveau format avec fields/categories
    if (configSchema.fields && Array.isArray(configSchema.fields)) {
      return configSchema
    }

    // Sinon, convertir depuis l'ancien format (objet plat avec champs comme clés)
    const fields: ConfigField[] = []
    const { title, description, categories, fields: _, ...fieldConfigs } = configSchema as any

    Object.entries(fieldConfigs).forEach(([name, config]: [string, any]) => {
      if (config && typeof config === 'object' && config.type) {
        fields.push({
          name,
          ...config
        })
      }
    })

    return {
      ...configSchema,
      fields,
      categories: categories || []
    }
  }, [configSchema])

  // Grouper les champs par catégorie
  const groupedFields = React.useMemo(() => {
    const groups: { [categoryId: string]: { category: ConfigCategory; fields: ConfigField[] } } = {}

    // Créer les groupes à partir des catégories définies
    normalizedSchema.categories?.forEach((category: ConfigCategory) => {
      groups[category.id] = {
        category,
        fields: []
      }
    })

    // Ajouter une catégorie par défaut si aucune n'est définie
    if (!normalizedSchema.categories || normalizedSchema.categories.length === 0) {
      groups['default'] = {
        category: { id: 'default', label: 'Configuration' },
        fields: []
      }
    }

    // Assigner les champs aux catégories
    if (!normalizedSchema.fields || !Array.isArray(normalizedSchema.fields)) {
      console.warn('normalizedSchema.fields is not an array:', normalizedSchema)
      return groups
    }

    normalizedSchema.fields.forEach(field => {
      const categoryId = field.category || 'default'
      if (groups[categoryId]) {
        groups[categoryId].fields.push(field)
      } else {
        // Si la catégorie n'existe pas, l'ajouter à la catégorie par défaut
        if (!groups['default']) {
          groups['default'] = {
            category: { id: 'default', label: 'Configuration' },
            fields: []
          }
        }
        groups['default'].fields.push(field)
      }
    })

    // Supprimer les catégories vides
    Object.keys(groups).forEach(key => {
      if (groups[key].fields.length === 0) {
        delete groups[key]
      }
    })

    return groups
  }, [normalizedSchema])

  const getDisplayValue = (field: ConfigField, value: any) => {
    // Utiliser la valeur par défaut si la valeur est undefined/null
    const effectiveValue = (value === undefined || value === null)
      ? field.defaultValue
      : value

    return effectiveValue
  }

  const getSelectLabel = (field: ConfigField, value: any) => {
    const option = field.options?.find(opt => opt.value === value)
    return option ? option.label : String(value || '')
  }

  const renderField = (field: ConfigField) => {
    const rawValue = values[field.name]
    const value = getDisplayValue(field, rawValue)
    const isEmpty = value === undefined || value === null || value === ''

    switch (field.type) {
      case 'switch':
      case 'boolean':
        return (
          <FormControlLabel
            key={field.name}
            control={
              <Switch
                checked={Boolean(value)}
                disabled
                color="primary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography>{field.label}</Typography>
              </Box>
            }
            sx={{ mt: 1 }}
          />
        )

      case 'slider':
        return (
          <Box key={field.name} sx={{ mt: 2, mb: 3 }}>
            <Typography gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {field.label}
              {field.required && <span style={{ color: 'red' }}> *</span>}
            </Typography>
            <Box sx={{ px: 2, mt: 4 }}>
              <Slider
                value={Number(value) || field.validation?.min || 0}
                disabled
                min={field.validation?.min}
                max={field.validation?.max}
                step={field.validation?.step || 0.05}
                marks
                valueLabelDisplay="on"
              />
            </Box>
            {field.description && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2, mt: 0.5, display: 'block' }}>
                {field.description}
              </Typography>
            )}
          </Box>
        )

      case 'number':
        // Vérifier si c'est un slider implicite (nombre avec min/max proche)
        const hasSliderRange = field.validation?.min !== undefined &&
          field.validation?.max !== undefined &&
          (field.validation.max - field.validation.min) <= 100

        if (hasSliderRange) {
          return (
            <Box key={field.name} sx={{ mt: 2, mb: 3 }}>
              <Typography gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {field.label}
                {field.required && <span style={{ color: 'red' }}> *</span>}
              </Typography>
              <Box sx={{ px: 2, mt: 4 }}>
                <Slider
                  value={Number(value) || field.validation?.min || 0}
                  disabled
                  min={field.validation?.min}
                  max={field.validation?.max}
                  step={field.validation?.step || 1}
                  marks
                  valueLabelDisplay="on"
                />
              </Box>
              {field.description && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 2, mt: 0.5, display: 'block' }}>
                  {field.description}
                </Typography>
              )}
            </Box>
          )
        }

        return (
          <TextField
            key={field.name}
            fullWidth
            disabled
            variant="outlined"
            label={field.label}
            value={isEmpty ? '' : value}
            helperText={field.description}
            InputProps={{
              readOnly: true
            }}
          />
        )

      case 'select':
        return (
          <TextField
            key={field.name}
            fullWidth
            disabled
            select
            variant="outlined"
            label={field.label}
            value={value || ''}
            helperText={field.description}
          >
            {field.options?.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
            {/* Ajouter l'option actuelle si elle n'est pas dans la liste */}
            {value && !field.options?.find(o => o.value === value) && (
              <MenuItem value={value}>
                {getSelectLabel(field, value)}
              </MenuItem>
            )}
          </TextField>
        )

      case 'database_select':
        return (
          <TextField
            key={field.name}
            fullWidth
            disabled
            variant="outlined"
            label={field.label}
            value={value || ''}
            helperText={field.description}
            InputProps={{
              readOnly: true
            }}
          />
        )

      case 'multiselect':
        const selectedValues = Array.isArray(value) ? value : []
        const multiselectOptions = field.options || []

        return (
          <Box key={field.name} sx={{ mb: 2 }}>
            <Typography gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 500 }}>
              {field.label}
              {field.required && <span style={{ color: 'red' }}> *</span>}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, ml: 1 }}>
              {multiselectOptions.map((option) => (
                <FormControlLabel
                  key={option.value}
                  control={
                    <Switch
                      checked={selectedValues.includes(option.value)}
                      disabled
                      color="primary"
                      size="small"
                    />
                  }
                  label={option.label}
                  sx={{
                    border: '1px solid',
                    borderColor: selectedValues.includes(option.value) ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    px: 1,
                    py: 0.5,
                    m: 0,
                    bgcolor: selectedValues.includes(option.value) ? 'action.selected' : 'transparent',
                    opacity: 0.8
                  }}
                />
              ))}
            </Box>
            {field.description && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2, mt: 0.5, display: 'block' }}>
                {field.description}
              </Typography>
            )}
          </Box>
        )

      case 'password':
        return (
          <TextField
            key={field.name}
            fullWidth
            disabled
            variant="outlined"
            label={field.label}
            value={value ? '••••••••' : ''}
            helperText={field.description}
            InputProps={{
              readOnly: true
            }}
          />
        )

      case 'textarea':
        return (
          <TextField
            key={field.name}
            fullWidth
            disabled
            multiline
            rows={3}
            variant="outlined"
            label={field.label}
            value={isEmpty ? '' : value}
            helperText={field.description}
            InputProps={{
              readOnly: true
            }}
          />
        )

      case 'text':
      default:
        return (
          <TextField
            key={field.name}
            fullWidth
            disabled
            variant="outlined"
            label={field.label}
            value={isEmpty ? '' : value}
            helperText={field.description}
            InputProps={{
              readOnly: true
            }}
          />
        )
    }
  }

  // Fonction pour normaliser un type de champ (comme dans DynamicConfigForm)
  const normalizeFieldType = (field: ConfigField) => {
    const type = field.type || 'text'
    // Pour les nombres avec min/max qui forment une petite plage, c'est un slider
    if (type === 'number' && field.validation?.min !== undefined && field.validation?.max !== undefined && (field.validation.max - field.validation.min) <= 100) {
      return 'slider'
    }
    // Regrouper text, password et number comme "input"
    if (['text', 'password', 'number', 'database_select'].includes(type)) {
      return 'input'
    }
    // Les autres types (select, switch, slider, etc.) gardent leur propre type
    return type
  }

  // Fonction pour regrouper les champs par type normalisé
  const groupFieldsByType = (fields: ConfigField[]) => {
    const typeGroups: { [type: string]: ConfigField[] } = {}

    fields.forEach((field) => {
      const normalizedType = normalizeFieldType(field)
      if (!typeGroups[normalizedType]) {
        typeGroups[normalizedType] = []
      }
      typeGroups[normalizedType].push(field)
    })

    return typeGroups
  }

  // Fonction pour créer des paires de champs (pour layout 2 colonnes)
  const createFieldPairs = (fields: ConfigField[], fieldType: string) => {
    // Pour les champs simples (input) et sliders, on peut les mettre 2 par 2
    if (fieldType === 'input' || fieldType === 'slider') {
      const pairs: ConfigField[][] = []
      for (let i = 0; i < fields.length; i += 2) {
        pairs.push(fields.slice(i, i + 2))
      }
      return pairs
    } else {
      // Un champ par ligne pour les autres types
      return fields.map(field => [field])
    }
  }

  if (Object.keys(groupedFields).length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" align="center">
            Aucune configuration définie
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Box>
      {Object.entries(groupedFields).map(([categoryId, { category, fields }], index) => {
        const fieldsByType = groupFieldsByType(fields)

        return (
          <Card key={categoryId} sx={{ mb: index < Object.keys(groupedFields).length - 1 ? 3 : 0 }}>
            <CardContent>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  <Typography variant="h6" color="primary">
                    {category.label}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${fields.length} paramètre${fields.length > 1 ? 's' : ''}`}
                    variant="outlined"
                  />
                </Box>
                {category.description && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {category.description}
                  </Typography>
                )}
                <Divider sx={{ mt: 1 }} />
              </Box>

              <Box>
                {Object.entries(fieldsByType).map(([fieldType, typeFields]) => {
                  const fieldPairs = createFieldPairs(typeFields, fieldType)

                  return (
                    <Box key={fieldType} sx={{ mb: 3 }}>
                      {fieldPairs.map((pair, pairIndex) => (
                        <Grid container spacing={3} key={`${fieldType}-pair-${pairIndex}`}>
                          {pair.map((field) => {
                            // Déterminer la taille de la grille
                            let gridSize = 12
                            if ((fieldType === 'input' || fieldType === 'slider') && pair.length === 2) {
                              gridSize = 6
                            }

                            return (
                              <Grid item xs={12} md={gridSize} key={field.name}>
                                {renderField(field)}
                              </Grid>
                            )
                          })}
                        </Grid>
                      ))}
                    </Box>
                  )
                })}
              </Box>
            </CardContent>
          </Card>
        )
      })}
    </Box>
  )
}

export default DynamicConfigDisplay
