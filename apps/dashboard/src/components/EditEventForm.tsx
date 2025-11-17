import React, { useState, useMemo } from 'react'
import {
  Box,
  TextField,
  Button,
  Typography,
  Grid,
  Paper,
  Autocomplete,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert
} from '@mui/material'
import { useCreateManualProposal, useMilesRepublicEditions, useRaces } from '@/hooks/useApi'
import { proposalsApi } from '@/services/api'
import { useSnackbar } from 'notistack'
import MeilisearchEventSelector from './MeilisearchEventSelector'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  )
}

interface EditEventFormProps {
  onClose: () => void
}

const EditEventForm: React.FC<EditEventFormProps> = ({ onClose }) => {
  const { enqueueSnackbar } = useSnackbar()
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedEditionId, setSelectedEditionId] = useState('')
  const [selectedEventData, setSelectedEventData] = useState<any>(null)
  const [tabValue, setTabValue] = useState(0)
  const [justification, setJustification] = useState('')

  // Event form data
  const [eventChanges, setEventChanges] = useState<Record<string, any>>({})
  const [editionChanges, setEditionChanges] = useState<Record<string, any>>({})
  const [raceChanges, setRaceChanges] = useState<Record<string, Record<string, any>>>({})

  const createMutation = useCreateManualProposal()

  // Fetch éditions depuis Miles Republic après sélection d'événement
  const { data: editionsData, isLoading: isLoadingEditions } = useMilesRepublicEditions({ 
    eventId: selectedEventId || undefined,
    limit: 100 
  })
  
  const { data: racesData } = useRaces({
    editionId: selectedEditionId || undefined,
    limit: 100 
  })
  
  // Filter editions to only show future editions
  const allEditions = editionsData?.data || []
  const editions = useMemo(() => {
    const now = new Date()
    console.log('[EditEventForm] All editions from API:', allEditions)
    console.log('[EditEventForm] Current date:', now)
    
    const filtered = allEditions.filter(edition => {
      if (!edition.startDate) {
        console.log(`[EditEventForm] Édition ${edition.year} exclue : pas de startDate`)
        return false
      }
      const startDate = new Date(edition.startDate)
      const isFuture = startDate > now
      console.log(`[EditEventForm] Édition ${edition.year} : startDate=${startDate.toISOString()}, isFuture=${isFuture}`)
      return isFuture
    })
    
    console.log('[EditEventForm] Filtered editions:', filtered)
    return filtered
  }, [allEditions])
  
  const races = racesData?.data || []

  // Gestion de la sélection d'événement via Meilisearch
  const handleEventSelect = (eventId: string, eventData: any) => {
    console.log('[EditEventForm] Event selected:', eventId, eventData)
    setSelectedEventId(eventId)
    setSelectedEventData(eventData)
    setSelectedEditionId('') // Reset edition selection
    setEventChanges({}) // Reset changes
    setEditionChanges({})
    setRaceChanges({})
  }

  const selectedEvent = selectedEventData

  const selectedEdition = useMemo(() => {
    return editions.find(e => e.id === selectedEditionId)
  }, [editions, selectedEditionId])


  // Event fields
  const eventFields = [
    { key: 'name', label: 'Nom de l\'événement', type: 'text' },
    { key: 'city', label: 'Ville', type: 'text' },
    { key: 'country', label: 'Pays', type: 'text' },
    { key: 'websiteUrl', label: 'Site web', type: 'url' },
    { key: 'facebookUrl', label: 'Facebook', type: 'url' },
    { key: 'instagramUrl', label: 'Instagram', type: 'url' },
    { key: 'fullAddress', label: 'Adresse complète', type: 'text' },
    { key: 'latitude', label: 'Latitude', type: 'number' },
    { key: 'longitude', label: 'Longitude', type: 'number' }
  ]

  // Edition fields
  const editionFields = [
    { key: 'startDate', label: 'Date de début', type: 'datetime-local' },
    { key: 'endDate', label: 'Date de fin', type: 'datetime-local' },
    { key: 'registrationOpeningDate', label: 'Ouverture inscriptions', type: 'datetime-local' },
    { key: 'registrationClosingDate', label: 'Fermeture inscriptions', type: 'datetime-local' },
    { key: 'calendarStatus', label: 'Statut calendrier', type: 'select', options: ['CONFIRMED', 'TO_BE_CONFIRMED', 'CANCELLED'] },
    { key: 'registrantsNumber', label: 'Nombre d\'inscrits', type: 'number' },
    { key: 'currency', label: 'Monnaie', type: 'text' },
    { key: 'timeZone', label: 'Fuseau horaire', type: 'text' }
  ]

  // Race fields
  const raceFields = [
    { key: 'name', label: 'Nom de la course', type: 'text' },
    { key: 'startDate', label: 'Date de début', type: 'datetime-local' },
    { key: 'price', label: 'Prix', type: 'number' },
    { key: 'runDistance', label: 'Distance course (km)', type: 'number' },
    { key: 'runPositiveElevation', label: 'Dénivelé positif (m)', type: 'number' },
    { key: 'runNegativeElevation', label: 'Dénivelé négatif (m)', type: 'number' }
  ]

  const handleEventChange = (field: string, value: any) => {
    setEventChanges(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleEditionChange = (field: string, value: any) => {
    setEditionChanges(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleRaceChange = (raceId: string, field: string, value: any) => {
    setRaceChanges(prev => ({
      ...prev,
      [raceId]: {
        ...prev[raceId],
        [field]: value
      }
    }))
  }

  const handleSubmit = async () => {
    // Convertir les champs de date en ISO strings
    const processedEditionChanges: Record<string, any> = {}
    Object.entries(editionChanges).forEach(([field, value]) => {
      if (value !== '') {
        processedEditionChanges[field] = field.includes('Date') && value 
          ? new Date(value).toISOString() 
          : value
      }
    })

    // Convertir les champs de date des courses
    const processedRaceChanges: Record<string, any> = {}
    Object.entries(raceChanges).forEach(([raceId, changes]) => {
      const processedChanges: Record<string, any> = {}
      Object.entries(changes).forEach(([field, value]) => {
        if (value !== '') {
          processedChanges[field] = field.includes('Date') && value 
            ? new Date(value).toISOString() 
            : value
        }
      })
      if (Object.keys(processedChanges).length > 0) {
        processedRaceChanges[raceId] = processedChanges
      }
    })

    const hasPendingChanges = 
      Object.keys(processedEditionChanges).length > 0 || 
      Object.keys(processedRaceChanges).length > 0

    if (!hasPendingChanges) {
      return
    }

    try {
      // Créer une seule proposition EDITION_UPDATE complète
      const response = await proposalsApi.createEditionUpdateComplete({
        editionId: selectedEditionId,
        userModifiedChanges: processedEditionChanges,
        userModifiedRaceChanges: processedRaceChanges,
        justification: justification || `Modification manuelle via interface d'édition`,
        autoValidate: false // Ne pas auto-valider, laisser l'utilisateur vérifier
      })

      console.log('[EditEventForm] Proposition créée:', response.data)
      enqueueSnackbar(
        `Proposition EDITION_UPDATE créée avec succès pour ${response.data.proposal.eventName} ${response.data.proposal.editionYear}`,
        { variant: 'success' }
      )
      onClose()
    } catch (error: any) {
      console.error('[EditEventForm] Erreur lors de la création de la proposition:', error)
      const errorMessage = error.response?.data?.error || error.message || 'Erreur lors de la création de la proposition'
      enqueueSnackbar(errorMessage, { variant: 'error' })
    }
  }

  const getPendingChangesCount = () => {
    return Object.keys(eventChanges).filter(k => eventChanges[k] !== '').length +
           Object.keys(editionChanges).filter(k => editionChanges[k] !== '').length +
           Object.values(raceChanges).reduce((acc, raceChange) => {
             return acc + Object.keys(raceChange).filter(k => raceChange[k] !== '').length
           }, 0)
  }

  const renderField = (field: any, value: any, onChange: (field: string, value: any) => void) => {
    if (field.type === 'select' && field.options) {
      return (
        <FormControl fullWidth size="small">
          <InputLabel>{field.label}</InputLabel>
          <Select
            value={value || ''}
            label={field.label}
            onChange={(e) => onChange(field.key, e.target.value)}
          >
            <MenuItem value="">
              <em>Aucun changement</em>
            </MenuItem>
            {field.options.map((option: string) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )
    }

    return (
      <TextField
        fullWidth
        size="small"
        label={field.label}
        type={field.type === 'datetime-local' ? 'datetime-local' : field.type === 'number' ? 'number' : 'text'}
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        InputLabelProps={field.type === 'datetime-local' ? { shrink: true } : undefined}
        placeholder="Aucun changement"
      />
    )
  }

  if (!selectedEventId || !selectedEditionId) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 3, color: 'primary.main' }}>
          🔍 Édition d'événement via Meilisearch
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <MeilisearchEventSelector
              onEventSelect={handleEventSelect}
              placeholder="Marathon de Paris, Trail des Volcans..."
              helperText="Recherche en temps réel dans la base d'événements Meilisearch. L'événement sera automatiquement mis en cache."
            />
          </Grid>

          {selectedEventId && (
            <Grid item xs={12}>
              {editions.length === 0 && !isLoadingEditions ? (
                <Alert severity="warning">
                  Aucune édition future trouvée pour cet événement. Seules les éditions avec une date de début dans le futur peuvent être modifiées.
                </Alert>
              ) : (
                <Autocomplete
                  options={editions}
                  getOptionLabel={(option) => {
                    const startDate = option.startDate ? new Date(option.startDate).toLocaleDateString('fr-FR') : 'Date inconnue'
                    return `${option.year} - ${option.event.name} - ${startDate} (${option._count.races} course(s))`
                  }}
                  value={selectedEdition || null}
                  onChange={(_, newValue) => setSelectedEditionId(newValue?.id || '')}
                  loading={isLoadingEditions}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Sélectionner une édition future"
                      helperText={`${editions.length} édition(s) future(s) trouvée(s) dans Miles Republic`}
                    />
                  )}
                />
              )}
            </Grid>
          )}

          {selectedEventId && selectedEditionId && (
            <Grid item xs={12}>
              <Alert severity="info">
                Vous pouvez maintenant modifier les informations de l'événement, de l'édition et des courses associées.
              </Alert>
            </Grid>
          )}
        </Grid>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 3, color: 'primary.main' }}>
        ✏️ Édition : {selectedEvent?.name} - {selectedEdition?.year}
      </Typography>

      {getPendingChangesCount() > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            {getPendingChangesCount()} champ(s) modifié(s) - Une proposition EDITION_UPDATE complète sera créée
          </Typography>
        </Alert>
      )}

      <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ mb: 3 }}>
        <Tab 
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Événement
              {Object.keys(eventChanges).filter(k => eventChanges[k] !== '').length > 0 && (
                <Chip size="small" label={Object.keys(eventChanges).filter(k => eventChanges[k] !== '').length} color="primary" />
              )}
            </Box>
          } 
        />
        <Tab 
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Édition
              {Object.keys(editionChanges).filter(k => editionChanges[k] !== '').length > 0 && (
                <Chip size="small" label={Object.keys(editionChanges).filter(k => editionChanges[k] !== '').length} color="primary" />
              )}
            </Box>
          } 
        />
        <Tab 
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Courses ({races.length})
              {Object.values(raceChanges).reduce((acc, raceChange) => acc + Object.keys(raceChange).filter(k => raceChange[k] !== '').length, 0) > 0 && (
                <Chip size="small" label={Object.values(raceChanges).reduce((acc, raceChange) => acc + Object.keys(raceChange).filter(k => raceChange[k] !== '').length, 0)} color="primary" />
              )}
            </Box>
          } 
        />
      </Tabs>

      {/* Event Tab */}
      <TabPanel value={tabValue} index={0}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          🏃‍♂️ Informations de l'événement
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Modifier les champs que vous souhaitez changer. Laissez vide pour conserver la valeur actuelle.
        </Typography>
        
        <Grid container spacing={3}>
          {eventFields.map((field) => (
            <Grid item xs={12} md={6} key={field.key}>
              {renderField(field, eventChanges[field.key], handleEventChange)}
            </Grid>
          ))}
        </Grid>
      </TabPanel>

      {/* Edition Tab */}
      <TabPanel value={tabValue} index={1}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          📅 Informations de l'édition
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Modifier les champs que vous souhaitez changer. Les modifications de date de début seront automatiquement propagées aux courses.
        </Typography>
        
        <Grid container spacing={3}>
          {editionFields.map((field) => (
            <Grid item xs={12} md={6} key={field.key}>
              {renderField(field, editionChanges[field.key], handleEditionChange)}
            </Grid>
          ))}
        </Grid>
      </TabPanel>

      {/* Races Tab */}
      <TabPanel value={tabValue} index={2}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          🏁 Courses ({races.length})
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Modifier les champs des courses individuellement.
        </Typography>

        {races.map((race) => (
          <Paper key={race.id} sx={{ p: 3, mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              {race.name} {race.runDistance ? `- ${race.runDistance}km` : ''}
            </Typography>
            
            <Grid container spacing={2}>
              {raceFields.map((field) => (
                <Grid item xs={12} md={4} key={field.key}>
                  {renderField(
                    field, 
                    raceChanges[race.id]?.[field.key], 
                    (fieldKey, value) => handleRaceChange(race.id, fieldKey, value)
                  )}
                </Grid>
              ))}
            </Grid>
          </Paper>
        ))}
      </TabPanel>

      {/* Justification */}
      <Box sx={{ mt: 3 }}>
        <TextField
          fullWidth
          label="Justification (optionnel)"
          multiline
          rows={3}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Expliquer les raisons de ces modifications..."
        />
      </Box>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={getPendingChangesCount() === 0}
        >
          Créer la proposition EDITION_UPDATE
        </Button>
      </Box>
    </Box>
  )
}

export default EditEventForm