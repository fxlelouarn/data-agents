import React from 'react'
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { SPORT_GROUPS, type SportGroup } from '@/constants/sports'

interface SportFilterSelectProps {
  value: SportGroup | ''
  onChange: (value: SportGroup | '') => void
}

const SportFilterSelect: React.FC<SportFilterSelectProps> = ({ value, onChange }) => {
  return (
    <FormControl size="small" sx={{ minWidth: 200 }}>
      <InputLabel>Sport</InputLabel>
      <Select
        value={value}
        label="Sport"
        onChange={(e) => onChange(e.target.value as SportGroup | '')}
      >
        <MenuItem value="">Tous les sports</MenuItem>
        {(Object.entries(SPORT_GROUPS) as [SportGroup, typeof SPORT_GROUPS[SportGroup]][]).map(
          ([key, { label }]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          )
        )}
      </Select>
    </FormControl>
  )
}

export default SportFilterSelect
