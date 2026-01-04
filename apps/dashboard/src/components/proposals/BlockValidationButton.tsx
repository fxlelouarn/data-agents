import React from 'react'
import { Button, CircularProgress, Tooltip } from '@mui/material'
import { CheckCircle as ValidateIcon, Cancel as CancelIcon, Lock as LockIcon } from '@mui/icons-material'
import { BlockType } from '@data-agents/types'

interface BlockValidationButtonProps {
  blockKey?: string // Optionnel, pour compatibilité
  isValidated: boolean
  isApplied?: boolean // ✅ Nouveau : true si le bloc a déjà été appliqué en base (non annulable)
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
  isApplied = false,
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

  // Style compact pour les boutons
  const compactSx = { py: 0.5, px: 1.5, fontSize: '0.8125rem' }

  // ✅ Si le bloc est appliqué, afficher un bouton désactivé avec tooltip explicatif
  if (isApplied && isValidated) {
    return (
      <Tooltip title="Ce bloc a déjà été appliqué en base de données et ne peut plus être annulé">
        <span>
          <Button
            variant="outlined"
            color="info"
            startIcon={<LockIcon />}
            disabled
            size="small"
            sx={compactSx}
          >
            Appliqué
          </Button>
        </span>
      </Tooltip>
    )
  }

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
      sx={compactSx}
    >
      {isValidated ? `Annuler` : `Valider`}
    </Button>
  )
}

export default BlockValidationButton
