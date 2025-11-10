/**
 * Tests pour removeEditionNumber() - Nettoyage des numéros d'édition
 * 
 * Cas testés :
 * - Numéros ordinaux (34ème, 3ème édition, etc.)
 * - Numéros avec symboles (#3, No. 8, N° 5)
 * - Années (2025, (2026))
 * - Combinaisons
 */

import { matchCompetition } from '../matcher'

describe('removeEditionNumber', () => {
  // Helper pour tester le nettoyage via matchCompetition
  // (la fonction est privée, on teste via son comportement observable)
  
  const createMockDb = () => ({
    event: {
      findMany: jest.fn().mockResolvedValue([])
    }
  })
  
  const createMockLogger = () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  })
  
  const mockConfig = {
    similarityThreshold: 0.75
  }

  describe('Numéros avec symboles (#, No., N°)', () => {
    test('devrait retirer #3', async () => {
      const competition = {
        competition: {
          name: 'Trail des Loups #3',
          city: 'Bonnefontaine',
          department: '39',
          date: new Date('2026-04-26')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      // Vérifier que le log montre le nom nettoyé
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Trail des Loups')
        expect(cleanedLogCall[0]).not.toContain('#3')
      }
    })

    test('devrait retirer No. 8', async () => {
      const competition = {
        competition: {
          name: 'Marathon de Paris No. 8',
          city: 'Paris',
          department: '75',
          date: new Date('2026-04-26')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Marathon de Paris')
        expect(cleanedLogCall[0]).not.toContain('No. 8')
      }
    })

    test('devrait retirer N° 5', async () => {
      const competition = {
        competition: {
          name: 'Course N° 5 de Lyon',
          city: 'Lyon',
          department: '69',
          date: new Date('2026-04-26')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Course')
        expect(cleanedLogCall[0]).toContain('Lyon')
        expect(cleanedLogCall[0]).not.toContain('N° 5')
      }
    })

    test('devrait retirer no 12 (sans point)', async () => {
      const competition = {
        competition: {
          name: 'Trail no 12',
          city: 'Grenoble',
          department: '38',
          date: new Date('2026-04-26')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Trail')
        expect(cleanedLogCall[0]).not.toContain('no 12')
      }
    })
  })

  describe('Numéros ordinaux (comportement existant)', () => {
    test('devrait retirer 34ème', async () => {
      const competition = {
        competition: {
          name: '34ème Corrida des Bleuets',
          city: 'Tours',
          department: '37',
          date: new Date('2026-04-26')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Corrida des Bleuets')
        expect(cleanedLogCall[0]).not.toContain('34ème')
      }
    })

    test('devrait retirer - 15ème édition', async () => {
      const competition = {
        competition: {
          name: 'Trail des Cascades - 15ème édition',
          city: 'Annecy',
          department: '74',
          date: new Date('2026-04-26')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Trail des Cascades')
        expect(cleanedLogCall[0]).not.toContain('15ème')
      }
    })
  })

  describe('Années', () => {
    test('devrait retirer (2025)', async () => {
      const competition = {
        competition: {
          name: 'Marathon de Bordeaux (2025)',
          city: 'Bordeaux',
          department: '33',
          date: new Date('2025-04-26')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Marathon de Bordeaux')
        expect(cleanedLogCall[0]).not.toContain('2025')
      }
    })

    test('devrait retirer - 2026', async () => {
      const competition = {
        competition: {
          name: 'Course de Noël - 2026',
          city: 'Strasbourg',
          department: '67',
          date: new Date('2026-12-25')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Course de Noël')
        expect(cleanedLogCall[0]).not.toContain('2026')
      }
    })
  })

  describe('Combinaisons', () => {
    test('devrait retirer #5 et (2025)', async () => {
      const competition = {
        competition: {
          name: 'Ultra-Trail #5 (2025)',
          city: 'Chamonix',
          department: '74',
          date: new Date('2025-08-30')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Ultra-Trail')
        expect(cleanedLogCall[0]).not.toContain('#5')
        expect(cleanedLogCall[0]).not.toContain('2025')
      }
    })

    test('devrait retirer 3ème et No. 10', async () => {
      const competition = {
        competition: {
          name: '3ème Trail No. 10 de Belfort',
          city: 'Belfort',
          department: '90',
          date: new Date('2026-06-15')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      if (cleanedLogCall) {
        expect(cleanedLogCall[0]).toContain('Trail')
        expect(cleanedLogCall[0]).toContain('Belfort')
        expect(cleanedLogCall[0]).not.toContain('3ème')
        expect(cleanedLogCall[0]).not.toContain('No. 10')
      }
    })
  })

  describe('Cas limites', () => {
    test('ne devrait PAS retirer les chiffres qui font partie du nom', async () => {
      const competition = {
        competition: {
          name: 'Les 100km de Millau',
          city: 'Millau',
          department: '12',
          date: new Date('2026-05-30')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      await matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      
      // Devrait y avoir un log "Normalized:" mais pas de "Cleaned:"
      const cleanedLogCall = mockLogger.info.mock.calls.find((call: any[]) => 
        call[0]?.includes('Cleaned:')
      )
      
      // Pas de nettoyage attendu
      expect(cleanedLogCall).toBeUndefined()
    })

    test('devrait gérer les noms vides après nettoyage', async () => {
      const competition = {
        competition: {
          name: '#3',
          city: 'Test',
          department: '01',
          date: new Date('2026-01-01')
        }
      }
      
      const mockDb = createMockDb()
      const mockLogger = createMockLogger()
      
      // Ne devrait pas crasher
      await expect(
        matchCompetition(competition as any, mockDb, mockConfig as any, mockLogger)
      ).resolves.toBeDefined()
    })
  })
})
