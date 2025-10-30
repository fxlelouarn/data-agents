import React, { useState } from 'react'
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  IconButton,
  Tooltip
} from '@mui/material'
import {
  Check as SaveIcon,
  Close as CancelIcon
} from '@mui/icons-material'

interface CalendarStatusEditorProps {
  fieldName: string
  initialValue: string
  onSave: (fieldName: string, value: string) => void
  onCancel: () => void
}

const CalendarStatusEditor: React.FC<CalendarStatusEditorProps> = ({
  fieldName,
  initialValue,
  onSave,
  onCancel
}) => {
  const [value, setValue] = useState<string>(initialValue || 'CONFIRMED')
  
  const handleSave = () => {
    onSave(fieldName, value)
  }
  
  const calendarStatusOptions = [
    { value: 'CONFIRMED', label: 'Confirmé' },
    { value: 'TO_BE_CONFIRMED', label: 'À confirmer' },
    { value: 'CANCELED', label: 'Annulé' }
  ]
  
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <Select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        >
          {calendarStatusOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <Tooltip title="Enregistrer">
        <IconButton
          size="small"
          color="success"
          onClick={handleSave}
        >
          <SaveIcon />
        </IconButton>
      </Tooltip>
      
      <Tooltip title="Annuler">
        <IconButton
          size="small"
          color="error"
          onClick={onCancel}
        >
          <CancelIcon />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

export default CalendarStatusEditor
