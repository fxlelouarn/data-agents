import React from 'react'
import {
  Box,
  Button
} from '@mui/material'
import {
  ChevronLeft as ChevronLeftIcon,
  Archive as ArchiveIcon,
  Undo as UndoIcon
} from '@mui/icons-material'

interface ProposalNavigationProps {
  // Navigation entre propositions
  navigation?: {
    hasPrevious: boolean
    hasNext: boolean
    onPrevious: () => void
    onNext: () => void
  }
  // Actions
  showArchiveButton?: boolean
  onArchive?: () => void
  showUnapproveButton?: boolean
  onUnapprove?: () => void
  disabled?: boolean
  // Bouton retour
  showBackButton?: boolean
  onBack?: () => void
}

const ProposalNavigation: React.FC<ProposalNavigationProps> = ({
  navigation,
  showArchiveButton = false,
  onArchive,
  showUnapproveButton = false,
  onUnapprove,
  disabled = false,
  showBackButton = true,
  onBack
}) => {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      window.history.back()
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {showBackButton && (
          <Button 
            variant="outlined" 
            size="small"
            startIcon={<ChevronLeftIcon />}
            onClick={handleBack}
          >
            Retour
          </Button>
        )}
        
        {/* Navigation entre propositions */}
        {navigation && (
          <>
            <Button 
              variant="outlined" 
              size="small"
              disabled={!navigation.hasPrevious}
              onClick={navigation.onPrevious}
            >
              Précédent
            </Button>
            <Button 
              variant="outlined" 
              size="small"
              disabled={!navigation.hasNext}
              onClick={navigation.onNext}
            >
              Suivant
            </Button>
          </>
        )}
      </Box>
      
      <Box sx={{ display: 'flex', gap: 1 }}>
        {showUnapproveButton && onUnapprove && (
          <Button
            variant="outlined"
            color="warning"
            size="small"
            startIcon={<UndoIcon />}
            onClick={onUnapprove}
            disabled={disabled}
          >
            Annuler l'approbation
          </Button>
        )}
        {showArchiveButton && onArchive && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArchiveIcon />}
            onClick={onArchive}
            disabled={disabled}
          >
            Archiver
          </Button>
        )}
      </Box>
    </Box>
  )
}

export default ProposalNavigation