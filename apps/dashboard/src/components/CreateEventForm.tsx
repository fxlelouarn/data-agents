import React, { useState } from 'react'
import {
  Box,
  TextField,
  Button,
  Typography,
  Grid,
  Paper,
  IconButton,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material'
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material'
import { useCreateManualProposal } from '@/hooks/useApi'

interface Race {
  name: string
  distance: string
  price: string
  startDate: string
}

interface CreateEventFormProps {
  onClose: () => void
}

const CreateEventForm: React.FC<CreateEventFormProps> = ({ onClose }) => {
  const [eventData, setEventData] = useState({
    name: '',
    city: '',
    country: 'FR',
    year: new Date().getFullYear().toString(),
    startDate: '',
    websiteUrl: '',
    facebookUrl: '',
    instagramUrl: ''
  })

  const [editionData, setEditionData] = useState({
    startDate: '',
    endDate: '',
    registrationOpeningDate: '',
    registrationClosingDate: '',
    calendarStatus: 'TO_BE_CONFIRMED',
    registrantsNumber: '',
    currency: 'EUR',
    timeZone: 'Europe/Paris'
  })

  const [races, setRaces] = useState<Race[]>([
    { name: '', distance: '', price: '', startDate: '' }
  ])

  const [justification, setJustification] = useState('')
  const createMutation = useCreateManualProposal()

  const addRace = () => {
    setRaces([...races, { name: '', distance: '', price: '', startDate: '' }])
  }

  const removeRace = (index: number) => {
    if (races.length > 1) {
      setRaces(races.filter((_, i) => i !== index))
    }
  }

  const updateRace = (index: number, field: keyof Race, value: string) => {
    const updatedRaces = races.map((race, i) => 
      i === index ? { ...race, [field]: value } : race
    )
    setRaces(updatedRaces)
  }

  const handleSubmit = async () => {
    if (!eventData.name || !eventData.city || !editionData.startDate) {
      return
    }

    // Prepare the complete event data for a NEW_EVENT proposal
    const completeEventData = {
      // Event fields
      eventName: eventData.name,
      city: eventData.city,
      country: eventData.country,
      websiteUrl: eventData.websiteUrl,
      facebookUrl: eventData.facebookUrl,
      instagramUrl: eventData.instagramUrl,
      
      // Edition fields
      year: eventData.year,
      startDate: editionData.startDate,
      endDate: editionData.endDate,
      registrationOpeningDate: editionData.registrationOpeningDate,
      registrationClosingDate: editionData.registrationClosingDate,
      calendarStatus: editionData.calendarStatus,
      registrantsNumber: editionData.registrantsNumber ? parseInt(editionData.registrantsNumber) : null,
      currency: editionData.currency,
      timeZone: editionData.timeZone,
      
      // Races
      races: races.filter(race => race.name && race.distance).map(race => ({
        raceName: race.name,
        runDistance: parseFloat(race.distance),
        price: race.price ? parseFloat(race.price) : null,
        startDate: race.startDate || editionData.startDate
      }))
    }

    try {
      await createMutation.mutateAsync({
        type: 'NEW_EVENT',
        fieldName: 'completeEvent',
        fieldValue: completeEventData,
        justification: justification || `Création manuelle d'un nouvel événement: ${eventData.name}`
      })

      onClose()
    } catch (error) {
      console.error('Error creating new event:', error)
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 3, color: 'primary.main' }}>
        📅 Création d'un nouvel événement
      </Typography>

      <Grid container spacing={3}>
        {/* Informations de l'événement */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
              🏃‍♂️ Informations de l'événement
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Nom de l'événement"
                  value={eventData.name}
                  onChange={(e) => setEventData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Ville"
                  value={eventData.city}
                  onChange={(e) => setEventData(prev => ({ ...prev, city: e.target.value }))}
                  required
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Pays"
                  value={eventData.country}
                  onChange={(e) => setEventData(prev => ({ ...prev, country: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Site web"
                  type="url"
                  value={eventData.websiteUrl}
                  onChange={(e) => setEventData(prev => ({ ...prev, websiteUrl: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Facebook"
                  type="url"
                  value={eventData.facebookUrl}
                  onChange={(e) => setEventData(prev => ({ ...prev, facebookUrl: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Instagram"
                  type="url"
                  value={eventData.instagramUrl}
                  onChange={(e) => setEventData(prev => ({ ...prev, instagramUrl: e.target.value }))}
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Informations de l'édition */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
              📅 Édition {eventData.year}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Année"
                  type="number"
                  value={eventData.year}
                  onChange={(e) => setEventData(prev => ({ ...prev, year: e.target.value }))}
                  required
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Date de début"
                  type="datetime-local"
                  value={editionData.startDate}
                  onChange={(e) => setEditionData(prev => ({ ...prev, startDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Date de fin"
                  type="datetime-local"
                  value={editionData.endDate}
                  onChange={(e) => setEditionData(prev => ({ ...prev, endDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel>Statut</InputLabel>
                  <Select
                    value={editionData.calendarStatus}
                    label="Statut"
                    onChange={(e) => setEditionData(prev => ({ ...prev, calendarStatus: e.target.value }))}
                  >
                    <MenuItem value="CONFIRMED">Confirmé</MenuItem>
                    <MenuItem value="TO_BE_CONFIRMED">À confirmer</MenuItem>
                    <MenuItem value="CANCELLED">Annulé</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Ouverture inscriptions"
                  type="datetime-local"
                  value={editionData.registrationOpeningDate}
                  onChange={(e) => setEditionData(prev => ({ ...prev, registrationOpeningDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Fermeture inscriptions"
                  type="datetime-local"
                  value={editionData.registrationClosingDate}
                  onChange={(e) => setEditionData(prev => ({ ...prev, registrationClosingDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Nombre d'inscrits"
                  type="number"
                  value={editionData.registrantsNumber}
                  onChange={(e) => setEditionData(prev => ({ ...prev, registrantsNumber: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Monnaie"
                  value={editionData.currency}
                  onChange={(e) => setEditionData(prev => ({ ...prev, currency: e.target.value }))}
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Courses */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                🏁 Courses ({races.length})
              </Typography>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addRace}
                size="small"
              >
                Ajouter une course
              </Button>
            </Box>
            
            {races.map((race, index) => (
              <Box key={index} sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1">Course {index + 1}</Typography>
                  {races.length > 1 && (
                    <IconButton
                      onClick={() => removeRace(index)}
                      size="small"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  )}
                </Box>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Nom de la course"
                      value={race.name}
                      onChange={(e) => updateRace(index, 'name', e.target.value)}
                      required={index === 0}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      fullWidth
                      label="Distance (km)"
                      type="number"
                      value={race.distance}
                      onChange={(e) => updateRace(index, 'distance', e.target.value)}
                      required={index === 0}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      fullWidth
                      label="Prix (€)"
                      type="number"
                      value={race.price}
                      onChange={(e) => updateRace(index, 'price', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Date de début (optionnel)"
                      type="datetime-local"
                      value={race.startDate}
                      onChange={(e) => updateRace(index, 'startDate', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      helperText="Si vide, utilisera la date de l'édition"
                    />
                  </Grid>
                </Grid>
                
                {index < races.length - 1 && <Divider sx={{ mt: 2 }} />}
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Justification */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Justification"
            multiline
            rows={3}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Expliquer pourquoi créer cet événement..."
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            !eventData.name || 
            !eventData.city || 
            !editionData.startDate ||
            !races.some(race => race.name && race.distance) ||
            createMutation.isPending
          }
        >
          {createMutation.isPending ? 'Création...' : 'Créer l\'événement'}
        </Button>
      </Box>
    </Box>
  )
}

export default CreateEventForm