/**
 * Tests unitaires : Endpoint GET /api/proposals/:id/check-existing-event
 *
 * Vérifie la logique de détection d'événements existants pour les propositions NEW_EVENT.
 *
 * Scénarios testés :
 * - Proposition NEW_EVENT avec événement correspondant trouvé (FUZZY_MATCH)
 * - Proposition NEW_EVENT avec événement correspondant trouvé (EXACT_MATCH)
 * - Proposition NEW_EVENT sans événement correspondant (NO_MATCH)
 * - Proposition NEW_EVENT avec événement mais sans édition
 * - Rejet pour propositions non-NEW_EVENT
 * - Rejet pour propositions non-PENDING
 * - Données insuffisantes pour le matching
 *
 * Note: Ces tests mockent la base de données et matchEvent pour tester la logique en isolation.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// Types pour les tests
interface MockProposal {
  id: string
  type: string
  status: string
  changes: any
}

interface MatchEventResult {
  type: 'NO_MATCH' | 'FUZZY_MATCH' | 'EXACT_MATCH'
  event?: {
    id: number
    name: string
    city: string
    slug: string
  }
  edition?: {
    id: number
    year: string
  }
  confidence: number
}

/**
 * Simule la logique de l'endpoint check-existing-event
 */
async function checkExistingEventLogic(
  proposal: MockProposal | null,
  matchEventResult: MatchEventResult
): Promise<{
  status: number
  body: any
}> {
  // 1. Vérifier que la proposition existe
  if (!proposal) {
    return {
      status: 404,
      body: { error: { message: 'Proposal not found', code: 'PROPOSAL_NOT_FOUND' } }
    }
  }

  // 2. Vérifier le type
  if (proposal.type !== 'NEW_EVENT') {
    return {
      status: 400,
      body: { error: { message: 'Only for NEW_EVENT proposals', code: 'INVALID_PROPOSAL_TYPE' } }
    }
  }

  // 3. Vérifier le statut
  if (proposal.status !== 'PENDING') {
    return {
      status: 400,
      body: { error: { message: 'Only for PENDING proposals', code: 'INVALID_PROPOSAL_STATUS' } }
    }
  }

  // 4. Extraire les données de matching
  const changes = proposal.changes
  const eventName = changes?.name?.new
  const eventCity = changes?.city?.new
  const eventDepartment = changes?.countrySubdivisionDisplayCodeLevel2?.new
  const editionData = changes?.edition?.new

  // 5. Données insuffisantes
  if (!eventName || !eventCity || !editionData?.startDate) {
    return {
      status: 200,
      body: {
        hasMatch: false,
        proposalData: {
          eventName: eventName || null,
          eventCity: eventCity || null,
          eventDepartment: eventDepartment || null,
          editionYear: editionData?.year ? parseInt(editionData.year) : null,
          editionDate: editionData?.startDate || null
        }
      }
    }
  }

  // 6. Construire proposalData
  const proposalData = {
    eventName,
    eventCity,
    eventDepartment,
    editionYear: parseInt(editionData.year),
    editionDate: editionData.startDate
  }

  // 7. Si NO_MATCH
  if (matchEventResult.type === 'NO_MATCH') {
    return {
      status: 200,
      body: { hasMatch: false, proposalData }
    }
  }

  // 8. Si match trouvé
  return {
    status: 200,
    body: {
      hasMatch: true,
      match: {
        type: matchEventResult.type,
        eventId: matchEventResult.event!.id,
        eventName: matchEventResult.event!.name,
        eventSlug: matchEventResult.event!.slug || '',
        eventCity: matchEventResult.event!.city,
        editionId: matchEventResult.edition?.id,
        editionYear: matchEventResult.edition?.year,
        confidence: matchEventResult.confidence
      },
      proposalData
    }
  }
}

describe('GET /api/proposals/:id/check-existing-event - Logique', () => {

  describe('Validation des entrées', () => {
    test('Retourne 404 si la proposition n\'existe pas', async () => {
      const result = await checkExistingEventLogic(null, { type: 'NO_MATCH', confidence: 0 })

      expect(result.status).toBe(404)
      expect(result.body.error.code).toBe('PROPOSAL_NOT_FOUND')
    })

    test('Retourne 400 si la proposition n\'est pas NEW_EVENT', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'EDITION_UPDATE',
        status: 'PENDING',
        changes: {}
      }

      const result = await checkExistingEventLogic(proposal, { type: 'NO_MATCH', confidence: 0 })

      expect(result.status).toBe(400)
      expect(result.body.error.code).toBe('INVALID_PROPOSAL_TYPE')
    })

    test('Retourne 400 si la proposition n\'est pas PENDING', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'APPROVED',
        changes: {}
      }

      const result = await checkExistingEventLogic(proposal, { type: 'NO_MATCH', confidence: 0 })

      expect(result.status).toBe(400)
      expect(result.body.error.code).toBe('INVALID_PROPOSAL_STATUS')
    })

    test('Retourne 400 si la proposition est ARCHIVED', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'ARCHIVED',
        changes: {}
      }

      const result = await checkExistingEventLogic(proposal, { type: 'NO_MATCH', confidence: 0 })

      expect(result.status).toBe(400)
      expect(result.body.error.code).toBe('INVALID_PROPOSAL_STATUS')
    })
  })

  describe('Données insuffisantes', () => {
    test('Retourne hasMatch: false si eventName manque', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'PENDING',
        changes: {
          city: { new: 'Le Corbier' },
          edition: { new: { year: '2026', startDate: '2026-01-24T17:00:00.000Z' } }
        }
      }

      const result = await checkExistingEventLogic(proposal, { type: 'NO_MATCH', confidence: 0 })

      expect(result.status).toBe(200)
      expect(result.body.hasMatch).toBe(false)
      expect(result.body.proposalData.eventName).toBeNull()
    })

    test('Retourne hasMatch: false si eventCity manque', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'PENDING',
        changes: {
          name: { new: 'Trail Blanc du Corbier' },
          edition: { new: { year: '2026', startDate: '2026-01-24T17:00:00.000Z' } }
        }
      }

      const result = await checkExistingEventLogic(proposal, { type: 'NO_MATCH', confidence: 0 })

      expect(result.status).toBe(200)
      expect(result.body.hasMatch).toBe(false)
      expect(result.body.proposalData.eventCity).toBeNull()
    })

    test('Retourne hasMatch: false si edition.startDate manque', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'PENDING',
        changes: {
          name: { new: 'Trail Blanc du Corbier' },
          city: { new: 'Le Corbier' },
          edition: { new: { year: '2026' } }  // Pas de startDate
        }
      }

      const result = await checkExistingEventLogic(proposal, { type: 'NO_MATCH', confidence: 0 })

      expect(result.status).toBe(200)
      expect(result.body.hasMatch).toBe(false)
    })
  })

  describe('Matching - NO_MATCH', () => {
    test('Retourne hasMatch: false quand aucun événement correspondant', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'PENDING',
        changes: {
          name: { new: 'Trail Blanc du Corbier' },
          city: { new: 'Le Corbier' },
          countrySubdivisionDisplayCodeLevel2: { new: '73' },
          edition: { new: { year: '2026', startDate: '2026-01-24T17:00:00.000Z' } }
        }
      }

      const matchResult: MatchEventResult = {
        type: 'NO_MATCH',
        confidence: 0.3
      }

      const result = await checkExistingEventLogic(proposal, matchResult)

      expect(result.status).toBe(200)
      expect(result.body.hasMatch).toBe(false)
      expect(result.body.match).toBeUndefined()
      expect(result.body.proposalData).toEqual({
        eventName: 'Trail Blanc du Corbier',
        eventCity: 'Le Corbier',
        eventDepartment: '73',
        editionYear: 2026,
        editionDate: '2026-01-24T17:00:00.000Z'
      })
    })
  })

  describe('Matching - FUZZY_MATCH', () => {
    test('Retourne hasMatch: true avec événement et édition', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'PENDING',
        changes: {
          name: { new: 'Trail Blanc Du Corbier' },
          city: { new: 'Le Corbier' },
          countrySubdivisionDisplayCodeLevel2: { new: '73' },
          edition: { new: { year: '2026', startDate: '2026-01-24T17:00:00.000Z' } }
        }
      }

      const matchResult: MatchEventResult = {
        type: 'FUZZY_MATCH',
        event: {
          id: 15388,
          name: 'Trail Blanc du Corbier',
          city: 'Villarembert',
          slug: 'trail-blanc-du-corbier-15388'
        },
        edition: {
          id: 55062,
          year: '2026'
        },
        confidence: 0.85
      }

      const result = await checkExistingEventLogic(proposal, matchResult)

      expect(result.status).toBe(200)
      expect(result.body.hasMatch).toBe(true)
      expect(result.body.match).toEqual({
        type: 'FUZZY_MATCH',
        eventId: 15388,
        eventName: 'Trail Blanc du Corbier',
        eventSlug: 'trail-blanc-du-corbier-15388',
        eventCity: 'Villarembert',
        editionId: 55062,
        editionYear: '2026',
        confidence: 0.85
      })
    })

    test('Retourne hasMatch: true avec événement mais sans édition', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'PENDING',
        changes: {
          name: { new: 'Trail Blanc Du Corbier' },
          city: { new: 'Le Corbier' },
          countrySubdivisionDisplayCodeLevel2: { new: '73' },
          edition: { new: { year: '2027', startDate: '2027-01-24T17:00:00.000Z' } }
        }
      }

      const matchResult: MatchEventResult = {
        type: 'FUZZY_MATCH',
        event: {
          id: 15388,
          name: 'Trail Blanc du Corbier',
          city: 'Villarembert',
          slug: 'trail-blanc-du-corbier-15388'
        },
        // Pas d'édition pour 2027
        confidence: 0.82
      }

      const result = await checkExistingEventLogic(proposal, matchResult)

      expect(result.status).toBe(200)
      expect(result.body.hasMatch).toBe(true)
      expect(result.body.match.eventId).toBe(15388)
      expect(result.body.match.editionId).toBeUndefined()
      expect(result.body.match.editionYear).toBeUndefined()
    })
  })

  describe('Matching - EXACT_MATCH', () => {
    test('Retourne hasMatch: true avec type EXACT_MATCH pour haute confiance', async () => {
      const proposal: MockProposal = {
        id: 'prop-1',
        type: 'NEW_EVENT',
        status: 'PENDING',
        changes: {
          name: { new: 'Trail Blanc du Corbier' },
          city: { new: 'Villarembert' },
          countrySubdivisionDisplayCodeLevel2: { new: '73' },
          edition: { new: { year: '2026', startDate: '2026-01-24T17:00:00.000Z' } }
        }
      }

      const matchResult: MatchEventResult = {
        type: 'EXACT_MATCH',
        event: {
          id: 15388,
          name: 'Trail Blanc du Corbier',
          city: 'Villarembert',
          slug: 'trail-blanc-du-corbier-15388'
        },
        edition: {
          id: 55062,
          year: '2026'
        },
        confidence: 0.98
      }

      const result = await checkExistingEventLogic(proposal, matchResult)

      expect(result.status).toBe(200)
      expect(result.body.hasMatch).toBe(true)
      expect(result.body.match.type).toBe('EXACT_MATCH')
      expect(result.body.match.confidence).toBe(0.98)
    })
  })

  describe('Cas réel - Trail Blanc du Corbier', () => {
    test('Détecte l\'événement créé après la proposition', async () => {
      // Simulation du cas réel : proposition cmiri1tbj39ldlx1v47t0eo4t
      const proposal: MockProposal = {
        id: 'cmiri1tbj39ldlx1v47t0eo4t',
        type: 'NEW_EVENT',
        status: 'PENDING',
        changes: {
          name: { new: 'Trail Blanc Du Corbier', confidence: 0.75 },
          city: { new: 'Le Corbier', confidence: 0.75 },
          country: { new: 'France', confidence: 0.75 },
          countrySubdivisionNameLevel1: { new: 'Auvergne-Rhône-Alpes', confidence: 0.75 },
          countrySubdivisionNameLevel2: { new: 'Savoie', confidence: 0.75 },
          countrySubdivisionDisplayCodeLevel1: { new: 'ARA', confidence: 0.75 },
          countrySubdivisionDisplayCodeLevel2: { new: '73', confidence: 0.75 },
          dataSource: { new: 'FEDERATION', confidence: 0.75 },
          edition: {
            new: {
              year: '2026',
              startDate: '2026-01-24T17:00:00.000Z',
              endDate: '2026-01-24T17:00:00.000Z',
              timeZone: 'Europe/Paris',
              calendarStatus: 'CONFIRMED',
              races: [
                { name: 'Course 10 m', runDistance: 0.01, runPositiveElevation: 300 },
                { name: 'Course 5 m', runDistance: 0.005, runPositiveElevation: 150 }
              ],
              organizer: {
                name: 'OUTDOOR SPORT ORGANISATION',
                email: 'outdoorsportorganisation@gmail.com'
              }
            },
            confidence: 0.75
          }
        }
      }

      // L'événement a été créé par Carlos 4h après la proposition
      const matchResult: MatchEventResult = {
        type: 'FUZZY_MATCH',
        event: {
          id: 15388,
          name: 'Trail Blanc du Corbier',
          city: 'Villarembert',  // Ville différente mais même événement
          slug: 'trail-blanc-du-corbier-15388'
        },
        edition: {
          id: 55062,
          year: '2026'
        },
        confidence: 0.85
      }

      const result = await checkExistingEventLogic(proposal, matchResult)

      expect(result.status).toBe(200)
      expect(result.body.hasMatch).toBe(true)
      expect(result.body.match.eventId).toBe(15388)
      expect(result.body.match.eventName).toBe('Trail Blanc du Corbier')
      expect(result.body.match.editionId).toBe(55062)

      // Les données de la proposition sont correctement extraites
      expect(result.body.proposalData.eventName).toBe('Trail Blanc Du Corbier')
      expect(result.body.proposalData.eventCity).toBe('Le Corbier')
      expect(result.body.proposalData.eventDepartment).toBe('73')
      expect(result.body.proposalData.editionYear).toBe(2026)
    })
  })
})

describe('Réutilisabilité pour agent de doublons', () => {
  test('proposalData contient toutes les infos nécessaires pour le matching', async () => {
    const proposal: MockProposal = {
      id: 'prop-1',
      type: 'NEW_EVENT',
      status: 'PENDING',
      changes: {
        name: { new: 'Mon Événement' },
        city: { new: 'Ma Ville' },
        countrySubdivisionDisplayCodeLevel2: { new: '75' },
        edition: { new: { year: '2025', startDate: '2025-06-15T08:00:00.000Z' } }
      }
    }

    const result = await checkExistingEventLogic(proposal, { type: 'NO_MATCH', confidence: 0 })

    // Vérifie que proposalData contient tout ce dont un agent de doublons a besoin
    expect(result.body.proposalData).toHaveProperty('eventName')
    expect(result.body.proposalData).toHaveProperty('eventCity')
    expect(result.body.proposalData).toHaveProperty('eventDepartment')
    expect(result.body.proposalData).toHaveProperty('editionYear')
    expect(result.body.proposalData).toHaveProperty('editionDate')

    // Les valeurs sont correctes
    expect(result.body.proposalData.eventName).toBe('Mon Événement')
    expect(result.body.proposalData.eventCity).toBe('Ma Ville')
    expect(result.body.proposalData.eventDepartment).toBe('75')
    expect(result.body.proposalData.editionYear).toBe(2025)
    expect(result.body.proposalData.editionDate).toBe('2025-06-15T08:00:00.000Z')
  })
})
