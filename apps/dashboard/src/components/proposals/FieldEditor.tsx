import React, { useState } from 'react'
import {
  Box,
  TextField,
  IconButton,
  Tooltip
} from '@mui/material'
import {
  Check as CheckIcon,
  Close as CloseIcon
} from '@mui/icons-material'
import { utcToDatetimeLocal, datetimeLocalToUtc } from '@/utils/timezone'

interface FieldEditorProps {
  fieldName: string
  initialValue: any
  fieldType?: 'text' | 'number' | 'date' | 'datetime-local'
  timezone?: string // Timezone pour les dates
  onSave: (fieldName: string, newValue: any) => void
  onCancel: () => void
}

const FieldEditor: React.FC<FieldEditorProps> = ({
  fieldName,
  initialValue,
  fieldType = 'text',
  timezone = 'Europe/Paris',
  onSave,
  onCancel
}) => {
  const [value, setValue] = useState(() => {
    // Formatter la valeur initiale selon le type
    if (fieldType === 'datetime-local' && initialValue) {
      try {
        // Convertir la date UTC vers la timezone pour l'affichage
        return utcToDatetimeLocal(initialValue, timezone)
      } catch {
        return initialValue
      }
    }
    return initialValue || ''
  })

  const handleSave = () => {
    let finalValue = value
    
    // Convertir selon le type
    if (fieldType === 'number') {
      finalValue = parseFloat(value)
    } else if (fieldType === 'datetime-local') {
      // Convertir la date locale (dans la timezone) vers UTC
      finalValue = datetimeLocalToUtc(value, timezone)
    }
    
    onSave(fieldName, finalValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: '100%' }}>
      <TextField
        size="small"
        type={fieldType}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        fullWidth
        InputLabelProps={{
          shrink: true // Important pour datetime-local
        }}
      />
      <Tooltip title="Enregistrer">
        <IconButton 
          size="small" 
          color="success"
          onClick={handleSave}
        >
          <CheckIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Annuler">
        <IconButton 
          size="small"
          onClick={onCancel}
        >
          <CloseIcon />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

export default FieldEditor
