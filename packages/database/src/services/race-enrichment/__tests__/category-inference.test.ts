/**
 * Tests pour inferRaceCategories - Inférence des catégories de courses
 *
 * Cas testés :
 * - Inférence depuis le nom de la course
 * - Inférence depuis le contexte de l'événement (eventName)
 * - Classification par distance
 */

import { inferRaceCategories } from '../category-inference'

describe('inferRaceCategories', () => {
  describe('Inférence depuis le nom de la course', () => {
    it('devrait détecter TRAIL depuis le nom de la course', () => {
      const [cat1, cat2] = inferRaceCategories('Trail des Alpes 25km', 25)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('SHORT_TRAIL')
    })

    it('devrait détecter WALK pour une marche', () => {
      const [cat1, cat2] = inferRaceCategories('Marche nordique 10km', 10)
      expect(cat1).toBe('WALK')
      expect(cat2).toBe('NORDIC_WALK')
    })

    it('devrait détecter WALK pour une randonnée', () => {
      const [cat1, cat2] = inferRaceCategories('Randonnée 15km')
      expect(cat1).toBe('WALK')
      expect(cat2).toBe('HIKING')
    })

    it('devrait fallback sur RUNNING si aucun mot-clé', () => {
      const [cat1, cat2] = inferRaceCategories('La Bataille', 25)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM20') // 25km → KM20 (17.5-45km)
    })
  })

  describe('Inférence depuis le contexte de l\'événement (eventName)', () => {
    it('devrait détecter TRAIL si l\'événement contient "trail"', () => {
      const [cat1, cat2] = inferRaceCategories(
        'La Bataille', // Nom sans "trail"
        25,
        undefined,
        undefined,
        undefined,
        'Trail de la Grande Champagne' // Événement avec "trail"
      )
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('SHORT_TRAIL') // 25km → SHORT_TRAIL (21-41km)
    })

    it('devrait détecter TRAIL pour "Les Orchis" avec événement Trail', () => {
      const [cat1, cat2] = inferRaceCategories(
        'Les Orchis',
        15,
        undefined,
        undefined,
        undefined,
        'Trail de la Grande Champagne'
      )
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('DISCOVERY_TRAIL') // 15km ≤ 21km
    })

    it('devrait détecter TRAIL pour "La Mignonette" avec événement Trail', () => {
      const [cat1, cat2] = inferRaceCategories(
        'La Mignonette',
        9,
        undefined,
        undefined,
        undefined,
        'Trail de la Grande Champagne'
      )
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('DISCOVERY_TRAIL') // 9km ≤ 21km
    })

    it('devrait détecter ULTRA_TRAIL pour une longue distance avec événement Trail', () => {
      const [cat1, cat2] = inferRaceCategories(
        'L\'Alambic Ultra',
        85,
        undefined,
        undefined,
        undefined,
        'Trail de la Grande Champagne'
      )
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('ULTRA_TRAIL') // > 80km
    })

    it('devrait fallback sur RUNNING si événement ne contient pas "trail"', () => {
      const [cat1, cat2] = inferRaceCategories(
        'La Bataille',
        25,
        undefined,
        undefined,
        undefined,
        'Course de la Vallée' // Pas de "trail"
      )
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM20')
    })

    it('devrait fonctionner sans eventName (backward compatible)', () => {
      const [cat1, cat2] = inferRaceCategories('Trail 10km', 10)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('DISCOVERY_TRAIL')
    })
  })

  describe('Classification TRAIL par distance', () => {
    const eventName = 'Ultra Trail du Mont Blanc'

    it('≤ 21km → DISCOVERY_TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Course A', 21, undefined, undefined, undefined, eventName)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('DISCOVERY_TRAIL')
    })

    it('22-41km → SHORT_TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Course B', 35, undefined, undefined, undefined, eventName)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('SHORT_TRAIL')
    })

    it('42-80km → LONG_TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Course C', 60, undefined, undefined, undefined, eventName)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('LONG_TRAIL')
    })

    it('> 80km → ULTRA_TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Course D', 100, undefined, undefined, undefined, eventName)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('ULTRA_TRAIL')
    })
  })

  describe('Classification RUNNING par distance', () => {
    it('< 5km → LESS_THAN_5_KM', () => {
      const [cat1, cat2] = inferRaceCategories('Petit parcours', 3)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('LESS_THAN_5_KM')
    })

    it('5-7.5km → KM5', () => {
      const [cat1, cat2] = inferRaceCategories('5 kilomètres', 5)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM5')
    })

    it('7.5-12.5km → KM10', () => {
      const [cat1, cat2] = inferRaceCategories('10 kilomètres', 10)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM10')
    })

    it('12.5-17.5km → KM15', () => {
      const [cat1, cat2] = inferRaceCategories('15 kilomètres', 15)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM15')
    })

    it('17.5-45km → KM20', () => {
      // Utiliser un nom générique sans mot-clé "marathon"
      const [cat1, cat2] = inferRaceCategories('Course 20km', 20)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM20')
    })

    it('≥ 45km → ULTRA_RUNNING', () => {
      // Utiliser un nom générique sans mot-clé "marathon"
      const [cat1, cat2] = inferRaceCategories('Grande boucle', 50)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('ULTRA_RUNNING')
    })

    it('semi-marathon → HALF_MARATHON', () => {
      const [cat1, cat2] = inferRaceCategories('Semi marathon', 21.1)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('HALF_MARATHON')
    })

    it('marathon → MARATHON', () => {
      const [cat1, cat2] = inferRaceCategories('Marathon de Paris', 42.195)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('MARATHON')
    })
  })

  describe('Priorité des détections', () => {
    it('TRIATHLON a priorité sur TRAIL', () => {
      const [cat1] = inferRaceCategories('Triathlon Trail', 10)
      expect(cat1).toBe('TRIATHLON')
    })

    it('CYCLING a priorité sur TRAIL', () => {
      const [cat1] = inferRaceCategories('VTT Trail', 20)
      expect(cat1).toBe('CYCLING')
    })

    it('TRAIL (nom) a priorité sur RUNNING', () => {
      const [cat1] = inferRaceCategories('Trail 10km', 10)
      expect(cat1).toBe('TRAIL')
    })

    it('WALK a priorité sur RUNNING', () => {
      const [cat1] = inferRaceCategories('Marche 10km', 10)
      expect(cat1).toBe('WALK')
    })
  })

  describe('Normalisation des noms', () => {
    it('devrait ignorer la casse', () => {
      const [cat1] = inferRaceCategories('TRAIL DES MONTAGNES', 20)
      expect(cat1).toBe('TRAIL')
    })

    it('devrait gérer les accents', () => {
      const [cat1] = inferRaceCategories('Randonnée pédestre', 10)
      expect(cat1).toBe('WALK')
    })
  })
})
