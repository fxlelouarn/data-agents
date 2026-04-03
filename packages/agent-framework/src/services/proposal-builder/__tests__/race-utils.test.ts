/**
 * Tests for race-utils — shared proposal builder utilities.
 */

import {
  assignDistanceByCategory,
  isMidnightInTimezone,
  isSameDateInTimezone,
  cascadeDateToRace,
  calculateRaceStartDate,
  calculateEditionDates,
  classifyOrganizerUrl,
  inferAndAssignCategories,
} from '../race-utils'

// ─────────────────────────────────────────────────────────────────────────────
// assignDistanceByCategory
// ─────────────────────────────────────────────────────────────────────────────

describe('assignDistanceByCategory', () => {
  it('RUNNING → runDistance', () => {
    expect(assignDistanceByCategory(10000, 'RUNNING')).toEqual({ runDistance: 10 })
  })

  it('TRAIL → runDistance', () => {
    expect(assignDistanceByCategory(25000, 'TRAIL')).toEqual({ runDistance: 25 })
  })

  it('WALK → walkDistance', () => {
    expect(assignDistanceByCategory(8000, 'WALK')).toEqual({ walkDistance: 8 })
  })

  it('CYCLING → bikeDistance', () => {
    expect(assignDistanceByCategory(42000, 'CYCLING')).toEqual({ bikeDistance: 42 })
  })

  it('undefined category → runDistance', () => {
    expect(assignDistanceByCategory(5000)).toEqual({ runDistance: 5 })
  })

  it('FUN → runDistance', () => {
    expect(assignDistanceByCategory(12000, 'FUN')).toEqual({ runDistance: 12 })
  })

  it('TRIATHLON → runDistance', () => {
    expect(assignDistanceByCategory(42195, 'TRIATHLON')).toEqual({ runDistance: 42.195 })
  })

  it('OTHER → runDistance', () => {
    expect(assignDistanceByCategory(3000, 'OTHER')).toEqual({ runDistance: 3 })
  })

  it('converts meters to km correctly', () => {
    expect(assignDistanceByCategory(42195, 'RUNNING')).toEqual({ runDistance: 42.195 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isMidnightInTimezone
// ─────────────────────────────────────────────────────────────────────────────

describe('isMidnightInTimezone', () => {
  it('midnight UTC is midnight in UTC', () => {
    const date = new Date('2025-06-15T00:00:00Z')
    expect(isMidnightInTimezone(date, 'UTC')).toBe(true)
  })

  it('midnight Europe/Paris in winter (UTC+1) = 23:00 UTC previous day', () => {
    // Jan 15 00:00 Paris = Jan 14 23:00 UTC
    const date = new Date('2025-01-14T23:00:00Z')
    expect(isMidnightInTimezone(date, 'Europe/Paris')).toBe(true)
  })

  it('midnight Europe/Paris in summer (UTC+2) = 22:00 UTC previous day', () => {
    // Jun 15 00:00 Paris = Jun 14 22:00 UTC
    const date = new Date('2025-06-14T22:00:00Z')
    expect(isMidnightInTimezone(date, 'Europe/Paris')).toBe(true)
  })

  it('non-midnight returns false', () => {
    const date = new Date('2025-06-15T08:30:00Z')
    expect(isMidnightInTimezone(date, 'UTC')).toBe(false)
  })

  it('noon UTC is not midnight UTC', () => {
    const date = new Date('2025-06-15T12:00:00Z')
    expect(isMidnightInTimezone(date, 'UTC')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isSameDateInTimezone
// ─────────────────────────────────────────────────────────────────────────────

describe('isSameDateInTimezone', () => {
  it('same instant is same day', () => {
    const date = new Date('2025-06-15T10:00:00Z')
    expect(isSameDateInTimezone(date, date, 'UTC')).toBe(true)
  })

  it('same calendar day, different times in UTC', () => {
    const d1 = new Date('2025-06-15T08:00:00Z')
    const d2 = new Date('2025-06-15T20:00:00Z')
    expect(isSameDateInTimezone(d1, d2, 'UTC')).toBe(true)
  })

  it('different calendar days in UTC', () => {
    const d1 = new Date('2025-06-15T10:00:00Z')
    const d2 = new Date('2025-06-16T10:00:00Z')
    expect(isSameDateInTimezone(d1, d2, 'UTC')).toBe(false)
  })

  it('same UTC day but different local days due to timezone', () => {
    // 2025-06-15 23:00 UTC = 2025-06-16 01:00 Paris (UTC+2 summer)
    const d1 = new Date('2025-06-15T21:00:00Z') // Jun 15 23:00 Paris
    const d2 = new Date('2025-06-15T23:00:00Z') // Jun 16 01:00 Paris
    expect(isSameDateInTimezone(d1, d2, 'Europe/Paris')).toBe(false)
  })

  it('different UTC days but same local day in timezone', () => {
    // 2025-06-14 23:00 UTC = 2025-06-15 01:00 Paris
    // 2025-06-15 21:00 UTC = 2025-06-15 23:00 Paris
    const d1 = new Date('2025-06-14T23:00:00Z')
    const d2 = new Date('2025-06-15T21:00:00Z')
    expect(isSameDateInTimezone(d1, d2, 'Europe/Paris')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// cascadeDateToRace
// ─────────────────────────────────────────────────────────────────────────────

describe('cascadeDateToRace', () => {
  it('midnight race → returns the new edition date unchanged', () => {
    const newEditionDate = new Date('2025-06-15T22:00:00Z') // midnight Paris summer
    const midnightRace = new Date('2025-06-14T22:00:00Z')   // midnight Paris summer on another day
    const result = cascadeDateToRace(newEditionDate, midnightRace, 'Europe/Paris')
    expect(result).toEqual(newEditionDate)
  })

  it('precise-time race → preserves the local hour on the new date', () => {
    // Race is on Jun 14 at 09:00 Paris (UTC+2 summer) = 07:00 UTC
    const existingRaceDate = new Date('2025-06-14T07:00:00Z')
    // New edition date: Jun 20 (midnight Paris = 22:00 UTC Jun 19)
    const newEditionDate = new Date('2025-06-19T22:00:00Z')

    const result = cascadeDateToRace(newEditionDate, existingRaceDate, 'Europe/Paris')

    // Expected: Jun 20 at 09:00 Paris = 07:00 UTC
    expect(result.toISOString()).toBe('2025-06-20T07:00:00.000Z')
  })

  it('precise-time race in winter → uses winter offset (UTC+1)', () => {
    // Race Jan 14 at 10:00 Paris (UTC+1 winter) = 09:00 UTC
    const existingRaceDate = new Date('2025-01-14T09:00:00Z')
    // New edition date: Jan 20 midnight Paris = 23:00 UTC Jan 19
    const newEditionDate = new Date('2025-01-19T23:00:00Z')

    const result = cascadeDateToRace(newEditionDate, existingRaceDate, 'Europe/Paris')

    // Expected: Jan 20 at 10:00 Paris = 09:00 UTC
    expect(result.toISOString()).toBe('2025-01-20T09:00:00.000Z')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateRaceStartDate
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateRaceStartDate', () => {
  it('returns undefined for empty editionDate', () => {
    expect(calculateRaceStartDate('')).toBeUndefined()
  })

  it('with startTime → returns correct UTC date', () => {
    // 2025-06-15 09:00 Paris (UTC+2) = 07:00 UTC
    const result = calculateRaceStartDate('2025-06-15', '09:00', 'Europe/Paris')
    expect(result?.toISOString()).toBe('2025-06-15T07:00:00.000Z')
  })

  it('without startTime → returns midnight in timezone', () => {
    // 2025-06-15 00:00 Paris (UTC+2) = 2025-06-14 22:00 UTC
    const result = calculateRaceStartDate('2025-06-15', undefined, 'Europe/Paris')
    expect(result?.toISOString()).toBe('2025-06-14T22:00:00.000Z')
  })

  it('without startTime and no timezone → defaults to Europe/Paris', () => {
    const result = calculateRaceStartDate('2025-01-15')
    // Jan 15 00:00 Paris (UTC+1) = Jan 14 23:00 UTC
    expect(result?.toISOString()).toBe('2025-01-14T23:00:00.000Z')
  })

  it('with raceDate (DD/MM) → uses race-specific date with edition year', () => {
    // raceDate = "20/06", editionDate = "2025-06-15"
    // Jun 20 09:00 Paris = 07:00 UTC
    const result = calculateRaceStartDate('2025-06-15', '09:00', 'Europe/Paris', '20/06')
    expect(result?.toISOString()).toBe('2025-06-20T07:00:00.000Z')
  })

  it('with full ISO datetime as editionDate (should strip time part)', () => {
    // Rematch script passes editionDate as full ISO datetime
    const result = calculateRaceStartDate('2026-03-08T00:00:00.000Z', '09:00', 'Europe/Paris')
    // Mar 8 2026 09:00 Paris (UTC+1 winter) = 08:00 UTC
    expect(result?.toISOString()).toBe('2026-03-08T08:00:00.000Z')
  })

  it('with non-parseable startTime → falls back to midnight', () => {
    // "libre de 8h à 9h" is not HH:mm format — should fall back to midnight
    const result = calculateRaceStartDate('2026-04-04', 'libre de 8h à 9h', 'Europe/Paris')
    // Apr 4 2026 00:00 Paris (UTC+2 summer) = Apr 3 22:00 UTC
    expect(result?.toISOString()).toBe('2026-04-03T22:00:00.000Z')
  })

  it('with raceDate and year rollover (Dec → Jan)', () => {
    // editionDate = "2025-12-28", raceDate = "03/01" → should be 2026
    const result = calculateRaceStartDate('2025-12-28', '10:00', 'Europe/Paris', '03/01')
    // Jan 3 2026 10:00 Paris (UTC+1 winter) = 09:00 UTC
    expect(result?.toISOString()).toBe('2026-01-03T09:00:00.000Z')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateEditionDates
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateEditionDates', () => {
  it('no races → start and end are both midnight', () => {
    const { startDate, endDate } = calculateEditionDates([], '2025-06-15', 'Europe/Paris')
    // Both should be midnight Paris = 22:00 UTC Jun 14
    expect(startDate.toISOString()).toBe('2025-06-14T22:00:00.000Z')
    expect(endDate.toISOString()).toBe('2025-06-14T22:00:00.000Z')
  })

  it('races without times → start and end are midnight', () => {
    const races = [
      { name: 'Race 1', distance: 10000 },
      { name: 'Race 2', distance: 20000 },
    ]
    const { startDate, endDate } = calculateEditionDates(races, '2025-06-15', 'Europe/Paris')
    expect(startDate.toISOString()).toBe('2025-06-14T22:00:00.000Z')
    expect(endDate.toISOString()).toBe('2025-06-14T22:00:00.000Z')
  })

  it('races with times → startDate is earliest non-midnight, endDate is last', () => {
    const races = [
      { name: 'Race 1', distance: 10000, startTime: '09:00' },
      { name: 'Race 2', distance: 20000, startTime: '14:00' },
    ]
    const { startDate, endDate } = calculateEditionDates(races, '2025-06-15', 'Europe/Paris')
    // 09:00 Paris (UTC+2) = 07:00 UTC
    expect(startDate.toISOString()).toBe('2025-06-15T07:00:00.000Z')
    // 14:00 Paris (UTC+2) = 12:00 UTC
    expect(endDate.toISOString()).toBe('2025-06-15T12:00:00.000Z')
  })

  it('first race at midnight, second with time → startDate is second race', () => {
    const races = [
      { name: 'Race 1', distance: 10000 }, // no startTime → midnight
      { name: 'Race 2', distance: 20000, startTime: '10:00' },
    ]
    const { startDate, endDate } = calculateEditionDates(races, '2025-06-15', 'Europe/Paris')
    // startDate = first non-midnight = 10:00 Paris = 08:00 UTC
    expect(startDate.toISOString()).toBe('2025-06-15T08:00:00.000Z')
    // endDate = last race = 10:00 Paris = 08:00 UTC
    expect(endDate.toISOString()).toBe('2025-06-15T08:00:00.000Z')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyOrganizerUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyOrganizerUrl', () => {
  it('undefined → empty object', () => {
    expect(classifyOrganizerUrl(undefined)).toEqual({})
  })

  it('empty string → empty object', () => {
    expect(classifyOrganizerUrl('')).toEqual({})
  })

  it('facebook.com URL → facebookUrl', () => {
    expect(classifyOrganizerUrl('https://www.facebook.com/mypage')).toEqual({
      facebookUrl: 'https://www.facebook.com/mypage',
    })
  })

  it('fb.com URL → facebookUrl', () => {
    expect(classifyOrganizerUrl('https://fb.com/mypage')).toEqual({
      facebookUrl: 'https://fb.com/mypage',
    })
  })

  it('fb.me URL → facebookUrl', () => {
    expect(classifyOrganizerUrl('https://fb.me/shortlink')).toEqual({
      facebookUrl: 'https://fb.me/shortlink',
    })
  })

  it('instagram.com URL → instagramUrl', () => {
    expect(classifyOrganizerUrl('https://www.instagram.com/myprofil')).toEqual({
      instagramUrl: 'https://www.instagram.com/myprofil',
    })
  })

  it('instagr.am short URL → instagramUrl', () => {
    expect(classifyOrganizerUrl('https://instagr.am/p/abc')).toEqual({
      instagramUrl: 'https://instagr.am/p/abc',
    })
  })

  it('regular website → websiteUrl', () => {
    expect(classifyOrganizerUrl('https://www.myrace.fr')).toEqual({
      websiteUrl: 'https://www.myrace.fr',
    })
  })

  it('URL matching is case-insensitive', () => {
    expect(classifyOrganizerUrl('https://FACEBOOK.COM/page')).toEqual({
      facebookUrl: 'https://FACEBOOK.COM/page',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// inferAndAssignCategories
// ─────────────────────────────────────────────────────────────────────────────

describe('inferAndAssignCategories', () => {
  it('race with existing categoryLevel1 → returned unchanged', () => {
    const race = { name: 'Trail des Alpes', distance: 25000, categoryLevel1: 'TRAIL', categoryLevel2: 'SHORT_TRAIL' }
    const result = inferAndAssignCategories(race)
    expect(result).toEqual(race)
  })

  it('race without category → infers TRAIL from name', () => {
    const race = { name: 'Trail des Alpes 25km', distance: 25000 }
    const result = inferAndAssignCategories(race)
    expect(result.categoryLevel1).toBe('TRAIL')
    expect(result.categoryLevel2).toBeDefined()
  })

  it('race without category → infers RUNNING for "Marathon"', () => {
    const race = { name: 'Marathon de Paris', distance: 42195 }
    const result = inferAndAssignCategories(race)
    expect(result.categoryLevel1).toBe('RUNNING')
    expect(result.categoryLevel2).toBe('MARATHON')
  })

  it('race without category → infers WALK for "Randonnée"', () => {
    const race = { name: 'Randonnée 15km', distance: 15000 }
    const result = inferAndAssignCategories(race)
    expect(result.categoryLevel1).toBe('WALK')
  })

  it('preserves all other race fields', () => {
    const race = { name: 'Marathon de Lyon', distance: 42195, startTime: '09:00', price: 50 }
    const result = inferAndAssignCategories(race)
    expect(result.name).toBe('Marathon de Lyon')
    expect(result.distance).toBe(42195)
    expect(result.startTime).toBe('09:00')
    expect(result.price).toBe(50)
  })
})
