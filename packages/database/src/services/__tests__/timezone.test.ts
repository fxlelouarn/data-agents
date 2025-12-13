import {
  getTimezoneFromDepartment,
  getTimezoneFromLigue,
  getTimezoneFromCountry,
  getTimezoneFromLocation,
  isDOMTOM,
  getDefaultTimezone,
  DEFAULT_TIMEZONE,
} from '../timezone'

describe('getTimezoneFromDepartment', () => {
  describe('DOM-TOM', () => {
    test('971 (Guadeloupe) → America/Guadeloupe', () => {
      expect(getTimezoneFromDepartment('971')).toBe('America/Guadeloupe')
    })

    test('972 (Martinique) → America/Martinique', () => {
      expect(getTimezoneFromDepartment('972')).toBe('America/Martinique')
    })

    test('973 (Guyane) → America/Cayenne', () => {
      expect(getTimezoneFromDepartment('973')).toBe('America/Cayenne')
    })

    test('974 (La Réunion) → Indian/Reunion', () => {
      expect(getTimezoneFromDepartment('974')).toBe('Indian/Reunion')
    })

    test('976 (Mayotte) → Indian/Mayotte', () => {
      expect(getTimezoneFromDepartment('976')).toBe('Indian/Mayotte')
    })

    test('987 (Polynésie française) → Pacific/Tahiti', () => {
      expect(getTimezoneFromDepartment('987')).toBe('Pacific/Tahiti')
    })

    test('988 (Nouvelle-Calédonie) → Pacific/Noumea', () => {
      expect(getTimezoneFromDepartment('988')).toBe('Pacific/Noumea')
    })

    test('986 (Wallis-et-Futuna) → Pacific/Wallis', () => {
      expect(getTimezoneFromDepartment('986')).toBe('Pacific/Wallis')
    })
  })

  describe('Métropole', () => {
    test('75 (Paris) → Europe/Paris', () => {
      expect(getTimezoneFromDepartment('75')).toBe('Europe/Paris')
    })

    test('01 (Ain) → Europe/Paris', () => {
      expect(getTimezoneFromDepartment('01')).toBe('Europe/Paris')
    })

    test('69 (Rhône) → Europe/Paris', () => {
      expect(getTimezoneFromDepartment('69')).toBe('Europe/Paris')
    })

    test('2A (Corse-du-Sud) → Europe/Paris', () => {
      expect(getTimezoneFromDepartment('2A')).toBe('Europe/Paris')
    })

    test('2B (Haute-Corse) → Europe/Paris', () => {
      expect(getTimezoneFromDepartment('2B')).toBe('Europe/Paris')
    })
  })

  describe('Edge cases', () => {
    test('undefined → Europe/Paris', () => {
      expect(getTimezoneFromDepartment(undefined)).toBe('Europe/Paris')
    })

    test('Département avec zéro initial normalisé', () => {
      // "01" devrait matcher même si on stocke sans le zéro
      expect(getTimezoneFromDepartment('01')).toBe('Europe/Paris')
    })
  })
})

describe('getTimezoneFromLigue', () => {
  describe('DOM-TOM', () => {
    test('GUA (Guadeloupe) → America/Guadeloupe', () => {
      expect(getTimezoneFromLigue('GUA')).toBe('America/Guadeloupe')
    })

    test('MAR (Martinique) → America/Martinique', () => {
      expect(getTimezoneFromLigue('MAR')).toBe('America/Martinique')
    })

    test('GUY (Guyane) → America/Cayenne', () => {
      expect(getTimezoneFromLigue('GUY')).toBe('America/Cayenne')
    })

    test('REU (La Réunion) → Indian/Reunion', () => {
      expect(getTimezoneFromLigue('REU')).toBe('Indian/Reunion')
    })

    test('MAY (Mayotte) → Indian/Mayotte', () => {
      expect(getTimezoneFromLigue('MAY')).toBe('Indian/Mayotte')
    })

    test('P-F (Polynésie française) → Pacific/Tahiti', () => {
      expect(getTimezoneFromLigue('P-F')).toBe('Pacific/Tahiti')
    })

    test('N-C (Nouvelle-Calédonie) → Pacific/Noumea', () => {
      expect(getTimezoneFromLigue('N-C')).toBe('Pacific/Noumea')
    })

    test('W-F (Wallis-et-Futuna) → Pacific/Wallis', () => {
      expect(getTimezoneFromLigue('W-F')).toBe('Pacific/Wallis')
    })
  })

  describe('Métropole', () => {
    test('IDF (Île-de-France) → Europe/Paris', () => {
      expect(getTimezoneFromLigue('IDF')).toBe('Europe/Paris')
    })

    test('ARA (Auvergne-Rhône-Alpes) → Europe/Paris', () => {
      expect(getTimezoneFromLigue('ARA')).toBe('Europe/Paris')
    })

    test('BFC (Bourgogne-Franche-Comté) → Europe/Paris', () => {
      expect(getTimezoneFromLigue('BFC')).toBe('Europe/Paris')
    })
  })

  describe('Edge cases', () => {
    test('undefined → Europe/Paris', () => {
      expect(getTimezoneFromLigue(undefined)).toBe('Europe/Paris')
    })

    test('Ligue inconnue → Europe/Paris', () => {
      expect(getTimezoneFromLigue('XXX')).toBe('Europe/Paris')
    })
  })
})

describe('getTimezoneFromCountry', () => {
  test('France → Europe/Paris', () => {
    expect(getTimezoneFromCountry('France')).toBe('Europe/Paris')
  })

  test('Belgique → Europe/Brussels', () => {
    expect(getTimezoneFromCountry('Belgique')).toBe('Europe/Brussels')
  })

  test('Suisse → Europe/Zurich', () => {
    expect(getTimezoneFromCountry('Suisse')).toBe('Europe/Zurich')
  })

  test('Luxembourg → Europe/Luxembourg', () => {
    expect(getTimezoneFromCountry('Luxembourg')).toBe('Europe/Luxembourg')
  })

  test('Monaco → Europe/Monaco', () => {
    expect(getTimezoneFromCountry('Monaco')).toBe('Europe/Monaco')
  })

  test('Espagne → Europe/Madrid', () => {
    expect(getTimezoneFromCountry('Espagne')).toBe('Europe/Madrid')
  })

  test('Italie → Europe/Rome', () => {
    expect(getTimezoneFromCountry('Italie')).toBe('Europe/Rome')
  })

  test('Maroc → Africa/Casablanca', () => {
    expect(getTimezoneFromCountry('Maroc')).toBe('Africa/Casablanca')
  })

  describe('Edge cases', () => {
    test('undefined → Europe/Paris', () => {
      expect(getTimezoneFromCountry(undefined)).toBe('Europe/Paris')
    })

    test('Pays inconnu → Europe/Paris', () => {
      expect(getTimezoneFromCountry('Japon')).toBe('Europe/Paris')
    })

    test('Case insensitive', () => {
      expect(getTimezoneFromCountry('BELGIQUE')).toBe('Europe/Brussels')
      expect(getTimezoneFromCountry('belgique')).toBe('Europe/Brussels')
    })
  })
})

describe('getTimezoneFromLocation', () => {
  test('Priorité département DOM-TOM', () => {
    // Département DOM-TOM + pays France → département gagne
    expect(
      getTimezoneFromLocation({
        department: '974',
        country: 'France',
      })
    ).toBe('Indian/Reunion')
  })

  test('Priorité ligue DOM-TOM si pas de département DOM-TOM', () => {
    expect(
      getTimezoneFromLocation({
        department: '75', // Métropole
        ligue: 'REU', // La Réunion
      })
    ).toBe('Indian/Reunion')
  })

  test('Pays si pas de DOM-TOM', () => {
    expect(
      getTimezoneFromLocation({
        department: '75',
        country: 'Belgique',
      })
    ).toBe('Europe/Brussels')
  })

  test('Défaut si rien de spécifique', () => {
    expect(
      getTimezoneFromLocation({
        department: '75',
        country: 'France',
      })
    ).toBe('Europe/Paris')
  })

  test('Objet vide → Europe/Paris', () => {
    expect(getTimezoneFromLocation({})).toBe('Europe/Paris')
  })
})

describe('isDOMTOM', () => {
  test('971-988 → true', () => {
    expect(isDOMTOM('971')).toBe(true)
    expect(isDOMTOM('972')).toBe(true)
    expect(isDOMTOM('973')).toBe(true)
    expect(isDOMTOM('974')).toBe(true)
    expect(isDOMTOM('976')).toBe(true)
    expect(isDOMTOM('986')).toBe(true)
    expect(isDOMTOM('987')).toBe(true)
    expect(isDOMTOM('988')).toBe(true)
  })

  test('Métropole → false', () => {
    expect(isDOMTOM('75')).toBe(false)
    expect(isDOMTOM('01')).toBe(false)
    expect(isDOMTOM('69')).toBe(false)
  })

  test('undefined → false', () => {
    expect(isDOMTOM(undefined)).toBe(false)
  })
})

describe('getDefaultTimezone', () => {
  test('Retourne Europe/Paris', () => {
    expect(getDefaultTimezone()).toBe('Europe/Paris')
  })
})

describe('DEFAULT_TIMEZONE', () => {
  test('Constante Europe/Paris', () => {
    expect(DEFAULT_TIMEZONE).toBe('Europe/Paris')
  })
})
