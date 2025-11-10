/**
 * Tests pour le calcul de edition.endDate depuis la dernière course
 */

import { FFACompetitionDetails, FFARace } from '../types'

// Mock minimal de FFAScraperAgent pour tester calculateEditionEndDate
class TestFFAScraper {
  /**
   * Calcule la date/heure de départ d'une course spécifique
   * Version simplifiée pour les tests (sans conversion timezone)
   */
  calculateRaceStartDate(ffaData: FFACompetitionDetails, race: FFARace): Date {
    let baseDate: Date
    
    if (race.raceDate) {
      const [dayStr, monthStr] = race.raceDate.split('/')
      const raceDay = parseInt(dayStr, 10)
      const raceMonth = parseInt(monthStr, 10) - 1
      const year = ffaData.startDate.getUTCFullYear()
      const startMonth = ffaData.startDate.getUTCMonth()
      const adjustedYear = (raceMonth === 0 && startMonth === 11) ? year + 1 : year
      baseDate = new Date(Date.UTC(adjustedYear, raceMonth, raceDay, 0, 0, 0, 0))
    } else {
      baseDate = ffaData.startDate
    }
    
    const year = baseDate.getUTCFullYear()
    const month = baseDate.getUTCMonth()
    const day = baseDate.getUTCDate()
    
    if (race.startTime) {
      const [hours, minutes] = race.startTime.split(':').map(Number)
      // Simplification : pas de conversion timezone pour les tests
      return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0))
    }
    
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
  }

  /**
   * Calcule la date de début d'une édition (première course)
   */
  calculateEditionStartDate(ffaData: FFACompetitionDetails): Date {
    if (ffaData.races.length > 0 && ffaData.races[0].startTime) {
      return this.calculateRaceStartDate(ffaData, ffaData.races[0])
    }
    return ffaData.startDate
  }

  /**
   * Calcule la date de fin d'une édition (dernière course)
   */
  calculateEditionEndDate(ffaData: FFACompetitionDetails): Date {
    if (ffaData.races.length === 0) {
      return this.calculateEditionStartDate(ffaData)
    }
    
    const lastRace = ffaData.races[ffaData.races.length - 1]
    return this.calculateRaceStartDate(ffaData, lastRace)
  }
}

describe('calculateEditionEndDate', () => {
  const scraper = new TestFFAScraper()

  describe('Événement d\'un jour avec plusieurs courses', () => {
    it('devrait retourner l\'heure de la dernière course', () => {
      const ffaData: FFACompetitionDetails = {
        competition: {
          name: 'Marathon de Test',
          city: 'Paris',
          ligue: 'IDF',
          department: '75',
          date: new Date('2025-11-24T00:00:00Z'),
          detailUrl: 'https://example.com'
        },
        startDate: new Date('2025-11-24T00:00:00Z'),
        endDate: new Date('2025-11-24T00:00:00Z'),
        races: [
          { name: '10km', startTime: '09:00', runDistance: 10 },
          { name: 'Semi-Marathon', startTime: '11:00', runDistance: 21.1 },
          { name: 'Marathon', startTime: '14:00', runDistance: 42.195 }
        ]
      }

      const startDate = scraper.calculateEditionStartDate(ffaData)
      const endDate = scraper.calculateEditionEndDate(ffaData)

      // startDate = première course (09:00)
      expect(startDate.toISOString()).toBe('2025-11-24T09:00:00.000Z')
      
      // endDate = dernière course (14:00)
      expect(endDate.toISOString()).toBe('2025-11-24T14:00:00.000Z')
      
      // Durée = 5 heures
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
      expect(durationHours).toBe(5)
    })
  })

  describe('Événement multi-jours', () => {
    it('devrait retourner la date de la dernière course sur le 2ème jour', () => {
      const ffaData: FFACompetitionDetails = {
        competition: {
          name: 'Trail de Vulcain',
          city: 'Vulcania',
          ligue: 'ARA',
          department: '63',
          date: new Date('2026-02-28T00:00:00Z'),
          detailUrl: 'https://example.com'
        },
        startDate: new Date('2026-02-28T00:00:00Z'),
        endDate: new Date('2026-03-01T00:00:00Z'),
        races: [
          { name: '9km by night', raceDate: '28/02', startTime: '18:30', runDistance: 9 },
          { name: 'Semi-Marathon', raceDate: '01/03', startTime: '09:00', runDistance: 21.1 },
          { name: 'Marathon', raceDate: '01/03', startTime: '14:00', runDistance: 42.195 }
        ]
      }

      const startDate = scraper.calculateEditionStartDate(ffaData)
      const endDate = scraper.calculateEditionEndDate(ffaData)

      // startDate = première course (28/02 18:30)
      expect(startDate.toISOString()).toBe('2026-02-28T18:30:00.000Z')
      
      // endDate = dernière course (01/03 14:00)
      expect(endDate.toISOString()).toBe('2026-03-01T14:00:00.000Z')
      
      // Durée = environ 19h30
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
      expect(durationHours).toBeCloseTo(19.5, 1)
    })

    it('devrait gérer les événements chevauchant 2 mois (décembre-janvier)', () => {
      const ffaData: FFACompetitionDetails = {
        competition: {
          name: 'Réveillon Trail',
          city: 'Strasbourg',
          ligue: 'G-E',
          department: '67',
          date: new Date('2025-12-31T00:00:00Z'),
          detailUrl: 'https://example.com'
        },
        startDate: new Date('2025-12-31T00:00:00Z'),
        endDate: new Date('2026-01-01T00:00:00Z'),
        races: [
          { name: '10km', raceDate: '31/12', startTime: '18:00', runDistance: 10 },
          { name: 'Semi-Marathon', raceDate: '01/01', startTime: '10:00', runDistance: 21.1 }
        ]
      }

      const startDate = scraper.calculateEditionStartDate(ffaData)
      const endDate = scraper.calculateEditionEndDate(ffaData)

      // startDate = première course (31/12/2025 18:00)
      expect(startDate.toISOString()).toBe('2025-12-31T18:00:00.000Z')
      
      // endDate = dernière course (01/01/2026 10:00)
      expect(endDate.toISOString()).toBe('2026-01-01T10:00:00.000Z')
      
      // Durée = 16 heures
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
      expect(durationHours).toBe(16)
    })
  })

  describe('Événement sans heure', () => {
    it('devrait retourner endDate = startDate (minuit)', () => {
      const ffaData: FFACompetitionDetails = {
        competition: {
          name: 'Course sans heure',
          city: 'Lyon',
          ligue: 'ARA',
          department: '69',
          date: new Date('2025-03-15T00:00:00Z'),
          detailUrl: 'https://example.com'
        },
        startDate: new Date('2025-03-15T00:00:00Z'),
        endDate: new Date('2025-03-15T00:00:00Z'),
        races: [
          { name: '10km', runDistance: 10 },
          { name: 'Semi-Marathon', runDistance: 21.1 }
        ]
      }

      const startDate = scraper.calculateEditionStartDate(ffaData)
      const endDate = scraper.calculateEditionEndDate(ffaData)

      // Pas d'heure = minuit (00:00)
      expect(startDate.toISOString()).toBe('2025-03-15T00:00:00.000Z')
      expect(endDate.toISOString()).toBe('2025-03-15T00:00:00.000Z')
      
      // Durée = 0 heures
      expect(startDate.getTime()).toBe(endDate.getTime())
    })
  })

  describe('Événement sans courses', () => {
    it('devrait retourner endDate = startDate', () => {
      const ffaData: FFACompetitionDetails = {
        competition: {
          name: 'Événement sans courses',
          city: 'Marseille',
          ligue: 'P-A',
          department: '13',
          date: new Date('2025-04-20T00:00:00Z'),
          detailUrl: 'https://example.com'
        },
        startDate: new Date('2025-04-20T00:00:00Z'),
        endDate: new Date('2025-04-20T00:00:00Z'),
        races: []
      }

      const startDate = scraper.calculateEditionStartDate(ffaData)
      const endDate = scraper.calculateEditionEndDate(ffaData)

      // Pas de courses = endDate = startDate
      expect(startDate.toISOString()).toBe('2025-04-20T00:00:00.000Z')
      expect(endDate.toISOString()).toBe('2025-04-20T00:00:00.000Z')
    })
  })

  describe('Événement avec une seule course', () => {
    it('devrait retourner endDate = startDate (même heure)', () => {
      const ffaData: FFACompetitionDetails = {
        competition: {
          name: 'Course unique',
          city: 'Bordeaux',
          ligue: 'N-A',
          department: '33',
          date: new Date('2025-05-10T00:00:00Z'),
          detailUrl: 'https://example.com'
        },
        startDate: new Date('2025-05-10T00:00:00Z'),
        endDate: new Date('2025-05-10T00:00:00Z'),
        races: [
          { name: 'Marathon', startTime: '09:00', runDistance: 42.195 }
        ]
      }

      const startDate = scraper.calculateEditionStartDate(ffaData)
      const endDate = scraper.calculateEditionEndDate(ffaData)

      // Une seule course = startDate = endDate
      expect(startDate.toISOString()).toBe('2025-05-10T09:00:00.000Z')
      expect(endDate.toISOString()).toBe('2025-05-10T09:00:00.000Z')
    })
  })
})
