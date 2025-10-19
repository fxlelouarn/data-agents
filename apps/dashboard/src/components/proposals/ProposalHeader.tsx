import React from 'react'
import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material'
import { NavigateBefore as PrevIcon, NavigateNext as NextIcon } from '@mui/icons-material'

interface ProposalHeaderProps {
  title: string
  eventTitle?: string
  editionYear?: string | null
  chips: Array<{
    label: string
    color?: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'
    variant?: 'filled' | 'outlined'
    show?: boolean
  }>
  navigation?: {
    canGoToPrev: boolean
    canGoToNext: boolean
    onPrevious: () => void
    onNext: () => void
  }
}

const ProposalHeader: React.FC<ProposalHeaderProps> = ({
  title,
  eventTitle,
  editionYear,
  chips,
  navigation
}) => {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        
        {/* Boutons de navigation */}
        {navigation && (
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
            <Tooltip title="Proposition précédente">
              <IconButton 
                size="small" 
                onClick={navigation.onPrevious}
                disabled={!navigation.canGoToPrev}
              >
                <PrevIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Proposition suivante">
              <IconButton 
                size="small" 
                onClick={navigation.onNext}
                disabled={!navigation.canGoToNext}
              >
                <NextIcon />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
      
      {/* Informations sur l'événement et l'édition */}
      {eventTitle && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" color="text.secondary">
            Événement : {eventTitle}
          </Typography>
          {editionYear && (
            <Typography variant="body2" color="text.secondary">
              Édition : {editionYear}
            </Typography>
          )}
        </Box>
      )}
      
      {/* Chips informatifs */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        {chips.filter(chip => chip.show !== false).map((chip, index) => (
          <Chip 
            key={index}
            label={chip.label}
            color={chip.color || 'default'}
            variant={chip.variant || 'filled'}
          />
        ))}
      </Box>
    </Box>
  )
}

export default ProposalHeader