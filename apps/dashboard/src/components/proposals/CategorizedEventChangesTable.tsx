import React from 'react'
import CategorizedChangesTable from './CategorizedChangesTable'
import { BaseChangesTableProps } from './BaseChangesTable'

interface CategorizedEventChangesTableProps extends Omit<BaseChangesTableProps, 'renderCustomEditor' | 'isFieldDisabledFn'> {
  // Props de validation par bloc
  isBlockValidated?: boolean
  onValidateBlock?: () => Promise<void>
  onValidateBlockWithDependencies?: (blockKey: string) => Promise<void>  // ✅ Nouveau
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
  validationDisabled?: boolean // Désactiver le bouton de validation (séparé de disabled)
  // ✅ Note: isFeaturedEvent retiré temporairement (non utilisé)
  // Peut être ré-ajouté pour affichage warning si Event.isFeatured = true
  // Affichage colonnes
  showCurrentValue?: boolean
  showConfidence?: boolean
  showActions?: boolean
}

/**
 * CategorizedEventChangesTable - Composant pour afficher les changements d'Event avec catégorisation
 * N'affiche PAS les champs calendarStatus et timeZone qui sont spécifiques aux Editions
 */
const CategorizedEventChangesTable: React.FC<CategorizedEventChangesTableProps> = ({
  isBlockValidated = false,
  onValidateBlock,
  onValidateBlockWithDependencies,  // ✅ Nouveau
  onUnvalidateBlock,
  isBlockPending = false,
  validationDisabled = false,
  showCurrentValue = true,
  showConfidence = false,
  showActions = true,
  ...props
}) => {
  // Fonction pour déterminer si un champ doit être désactivé
  const isFieldDisabledFn = (fieldName: string): boolean => {
    // Si le bloc est validé, tous les champs sont désactivés
    return isBlockValidated
  }

  return (
    <CategorizedChangesTable
      {...props}
      entityType="EVENT"
      blockKey="event"  // ✅ Nouveau
      isFieldDisabledFn={isFieldDisabledFn}
      renderCustomEditor={undefined}
      isBlockValidated={isBlockValidated}
      onValidateBlock={onValidateBlock}
      onValidateBlockWithDependencies={onValidateBlockWithDependencies}  // ✅ Nouveau
      onUnvalidateBlock={onUnvalidateBlock}
      isBlockPending={isBlockPending}
      validationDisabled={validationDisabled}
      showCurrentValue={showCurrentValue}
      showConfidence={showConfidence}
      showActions={showActions}
    />
  )
}

export default CategorizedEventChangesTable
