/**
 * HTML parsing utilities for the FFTRI calendar.
 *
 * Extracts structured event data from FFTRI listing and detail page HTML
 * using Cheerio for DOM parsing.
 */

import * as cheerio from 'cheerio'
import { FFTRIEvent, FFTRIEventDate, FFTRIRace, FFTRIEventDetails } from './types'

// French month name → 0-based month index
const FRENCH_MONTH_MAP: Record<string, number> = {
  'janvier': 0, 'février': 1, 'fevrier': 1, 'mars': 2, 'avril': 3,
  'mai': 4, 'juin': 5, 'juillet': 6, 'août': 7, 'aout': 7,
  'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11, 'decembre': 11,
  // Abbreviated forms observed on the site
  'janv.': 0, 'févr.': 1, 'fevr.': 1, 'avr.': 3,
  'juil.': 6, 'août.': 7, 'aout.': 7,
  'sept.': 8, 'oct.': 9, 'nov.': 10, 'déc.': 11, 'dec.': 11,
  // Even shorter forms
  'jan': 0, 'fev': 1, 'mar': 2, 'avr': 3,
  'jui': 5, 'jul': 6, 'aou': 7,
  'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
}

/**
 * Parse the FFTRI listing HTML and extract events.
 * Deduplicates events that appear multiple times (multi-day events have
 * the same blocEvent_XXXX id but appear with different dates).
 *
 * @param html - Raw HTML from the listing page or infinite scroll fragment
 * @param referenceYear - Year to assign to dates (the listing doesn't include the year)
 */
export function parseEventsList(html: string, referenceYear: number): FFTRIEvent[] {
  const $ = cheerio.load(html)
  const eventsMap = new Map<string, FFTRIEvent>()

  $('a.blocEvent').each((_, element) => {
    try {
      const $el = $(element)

      // Extract FFTRI ID from id attribute (blocEvent_XXXX)
      const idAttr = $el.attr('id') || ''
      const fftriIdMatch = idAttr.match(/blocEvent_(\d+)/)
      if (!fftriIdMatch) return
      const fftriId = fftriIdMatch[1]

      // Extract date
      const dayOfWeek = $el.find('.jourLibEvent').first().text().trim()
      const dayText = $el.find('.jourEvent').first().text().trim()
      const day = parseInt(dayText, 10)
      const month = $el.find('.moisEvent').first().text().trim()
      if (!day || !month) return

      const eventDate: FFTRIEventDate = { dayOfWeek, day, month }

      // If this event already exists (multi-day), merge dates and races
      if (eventsMap.has(fftriId)) {
        const existing = eventsMap.get(fftriId)!
        const dateExists = existing.dates.some(d => d.day === day && d.month === month)
        if (!dateExists) {
          existing.dates.push(eventDate)
        }
        // Also merge any new races from this occurrence
        const newRaces = parseRacesFromElement($, $el)
        for (const race of newRaces) {
          const raceExists = existing.races.some(r =>
            r.sportType === race.sportType && r.format === race.format && r.raceUrl === race.raceUrl
          )
          if (!raceExists) {
            existing.races.push(race)
          }
        }
        return
      }

      // Extract event name
      const name = $el.find('.nomEvent').text().trim()
      if (!name) return

      // Extract location (postal code + city)
      // Structure: <div class="lieuEvent"><span class="countryFlag"></span><span>26260 ST DONAT SUR L'HERBASSE </span></div>
      const lieuText = $el.find('.lieuEvent span').last().text()
        .replace(/\u00a0/g, ' ')  // non-breaking space → regular space
        .trim()
      const locationMatch = lieuText.match(/^(\d{5})\s+(.+)$/)
      const postalCode = locationMatch ? locationMatch[1] : ''
      const city = locationMatch ? locationMatch[2].trim() : lieuText

      // Derive department from postal code
      const department = deriveDepartment(postalCode)

      // Extract detail URL
      const detailUrl = $el.attr('href') || ''

      // Extract races (épreuves)
      const races = parseRacesFromElement($, $el)

      eventsMap.set(fftriId, {
        fftriId,
        name,
        dates: [eventDate],
        city,
        postalCode,
        department,
        ligue: '',  // Set later by the scraper based on the query param used
        detailUrl,
        races,
      })
    } catch {
      // Skip malformed entries
    }
  })

  return Array.from(eventsMap.values())
}

/**
 * Parse races (épreuves) from a blocEvent cheerio element.
 * Each race is represented by a .distBlocEvent div.
 */
function parseRacesFromElement(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<cheerio.Element>
): FFTRIRace[] {
  const races: FFTRIRace[] = []

  $el.find('.distBlocEvent').each((_, raceEl) => {
    const $race = $(raceEl)
    const sportType = $race.find('.sportEvent').text().trim()
    const format = $race.find('.distEvent').text().trim()

    if (!sportType || !format) return

    // Extract category from CSS class (national, youth, challenge)
    let category = 'national'
    const classes = ($race.attr('class') || '').split(/\s+/)
    if (classes.includes('youth')) category = 'youth'
    else if (classes.includes('challenge')) category = 'challenge'

    // Extract race URL from onclick attribute
    const onclick = $race.attr('onclick') || ''
    const urlMatch = onclick.match(/window\.location\.href='([^']+)'/)
    const raceUrl = urlMatch ? urlMatch[1] : ''

    races.push({ sportType, format, category, raceUrl })
  })

  return races
}

/**
 * Derive department code from French postal code.
 * - Metropolitan France: first 2 digits (e.g. "26260" → "26")
 * - Corsica: "2A" (20000-20199) or "2B" (20200-20999)
 * - DOM-TOM: first 3 digits (e.g. "97100" → "971")
 */
export function deriveDepartment(postalCode: string): string {
  if (!postalCode || postalCode.length < 2) return ''

  const prefix2 = postalCode.substring(0, 2)

  // DOM-TOM (97x, 98x)
  if (prefix2 === '97' || prefix2 === '98') {
    return postalCode.substring(0, 3)
  }

  // Corsica
  if (prefix2 === '20') {
    const code = parseInt(postalCode, 10)
    return code >= 20200 ? '2B' : '2A'
  }

  return prefix2
}

/**
 * Calculate start and end dates from an array of FFTRIEventDate.
 * Dates are sorted chronologically; the first is startDate, last is endDate.
 *
 * @param dates - Array of event dates (may be multi-day)
 * @param referenceYear - Year to use when building Date objects
 */
export function calculateDateRange(
  dates: FFTRIEventDate[],
  referenceYear: number
): { startDate: Date; endDate: Date } {
  const parsedDates = dates
    .map(d => {
      const key = d.month.toLowerCase()
      const monthIndex = FRENCH_MONTH_MAP[key] ?? FRENCH_MONTH_MAP[key.replace('.', '')]
      if (monthIndex === undefined) return null
      return new Date(referenceYear, monthIndex, d.day)
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())

  if (parsedDates.length === 0) {
    const now = new Date()
    return { startDate: now, endDate: now }
  }

  return {
    startDate: parsedDates[0],
    endDate: parsedDates[parsedDates.length - 1],
  }
}

/**
 * Parse the event detail page to extract organizer info and GPS coordinates.
 * Extracts from JSON-LD (schema.org) structured data when available.
 *
 * @param html - Raw HTML from the event detail page
 * @param event - The FFTRIEvent (used to compute start/end dates)
 */
export function parseEventDetails(html: string, event: FFTRIEvent): FFTRIEventDetails {
  const $ = cheerio.load(html)

  let organizerName: string | undefined
  let organizerWebsite: string | undefined
  let latitude: number | undefined
  let longitude: number | undefined

  // Primary source: JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}')
      if (json['@type'] === 'SportsEvent' || json['@type'] === 'Event') {
        // Organizer info
        if (json.organizer) {
          const org = Array.isArray(json.organizer) ? json.organizer[0] : json.organizer
          if (org.name) organizerName = org.name
          if (org.url) organizerWebsite = org.url
        }

        // GPS coordinates
        if (json.location?.geo) {
          const lat = parseFloat(json.location.geo.latitude)
          const lng = parseFloat(json.location.geo.longitude)
          if (!isNaN(lat)) latitude = lat
          if (!isNaN(lng)) longitude = lng
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  })

  // Calculate start/end dates from the event's dates array
  const referenceYear = new Date().getFullYear()
  const { startDate, endDate } = calculateDateRange(event.dates, referenceYear)

  return {
    event,
    startDate,
    endDate,
    organizerName,
    organizerWebsite,
    latitude,
    longitude,
  }
}
