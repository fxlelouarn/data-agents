/**
 * Tests unitaires : Tri des propositions par proposedStartDate
 *
 * Vérifie que la logique de tri fonctionne correctement selon le paramètre `sort`:
 * - date-asc: proposedStartDate croissant, NULL à la fin
 * - date-desc: proposedStartDate décroissant, NULL à la fin
 * - created-desc: createdAt décroissant (défaut)
 *
 * Note: Ces tests sont unitaires et ne nécessitent pas de base de données.
 * Ils testent la logique de tri en isolation.
 */

import { describe, test, expect } from '@jest/globals'

// Type simplifié pour les tests
interface TestProposal {
  id: string
  proposedStartDate: Date | null
  createdAt: Date
}

/**
 * Fonction de tri simulant le comportement Prisma:
 * orderBy: [
 *   { proposedStartDate: { sort: 'asc', nulls: 'last' } },
 *   { createdAt: 'desc' }
 * ]
 */
function sortByDateAsc(proposals: TestProposal[]): TestProposal[] {
  return [...proposals].sort((a, b) => {
    // NULL à la fin
    if (a.proposedStartDate === null && b.proposedStartDate === null) {
      // Les deux sont null, trier par createdAt DESC
      return b.createdAt.getTime() - a.createdAt.getTime()
    }
    if (a.proposedStartDate === null) return 1  // a va à la fin
    if (b.proposedStartDate === null) return -1 // b va à la fin

    // Les deux ont des dates, trier par proposedStartDate ASC
    const dateDiff = a.proposedStartDate.getTime() - b.proposedStartDate.getTime()
    if (dateDiff !== 0) return dateDiff

    // Dates égales, trier par createdAt DESC
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

/**
 * Fonction de tri simulant le comportement Prisma:
 * orderBy: [
 *   { proposedStartDate: { sort: 'desc', nulls: 'last' } },
 *   { createdAt: 'desc' }
 * ]
 */
function sortByDateDesc(proposals: TestProposal[]): TestProposal[] {
  return [...proposals].sort((a, b) => {
    // NULL à la fin
    if (a.proposedStartDate === null && b.proposedStartDate === null) {
      return b.createdAt.getTime() - a.createdAt.getTime()
    }
    if (a.proposedStartDate === null) return 1
    if (b.proposedStartDate === null) return -1

    // Les deux ont des dates, trier par proposedStartDate DESC
    const dateDiff = b.proposedStartDate.getTime() - a.proposedStartDate.getTime()
    if (dateDiff !== 0) return dateDiff

    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

/**
 * Fonction de tri par createdAt DESC (défaut)
 */
function sortByCreatedDesc(proposals: TestProposal[]): TestProposal[] {
  return [...proposals].sort((a, b) => {
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

describe('Tri des propositions - Logique de tri', () => {
  const now = new Date()

  // Données de test
  const createTestProposals = (): TestProposal[] => [
    {
      id: 'prop-date-10',
      proposedStartDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // +10 jours
      createdAt: new Date(now.getTime() - 2000) // Créée il y a 2 secondes
    },
    {
      id: 'prop-date-30',
      proposedStartDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // +30 jours
      createdAt: new Date(now.getTime() - 1000) // Créée il y a 1 seconde
    },
    {
      id: 'prop-no-date',
      proposedStartDate: null,
      createdAt: new Date(now.getTime() - 3000) // Créée il y a 3 secondes
    },
    {
      id: 'prop-date-60',
      proposedStartDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), // +60 jours
      createdAt: new Date(now.getTime() - 4000) // Créée il y a 4 secondes
    }
  ]

  test('Tri date-asc: propositions avec dates proches en premier, NULL à la fin', () => {
    const proposals = createTestProposals()
    const sorted = sortByDateAsc(proposals)

    expect(sorted).toHaveLength(4)

    // Premier: date +10 jours (la plus proche)
    expect(sorted[0].id).toBe('prop-date-10')
    expect(sorted[0].proposedStartDate).not.toBeNull()

    // Deuxième: date +30 jours
    expect(sorted[1].id).toBe('prop-date-30')

    // Troisième: date +60 jours
    expect(sorted[2].id).toBe('prop-date-60')

    // Dernier: NULL (à la fin)
    expect(sorted[3].id).toBe('prop-no-date')
    expect(sorted[3].proposedStartDate).toBeNull()
  })

  test('Tri date-desc: propositions avec dates éloignées en premier, NULL à la fin', () => {
    const proposals: TestProposal[] = [
      {
        id: 'prop-close',
        proposedStartDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // +5 jours
        createdAt: new Date(now.getTime() - 1000)
      },
      {
        id: 'prop-far',
        proposedStartDate: new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000), // +100 jours
        createdAt: new Date(now.getTime() - 2000)
      },
      {
        id: 'prop-null',
        proposedStartDate: null,
        createdAt: new Date(now.getTime() - 3000)
      }
    ]

    const sorted = sortByDateDesc(proposals)

    expect(sorted).toHaveLength(3)

    // Premier: date +100 jours (la plus éloignée)
    expect(sorted[0].id).toBe('prop-far')

    // Deuxième: date +5 jours
    expect(sorted[1].id).toBe('prop-close')

    // Dernier: NULL (à la fin, même en desc)
    expect(sorted[2].id).toBe('prop-null')
    expect(sorted[2].proposedStartDate).toBeNull()
  })

  test('Tri created-desc: propositions récentes en premier (ignore proposedStartDate)', () => {
    const proposals: TestProposal[] = [
      {
        id: 'prop-recent',
        proposedStartDate: new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000), // Date lointaine
        createdAt: new Date(now.getTime()) // Maintenant
      },
      {
        id: 'prop-old',
        proposedStartDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // Date proche
        createdAt: new Date(now.getTime() - 10000) // Il y a 10 secondes
      },
      {
        id: 'prop-middle',
        proposedStartDate: null, // Pas de date
        createdAt: new Date(now.getTime() - 5000) // Il y a 5 secondes
      }
    ]

    const sorted = sortByCreatedDesc(proposals)

    expect(sorted).toHaveLength(3)

    // Premier: créée maintenant (la plus récente)
    expect(sorted[0].id).toBe('prop-recent')

    // Deuxième: créée il y a 5 secondes
    expect(sorted[1].id).toBe('prop-middle')

    // Dernier: créée il y a 10 secondes (la plus ancienne)
    expect(sorted[2].id).toBe('prop-old')
  })

  test('Fallback: propositions NULL triées par createdAt entre elles', () => {
    const proposals: TestProposal[] = [
      {
        id: 'prop-with-date',
        proposedStartDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - 1000) // Créée il y a 1 seconde
      },
      {
        id: 'prop-null-old',
        proposedStartDate: null,
        createdAt: new Date(now.getTime() - 10000) // Il y a 10 secondes (la plus ancienne des NULL)
      },
      {
        id: 'prop-null-recent',
        proposedStartDate: null,
        createdAt: new Date(now.getTime() - 2000) // Il y a 2 secondes (la plus récente des NULL)
      },
      {
        id: 'prop-null-middle',
        proposedStartDate: null,
        createdAt: new Date(now.getTime() - 5000) // Il y a 5 secondes
      }
    ]

    const sorted = sortByDateAsc(proposals)

    expect(sorted).toHaveLength(4)

    // Premier: la seule avec une date
    expect(sorted[0].id).toBe('prop-with-date')
    expect(sorted[0].proposedStartDate).not.toBeNull()

    // Les 3 suivants sont NULL, triés par createdAt DESC
    expect(sorted[1].proposedStartDate).toBeNull()
    expect(sorted[2].proposedStartDate).toBeNull()
    expect(sorted[3].proposedStartDate).toBeNull()

    // Parmi les NULL: récent > middle > old (ordre createdAt DESC)
    expect(sorted[1].id).toBe('prop-null-recent')
    expect(sorted[2].id).toBe('prop-null-middle')
    expect(sorted[3].id).toBe('prop-null-old')
  })

  test('Tri date-asc avec égalité de dates: départage par createdAt DESC', () => {
    const sameDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const proposals: TestProposal[] = [
      {
        id: 'prop-same-date-old',
        proposedStartDate: sameDate,
        createdAt: new Date(now.getTime() - 10000) // Créée il y a 10 secondes
      },
      {
        id: 'prop-same-date-recent',
        proposedStartDate: sameDate,
        createdAt: new Date(now.getTime() - 1000) // Créée il y a 1 seconde
      },
      {
        id: 'prop-same-date-middle',
        proposedStartDate: sameDate,
        createdAt: new Date(now.getTime() - 5000) // Créée il y a 5 secondes
      }
    ]

    const sorted = sortByDateAsc(proposals)

    expect(sorted).toHaveLength(3)

    // Toutes les dates sont égales, donc tri par createdAt DESC
    expect(sorted[0].id).toBe('prop-same-date-recent')
    expect(sorted[1].id).toBe('prop-same-date-middle')
    expect(sorted[2].id).toBe('prop-same-date-old')
  })

  test('Liste vide ne génère pas d\'erreur', () => {
    const proposals: TestProposal[] = []

    expect(sortByDateAsc(proposals)).toEqual([])
    expect(sortByDateDesc(proposals)).toEqual([])
    expect(sortByCreatedDesc(proposals)).toEqual([])
  })

  test('Liste avec un seul élément', () => {
    const proposals: TestProposal[] = [
      {
        id: 'single',
        proposedStartDate: new Date(),
        createdAt: new Date()
      }
    ]

    expect(sortByDateAsc(proposals)).toHaveLength(1)
    expect(sortByDateAsc(proposals)[0].id).toBe('single')
  })

  test('Liste avec uniquement des NULL', () => {
    const proposals: TestProposal[] = [
      { id: 'null-1', proposedStartDate: null, createdAt: new Date(now.getTime() - 1000) },
      { id: 'null-2', proposedStartDate: null, createdAt: new Date(now.getTime() - 3000) },
      { id: 'null-3', proposedStartDate: null, createdAt: new Date(now.getTime() - 2000) }
    ]

    const sorted = sortByDateAsc(proposals)

    // Tous NULL, donc triés par createdAt DESC
    expect(sorted[0].id).toBe('null-1') // Le plus récent
    expect(sorted[1].id).toBe('null-3')
    expect(sorted[2].id).toBe('null-2') // Le plus ancien
  })
})

describe('ProposalService.extractStartDate - Extraction automatique', () => {

  /**
   * Simule la logique d'extraction de ProposalService.extractStartDate
   */
  function extractStartDate(changes: Record<string, any>): Date | null {
    // Cas 1: changes.startDate directement (string ou Date)
    if (changes.startDate) {
      const startDateValue = changes.startDate

      // Si c'est un objet {old, new}, prendre .new
      if (typeof startDateValue === 'object' && startDateValue !== null && 'new' in startDateValue) {
        return new Date(startDateValue.new as string)
      }

      // Sinon c'est directement une valeur
      if (typeof startDateValue === 'string') {
        return new Date(startDateValue)
      }
      if (startDateValue instanceof Date) {
        return startDateValue
      }
    }

    // Cas 2: changes.edition.new.startDate (NEW_EVENT)
    if (changes.edition?.new?.startDate) {
      return new Date(changes.edition.new.startDate)
    }

    // Cas 3: changes.edition.startDate (format simplifié)
    if (changes.edition?.startDate) {
      const editionStartDate = changes.edition.startDate
      if (typeof editionStartDate === 'object' && 'new' in editionStartDate) {
        return new Date(editionStartDate.new as string)
      }
      return new Date(editionStartDate)
    }

    return null
  }

  test('Extraction depuis changes.startDate (format ISO string)', () => {
    const changes = {
      startDate: '2025-06-15T00:00:00.000Z',
      name: 'Test Event'
    }

    const extractedDate = extractStartDate(changes)

    expect(extractedDate).not.toBeNull()
    expect(extractedDate?.toISOString()).toBe('2025-06-15T00:00:00.000Z')
  })

  test('Extraction depuis changes.startDate (objet {old, new})', () => {
    const changes = {
      startDate: {
        old: '2025-05-01T00:00:00.000Z',
        new: '2025-06-15T00:00:00.000Z'
      }
    }

    const extractedDate = extractStartDate(changes)

    expect(extractedDate).not.toBeNull()
    expect(extractedDate?.toISOString()).toBe('2025-06-15T00:00:00.000Z')
  })

  test('Extraction depuis changes.edition.new.startDate (NEW_EVENT)', () => {
    const changes = {
      name: 'Trail des Montagnes',
      edition: {
        new: {
          year: 2025,
          startDate: '2025-07-20T08:00:00.000Z'
        }
      }
    }

    const extractedDate = extractStartDate(changes)

    expect(extractedDate).not.toBeNull()
    expect(extractedDate?.toISOString()).toBe('2025-07-20T08:00:00.000Z')
  })

  test('Extraction depuis changes.edition.startDate (format simplifié)', () => {
    const changes = {
      edition: {
        startDate: '2025-08-15T10:00:00.000Z'
      }
    }

    const extractedDate = extractStartDate(changes)

    expect(extractedDate).not.toBeNull()
    expect(extractedDate?.toISOString()).toBe('2025-08-15T10:00:00.000Z')
  })

  test('Pas de startDate → retourne null', () => {
    const changes = {
      name: { old: 'Ancien nom', new: 'Nouveau nom' },
      city: { old: 'Paris', new: 'Lyon' }
    }

    const extractedDate = extractStartDate(changes)

    expect(extractedDate).toBeNull()
  })

  test('Changes vide → retourne null', () => {
    const changes = {}

    const extractedDate = extractStartDate(changes)

    expect(extractedDate).toBeNull()
  })

  test('Priorité: changes.startDate avant changes.edition.new.startDate', () => {
    const changes = {
      startDate: '2025-06-01T00:00:00.000Z', // Prioritaire
      edition: {
        new: {
          startDate: '2025-07-01T00:00:00.000Z' // Ignoré
        }
      }
    }

    const extractedDate = extractStartDate(changes)

    expect(extractedDate?.toISOString()).toBe('2025-06-01T00:00:00.000Z')
  })
})
