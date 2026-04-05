/**
 * Tests for the FFTRI HTML parser.
 */

import { parseEventsList, parseEventDetails, deriveDepartment, calculateDateRange } from '../parser'
import { FFTRIEvent } from '../types'

// ============================================================================
// Fixtures
// ============================================================================

// Single event with 2 races — as provided in the task spec
const SINGLE_EVENT_FIXTURE = `
<a id="blocEvent_3452" class="blocEvent d-flex align-items-center justify-content-between orga js-filter__item" target="_self" href="https://fftri.t2area.com/calendrier/triathlon-du-dauphine.html">
  <div class="d-flex align-items-center flex-wrap flex-md-nowrap flex-grow-1 justify-content-between">
    <div class="datesEvent d-flex align-items-center flex-row">
      <div class="dateEvent d-flex align-items-center flex-column">
        <div class="jourLibEvent">dim.</div>
        <div class="jourEvent">3</div>
        <div class="moisEvent">mai</div>
      </div>
    </div>
    <div class="d-flex flex-grow-1 flex-column px-2">
      <div class="nomEvent">Triathlon du Dauphiné (26)</div>
      <div class="lieuEvent">
        <span class="countryFlag"></span>
        <span>26260 ST DONAT SUR L'HERBASSE&nbsp;</span>
      </div>
    </div>
    <div class="distancesEvent justify-content-end d-flex flex-wrap px-1 pt-1 me-2">
      <div class="distBlocEvent youth me-1 mb-1 d-flex align-items-center justify-content-center flex-column" style="cursor:pointer; " onclick="window.location.href='https://fftri.t2area.com/calendrier/triathlon-du-dauphine/cross-duathlon-jeunes-1.html'">
        <div class="sportEvent">X-DUA</div>
        <div class="distEvent">JEUNES-1</div>
        <div class="kmEvent">&nbsp;</div>
      </div>
      <div class="distBlocEvent national me-1 mb-1 d-flex align-items-center justify-content-center flex-column" style="cursor:pointer; " onclick="window.location.href='https://fftri.t2area.com/calendrier/triathlon-du-dauphine/triathlon-xs-open.html'">
        <div class="sportEvent">TRI</div>
        <div class="distEvent">XS-OP</div>
        <div class="kmEvent">&nbsp;</div>
      </div>
    </div>
  </div>
</a>
`

// Multi-day event: same blocEvent_XXXX appearing twice with different dates
const MULTI_DAY_FIRST_OCCURRENCE = `
<a id="blocEvent_13161" class="blocEvent d-flex align-items-center justify-content-between orga js-filter__item" target="_self" href="https://fftri.t2area.com/calendrier/lxttraid-grand-sancy.html">
  <div class="d-flex align-items-center flex-wrap flex-md-nowrap flex-grow-1 justify-content-between">
    <div class="datesEvent d-flex align-items-center flex-row">
      <div class="dateEvent d-flex align-items-center flex-column">
        <div class="jourLibEvent">ven.</div>
        <div class="jourEvent">8</div>
        <div class="moisEvent">mai</div>
      </div>
    </div>
    <div class="d-flex flex-grow-1 flex-column px-2">
      <div class="nomEvent">L'Xttraid Grand Sancy (63)</div>
      <div class="lieuEvent">
        <span class="countryFlag"></span>
        <span>63680 LA TOUR-D'AUVERGNE&nbsp;</span>
      </div>
    </div>
    <div class="distancesEvent justify-content-end d-flex flex-wrap px-1 pt-1 me-2">
      <div class="distBlocEvent national me-1 mb-1 d-flex align-items-center justify-content-center flex-column" style="cursor:pointer;" onclick="window.location.href='https://fftri.t2area.com/calendrier/lxttraid-grand-sancy/raids-l-eq.html'">
        <div class="sportEvent">RAID</div>
        <div class="distEvent">L-EQ</div>
        <div class="kmEvent">&nbsp;</div>
      </div>
    </div>
  </div>
</a>
`

const MULTI_DAY_SECOND_OCCURRENCE = `
<a id="blocEvent_13161" class="blocEvent d-flex align-items-center justify-content-between orga js-filter__item" target="_self" href="https://fftri.t2area.com/calendrier/lxttraid-grand-sancy.html">
  <div class="d-flex align-items-center flex-wrap flex-md-nowrap flex-grow-1 justify-content-between">
    <div class="datesEvent d-flex align-items-center flex-row">
      <div class="dateEvent d-flex align-items-center flex-column">
        <div class="jourLibEvent">sam.</div>
        <div class="jourEvent">9</div>
        <div class="moisEvent">mai</div>
      </div>
    </div>
    <div class="d-flex flex-grow-1 flex-column px-2">
      <div class="nomEvent">L'Xttraid Grand Sancy (63)</div>
      <div class="lieuEvent">
        <span class="countryFlag"></span>
        <span>63680 LA TOUR-D'AUVERGNE&nbsp;</span>
      </div>
    </div>
    <div class="distancesEvent justify-content-end d-flex flex-wrap px-1 pt-1 me-2">
      <div class="distBlocEvent national me-1 mb-1 d-flex align-items-center justify-content-center flex-column" style="cursor:pointer;" onclick="window.location.href='https://fftri.t2area.com/calendrier/lxttraid-grand-sancy/raids-l-eq.html'">
        <div class="sportEvent">RAID</div>
        <div class="distEvent">L-EQ</div>
        <div class="kmEvent">&nbsp;</div>
      </div>
    </div>
  </div>
</a>
`

// Detail page fixture with JSON-LD
const DETAIL_PAGE_FIXTURE = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": "Triathlon du Dauphiné",
    "organizer": {
      "@type": "Organization",
      "name": "Club Triathlon Dauphiné",
      "url": "https://www.triathlondauphine.fr"
    },
    "location": {
      "@type": "Place",
      "name": "Saint-Donat-sur-l'Herbasse",
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "45.1234",
        "longitude": "4.9876"
      }
    }
  }
  </script>
</head>
<body>
  <h1>Triathlon du Dauphiné</h1>
</body>
</html>
`

// ============================================================================
// Tests
// ============================================================================

describe('parseEventsList', () => {
  it('parses a single event with 2 races and all fields correctly', () => {
    const events = parseEventsList(SINGLE_EVENT_FIXTURE, 2026)

    expect(events).toHaveLength(1)

    const event = events[0]
    expect(event.fftriId).toBe('3452')
    expect(event.name).toBe('Triathlon du Dauphiné (26)')
    expect(event.city).toBe("ST DONAT SUR L'HERBASSE")
    expect(event.postalCode).toBe('26260')
    expect(event.department).toBe('26')
    expect(event.ligue).toBe('')  // set by scraper later
    expect(event.detailUrl).toBe('https://fftri.t2area.com/calendrier/triathlon-du-dauphine.html')

    // Date
    expect(event.dates).toHaveLength(1)
    expect(event.dates[0]).toEqual({ dayOfWeek: 'dim.', day: 3, month: 'mai' })

    // Races
    expect(event.races).toHaveLength(2)
    expect(event.races[0]).toEqual({
      sportType: 'X-DUA',
      format: 'JEUNES-1',
      category: 'youth',
      raceUrl: 'https://fftri.t2area.com/calendrier/triathlon-du-dauphine/cross-duathlon-jeunes-1.html',
    })
    expect(event.races[1]).toEqual({
      sportType: 'TRI',
      format: 'XS-OP',
      category: 'national',
      raceUrl: 'https://fftri.t2area.com/calendrier/triathlon-du-dauphine/triathlon-xs-open.html',
    })
  })

  it('deduplicates multi-day events (same blocEvent_XXXX with different dates)', () => {
    const combinedHtml = MULTI_DAY_FIRST_OCCURRENCE + MULTI_DAY_SECOND_OCCURRENCE
    const events = parseEventsList(combinedHtml, 2026)

    // Should be deduplicated into a single event
    expect(events).toHaveLength(1)

    const event = events[0]
    expect(event.fftriId).toBe('13161')
    expect(event.name).toBe("L'Xttraid Grand Sancy (63)")

    // Both dates should be merged
    expect(event.dates).toHaveLength(2)
    expect(event.dates[0]).toEqual({ dayOfWeek: 'ven.', day: 8, month: 'mai' })
    expect(event.dates[1]).toEqual({ dayOfWeek: 'sam.', day: 9, month: 'mai' })

    // Duplicate races should not be added twice
    expect(event.races).toHaveLength(1)
    expect(event.races[0].sportType).toBe('RAID')
  })

  it('returns empty array for empty HTML', () => {
    const events = parseEventsList('<html><body></body></html>', 2026)
    expect(events).toHaveLength(0)
  })
})

describe('deriveDepartment', () => {
  it('returns first 2 digits for metropolitan France', () => {
    expect(deriveDepartment('26260')).toBe('26')
    expect(deriveDepartment('75001')).toBe('75')
    expect(deriveDepartment('63680')).toBe('63')
    expect(deriveDepartment('01000')).toBe('01')
  })

  it('returns 3-digit code for DOM-TOM (97x)', () => {
    expect(deriveDepartment('97100')).toBe('971')
    expect(deriveDepartment('97200')).toBe('972')
    expect(deriveDepartment('97400')).toBe('974')
  })

  it('returns 3-digit code for DOM-TOM (98x)', () => {
    expect(deriveDepartment('98000')).toBe('980')
  })

  it('returns 2B for Corsica postal codes >= 20200', () => {
    expect(deriveDepartment('20200')).toBe('2B')
    expect(deriveDepartment('20600')).toBe('2B')
  })

  it('returns 2A for Corsica postal codes < 20200', () => {
    expect(deriveDepartment('20000')).toBe('2A')
    expect(deriveDepartment('20100')).toBe('2A')
  })

  it('returns empty string for missing postal code', () => {
    expect(deriveDepartment('')).toBe('')
    expect(deriveDepartment('1')).toBe('')
  })
})

describe('calculateDateRange', () => {
  it('returns the same date for a single-day event', () => {
    const dates = [{ dayOfWeek: 'dim.', day: 3, month: 'mai' }]
    const { startDate, endDate } = calculateDateRange(dates, 2026)

    expect(startDate).toEqual(new Date(2026, 4, 3))  // month 4 = mai (0-indexed)
    expect(endDate).toEqual(new Date(2026, 4, 3))
  })

  it('returns first and last date for multi-day events', () => {
    const dates = [
      { dayOfWeek: 'ven.', day: 8, month: 'mai' },
      { dayOfWeek: 'sam.', day: 9, month: 'mai' },
    ]
    const { startDate, endDate } = calculateDateRange(dates, 2026)

    expect(startDate).toEqual(new Date(2026, 4, 8))
    expect(endDate).toEqual(new Date(2026, 4, 9))
  })

  it('sorts dates correctly regardless of insertion order', () => {
    const dates = [
      { dayOfWeek: 'dim.', day: 10, month: 'mai' },
      { dayOfWeek: 'ven.', day: 8, month: 'mai' },
    ]
    const { startDate, endDate } = calculateDateRange(dates, 2026)

    expect(startDate).toEqual(new Date(2026, 4, 8))
    expect(endDate).toEqual(new Date(2026, 4, 10))
  })

  it('handles abbreviated month names', () => {
    const dates = [{ dayOfWeek: 'sam.', day: 15, month: 'nov.' }]
    const { startDate, endDate } = calculateDateRange(dates, 2026)

    expect(startDate).toEqual(new Date(2026, 10, 15))  // month 10 = novembre
    expect(endDate).toEqual(new Date(2026, 10, 15))
  })
})

describe('parseEventDetails', () => {
  const mockEvent: FFTRIEvent = {
    fftriId: '3452',
    name: 'Triathlon du Dauphiné (26)',
    dates: [{ dayOfWeek: 'dim.', day: 3, month: 'mai' }],
    city: "ST DONAT SUR L'HERBASSE",
    postalCode: '26260',
    department: '26',
    ligue: 'ARA',
    detailUrl: 'https://fftri.t2area.com/calendrier/triathlon-du-dauphine.html',
    races: [],
  }

  it('extracts organizer name and website from JSON-LD', () => {
    const details = parseEventDetails(DETAIL_PAGE_FIXTURE, mockEvent)

    expect(details.organizerName).toBe('Club Triathlon Dauphiné')
    expect(details.organizerWebsite).toBe('https://www.triathlondauphine.fr')
  })

  it('extracts GPS coordinates from JSON-LD', () => {
    const details = parseEventDetails(DETAIL_PAGE_FIXTURE, mockEvent)

    expect(details.latitude).toBeCloseTo(45.1234)
    expect(details.longitude).toBeCloseTo(4.9876)
  })

  it('returns the event reference', () => {
    const details = parseEventDetails(DETAIL_PAGE_FIXTURE, mockEvent)
    expect(details.event).toBe(mockEvent)
  })

  it('returns undefined for missing organizer info', () => {
    const html = '<html><body><h1>No JSON-LD here</h1></body></html>'
    const details = parseEventDetails(html, mockEvent)

    expect(details.organizerName).toBeUndefined()
    expect(details.organizerWebsite).toBeUndefined()
    expect(details.latitude).toBeUndefined()
    expect(details.longitude).toBeUndefined()
  })

  it('computes startDate and endDate from event dates', () => {
    const details = parseEventDetails(DETAIL_PAGE_FIXTURE, mockEvent)
    const currentYear = new Date().getFullYear()

    expect(details.startDate).toEqual(new Date(currentYear, 4, 3))  // mai = month 4
    expect(details.endDate).toEqual(new Date(currentYear, 4, 3))
  })
})
