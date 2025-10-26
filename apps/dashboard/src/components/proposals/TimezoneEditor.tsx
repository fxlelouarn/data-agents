import React, { useState } from 'react'
import {
  Box,
  FormControl,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  InputLabel
} from '@mui/material'
import {
  Check as CheckIcon,
  Close as CloseIcon
} from '@mui/icons-material'
import { COMMON_TIMEZONES } from '@/utils/timezone'

interface TimezoneEditorProps {
  fieldName: string
  initialValue: string
  onSave: (fieldName: string, newValue: string) => void
  onCancel: () => void
}

const TimezoneEditor: React.FC<TimezoneEditorProps> = ({
  fieldName,
  initialValue,
  onSave,
  onCancel
}) => {
  const [value, setValue] = useState(initialValue || 'Europe/Paris')

  const handleSave = () => {
    onSave(fieldName, value)
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
      <FormControl size="small" fullWidth>
        <InputLabel>Timezone</InputLabel>
        <Select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          label="Timezone"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <MenuItem key={tz} value={tz}>
              {tz}
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

export default TimezoneEditor
