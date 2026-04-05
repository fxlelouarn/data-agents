/**
 * Tests pour types.ts - Constantes et fonctions de mapping FFTRI
 */

import {
  FFTRI_LIGUES,
  FFTRI_LIGUE_FILTER_KEYS,
  FFTRI_MONTH_FILTER_KEYS,
  FFTRI_LIGUE_TO_REGION,
  convertFFTRILigueToRegionName,
  convertFFTRILigueToDisplayCode,
  mapFFTRISportToCategory,
} from '../types'

// ============================================================================
// CONSTANTES
// ============================================================================

describe('FFTRI_LIGUES', () => {
  it('contains exactly 18 ligues', () => {
    expect(FFTRI_LIGUES).toHaveLength(18)
  })

  it('contains all expected ligue codes', () => {
    expect(FFTRI_LIGUES).toContain('ARA')
    expect(FFTRI_LIGUES).toContain('BFC')
    expect(FFTRI_LIGUES).toContain('BRE')
    expect(FFTRI_LIGUES).toContain('CVL')
    expect(FFTRI_LIGUES).toContain('COR')
    expect(FFTRI_LIGUES).toContain('GES')
    expect(FFTRI_LIGUES).toContain('GP')
    expect(FFTRI_LIGUES).toContain('HDF')
    expect(FFTRI_LIGUES).toContain('IDF')
    expect(FFTRI_LIGUES).toContain('MQ')
    expect(FFTRI_LIGUES).toContain('NOR')
    expect(FFTRI_LIGUES).toContain('NC')
    expect(FFTRI_LIGUES).toContain('NAQ')
    expect(FFTRI_LIGUES).toContain('OCC')
    expect(FFTRI_LIGUES).toContain('PDL')
    expect(FFTRI_LIGUES).toContain('PAC')
    expect(FFTRI_LIGUES).toContain('RE')
    expect(FFTRI_LIGUES).toContain('PF')
  })
})

describe('FFTRI_LIGUE_FILTER_KEYS', () => {
  it('has one entry per ligue (18 entries)', () => {
    expect(FFTRI_LIGUE_FILTER_KEYS).toHaveLength(18)
  })

  it('has matching count as FFTRI_LIGUES', () => {
    expect(FFTRI_LIGUE_FILTER_KEYS.length).toBe(FFTRI_LIGUES.length)
  })

  it('all codes match the FFTRI_LIGUES array', () => {
    const filterKeyCodes = FFTRI_LIGUE_FILTER_KEYS.map(entry => entry.code)
    for (const code of FFTRI_LIGUES) {
      expect(filterKeyCodes).toContain(code)
    }
  })

  it('contains correct filter key for ARA', () => {
    const ara = FFTRI_LIGUE_FILTER_KEYS.find(e => e.code === 'ARA')
    expect(ara).toBeDefined()
    expect(ara!.filterKey).toBe('league_auvergne_rhone_alpes')
    expect(ara!.name).toBe('Auvergne-Rhône-Alpes')
  })

  it('contains correct filter key for IDF', () => {
    const idf = FFTRI_LIGUE_FILTER_KEYS.find(e => e.code === 'IDF')
    expect(idf).toBeDefined()
    expect(idf!.filterKey).toBe('league_ile_de_france')
  })

  it('contains correct filter key for PAC', () => {
    const pac = FFTRI_LIGUE_FILTER_KEYS.find(e => e.code === 'PAC')
    expect(pac).toBeDefined()
    expect(pac!.filterKey).toBe('league_provence_alpes_cote_d_azur')
  })

  it('contains correct filter key for PF (Polynésie)', () => {
    const pf = FFTRI_LIGUE_FILTER_KEYS.find(e => e.code === 'PF')
    expect(pf).toBeDefined()
    expect(pf!.filterKey).toBe('league_federation_tahitienne')
  })

  it('all entries have non-empty filterKey and name', () => {
    for (const entry of FFTRI_LIGUE_FILTER_KEYS) {
      expect(entry.filterKey).toBeTruthy()
      expect(entry.name).toBeTruthy()
      expect(entry.code).toBeTruthy()
    }
  })
})

describe('FFTRI_MONTH_FILTER_KEYS', () => {
  it('contains exactly 12 months', () => {
    expect(FFTRI_MONTH_FILTER_KEYS).toHaveLength(12)
  })

  it('months are numbered 1-12', () => {
    const months = FFTRI_MONTH_FILTER_KEYS.map(e => e.month)
    for (let i = 1; i <= 12; i++) {
      expect(months).toContain(i)
    }
  })

  it('contains correct filter key for January', () => {
    const jan = FFTRI_MONTH_FILTER_KEYS.find(e => e.month === 1)
    expect(jan).toBeDefined()
    expect(jan!.filterKey).toBe('month_january')
    expect(jan!.name).toBe('Janvier')
  })

  it('contains correct filter key for December', () => {
    const dec = FFTRI_MONTH_FILTER_KEYS.find(e => e.month === 12)
    expect(dec).toBeDefined()
    expect(dec!.filterKey).toBe('month_december')
    expect(dec!.name).toBe('Décembre')
  })

  it('all entries have non-empty filterKey and name', () => {
    for (const entry of FFTRI_MONTH_FILTER_KEYS) {
      expect(entry.filterKey).toBeTruthy()
      expect(entry.name).toBeTruthy()
    }
  })
})

// ============================================================================
// CONVERSION LIGUES
// ============================================================================

describe('convertFFTRILigueToRegionName', () => {
  it('converts ARA to Auvergne-Rhône-Alpes', () => {
    expect(convertFFTRILigueToRegionName('ARA')).toBe('Auvergne-Rhône-Alpes')
  })

  it('converts IDF to Île-de-France', () => {
    expect(convertFFTRILigueToRegionName('IDF')).toBe('Île-de-France')
  })

  it('converts GP to Guadeloupe', () => {
    expect(convertFFTRILigueToRegionName('GP')).toBe('Guadeloupe')
  })

  it('converts MQ to Martinique', () => {
    expect(convertFFTRILigueToRegionName('MQ')).toBe('Martinique')
  })

  it('converts NC to Nouvelle-Calédonie', () => {
    expect(convertFFTRILigueToRegionName('NC')).toBe('Nouvelle-Calédonie')
  })

  it('converts PF to Polynésie française', () => {
    expect(convertFFTRILigueToRegionName('PF')).toBe('Polynésie française')
  })

  it('returns the input code for unknown ligue', () => {
    expect(convertFFTRILigueToRegionName('UNKNOWN')).toBe('UNKNOWN')
  })

  it('covers all 18 ligues', () => {
    for (const ligue of FFTRI_LIGUES) {
      const name = convertFFTRILigueToRegionName(ligue)
      expect(name).not.toBe(ligue) // Should have a proper mapping
      expect(name).toBeTruthy()
    }
  })
})

describe('convertFFTRILigueToDisplayCode', () => {
  it('converts ARA to ARA', () => {
    expect(convertFFTRILigueToDisplayCode('ARA')).toBe('ARA')
  })

  it('converts CVL to CVL', () => {
    expect(convertFFTRILigueToDisplayCode('CVL')).toBe('CVL')
  })

  it('converts GP to GP', () => {
    expect(convertFFTRILigueToDisplayCode('GP')).toBe('GP')
  })

  it('converts MQ to MQ', () => {
    expect(convertFFTRILigueToDisplayCode('MQ')).toBe('MQ')
  })

  it('converts RE to RE', () => {
    expect(convertFFTRILigueToDisplayCode('RE')).toBe('RE')
  })

  it('converts PF to PF', () => {
    expect(convertFFTRILigueToDisplayCode('PF')).toBe('PF')
  })

  it('returns the input code for unknown ligue', () => {
    expect(convertFFTRILigueToDisplayCode('UNKNOWN')).toBe('UNKNOWN')
  })
})

describe('FFTRI_LIGUE_TO_REGION', () => {
  it('has entries for all 18 ligues', () => {
    for (const ligue of FFTRI_LIGUES) {
      expect(FFTRI_LIGUE_TO_REGION[ligue]).toBeDefined()
    }
  })

  it('has correct code for GP (Guadeloupe)', () => {
    expect(FFTRI_LIGUE_TO_REGION['GP'].code).toBe('971')
  })

  it('has correct code for MQ (Martinique)', () => {
    expect(FFTRI_LIGUE_TO_REGION['MQ'].code).toBe('972')
  })

  it('has correct code for RE (Réunion)', () => {
    expect(FFTRI_LIGUE_TO_REGION['RE'].code).toBe('974')
  })

  it('has correct code for NC (Nouvelle-Calédonie)', () => {
    expect(FFTRI_LIGUE_TO_REGION['NC'].code).toBe('988')
  })

  it('has correct code for PF (Polynésie)', () => {
    expect(FFTRI_LIGUE_TO_REGION['PF'].code).toBe('987')
  })
})

// ============================================================================
// MAPPING CATÉGORIES
// ============================================================================

describe('mapFFTRISportToCategory', () => {
  // Triathlon formats
  describe('TRI sport type', () => {
    it('maps TRI + XXS to TRIATHLON_XS', () => {
      expect(mapFFTRISportToCategory('TRI', 'XXS')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_XS',
      })
    })

    it('maps TRI + XS to TRIATHLON_XS', () => {
      expect(mapFFTRISportToCategory('TRI', 'XS')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_XS',
      })
    })

    it('maps TRI + S to TRIATHLON_S', () => {
      expect(mapFFTRISportToCategory('TRI', 'S')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_S',
      })
    })

    it('maps TRI + M to TRIATHLON_M', () => {
      expect(mapFFTRISportToCategory('TRI', 'M')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_M',
      })
    })

    it('maps TRI + L to TRIATHLON_L', () => {
      expect(mapFFTRISportToCategory('TRI', 'L')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_L',
      })
    })

    it('maps TRI + XL to TRIATHLON_XL', () => {
      expect(mapFFTRISportToCategory('TRI', 'XL')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_XL',
      })
    })

    it('maps TRI + XXL to TRIATHLON_XXL', () => {
      expect(mapFFTRISportToCategory('TRI', 'XXL')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_XXL',
      })
    })
  })

  // Other sport types
  describe('other sport types', () => {
    it('maps DUA to DUATHLON', () => {
      expect(mapFFTRISportToCategory('DUA', 'S')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'DUATHLON',
      })
    })

    it('maps X-DUA to DUATHLON', () => {
      expect(mapFFTRISportToCategory('X-DUA', 'M')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'DUATHLON',
      })
    })

    it('maps AQUA to AQUATHLON', () => {
      expect(mapFFTRISportToCategory('AQUA', 'S')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'AQUATHLON',
      })
    })

    it('maps X-TRI to CROSS_TRIATHLON', () => {
      expect(mapFFTRISportToCategory('X-TRI', 'S')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'CROSS_TRIATHLON',
      })
    })

    it('maps S&R to SWIM_RUN', () => {
      expect(mapFFTRISportToCategory('S&R', 'S')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'SWIM_RUN',
      })
    })

    it('maps S&B to SWIM_BIKE', () => {
      expect(mapFFTRISportToCategory('S&B', 'M')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'SWIM_BIKE',
      })
    })

    it('maps B&R to RUN_BIKE', () => {
      expect(mapFFTRISportToCategory('B&R', 'M')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'RUN_BIKE',
      })
    })

    it('maps RAID to OTHER', () => {
      expect(mapFFTRISportToCategory('RAID', 'M')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'OTHER',
      })
    })
  })

  // CYCL - ignored
  describe('CYCL (cyclathlon)', () => {
    it('returns null for CYCL', () => {
      expect(mapFFTRISportToCategory('CYCL', 'S')).toBeNull()
    })

    it('returns null for CYCL regardless of format', () => {
      expect(mapFFTRISportToCategory('CYCL', 'M')).toBeNull()
      expect(mapFFTRISportToCategory('CYCL', 'JEUNES-1')).toBeNull()
    })
  })

  // JEUNES variants
  describe('JEUNES format', () => {
    it('maps TRI + JEUNES-1 to TRIATHLON_KIDS', () => {
      expect(mapFFTRISportToCategory('TRI', 'JEUNES-1')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_KIDS',
      })
    })

    it('maps TRI + JEUNES-2 to TRIATHLON_KIDS', () => {
      expect(mapFFTRISportToCategory('TRI', 'JEUNES-2')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_KIDS',
      })
    })

    it('maps TRI + S-JEUNES to TRIATHLON_KIDS', () => {
      expect(mapFFTRISportToCategory('TRI', 'S-JEUNES')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_KIDS',
      })
    })

    it('maps TRI + XXS-JEUNES to TRIATHLON_KIDS', () => {
      expect(mapFFTRISportToCategory('TRI', 'XXS-JEUNES')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_KIDS',
      })
    })

    it('maps TRI + XS-JEUNES to TRIATHLON_KIDS', () => {
      expect(mapFFTRISportToCategory('TRI', 'XS-JEUNES')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_KIDS',
      })
    })

    it('maps AQUA + XS-JEUNES to TRIATHLON_KIDS', () => {
      expect(mapFFTRISportToCategory('AQUA', 'XS-JEUNES')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_KIDS',
      })
    })

    it('maps RAID + XXS-JEUNES-EQ to TRIATHLON_KIDS (JEUNES takes priority)', () => {
      expect(mapFFTRISportToCategory('RAID', 'XXS-JEUNES-EQ')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_KIDS',
      })
    })
  })

  // Format suffix stripping
  describe('format suffix stripping', () => {
    it('strips -OP suffix from TRI format (S-OP → S)', () => {
      expect(mapFFTRISportToCategory('TRI', 'S-OP')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_S',
      })
    })

    it('strips -CLM suffix from TRI format (M-CLM → M)', () => {
      expect(mapFFTRISportToCategory('TRI', 'M-CLM')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_M',
      })
    })

    it('strips -EQ suffix from TRI format (S-EQ → S)', () => {
      expect(mapFFTRISportToCategory('TRI', 'S-EQ')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_S',
      })
    })

    it('strips -OPEN suffix from TRI format (XL-OPEN → XL)', () => {
      expect(mapFFTRISportToCategory('TRI', 'XL-OPEN')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_XL',
      })
    })

    it('strips -EQ suffix from TRI XXS (XXS-EQ → XXS → TRIATHLON_XS)', () => {
      expect(mapFFTRISportToCategory('TRI', 'XXS-EQ')).toEqual({
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: 'TRIATHLON_XS',
      })
    })
  })
})
