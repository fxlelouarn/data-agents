import {
  inferRaceCategories,
  enrichRaceCategories,
  normalizeRaceName,
  cleanRaceName,
  normalizeRaceNameWithCategory,
  getCategoryLabel,
} from '../race-enrichment'

describe('inferRaceCategories', () => {
  describe('TRAIL detection', () => {
    test('Trail dans le nom → TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Trail des Montagnes')
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('DISCOVERY_TRAIL')
    })

    test('Trail avec distance courte → DISCOVERY_TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Trail du Lac', 15)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('DISCOVERY_TRAIL')
    })

    test('Trail avec distance moyenne → SHORT_TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Trail des Vallées', 30)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('SHORT_TRAIL')
    })

    test('Trail avec distance longue → LONG_TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Trail des Crêtes', 60)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('LONG_TRAIL')
    })

    test('Trail avec distance ultra → ULTRA_TRAIL', () => {
      const [cat1, cat2] = inferRaceCategories('Ultra Trail du Mont Blanc', 100)
      expect(cat1).toBe('TRAIL')
      expect(cat2).toBe('ULTRA_TRAIL')
    })
  })

  describe('RUNNING detection', () => {
    test('Marathon → RUNNING/MARATHON', () => {
      const [cat1, cat2] = inferRaceCategories('Marathon de Paris')
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('MARATHON')
    })

    test('Semi-marathon → RUNNING/HALF_MARATHON', () => {
      const [cat1, cat2] = inferRaceCategories('Semi-Marathon de Lyon')
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('HALF_MARATHON')
    })

    test('Half marathon → RUNNING/HALF_MARATHON', () => {
      const [cat1, cat2] = inferRaceCategories('Half Marathon Nice')
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('HALF_MARATHON')
    })

    test('Cross → RUNNING/CROSS', () => {
      const [cat1, cat2] = inferRaceCategories('Cross Départemental')
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('CROSS')
    })

    test('Ekiden → RUNNING/EKIDEN', () => {
      const [cat1, cat2] = inferRaceCategories('Ekiden de Paris')
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('EKIDEN')
    })

    test('Distance 5km → RUNNING/KM5', () => {
      const [cat1, cat2] = inferRaceCategories('Course du village', 5)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM5')
    })

    test('Distance 10km → RUNNING/KM10', () => {
      const [cat1, cat2] = inferRaceCategories('10km de Marseille', 10)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM10')
    })

    test('Distance 21km → RUNNING/KM20 (pas de catégorie spécifique semi par distance)', () => {
      const [cat1, cat2] = inferRaceCategories('Course longue', 21)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM20')
    })

    test('Distance 32km → RUNNING/KM20 (pas de KM30, KM20 jusqu\'à 45km)', () => {
      const [cat1, cat2] = inferRaceCategories('Course longue', 32)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM20')
    })

    test('Distance 42km → RUNNING/KM20 (MARATHON détecté par nom, pas distance)', () => {
      const [cat1, cat2] = inferRaceCategories('Course très longue', 42)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('KM20')
    })

    test('Distance 45km → RUNNING/ULTRA_RUNNING', () => {
      const [cat1, cat2] = inferRaceCategories('Ultra course', 45)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('ULTRA_RUNNING')
    })

    test('Distance 80km → RUNNING/ULTRA_RUNNING', () => {
      const [cat1, cat2] = inferRaceCategories('Ultra course', 80)
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBe('ULTRA_RUNNING')
    })
  })

  describe('WALK detection', () => {
    test('Marche nordique → WALK/NORDIC_WALK', () => {
      const [cat1, cat2] = inferRaceCategories('Marche Nordique des Alpes')
      expect(cat1).toBe('WALK')
      expect(cat2).toBe('NORDIC_WALK')
    })

    test('Nordic walk → WALK/NORDIC_WALK', () => {
      const [cat1, cat2] = inferRaceCategories('Nordic Walk Challenge')
      expect(cat1).toBe('WALK')
      expect(cat2).toBe('NORDIC_WALK')
    })

    test('Randonnée → WALK/HIKING', () => {
      const [cat1, cat2] = inferRaceCategories('Randonnée du Pic du Midi')
      expect(cat1).toBe('WALK')
      expect(cat2).toBe('HIKING')
    })

    test('Rando → WALK/HIKING', () => {
      const [cat1, cat2] = inferRaceCategories('Rando des Cimes')
      expect(cat1).toBe('WALK')
      expect(cat2).toBe('HIKING')
    })

    test('Marche simple → WALK/HIKING', () => {
      const [cat1, cat2] = inferRaceCategories('Marche du coeur')
      expect(cat1).toBe('WALK')
      expect(cat2).toBe('HIKING')
    })
  })

  describe('TRIATHLON detection', () => {
    test('Triathlon → TRIATHLON', () => {
      const [cat1, cat2] = inferRaceCategories('Triathlon de Nice')
      expect(cat1).toBe('TRIATHLON')
    })

    test('Triathlon XS → TRIATHLON/TRIATHLON_XS', () => {
      const [cat1, cat2] = inferRaceCategories('Triathlon XS découverte')
      expect(cat1).toBe('TRIATHLON')
      expect(cat2).toBe('TRIATHLON_XS')
    })

    test('Duathlon → TRIATHLON/DUATHLON', () => {
      const [cat1, cat2] = inferRaceCategories('Duathlon de Lyon')
      expect(cat1).toBe('TRIATHLON')
      expect(cat2).toBe('DUATHLON')
    })

    test('Aquathlon → TRIATHLON/AQUATHLON', () => {
      const [cat1, cat2] = inferRaceCategories('Aquathlon du Lac')
      expect(cat1).toBe('TRIATHLON')
      expect(cat2).toBe('AQUATHLON')
    })

    test('Swim Run → TRIATHLON/SWIM_RUN', () => {
      const [cat1, cat2] = inferRaceCategories('Swim Run Côte Bleue')
      expect(cat1).toBe('TRIATHLON')
      expect(cat2).toBe('SWIM_RUN')
    })
  })

  describe('CYCLING detection', () => {
    test('Gravel → CYCLING/GRAVEL_RIDE', () => {
      const [cat1, cat2] = inferRaceCategories('Gravel des Volcans')
      expect(cat1).toBe('CYCLING')
      expect(cat2).toBe('GRAVEL_RIDE')
    })

    test('Gravel race → CYCLING/GRAVEL_RACE', () => {
      const [cat1, cat2] = inferRaceCategories('Gravel Race Alpes')
      expect(cat1).toBe('CYCLING')
      expect(cat2).toBe('GRAVEL_RACE')
    })

    test('VTT → CYCLING/MOUNTAIN_BIKE_RIDE', () => {
      const [cat1, cat2] = inferRaceCategories('VTT des Vosges')
      expect(cat1).toBe('CYCLING')
      expect(cat2).toBe('MOUNTAIN_BIKE_RIDE')
    })

    test('Gran Fondo → CYCLING/GRAN_FONDO', () => {
      const [cat1, cat2] = inferRaceCategories('Gran Fondo Mont Ventoux')
      expect(cat1).toBe('CYCLING')
      expect(cat2).toBe('GRAN_FONDO')
    })
  })

  describe('FUN detection', () => {
    test('Color run → FUN/COLOR_RUN', () => {
      const [cat1, cat2] = inferRaceCategories('Color Run Paris')
      expect(cat1).toBe('FUN')
      expect(cat2).toBe('COLOR_RUN')
    })

    test('Course à obstacles → FUN/OBSTACLE_RACE', () => {
      const [cat1, cat2] = inferRaceCategories('Course à obstacles extrême')
      expect(cat1).toBe('FUN')
      expect(cat2).toBe('OBSTACLE_RACE')
    })

    test('Spartan Race → FUN/SPARTAN_RACE', () => {
      const [cat1, cat2] = inferRaceCategories('Spartan Race Beast')
      expect(cat1).toBe('FUN')
      expect(cat2).toBe('SPARTAN_RACE')
    })

    test('Mud Day → FUN/MUD_DAY', () => {
      const [cat1, cat2] = inferRaceCategories('Mud Day Lyon')
      expect(cat1).toBe('FUN')
      expect(cat2).toBe('MUD_DAY')
    })
  })

  describe('OTHER detection', () => {
    test('Canicross → OTHER/CANICROSS', () => {
      const [cat1, cat2] = inferRaceCategories('Canicross du Jura')
      expect(cat1).toBe('OTHER')
      expect(cat2).toBe('CANICROSS')
    })

    test('Course orientation → OTHER/ORIENTEERING', () => {
      const [cat1, cat2] = inferRaceCategories("Course d'orientation nocturne")
      expect(cat1).toBe('OTHER')
      expect(cat2).toBe('ORIENTEERING')
    })
  })

  describe('Default behavior', () => {
    test('Nom générique sans distance → RUNNING/undefined', () => {
      const [cat1, cat2] = inferRaceCategories('La course du village')
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBeUndefined()
    })

    test('Corrida → RUNNING/undefined', () => {
      const [cat1, cat2] = inferRaceCategories('Corrida de Noël')
      expect(cat1).toBe('RUNNING')
      expect(cat2).toBeUndefined()
    })
  })
})

describe('enrichRaceCategories', () => {
  test('Retourne les catégories enrichies', () => {
    const result = enrichRaceCategories({
      name: 'Trail 25km',
      runDistance: 25,
    })
    expect(result.categoryLevel1).toBe('TRAIL')
    expect(result.categoryLevel2).toBe('SHORT_TRAIL')
  })
})

describe('normalizeRaceName', () => {
  test('Minuscule et sans accents', () => {
    expect(normalizeRaceName('Trail des Écureuils')).toBe('trail des ecureuils')
  })

  test('Espaces normalisés', () => {
    expect(normalizeRaceName('Trail   du   Mont')).toBe('trail du mont')
  })

  test('Trim', () => {
    expect(normalizeRaceName('  Trail  ')).toBe('trail')
  })
})

describe('cleanRaceName', () => {
  test('Retire préfixe Race X -', () => {
    expect(cleanRaceName('Race 1 - Trail 10km')).toBe('Trail 10km')
  })

  test('Retire préfixe Course X -', () => {
    expect(cleanRaceName('Course 2 - Marathon')).toBe('Marathon')
  })

  test('Nettoie les tirets en début/fin', () => {
    expect(cleanRaceName('- Trail -')).toBe('Trail')
  })
})

describe('getCategoryLabel', () => {
  test('RUNNING → Course', () => {
    expect(getCategoryLabel('RUNNING')).toBe('Course')
  })

  test('TRAIL → Trail', () => {
    expect(getCategoryLabel('TRAIL')).toBe('Trail')
  })

  test('WALK/NORDIC_WALK → Marche Nordique', () => {
    expect(getCategoryLabel('WALK', 'NORDIC_WALK')).toBe('Marche Nordique')
  })

  test('WALK/HIKING → Randonnée', () => {
    expect(getCategoryLabel('WALK', 'HIKING')).toBe('Randonnée')
  })

  test('TRIATHLON/TRIATHLON_M → Triathlon M', () => {
    expect(getCategoryLabel('TRIATHLON', 'TRIATHLON_M')).toBe('Triathlon M')
  })

  test('CYCLING/GRAVEL_RACE → Gravel', () => {
    expect(getCategoryLabel('CYCLING', 'GRAVEL_RACE')).toBe('Gravel')
  })

  test('FUN/OBSTACLE_RACE → Course à Obstacles', () => {
    expect(getCategoryLabel('FUN', 'OBSTACLE_RACE')).toBe('Course à Obstacles')
  })

  test('undefined → Course (default)', () => {
    expect(getCategoryLabel()).toBe('Course')
  })
})

describe('normalizeRaceNameWithCategory', () => {
  test('Trail avec distance', () => {
    const result = normalizeRaceNameWithCategory('Mon Trail', 'TRAIL', 'SHORT_TRAIL', 25)
    expect(result).toBe('Trail 25 km')
  })

  test('Course avec relais détecté', () => {
    const result = normalizeRaceNameWithCategory('Course Relais 4x5km', 'RUNNING', undefined, 20)
    expect(result).toBe('Course Relais 20 km')
  })

  test('Course enfants', () => {
    const result = normalizeRaceNameWithCategory('Course Enfants', 'RUNNING', undefined, 1)
    expect(result).toBe('Course Enfants 1 km')
  })

  test('Distance en mètres', () => {
    const result = normalizeRaceNameWithCategory('Course', 'RUNNING', undefined, 0.5)
    expect(result).toBe('Course 500 m')
  })

  test('Triathlon sans distance affichée', () => {
    const result = normalizeRaceNameWithCategory('Triathlon M', 'TRIATHLON', 'TRIATHLON_M', 40)
    expect(result).toBe('Triathlon M')
  })
})
