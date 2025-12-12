/**
 * Tests pour le matching hybride distance + nom des courses
 * 
 * Cas testés :
 * - Distance unique : Match automatique
 * - Distance multiple + nom similaire : Fuzzy match
 * - Distance multiple + nom différent : Nouvelle course
 */

import { matchRacesByDistanceAndName } from '@data-agents/agent-framework'

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}

describe('matchRacesByDistanceAndName', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Cas 1: Distance unique - Match automatique', () => {
    it('devrait matcher automatiquement quand une seule course a cette distance', () => {
      const ffaRaces = [
        {
          name: '10km',
          runDistance: 10,
          startTime: '09:00'
        }
      ]

      const dbRaces = [
        {
          id: 1,
          name: '10 kilomètres',
          runDistance: 10,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        }
      ]

    const result = matchRacesByDistanceAndName(ffaRaces, dbRaces, mockLogger, 0.05)

      expect(result.matched).toHaveLength(1)
      expect(result.unmatched).toHaveLength(0)
      expect(result.matched[0].ffa.name).toBe('10km')
      expect(result.matched[0].db.id).toBe(1)
    })
  })

  describe('Cas 2: Distance multiple + noms similaires - Fuzzy match', () => {
    it('devrait distinguer Marche vs Course relais avec même distance', () => {
      const ffaRaces = [
        {
          name: 'Marche 4,3 km - Course HS non officielle',
          runDistance: 4.3,
          startTime: '08:00'
        },
        {
          name: 'Courses relais 4,3 km en duo - Course HS non officielle',
          runDistance: 4.3,
          startTime: '10:30'
        }
      ]

      const dbRaces = [
        {
          id: 1,
          name: 'Marche 4,3 km',
          runDistance: 4.3,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0,
          startDate: new Date('2025-11-15T08:00:00Z')
        },
        {
          id: 2,
          name: 'Course relais adulte 4,3 km',
          runDistance: 4.3,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0,
          startDate: new Date('2025-11-15T10:30:00Z')
        }
      ]

      const result = matchRacesByDistanceAndName(ffaRaces, dbRaces, mockLogger, 0.05)

      expect(result.matched).toHaveLength(2)
      expect(result.unmatched).toHaveLength(0)

      // Vérifier que les matches sont corrects
      const marcheMatch = result.matched.find(m => m.ffa.name.includes('Marche'))
      const relaisMatch = result.matched.find(m => m.ffa.name.includes('relais'))

      expect(marcheMatch).toBeDefined()
      expect(marcheMatch!.db.name).toBe('Marche 4,3 km')
      
      expect(relaisMatch).toBeDefined()
      expect(relaisMatch!.db.name).toBe('Course relais adulte 4,3 km')
    })

    it('devrait matcher des courses enfants avec tranches d\'âge', () => {
      const ffaRaces = [
        {
          name: 'Course enfants 800 m - 6 ans – 10 ans - Course HS non officielle',
          runDistance: 0.8,
          startTime: '14:00'
        },
        {
          name: 'Course enfants 2,7 km - 11 ans – 14 ans - Course HS non officielle',
          runDistance: 2.7,
          startTime: '14:30'
        }
      ]

      const dbRaces = [
        {
          id: 3,
          name: 'Course enfants 6 à 10 ans',
          runDistance: 0.8,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        },
        {
          id: 4,
          name: 'Course enfants 11 à 14 ans',
          runDistance: 2.7,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        }
      ]

      const result = matchRacesByDistanceAndName(ffaRaces, dbRaces, mockLogger, 0.05)

      expect(result.matched).toHaveLength(2)
      expect(result.unmatched).toHaveLength(0)

      const course800m = result.matched.find(m => m.ffa.runDistance === 0.8)
      const course2700m = result.matched.find(m => m.ffa.runDistance === 2.7)

      expect(course800m!.db.name).toBe('Course enfants 6 à 10 ans')
      expect(course2700m!.db.name).toBe('Course enfants 11 à 14 ans')
    })
  })

  describe('Cas 3: Distance multiple + noms trop différents - Nouvelle course', () => {
    it('devrait créer une nouvelle course si le nom est trop différent', () => {
      const ffaRaces = [
        {
          name: 'Ultra marathon des volcans',
          runDistance: 10,
          startTime: '20:00'
        }
      ]

      const dbRaces = [
        {
          id: 1,
          name: 'Marche nordique',
          runDistance: 10,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        },
        {
          id: 2,
          name: 'Course enfants',
          runDistance: 10,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        }
      ]

      const result = matchRacesByDistanceAndName(ffaRaces, dbRaces, mockLogger, 0.05)

      // Le nom "Ultra marathon des volcans" est trop différent de "Marche nordique" et "Course enfants"
      // → Devrait être traité comme nouvelle course
      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].name).toBe('Ultra marathon des volcans')
    })
  })

  describe('Cas 4: Pas de distance correspondante - Nouvelle course', () => {
    it('devrait créer une nouvelle course si aucune distance ne correspond', () => {
      const ffaRaces = [
        {
          name: '15km',
          runDistance: 15,
          startTime: '09:00'
        }
      ]

      const dbRaces = [
        {
          id: 1,
          name: '10km',
          runDistance: 10,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        },
        {
          id: 2,
          name: '21km',
          runDistance: 21.1,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        }
      ]

      const result = matchRacesByDistanceAndName(ffaRaces, dbRaces, mockLogger, 0.05)

      expect(result.matched).toHaveLength(0)
      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].name).toBe('15km')
    })
  })

  describe('Cas 5: Tolérance de distance (5%)', () => {
    it('devrait matcher avec une différence de distance <= 5%', () => {
      const ffaRaces = [
        {
          name: 'Semi-Marathon',
          runDistance: 21.1, // Distance officielle
          startTime: '09:00'
        }
      ]

      const dbRaces = [
        {
          id: 1,
          name: 'Semi-Marathon',
          runDistance: 21.097, // Distance GPS légèrement différente (0.014% de différence)
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        }
      ]

      const result = matchRacesByDistanceAndName(ffaRaces, dbRaces, mockLogger, 0.05)

      expect(result.matched).toHaveLength(1)
      expect(result.unmatched).toHaveLength(0)
    })

    it('ne devrait pas matcher avec une différence de distance > 5%', () => {
      const ffaRaces = [
        {
          name: '10km',
          runDistance: 10,
          startTime: '09:00'
        }
      ]

      const dbRaces = [
        {
          id: 1,
          name: '10km',
          runDistance: 11, // 10% de différence
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        }
      ]

      const result = matchRacesByDistanceAndName(ffaRaces, dbRaces, mockLogger, 0.05)

      expect(result.matched).toHaveLength(0)
      expect(result.unmatched).toHaveLength(1)
    })
  })

  describe('Cas 6: Course sans distance - Nouvelle course', () => {
    it('devrait traiter une course sans distance comme nouvelle course', () => {
      const ffaRaces = [
        {
          name: 'Course mystère',
          runDistance: 0,
          startTime: '09:00'
        }
      ]

      const dbRaces = [
        {
          id: 1,
          name: '10km',
          runDistance: 10,
          walkDistance: 0,
          swimDistance: 0,
          bikeDistance: 0
        }
      ]

      const result = matchRacesByDistanceAndName(ffaRaces, dbRaces, mockLogger, 0.05)

      expect(result.matched).toHaveLength(0)
      expect(result.unmatched).toHaveLength(1)
      // Vérifie qu'un des appels à info contient le message attendu
      const infoCalls = mockLogger.info.mock.calls.map((call: unknown[]) => call[0])
      expect(infoCalls.some((msg: string) => msg.includes('has no distance'))).toBe(true)
    })
  })
})
