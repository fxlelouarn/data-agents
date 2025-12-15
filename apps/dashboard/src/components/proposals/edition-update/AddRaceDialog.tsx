import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
  Box,
  Typography,
  Divider,
  Alert
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { fr } from 'date-fns/locale'
import { RaceData } from '@/types'
import { CATEGORY_LEVEL_1_OPTIONS, CATEGORY_LEVEL_2_OPTIONS } from './RacesChangesTable'

interface AddRaceDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (race: RaceData) => void
  defaultStartDate?: string
  defaultTimeZone?: string
  isBlockValidated?: boolean
}

/**
 * Détermine quels champs de distance et d'élévation sont actifs selon la catégorie
 */
const getActiveFields = (categoryLevel1: string | null): {
  distances: string[]
  elevations: string[]
} => {
  switch (categoryLevel1) {
    case 'RUNNING':
    case 'TRAIL':
    case 'FUN':
      return {
        distances: ['runDistance'],
        elevations: ['runPositiveElevation']
      }

    case 'WALK':
      return {
        distances: ['walkDistance'],
        elevations: ['walkPositiveElevation']
      }

    case 'CYCLING':
      return {
        distances: ['bikeDistance'],
        elevations: ['bikePositiveElevation']
      }

    case 'TRIATHLON':
      return {
        distances: ['runDistance', 'bikeDistance', 'swimDistance'],
        elevations: ['runPositiveElevation', 'bikePositiveElevation']
      }

    case 'OTHER':
    default:
      return {
        distances: ['runDistance', 'bikeDistance', 'walkDistance', 'swimDistance'],
        elevations: ['runPositiveElevation', 'bikePositiveElevation', 'walkPositiveElevation']
      }
  }
}

const AddRaceDialog: React.FC<AddRaceDialogProps> = ({
  open,
  onClose,
  onAdd,
  defaultStartDate,
  defaultTimeZone = 'Europe/Paris',
  isBlockValidated = false
}) => {
  // État du formulaire
  const [formData, setFormData] = useState<Partial<RaceData>>({
    name: '',
    categoryLevel1: '',
    categoryLevel2: '',
    runDistance: undefined,
    bikeDistance: undefined,
    walkDistance: undefined,
    swimDistance: undefined,
    runPositiveElevation: undefined,
    bikePositiveElevation: undefined,
    walkPositiveElevation: undefined,
    startDate: defaultStartDate || '',
    timeZone: defaultTimeZone
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Calculer les champs actifs selon categoryLevel1
  const activeFields = useMemo(
    () => getActiveFields(formData.categoryLevel1 || null),
    [formData.categoryLevel1]
  )

  /**
   * Validation du formulaire
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Nom obligatoire
    if (!formData.name?.trim()) {
      newErrors.name = 'Le nom est requis'
    }

    // Catégorie principale obligatoire
    if (!formData.categoryLevel1) {
      newErrors.categoryLevel1 = 'La catégorie principale est requise'
    }

    // Au moins une distance correspondant à la catégorie
    const hasDistance = activeFields.distances.some(field => {
      const value = formData[field as keyof RaceData]
      return value !== undefined && value !== null && value !== ''
    })

    if (!hasDistance) {
      newErrors.distance = 'Au moins une distance doit être renseignée'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /**
   * Gestion du changement de categoryLevel1 : réinitialise les champs non pertinents
   */
  const handleCategoryLevel1Change = (value: string) => {
    const newActiveFields = getActiveFields(value)
    const newFormData: Partial<RaceData> = {
      ...formData,
      categoryLevel1: value,
      categoryLevel2: ''
    }

    // Liste de tous les champs de distance/élévation
    const allDistanceFields: (keyof RaceData)[] = ['runDistance', 'bikeDistance', 'walkDistance', 'swimDistance']
    const allElevationFields: (keyof RaceData)[] = ['runPositiveElevation', 'bikePositiveElevation', 'walkPositiveElevation']

    // Réinitialiser les champs non pertinents
    allDistanceFields.forEach(field => {
      if (!newActiveFields.distances.includes(field)) {
        newFormData[field] = undefined
      }
    })

    allElevationFields.forEach(field => {
      if (!newActiveFields.elevations.includes(field)) {
        newFormData[field] = undefined
      }
    })

    setFormData(newFormData)
  }

  /**
   * Soumission du formulaire
   */
  const handleSubmit = () => {
    if (!validateForm()) {
      return
    }

    // Nettoyer les champs undefined pour éviter la pollution
    const cleanedData: RaceData = Object.fromEntries(
      Object.entries(formData).filter(([_, value]) =>
        value !== undefined && value !== '' && value !== null
      )
    ) as unknown as RaceData

    onAdd(cleanedData)

    // Réinitialiser le formulaire
    setFormData({
      name: '',
      categoryLevel1: '',
      categoryLevel2: '',
      startDate: defaultStartDate || '',
      timeZone: defaultTimeZone
    })
    setErrors({})

    onClose()
  }

  /**
   * Gestion de la fermeture
   */
  const handleClose = () => {
    // Réinitialiser le formulaire
    setFormData({
      name: '',
      categoryLevel1: '',
      categoryLevel2: '',
      startDate: defaultStartDate || '',
      timeZone: defaultTimeZone
    })
    setErrors({})
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Ajouter une nouvelle course
      </DialogTitle>

      <DialogContent>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>

            {/* Avertissement si bloc validé */}
            {isBlockValidated && (
              <Alert severity="warning">
                Le bloc "Courses" est déjà validé. Dévalidez-le pour ajouter une course.
              </Alert>
            )}

            {/* Nom de la course */}
            <TextField
              label="Nom de la course"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={!!errors.name}
              helperText={errors.name}
              required
              fullWidth
              disabled={isBlockValidated}
            />

            {/* Date de départ */}
            <DateTimePicker
              label="Date et heure de départ"
              value={formData.startDate ? new Date(formData.startDate) : null}
              onChange={(date) => setFormData({ ...formData, startDate: date?.toISOString() || '' })}
              format="dd/MM/yyyy HH:mm"
              ampm={false}
              disabled={isBlockValidated}
              slotProps={{
                textField: {
                  fullWidth: true,
                  helperText: defaultStartDate
                    ? "Héritée de l'édition par défaut"
                    : "Aucune date d'édition disponible"
                }
              }}
            />

            {/* Catégorie principale */}
            <FormControl fullWidth required error={!!errors.categoryLevel1}>
              <InputLabel id="category-level-1-label">Catégorie principale</InputLabel>
              <Select
                labelId="category-level-1-label"
                label="Catégorie principale"
                value={formData.categoryLevel1 || ''}
                onChange={(e) => handleCategoryLevel1Change(e.target.value)}
                disabled={isBlockValidated}
              >
                {CATEGORY_LEVEL_1_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
              {errors.categoryLevel1 && (
                <FormHelperText>{errors.categoryLevel1}</FormHelperText>
              )}
            </FormControl>

            {/* Sous-catégorie (conditionnelle) */}
            {formData.categoryLevel1 && (
              <FormControl fullWidth>
                <InputLabel id="category-level-2-label">Sous-catégorie (optionnel)</InputLabel>
                <Select
                  labelId="category-level-2-label"
                  label="Sous-catégorie (optionnel)"
                  value={formData.categoryLevel2 || ''}
                  onChange={(e) => setFormData({ ...formData, categoryLevel2: e.target.value })}
                  disabled={isBlockValidated}
                >
                  <MenuItem value="">-</MenuItem>
                  {(CATEGORY_LEVEL_2_OPTIONS[formData.categoryLevel1] || []).map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Divider />

            {/* Distances */}
            <Typography variant="subtitle2" color="text.secondary">
              Distances (au moins une requise)
            </Typography>

            {errors.distance && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {errors.distance}
              </Alert>
            )}

            {!formData.categoryLevel1 ? (
              <Alert severity="info">
                Sélectionnez d'abord une catégorie principale pour activer les champs de distance.
              </Alert>
            ) : (
              <>
                {activeFields.distances.includes('runDistance') && (
                  <TextField
                    label="Distance course (km)"
                    type="number"
                    value={formData.runDistance || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      runDistance: e.target.value ? parseFloat(e.target.value) : undefined
                    })}
                    fullWidth
                    disabled={isBlockValidated}
                    inputProps={{ step: 0.1, min: 0 }}
                  />
                )}

                {activeFields.distances.includes('bikeDistance') && (
                  <TextField
                    label="Distance vélo (km)"
                    type="number"
                    value={formData.bikeDistance || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      bikeDistance: e.target.value ? parseFloat(e.target.value) : undefined
                    })}
                    fullWidth
                    disabled={isBlockValidated}
                    inputProps={{ step: 0.1, min: 0 }}
                  />
                )}

                {activeFields.distances.includes('walkDistance') && (
                  <TextField
                    label="Distance marche (km)"
                    type="number"
                    value={formData.walkDistance || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      walkDistance: e.target.value ? parseFloat(e.target.value) : undefined
                    })}
                    fullWidth
                    disabled={isBlockValidated}
                    inputProps={{ step: 0.1, min: 0 }}
                  />
                )}

                {activeFields.distances.includes('swimDistance') && (
                  <TextField
                    label="Distance natation (m)"
                    type="number"
                    value={formData.swimDistance || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      swimDistance: e.target.value ? parseFloat(e.target.value) : undefined
                    })}
                    fullWidth
                    disabled={isBlockValidated}
                    inputProps={{ step: 1, min: 0 }}
                  />
                )}
              </>
            )}

            <Divider />

            {/* Élévations */}
            <Typography variant="subtitle2" color="text.secondary">
              Dénivelés positifs (optionnel)
            </Typography>

            {formData.categoryLevel1 && activeFields.elevations.length > 0 ? (
              <>
                {activeFields.elevations.includes('runPositiveElevation') && (
                  <TextField
                    label="D+ course (m)"
                    type="number"
                    value={formData.runPositiveElevation || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      runPositiveElevation: e.target.value ? parseInt(e.target.value) : undefined
                    })}
                    fullWidth
                    disabled={isBlockValidated}
                    inputProps={{ step: 1, min: 0 }}
                  />
                )}

                {activeFields.elevations.includes('bikePositiveElevation') && (
                  <TextField
                    label="D+ vélo (m)"
                    type="number"
                    value={formData.bikePositiveElevation || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      bikePositiveElevation: e.target.value ? parseInt(e.target.value) : undefined
                    })}
                    fullWidth
                    disabled={isBlockValidated}
                    inputProps={{ step: 1, min: 0 }}
                  />
                )}

                {activeFields.elevations.includes('walkPositiveElevation') && (
                  <TextField
                    label="D+ marche (m)"
                    type="number"
                    value={formData.walkPositiveElevation || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      walkPositiveElevation: e.target.value ? parseInt(e.target.value) : undefined
                    })}
                    fullWidth
                    disabled={isBlockValidated}
                    inputProps={{ step: 1, min: 0 }}
                  />
                )}
              </>
            ) : (
              <Alert severity="info">
                Sélectionnez une catégorie principale pour activer les champs de dénivelé.
              </Alert>
            )}

          </Box>
        </LocalizationProvider>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          Annuler
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={isBlockValidated}
        >
          Ajouter
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default AddRaceDialog
