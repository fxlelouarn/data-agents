import React from 'react'
import { IconButton, Tooltip, Box } from '@mui/material'
import { 
  ArrowBack as ArrowBackIcon,
  Add as AddIcon 
} from '@mui/icons-material'

interface CopyRaceButtonProps {
  /** ID de la course dans la source */
  sourceRaceId: string
  /** Nom de la course (pour le tooltip) */
  raceName: string
  /** La course existe-t-elle dans la working proposal ? */
  existsInWorking: boolean
  /** ID de la course dans la working proposal (si elle existe) */
  targetRaceId?: string
  /** Callback quand on clique sur le bouton */
  onCopy: (sourceRaceId: string, targetRaceId?: string) => void
  /** Désactiver le bouton */
  disabled?: boolean
}

/**
 * CopyRaceButton - Bouton pour copier une course depuis la source
 * 
 * Deux modes :
 * - [←] Si la course existe dans la working : remplace la course existante
 * - [+] Si la course n'existe pas : ajoute comme nouvelle course
 */
const CopyRaceButton: React.FC<CopyRaceButtonProps> = ({
  sourceRaceId,
  raceName,
  existsInWorking,
  targetRaceId,
  onCopy,
  disabled = false
}) => {
  const isAddMode = !existsInWorking

  const tooltipText = isAddMode
    ? `Ajouter "${raceName}" comme nouvelle course`
    : `Remplacer la course "${raceName}" dans la proposition de travail`

  const handleClick = () => {
    if (isAddMode) {
      // Ajouter comme nouvelle course (pas de targetRaceId)
      onCopy(sourceRaceId, undefined)
    } else {
      // Remplacer la course existante
      onCopy(sourceRaceId, targetRaceId)
    }
  }

  return (
    <Tooltip title={tooltipText} placement="left">
      <span>
        <IconButton
          size="small"
          color={isAddMode ? 'success' : 'primary'}
          disabled={disabled}
          onClick={handleClick}
          sx={{
            opacity: 0.7,
            '&:hover': {
              opacity: 1,
              bgcolor: isAddMode ? 'success.main' : 'primary.main',
              color: isAddMode ? 'success.contrastText' : 'primary.contrastText'
            }
          }}
        >
          {isAddMode ? (
            <AddIcon fontSize="small" />
          ) : (
            <ArrowBackIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  )
}

/**
 * CopyAllRacesButton - Bouton pour copier toutes les courses de la source
 */
interface CopyAllRacesButtonProps {
  onCopyAll: () => void
  disabled?: boolean
  racesCount: number
}

export const CopyAllRacesButton: React.FC<CopyAllRacesButtonProps> = ({
  onCopyAll,
  disabled = false,
  racesCount
}) => {
  return (
    <Tooltip 
      title={`Remplacer toutes les courses par celles de cette source (${racesCount} courses)`}
      placement="left"
    >
      <span>
        <IconButton
          size="small"
          color="primary"
          disabled={disabled || racesCount === 0}
          onClick={onCopyAll}
          sx={{
            opacity: 0.7,
            border: '1px solid',
            borderColor: 'primary.main',
            '&:hover': {
              opacity: 1,
              bgcolor: 'primary.main',
              color: 'primary.contrastText'
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <ArrowBackIcon fontSize="small" />
            <AddIcon fontSize="small" sx={{ ml: -0.5 }} />
          </Box>
        </IconButton>
      </span>
    </Tooltip>
  )
}

export default CopyRaceButton
