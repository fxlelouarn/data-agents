import React from 'react'
import {
  Grid,
  Typography,
  Box,
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
    normalizedSchema.categories?.forEach(category => {
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

  const formatValue = (field: ConfigField, value: any) => {
    if (value === undefined || value === null) {
      return field.defaultValue !== undefined ? String(field.defaultValue) : '-'
    }

    switch (field.type) {
      case 'switch':
        return value ? 'Activé' : 'Désactivé'
      
      case 'select':
        const option = field.options?.find(opt => opt.value === value)
        return option ? option.label : String(value)
      
      case 'password':
        return value ? '••••••••' : '-'
      
      case 'slider':
        return `${value}${field.validation?.max ? ` / ${field.validation.max}` : ''}`
      
      default:
        return String(value)
    }
  }

  const renderField = (field: ConfigField) => {
    const value = values[field.name]
    const displayValue = formatValue(field, value)
    const isEmpty = value === undefined || value === null || value === ''

    return (
      <Grid item xs={12} md={6} key={field.name}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {field.label}
            {field.required && <span style={{ color: 'red' }}> *</span>}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', minHeight: '40px' }}>
            {field.type === 'switch' ? (
              <Chip 
                label={displayValue}
                color={value ? 'success' : 'default'}
                variant={value ? 'filled' : 'outlined'}
                size="small"
              />
            ) : isEmpty ? (
              <Typography variant="body2" color="text.disabled" fontStyle="italic">
                Non configuré
              </Typography>
            ) : (
              <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                {displayValue}
              </Typography>
            )}
          </Box>
          {field.description && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {field.description}
            </Typography>
          )}
        </Box>
      </Grid>
    )
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
      {Object.entries(groupedFields).map(([categoryId, { category, fields }], index) => (
        <Card key={categoryId} sx={{ mb: index < Object.keys(groupedFields).length - 1 ? 3 : 0 }}>
          <CardContent>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                {category.label}
              </Typography>
              {category.description && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {category.description}
                </Typography>
              )}
              <Divider />
            </Box>
            
            <Grid container spacing={3}>
              {fields.map(field => renderField(field))}
            </Grid>
          </CardContent>
        </Card>
      ))}
    </Box>
  )
}

export default DynamicConfigDisplay