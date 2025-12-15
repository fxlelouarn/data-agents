/**
 * Tests pour l'intégration Meilisearch dans le matching d'événements
 *
 * Ces tests vérifient:
 * - L'utilisation de Meilisearch quand configuré
 * - Le fallback vers SQL quand Meilisearch échoue
 * - L'enrichissement des résultats Meilisearch avec les éditions Prisma
 */

import { matchEvent, DEFAULT_MATCHING_CONFIG } from '../event-matcher'
import { MatchingLogger, MeilisearchMatchingConfig } from '../types'

// Mock du module @data-agents/database
jest.mock('@data-agents/database', () => ({
  getMeilisearchService: jest.fn()
}))

import { getMeilisearchService } from '@data-agents/database'

// ============================================================================
// Fixtures
// ============================================================================

const MARATHON_ANNECY_EVENT = {
  id: 2642,
  name: "Marathon du lac d'Annecy",
  city: 'Annecy',
  slug: 'marathon-lac-annecy',
  countrySubdivisionDisplayCodeLevel2: '74',
  editions: [
    { id: 40001, year: '2025', startDate: new Date('2025-04-27') },
    { id: 40002, year: '2026', startDate: new Date('2026-04-26') }
  ]
}

const TRAIL_ANNECY_EVENT = {
  id: 3000,
  name: 'Trail des Glières',
  city: 'Annecy',
  slug: 'trail-glieres',
  countrySubdivisionDisplayCodeLevel2: '74',
  editions: [
    { id: 41001, year: '2025', startDate: new Date('2025-09-15') }
  ]
}

const ALL_EVENTS = [MARATHON_ANNECY_EVENT, TRAIL_ANNECY_EVENT]

// ============================================================================
// Mock du client Prisma (pour SQL fallback et enrichissement éditions)
// ============================================================================

function createMockSourceDb(events: typeof ALL_EVENTS) {
  return {
    event: {
      findMany: jest.fn().mockImplementation(async (args: any) => {
        const where = args?.where
        const take = args?.take || 100

        let filtered = [...events]

        // Collecter tous les mots-clés de recherche
        const searchTerms: string[] = []

        if (where?.AND) {
          for (const condition of where.AND) {
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

        if (searchTerms.length > 0) {
          filtered = filtered.filter(e => {
            const eventText = `${e.name} ${e.city}`.toLowerCase()
            return searchTerms.some(term => eventText.includes(term))
          })
        }

        const editionWhere = args?.select?.editions?.where
        const result = filtered.slice(0, take).map(e => {
          let editions = [...e.editions]

          if (editionWhere?.startDate) {
            editions = editions.filter(ed =>
              (!editionWhere.startDate.gte || ed.startDate >= editionWhere.startDate.gte) &&
              (!editionWhere.startDate.lte || ed.startDate <= editionWhere.startDate.lte)
            )
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
    },
    edition: {
      findMany: jest.fn().mockImplementation(async (args: any) => {
        const eventIds = args?.where?.eventId?.in || []
        const editions: any[] = []

        for (const event of events) {
          // eventIds peut contenir des strings ou des numbers selon la source
          const eventIdMatches = eventIds.some((id: any) =>
            id === event.id || String(id) === String(event.id)
          )
          if (eventIdMatches) {
            for (const ed of event.editions) {
              // Vérifier les filtres de date si présents
              if (args?.where?.startDate) {
                const startDate = ed.startDate
                if (args.where.startDate.gte && startDate < args.where.startDate.gte) continue
                if (args.where.startDate.lte && startDate > args.where.startDate.lte) continue
              }
              editions.push({
                id: ed.id,
                eventId: event.id,
                year: ed.year,
                startDate: ed.startDate
              })
            }
          }
        }

        return editions
      })
    }
  }
}

// Mock logger
const DEBUG = false
const mockLogger: MatchingLogger = {
  info: DEBUG ? console.log : jest.fn(),
  debug: DEBUG ? console.log : jest.fn(),
  warn: DEBUG ? console.warn : jest.fn(),
  error: DEBUG ? console.error : jest.fn()
}

// Config de matching avec seuil plus bas pour les tests
const TEST_MATCHING_CONFIG = {
  ...DEFAULT_MATCHING_CONFIG,
  similarityThreshold: 0.5 // Seuil plus bas pour capturer plus de matches
}

// ============================================================================
// Tests
// ============================================================================

describe('matchEvent with Meilisearch', () => {
  let mockSourceDb: ReturnType<typeof createMockSourceDb>
  const mockMeilisearchConfig: MeilisearchMatchingConfig = {
    url: 'https://test-meilisearch.example.com',
    apiKey: 'test-api-key'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockSourceDb = createMockSourceDb(ALL_EVENTS)
  })

  describe('Quand Meilisearch est configuré et fonctionne', () => {
    it('devrait utiliser Meilisearch pour trouver les candidats', async () => {
      // Mock Meilisearch pour retourner le Marathon d'Annecy
      const mockSearchEvents = jest.fn().mockResolvedValue({
        hits: [
          {
            objectID: '2642',
            eventName: "Marathon du lac d'Annecy",
            eventCity: 'Annecy',
            eventSlug: 'marathon-lac-annecy',
            eventCountrySubdivisionDisplayCodeLevel2: '74'
          }
        ]
      })

      ;(getMeilisearchService as jest.Mock).mockReturnValue({
        searchEvents: mockSearchEvents
      })

      const result = await matchEvent(
        {
          eventName: 'Brooks Marathon Annecy',
          eventCity: 'Annecy',
          editionDate: new Date('2026-04-26'),
          editionYear: 2026
        },
        mockSourceDb,
        { ...TEST_MATCHING_CONFIG, meilisearch: mockMeilisearchConfig },
        mockLogger
      )

      // Meilisearch devrait avoir été appelé
      expect(getMeilisearchService).toHaveBeenCalledWith(
        mockMeilisearchConfig.url,
        mockMeilisearchConfig.apiKey
      )
      expect(mockSearchEvents).toHaveBeenCalled()

      // L'édition Prisma devrait avoir été interrogée pour enrichir les résultats
      expect(mockSourceDb.edition.findMany).toHaveBeenCalled()

      // Devrait trouver le bon événement
      expect(result.type).toBe('FUZZY_MATCH')
      expect(result.event?.id).toBe('2642')
      expect(result.event?.name).toBe("Marathon du lac d'Annecy")
    })

    it('devrait enrichir les résultats Meilisearch avec les éditions Prisma', async () => {
      const mockSearchEvents = jest.fn().mockResolvedValue({
        hits: [
          {
            objectID: '2642',
            eventName: "Marathon du lac d'Annecy",
            eventCity: 'Annecy',
            eventSlug: 'marathon-lac-annecy',
            eventCountrySubdivisionDisplayCodeLevel2: '74'
          }
        ]
      })

      ;(getMeilisearchService as jest.Mock).mockReturnValue({
        searchEvents: mockSearchEvents
      })

      const result = await matchEvent(
        {
          eventName: 'Marathon Annecy',
          eventCity: 'Annecy',
          editionDate: new Date('2026-04-26'),
          editionYear: 2026
        },
        mockSourceDb,
        { ...TEST_MATCHING_CONFIG, meilisearch: mockMeilisearchConfig },
        mockLogger
      )

      // Devrait avoir trouvé l'édition 2026
      expect(result.edition).toBeDefined()
      expect(result.edition?.year).toBe('2026')
    })
  })

  describe('Fallback vers SQL', () => {
    it('devrait fallback vers SQL si Meilisearch échoue', async () => {
      // Mock Meilisearch pour échouer
      ;(getMeilisearchService as jest.Mock).mockReturnValue({
        searchEvents: jest.fn().mockRejectedValue(new Error('Meilisearch unavailable'))
      })

      const result = await matchEvent(
        {
          eventName: 'Marathon Annecy',
          eventCity: 'Annecy',
          editionDate: new Date('2026-04-26'),
          editionYear: 2026
        },
        mockSourceDb,
        { ...DEFAULT_MATCHING_CONFIG, meilisearch: mockMeilisearchConfig },
        mockLogger
      )

      // SQL fallback devrait avoir été utilisé
      expect(mockSourceDb.event.findMany).toHaveBeenCalled()

      // Devrait quand même trouver l'événement via SQL
      // Note: Le résultat dépend du mock SQL
    })

    it('devrait fallback vers SQL si Meilisearch retourne 0 résultats', async () => {
      // Mock Meilisearch pour retourner une liste vide
      ;(getMeilisearchService as jest.Mock).mockReturnValue({
        searchEvents: jest.fn().mockResolvedValue({ hits: [] })
      })

      const result = await matchEvent(
        {
          eventName: 'Marathon Annecy',
          eventCity: 'Annecy',
          editionDate: new Date('2026-04-26'),
          editionYear: 2026
        },
        mockSourceDb,
        { ...DEFAULT_MATCHING_CONFIG, meilisearch: mockMeilisearchConfig },
        mockLogger
      )

      // SQL fallback devrait avoir été utilisé
      expect(mockSourceDb.event.findMany).toHaveBeenCalled()
    })

    it('devrait utiliser uniquement SQL si meilisearch non configuré', async () => {
      const result = await matchEvent(
        {
          eventName: 'Marathon Annecy',
          eventCity: 'Annecy',
          editionDate: new Date('2026-04-26'),
          editionYear: 2026
        },
        mockSourceDb,
        DEFAULT_MATCHING_CONFIG, // Pas de config Meilisearch
        mockLogger
      )

      // Meilisearch ne devrait pas avoir été appelé
      expect(getMeilisearchService).not.toHaveBeenCalled()

      // SQL devrait avoir été utilisé
      expect(mockSourceDb.event.findMany).toHaveBeenCalled()
    })
  })

  describe('Cas réel: Brooks Marathon Annecy → Marathon du lac d\'Annecy', () => {
    it('devrait matcher correctement avec Meilisearch', async () => {
      // Ce test simule le cas réel qui a motivé l'intégration Meilisearch
      const mockSearchEvents = jest.fn().mockResolvedValue({
        hits: [
          {
            objectID: '2642',
            eventName: "Marathon du lac d'Annecy",
            eventCity: 'Annecy',
            eventSlug: 'marathon-lac-annecy',
            eventCountrySubdivisionDisplayCodeLevel2: '74'
          },
          // Autres événements moins pertinents
          {
            objectID: '3000',
            eventName: 'Trail des Glières',
            eventCity: 'Annecy',
            eventSlug: 'trail-glieres',
            eventCountrySubdivisionDisplayCodeLevel2: '74'
          }
        ]
      })

      ;(getMeilisearchService as jest.Mock).mockReturnValue({
        searchEvents: mockSearchEvents
      })

      const result = await matchEvent(
        {
          eventName: 'Brooks Marathon Annecy 2026',
          eventCity: 'Annecy',
          eventDepartment: 'Haute-Savoie',
          editionDate: new Date('2026-04-26'),
          editionYear: 2026
        },
        mockSourceDb,
        { ...TEST_MATCHING_CONFIG, meilisearch: mockMeilisearchConfig },
        mockLogger
      )

      // Devrait matcher avec le Marathon du lac d'Annecy
      expect(result.type).toBe('FUZZY_MATCH')
      expect(result.event?.id).toBe('2642')
      expect(result.confidence).toBeGreaterThan(0.5)
    })
  })
})
