import React from 'react'
import { IconButton, Tooltip } from '@mui/material'
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material'

interface CopyFieldButtonProps {
  /** Nom du champ à copier */
  fieldName: string
  /** Label lisible du champ (pour le tooltip) */
  fieldLabel?: string
  /** Callback quand on clique sur le bouton */
  onCopy: (fieldName: string) => void
  /** Indique si la valeur source est différente de la valeur working */
  isDifferent: boolean
  /** Désactiver le bouton */
  disabled?: boolean
}

/**
 * CopyFieldButton - Bouton [←] pour copier un champ depuis la source
 * 
 * Visible uniquement si la valeur est différente de la working proposal.
 * Affiche un tooltip explicatif au survol.
 */
const CopyFieldButton: React.FC<CopyFieldButtonProps> = ({
  fieldName,
  fieldLabel,
  onCopy,
  isDifferent,
  disabled = false
}) => {
  // Ne pas afficher le bouton si les valeurs sont identiques
  if (!isDifferent) {
    return null
  }

  const tooltipText = fieldLabel 
    ? `Copier "${fieldLabel}" vers la proposition de travail`
    : `Copier ce champ vers la proposition de travail`

  return (
    <Tooltip title={tooltipText} placement="left">
      <span>
        <IconButton
          size="small"
          color="primary"
          disabled={disabled}
          onClick={() => onCopy(fieldName)}
          sx={{
            opacity: 0.7,
            '&:hover': {
              opacity: 1,
              bgcolor: 'primary.main',
              color: 'primary.contrastText'
            }
          }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  )
}

export default CopyFieldButton
