import React from 'react'
import BaseChangesTable, { BaseChangesTableProps } from './BaseChangesTable'

/**
 * EventChangesTable - Composant pour afficher les changements d'Event
 * N'affiche PAS les champs calendarStatus et timeZone qui sont spécifiques aux Editions
 */
const EventChangesTable: React.FC<Omit<BaseChangesTableProps, 'renderCustomEditor' | 'isFieldDisabledFn'>> = (props) => {
  return (
    <BaseChangesTable
      {...props}
      // Pas de logique de désactivation spéciale pour les Events
      isFieldDisabledFn={undefined}
      // Pas d'éditeurs personnalisés pour les Events
      renderCustomEditor={undefined}
    />
  )
}

export default EventChangesTable
