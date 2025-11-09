/**
 * Tests du parser FFA pour les événements multi-jours
 */

import { parseCompetitionDetails, parseRaces } from '../parser'
import { FFACompetition } from '../types'

describe('Parser FFA - Événements multi-jours', () => {
  const mockCompetition: FFACompetition = {
    ffaId: '309094',
    name: "Bol D'air De Saint Avertin",
    date: new Date('2026-01-17T00:00:00.000Z'),
    city: 'Saint Avertin',
    department: '37',
    ligue: 'CEN',
    level: 'Départemental',
    type: 'Running',
    detailUrl: 'https://www.athle.fr/competitions/595846640846284843787840217846269843'
  }

  describe('Extraction des dates start/end', () => {
    it('devrait extraire startDate et endDate depuis "17 au 18 Janvier 2026"', () => {
      const html = `
        <html>
          <body>
            <p class="body-small text-dark-grey">17 au 18 Janvier 2026</p>
          </body>
        </html>
      `

      const details = parseCompetitionDetails(html, mockCompetition)

      expect(details.startDate).toEqual(new Date('2026-01-17T00:00:00.000Z'))
      expect(details.endDate).toEqual(new Date('2026-01-18T00:00:00.000Z'))
    })

    it('devrait déduire l\'année depuis competition.date si absente', () => {
      const html = `
        <html>
          <body>
            <p class="body-small text-dark-grey">17 au 18 janvier</p>
          </body>
        </html>
      `

      const details = parseCompetitionDetails(html, mockCompetition)

      expect(details.startDate).toEqual(new Date('2026-01-17T00:00:00.000Z'))
      expect(details.endDate).toEqual(new Date('2026-01-18T00:00:00.000Z'))
    })

    it('devrait définir startDate = endDate = competition.date pour un événement 1 jour', () => {
      const html = `
        <html>
          <body>
            <p class="body-small text-dark-grey">30 Novembre 2025</p>
          </body>
        </html>
      `

      const details = parseCompetitionDetails(html, mockCompetition)

      // Pour un événement 1 jour : startDate = endDate = competition.date
      expect(details.startDate).toEqual(mockCompetition.date)
      expect(details.endDate).toEqual(mockCompetition.date)
      expect(details.startDate).toEqual(details.endDate)
    })

    it('devrait gérer un événement chevauchant 2 mois ("28 au 1 Mars 2026")', () => {
      const html = `
        <html>
          <body>
            <p class="body-small text-dark-grey">28 au 1 Mars 2026</p>
          </body>
        </html>
      `

      const details = parseCompetitionDetails(html, mockCompetition)

      // 28 février au 1er mars 2026
      expect(details.startDate).toEqual(new Date('2026-02-28T00:00:00.000Z'))
      expect(details.endDate).toEqual(new Date('2026-03-01T00:00:00.000Z'))
    })

    it('devrait gérer un événement chevauchant 2 mois en décembre-janvier', () => {
      const html = `
        <html>
          <body>
            <p class="body-small text-dark-grey">30 au 2 Janvier 2026</p>
          </body>
        </html>
      `

      const details = parseCompetitionDetails(html, mockCompetition)

      // 30 décembre 2025 au 2 janvier 2026
      expect(details.startDate).toEqual(new Date('2025-12-30T00:00:00.000Z'))
      expect(details.endDate).toEqual(new Date('2026-01-02T00:00:00.000Z'))
    })
  })

  describe('Extraction des courses avec date+heure', () => {
    it('devrait extraire raceDate et startTime depuis "17/01 18:30"', () => {
      const html = `
        <html>
          <body>
            <section id="epreuves">
              <div class="club-card">
                <div class="club-card-header">
                  <h3>17/01 18:30 - Bol d'air de saint-av 9 km by night - Course HS non officielle</h3>
                </div>
                <p class="text-dark-grey">TCF / TCM - 9000 m</p>
              </div>
            </section>
          </body>
        </html>
      `

      const races = parseRaces(html)

      expect(races).toHaveLength(1)
      expect(races[0].raceDate).toBe('17/01')
      expect(races[0].startTime).toBe('18:30')
      expect(races[0].name).toContain('Bol d\'air')
      expect(races[0].distance).toBe(9000)
    })

    it('devrait extraire plusieurs courses sur différents jours', () => {
      const html = `
        <html>
          <body>
            <section id="epreuves">
              <div class="club-card">
                <h3>17/01 18:30 - Bol d'air de saint-av 9 km by night - Course HS non officielle</h3>
                <p class="text-dark-grey">TCF / TCM - 9000 m</p>
              </div>
              <div class="club-card">
                <h3>18/01 09:30 - Course HS non officielle</h3>
                <p class="text-dark-grey">TCF / TCM - 22000 m</p>
              </div>
              <div class="club-card">
                <h3>18/01 10:30 - Bol d'air de saint-av 13 km - Course HS non officielle</h3>
                <p class="text-dark-grey">TCF / TCM - 13000 m / 210 m D+ / 15100 m effort</p>
              </div>
            </section>
          </body>
        </html>
      `

      const races = parseRaces(html)

      expect(races).toHaveLength(3)
      
      // Course 1 : 17/01 18:30
      expect(races[0].raceDate).toBe('17/01')
      expect(races[0].startTime).toBe('18:30')
      expect(races[0].distance).toBe(9000)
      
      // Course 2 : 18/01 09:30
      expect(races[1].raceDate).toBe('18/01')
      expect(races[1].startTime).toBe('09:30')
      expect(races[1].distance).toBe(22000)
      
      // Course 3 : 18/01 10:30
      expect(races[2].raceDate).toBe('18/01')
      expect(races[2].startTime).toBe('10:30')
      expect(races[2].distance).toBe(13000)
      expect(races[2].positiveElevation).toBe(210)
    })

    it('devrait gérer le format 1 jour (pas de date, seulement heure)', () => {
      const html = `
        <html>
          <body>
            <section id="epreuves">
              <div class="club-card">
                <h3>14:00 - 1/2 Marathon</h3>
                <p class="text-dark-grey">TCF / TCM - 21100 m</p>
              </div>
            </section>
          </body>
        </html>
      `

      const races = parseRaces(html)

      expect(races).toHaveLength(1)
      expect(races[0].raceDate).toBeUndefined()
      expect(races[0].startTime).toBe('14:00')
      expect(races[0].distance).toBe(21100)
    })
  })
})
