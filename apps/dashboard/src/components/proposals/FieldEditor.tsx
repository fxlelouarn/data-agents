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

interface FieldEditorProps {
  fieldName: string
  initialValue: any
  fieldType?: 'text' | 'number' | 'date' | 'datetime-local'
  onSave: (fieldName: string, newValue: any) => void
  onCancel: () => void
}

const FieldEditor: React.FC<FieldEditorProps> = ({
  fieldName,
  initialValue,
  fieldType = 'text',
  onSave,
  onCancel
}) => {
  const [value, setValue] = useState(() => {
    // Formatter la valeur initiale selon le type
    if (fieldType === 'datetime-local' && initialValue) {
      try {
        const date = new Date(initialValue)
        // Format ISO sans Z pour datetime-local input
        return date.toISOString().slice(0, 16)
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
      // Reconvertir en ISO string complet
      finalValue = new Date(value).toISOString()
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
