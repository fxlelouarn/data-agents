import React from 'react'
import { Button, CircularProgress } from '@mui/material'
import { CheckCircle as ValidateIcon, Cancel as CancelIcon } from '@mui/icons-material'
import { BlockType } from '@data-agents/types'

interface BlockValidationButtonProps {
  blockKey?: string // Optionnel, pour compatibilité
  isValidated: boolean
  onValidate: () => Promise<void>
  onUnvalidate: () => Promise<void>
  disabled?: boolean
  isPending?: boolean
  blockName?: string // Nom du bloc pour le label
  // ✅ Nouveau : support validation en cascade
  onValidateWithDependencies?: (blockKey: BlockType) => Promise<void>
  useCascadeValidation?: boolean  // Default: true
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
  blockName,
  onValidateWithDependencies,
  useCascadeValidation = true
}) => {
  const handleClick = async () => {
    if (isValidated) {
      await onUnvalidate()
    } else {
      // ✅ Utiliser validation en cascade si disponible et activée
      if (useCascadeValidation && onValidateWithDependencies && blockKey) {
        await onValidateWithDependencies(blockKey as BlockType)
      } else {
        await onValidate()
      }
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
      // ✅ Le bouton d'annulation ne doit JAMAIS être désactivé par disabled
      // Seul le bouton de validation peut l'être
      disabled={(isValidated ? false : disabled) || isPending}
      size="small"
    >
      {isValidated ? `Annuler ${label}` : `Valider ${label}`}
    </Button>
  )
}

export default BlockValidationButton
