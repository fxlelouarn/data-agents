/**
 * Regression tests: shared builder vs old FFA builder behavior.
 *
 * The FFA builder was more sophisticated than the Slack one.  These tests
 * verify the shared builder preserves FFA-specific fields (subdivision,
 * calendarStatus, dataSource) while also handling the correct distance-field
 * assignments and the 6h date-tolerance logic.
 */

const { buildNewEventChanges, buildEditionUpdateChanges } = require('../proposal-builder')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFFAInput(overrides = {}) {
  return {
    eventName: 'Trail des Loups',
    eventCity: 'Grenoble',
    eventCountry: 'France',
    eventDepartment: '38',
    countrySubdivisionNameLevel1: 'Auvergne-Rhône-Alpes',
    countrySubdivisionDisplayCodeLevel1: 'ARA',
    countrySubdivisionNameLevel2: 'Isère',
    countrySubdivisionDisplayCodeLevel2: '38',
    editionYear: 2026,
    editionDate: '2026-06-15',
    timeZone: 'Europe/Paris',
    calendarStatus: 'CONFIRMED',
    dataSource: 'FEDERATION',
    races: [],
    organizer: {
      name: 'Grenoble Trail Club',
      email: 'contact@gtc.fr',
      websiteUrl: 'https://traildesloups.fr',
    },
    confidence: 0.9,
    source: 'ffa',
    ...overrides,
  }
}

function makeFFAMatchResult(editionStartDate: Date, overrides = {}) {
  return {
    type: 'FUZZY_MATCH',
    event: { id: 100, name: 'Trail des Loups', city: 'Grenoble' },
    edition: {
      id: 200,
      year: 2026,
      startDate: editionStartDate,
      endDate: null,
      timeZone: 'Europe/Paris',
      calendarStatus: 'CONFIRMED',
      editionPartners: [],
    },
    confidence: 0.9,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Scenario 1 — NEW_EVENT with FFA-specific fields
// ---------------------------------------------------------------------------

describe('Regression FFA — NEW_EVENT with FFA-specific fields', () => {
  const input = makeFFAInput({
    races: [
      {
        name: 'Ultra 80km',
        distance: 80000,
        elevation: 4500,
        startTime: '06:00',
        categoryLevel1: 'TRAIL',
        categoryLevel2: 'ULTRA_TRAIL',
      },
      {
        name: 'Marche nordique 15km',
        distance: 15000,
        startTime: '09:00',
        categoryLevel1: 'WALK',
        categoryLevel2: 'NORDIC_WALK',
      },
    ],
  })

  let changes: any

  beforeAll(() => {
    changes = buildNewEventChanges(input)
  })

  // --- Subdivision fields ---

  it('includes countrySubdivisionNameLevel1', () => {
    expect(changes.countrySubdivisionNameLevel1).toEqual({
      new: 'Auvergne-Rhône-Alpes',
      confidence: 0.9,
    })
  })

  it('includes countrySubdivisionDisplayCodeLevel1', () => {
    expect(changes.countrySubdivisionDisplayCodeLevel1).toEqual({
      new: 'ARA',
      confidence: 0.9,
    })
  })

  it('includes countrySubdivisionNameLevel2', () => {
    expect(changes.countrySubdivisionNameLevel2).toEqual({
      new: 'Isère',
      confidence: 0.9,
    })
  })

  it('includes countrySubdivisionDisplayCodeLevel2', () => {
    expect(changes.countrySubdivisionDisplayCodeLevel2).toEqual({
      new: '38',
      confidence: 0.9,
    })
  })

  // --- Calendar status and data source ---

  it('includes calendarStatus in edition.new', () => {
    expect(changes.edition.new.calendarStatus).toBe('CONFIRMED')
  })

  it('includes dataSource at top level', () => {
    expect(changes.dataSource).toEqual({ new: 'FEDERATION', confidence: 0.9 })
  })

  // --- Race distances ---

  it('ultra trail race uses runDistance (80 km)', () => {
    const ultra = changes.edition.new.races.find((r: any) => r.name === 'Ultra 80km')
    expect(ultra.runDistance).toBe(80)
    expect(ultra.walkDistance).toBeUndefined()
    expect(ultra.bikeDistance).toBeUndefined()
  })

  it('nordic walk race uses walkDistance (15 km)', () => {
    const walk = changes.edition.new.races.find((r: any) => r.name === 'Marche nordique 15km')
    expect(walk.walkDistance).toBe(15)
    expect(walk.runDistance).toBeUndefined()
    expect(walk.bikeDistance).toBeUndefined()
  })

  // --- Organizer ---

  it('organizer name preserved', () => {
    expect(changes.edition.new.organizer.name).toBe('Grenoble Trail Club')
  })

  it('organizer email preserved', () => {
    expect(changes.edition.new.organizer.email).toBe('contact@gtc.fr')
  })

  it('organizer website kept as websiteUrl for non-social URL', () => {
    expect(changes.edition.new.organizer.websiteUrl).toBe('https://traildesloups.fr')
    expect(changes.edition.new.organizer.facebookUrl).toBeUndefined()
    expect(changes.edition.new.organizer.instagramUrl).toBeUndefined()
  })

  // --- Base event fields ---

  it('preserves event name', () => {
    expect(changes.name.new).toBe('Trail des Loups')
  })

  it('preserves event city', () => {
    expect(changes.city.new).toBe('Grenoble')
  })

  it('preserves event country', () => {
    expect(changes.country.new).toBe('France')
  })

  it('preserves edition year as string', () => {
    expect(changes.edition.new.year).toBe('2026')
  })
})

// ---------------------------------------------------------------------------
// Scenario 2 — EDITION_UPDATE: date tolerance logic (FFA already had 6h)
// ---------------------------------------------------------------------------

describe('Regression FFA — EDITION_UPDATE date tolerance', () => {
  const baseInput = makeFFAInput({
    races: [
      {
        name: 'Trail 20km',
        distance: 20000,
        startTime: '08:00',
        categoryLevel1: 'TRAIL',
      },
    ],
  })

  it('no startDate change when diff is exactly 1h (< 6h)', async () => {
    // DB: 07:00 UTC, input: 08:00 Paris (CEST +2 in June) = 06:00 UTC → diff = 1h < 6h
    const matchResult = makeFFAMatchResult(new Date('2026-06-15T07:00:00Z'))
    const changes = await buildEditionUpdateChanges(baseInput, matchResult, [])
    expect(changes.startDate).toBeUndefined()
  })

  it('proposes startDate change when diff is 12h (> 6h)', async () => {
    // DB: 20:00 UTC the day before, input race 08:00 Paris = 06:00 UTC → diff 14h
    const matchResult = makeFFAMatchResult(new Date('2026-06-14T20:00:00Z'))
    const changes = await buildEditionUpdateChanges(baseInput, matchResult, [])
    expect(changes.startDate).toBeDefined()
    expect(changes.startDate.old).toBeInstanceOf(Date)
    expect(changes.startDate.new).toBeInstanceOf(Date)
  })
})

// ---------------------------------------------------------------------------
// Scenario 3 — EDITION_UPDATE: date cascade to unmatched DB races
// ---------------------------------------------------------------------------

describe('Regression FFA — EDITION_UPDATE date cascade to unmatched races', () => {
  // Two DB races:
  //   - race A (id 1): matched to input race → goes in racesToUpdate
  //   - race B (id 2): NOT matched → goes in racesExisting, date gets cascaded
  const dbRaceA = {
    id: 1,
    name: 'Trail 20km',
    // midnight in Paris timezone on 2026-06-15 = 2026-06-14T22:00:00Z
    startDate: new Date('2026-06-14T22:00:00Z'),
    runDistance: 20,
    categoryLevel1: 'TRAIL',
    categoryLevel2: 'SHORT_TRAIL',
    timeZone: 'Europe/Paris',
  }

  const dbRaceB = {
    id: 2,
    name: 'Rando 10km',
    // midnight in Paris timezone on 2026-06-15 = 2026-06-14T22:00:00Z
    startDate: new Date('2026-06-14T22:00:00Z'),
    walkDistance: 10,
    categoryLevel1: 'WALK',
    categoryLevel2: 'HIKING',
    timeZone: 'Europe/Paris',
  }

  // Edition moves from June 15 to June 22 (7 days later → diff > 6h)
  const matchResult = makeFFAMatchResult(new Date('2026-06-15T06:00:00Z'), {
    edition: {
      id: 200,
      year: 2026,
      // existing start is June 15 06:00 UTC
      startDate: new Date('2026-06-15T06:00:00Z'),
      endDate: null,
      timeZone: 'Europe/Paris',
      calendarStatus: 'CONFIRMED',
      editionPartners: [],
    },
  })

  const input = makeFFAInput({
    // New date: June 22 (a week later)
    editionDate: '2026-06-22',
    races: [
      {
        name: 'Trail 20km',
        distance: 20000,
        startTime: '08:00',
        categoryLevel1: 'TRAIL',
      },
    ],
  })

  it('unmatched DB race appears in racesExisting', async () => {
    const preMatched = {
      matched: [{ input: { name: 'Trail 20km', distance: 20 }, db: dbRaceA }],
      unmatched: [],
    }
    const changes = await buildEditionUpdateChanges(input, matchResult, [dbRaceA, dbRaceB], preMatched)
    expect(changes.racesExisting).toBeDefined()
    const existingRaceB = changes.racesExisting.new.find((r: any) => r.raceId === 2)
    expect(existingRaceB).toBeDefined()
  })

  it('racesExisting entry has cascaded date when edition date changed', async () => {
    const preMatched = {
      matched: [{ input: { name: 'Trail 20km', distance: 20 }, db: dbRaceA }],
      unmatched: [],
    }
    const changes = await buildEditionUpdateChanges(input, matchResult, [dbRaceA, dbRaceB], preMatched)

    // Edition moved from June 15 to June 22 → date should be updated
    expect(changes.startDate).toBeDefined()

    const existingRaceB = changes.racesExisting.new.find((r: any) => r.raceId === 2)
    expect(existingRaceB).toBeDefined()
    // The date should now be in June 22, not June 15
    const cascadedDate = new Date(existingRaceB.startDate)
    expect(cascadedDate.getUTCDate()).not.toBe(15) // was June 15
    expect(cascadedDate.getUTCMonth()).toBe(5) // June (0-indexed)
  })

  it('matched DB race does NOT appear in racesExisting', async () => {
    const preMatched = {
      matched: [{ input: { name: 'Trail 20km', distance: 20 }, db: dbRaceA }],
      unmatched: [],
    }
    const changes = await buildEditionUpdateChanges(input, matchResult, [dbRaceA, dbRaceB], preMatched)
    const existingRaceA = changes.racesExisting?.new?.find((r: any) => r.raceId === 1)
    expect(existingRaceA).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 4 — NEW_EVENT: no subdivision fields when not provided
// ---------------------------------------------------------------------------

describe('Regression FFA — NEW_EVENT without subdivision fields', () => {
  it('omits subdivision fields when not in input', () => {
    const input = makeFFAInput({
      countrySubdivisionNameLevel1: undefined,
      countrySubdivisionDisplayCodeLevel1: undefined,
      countrySubdivisionNameLevel2: undefined,
      countrySubdivisionDisplayCodeLevel2: undefined,
    })
    const changes = buildNewEventChanges(input)
    expect(changes.countrySubdivisionNameLevel1).toBeUndefined()
    expect(changes.countrySubdivisionDisplayCodeLevel1).toBeUndefined()
    expect(changes.countrySubdivisionNameLevel2).toBeUndefined()
    expect(changes.countrySubdivisionDisplayCodeLevel2).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 5 — EDITION_UPDATE: timezone change proposed when different
// ---------------------------------------------------------------------------

describe('Regression FFA — EDITION_UPDATE timezone change', () => {
  it('proposes timezone change when edition has a different timezone', async () => {
    const matchResult = makeFFAMatchResult(new Date('2026-06-15T08:00:00Z'), {
      edition: {
        id: 200,
        year: 2026,
        startDate: new Date('2026-06-15T08:00:00Z'),
        endDate: null,
        timeZone: 'America/Martinique',
        calendarStatus: 'CONFIRMED',
        editionPartners: [],
      },
    })
    const input = makeFFAInput({
      timeZone: 'Europe/Paris',
      races: [
        { name: 'Trail 20km', distance: 20000, startTime: '09:00', categoryLevel1: 'TRAIL' },
      ],
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.timeZone).toBeDefined()
    expect(changes.timeZone.old).toBe('America/Martinique')
    expect(changes.timeZone.new).toBe('Europe/Paris')
  })

  it('does not propose timezone change when timezone is the same', async () => {
    const matchResult = makeFFAMatchResult(new Date('2026-06-15T08:00:00Z'))
    const input = makeFFAInput({
      timeZone: 'Europe/Paris',
      races: [
        { name: 'Trail 20km', distance: 20000, startTime: '09:00', categoryLevel1: 'TRAIL' },
      ],
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.timeZone).toBeUndefined()
  })
})
