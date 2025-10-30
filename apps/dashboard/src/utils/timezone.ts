import { format, parseISO } from 'date-fns'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { fr } from 'date-fns/locale'

/**
 * Convertit une date UTC (ISO string) vers une timezone donnée et retourne un objet Date
 */
export function utcToTimezone(utcDateString: string, timezone: string = 'Europe/Paris'): Date {
  try {
    const date = parseISO(utcDateString)
    return utcToZonedTime(date, timezone)
  } catch (error) {
    console.error('Error converting UTC to timezone:', error)
    return new Date(utcDateString)
  }
}

/**
 * Convertit une date locale (dans une timezone) vers UTC et retourne un ISO string
 */
export function timezoneToUtc(localDate: Date, timezone: string = 'Europe/Paris'): string {
  try {
    return zonedTimeToUtc(localDate, timezone).toISOString()
  } catch (error) {
    console.error('Error converting timezone to UTC:', error)
    return localDate.toISOString()
  }
}

/**
 * Formate une date UTC pour l'affichage dans une timezone donnée
 */
export function formatDateInTimezone(
  utcDateString: string,
  timezone: string = 'Europe/Paris',
  formatStr: string = 'EEEE dd/MM/yyyy HH:mm'
): string {
  // Vérifier si la date est null, undefined ou vide
  if (!utcDateString || utcDateString === 'null' || utcDateString === 'undefined') {
    return '-'
  }
  
  try {
    const zonedDate = utcToTimezone(utcDateString, timezone)
    // Vérifier si la date résultante est valide
    if (isNaN(zonedDate.getTime())) {
      console.error('Invalid date after conversion:', utcDateString)
      return '-'
    }
    return format(zonedDate, formatStr, { locale: fr })
  } catch (error) {
    console.error('Error formatting date:', error, 'for value:', utcDateString)
    return '-'
  }
}

/**
 * Convertit une date UTC en format datetime-local HTML pour l'input
 * Le format datetime-local ne supporte pas directement les timezones,
 * donc on convertit d'abord vers la timezone et on retourne le format attendu
 */
export function utcToDatetimeLocal(utcDateString: string, timezone: string = 'Europe/Paris'): string {
  try {
    const zonedDate = utcToTimezone(utcDateString, timezone)
    // Format: YYYY-MM-DDTHH:mm (sans secondes ni Z)
    return format(zonedDate, "yyyy-MM-dd'T'HH:mm")
  } catch (error) {
    console.error('Error converting to datetime-local:', error)
    return utcDateString.slice(0, 16)
  }
}

/**
 * Convertit une valeur datetime-local HTML vers UTC ISO string
 * @param datetimeLocalValue - Format: YYYY-MM-DDTHH:mm
 * @param timezone - La timezone dans laquelle l'utilisateur a édité la date
 */
export function datetimeLocalToUtc(datetimeLocalValue: string, timezone: string = 'Europe/Paris'): string {
  try {
    // Créer un objet Date à partir de la valeur locale
    // Note: on considère que cette date est dans la timezone spécifiée
    const localDate = new Date(datetimeLocalValue)
    return timezoneToUtc(localDate, timezone)
  } catch (error) {
    console.error('Error converting datetime-local to UTC:', error)
    return new Date(datetimeLocalValue).toISOString()
  }
}

/**
 * Liste des timezones communes pour la sélection
 */
export const COMMON_TIMEZONES = [
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC'
] as const

export type CommonTimezone = typeof COMMON_TIMEZONES[number]
