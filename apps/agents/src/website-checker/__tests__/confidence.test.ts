import { computeFinalConfidence, SOURCE_WEIGHTS } from '../confidence'
import type { UrlCheckResultWithAnalysis } from '../types'

describe('SOURCE_WEIGHTS', () => {
  it('event has highest weight', () => {
    expect(SOURCE_WEIGHTS.event).toBeGreaterThan(SOURCE_WEIGHTS.organizer)
    expect(SOURCE_WEIGHTS.organizer).toBeGreaterThan(SOURCE_WEIGHTS.timer)
  })
})

describe('computeFinalConfidence', () => {
  it('returns high confidence when event URL confirms with registration open', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true,
      isDead: false,
      httpStatus: 200,
      htmlText: 'content',
      analysis: {
        confirmed: true,
        canceled: false,
        registrationOpen: true,
        startDate: '2026-04-15',
        endDate: null,
        datesFound: ['2026-04-15'],
        yearMentioned: true,
        confidence: 0.95,
        reasoning: 'Registration open for 2026',
      },
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('CONFIRMED')
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('returns CONFIRMED even from organizer URL (any confirmation wins)', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://organizer.fr',
      sourceType: 'organizer',
      isAlive: true,
      isDead: false,
      httpStatus: 200,
      htmlText: 'content',
      analysis: {
        confirmed: true,
        canceled: false,
        registrationOpen: true,
        startDate: '2026-04-15',
        endDate: null,
        datesFound: ['2026-04-15'],
        yearMentioned: true,
        confidence: 0.90,
        reasoning: 'Confirmed on organizer site',
      },
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('CONFIRMED')
    // Organizer URL → slightly lower confidence than event URL
    expect(result.confidence).toBeLessThan(0.95)
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('returns CANCELED when a URL explicitly says canceled', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true,
      isDead: false,
      httpStatus: 200,
      htmlText: 'content',
      analysis: {
        confirmed: false,
        canceled: true,
        registrationOpen: false,
        startDate: null,
        endDate: null,
        datesFound: [],
        yearMentioned: true,
        confidence: 0.90,
        reasoning: 'Event explicitly canceled',
      },
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('CANCELED')
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('returns INCONCLUSIVE when site is alive but no confirmation signal', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true,
      isDead: false,
      httpStatus: 200,
      htmlText: 'content',
      analysis: {
        confirmed: false,
        canceled: false,
        registrationOpen: false,
        startDate: null,
        endDate: null,
        datesFound: [],
        yearMentioned: false,
        confidence: 0.3,
        reasoning: 'No info about upcoming edition',
      },
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('INCONCLUSIVE')
  })

  it('confirmed wins over inconclusive from different URLs', () => {
    const results: UrlCheckResultWithAnalysis[] = [
      {
        url: 'https://marathon.fr',
        sourceType: 'event',
        isAlive: true,
        isDead: false,
        httpStatus: 200,
        htmlText: 'content',
        analysis: {
          confirmed: false, canceled: false, registrationOpen: false,
          startDate: null, endDate: null,
          datesFound: [], yearMentioned: false, confidence: 0.3,
          reasoning: 'No info',
        },
      },
      {
        url: 'https://organizer.fr',
        sourceType: 'organizer',
        isAlive: true,
        isDead: false,
        httpStatus: 200,
        htmlText: 'content',
        analysis: {
          confirmed: true, canceled: false, registrationOpen: true,
          startDate: '2026-04-15', endDate: null,
          datesFound: ['2026-04-15'], yearMentioned: true, confidence: 0.92,
          reasoning: 'Confirmed on organizer site',
        },
      },
    ]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('CONFIRMED')
  })

  it('returns INCONCLUSIVE when all URLs are dead (dead URLs handled separately)', () => {
    const results: UrlCheckResultWithAnalysis[] = [{
      url: 'https://dead.fr',
      sourceType: 'event',
      isAlive: false,
      isDead: true,
      errorReason: 'HTTP_404',
    }]

    const result = computeFinalConfidence(results)
    expect(result.decision).toBe('INCONCLUSIVE')
    expect(result.confidence).toBe(0)
  })

  it('boosts confidence when year is mentioned and dates match', () => {
    const withYear: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true, isDead: false, httpStatus: 200, htmlText: 'content',
      analysis: {
        confirmed: true, canceled: false, registrationOpen: false,
        startDate: '2026-04-15', endDate: null,
        datesFound: ['2026-04-15'], yearMentioned: true, confidence: 0.85,
        reasoning: 'Year mentioned, dates found',
      },
    }]

    const withoutYear: UrlCheckResultWithAnalysis[] = [{
      url: 'https://marathon.fr',
      sourceType: 'event',
      isAlive: true, isDead: false, httpStatus: 200, htmlText: 'content',
      analysis: {
        confirmed: true, canceled: false, registrationOpen: false,
        startDate: null, endDate: null,
        datesFound: [], yearMentioned: false, confidence: 0.7,
        reasoning: 'No year, no dates',
      },
    }]

    const resultWithYear = computeFinalConfidence(withYear)
    const resultWithoutYear = computeFinalConfidence(withoutYear)

    expect(resultWithYear.confidence).toBeGreaterThan(resultWithoutYear.confidence)
  })
})
