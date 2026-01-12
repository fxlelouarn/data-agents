/**
 * Configuration des champs par bloc pour la validation
 *
 * Cette configuration définit quels champs appartiennent à chaque bloc
 * pour éviter les interférences lors de la validation par blocs.
 */

/**
 * Champs appartenant au bloc "Event"
 * Ces champs concernent l'événement global (nom, lieu, pays, région, etc.)
 */
export const EVENT_FIELDS = [
  'name',
  'city',
  'country',
  'countrySubdivisionNameLevel1',
  'countrySubdivisionNameLevel2',
  'countrySubdivisionDisplayCodeLevel1',
  'countrySubdivisionDisplayCodeLevel2',
  'websiteUrl',
  'facebookUrl',
  'instagramUrl',
  'latitude',
  'longitude',
  'fullAddress',
  'dataSource'
] as const

/**
 * Champs appartenant au bloc "Edition"
 * Ces champs concernent l'édition spécifique (dates, statut, timezone, etc.)
 */
export const EDITION_FIELDS = [
  'year',
  'startDate',
  'endDate',
  'calendarStatus',
  'timeZone',
  'registrationOpeningDate',
  'registrationClosingDate',
  'registrantsNumber'
] as const

/**
 * Champs appartenant au bloc "Organizer"
 */
export const ORGANIZER_FIELDS = [
  'organizer'
] as const

/**
 * Champs appartenant au bloc "Races"
 */
export const RACE_FIELDS = [
  'racesToAdd',
  'racesToUpdate',
  'existingRaces'
] as const

/**
 * Type pour les noms de blocs
 */
export type BlockKey = 'event' | 'edition' | 'organizer' | 'races'

/**
 * Vérifie si un champ appartient à un bloc donné
 */
export function isFieldInBlock(fieldName: string, blockKey: BlockKey): boolean {
  switch (blockKey) {
    case 'event':
      return EVENT_FIELDS.includes(fieldName as any)
    case 'edition':
      return EDITION_FIELDS.includes(fieldName as any)
    case 'organizer':
      return ORGANIZER_FIELDS.includes(fieldName as any)
    case 'races':
      return RACE_FIELDS.includes(fieldName as any)
    default:
      return false
  }
}

/**
 * Détermine à quel bloc appartient un champ
 */
export function getBlockForField(fieldName: string): BlockKey | null {
  if (EVENT_FIELDS.includes(fieldName as any)) return 'event'
  if (EDITION_FIELDS.includes(fieldName as any)) return 'edition'
  if (ORGANIZER_FIELDS.includes(fieldName as any)) return 'organizer'
  if (RACE_FIELDS.includes(fieldName as any)) return 'races'
  return null
}

/**
 * Filtre les champs d'un bloc spécifique depuis une liste de changements
 */
export function filterFieldsByBlock<T extends { field: string }>(
  changes: T[],
  blockKey: BlockKey
): T[] {
  return changes.filter(change => isFieldInBlock(change.field, blockKey))
}
