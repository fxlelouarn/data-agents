import React from 'react'
import BaseChangesTable, { BaseChangesTableProps } from './BaseChangesTable'
import CalendarStatusEditor from './CalendarStatusEditor'
import TimezoneEditor from './TimezoneEditor'

interface EditionChangesTableProps extends Omit<BaseChangesTableProps, 'renderCustomEditor' | 'isFieldDisabledFn'> {
  isEditionCanceled?: boolean // Désactiver tous les champs sauf calendarStatus quand l'édition est annulée
}

/**
 * EditionChangesTable - Composant pour afficher les changements d'Edition
 * Inclut les éditeurs personnalisés pour calendarStatus et timeZone
 * Désactive les champs (sauf calendarStatus) si l'édition est annulée
 */
const EditionChangesTable: React.FC<EditionChangesTableProps> = ({ 
  isEditionCanceled = false,
  ...props 
}) => {
  // Fonction pour déterminer si un champ doit être désactivé
  const isFieldDisabledFn = (fieldName: string): boolean => {
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

  return (
    <BaseChangesTable
      {...props}
      isFieldDisabledFn={isFieldDisabledFn}
      renderCustomEditor={renderCustomEditor}
    />
  )
}

export default EditionChangesTable
