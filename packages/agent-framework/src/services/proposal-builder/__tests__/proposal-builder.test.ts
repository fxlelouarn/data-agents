/**
 * Tests for the shared proposal builder functions:
 * - buildNewEventChanges
 * - buildEditionUpdateChanges
 */

const { buildNewEventChanges, buildEditionUpdateChanges } = require('../proposal-builder')

// ---------------------------------------------------------------------------
// Minimal valid input helpers
// ---------------------------------------------------------------------------

function makeInput(overrides) {
  return {
    eventName: 'Trail des Cimes',
    eventCity: 'Chamonix',
    eventCountry: 'France',
    editionDate: '2025-06-15',
    timeZone: 'Europe/Paris',
    confidence: 0.9,
    source: 'test',
    races: [],
    ...overrides,
  }
}

function makeMatchResult(overrides) {
  return {
    edition: {
      id: '42',
      startDate: new Date('2025-06-15T08:00:00.000Z'),
      endDate: new Date('2025-06-15T12:00:00.000Z'),
      timeZone: 'Europe/Paris',
      calendarStatus: 'CONFIRMED',
      editionPartners: [],
    },
    event: { id: '10', name: 'Trail des Cimes' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// buildNewEventChanges
// ---------------------------------------------------------------------------

describe('buildNewEventChanges', () => {
  it('includes name, city, country at top level with confidence', () => {
    const changes = buildNewEventChanges(makeInput({}))
    expect(changes.name).toEqual({ new: 'Trail des Cimes', confidence: 0.9 })
    expect(changes.city).toEqual({ new: 'Chamonix', confidence: 0.9 })
    expect(changes.country).toEqual({ new: 'France', confidence: 0.9 })
  })

  it('defaults country to France when not provided', () => {
    const changes = buildNewEventChanges(makeInput({ eventCountry: undefined }))
    expect(changes.country.new).toBe('France')
  })

  it('uses provided country when set', () => {
    const changes = buildNewEventChanges(makeInput({ eventCountry: 'Switzerland' }))
    expect(changes.country.new).toBe('Switzerland')
  })

  it('includes subdivision fields when provided', () => {
    const changes = buildNewEventChanges(
      makeInput({
        countrySubdivisionNameLevel1: 'Auvergne-Rhône-Alpes',
        countrySubdivisionDisplayCodeLevel1: 'ARA',
        countrySubdivisionNameLevel2: 'Haute-Savoie',
        countrySubdivisionDisplayCodeLevel2: '74',
      })
    )
    expect(changes.countrySubdivisionNameLevel1).toEqual({
      new: 'Auvergne-Rhône-Alpes',
      confidence: 0.9,
    })
    expect(changes.countrySubdivisionDisplayCodeLevel1).toEqual({
      new: 'ARA',
      confidence: 0.9,
    })
    expect(changes.countrySubdivisionNameLevel2).toEqual({
      new: 'Haute-Savoie',
      confidence: 0.9,
    })
    expect(changes.countrySubdivisionDisplayCodeLevel2).toEqual({
      new: '74',
      confidence: 0.9,
    })
  })

  it('omits subdivision fields when not provided', () => {
    const changes = buildNewEventChanges(makeInput({}))
    expect(changes.countrySubdivisionNameLevel1).toBeUndefined()
    expect(changes.countrySubdivisionDisplayCodeLevel1).toBeUndefined()
  })

  it('includes dataSource when provided', () => {
    const changes = buildNewEventChanges(makeInput({ dataSource: 'FEDERATION' }))
    expect(changes.dataSource).toEqual({ new: 'FEDERATION', confidence: 0.9 })
  })

  it('omits dataSource when not provided', () => {
    const changes = buildNewEventChanges(makeInput({}))
    expect(changes.dataSource).toBeUndefined()
  })

  it('puts editions under edition.new', () => {
    const changes = buildNewEventChanges(makeInput({}))
    expect(changes.edition).toBeDefined()
    expect(changes.edition.confidence).toBe(0.9)
    expect(changes.edition.new).toBeDefined()
    expect(changes.edition.new.timeZone).toBe('Europe/Paris')
  })

  it('assigns walkDistance for WALK races', () => {
    const changes = buildNewEventChanges(
      makeInput({
        races: [{ name: 'Rando 10km', distance: 10000, categoryLevel1: 'WALK' }],
      })
    )
    const race = changes.edition.new.races[0]
    expect(race.walkDistance).toBe(10)
    expect(race.runDistance).toBeUndefined()
    expect(race.bikeDistance).toBeUndefined()
  })

  it('assigns bikeDistance for CYCLING races', () => {
    const changes = buildNewEventChanges(
      makeInput({
        races: [{ name: 'Vélo 40km', distance: 40000, categoryLevel1: 'CYCLING' }],
      })
    )
    const race = changes.edition.new.races[0]
    expect(race.bikeDistance).toBe(40)
    expect(race.runDistance).toBeUndefined()
  })

  it('assigns runDistance for RUNNING races', () => {
    const changes = buildNewEventChanges(
      makeInput({
        races: [{ name: 'Marathon', distance: 42195, categoryLevel1: 'RUNNING', categoryLevel2: 'MARATHON' }],
      })
    )
    const race = changes.edition.new.races[0]
    expect(race.runDistance).toBeCloseTo(42.195, 2)
  })

  it('assigns runDistance for TRAIL races', () => {
    const changes = buildNewEventChanges(
      makeInput({
        races: [{ name: 'Trail 25km', distance: 25000, categoryLevel1: 'TRAIL', categoryLevel2: 'SHORT_TRAIL' }],
      })
    )
    const race = changes.edition.new.races[0]
    expect(race.runDistance).toBe(25)
  })

  it('handles mixed race types in the same event', () => {
    const changes = buildNewEventChanges(
      makeInput({
        races: [
          { name: 'Rando 12km', distance: 12000, categoryLevel1: 'WALK' },
          { name: 'Trail 20km', distance: 20000, categoryLevel1: 'TRAIL' },
          { name: 'Vélo 30km', distance: 30000, categoryLevel1: 'CYCLING' },
        ],
      })
    )
    const races = changes.edition.new.races
    expect(races[0].walkDistance).toBe(12)
    expect(races[0].runDistance).toBeUndefined()
    expect(races[1].runDistance).toBe(20)
    expect(races[1].walkDistance).toBeUndefined()
    expect(races[2].bikeDistance).toBe(30)
    expect(races[2].runDistance).toBeUndefined()
  })

  it('includes organizer in edition.new when provided', () => {
    const changes = buildNewEventChanges(
      makeInput({
        organizer: {
          name: 'Club Alpin',
          email: 'contact@club.fr',
          phone: '0600000000',
        },
      })
    )
    expect(changes.edition.new.organizer).toBeDefined()
    expect(changes.edition.new.organizer.name).toBe('Club Alpin')
    expect(changes.edition.new.organizer.email).toBe('contact@club.fr')
  })

  it('classifies facebook URL for organizer', () => {
    const changes = buildNewEventChanges(
      makeInput({
        organizer: {
          name: 'Orga',
          websiteUrl: 'https://www.facebook.com/monorga',
        },
      })
    )
    expect(changes.edition.new.organizer.facebookUrl).toBe('https://www.facebook.com/monorga')
    expect(changes.edition.new.organizer.websiteUrl).toBeUndefined()
  })

  it('classifies instagram URL for organizer', () => {
    const changes = buildNewEventChanges(
      makeInput({
        organizer: {
          name: 'Orga',
          websiteUrl: 'https://www.instagram.com/monorga',
        },
      })
    )
    expect(changes.edition.new.organizer.instagramUrl).toBe('https://www.instagram.com/monorga')
    expect(changes.edition.new.organizer.websiteUrl).toBeUndefined()
  })

  it('includes calendarStatus in edition.new when provided', () => {
    const changes = buildNewEventChanges(makeInput({ calendarStatus: 'CONFIRMED' }))
    expect(changes.edition.new.calendarStatus).toBe('CONFIRMED')
  })

  it('includes registrationUrl in edition.new when provided', () => {
    const changes = buildNewEventChanges(makeInput({ registrationUrl: 'https://inscription.fr' }))
    expect(changes.edition.new.registrationUrl).toBe('https://inscription.fr')
  })

  it('sets edition year from editionDate when editionYear not provided', () => {
    const changes = buildNewEventChanges(makeInput({ editionDate: '2025-06-15' }))
    expect(changes.edition.new.year).toBe('2025')
  })

  it('sets edition year from editionYear when provided', () => {
    const changes = buildNewEventChanges(makeInput({ editionYear: 2026, editionDate: '2026-06-15' }))
    expect(changes.edition.new.year).toBe('2026')
  })

  it('includes startDate and endDate in edition.new', () => {
    const changes = buildNewEventChanges(
      makeInput({
        editionDate: '2025-06-15',
        races: [{ name: 'Trail 10km', distance: 10000, startTime: '09:00', categoryLevel1: 'TRAIL' }],
      })
    )
    expect(changes.edition.new.startDate).toBeInstanceOf(Date)
    expect(changes.edition.new.endDate).toBeInstanceOf(Date)
  })
})

// ---------------------------------------------------------------------------
// buildEditionUpdateChanges
// ---------------------------------------------------------------------------

describe('buildEditionUpdateChanges', () => {
  it('proposes no startDate change when diff is < 6h', async () => {
    // Existing start: 2025-06-15T08:00 UTC, new would be ~same day
    const matchResult = makeMatchResult({
      edition: {
        id: '42',
        startDate: new Date('2025-06-15T08:00:00.000Z'),
        endDate: new Date('2025-06-15T12:00:00.000Z'),
        timeZone: 'Europe/Paris',
        calendarStatus: 'CONFIRMED',
        editionPartners: [],
      },
    })
    const input = makeInput({
      editionDate: '2025-06-15',
      timeZone: 'Europe/Paris',
      races: [{ name: 'Trail 10km', distance: 10000, startTime: '09:00', categoryLevel1: 'TRAIL' }],
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    // 09:00 Paris = 07:00 UTC (CEST offset +2 in June) — diff from 08:00 UTC = 1h < 6h
    expect(changes.startDate).toBeUndefined()
  })

  it('proposes startDate change when diff is > 6h', async () => {
    // Existing start: 2025-06-15T08:00 UTC; new races start at 21:00 Paris = 19:00 UTC → diff 11h
    const matchResult = makeMatchResult({
      edition: {
        id: '42',
        startDate: new Date('2025-06-15T08:00:00.000Z'),
        endDate: null,
        timeZone: 'Europe/Paris',
        calendarStatus: 'CONFIRMED',
        editionPartners: [],
      },
    })
    const input = makeInput({
      editionDate: '2025-06-15',
      timeZone: 'Europe/Paris',
      races: [{ name: 'Night trail', distance: 15000, startTime: '21:00', categoryLevel1: 'TRAIL' }],
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.startDate).toBeDefined()
    expect(changes.startDate.old).toBeInstanceOf(Date)
    expect(changes.startDate.new).toBeInstanceOf(Date)
  })

  it('adds racesToAdd for unmatched input races with correct distance fields', async () => {
    const matchResult = makeMatchResult()
    const input = makeInput({
      races: [
        { name: 'Rando 8km', distance: 8000, categoryLevel1: 'WALK' },
        { name: 'Trail 20km', distance: 20000, categoryLevel1: 'TRAIL' },
      ],
    })
    // No existing DB races → all input races are unmatched
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.racesToAdd).toBeDefined()
    const added = changes.racesToAdd.new
    const walk = added.find(r => r.name === 'Rando 8km')
    const trail = added.find(r => r.name === 'Trail 20km')
    expect(walk).toBeDefined()
    expect(walk.walkDistance).toBe(8)
    expect(walk.runDistance).toBeUndefined()
    expect(trail).toBeDefined()
    expect(trail.runDistance).toBe(20)
    expect(trail.walkDistance).toBeUndefined()
  })

  it('uses pre-matched races when provided (skips automatic matchRaces)', async () => {
    const matchResult = makeMatchResult()
    const input = makeInput({
      races: [{ name: 'Trail 10km', distance: 10000, startTime: '09:00', categoryLevel1: 'TRAIL' }],
    })
    const dbRace = {
      id: 100,
      name: 'Trail 10 km',
      startDate: new Date('2025-06-15T08:00:00.000Z'),
      runDistance: 10,
      categoryLevel1: 'TRAIL',
    }
    const preMatched = {
      matched: [{ input: { name: 'Trail 10km', distance: 10 }, db: dbRace }],
      unmatched: [],
    }
    const changes = await buildEditionUpdateChanges(input, matchResult, [dbRace], preMatched)
    expect(changes.racesToUpdate).toBeDefined()
    expect(changes.racesToUpdate.new[0].raceId).toBe(100)
    expect(changes.racesToAdd).toBeUndefined()
  })

  it('lists racesExisting for unmatched DB races', async () => {
    const matchResult = makeMatchResult()
    const input = makeInput({
      // No input races
      races: [],
    })
    const dbRace = {
      id: 200,
      name: 'Existing race',
      startDate: new Date('2025-06-15T08:00:00.000Z'),
      runDistance: 10,
      categoryLevel1: 'TRAIL',
    }
    const changes = await buildEditionUpdateChanges(input, matchResult, [dbRace])
    expect(changes.racesExisting).toBeDefined()
    expect(changes.racesExisting.new[0].raceId).toBe(200)
  })

  it('includes organizer in changes when input has organizer', async () => {
    const matchResult = makeMatchResult({
      edition: {
        id: '42',
        startDate: new Date('2025-06-15T08:00:00.000Z'),
        timeZone: 'Europe/Paris',
        calendarStatus: 'CONFIRMED',
        editionPartners: [],
      },
    })
    const input = makeInput({
      organizer: { name: 'Nouveau Orga', email: 'orga@test.fr' },
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.organizer).toBeDefined()
    expect(changes.organizer.new.name).toBe('Nouveau Orga')
    expect(changes.organizer.old).toBeNull()
  })

  it('does not duplicate organizer when existing matches input', async () => {
    const matchResult = makeMatchResult({
      edition: {
        id: '42',
        startDate: new Date('2025-06-15T08:00:00.000Z'),
        timeZone: 'Europe/Paris',
        calendarStatus: 'CONFIRMED',
        editionPartners: [
          {
            role: 'ORGANIZER',
            name: 'Même Orga',
            websiteUrl: 'https://example.com',
            facebookUrl: null,
            instagramUrl: null,
          },
        ],
      },
    })
    const input = makeInput({
      organizer: { name: 'Même Orga', websiteUrl: 'https://example.com' },
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    // No diff → organizer should not be proposed
    expect(changes.organizer).toBeUndefined()
  })

  it('proposes registrationUrl when provided', async () => {
    const matchResult = makeMatchResult()
    const input = makeInput({ registrationUrl: 'https://inscription.fr/event' })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.registrationUrl).toEqual({ old: null, new: 'https://inscription.fr/event' })
  })

  it('does not include racesToAdd for input races without distance', async () => {
    const matchResult = makeMatchResult()
    const input = makeInput({
      races: [
        { name: 'Unknown race', categoryLevel1: 'RUNNING' }, // no distance
      ],
    })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.racesToAdd).toBeUndefined()
  })

  it('proposes timeZone change when input timezone differs from existing', async () => {
    const matchResult = makeMatchResult({
      edition: {
        id: '42',
        startDate: new Date('2025-06-15T08:00:00.000Z'),
        timeZone: 'America/Martinique',
        calendarStatus: 'CONFIRMED',
        editionPartners: [],
      },
    })
    const input = makeInput({ timeZone: 'Europe/Paris' })
    const changes = await buildEditionUpdateChanges(input, matchResult, [])
    expect(changes.timeZone).toBeDefined()
    expect(changes.timeZone.old).toBe('America/Martinique')
    expect(changes.timeZone.new).toBe('Europe/Paris')
  })
})
