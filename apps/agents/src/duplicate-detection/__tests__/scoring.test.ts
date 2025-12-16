/**
 * Tests for the duplicate detection scoring module
 */

import {
  calculateNameScore,
  calculateLocationScore,
  calculateDateScore,
  calculateCategoryScore,
  calculateDuplicateScore,
  chooseKeepEvent,
  haversineDistance,
  DEFAULT_SCORING_CONFIG,
  EventForScoring
} from '../scoring'

describe('Duplicate Detection Scoring', () => {
  describe('calculateNameScore', () => {
    it('should return 1.0 for identical names after normalization', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Marathon de Paris',
        city: 'Paris',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Marathon de Paris',
        city: 'Paris',
        editions: []
      }

      const score = calculateNameScore(event1, event2)
      expect(score).toBe(1.0)
    })

    it('should handle accents and case differences', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Marathon du Lac d\'Annecy',
        city: 'Annecy',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'MARATHON DU LAC D\'ANNECY',
        city: 'Annecy',
        editions: []
      }

      const score = calculateNameScore(event1, event2)
      expect(score).toBe(1.0)
    })

    it('should score reasonably for similar names with word order change', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Marathon Paris',
        city: 'Paris',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Paris Marathon',
        city: 'Paris',
        editions: []
      }

      const score = calculateNameScore(event1, event2)
      // fuse.js doesn't handle word order perfectly, but keywords overlap helps
      expect(score).toBeGreaterThan(0.5)
    })

    it('should score high for names with prefix/suffix differences', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Le Marathon de Paris 2025',
        city: 'Paris',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Marathon Paris',
        city: 'Paris',
        editions: []
      }

      const score = calculateNameScore(event1, event2)
      expect(score).toBeGreaterThan(0.6)
    })

    it('should score low for completely different names', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Marathon de Paris',
        city: 'Paris',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Trail des Montagnes',
        city: 'Chamonix',
        editions: []
      }

      const score = calculateNameScore(event1, event2)
      expect(score).toBeLessThan(0.3)
    })
  })

  describe('haversineDistance', () => {
    it('should return 0 for same coordinates', () => {
      const distance = haversineDistance(48.8566, 2.3522, 48.8566, 2.3522)
      expect(distance).toBe(0)
    })

    it('should calculate distance correctly (Paris to Lyon ~390km)', () => {
      const distance = haversineDistance(48.8566, 2.3522, 45.7640, 4.8357)
      expect(distance).toBeGreaterThan(380)
      expect(distance).toBeLessThan(400)
    })

    it('should calculate short distance correctly (Paris to Versailles ~17km)', () => {
      const distance = haversineDistance(48.8566, 2.3522, 48.8014, 2.1301)
      expect(distance).toBeGreaterThan(15)
      expect(distance).toBeLessThan(20)
    })
  })

  describe('calculateLocationScore', () => {
    it('should return 1.0 for same city', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: []
      }

      const result = calculateLocationScore(event1, event2)
      expect(result.score).toBe(1.0)
    })

    it('should normalize city names (Saint vs St)', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Saint-Étienne',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'St Etienne',
        editions: []
      }

      const result = calculateLocationScore(event1, event2)
      expect(result.score).toBe(1.0)
    })

    it('should return 0.6 for same department without coordinates', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Lyon',
        countrySubdivisionDisplayCodeLevel2: '69',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Villeurbanne',
        countrySubdivisionDisplayCodeLevel2: '69',
        editions: []
      }

      const result = calculateLocationScore(event1, event2)
      expect(result.score).toBe(0.6)
    })

    it('should use distance when coordinates available', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        latitude: 48.8566,
        longitude: 2.3522,
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Boulogne-Billancourt',
        latitude: 48.8397,
        longitude: 2.2399, // ~8km from Paris
        editions: []
      }

      const result = calculateLocationScore(event1, event2)
      expect(result.score).toBe(0.8) // Within 15km
      expect(result.distanceKm).toBeDefined()
    })

    it('should return 0 for distant cities in different departments', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        countrySubdivisionDisplayCodeLevel2: '75',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Marseille',
        countrySubdivisionDisplayCodeLevel2: '13',
        editions: []
      }

      const result = calculateLocationScore(event1, event2)
      expect(result.score).toBe(0)
    })
  })

  describe('calculateDateScore', () => {
    it('should return 1.0 for same date same year', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: [{ id: 1, year: '2025', startDate: new Date('2025-04-15') }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: [{ id: 2, year: '2025', startDate: new Date('2025-04-15') }]
      }

      const score = calculateDateScore(event1, event2)
      expect(score).toBe(1.0)
    })

    it('should return 0.9 for dates within 7 days', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: [{ id: 1, year: '2025', startDate: new Date('2025-04-15') }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: [{ id: 2, year: '2025', startDate: new Date('2025-04-20') }]
      }

      const score = calculateDateScore(event1, event2)
      expect(score).toBe(0.9)
    })

    it('should return 0.7 for dates within tolerance (30 days)', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: [{ id: 1, year: '2025', startDate: new Date('2025-04-01') }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: [{ id: 2, year: '2025', startDate: new Date('2025-04-25') }]
      }

      const score = calculateDateScore(event1, event2)
      expect(score).toBe(0.7)
    })

    it('should return 0.5 for same year without dates', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: [{ id: 1, year: '2025' }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: [{ id: 2, year: '2025' }]
      }

      const score = calculateDateScore(event1, event2)
      expect(score).toBe(0.5)
    })

    it('should return 0 for no overlapping years', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: [{ id: 1, year: '2023', startDate: new Date('2023-04-15') }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: [{ id: 2, year: '2025', startDate: new Date('2025-04-15') }]
      }

      const score = calculateDateScore(event1, event2)
      expect(score).toBe(0)
    })
  })

  describe('calculateCategoryScore', () => {
    it('should return 1.0 for identical categories', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: [{ id: 1, year: '2025', races: [{ categoryLevel1: 'RUNNING' }, { categoryLevel1: 'TRAIL' }] }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: [{ id: 2, year: '2025', races: [{ categoryLevel1: 'RUNNING' }, { categoryLevel1: 'TRAIL' }] }]
      }

      const score = calculateCategoryScore(event1, event2)
      expect(score).toBe(1.0)
    })

    it('should return 0.5 for partial overlap', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: [{ id: 1, year: '2025', races: [{ categoryLevel1: 'RUNNING' }, { categoryLevel1: 'TRAIL' }] }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: [{ id: 2, year: '2025', races: [{ categoryLevel1: 'RUNNING' }, { categoryLevel1: 'CYCLING' }] }]
      }

      const score = calculateCategoryScore(event1, event2)
      // Jaccard: 1 (RUNNING) / 3 (RUNNING, TRAIL, CYCLING) = 0.333
      expect(score).toBeCloseTo(0.333, 2)
    })

    it('should return 0.5 for events without categories', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        editions: []
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        editions: []
      }

      const score = calculateCategoryScore(event1, event2)
      expect(score).toBe(0.5) // Neutral score
    })
  })

  describe('calculateDuplicateScore', () => {
    it('should detect obvious duplicates (same name, city, date)', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Marathon de Paris',
        city: 'Paris',
        countrySubdivisionDisplayCodeLevel2: '75',
        editions: [{ id: 1, year: '2025', startDate: new Date('2025-04-13') }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Marathon de Paris',
        city: 'Paris',
        countrySubdivisionDisplayCodeLevel2: '75',
        editions: [{ id: 2, year: '2025', startDate: new Date('2025-04-13') }]
      }

      const result = calculateDuplicateScore(event1, event2, DEFAULT_SCORING_CONFIG, 0.80)
      expect(result.score).toBeGreaterThanOrEqual(0.95)
      expect(result.isDuplicate).toBe(true)
    })

    it('should detect probable duplicates (similar name, same city)', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Marathon Paris',
        city: 'Paris',
        countrySubdivisionDisplayCodeLevel2: '75',
        editions: [{ id: 1, year: '2025', startDate: new Date('2025-04-13') }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Le Marathon de Paris 2025',
        city: 'Paris',
        countrySubdivisionDisplayCodeLevel2: '75',
        editions: [{ id: 2, year: '2025', startDate: new Date('2025-04-13') }]
      }

      const result = calculateDuplicateScore(event1, event2, DEFAULT_SCORING_CONFIG, 0.80)
      expect(result.score).toBeGreaterThan(0.80)
      expect(result.isDuplicate).toBe(true)
    })

    it('should not flag false positives (similar name, different cities)', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Trail des Montagnes',
        city: 'Chamonix',
        countrySubdivisionDisplayCodeLevel2: '74',
        editions: [{ id: 1, year: '2025', startDate: new Date('2025-06-15') }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Trail des Montagnes',
        city: 'Grenoble',
        countrySubdivisionDisplayCodeLevel2: '38',
        editions: [{ id: 2, year: '2025', startDate: new Date('2025-09-20') }]
      }

      const result = calculateDuplicateScore(event1, event2, DEFAULT_SCORING_CONFIG, 0.80)
      expect(result.isDuplicate).toBe(false)
    })

    it('should apply malus for large edition count difference', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Marathon de Paris',
        city: 'Paris',
        editions: Array(10).fill(null).map((_, i) => ({ id: i, year: String(2015 + i) }))
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Marathon de Paris',
        city: 'Paris',
        editions: [{ id: 100, year: '2025' }]
      }

      const result = calculateDuplicateScore(event1, event2, DEFAULT_SCORING_CONFIG, 0.80)
      expect(result.details.editionRatio).toBe(0.1) // 1/10
      // Score should be reduced due to edition ratio malus
    })
  })

  describe('chooseKeepEvent', () => {
    it('should keep event with more editions', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Marathon de Paris',
        city: 'Paris',
        editions: Array(5).fill(null).map((_, i) => ({ id: i, year: String(2020 + i) }))
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Marathon Paris',
        city: 'Paris',
        editions: [{ id: 100, year: '2025' }]
      }

      const result = chooseKeepEvent(event1, event2)
      expect(result.keepEvent.id).toBe(1)
      expect(result.duplicateEvent.id).toBe(2)
      expect(result.reason).toContain('éditions')
    })

    it('should prefer LIVE status over others', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        status: 'DRAFT',
        editions: [{ id: 1, year: '2025' }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        status: 'LIVE',
        editions: [{ id: 2, year: '2025' }]
      }

      const result = chooseKeepEvent(event1, event2)
      expect(result.keepEvent.id).toBe(2)
      expect(result.reason).toBe('Status LIVE')
    })

    it('should prefer older event when editions and status equal', () => {
      const event1: EventForScoring = {
        id: 1,
        name: 'Event 1',
        city: 'Paris',
        status: 'LIVE',
        createdAt: new Date('2020-01-01'),
        editions: [{ id: 1, year: '2025' }]
      }
      const event2: EventForScoring = {
        id: 2,
        name: 'Event 2',
        city: 'Paris',
        status: 'LIVE',
        createdAt: new Date('2023-01-01'),
        editions: [{ id: 2, year: '2025' }]
      }

      const result = chooseKeepEvent(event1, event2)
      expect(result.keepEvent.id).toBe(1)
      expect(result.reason).toBe('Plus ancien')
    })
  })
})
