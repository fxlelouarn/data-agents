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
  History as HistoryIcon
} from '@mui/icons-material'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface EditionContextInfoProps {
  currentCalendarStatus?: string  // Gardé pour compatibilité mais non affiché
  previousEditionYear?: number
  previousCalendarStatus?: string
  previousEditionStartDate?: string
  currentEditionYear?: number     // Gardé pour compatibilité mais non affiché
}

const EditionContextInfo: React.FC<EditionContextInfoProps> = ({
  currentCalendarStatus,
  previousEditionYear,
  previousCalendarStatus,
  previousEditionStartDate,
  currentEditionYear
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
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoIcon color="primary" />
          Informations contextuelles
        </Typography>
        
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
