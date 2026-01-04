import React from 'react'
import CategorizedChangesTable from './CategorizedChangesTable'
import { BaseChangesTableProps } from './BaseChangesTable'
import CalendarStatusEditor from './CalendarStatusEditor'
import TimezoneEditor from './TimezoneEditor'

interface CategorizedEditionChangesTableProps extends Omit<BaseChangesTableProps, 'renderCustomEditor' | 'isFieldDisabledFn'> {
  isEditionCanceled?: boolean // Désactiver tous les champs sauf calendarStatus quand l'édition est annulée
  // Props de validation par bloc
  isBlockValidated?: boolean
  onValidateBlock?: () => Promise<void>
  onValidateBlockWithDependencies?: (blockKey: string) => Promise<void>  // ✅ Nouveau
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
  validationDisabled?: boolean // Désactiver le bouton de validation (séparé de disabled)
  // ✅ Note: isFeaturedEvent retiré temporairement (non utilisé)
  // Peut être ré-ajouté pour affichage warning si Event.isFeatured = true
  // Handler spécifique pour Edition.startDate (avec logique de propagation aux courses)
  onEditionStartDateChange?: (fieldName: string, newValue: any) => void
  // Affichage colonnes
  showCurrentValue?: boolean
  showConfidence?: boolean
  showActions?: boolean
}

/**
 * CategorizedEditionChangesTable - Composant pour afficher les changements d'Edition avec catégorisation
 * Inclut les éditeurs personnalisés pour calendarStatus et timeZone
 * Désactive les champs (sauf calendarStatus) si l'édition est annulée
 */
const CategorizedEditionChangesTable: React.FC<CategorizedEditionChangesTableProps> = ({ 
  isEditionCanceled = false,
  isBlockValidated = false,
  onValidateBlock,
  onValidateBlockWithDependencies,  // ✅ Nouveau
  onUnvalidateBlock,
  isBlockPending = false,
  validationDisabled = false,
  onEditionStartDateChange,
  showCurrentValue = true,
  showConfidence = false,
  showActions = true,
  ...props 
}) => {
  // Fonction pour déterminer si un champ doit être désactivé
  const isFieldDisabledFn = (fieldName: string): boolean => {
    // Si le bloc est validé, tous les champs sont désactivés
    if (isBlockValidated) return true
    // Si l'édition est annulée, tous les champs sauf calendarStatus sont désactivés
    return isEditionCanceled && fieldName !== 'calendarStatus'
  }

  // Fonction pour rendre les éditeurs personnalisés pour calendarStatus et timeZone
  const renderCustomEditor = (
    fieldName: string, 
    selectedValue: any, 
    onSave: (fieldName: string, newValue: any) => void, 
    onCancel: () => void
  ): React.ReactNode | null => {
    if (fieldName === 'calendarStatus') {
      return (
        <CalendarStatusEditor
          fieldName={fieldName}
          initialValue={selectedValue}
          onSave={onSave}
          onCancel={onCancel}
        />
      )
    }
    
    if (fieldName === 'timeZone') {
      return (
        <TimezoneEditor
          fieldName={fieldName}
          initialValue={selectedValue}
          onSave={onSave}
          onCancel={onCancel}
        />
      )
    }
    
    return null
  }

  // Wrapper pour onFieldModify qui intercepte startDate
  const handleFieldModifyWithStartDateLogic = (fieldName: string, newValue: any, reason?: string) => {
    if (fieldName === 'startDate' && onEditionStartDateChange) {
      onEditionStartDateChange(fieldName, newValue)
    } else if (props.onFieldModify) {
      props.onFieldModify(fieldName, newValue, reason)
    }
  }
  
  return (
    <CategorizedChangesTable
      {...props}
      onFieldModify={handleFieldModifyWithStartDateLogic}
      entityType="EDITION"
      blockKey="edition"  // ✅ Nouveau
      isFieldDisabledFn={isFieldDisabledFn}
      renderCustomEditor={renderCustomEditor}
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

export default CategorizedEditionChangesTable
