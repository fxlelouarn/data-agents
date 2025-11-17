import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Autocomplete,
  CircularProgress,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  Alert,
  Card,
  CardContent
} from '@mui/material'
import {
  Search as SearchIcon,
  EventAvailable as EventIcon,
  ArrowForward as ArrowForwardIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material'
import { debounce } from 'lodash'
import api from '../services/api'

interface MeilisearchEvent {
  objectID: string
  eventName: string
  eventCity?: string
  eventCountry?: string
  editionLiveStartDateTimestamp?: number
}

interface Edition {
  id: string
  year: number
  startDate: string
  calendarStatus: string
  event: {
    name: string
    city: string
  }
  _count: {
    races: number
  }
}

const steps = ['Rechercher un événement', 'Sélectionner une édition']

export default function CreateProposalForExistingEvent() {
  const navigate = useNavigate()
  
  // Étape actuelle (0 = recherche événement, 1 = sélection édition)
  const [activeStep, setActiveStep] = useState(0)
  
  // Étape 1 : Recherche événement
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MeilisearchEvent[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<MeilisearchEvent | null>(null)
  const [meilisearchConfigured, setMeilisearchConfigured] = useState(true)
  
  // Étape 2 : Sélection édition
  const [editions, setEditions] = useState<Edition[]>([])
  const [loadingEditions, setLoadingEditions] = useState(false)
  const [selectedEdition, setSelectedEdition] = useState<Edition | null>(null)

  // Recherche Meilisearch avec debounce
  const searchEventsInternal = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    console.log('Recherche Meilisearch:', query)
    setIsSearching(true)
    try {
      const response = await api.get('/events/autocomplete', {
        params: { q: query, limit: 10 }
      })

      console.log('Réponse API:', response.data)
      if (response.data.success && response.data.data.configured) {
        setSearchResults(response.data.data.events || [])
        setMeilisearchConfigured(true)
      } else {
        setMeilisearchConfigured(response.data.data.configured)
        setSearchResults([])
      }
    } catch (error) {
      console.error('Erreur recherche événements:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const searchEvents = useMemo(
    () => debounce(searchEventsInternal, 300),
    [searchEventsInternal]
  )

  useEffect(() => {
    searchEvents(searchQuery)
    // Cleanup du debounce au démontage
    return () => {
      searchEvents.cancel()
    }
  }, [searchQuery, searchEvents])

  // Charger les éditions d'un événement
  const loadEditions = async (eventId: string) => {
    setLoadingEditions(true)
    try {
      const response = await api.get('/events/editions', {
        params: { eventId, limit: 20 }
      })

      if (response.data.success) {
        // Filtrer uniquement les éditions futures
        const now = new Date()
        const futureEditions = response.data.data.filter((ed: Edition) => {
          const editionDate = new Date(ed.startDate)
          return editionDate >= now
        })
        setEditions(futureEditions)
      }
    } catch (error) {
      console.error('Erreur chargement éditions:', error)
      setEditions([])
    } finally {
      setLoadingEditions(false)
    }
  }

  // Sélection événement → Passer à l'étape 2
  const handleSelectEvent = (event: MeilisearchEvent) => {
    setSelectedEvent(event)
    loadEditions(event.objectID)
    setActiveStep(1)
  }

  // Retour étape 1
  const handleBack = () => {
    setActiveStep(0)
    setSelectedEdition(null)
    setEditions([])
  }

  // Sélection édition → Rediriger vers page d'édition
  const handleSelectEdition = (edition: Edition) => {
    // Créer une proposition vide pour cette édition et rediriger
    navigate(`/proposals/create-for-edition/${edition.id}`, {
      state: {
        event: selectedEvent,
        edition
      }
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'success'
      case 'TENTATIVE':
        return 'warning'
      case 'CANCELLED':
        return 'error'
      default:
        return 'default'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'Confirmée'
      case 'TENTATIVE':
        return 'À confirmer'
      case 'CANCELLED':
        return 'Annulée'
      default:
        return status
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Créer une proposition pour un événement existant
      </Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Étape 1 : Recherche événement */}
      {activeStep === 0 && (
        <Paper sx={{ p: 3 }}>
          {!meilisearchConfigured && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Meilisearch n'est pas configuré. Veuillez configurer l'URL et la clé API dans les paramètres.
            </Alert>
          )}

          <Typography variant="h6" sx={{ mb: 2 }}>
            Rechercher un événement
          </Typography>

          <Autocomplete
            freeSolo
            options={searchResults}
            getOptionLabel={(option) => 
              typeof option === 'string' ? option : `${option.eventName} - ${option.eventCity || ''}`
            }
            loading={isSearching}
            onInputChange={(_, value) => setSearchQuery(value)}
            onChange={(_, value) => {
              if (value && typeof value !== 'string') {
                handleSelectEvent(value)
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Nom de l'événement ou ville"
                placeholder="Trail des Loups, Marathon de Paris..."
                InputProps={{
                  ...params.InputProps,
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.disabled' }} />,
                  endAdornment: (
                    <>
                      {isSearching ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
                autoFocus
              />
            )}
            renderOption={(props, option) => {
              const { key, ...otherProps } = props
              return (
                <li key={key} {...otherProps}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <Typography variant="body1">{option.eventName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.eventCity}, {option.eventCountry}
                    </Typography>
                  </Box>
                </li>
              )
            }}
          />

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate('/proposals')}
            >
              Annuler
            </Button>
          </Box>
        </Paper>
      )}

      {/* Étape 2 : Sélection édition */}
      {activeStep === 1 && selectedEvent && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Sélectionner une édition
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Événement : <strong>{selectedEvent.eventName}</strong> - {selectedEvent.eventCity}
          </Typography>

          {loadingEditions && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          )}

          {!loadingEditions && editions.length === 0 && (
            <Alert severity="info">
              Aucune édition future trouvée pour cet événement.
            </Alert>
          )}

          {!loadingEditions && editions.length > 0 && (
            <List sx={{ bgcolor: 'background.paper' }}>
              {editions.map((edition) => (
                <Card key={edition.id} sx={{ mb: 2 }}>
                  <CardContent>
                    <ListItemButton
                      onClick={() => handleSelectEdition(edition)}
                      sx={{ borderRadius: 1 }}
                    >
                      <EventIcon sx={{ mr: 2, color: 'primary.main' }} />
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="h6">
                              {edition.event.name} {edition.year}
                            </Typography>
                            <Chip
                              label={getStatusLabel(edition.calendarStatus)}
                              color={getStatusColor(edition.calendarStatus)}
                              size="small"
                            />
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                              📅 {formatDate(edition.startDate)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              🏃 {edition._count.races} course(s)
                            </Typography>
                          </Box>
                        }
                      />
                      <ArrowForwardIcon />
                    </ListItemButton>
                  </CardContent>
                </Card>
              ))}
            </List>
          )}

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
            >
              Retour
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  )
}
