import React from 'react'
import CategorizedChangesTable from './CategorizedChangesTable'
import { BaseChangesTableProps } from './BaseChangesTable'

/**
 * CategorizedEventChangesTable - Composant pour afficher les changements d'Event avec catégorisation
 * N'affiche PAS les champs calendarStatus et timeZone qui sont spécifiques aux Editions
 */
const CategorizedEventChangesTable: React.FC<Omit<BaseChangesTableProps, 'renderCustomEditor' | 'isFieldDisabledFn'>> = (props) => {
  return (
    <CategorizedChangesTable
      {...props}
      entityType="EVENT"
      // Pas de logique de désactivation spéciale pour les Events
      isFieldDisabledFn={undefined}
      // Pas d'éditeurs personnalisés pour les Events
      renderCustomEditor={undefined}
    />
  )
}

export default CategorizedEventChangesTable
