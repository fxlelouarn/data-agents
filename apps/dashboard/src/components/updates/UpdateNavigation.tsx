import React from 'react'
import {
  Box,
  Button
} from '@mui/material'
import {
  ChevronLeft as ChevronLeftIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon
} from '@mui/icons-material'

interface UpdateNavigationProps {
  // Navigation entre mises à jour
  navigation?: {
    hasPrevious: boolean
    hasNext: boolean
    onPrevious: () => void
    onNext: () => void
  }
  // Bouton retour vers la liste
  showBackButton?: boolean
  onBack?: () => void
  // Actions additionnelles
  disabled?: boolean
}

const UpdateNavigation: React.FC<UpdateNavigationProps> = ({
  navigation,
  showBackButton = true,
  onBack,
  disabled = false
}) => {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      window.history.back()
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {showBackButton && (
          <Button 
            variant="outlined" 
            size="small"
            startIcon={<ChevronLeftIcon />}
            onClick={handleBack}
            disabled={disabled}
          >
            Retour
          </Button>
        )}
        
        {/* Navigation entre mises à jour */}
        {navigation && (
          <>
            <Button 
              variant="outlined" 
              size="small"
              startIcon={<PrevIcon />}
              disabled={!navigation.hasPrevious || disabled}
              onClick={navigation.onPrevious}
            >
              Précédent
            </Button>
            <Button 
              variant="outlined" 
              size="small"
              endIcon={<NextIcon />}
              disabled={!navigation.hasNext || disabled}
              onClick={navigation.onNext}
            >
              Suivant
            </Button>
          </>
        )}
      </Box>
    </Box>
  )
}

export default UpdateNavigation