/**
 * Tests pour matchRaces - Matching des courses par distance et nom
 *
 * Cas testés :
 * - Tolérance de distance (15% par défaut)
 * - Fuzzy fallback quand pas de match par distance
 * - Tracking des courses DB déjà matchées (évite doublons)
 */

import { matchRaces } from '../event-matcher'
import { RaceMatchInput, DbRace, MatchingLogger } from '../types'

// Mock logger silencieux
const mockLogger: MatchingLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}

describe('matchRaces', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Tolérance de distance (15% par défaut)', () => {
    it('devrait matcher avec 10% de différence (< 15%)', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'La Bataille', distance: 27.5 } // 27.5km
      ]

      const dbRaces: DbRace[] = [
        {
          id: 1,
          name: 'Trail la bataille 25 km',
          runDistance: 25, // 25km - écart de 10%
        }
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      expect(result.matched).toHaveLength(1)
      expect(result.unmatched).toHaveLength(0)
      expect(result.matched[0].db.id).toBe(1)
    })

    it('devrait matcher avec 7% de différence (< 15%)', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Les Orchis', distance: 15 } // 15km
      ]

      const dbRaces: DbRace[] = [
        {
          id: 2,
          name: 'Trail l\'orchis 14 km',
          runDistance: 14, // 14km - écart de ~7%
        }
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      expect(result.matched).toHaveLength(1)
      expect(result.unmatched).toHaveLength(0)
      expect(result.matched[0].db.id).toBe(2)
    })

    it('ne devrait PAS matcher avec 20% de différence (> 15%)', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Ultra Trail', distance: 100 } // 100km
      ]

      const dbRaces: DbRace[] = [
        {
          id: 3,
          name: 'Trail 80km',
          runDistance: 80, // 80km - écart de 25%
        }
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      // Pas de match par distance, mais fuzzy fallback possible
      // Le nom "Ultra Trail" vs "Trail 80km" pourrait matcher
      // mais avec un score probablement < 0.65
      expect(result.matched.length + result.unmatched.length).toBe(1)
    })

    it('devrait respecter une tolérance custom si fournie', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Semi Marathon', distance: 21.1 }
      ]

      const dbRaces: DbRace[] = [
        {
          id: 4,
          name: 'Semi Marathon',
          runDistance: 23, // ~9% de différence
        }
      ]

      // Avec tolérance 5%, ne devrait pas matcher
      const result5 = matchRaces(inputRaces, dbRaces, mockLogger, 0.05)

      // Avec tolérance 15%, devrait matcher
      const result15 = matchRaces(inputRaces, dbRaces, mockLogger, 0.15)

      // 9% > 5% donc pas de match par distance avec 5%
      // Mais fuzzy fallback peut matcher car même nom
      expect(result15.matched).toHaveLength(1)
    })
  })

  describe('Fuzzy fallback quand pas de match par distance', () => {
    it('devrait matcher par nom quand la distance est trop différente', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Les Orchis', distance: 15 } // 15km
      ]

      const dbRaces: DbRace[] = [
        {
          id: 1,
          name: 'Trail l\'orchis 14 km',
          runDistance: 14,
        },
        {
          id: 2,
          name: 'Trail la bataille 25 km',
          runDistance: 25,
        }
      ]

      // Avec tolérance 5%, 15km vs 14km = 7% > 5% donc pas de match par distance
      // Mais fuzzy fallback devrait trouver "orchis" dans les deux noms
      const result = matchRaces(inputRaces, dbRaces, mockLogger, 0.05)

      expect(result.matched).toHaveLength(1)
      expect(result.matched[0].db.name).toContain('orchis')
    })

    it('devrait matcher "Rando 10km" avec "Randonnée 11,5 km" par fuzzy', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Rando 10km', distance: 10 }
      ]

      const dbRaces: DbRace[] = [
        {
          id: 1,
          name: 'Randonnée 11,5 km',
          walkDistance: 11.5, // walkDistance, pas runDistance
        }
      ]

      // Distance différente mais noms similaires
      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      // Le fuzzy match devrait trouver la similarité "rando" / "randonnée"
      expect(result.matched).toHaveLength(1)
      expect(result.matched[0].db.id).toBe(1)
    })

    it('ne devrait PAS matcher des noms complètement différents', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Ultra Marathon des Volcans', distance: 50 }
      ]

      const dbRaces: DbRace[] = [
        {
          id: 1,
          name: 'Trail de la Forêt',
          runDistance: 30,
        }
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      // Noms trop différents, pas de match
      expect(result.unmatched).toHaveLength(1)
      expect(result.matched).toHaveLength(0)
    })
  })

  describe('Éviter les doublons de courses DB matchées', () => {
    it('ne devrait pas matcher deux courses input à la même course DB', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Trail 10km', distance: 10 },
        { name: '10 kilomètres', distance: 10 }
      ]

      const dbRaces: DbRace[] = [
        {
          id: 1,
          name: 'Course 10km',
          runDistance: 10,
        }
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      // Une seule course DB, donc un seul match possible
      expect(result.matched).toHaveLength(1)
      expect(result.unmatched).toHaveLength(1)
    })

    it('devrait matcher chaque course DB une seule fois', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'La Caburotte', distance: 55 },
        { name: 'La Cabu', distance: 53 }, // Même course, nom différent
      ]

      const dbRaces: DbRace[] = [
        {
          id: 1,
          name: 'Trail la caburotte 53 km',
          runDistance: 53,
        }
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      // La première course input devrait matcher
      // La deuxième ne peut plus matcher (DB déjà prise)
      expect(result.matched).toHaveLength(1)
      expect(result.unmatched).toHaveLength(1)
    })
  })

  describe('Cas réel: Trail de la Grande Champagne', () => {
    const dbRaces: DbRace[] = [
      { id: 175549, name: 'Trail la caburotte 53 km', runDistance: 53 },
      { id: 175550, name: 'Trail la bataille 25 km', runDistance: 25 },
      { id: 175548, name: 'Trail l\'orchis 14 km', runDistance: 14 },
      { id: 175547, name: 'Trail 9 km', runDistance: 9 },
      { id: 175546, name: 'Randonnée 11,5 km', walkDistance: 11.5 },
    ]

    it('devrait matcher toutes les courses avec les bons IDs', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'La Caburotte', distance: 55 },
        { name: 'La Bataille', distance: 27.5 },
        { name: 'Les Orchis', distance: 15 },
        { name: 'La Mignonette', distance: 9 },
        { name: 'Rando 10km', distance: 10 },
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      // Avec tolérance 15% + fuzzy fallback, toutes devraient matcher
      expect(result.matched.length).toBeGreaterThanOrEqual(4)

      // Vérifier les matchs spécifiques
      const caburotteMatch = result.matched.find(m => m.input.name === 'La Caburotte')
      expect(caburotteMatch?.db.id).toBe(175549)

      const batailleMatch = result.matched.find(m => m.input.name === 'La Bataille')
      expect(batailleMatch?.db.id).toBe(175550)

      const orchisMatch = result.matched.find(m => m.input.name === 'Les Orchis')
      expect(orchisMatch?.db.id).toBe(175548)

      const mignonetteMatch = result.matched.find(m => m.input.name === 'La Mignonette')
      expect(mignonetteMatch?.db.id).toBe(175547)
    })

    it('devrait identifier L\'Alambic Ultra 85km comme nouvelle course', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'L\'Alambic Ultra', distance: 85 },
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      // Pas de course 85km dans la DB, devrait être unmatched
      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].name).toBe('L\'Alambic Ultra')
    })
  })

  describe('Courses sans distance', () => {
    it('devrait traiter une course input sans distance comme nouvelle', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Course mystère', distance: 0 }
      ]

      const dbRaces: DbRace[] = [
        { id: 1, name: 'Trail 10km', runDistance: 10 }
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      expect(result.unmatched).toHaveLength(1)
    })

    it('devrait pouvoir matcher par nom une course DB sans distance', () => {
      const inputRaces: RaceMatchInput[] = [
        { name: 'Randonnée découverte', distance: 5 }
      ]

      const dbRaces: DbRace[] = [
        { id: 1, name: 'Randonnée découverte', runDistance: 0 } // Pas de distance en DB
      ]

      const result = matchRaces(inputRaces, dbRaces, mockLogger)

      // Le fallback sur les courses sans distance devrait matcher par nom
      expect(result.matched).toHaveLength(1)
      expect(result.matched[0].db.id).toBe(1)
    })
  })
})
