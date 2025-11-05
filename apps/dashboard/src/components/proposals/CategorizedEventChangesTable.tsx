import React from 'react'
import CategorizedChangesTable from './CategorizedChangesTable'
import { BaseChangesTableProps } from './BaseChangesTable'

interface CategorizedEventChangesTableProps extends Omit<BaseChangesTableProps, 'renderCustomEditor' | 'isFieldDisabledFn'> {
  // Props de validation par bloc
  isBlockValidated?: boolean
  onValidateBlock?: () => Promise<void>
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
}

/**
 * CategorizedEventChangesTable - Composant pour afficher les changements d'Event avec catégorisation
 * N'affiche PAS les champs calendarStatus et timeZone qui sont spécifiques aux Editions
 */
const CategorizedEventChangesTable: React.FC<CategorizedEventChangesTableProps> = ({
  isBlockValidated = false,
  onValidateBlock,
  onUnvalidateBlock,
  isBlockPending = false,
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
      isFieldDisabledFn={isFieldDisabledFn}
      renderCustomEditor={undefined}
      isBlockValidated={isBlockValidated}
      onValidateBlock={onValidateBlock}
      onUnvalidateBlock={onUnvalidateBlock}
      isBlockPending={isBlockPending}
    />
  )
}

export default CategorizedEventChangesTable
