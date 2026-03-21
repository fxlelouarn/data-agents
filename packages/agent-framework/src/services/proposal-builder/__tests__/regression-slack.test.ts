/**
 * Regression tests: shared builder vs old Slack builder behavior.
 *
 * For each scenario we compare the new shared builder output against what the
 * old SlackProposalService would have produced (reconstructed from reading its
 * source).  Differences that are IMPROVEMENTS are explicitly labelled.
 *
 * Old Slack builder quirks (now fixed in the shared builder):
 *   - Always used `runDistance` for every race category (walk and cycling too)
 *   - Always used `websiteUrl` for organizer URLs (no facebook/instagram detection)
 *   - Date comparison: always proposed a change (no 6h tolerance)
 */

const { buildNewEventChanges, buildEditionUpdateChanges } = require('../proposal-builder')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlackNewEventInput(overrides = {}) {
  return {
    eventName: 'Trail des Vignes',
    eventCity: 'Beaune',
    eventCountry: 'France',
    eventDepartment: '21',
    editionYear: 2026,
    editionDate: '2026-09-20',
    timeZone: 'Europe/Paris',
    races: [],
    confidence: 0.85,
    source: 'slack',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Scenario 1 — NEW_EVENT with mixed race types (trail + walk + cycling)
// ---------------------------------------------------------------------------

describe('Regression Slack — NEW_EVENT mixed race types', () => {
  const input = makeSlackNewEventInput({
    races: [
      {
        name: 'Trail 30km',
        distance: 30000,
        elevation: 1200,
        startTime: '08:00',
        categoryLevel1: 'TRAIL',
        categoryLevel2: 'LONG_TRAIL',
      },
      {
        name: 'Marche 10km',
        distance: 10000,
        startTime: '09:00',
        categoryLevel1: 'WALK',
        categoryLevel2: 'HIKING',
      },
      {
        name: 'VTT 40km',
        distance: 40000,
        startTime: '07:30',
        categoryLevel1: 'CYCLING',
        categoryLevel2: 'XC_MOUNTAIN_BIKE',
      },
    ],
    organizer: {
      name: 'AS Beaune Trail',
      websiteUrl: 'https://facebook.com/traildesvignes',
    },
  })

  let changes: any

  beforeAll(() => {
    changes = buildNewEventChanges(input)
  })

  // --- Preserved behavior ---

  it('preserves event name', () => {
    expect(changes.name).toEqual({ new: 'Trail des Vignes', confidence: 0.85 })
  })

  it('preserves event city', () => {
    expect(changes.city).toEqual({ new: 'Beaune', confidence: 0.85 })
  })

  it('preserves event country', () => {
    expect(changes.country).toEqual({ new: 'France', confidence: 0.85 })
  })

  it('preserves edition year as string', () => {
    expect(changes.edition.new.year).toBe('2026')
  })

  it('preserves timezone in edition.new', () => {
    expect(changes.edition.new.timeZone).toBe('Europe/Paris')
  })

  it('has exactly 3 races', () => {
    expect(changes.edition.new.races).toHaveLength(3)
  })

  it('preserves race names', () => {
    const raceNames = changes.edition.new.races.map((r: any) => r.name)
    expect(raceNames).toContain('Trail 30km')
    expect(raceNames).toContain('Marche 10km')
    expect(raceNames).toContain('VTT 40km')
  })

  it('preserves trail race runDistance (30 km)', () => {
    const trail = changes.edition.new.races.find((r: any) => r.name === 'Trail 30km')
    expect(trail.runDistance).toBe(30)
  })

  it('preserves organizer name', () => {
    expect(changes.edition.new.organizer.name).toBe('AS Beaune Trail')
  })

  // --- Improvements over old Slack builder ---

  it('IMPROVEMENT: walk race uses walkDistance (old builder used runDistance)', () => {
    const walk = changes.edition.new.races.find((r: any) => r.name === 'Marche 10km')
    expect(walk.walkDistance).toBe(10)
    // Old behavior: runDistance: 10
    expect(walk.runDistance).toBeUndefined()
  })

  it('IMPROVEMENT: cycling race uses bikeDistance (old builder used runDistance)', () => {
    const vtt = changes.edition.new.races.find((r: any) => r.name === 'VTT 40km')
    expect(vtt.bikeDistance).toBe(40)
    // Old behavior: runDistance: 40
    expect(vtt.runDistance).toBeUndefined()
  })

  it('IMPROVEMENT: facebook URL classified as facebookUrl (old builder used websiteUrl)', () => {
    expect(changes.edition.new.organizer.facebookUrl).toBe('https://facebook.com/traildesvignes')
    // Old behavior: websiteUrl: 'https://facebook.com/traildesvignes'
    expect(changes.edition.new.organizer.websiteUrl).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 2 — NEW_EVENT with organizer data (all fields, real website)
// ---------------------------------------------------------------------------

describe('Regression Slack — NEW_EVENT organizer with real website', () => {
  const input = makeSlackNewEventInput({
    eventName: 'Course Simple',
    eventCity: 'Lyon',
    eventCountry: 'France',
    editionDate: '2026-05-01',
    timeZone: 'Europe/Paris',
    races: [
      {
        name: '10km',
        distance: 10000,
        startTime: '10:00',
        categoryLevel1: 'RUNNING',
        categoryLevel2: 'KM10',
      },
    ],
    organizer: {
      name: 'Lyon Running',
      email: 'contact@lr.fr',
      phone: '0612345678',
      websiteUrl: 'https://lyon-running.fr',
    },
    confidence: 0.9,
  })

  let changes: any

  beforeAll(() => {
    changes = buildNewEventChanges(input)
  })

  it('preserves organizer name', () => {
    expect(changes.edition.new.organizer.name).toBe('Lyon Running')
  })

  it('preserves organizer email', () => {
    expect(changes.edition.new.organizer.email).toBe('contact@lr.fr')
  })

  it('preserves organizer phone', () => {
    expect(changes.edition.new.organizer.phone).toBe('0612345678')
  })

  it('keeps websiteUrl as websiteUrl for non-social URLs', () => {
    expect(changes.edition.new.organizer.websiteUrl).toBe('https://lyon-running.fr')
    // Not misclassified as facebook or instagram
    expect(changes.edition.new.organizer.facebookUrl).toBeUndefined()
    expect(changes.edition.new.organizer.instagramUrl).toBeUndefined()
  })

  it('running race uses runDistance', () => {
    const race = changes.edition.new.races[0]
    expect(race.runDistance).toBe(10)
    expect(race.walkDistance).toBeUndefined()
    expect(race.bikeDistance).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 3 — EDITION_UPDATE: empty existing races → racesToAdd
// ---------------------------------------------------------------------------

describe('Regression Slack — EDITION_UPDATE empty existing races', () => {
  const input = makeSlackNewEventInput({
    eventName: 'Trail Test',
    editionDate: '2026-06-15',
    timeZone: 'Europe/Paris',
    races: [
      {
        name: 'Trail 20km',
        distance: 20000,
        startTime: '09:00',
        categoryLevel1: 'TRAIL',
      },
    ],
    confidence: 0.9,
  })

  const matchResult = {
    type: 'FUZZY_MATCH',
    event: { id: 123, name: 'Trail Test', city: 'Test' },
    edition: { id: 456, year: 2026, startDate: new Date('2026-06-14T22:00:00Z') },
    confidence: 0.9,
  }

  it('trail race with no existing races → racesToAdd with runDistance', async () => {
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.racesToAdd).toBeDefined()
    const trailRace = changes.racesToAdd.new.find((r: any) => r.name === 'Trail 20km')
    expect(trailRace).toBeDefined()
    expect(trailRace.runDistance).toBe(20)
    expect(trailRace.walkDistance).toBeUndefined()
    expect(trailRace.bikeDistance).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 4 — EDITION_UPDATE: race matching against existing DB race
// ---------------------------------------------------------------------------

describe('Regression Slack — EDITION_UPDATE with matching existing race', () => {
  const input = makeSlackNewEventInput({
    eventName: 'Trail Test',
    editionDate: '2026-06-15',
    timeZone: 'Europe/Paris',
    races: [
      {
        name: 'Trail 20km',
        distance: 20000,
        startTime: '09:00',
        categoryLevel1: 'TRAIL',
      },
    ],
    confidence: 0.9,
  })

  const matchResult = {
    type: 'FUZZY_MATCH',
    event: { id: 123, name: 'Trail Test', city: 'Test' },
    edition: { id: 456, year: 2026, startDate: new Date('2026-06-14T22:00:00Z') },
    confidence: 0.9,
  }

  const dbRace = {
    id: 999,
    name: 'Trail 20km',
    startDate: new Date('2026-06-15T00:00:00Z'), // midnight — no precise time
    runDistance: 20,
    categoryLevel1: 'TRAIL',
    categoryLevel2: 'SHORT_TRAIL',
    timeZone: 'Europe/Paris',
  }

  it('matched DB race appears in racesToUpdate', async () => {
    const preMatched = {
      matched: [{ input: { name: 'Trail 20km', distance: 20 }, db: dbRace }],
      unmatched: [],
    }
    const changes = await buildEditionUpdateChanges(input, matchResult, [dbRace], preMatched)
    expect(changes.racesToUpdate).toBeDefined()
    expect(changes.racesToUpdate.new[0].raceId).toBe(999)
  })

  it('no racesToAdd when all input races are matched', async () => {
    const preMatched = {
      matched: [{ input: { name: 'Trail 20km', distance: 20 }, db: dbRace }],
      unmatched: [],
    }
    const changes = await buildEditionUpdateChanges(input, matchResult, [dbRace], preMatched)
    expect(changes.racesToAdd).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 5 — IMPROVEMENT: 6h date tolerance (old Slack builder had none)
// ---------------------------------------------------------------------------

describe('Regression Slack — EDITION_UPDATE date 6h tolerance (improvement)', () => {
  const matchResult = {
    type: 'FUZZY_MATCH',
    event: { id: 1, name: 'Event', city: 'Ville' },
    edition: {
      id: 10,
      year: 2026,
      // 08:00 UTC
      startDate: new Date('2026-06-15T08:00:00Z'),
      endDate: null,
      timeZone: 'Europe/Paris',
      calendarStatus: 'CONFIRMED',
      editionPartners: [],
    },
    confidence: 0.9,
  }

  it('IMPROVEMENT: no startDate change when diff < 6h (old builder always proposed change)', async () => {
    // 09:00 Paris in June = 07:00 UTC → diff from 08:00 UTC = 1h < 6h → no change
    const input = makeSlackNewEventInput({
      editionDate: '2026-06-15',
      timeZone: 'Europe/Paris',
      races: [{ name: 'Trail 10km', distance: 10000, startTime: '09:00', categoryLevel1: 'TRAIL' }],
      confidence: 0.9,
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    // Old Slack builder: always proposed startDate change (no tolerance)
    // New shared builder: 6h tolerance → no change for 1h diff
    expect(changes.startDate).toBeUndefined()
  })

  it('proposes startDate change when diff > 6h', async () => {
    // 21:00 Paris in June = 19:00 UTC → diff from 08:00 UTC = 11h > 6h → change
    const input = makeSlackNewEventInput({
      editionDate: '2026-06-15',
      timeZone: 'Europe/Paris',
      races: [{ name: 'Night trail', distance: 15000, startTime: '21:00', categoryLevel1: 'TRAIL' }],
      confidence: 0.9,
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.startDate).toBeDefined()
  })
})
