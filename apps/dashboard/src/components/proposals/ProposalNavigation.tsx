import React from 'react'
import {
  Box,
  Button
} from '@mui/material'
import {
  ChevronLeft as ChevronLeftIcon,
  Archive as ArchiveIcon,
  CheckCircle as ApproveAllIcon,
  Cancel as CancelIcon,
  Delete as KillIcon,
  Edit as EditIcon
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
  showEditButton?: boolean
  onEdit?: () => void
  showArchiveButton?: boolean
  onArchive?: () => void
  showKillEventButton?: boolean
  onKillEvent?: () => void
  disabled?: boolean
  // Bouton retour
  showBackButton?: boolean
  onBack?: () => void
  // Validation par blocs
  showValidateAllBlocksButton?: boolean
  onValidateAllBlocks?: () => Promise<void>
  showUnvalidateAllBlocksButton?: boolean
  onUnvalidateAllBlocks?: () => Promise<void>
  isValidateAllBlocksPending?: boolean
}

const ProposalNavigation: React.FC<ProposalNavigationProps> = ({
  navigation,
  showEditButton = false,
  onEdit,
  showArchiveButton = false,
  onArchive,
  showKillEventButton = false,
  onKillEvent,
  disabled = false,
  showBackButton = true,
  onBack,
  showValidateAllBlocksButton = false,
  onValidateAllBlocks,
  showUnvalidateAllBlocksButton = false,
  onUnvalidateAllBlocks,
  isValidateAllBlocksPending = false
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
        {showEditButton && onEdit && (
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<EditIcon />}
            onClick={onEdit}
            disabled={disabled}
          >
            Éditer cette proposition
          </Button>
        )}
        {showValidateAllBlocksButton && onValidateAllBlocks && (
          <Button
            variant="contained"
            color="success"
            size="small"
            startIcon={<ApproveAllIcon />}
            onClick={onValidateAllBlocks}
            disabled={disabled || isValidateAllBlocksPending}
          >
            Tout valider (blocs)
          </Button>
        )}
        {showUnvalidateAllBlocksButton && onUnvalidateAllBlocks && (
          <Button
            variant="outlined"
            color="warning"
            size="small"
            startIcon={<CancelIcon />}
            onClick={onUnvalidateAllBlocks}
            disabled={disabled || isValidateAllBlocksPending}
          >
            Annuler validation (tous les blocs)
          </Button>
        )}
        {showKillEventButton && onKillEvent && (
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<KillIcon />}
            onClick={onKillEvent}
            disabled={disabled}
          >
            Tuer l'événement
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