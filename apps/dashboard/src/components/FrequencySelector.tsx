import React, { useState, useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Slider,
  Chip,
  Stack,
  Collapse,
  IconButton,
  FormControlLabel,
  Checkbox,
  Alert,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  Schedule as ScheduleIcon,
  Tune as TuneIcon,
} from '@mui/icons-material'
import type { FrequencyConfig, FrequencyPreset } from '@data-agents/types'
import { FREQUENCY_PRESETS } from '@data-agents/types'

interface FrequencySelectorProps {
  value: FrequencyConfig
  onChange: (config: FrequencyConfig) => void
  error?: string
}

const DAY_LABELS = [
  { value: 0, label: 'Dim' },
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
]

/**
 * Formate une configuration de fréquence en texte lisible
 */
function formatFrequency(config: FrequencyConfig): string {
  if (!config?.type) return 'Non configuré'

  switch (config.type) {
    case 'interval': {
      const hours = Math.floor((config.intervalMinutes || 0) / 60)
      const minutes = (config.intervalMinutes || 0) % 60
      let interval = ''
      if (hours > 0 && minutes > 0) {
        interval = `${hours}h${minutes}min`
      } else if (hours > 0) {
        interval = `${hours}h`
      } else {
        interval = `${minutes}min`
      }

      let result = `Toutes les ${interval}`
      if (config.jitterMinutes) {
        const jitterH = Math.floor(config.jitterMinutes / 60)
        const jitterM = config.jitterMinutes % 60
        let jitter = ''
        if (jitterH > 0 && jitterM > 0) {
          jitter = `${jitterH}h${jitterM}min`
        } else if (jitterH > 0) {
          jitter = `${jitterH}h`
        } else {
          jitter = `${jitterM}min`
        }
        result += ` ± ${jitter}`
      }

      if (config.windowStart && config.windowEnd) {
        result += ` (${config.windowStart}-${config.windowEnd})`
      }

      return result
    }

    case 'daily': {
      return `Quotidien (${config.windowStart}-${config.windowEnd})`
    }

    case 'weekly': {
      const dayNames = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
      const days = (config.daysOfWeek || []).sort().map((d) => dayNames[d]).join(', ')
      return `Hebdo ${days} (${config.windowStart}-${config.windowEnd})`
    }

    default:
      return 'Configuration inconnue'
  }
}

/**
 * Trouve le preset correspondant à une configuration
 */
function findMatchingPreset(config: FrequencyConfig): FrequencyPreset | null {
  return FREQUENCY_PRESETS.find((preset) => {
    const p = preset.config
    if (p.type !== config.type) return false
    if (p.intervalMinutes !== config.intervalMinutes) return false
    if (p.jitterMinutes !== config.jitterMinutes) return false
    if (p.windowStart !== config.windowStart) return false
    if (p.windowEnd !== config.windowEnd) return false
    if (p.type === 'weekly') {
      const pDays = [...(p.daysOfWeek || [])].sort().join(',')
      const cDays = [...(config.daysOfWeek || [])].sort().join(',')
      if (pDays !== cDays) return false
    }
    return true
  }) || null
}

export function FrequencySelector({ value, onChange, error }: FrequencySelectorProps) {
  const [mode, setMode] = useState<'preset' | 'advanced'>(() => {
    // Si la valeur actuelle correspond à un preset, mode preset
    return findMatchingPreset(value) ? 'preset' : 'advanced'
  })
  const [advancedExpanded, setAdvancedExpanded] = useState(false)

  const matchingPreset = useMemo(() => findMatchingPreset(value), [value])

  const handlePresetChange = (presetId: string) => {
    const preset = FREQUENCY_PRESETS.find((p) => p.id === presetId)
    if (preset) {
      onChange(preset.config)
    }
  }

  const handleTypeChange = (newType: 'interval' | 'daily' | 'weekly') => {
    const defaults: Record<string, FrequencyConfig> = {
      interval: { type: 'interval', intervalMinutes: 120, jitterMinutes: 30 },
      daily: { type: 'daily', windowStart: '00:00', windowEnd: '05:00' },
      weekly: { type: 'weekly', windowStart: '00:00', windowEnd: '05:00', daysOfWeek: [1, 2, 3, 4, 5] },
    }
    onChange(defaults[newType])
  }

  const handleIntervalChange = (intervalMinutes: number) => {
    const maxJitter = Math.floor(intervalMinutes / 2)
    onChange({
      ...value,
      intervalMinutes,
      jitterMinutes: Math.min(value.jitterMinutes || 0, maxJitter),
    })
  }

  const handleJitterChange = (jitterMinutes: number) => {
    onChange({ ...value, jitterMinutes })
  }

  const handleWindowChange = (field: 'windowStart' | 'windowEnd', time: string) => {
    onChange({ ...value, [field]: time })
  }

  const handleDayToggle = (day: number) => {
    const currentDays = value.daysOfWeek || []
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort()
    onChange({ ...value, daysOfWeek: newDays })
  }

  const maxJitter = value.intervalMinutes ? Math.floor(value.intervalMinutes / 2) : 60

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          {/* Mode selector */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ScheduleIcon fontSize="small" />
              Fréquence d'exécution
            </Typography>
            <ToggleButtonGroup
              size="small"
              value={mode}
              exclusive
              onChange={(_, newMode) => newMode && setMode(newMode)}
            >
              <ToggleButton value="preset">Presets</ToggleButton>
              <ToggleButton value="advanced">
                <TuneIcon fontSize="small" sx={{ mr: 0.5 }} />
                Avancé
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Current value display */}
          <Alert severity="info" icon={<ScheduleIcon />}>
            {formatFrequency(value)}
          </Alert>

          {/* Preset mode */}
          {mode === 'preset' && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {FREQUENCY_PRESETS.map((preset) => (
                <Chip
                  key={preset.id}
                  label={preset.label}
                  onClick={() => handlePresetChange(preset.id)}
                  color={matchingPreset?.id === preset.id ? 'primary' : 'default'}
                  variant={matchingPreset?.id === preset.id ? 'filled' : 'outlined'}
                  title={preset.description}
                />
              ))}
            </Box>
          )}

          {/* Advanced mode */}
          {mode === 'advanced' && (
            <Stack spacing={2}>
              {/* Type selector */}
              <FormControl fullWidth size="small">
                <InputLabel>Type de fréquence</InputLabel>
                <Select
                  value={value.type || 'interval'}
                  label="Type de fréquence"
                  onChange={(e) => handleTypeChange(e.target.value as 'interval' | 'daily' | 'weekly')}
                >
                  <MenuItem value="interval">Intervalle régulier</MenuItem>
                  <MenuItem value="daily">Une fois par jour</MenuItem>
                  <MenuItem value="weekly">Une fois par semaine</MenuItem>
                </Select>
              </FormControl>

              {/* Interval settings */}
              {value.type === 'interval' && (
                <>
                  <Box>
                    <Typography variant="body2" gutterBottom>
                      Intervalle : {Math.floor((value.intervalMinutes || 0) / 60)}h
                      {(value.intervalMinutes || 0) % 60 > 0 && `${(value.intervalMinutes || 0) % 60}min`}
                    </Typography>
                    <Slider
                      value={value.intervalMinutes || 60}
                      onChange={(_, val) => handleIntervalChange(val as number)}
                      min={15}
                      max={720}
                      step={15}
                      marks={[
                        { value: 60, label: '1h' },
                        { value: 120, label: '2h' },
                        { value: 240, label: '4h' },
                        { value: 360, label: '6h' },
                        { value: 720, label: '12h' },
                      ]}
                    />
                  </Box>

                  <Box>
                    <Typography variant="body2" gutterBottom>
                      Variance (jitter) : ± {value.jitterMinutes || 0} min
                    </Typography>
                    <Slider
                      value={value.jitterMinutes || 0}
                      onChange={(_, val) => handleJitterChange(val as number)}
                      min={0}
                      max={maxJitter}
                      step={5}
                    />
                  </Box>

                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={!!(value.windowStart && value.windowEnd)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onChange({ ...value, windowStart: '08:00', windowEnd: '20:00' })
                            } else {
                              const { windowStart, windowEnd, ...rest } = value
                              onChange(rest as FrequencyConfig)
                            }
                          }}
                        />
                      }
                      label="Limiter à une fenêtre horaire"
                    />
                    <Collapse in={!!(value.windowStart && value.windowEnd)}>
                      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        <TextField
                          label="De"
                          type="time"
                          size="small"
                          value={value.windowStart || '08:00'}
                          onChange={(e) => handleWindowChange('windowStart', e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                          label="À"
                          type="time"
                          size="small"
                          value={value.windowEnd || '20:00'}
                          onChange={(e) => handleWindowChange('windowEnd', e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Box>
                    </Collapse>
                  </Box>
                </>
              )}

              {/* Daily/Weekly window settings */}
              {(value.type === 'daily' || value.type === 'weekly') && (
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Fenêtre de"
                    type="time"
                    size="small"
                    value={value.windowStart || '00:00'}
                    onChange={(e) => handleWindowChange('windowStart', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                  <TextField
                    label="Fenêtre à"
                    type="time"
                    size="small"
                    value={value.windowEnd || '05:00'}
                    onChange={(e) => handleWindowChange('windowEnd', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Box>
              )}

              {/* Weekly day selector */}
              {value.type === 'weekly' && (
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Jours d'exécution
                  </Typography>
                  <ToggleButtonGroup
                    value={value.daysOfWeek || []}
                    onChange={(_, newDays) => onChange({ ...value, daysOfWeek: newDays })}
                    size="small"
                  >
                    {DAY_LABELS.map((day) => (
                      <ToggleButton
                        key={day.value}
                        value={day.value}
                        selected={(value.daysOfWeek || []).includes(day.value)}
                        onClick={() => handleDayToggle(day.value)}
                      >
                        {day.label}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </Box>
              )}
            </Stack>
          )}

          {/* Error display */}
          {error && (
            <Alert severity="error">{error}</Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

export default FrequencySelector
