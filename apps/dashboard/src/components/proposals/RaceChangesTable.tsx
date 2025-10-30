import React from 'react'
import BaseChangesTable, { BaseChangesTableProps } from './BaseChangesTable'

interface RaceChangesTableProps extends Omit<BaseChangesTableProps, 'renderCustomEditor' | 'isFieldDisabledFn'> {
  isEditionCanceled?: boolean // Désactiver tous les champs si l'édition est annulée
}

/**
 * RaceChangesTable - Composant pour afficher les changements de Race
 * Désactive tous les champs si l'édition parente est annulée
 */
const RaceChangesTable: React.FC<RaceChangesTableProps> = ({ 
  isEditionCanceled = false,
  ...props 
}) => {
  // Fonction pour déterminer si un champ doit être désactivé
  const isFieldDisabledFn = (fieldName: string): boolean => {
    // Si l'édition est annulée, tous les champs de course sont désactivés
    return isEditionCanceled
  }

  return (
    <BaseChangesTable
      {...props}
      isFieldDisabledFn={isFieldDisabledFn}
      // Pas d'éditeurs personnalisés pour les Races
      renderCustomEditor={undefined}
    />
  )
}

export default RaceChangesTable
