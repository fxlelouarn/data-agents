import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Typography,
  Alert
} from '@mui/material'
import { cacheApi } from '@/services/api'

interface Edition {
  id: string
  year: number
  startDate: string | null
  calendarStatus: string
  eventId: string
  event: {
    name: string
    city: string
  }
  _count: { races: number }
}

interface EditionSelectorProps {
  eventId: number | string
  onSelect: (edition: { id: number; year: string }) => void
  selectedEditionId?: number | string
  label?: string
}

/**
 * Composant pour sélectionner une édition d'un événement
 * Utilisé notamment dans UnmatchedResultDetail pour lier une proposition FFA Results à une édition
 */
const EditionSelector: React.FC<EditionSelectorProps> = ({
  eventId,
  onSelect,
  selectedEditionId,
  label = "Sélectionner une édition"
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['event-editions', eventId],
    queryFn: async () => {
      const response = await cacheApi.getEditions({ eventId: String(eventId) })
      return response.data as Edition[]
    },
    enabled: !!eventId
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          Chargement des éditions...
        </Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 1 }}>
        Erreur lors du chargement des éditions
      </Alert>
    )
  }

  const editions = data || []

  if (editions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Aucune édition trouvée pour cet événement
      </Typography>
    )
  }

  return (
    <FormControl fullWidth size="small">
      <InputLabel id="edition-selector-label">{label}</InputLabel>
      <Select
        labelId="edition-selector-label"
        value={selectedEditionId?.toString() || ''}
        onChange={(e) => {
          const editionId = e.target.value as string
          const edition = editions.find(ed => ed.id === editionId)
          if (edition) {
            onSelect({ id: parseInt(edition.id), year: String(edition.year) })
          }
        }}
        label={label}
      >
        {editions.map((edition) => (
          <MenuItem key={edition.id} value={edition.id}>
            <Box>
              <Typography variant="body2">
                {edition.year}
                {edition.startDate && (
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    - {new Date(edition.startDate).toLocaleDateString('fr-FR')}
                  </Typography>
                )}
              </Typography>
              {edition.calendarStatus && (
                <Typography variant="caption" color="text.secondary">
                  Statut: {edition.calendarStatus}
                </Typography>
              )}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

export default EditionSelector
