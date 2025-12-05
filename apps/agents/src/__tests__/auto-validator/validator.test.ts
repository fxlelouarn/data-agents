/**
 * Tests unitaires pour la logique de validation de l'AutoValidatorAgent
 *
 * Ces tests vérifient les critères de validation:
 * 1. Confiance minimale
 * 2. Event.isFeatured = false/null
 * 3. Edition.customerType = null
 * 4. Pas de création de nouvelles courses
 */

import { validateProposal, getValidatableBlocks } from '../../auto-validator/validator'
import { AutoValidatorConfig } from '../../auto-validator/types'

// Mock du logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}

// Configuration par défaut pour les tests
const defaultConfig: AutoValidatorConfig = {
  milesRepublicDatabase: 'miles-republic',
  maxProposalsPerRun: 100,
  minConfidence: 0.7,
  enableEditionBlock: true,
  enableOrganizerBlock: true,
  enableRacesBlock: true,
  dryRun: false
}

describe('validateProposal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Confiance minimale', () => {
    it('devrait rejeter une proposition avec une confiance trop basse', async () => {
      const proposal = {
        id: 'test-1',
        confidence: 0.5,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(false)
      expect(result.exclusionReason).toBe('lowConfidence')
      expect(result.reason).toContain('Confiance trop basse')
    })

    it('devrait accepter une proposition avec une confiance suffisante', async () => {
      const proposal = {
        id: 'test-2',
        confidence: 0.8,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(true)
    })

    it('devrait accepter une proposition sans confiance définie', async () => {
      const proposal = {
        id: 'test-3',
        confidence: null,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(true)
    })
  })

  describe('Event.isFeatured', () => {
    it('devrait rejeter une proposition pour un événement featured', async () => {
      const proposal = {
        id: 'test-4',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, name: 'Trail Featured', isFeatured: true }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(false)
      expect(result.exclusionReason).toBe('featuredEvent')
      expect(result.reason).toContain('featured')
    })

    it('devrait accepter une proposition pour un événement non featured', async () => {
      const proposal = {
        id: 'test-5',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(true)
    })

    it('devrait accepter une proposition pour un événement avec isFeatured null', async () => {
      const proposal = {
        id: 'test-6',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: null }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(true)
    })
  })

  describe('Edition.customerType', () => {
    it('devrait rejeter une proposition pour une édition avec client premium', async () => {
      const proposal = {
        id: 'test-7',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: 'PREMIUM', year: '2026' }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(false)
      expect(result.exclusionReason).toBe('premiumCustomer')
      expect(result.reason).toContain('client premium')
    })

    it('devrait accepter une proposition pour une édition sans client', async () => {
      const proposal = {
        id: 'test-8',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(true)
    })
  })

  describe('Nouvelles courses', () => {
    it('devrait rejeter une proposition avec racesToAdd', async () => {
      const proposal = {
        id: 'test-9',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {
          racesToAdd: {
            new: [
              { name: 'Nouvelle Course 10km' },
              { name: 'Nouvelle Course 20km' }
            ]
          }
        }
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(false)
      expect(result.exclusionReason).toBe('newRaces')
      expect(result.reason).toContain('nouvelle(s) course(s)')
    })

    it('devrait rejeter une proposition avec des courses sans raceId dans racesToUpdate', async () => {
      const proposal = {
        id: 'test-10',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {
          racesToUpdate: {
            new: [
              { raceId: 1, raceName: 'Course existante', updates: {} },
              { raceName: 'Nouvelle course sans ID', updates: {} } // Pas de raceId!
            ]
          }
        }
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(false)
      expect(result.exclusionReason).toBe('newRaces')
    })

    it('devrait accepter une proposition avec uniquement des mises à jour de courses existantes', async () => {
      const proposal = {
        id: 'test-11',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {
          racesToUpdate: {
            new: [
              { raceId: 1, raceName: 'Course 1', updates: { startDate: { old: null, new: '2026-03-15' } } },
              { raceId: 2, raceName: 'Course 2', updates: { runPositiveElevation: { old: 100, new: 150 } } }
            ]
          }
        }
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockResolvedValue({ id: 456, customerType: null }) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(true)
    })
  })

  describe('Gestion des erreurs', () => {
    it('devrait rejeter si la requête Event échoue', async () => {
      const proposal = {
        id: 'test-12',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockRejectedValue(new Error('DB Error')) },
        edition: { findUnique: jest.fn() }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('Erreur')
    })

    it('devrait rejeter si la requête Edition échoue', async () => {
      const proposal = {
        id: 'test-13',
        confidence: 0.9,
        eventId: '123',
        editionId: '456',
        changes: {}
      }

      const mockSourceDb = {
        event: { findUnique: jest.fn().mockResolvedValue({ id: 123, isFeatured: false }) },
        edition: { findUnique: jest.fn().mockRejectedValue(new Error('DB Error')) }
      }

      const result = await validateProposal(proposal, mockSourceDb, defaultConfig, mockLogger)

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('Erreur')
    })
  })
})

describe('getValidatableBlocks', () => {
  it('devrait retourner edition si des champs edition sont présents', () => {
    const changes = {
      startDate: { old: null, new: '2026-03-15' },
      endDate: { old: null, new: '2026-03-15' }
    }

    const blocks = getValidatableBlocks(changes, defaultConfig)

    expect(blocks).toContain('edition')
  })

  it('devrait retourner organizer si le champ organizer est présent', () => {
    const changes = {
      organizer: {
        old: null,
        new: { name: 'Organisateur Test' }
      }
    }

    const blocks = getValidatableBlocks(changes, defaultConfig)

    expect(blocks).toContain('organizer')
  })

  it('devrait retourner races si racesToUpdate est présent', () => {
    const changes = {
      racesToUpdate: {
        new: [{ raceId: 1, updates: {} }]
      }
    }

    const blocks = getValidatableBlocks(changes, defaultConfig)

    expect(blocks).toContain('races')
  })

  it('ne devrait PAS retourner races si racesToAdd est présent', () => {
    const changes = {
      racesToAdd: {
        new: [{ name: 'Nouvelle course' }]
      }
    }

    const blocks = getValidatableBlocks(changes, defaultConfig)

    expect(blocks).not.toContain('races')
  })

  it('devrait respecter les flags de configuration', () => {
    const changes = {
      startDate: { old: null, new: '2026-03-15' },
      organizer: { old: null, new: { name: 'Test' } },
      racesToUpdate: { new: [{ raceId: 1 }] }
    }

    const configDisabled: AutoValidatorConfig = {
      ...defaultConfig,
      enableEditionBlock: false,
      enableOrganizerBlock: false,
      enableRacesBlock: true
    }

    const blocks = getValidatableBlocks(changes, configDisabled)

    expect(blocks).not.toContain('edition')
    expect(blocks).not.toContain('organizer')
    expect(blocks).toContain('races')
  })

  it('devrait retourner un tableau vide si aucun bloc n\'est activé', () => {
    const changes = {
      startDate: { old: null, new: '2026-03-15' }
    }

    const configAllDisabled: AutoValidatorConfig = {
      ...defaultConfig,
      enableEditionBlock: false,
      enableOrganizerBlock: false,
      enableRacesBlock: false
    }

    const blocks = getValidatableBlocks(changes, configAllDisabled)

    expect(blocks).toHaveLength(0)
  })
})
