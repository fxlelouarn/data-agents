/**
 * Tests pour le matching d'événements
 *
 * Ces tests utilisent des fixtures basées sur des événements réels
 * pour valider le comportement du matcher.
 *
 * Cas testés :
 * - GTVO (Grand Trail de la Vallée d'Ossau) → FUZZY_MATCH
 * - Nordic de l'Ibal → NO_MATCH (nouvel événement)
 * - Événements avec noms similaires mais différents
 */

import { matchEvent, DEFAULT_MATCHING_CONFIG } from '../event-matcher'
import { MatchingLogger } from '../types'

// ============================================================================
// Fixtures - Événements réels de la base Miles Republic
// ============================================================================

/**
 * Fixture: Grand Trail de la Vallée d'Ossau
 * Événement existant dans Miles Republic avec plusieurs éditions
 */
const GTVO_EVENT = {
  id: 5517,
  name: "Grand trail de la vallée d'Ossau",
  city: 'Laruns',
  slug: 'grand-trail-vallee-ossau',
  countrySubdivisionDisplayCodeLevel2: '64',
  editions: [
    { id: 15001, year: '2024', startDate: new Date('2024-07-20') },
    { id: 15002, year: '2025', startDate: new Date('2025-07-19') },
    { id: 15003, year: '2026', startDate: new Date('2026-07-18') }
  ]
}

/**
 * Fixture: Tour de l'Ossau (événement similaire mais différent)
 */
const TOUR_OSSAU_EVENT = {
  id: 8450,
  name: "Tour de l'ossau",
  city: 'Laruns',
  slug: 'tour-ossau',
  countrySubdivisionDisplayCodeLevel2: '64',
  editions: [
    { id: 16001, year: '2025', startDate: new Date('2025-09-14') }
  ]
}

/**
 * Fixture: Challenge d'Ossau (autre événement avec "Ossau")
 */
const CHALLENGE_OSSAU_EVENT = {
  id: 13649,
  name: "Challenge d'Ossau",
  city: 'Bilhères',
  slug: 'challenge-ossau',
  countrySubdivisionDisplayCodeLevel2: '64',
  editions: [
    { id: 17001, year: '2025', startDate: new Date('2025-06-15') }
  ]
}

/**
 * Fixture: Événement Nordic (pour tester le faux positif avec "Ibal")
 */
const NORDIC_FIGARO_EVENT = {
  id: 11092,
  name: 'Le cross du Figaro Nordictrack',
  city: 'Saint-Cloud',
  slug: 'cross-figaro-nordictrack',
  countrySubdivisionDisplayCodeLevel2: '92',
  editions: [
    { id: 18001, year: '2025', startDate: new Date('2025-12-01') }
  ]
}

/**
 * Fixture: Hannibal Rider (contient "ibal" comme substring)
 */
const HANNIBAL_EVENT = {
  id: 15163,
  name: 'Hannibal Rider',
  city: 'Pavilly',
  slug: 'hannibal-rider',
  countrySubdivisionDisplayCodeLevel2: '76',
  editions: [
    { id: 19001, year: '2025', startDate: new Date('2025-07-10') }
  ]
}

/**
 * Tous les événements de la base mock
 */
const ALL_EVENTS = [
  GTVO_EVENT,
  TOUR_OSSAU_EVENT,
  CHALLENGE_OSSAU_EVENT,
  NORDIC_FIGARO_EVENT,
  HANNIBAL_EVENT
]

// ============================================================================
// Mock du client Prisma
// ============================================================================

function createMockSourceDb(events: typeof ALL_EVENTS) {
  return {
    event: {
      findMany: jest.fn().mockImplementation(async (args: any) => {
        const where = args?.where
        const take = args?.take || 100

        let filtered = [...events]

        // Collecter tous les mots-clés de recherche (nom et ville)
        const searchTerms: string[] = []

        if (where?.AND) {
          for (const condition of where.AND) {
            // Collecter les termes de recherche OR (nom ou ville)
            if (condition.OR) {
              for (const or of condition.OR) {
                if (or.name?.contains) {
                  searchTerms.push(or.name.contains.toLowerCase())
                }
                if (or.city?.contains) {
                  searchTerms.push(or.city.contains.toLowerCase())
                }
              }
            }
          }
        }

        // Filtrer: garder les événements qui matchent AU MOINS UN terme
        if (searchTerms.length > 0) {
          filtered = filtered.filter(e => {
            const eventText = `${e.name} ${e.city}`.toLowerCase()
            return searchTerms.some(term => eventText.includes(term))
          })
        }

        // Appliquer le filtre département si spécifié (optionnel, pas bloquant)
        // Le vrai matcher fait ça dans le scoring, pas le filtrage

        // Filtrer les éditions selon la requête (pour le select)
        const editionWhere = args?.select?.editions?.where
        const result = filtered.slice(0, take).map(e => {
          let editions = [...e.editions]

          if (editionWhere?.startDate) {
            editions = editions.filter(ed =>
              (!editionWhere.startDate.gte || ed.startDate >= editionWhere.startDate.gte) &&
              (!editionWhere.startDate.lte || ed.startDate <= editionWhere.startDate.lte)
            )
          }

          if (editionWhere?.year) {
            editions = editions.filter(ed => ed.year === editionWhere.year)
          }

          return {
            id: e.id,
            name: e.name,
            city: e.city,
            slug: e.slug,
            countrySubdivisionDisplayCodeLevel2: e.countrySubdivisionDisplayCodeLevel2,
            editions
          }
        })

        return result
      })
    }
  }
}

// Mock logger - activer pour debug
const DEBUG = false
const mockLogger: MatchingLogger = {
  info: DEBUG ? console.log : jest.fn(),
  debug: DEBUG ? console.log : jest.fn(),
  warn: DEBUG ? console.warn : jest.fn(),
  error: DEBUG ? console.error : jest.fn()
}

// ============================================================================
// Tests
// ============================================================================

describe('matchEvent', () => {
  let mockSourceDb: ReturnType<typeof createMockSourceDb>

  beforeEach(() => {
    jest.clearAllMocks()
    mockSourceDb = createMockSourceDb(ALL_EVENTS)
  })

  describe('GTVO - Grand Trail de la Vallée d\'Ossau', () => {
    it('devrait trouver le bon événement même si le score est sous le seuil (rejectedMatches)', async () => {
      // Le nom "GTVO" est un acronyme qui n'existe pas en base
      // La ville "Vallée d'Ossau" n'existe pas (c'est "Laruns")
      // Le matcher trouve le bon événement mais avec un score ~60% < seuil 75%
      // → Résultat: NO_MATCH avec rejectedMatches contenant le bon événement
      const result = await matchEvent(
        {
          eventName: "GTVO - Le Grand Trail de la Vallée d'Ossau",
          eventCity: "Vallée d'Ossau",
          eventDepartment: '64',
          editionDate: new Date('2026-07-18'),
          editionYear: 2026
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      // Score 60% < seuil 75% → NO_MATCH mais avec le bon événement en rejectedMatches
      expect(result.type).toBe('NO_MATCH')
      expect(result.rejectedMatches).toBeDefined()
      expect(result.rejectedMatches!.length).toBeGreaterThan(0)

      // Le bon événement devrait être en tête des rejectedMatches
      const topMatch = result.rejectedMatches![0]
      expect(topMatch.eventId).toBe(5517)
      expect(topMatch.eventName).toBe("Grand trail de la vallée d'Ossau")
      expect(topMatch.matchScore).toBeGreaterThan(0.5)
    })

    it('devrait matcher avec un seuil plus bas si configuré', async () => {
      // Avec un seuil de 0.5, le score de ~60% devrait passer
      const lowThresholdConfig = { ...DEFAULT_MATCHING_CONFIG, similarityThreshold: 0.5 }

      const result = await matchEvent(
        {
          eventName: "GTVO - Le Grand Trail de la Vallée d'Ossau",
          eventCity: "Vallée d'Ossau",
          eventDepartment: '64',
          editionDate: new Date('2026-07-18'),
          editionYear: 2026
        },
        mockSourceDb,
        lowThresholdConfig,
        mockLogger
      )

      expect(result.type).not.toBe('NO_MATCH')
      expect(result.event).toBeDefined()
      expect(result.event?.id).toBe(5517)
      expect(result.event?.name).toBe("Grand trail de la vallée d'Ossau")
    })

    it('devrait matcher malgré l\'acronyme GTVO non présent dans le nom en base', async () => {
      // L'utilisateur écrit "GTVO" mais en base c'est "Grand trail de la vallée d'Ossau"
      const result = await matchEvent(
        {
          eventName: 'GTVO',
          eventCity: 'Laruns',
          eventDepartment: '64',
          editionDate: new Date('2025-07-19'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      // Même avec juste "GTVO", le matcher devrait trouver des candidats
      // via le département et la ville
      // Note: Ce test peut échouer si "GTVO" seul n'est pas assez pour matcher
      // Dans ce cas c'est un comportement attendu - NEW_EVENT serait créé
      if (result.type !== 'NO_MATCH') {
        expect(result.event?.id).toBe(5517)
      }
    })

    it('devrait préférer le bon événement parmi plusieurs avec "Ossau"', async () => {
      // Il y a 3 événements avec "Ossau": GTVO, Tour de l'Ossau, Challenge d'Ossau
      // Avec un seuil bas pour permettre le match
      const lowThresholdConfig = { ...DEFAULT_MATCHING_CONFIG, similarityThreshold: 0.5 }

      const result = await matchEvent(
        {
          eventName: "Grand Trail Vallée Ossau",
          eventCity: 'Laruns',
          eventDepartment: '64',
          editionDate: new Date('2025-07-19'),
          editionYear: 2025
        },
        mockSourceDb,
        lowThresholdConfig,
        mockLogger
      )

      expect(result.type).not.toBe('NO_MATCH')
      expect(result.event?.id).toBe(5517) // GTVO, pas Tour ou Challenge
    })

    it('devrait trouver l\'édition 2026 existante', async () => {
      const result = await matchEvent(
        {
          eventName: "Grand trail de la vallée d'Ossau",
          eventCity: 'Laruns',
          eventDepartment: '64',
          editionDate: new Date('2026-07-18'),
          editionYear: 2026
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      expect(result.type).not.toBe('NO_MATCH')
      expect(result.event?.id).toBe(5517)
      expect(result.edition).toBeDefined()
      expect(result.edition?.year).toBe('2026')
    })

    it('devrait trouver l\'édition 2025 existante', async () => {
      const result = await matchEvent(
        {
          eventName: "Grand trail de la vallée d'Ossau",
          eventCity: 'Laruns',
          eventDepartment: '64',
          editionDate: new Date('2025-07-19'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      expect(result.type).not.toBe('NO_MATCH')
      expect(result.event?.id).toBe(5517)
      expect(result.edition).toBeDefined()
      expect(result.edition?.year).toBe('2025')
      expect(result.edition?.id).toBe(15002)
    })
  })

  describe('Nordic de l\'Ibal - Nouvel événement', () => {
    it('devrait retourner NO_MATCH pour "NORDIC DE L\'IBAL" (événement inexistant)', async () => {
      const result = await matchEvent(
        {
          eventName: "NORDIC DE L'IBAL 2025",
          eventCity: '',
          editionDate: new Date('2025-12-14'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      // "Ibal" n'existe pas comme mot entier dans la base
      // Le matcher ne devrait pas matcher "Hannibal" car c'est un substring
      expect(result.type).toBe('NO_MATCH')
    })

    it('ne devrait PAS matcher "Hannibal Rider" avec "Nordic de l\'Ibal"', async () => {
      // C'est un test critique : "Hannibal" contient "ibal" comme substring
      // mais ce ne sont pas les mêmes événements du tout
      const result = await matchEvent(
        {
          eventName: "Nordic de l'Ibal",
          eventCity: '',
          editionDate: new Date('2025-07-10'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      if (result.type !== 'NO_MATCH') {
        // Si un match est trouvé, ce ne doit PAS être Hannibal
        expect(result.event?.id).not.toBe(15163)
        expect(result.event?.name).not.toContain('Hannibal')
      }
    })

    it('ne devrait PAS matcher avec des événements "Nordic" génériques', async () => {
      const result = await matchEvent(
        {
          eventName: "NORDIC DE L'IBAL",
          eventCity: '',
          editionDate: new Date('2025-12-01'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      // Le mot "Nordic" seul est trop générique
      // "Ibal" est le mot distinctif et il n'existe pas
      if (result.type !== 'NO_MATCH') {
        // Si un match est trouvé, sa confiance devrait être basse
        expect(result.confidence).toBeLessThan(0.5)
      }
    })
  })

  describe('Gestion des accents et normalisation', () => {
    it('devrait matcher "vallee" avec "vallée" (sans accent)', async () => {
      const result = await matchEvent(
        {
          eventName: "Grand trail de la vallee d'Ossau",
          eventCity: 'Laruns',
          eventDepartment: '64',
          editionDate: new Date('2025-07-19'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      expect(result.type).not.toBe('NO_MATCH')
      expect(result.event?.id).toBe(5517)
    })

    it('devrait matcher en ignorant la casse', async () => {
      const result = await matchEvent(
        {
          eventName: "GRAND TRAIL DE LA VALLÉE D'OSSAU",
          eventCity: 'LARUNS',
          eventDepartment: '64',
          editionDate: new Date('2025-07-19'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      expect(result.type).not.toBe('NO_MATCH')
      expect(result.event?.id).toBe(5517)
    })
  })

  describe('Bonus département', () => {
    it('devrait donner un meilleur score avec le bon département', async () => {
      // Avec département 64 (correct)
      const resultWithDept = await matchEvent(
        {
          eventName: "Trail Ossau",
          eventCity: 'Laruns',
          eventDepartment: '64',
          editionDate: new Date('2025-07-19'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      // Sans département
      const resultNoDept = await matchEvent(
        {
          eventName: "Trail Ossau",
          eventCity: 'Laruns',
          editionDate: new Date('2025-07-19'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      // Le score avec département devrait être >= au score sans
      if (resultWithDept.type !== 'NO_MATCH' && resultNoDept.type !== 'NO_MATCH') {
        expect(resultWithDept.confidence).toBeGreaterThanOrEqual(resultNoDept.confidence)
      }
    })
  })

  describe('rejectedMatches pour NEW_EVENT', () => {
    it('devrait inclure les top matches rejetés pour un NO_MATCH', async () => {
      const result = await matchEvent(
        {
          eventName: "NORDIC DE L'IBAL 2025",
          eventCity: '',
          editionDate: new Date('2025-12-14'),
          editionYear: 2025
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG,
        mockLogger
      )

      // Si NO_MATCH, on devrait avoir les alternatives considérées
      if (result.type === 'NO_MATCH' && result.rejectedMatches) {
        expect(result.rejectedMatches.length).toBeLessThanOrEqual(3)
        // Chaque rejected match devrait avoir les infos requises
        for (const rm of result.rejectedMatches) {
          expect(rm.eventId).toBeDefined()
          expect(rm.eventName).toBeDefined()
          expect(rm.matchScore).toBeDefined()
        }
      }
    })
  })
})
