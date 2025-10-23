import React, { useState } from 'react'
import {
  Box,
  TextField,
  Autocomplete,
  Typography,
  Alert,
  CircularProgress,
  Chip
} from '@mui/material'
import { Search as SearchIcon, CloudDownload as CacheIcon } from '@mui/icons-material'
import { useMeilisearchAutocomplete, useCacheEventFromMeilisearch, MeilisearchEvent } from '@/hooks/useMeilisearchAutocomplete'

interface MeilisearchEventSelectorProps {
  onEventSelect: (eventId: string, eventData: any) => void
  placeholder?: string
  helperText?: string
}

const MeilisearchEventSelector: React.FC<MeilisearchEventSelectorProps> = ({
  onEventSelect,
  placeholder = "Rechercher un événement...",
  helperText = "Tapez le nom d'un événement ou d'une ville pour rechercher via Meilisearch"
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<MeilisearchEvent | null>(null)
  
  const { events, loading, error, configured } = useMeilisearchAutocomplete(searchQuery, 20)
  const { cacheEvent, caching } = useCacheEventFromMeilisearch()

  const handleEventSelect = async (_: any, value: MeilisearchEvent | null) => {
    if (!value) {
      setSelectedEvent(null)
      return
    }

    setSelectedEvent(value)

    try {
      // Cache l'événement et récupère les données complètes
      const cachedEventData = await cacheEvent(value.objectID)
      onEventSelect(value.objectID, cachedEventData)
    } catch (error) {
      console.error('Erreur lors de la mise en cache:', error)
      // Même en cas d'erreur de cache, on peut continuer avec l'ID
      onEventSelect(value.objectID, {
        id: value.objectID,
        name: value.eventName || value.name || 'Événement inconnu',
        city: value.eventCity || value.city || '',
        country: value.country || ''
      })
    }
  }

  const getEventLabel = (event: MeilisearchEvent): string => {
    const name = event.eventName || event.name || 'Événement sans nom'
    const city = event.eventCity || event.city || ''
    const year = event.year || ''
    
    let label = name
    if (city) label += ` - ${city}`
    if (year) label += ` (${year})`
    
    return label
  }

  if (!configured) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <Typography variant="body2">
          Meilisearch n'est pas configuré. Veuillez configurer l'URL et la clé API dans les paramètres.
        </Typography>
      </Alert>
    )
  }

  return (
    <Box>
      <Autocomplete
        options={events}
        getOptionLabel={getEventLabel}
        isOptionEqualToValue={(option, value) => option.objectID === value.objectID}
        value={selectedEvent}
        onChange={handleEventSelect}
        onInputChange={(_, newInputValue) => {
          setSearchQuery(newInputValue)
        }}
        loading={loading || caching}
        filterOptions={(x) => x} // Désactive le filtrage côté client
        renderInput={(params) => (
          <TextField
            {...params}
            label="Rechercher un événement"
            placeholder={placeholder}
            helperText={
              error ? (
                <Box component="span" sx={{ color: 'error.main' }}>
                  {error}
                </Box>
              ) : (
                helperText
              )
            }
            InputProps={{
              ...params.InputProps,
              startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
              endAdornment: (
                <React.Fragment>
                  {loading && <CircularProgress color="inherit" size={20} />}
                  {caching && <CacheIcon sx={{ color: 'primary.main', ml: 1 }} />}
                  {params.InputProps.endAdornment}
                </React.Fragment>
              ),
            }}
          />
        )}
        renderOption={(props, option) => (
          <Box component="li" {...props}>
            <Box>
              <Typography variant="body2">
                {getEventLabel(option)}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                <Chip 
                  size="small" 
                  label={`ID: ${option.objectID}`} 
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: '20px' }}
                />
                {option.startDate && (
                  <Chip 
                    size="small" 
                    label={new Date(option.startDate).toLocaleDateString('fr-FR')} 
                    variant="outlined"
                    color="primary"
                    sx={{ fontSize: '0.7rem', height: '20px' }}
                  />
                )}
              </Box>
            </Box>
          </Box>
        )}
        noOptionsText={
          searchQuery.trim() === '' ? 
            "Tapez pour rechercher des événements..." :
            loading ? 
              "Recherche en cours..." :
              "Aucun événement trouvé"
        }
        sx={{ mb: 2 }}
      />

      {selectedEvent && (
        <Alert severity="success" sx={{ mt: 2 }}>
          <Typography variant="body2">
            ✅ Événement sélectionné : <strong>{getEventLabel(selectedEvent)}</strong>
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            {caching ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} />
                Mise en cache en cours...
              </Box>
            ) : (
              `L'événement sera mis en cache automatiquement pour les prochaines utilisations.`
            )}
          </Typography>
        </Alert>
      )}
    </Box>
  )
}

export default MeilisearchEventSelector