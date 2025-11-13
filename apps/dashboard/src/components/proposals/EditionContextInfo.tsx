import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip
} from '@mui/material'
import {
  Info as InfoIcon,
  EventAvailable as CalendarIcon,
  History as HistoryIcon,
  Launch as LaunchIcon,
  Event as EventIcon
} from '@mui/icons-material'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface EditionContextInfoProps {
  currentCalendarStatus?: string  // Gardé pour compatibilité mais non affiché
  previousEditionYear?: number
  previousCalendarStatus?: string
  previousEditionStartDate?: string
  currentEditionYear?: number     // Gardé pour compatibilité mais non affiché
  eventName?: string              // Nom de l'événement
  eventSlug?: string              // Slug pour construire le lien Miles Republic
}

const EditionContextInfo: React.FC<EditionContextInfoProps> = ({
  currentCalendarStatus,
  previousEditionYear,
  previousCalendarStatus,
  previousEditionStartDate,
  currentEditionYear,
  eventName,
  eventSlug
}) => {
  const getCalendarStatusLabel = (status?: string): string => {
    if (!status) return 'Non défini'
    
    const labels: Record<string, string> = {
      'CONFIRMED': 'Confirmé',
      'TO_BE_CONFIRMED': 'À confirmer',
      'CANCELED': 'Annulé',
      'POSTPONED': 'Reporté',
      'TENTATIVE': 'Provisoire'
    }
    
    return labels[status] || status
  }
  
  const getCalendarStatusColor = (status?: string): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    if (!status) return 'default'
    
    switch (status) {
      case 'CONFIRMED':
        return 'success'
      case 'TO_BE_CONFIRMED':
      case 'TENTATIVE':
        return 'warning'
      case 'CANCELED':
        return 'error'
      case 'POSTPONED':
        return 'info'
      default:
        return 'default'
    }
  }
  
  // Formater la date de l'édition précédente
  const formatPreviousEditionDate = (): string | null => {
    if (!previousEditionStartDate) return null
    
    try {
      const date = new Date(previousEditionStartDate)
      if (isNaN(date.getTime())) return null
      
      // Format: "Samedi 14 avril 2024"
      return format(date, 'EEEE d MMMM yyyy', { locale: fr })
    } catch (error) {
      return null
    }
  }
  
  // Afficher uniquement si on a les infos de l'édition précédente
  if (!previousCalendarStatus || !previousEditionYear) {
    return null
  }
  
  const formattedDate = formatPreviousEditionDate()
  
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoIcon color="primary" />
          Informations contextuelles
        </Typography>
        
        {eventName && eventSlug && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
            <EventIcon sx={{ fontSize: '1rem', color: 'text.secondary', mt: 0.25 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Événement
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Typography
                  component="a"
                  href={`https://fr.milesrepublic.com/event/${eventSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    color: 'primary.main',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: '0.875rem',
                    '&:hover': {
                      textDecoration: 'underline'
                    }
                  }}
                >
                  {eventName}
                  <LaunchIcon sx={{ fontSize: '1rem' }} />
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
        
        {previousCalendarStatus && previousEditionYear && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
            <HistoryIcon sx={{ fontSize: '1rem', color: 'text.secondary', mt: 0.25 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Édition précédente ({previousEditionYear})
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {formattedDate && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>
                    {formattedDate}
                  </Typography>
                )}
                <Chip
                  label={getCalendarStatusLabel(previousCalendarStatus)}
                  color={getCalendarStatusColor(previousCalendarStatus)}
                  size="small"
                  variant="outlined"
                />
              </Box>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

export default EditionContextInfo
