/**
 * HTTP scraping utilities for the FFTRI calendar.
 *
 * Handles HTTP requests to the FFTRI site with:
 * - URL construction with ligue/month filters
 * - Infinite scroll pagination (limitstart steps of 10)
 * - Human-like delays between requests
 * - Event deduplication across pages (multi-day events)
 */

import axios from 'axios'
import { FFTRIEvent, FFTRIEventDetails, FFTRI_LIGUE_FILTER_KEYS, FFTRI_MONTH_FILTER_KEYS } from './types'
import { parseEventsList, parseEventDetails, countRawBlocks } from './parser'

const PAGE_SIZE = 10

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Build URL for FFTRI listing with ligue and month filters.
 * For infinite scroll pages (limitstart > 0), adds layout=new&limitstart=N.
 */
export function buildListingURL(ligueCode: string, month: number, limitstart: number): string {
  const baseUrl = 'https://fftri.t2area.com/calendrier.html'

  const ligueEntry = FFTRI_LIGUE_FILTER_KEYS.find(l => l.code === ligueCode)
  const monthEntry = FFTRI_MONTH_FILTER_KEYS.find(m => m.month === month)

  if (!ligueEntry) {
    throw new Error(`Unknown ligue code: ${ligueCode}`)
  }
  if (!monthEntry) {
    throw new Error(`Unknown month: ${month}`)
  }

  const params = new URLSearchParams()
  params.append(`filter[${ligueEntry.filterKey}]`, 'on')
  params.append(`filter[${monthEntry.filterKey}]`, 'on')

  if (limitstart > 0) {
    params.append('layout', 'new')
    params.append('limitstart', limitstart.toString())
  }

  return `${baseUrl}?${params.toString()}`
}

/**
 * Fetch one page of events from the FFTRI listing.
 * Returns parsed events and whether there are more pages.
 */
export async function fetchListingPage(
  ligueCode: string,
  month: number,
  limitstart: number,
  referenceYear: number
): Promise<{ events: FFTRIEvent[]; hasMore: boolean }> {
  const url = buildListingURL(ligueCode, month, limitstart)

  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    timeout: 60000,
  })

  const events = parseEventsList(response.data, referenceYear)
  // Use raw block count (before dedup) to determine pagination,
  // since multi-day events produce multiple blocks for the same fftriId
  const rawBlockCount = countRawBlocks(response.data)
  const hasMore = rawBlockCount >= PAGE_SIZE

  return { events, hasMore }
}

/**
 * Paginate through all pages for a given ligue/month combination.
 * Deduplicates events by fftriId (merging dates and races for multi-day events).
 * Sets event.ligue = ligueCode on each event.
 * Calls humanDelay() between pages (not before the first page).
 */
export async function fetchAllEventsForLigueMonth(
  ligueCode: string,
  month: number,
  referenceYear: number,
  humanDelayMs: number = 2000,
  maxPages: number = 50
): Promise<FFTRIEvent[]> {
  const eventsMap = new Map<string, FFTRIEvent>()
  let limitstart = 0
  let pageCount = 0

  while (pageCount < maxPages) {
    if (pageCount > 0) {
      await humanDelay(humanDelayMs)
    }

    const { events, hasMore } = await fetchListingPage(ligueCode, month, limitstart, referenceYear)

    for (const event of events) {
      event.ligue = ligueCode

      if (eventsMap.has(event.fftriId)) {
        const existing = eventsMap.get(event.fftriId)!

        // Merge dates
        for (const date of event.dates) {
          const dateExists = existing.dates.some(d => d.day === date.day && d.month === date.month)
          if (!dateExists) {
            existing.dates.push(date)
          }
        }

        // Merge races
        for (const race of event.races) {
          const raceExists = existing.races.some(r =>
            r.sportType === race.sportType && r.format === race.format && r.raceUrl === race.raceUrl
          )
          if (!raceExists) {
            existing.races.push(race)
          }
        }
      } else {
        eventsMap.set(event.fftriId, event)
      }
    }

    pageCount++

    if (!hasMore) {
      break
    }

    limitstart += PAGE_SIZE
  }

  return Array.from(eventsMap.values())
}

/**
 * Fetch and parse the detail page for a given event.
 * Waits humanDelay(2000) before the request.
 * Returns null on error (logs a warning).
 */
export async function fetchEventDetails(event: FFTRIEvent): Promise<FFTRIEventDetails | null> {
  await humanDelay(2000)

  try {
    const response = await axios.get(event.detailUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 60000,
    })

    return parseEventDetails(response.data, event)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[FFTRI Scraper] Failed to fetch details for ${event.name} (${event.fftriId}): ${message}`)
    return null
  }
}

/**
 * Sleep for ms ± 20% random variation.
 */
export async function humanDelay(ms: number): Promise<void> {
  const variation = ms * 0.2
  const actualDelay = ms + (Math.random() * variation * 2 - variation)
  return new Promise(resolve => setTimeout(resolve, actualDelay))
}

/**
 * Return an array of {year, month} objects for the next N months from now.
 */
export function generateMonthsToScrape(windowMonths: number): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = []
  const now = new Date()

  for (let i = 0; i < windowMonths; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    result.push({ year: date.getFullYear(), month: date.getMonth() + 1 })
  }

  return result
}

/**
 * Format a {year, month} target as "YYYY-MM" string.
 */
export function formatMonthKey(target: { year: number; month: number }): string {
  const month = String(target.month).padStart(2, '0')
  return `${target.year}-${month}`
}
