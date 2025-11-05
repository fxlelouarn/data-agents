import React from 'react'
import { Button, CircularProgress } from '@mui/material'
import { CheckCircle as ValidateIcon, Cancel as CancelIcon } from '@mui/icons-material'

interface BlockValidationButtonProps {
  blockKey?: string // Optionnel, pour compatibilité
  isValidated: boolean
  onValidate: () => Promise<void>
  onUnvalidate: () => Promise<void>
  disabled?: boolean
  isPending?: boolean
  blockName?: string // Nom du bloc pour le label
}

/**
 * Bouton de validation/annulation pour un bloc de changements
 * 
 * Affiche "Valider" quand le bloc n'est pas validé
 * Affiche "Annuler" quand le bloc est validé
 * 
 * Quand validé :
 * - Les changements du bloc sont approuvés
 * - Une ProposalApplication est créée
 * - Le bloc devient non-éditable (grisé)
 * 
 * Quand annulé :
 * - L'approbation est annulée
 * - La ProposalApplication est supprimée  
 * - Le bloc redevient éditable
 */
const BlockValidationButton: React.FC<BlockValidationButtonProps> = ({
  blockKey,
  isValidated,
  onValidate,
  onUnvalidate,
  disabled = false,
  isPending = false,
  blockName
}) => {
  const handleClick = async () => {
    if (isValidated) {
      await onUnvalidate()
    } else {
      await onValidate()
    }
  }

  const label = blockName || (blockKey ? blockKey : 'bloc')
  
  return (
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
      {isValidated ? `Annuler ${label}` : `Valider ${label}`}
    </Button>
  )
}

export default BlockValidationButton
