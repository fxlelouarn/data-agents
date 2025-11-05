import React from 'react'
import { Button, CircularProgress, Box } from '@mui/material'
import { CheckCircle as ValidateIcon, Cancel as CancelIcon } from '@mui/icons-material'

interface ValidateBlockButtonProps {
  isValidated: boolean
  onValidate: () => Promise<void>
  onCancel: () => Promise<void>
  disabled?: boolean
  blockName?: string
}

/**
 * Bouton de validation/annulation pour un bloc individuel
 * Version simplifiée pour les composants qui gèrent un seul bloc
 * 
 * Affiche "Valider" quand le bloc n'est pas validé
 * Affiche "Annuler" quand le bloc est validé
 */
const ValidateBlockButton: React.FC<ValidateBlockButtonProps> = ({
  isValidated,
  onValidate,
  onCancel,
  disabled = false,
  blockName = 'bloc'
}) => {
  const [isPending, setIsPending] = React.useState(false)

  const handleClick = async () => {
    setIsPending(true)
    try {
      if (isValidated) {
        await onCancel()
      } else {
        await onValidate()
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
      <Button
        variant={isValidated ? 'outlined' : 'contained'}
        color={isValidated ? 'warning' : 'success'}
        startIcon={
          isPending ? (
            <CircularProgress size={16} />
          ) : isValidated ? (
            <CancelIcon />
          ) : (
            <ValidateIcon />
          )
        }
        onClick={handleClick}
        disabled={disabled || isPending}
        size="small"
      >
        {isValidated ? `Annuler ${blockName}` : `Valider ${blockName}`}
      </Button>
    </Box>
  )
}

export default ValidateBlockButton
