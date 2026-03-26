/**
 * Utility functions for race data handling in the shared proposal builder.
 * Ported from FFAScraperAgent and SlackProposalService.
 */

import { inferRaceCategories } from '@data-agents/database'
import type { ProposalRaceInput } from '@data-agents/types'

const DEFAULT_TIMEZONE = 'Europe/Paris'

/** Validates that a string looks like YYYY-MM-DD (optionally with a time part). */
function isValidDateString(s: string): boolean {
  const datePart = s.includes('T') ? s.split('T')[0] : s
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart)
}

/**
 * Convert a local date/time in a given timezone to UTC.
 * Uses Intl.DateTimeFormat — deterministic regardless of server TZ.
 */
function localToUtc(localDateStr: string, timeZone: string): Date {
  // Parse the local date string
  const [datePart, timePart] = localDateStr.split('T')
  const [yearStr, monthStr, dayStr] = datePart.split('-')
  const [hourStr, minuteStr] = (timePart || '00:00:00').split(':')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10) - 1
  const day = parseInt(dayStr, 10)
  const hours = parseInt(hourStr, 10)
  const minutes = parseInt(minuteStr, 10)

  // Guard against invalid parsed values (e.g. "<UNKNOWN>" from LLM)
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
    return new Date(NaN)
  }

  // Create a UTC date with the local time values
  const utcGuess = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0))

  // Get what this UTC instant looks like in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(utcGuess)
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10)

  const zonedHour = get('hour') === 24 ? 0 : get('hour')
  const zonedMinute = get('minute')
  const zonedDay = get('day')

  // Compute offset: difference between timezone and UTC at this instant
  let offsetMinutes = (zonedHour * 60 + zonedMinute) - (hours * 60 + minutes)
  if (zonedDay !== day) {
    if (zonedDay > day || (zonedDay === 1 && day > 27)) offsetMinutes += 24 * 60
    else offsetMinutes -= 24 * 60
  }

  return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0) - offsetMinutes * 60 * 1000)
}

/**
 * Converts a distance in meters to km and assigns it to the correct field
 * based on the race category.
 *
 * - WALK → walkDistance
 * - CYCLING → bikeDistance
 * - Everything else (RUNNING, TRAIL, TRIATHLON, FUN, OTHER, undefined) → runDistance
 */
export function assignDistanceByCategory(
  distanceMeters: number,
  categoryLevel1?: string
): Record<string, number> {
  const km = distanceMeters / 1000
  if (categoryLevel1 === 'WALK') {
    return { walkDistance: km }
  }
  if (categoryLevel1 === 'CYCLING') {
    return { bikeDistance: km }
  }
  return { runDistance: km }
}

/**
 * Checks whether a UTC date corresponds to midnight (00:00:00) in the given timezone.
 */
export function isMidnightInTimezone(date: Date, timezone: string): boolean {
  if (!date || isNaN(date.getTime())) return true // treat invalid dates as midnight (safe default)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const timeStr = formatter.format(date)
  return timeStr === '00:00:00'
}

/**
 * Compares two dates ignoring time, in a specific timezone.
 * Returns true if both dates fall on the same calendar day in that timezone.
 */
export function isSameDateInTimezone(date1: Date, date2: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return formatter.format(date1) === formatter.format(date2)
}

/**
 * Cascades a new edition date to a race date, preserving the race's local time
 * if it is not at midnight.
 *
 * - If the race is at midnight → returns midnight of the new edition date's day
 * - If the race has a precise time → extracts local time from the existing race
 *   and applies it to the new date
 */
export function cascadeDateToRace(
  newEditionDate: Date,
  existingRaceDate: Date,
  timezone: string
): Date {
  if (isMidnightInTimezone(existingRaceDate, timezone)) {
    // Race was at midnight — replace entirely with the new edition date
    return newEditionDate
  }

  // Race has a precise time — preserve the hour, change only the date
  const raceLocalTime = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(existingRaceDate)

  const newLocalDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(newEditionDate)

  const newLocalDateTimeStr = `${newLocalDate}T${raceLocalTime}`
  return localToUtc(newLocalDateTimeStr, timezone)
}

/**
 * Calculates the UTC start date for a race.
 *
 * - If `raceDate` is provided (DD/MM format for multi-day events): uses that date
 *   with the year from `editionDate`
 * - If `startTime` is provided (HH:mm): combines with date and converts to UTC
 * - If neither: returns midnight in the given timezone
 *
 * @param editionDate - Base edition date (YYYY-MM-DD)
 * @param startTime - Local start time (HH:mm), optional
 * @param timezone - IANA timezone, defaults to 'Europe/Paris'
 * @param raceDate - Race-specific date for multi-day events (DD/MM), optional
 */
export function calculateRaceStartDate(
  editionDate: string,
  startTime?: string,
  timezone?: string,
  raceDate?: string
): Date | undefined {
  if (!editionDate || !isValidDateString(editionDate)) return undefined

  const tz = timezone || DEFAULT_TIMEZONE

  // Determine the base date
  let baseDateStr: string

  if (raceDate) {
    // Multi-day format: DD/MM — use year from editionDate
    const [dayStr, monthStr] = raceDate.split('/')
    const raceDay = parseInt(dayStr, 10)
    const raceMonth = parseInt(monthStr, 10) - 1 // 0-indexed

    const editionYear = parseInt(editionDate.substring(0, 4), 10)
    const editionMonthIndex = parseInt(editionDate.substring(5, 7), 10) - 1

    // Handle year rollover (e.g. December → January)
    const adjustedYear = raceMonth === 0 && editionMonthIndex === 11
      ? editionYear + 1
      : editionYear

    baseDateStr = `${adjustedYear}-${String(raceMonth + 1).padStart(2, '0')}-${String(raceDay).padStart(2, '0')}`
  } else {
    // Use the edition date — strip time part if full ISO datetime was passed
    baseDateStr = editionDate.includes('T') ? editionDate.split('T')[0] : editionDate
  }

  if (startTime) {
    const [hours, minutes] = startTime.split(':').map(Number)
    const localDateStr = `${baseDateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    return localToUtc(localDateStr, tz)
  }

  // No time provided — return midnight in local timezone
  const localMidnight = `${baseDateStr}T00:00:00`
  return localToUtc(localMidnight, tz)
}

/**
 * Calculates the start and end dates of an edition based on its races.
 *
 * - startDate: first non-midnight race time of the earliest day
 * - endDate: last race time (regardless of midnight)
 * - Falls back to midnight of the edition date if no race times are available
 */
export function calculateEditionDates(
  races: ProposalRaceInput[],
  editionDate: string,
  timezone: string
): { startDate: Date; endDate: Date } {
  const tz = timezone || DEFAULT_TIMEZONE
  // Normalize: strip time part if full ISO datetime was passed
  const baseDateStr = editionDate.includes('T') ? editionDate.split('T')[0] : editionDate

  if (races.length === 0) {
    const midnight = localToUtc(`${baseDateStr}T00:00:00`, tz)
    return { startDate: midnight, endDate: midnight }
  }

  // Build list of race dates (filter out invalid dates)
  const raceDates: Date[] = races
    .map(race => calculateRaceStartDate(baseDateStr, race.startTime, tz, race.raceDate))
    .filter((d): d is Date => d != null && !isNaN(d.getTime()))

  if (raceDates.length === 0) {
    const midnight = localToUtc(`${baseDateStr}T00:00:00`, tz)
    return { startDate: midnight, endDate: midnight }
  }

  // endDate = last race time
  const endDate = raceDates[raceDates.length - 1]

  // startDate = first non-midnight race time, falling back to midnight
  let startDate: Date | undefined
  for (const date of raceDates) {
    if (!isMidnightInTimezone(date, tz)) {
      startDate = date
      break
    }
  }

  if (!startDate) {
    // All races are at midnight — use the earliest date (which is the first)
    startDate = raceDates[0]
  }

  return { startDate, endDate }
}

/**
 * Classifies an organizer URL into facebook, instagram or website.
 *
 * - facebook.com / fb.com / fb.me → facebookUrl
 * - instagram.com / instagr.am → instagramUrl
 * - Everything else → websiteUrl
 * - Returns empty object for undefined/null/empty
 */
export function classifyOrganizerUrl(url?: string): {
  websiteUrl?: string
  facebookUrl?: string
  instagramUrl?: string
} {
  if (!url) return {}

  const normalizedUrl = url.toLowerCase()

  if (
    normalizedUrl.includes('facebook.com') ||
    normalizedUrl.includes('fb.com') ||
    normalizedUrl.includes('fb.me')
  ) {
    return { facebookUrl: url }
  }

  if (
    normalizedUrl.includes('instagram.com') ||
    normalizedUrl.includes('instagr.am')
  ) {
    return { instagramUrl: url }
  }

  return { websiteUrl: url }
}

/**
 * Infers and assigns categories to a race if they are not already set.
 *
 * If categoryLevel1 is already defined on the race, returns it as-is.
 * Otherwise calls inferRaceCategories from @data-agents/database.
 */
export function inferAndAssignCategories(
  race: ProposalRaceInput,
  eventName?: string
): ProposalRaceInput {
  if (race.categoryLevel1) {
    return race
  }

  const distanceKm = race.distance ? race.distance / 1000 : undefined
  const [categoryLevel1, categoryLevel2] = inferRaceCategories(
    race.name,
    distanceKm,
    undefined, // bikeDistance
    undefined, // swimDistance
    undefined, // walkDistance
    eventName
  )

  return {
    ...race,
    categoryLevel1,
    categoryLevel2: categoryLevel2 ?? undefined,
  }
}
