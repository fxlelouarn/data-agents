# FFTRI Scraper Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a FFTRI (Fédération Française de Triathlon) scraper agent that extracts triathlon/multisport events from `fftri.t2area.com` and creates proposals in the data-agents system.

**Architecture:** Clone the FFA scraper pattern — separate modules for HTTP scraping, HTML parsing, matching (adapter to framework), deduplication, and orchestration. Standard distances are derived from a reference table instead of scraping individual race pages.

**Tech Stack:** Node.js, TypeScript, Cheerio (HTML parsing), axios (HTTP), agent-framework (matching, proposals), Prisma (database)

**Spec:** `docs/superpowers/specs/2026-04-05-fftri-scraper-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/types/src/agent-versions.ts` | Add FFTRI_SCRAPER version |
| `packages/types/src/agent-config-schemas/fftri-scraper.ts` | Config schema for dashboard UI |
| `packages/types/src/agent-config-schemas/index.ts` | Export new schema |
| `apps/agents/src/fftri/types.ts` | Types, config, ligues constants, category mapping |
| `apps/agents/src/fftri/distances.ts` | Standard distance table per format and discipline |
| `apps/agents/src/fftri/scraper.ts` | HTTP fetching: listing (paginated) + event detail |
| `apps/agents/src/fftri/parser.ts` | Cheerio parsing: listing HTML + detail HTML |
| `apps/agents/src/fftri/matcher.ts` | Adapter: FFTRI types → EventMatchInput (framework) |
| `apps/agents/src/fftri/deduplication.ts` | Re-export from ffa/deduplication (identical logic) |
| `apps/agents/src/FFTRIScraperAgent.ts` | Main orchestration agent |
| `apps/agents/src/registry/fftri-scraper.ts` | Registry entry |
| `apps/agents/src/index.ts` | Register FFTRI_SCRAPER |
| `apps/agents/src/fftri/__tests__/parser.test.ts` | Parser unit tests |
| `apps/agents/src/fftri/__tests__/distances.test.ts` | Distance table tests |
| `apps/agents/src/fftri/__tests__/types.test.ts` | Category mapping tests |

---

### Task 1: Types & Constants (`fftri/types.ts`)

**Files:**
- Create: `apps/agents/src/fftri/types.ts`
- Test: `apps/agents/src/fftri/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test for category mapping**

```typescript
// apps/agents/src/fftri/__tests__/types.test.ts
import { mapFFTRISportToCategory, FFTRI_LIGUES, FFTRI_LIGUE_FILTER_KEYS, FFTRI_MONTH_FILTER_KEYS } from '../types'

describe('mapFFTRISportToCategory', () => {
  it('maps TRI formats to correct TRIATHLON subcategories', () => {
    expect(mapFFTRISportToCategory('TRI', 'XS')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_XS' })
    expect(mapFFTRISportToCategory('TRI', 'S')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_S' })
    expect(mapFFTRISportToCategory('TRI', 'M')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_M' })
    expect(mapFFTRISportToCategory('TRI', 'L')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_L' })
    expect(mapFFTRISportToCategory('TRI', 'XXL')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_XXL' })
  })

  it('maps TRI XXS to TRIATHLON_XS', () => {
    expect(mapFFTRISportToCategory('TRI', 'XXS')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_XS' })
  })

  it('maps DUA and X-DUA to DUATHLON', () => {
    expect(mapFFTRISportToCategory('DUA', 'S')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'DUATHLON' })
    expect(mapFFTRISportToCategory('X-DUA', 'JEUNES-1')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' })
  })

  it('maps AQUA to AQUATHLON', () => {
    expect(mapFFTRISportToCategory('AQUA', 'S')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'AQUATHLON' })
  })

  it('maps X-TRI to CROSS_TRIATHLON', () => {
    expect(mapFFTRISportToCategory('X-TRI', 'M')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'CROSS_TRIATHLON' })
  })

  it('maps S&R to SWIM_RUN', () => {
    expect(mapFFTRISportToCategory('S&R', 'L')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'SWIM_RUN' })
  })

  it('maps S&B to SWIM_BIKE', () => {
    expect(mapFFTRISportToCategory('S&B', 'M')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'SWIM_BIKE' })
  })

  it('maps B&R to RUN_BIKE', () => {
    expect(mapFFTRISportToCategory('B&R', 'M-EQ')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'RUN_BIKE' })
  })

  it('maps RAID to OTHER', () => {
    expect(mapFFTRISportToCategory('RAID', 'M-EQ')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'OTHER' })
  })

  it('maps JEUNES suffixes to TRIATHLON_KIDS', () => {
    expect(mapFFTRISportToCategory('TRI', 'JEUNES-1')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' })
    expect(mapFFTRISportToCategory('TRI', 'JEUNES-2')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' })
    expect(mapFFTRISportToCategory('TRI', 'S-JEUNES')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' })
    expect(mapFFTRISportToCategory('TRI', 'XXS-JEUNES')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' })
    expect(mapFFTRISportToCategory('AQUA', 'XS-JEUNES')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' })
    expect(mapFFTRISportToCategory('RAID', 'XXS-JEUNES-EQ')).toEqual({ categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' })
  })

  it('returns null for CYCL (ignored discipline)', () => {
    expect(mapFFTRISportToCategory('CYCL', 'S')).toBeNull()
  })
})

describe('FFTRI constants', () => {
  it('has 18 ligues', () => {
    expect(FFTRI_LIGUES).toHaveLength(18)
  })

  it('has 12 month filter keys', () => {
    expect(FFTRI_MONTH_FILTER_KEYS).toHaveLength(12)
  })

  it('has matching ligue filter keys', () => {
    expect(FFTRI_LIGUE_FILTER_KEYS).toHaveLength(FFTRI_LIGUES.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns="fftri/__tests__/types" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types module**

```typescript
// apps/agents/src/fftri/types.ts

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface FFTRIScraperConfig {
  sourceDatabase: string
  liguesPerRun: number
  monthsPerRun: number
  scrapingWindowMonths: number
  rescanDelayDays: number
  humanDelayMs: number
  similarityThreshold: number
  distanceTolerancePercent: number
  confidenceBase: number
  maxEventsPerMonth?: number
}

// ============================================================================
// DONNÉES FFTRI EXTRAITES
// ============================================================================

/** Événement FFTRI extrait du listing */
export interface FFTRIEvent {
  /** ID FFTRI (blocEvent_XXXX) */
  fftriId: string
  /** Nom de l'événement */
  name: string
  /** Date(s) de l'événement */
  dates: FFTRIEventDate[]
  /** Ville */
  city: string
  /** Code postal */
  postalCode: string
  /** Département (déduit du code postal) */
  department: string
  /** Ligue / Région */
  ligue: string
  /** URL de la page détail */
  detailUrl: string
  /** Liste des épreuves */
  races: FFTRIRace[]
}

/** Date d'un événement (un événement peut avoir plusieurs jours) */
export interface FFTRIEventDate {
  dayOfWeek: string  // "dim.", "sam.", etc.
  day: number
  month: string      // "mai", "juin", etc.
}

/** Épreuve FFTRI extraite du listing */
export interface FFTRIRace {
  /** Type sport (TRI, DUA, AQUA, X-TRI, S&R, S&B, B&R, RAID, X-DUA, CYCL) */
  sportType: string
  /** Format/distance (XS, S, M, L, XXL, JEUNES-1, etc.) */
  format: string
  /** Catégorie CSS (national, youth, challenge) */
  category: string
  /** URL de la page épreuve */
  raceUrl: string
}

/** Détails complets d'un événement FFTRI (page détail) */
export interface FFTRIEventDetails {
  event: FFTRIEvent
  startDate: Date
  endDate: Date
  organizerName?: string
  organizerWebsite?: string
  latitude?: number
  longitude?: number
}

// ============================================================================
// MATCHING
// ============================================================================

export interface FFTRIMatchResult {
  type: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'NO_MATCH'
  event?: {
    id: string
    name: string
    city: string
    similarity: number
  }
  edition?: {
    id: string
    year: string
    startDate: Date | null
  }
  confidence: number
  rejectedMatches?: Array<{
    eventId: number
    eventName: string
    eventSlug: string
    eventCity: string
    eventDepartment: string
    editionId?: number
    editionYear?: string
    matchScore: number
    nameScore: number
    cityScore: number
    departmentMatch: boolean
    dateProximity: number
  }>
  llmNewEventConfidence?: number
  llmReason?: string
  llmCleanedEventName?: string
}

// ============================================================================
// PROGRESSION
// ============================================================================

export interface FFTRIScrapingProgress {
  currentLigue: string
  currentMonth: string
  currentPage: number
  completedLigues: string[]
  completedMonths: Record<string, string[]>
  lastCompletedAt?: Date
  totalEventsScraped: number
}

// ============================================================================
// CONSTANTES - LIGUES
// ============================================================================

export const FFTRI_LIGUES = [
  'ARA', // Auvergne-Rhône-Alpes
  'BFC', // Bourgogne-Franche-Comté
  'BRE', // Bretagne
  'CVL', // Centre-Val de Loire
  'COR', // Corse
  'GES', // Grand Est
  'GP',  // Guadeloupe
  'HDF', // Hauts-de-France
  'IDF', // Île-de-France
  'MQ',  // Martinique
  'NOR', // Normandie
  'NC',  // Nouvelle-Calédonie
  'NAQ', // Nouvelle-Aquitaine
  'OCC', // Occitanie
  'PDL', // Pays de la Loire
  'PAC', // Provence-Alpes-Côte d'Azur
  'RE',  // Réunion
  'PF',  // Fédération Tahitienne
] as const

export type FFTRILigue = typeof FFTRI_LIGUES[number]

/** Mapping ligue code → filter query param key */
export const FFTRI_LIGUE_FILTER_KEYS: Array<{ code: FFTRILigue, filterKey: string, name: string }> = [
  { code: 'ARA', filterKey: 'league_auvergne_rhone_alpes', name: 'Auvergne-Rhône-Alpes' },
  { code: 'BFC', filterKey: 'league_bourgogne_franche_comte', name: 'Bourgogne-Franche-Comté' },
  { code: 'BRE', filterKey: 'league_bretagne', name: 'Bretagne' },
  { code: 'CVL', filterKey: 'league_centre_val_de_loire', name: 'Centre-Val de Loire' },
  { code: 'COR', filterKey: 'league_corse', name: 'Corse' },
  { code: 'GES', filterKey: 'league_grand_est', name: 'Grand Est' },
  { code: 'GP',  filterKey: 'league_guadeloupe', name: 'Guadeloupe' },
  { code: 'HDF', filterKey: 'league_hauts_de_france', name: 'Hauts-de-France' },
  { code: 'IDF', filterKey: 'league_ile_de_france', name: 'Île-de-France' },
  { code: 'MQ',  filterKey: 'league_martinique', name: 'Martinique' },
  { code: 'NOR', filterKey: 'league_normandie', name: 'Normandie' },
  { code: 'NC',  filterKey: 'league_nouvelle_caledonie', name: 'Nouvelle-Calédonie' },
  { code: 'NAQ', filterKey: 'league_nouvelle_aquitaine', name: 'Nouvelle-Aquitaine' },
  { code: 'OCC', filterKey: 'league_occitanie', name: 'Occitanie' },
  { code: 'PDL', filterKey: 'league_pays_de_la_loire', name: 'Pays de la Loire' },
  { code: 'PAC', filterKey: 'league_provence_alpes_cote_d_azur', name: "Provence-Alpes-Côte d'Azur" },
  { code: 'RE',  filterKey: 'league_reunion', name: 'Réunion' },
  { code: 'PF',  filterKey: 'league_federation_tahitienne', name: 'Fédération Tahitienne' },
]

// ============================================================================
// CONSTANTES - MOIS
// ============================================================================

export const FFTRI_MONTH_FILTER_KEYS = [
  { month: 1,  filterKey: 'month_january',   name: 'Janvier' },
  { month: 2,  filterKey: 'month_february',  name: 'Février' },
  { month: 3,  filterKey: 'month_march',     name: 'Mars' },
  { month: 4,  filterKey: 'month_april',     name: 'Avril' },
  { month: 5,  filterKey: 'month_may',       name: 'Mai' },
  { month: 6,  filterKey: 'month_june',      name: 'Juin' },
  { month: 7,  filterKey: 'month_july',      name: 'Juillet' },
  { month: 8,  filterKey: 'month_august',    name: 'Août' },
  { month: 9,  filterKey: 'month_september', name: 'Septembre' },
  { month: 10, filterKey: 'month_october',   name: 'Octobre' },
  { month: 11, filterKey: 'month_november',  name: 'Novembre' },
  { month: 12, filterKey: 'month_december',  name: 'Décembre' },
] as const

// ============================================================================
// CONSTANTES - MAPPING CATÉGORIES
// ============================================================================

/**
 * Mapping ligue → region info (same codes as FFA for compatibility with Miles Republic)
 */
export const FFTRI_LIGUE_TO_REGION: Record<string, { code: string, name: string, displayCode: string }> = {
  'ARA': { code: 'ARA', name: 'Auvergne-Rhône-Alpes', displayCode: 'ARA' },
  'BFC': { code: 'BFC', name: 'Bourgogne-Franche-Comté', displayCode: 'BFC' },
  'BRE': { code: 'BRE', name: 'Bretagne', displayCode: 'BRE' },
  'CVL': { code: 'CVL', name: 'Centre-Val de Loire', displayCode: 'CVL' },
  'COR': { code: 'COR', name: 'Corse', displayCode: 'COR' },
  'GES': { code: 'GES', name: 'Grand Est', displayCode: 'GES' },
  'HDF': { code: 'HDF', name: 'Hauts-de-France', displayCode: 'HDF' },
  'IDF': { code: 'IDF', name: 'Île-de-France', displayCode: 'IDF' },
  'NOR': { code: 'NOR', name: 'Normandie', displayCode: 'NOR' },
  'NAQ': { code: 'NAQ', name: 'Nouvelle-Aquitaine', displayCode: 'NAQ' },
  'OCC': { code: 'OCC', name: 'Occitanie', displayCode: 'OCC' },
  'PDL': { code: 'PDL', name: 'Pays de la Loire', displayCode: 'PDL' },
  'PAC': { code: 'PAC', name: "Provence-Alpes-Côte d'Azur", displayCode: 'PAC' },
  'GP':  { code: '971', name: 'Guadeloupe', displayCode: 'GP' },
  'MQ':  { code: '972', name: 'Martinique', displayCode: 'MQ' },
  'RE':  { code: '974', name: 'La Réunion', displayCode: 'RE' },
  'NC':  { code: '988', name: 'Nouvelle-Calédonie', displayCode: 'NC' },
  'PF':  { code: '987', name: 'Polynésie française', displayCode: 'PF' },
}

export function convertFFTRILigueToRegionName(ligue: string): string {
  return FFTRI_LIGUE_TO_REGION[ligue]?.name || ligue
}

export function convertFFTRILigueToDisplayCode(ligue: string): string {
  return FFTRI_LIGUE_TO_REGION[ligue]?.displayCode || ligue
}

/**
 * Maps a FFTRI sport type + format to Miles Republic categoryLevel1/categoryLevel2.
 * Returns null for ignored disciplines (CYCL).
 */
export function mapFFTRISportToCategory(
  sportType: string,
  format: string
): { categoryLevel1: string; categoryLevel2: string } | null {
  // Ignored disciplines
  if (sportType === 'CYCL') return null

  // JEUNES suffix → TRIATHLON_KIDS (check first, applies to all sport types)
  if (/JEUNES/i.test(format)) {
    return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' }
  }

  // Extract the base format (before -OP, -EQ, -CLM suffixes)
  const baseFormat = format.replace(/-(OP|EQ|CLM|OPEN)$/i, '').replace(/-OP-.*$/i, '')

  switch (sportType) {
    case 'TRI': {
      const triMap: Record<string, string> = {
        'XXS': 'TRIATHLON_XS',
        'XS': 'TRIATHLON_XS',
        'S': 'TRIATHLON_S',
        'M': 'TRIATHLON_M',
        'L': 'TRIATHLON_L',
        'XL': 'TRIATHLON_XL',
        'XXL': 'TRIATHLON_XXL',
      }
      return {
        categoryLevel1: 'TRIATHLON',
        categoryLevel2: triMap[baseFormat] || 'TRIATHLON_S'  // Default to S if unknown
      }
    }
    case 'DUA':
    case 'X-DUA':
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'DUATHLON' }
    case 'AQUA':
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'AQUATHLON' }
    case 'X-TRI':
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'CROSS_TRIATHLON' }
    case 'S&R':
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'SWIM_RUN' }
    case 'S&B':
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'SWIM_BIKE' }
    case 'B&R':
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'RUN_BIKE' }
    case 'RAID':
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'OTHER' }
    default:
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'OTHER' }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns="fftri/__tests__/types" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/fftri/types.ts apps/agents/src/fftri/__tests__/types.test.ts
git commit -m "feat(agents): add FFTRI scraper types and constants"
```

---

### Task 2: Distance Reference Table (`fftri/distances.ts`)

**Files:**
- Create: `apps/agents/src/fftri/distances.ts`
- Test: `apps/agents/src/fftri/__tests__/distances.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/agents/src/fftri/__tests__/distances.test.ts
import { getStandardDistances } from '../distances'

describe('getStandardDistances', () => {
  describe('triathlon', () => {
    it('returns XS distances', () => {
      const d = getStandardDistances('TRI', 'XS')
      expect(d).toEqual({ swimDistance: 400, bikeDistance: 10, runDistance: 2.5 })
    })

    it('returns S distances', () => {
      const d = getStandardDistances('TRI', 'S')
      expect(d).toEqual({ swimDistance: 750, bikeDistance: 20, runDistance: 5 })
    })

    it('returns M distances', () => {
      const d = getStandardDistances('TRI', 'M')
      expect(d).toEqual({ swimDistance: 1500, bikeDistance: 40, runDistance: 10 })
    })

    it('returns L distances', () => {
      const d = getStandardDistances('TRI', 'L')
      expect(d).toEqual({ swimDistance: 3000, bikeDistance: 80, runDistance: 30 })
    })

    it('returns XXL distances', () => {
      const d = getStandardDistances('TRI', 'XXL')
      expect(d).toEqual({ swimDistance: 3800, bikeDistance: 180, runDistance: 42.195 })
    })

    it('maps XXS to XS distances', () => {
      const d = getStandardDistances('TRI', 'XXS')
      expect(d).toEqual({ swimDistance: 100, bikeDistance: 4, runDistance: 1 })
    })
  })

  describe('duathlon', () => {
    it('returns S distances (run + bike + run)', () => {
      const d = getStandardDistances('DUA', 'S')
      expect(d).toEqual({ bikeDistance: 20, runDistance: 7.5 })
    })
  })

  describe('aquathlon', () => {
    it('returns S distances', () => {
      const d = getStandardDistances('AQUA', 'S')
      expect(d).toEqual({ swimDistance: 750, runDistance: 5 })
    })
  })

  describe('unknown formats', () => {
    it('returns null for RAID (non-standardized)', () => {
      expect(getStandardDistances('RAID', 'M')).toBeNull()
    })

    it('returns null for unknown sport type', () => {
      expect(getStandardDistances('CYCL', 'S')).toBeNull()
    })
  })

  describe('format normalization', () => {
    it('strips -OP suffix', () => {
      const d = getStandardDistances('TRI', 'S-OP')
      expect(d).toEqual({ swimDistance: 750, bikeDistance: 20, runDistance: 5 })
    })

    it('strips -EQ suffix', () => {
      const d = getStandardDistances('TRI', 'S-EQ')
      expect(d).toEqual({ swimDistance: 750, bikeDistance: 20, runDistance: 5 })
    })

    it('strips -CLM suffix', () => {
      const d = getStandardDistances('TRI', 'M-CLM')
      expect(d).toEqual({ swimDistance: 1500, bikeDistance: 40, runDistance: 10 })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns="fftri/__tests__/distances" --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write the distances module**

```typescript
// apps/agents/src/fftri/distances.ts

/**
 * Standard FFTRI distances per sport type and format.
 * swimDistance in meters, bikeDistance and runDistance in km.
 * Source: FFTRI official regulations.
 */

interface StandardDistances {
  swimDistance?: number   // meters
  bikeDistance?: number   // km
  runDistance?: number    // km
}

const TRI_DISTANCES: Record<string, StandardDistances> = {
  'XXS': { swimDistance: 100,  bikeDistance: 4,   runDistance: 1 },
  'XS':  { swimDistance: 400,  bikeDistance: 10,  runDistance: 2.5 },
  'S':   { swimDistance: 750,  bikeDistance: 20,  runDistance: 5 },
  'M':   { swimDistance: 1500, bikeDistance: 40,  runDistance: 10 },
  'L':   { swimDistance: 3000, bikeDistance: 80,  runDistance: 30 },
  'XL':  { swimDistance: 3000, bikeDistance: 120, runDistance: 30 },
  'XXL': { swimDistance: 3800, bikeDistance: 180, runDistance: 42.195 },
}

const DUA_DISTANCES: Record<string, StandardDistances> = {
  'XS': { bikeDistance: 10, runDistance: 3.75 },   // 2.5 + 1.25
  'S':  { bikeDistance: 20, runDistance: 7.5 },     // 5 + 2.5
  'M':  { bikeDistance: 40, runDistance: 15 },      // 10 + 5
  'L':  { bikeDistance: 60, runDistance: 20 },      // 10 + 10
}

const AQUA_DISTANCES: Record<string, StandardDistances> = {
  'XS': { swimDistance: 250,  runDistance: 1.5 },
  'S':  { swimDistance: 750,  runDistance: 5 },
  'M':  { swimDistance: 1500, runDistance: 10 },
}

/**
 * Normalizes a FFTRI format by stripping suffixes like -OP, -EQ, -CLM, -OPEN.
 * Also strips the JEUNES variants since distances don't apply to kids races.
 */
function normalizeFormat(format: string): string {
  return format
    .replace(/-(OP|EQ|CLM|OPEN)$/i, '')
    .replace(/-OP-.*$/i, '')
    .replace(/-(JEUNES|JEUNES-\d).*$/i, '')
    .toUpperCase()
}

/**
 * Returns standard distances for a given sport type and format.
 * Returns null if the sport/format combination has no standardized distances.
 *
 * @param sportType - FFTRI sport code (TRI, DUA, X-DUA, AQUA, etc.)
 * @param format - FFTRI format code (XS, S, M, L, XXL, S-OP, M-CLM, etc.)
 */
export function getStandardDistances(sportType: string, format: string): StandardDistances | null {
  const normalizedFormat = normalizeFormat(format)

  switch (sportType) {
    case 'TRI':
      return TRI_DISTANCES[normalizedFormat] || null
    case 'DUA':
    case 'X-DUA':
      return DUA_DISTANCES[normalizedFormat] || null
    case 'AQUA':
      return AQUA_DISTANCES[normalizedFormat] || null
    // Cross-triathlon, Swim&Run, Swim&Bike, Bike&Run, Raid: non-standardized
    case 'X-TRI':
    case 'S&R':
    case 'S&B':
    case 'B&R':
    case 'RAID':
    default:
      return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns="fftri/__tests__/distances" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/fftri/distances.ts apps/agents/src/fftri/__tests__/distances.test.ts
git commit -m "feat(agents): add FFTRI standard distance reference table"
```

---

### Task 3: HTML Parser (`fftri/parser.ts`)

**Files:**
- Create: `apps/agents/src/fftri/parser.ts`
- Test: `apps/agents/src/fftri/__tests__/parser.test.ts`

- [ ] **Step 1: Write the failing test with real HTML fixtures**

Create a test file that uses real HTML snippets from the FFTRI site. The test should cover both listing and detail page parsing.

```typescript
// apps/agents/src/fftri/__tests__/parser.test.ts
import { parseEventsList, parseEventDetails } from '../parser'

// Minimal HTML fixture for a single event in the listing
const LISTING_HTML_FIXTURE = `
<a id="blocEvent_3452" class="blocEvent d-flex align-items-center justify-content-between orga js-filter__item" target="_self" href="https://fftri.t2area.com/calendrier/triathlon-du-dauphine.html">
  <div class="d-flex align-items-center flex-wrap flex-md-nowrap flex-grow-1 justify-content-between">
    <div class="datesEvent d-flex align-items-center flex-row">
      <div class="dateEvent d-flex align-items-center flex-column">
        <div class="jourLibEvent">dim.</div>
        <div class="jourEvent">3</div>
        <div class="moisEvent">mai</div>
      </div>
    </div>
    <div class="d-flex flex-grow-1 flex-column px-2">
      <div class="nomEvent">Triathlon du Dauphiné (26)</div>
      <div class="lieuEvent">
        <span>26260 ST DONAT SUR L&#039;HERBASSE&nbsp;</span>
      </div>
      <div class="tagsEvent pb-2 pb-md-0">
        <span class="badge badge--warning text-sm">FFTRI Challenge National</span>
      </div>
    </div>
    <div class="distancesEvent justify-content-end d-flex flex-wrap px-1 pt-1 me-2">
      <div class="distBlocEvent youth me-1 mb-1 d-flex align-items-center justify-content-center flex-column" onclick="window.location.href='https://fftri.t2area.com/calendrier/triathlon-du-dauphine/cross-duathlon-jeunes-1.html'">
        <div class="sportEvent">X-DUA</div>
        <div class="distEvent">JEUNES-1</div>
        <div class="kmEvent">&nbsp;</div>
      </div>
      <div class="distBlocEvent national me-1 mb-1 d-flex align-items-center justify-content-center flex-column" onclick="window.location.href='https://fftri.t2area.com/calendrier/triathlon-du-dauphine/triathlon-xs-open.html'">
        <div class="sportEvent">TRI</div>
        <div class="distEvent">XS-OP</div>
        <div class="kmEvent">&nbsp;</div>
      </div>
    </div>
  </div>
</a>
`

// Multi-day event fixture
const MULTI_DAY_FIXTURE = `
<a id="blocEvent_13161" class="blocEvent d-flex align-items-center justify-content-between orga js-filter__item" target="_self" href="https://fftri.t2area.com/calendrier/lxttraid-grand-sancy.html">
  <div class="d-flex align-items-center flex-wrap flex-md-nowrap flex-grow-1 justify-content-between">
    <div class="datesEvent d-flex align-items-center flex-row">
      <div class="dateEvent d-flex align-items-center flex-column">
        <div class="jourLibEvent">ven.</div>
        <div class="jourEvent">8</div>
        <div class="moisEvent">mai</div>
      </div>
    </div>
    <div class="d-flex flex-grow-1 flex-column px-2">
      <div class="nomEvent">L'Xttraid Grand Sancy (63)</div>
      <div class="lieuEvent">
        <span>63680 LA TOUR-D'AUVERGNE&nbsp;</span>
      </div>
      <div class="tagsEvent pb-2 pb-md-0"></div>
    </div>
    <div class="distancesEvent justify-content-end d-flex flex-wrap px-1 pt-1 me-2">
      <div class="distBlocEvent national me-1 mb-1 d-flex align-items-center justify-content-center flex-column" onclick="window.location.href='https://fftri.t2area.com/calendrier/lxttraid-grand-sancy/raids-l-eq.html'">
        <div class="sportEvent">RAID</div>
        <div class="distEvent">L-EQ</div>
        <div class="kmEvent">&nbsp;</div>
      </div>
    </div>
  </div>
</a>
`

describe('parseEventsList', () => {
  it('parses a single event with races', () => {
    const events = parseEventsList(LISTING_HTML_FIXTURE, 2026)
    expect(events).toHaveLength(1)

    const event = events[0]
    expect(event.fftriId).toBe('3452')
    expect(event.name).toBe('Triathlon du Dauphiné (26)')
    expect(event.city).toBe("ST DONAT SUR L'HERBASSE")
    expect(event.postalCode).toBe('26260')
    expect(event.department).toBe('26')
    expect(event.detailUrl).toBe('https://fftri.t2area.com/calendrier/triathlon-du-dauphine.html')
    expect(event.dates).toHaveLength(1)
    expect(event.dates[0]).toEqual({ dayOfWeek: 'dim.', day: 3, month: 'mai' })
    expect(event.races).toHaveLength(2)
    expect(event.races[0]).toEqual({
      sportType: 'X-DUA',
      format: 'JEUNES-1',
      category: 'youth',
      raceUrl: 'https://fftri.t2area.com/calendrier/triathlon-du-dauphine/cross-duathlon-jeunes-1.html',
    })
    expect(event.races[1]).toEqual({
      sportType: 'TRI',
      format: 'XS-OP',
      category: 'national',
      raceUrl: 'https://fftri.t2area.com/calendrier/triathlon-du-dauphine/triathlon-xs-open.html',
    })
  })

  it('parses multi-day events', () => {
    const events = parseEventsList(MULTI_DAY_FIXTURE, 2026)
    expect(events).toHaveLength(1)
    expect(events[0].name).toBe("L'Xttraid Grand Sancy (63)")
    expect(events[0].races[0].sportType).toBe('RAID')
  })

  it('deduplicates events with the same fftriId (multi-day appear multiple times)', () => {
    // Same event appearing on two different days in the listing
    const html = MULTI_DAY_FIXTURE + MULTI_DAY_FIXTURE.replace('ven.', 'sam.').replace('>8<', '>9<')
    const events = parseEventsList(html, 2026)
    expect(events).toHaveLength(1)
    expect(events[0].dates).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns="fftri/__tests__/parser" --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write the parser module**

```typescript
// apps/agents/src/fftri/parser.ts

import * as cheerio from 'cheerio'
import { FFTRIEvent, FFTRIEventDate, FFTRIRace, FFTRIEventDetails } from './types'

/**
 * Parse the FFTRI listing HTML and extract events.
 * Deduplicates events that appear multiple times (multi-day events).
 *
 * @param html - Raw HTML from the listing page or infinite scroll fragment
 * @param referenceYear - Year to assign to dates (the listing doesn't include the year)
 */
export function parseEventsList(html: string, referenceYear: number): FFTRIEvent[] {
  const $ = cheerio.load(html)
  const eventsMap = new Map<string, FFTRIEvent>()

  $('a.blocEvent').each((_, element) => {
    try {
      const $el = $(element)

      // Extract FFTRI ID from id attribute (blocEvent_XXXX)
      const idAttr = $el.attr('id') || ''
      const fftriIdMatch = idAttr.match(/blocEvent_(\d+)/)
      if (!fftriIdMatch) return
      const fftriId = fftriIdMatch[1]

      // Extract date
      const dayOfWeek = $el.find('.jourLibEvent').first().text().trim()
      const day = parseInt($el.find('.jourEvent').first().text().trim(), 10)
      const month = $el.find('.moisEvent').first().text().trim()
      if (!day || !month) return

      const eventDate: FFTRIEventDate = { dayOfWeek, day, month }

      // If this event already exists (multi-day), just add the date
      if (eventsMap.has(fftriId)) {
        const existing = eventsMap.get(fftriId)!
        const dateExists = existing.dates.some(d => d.day === day && d.month === month)
        if (!dateExists) {
          existing.dates.push(eventDate)
        }
        // Also merge any new races
        const newRaces = parseRaces($el)
        for (const race of newRaces) {
          const raceExists = existing.races.some(r =>
            r.sportType === race.sportType && r.format === race.format && r.raceUrl === race.raceUrl
          )
          if (!raceExists) {
            existing.races.push(race)
          }
        }
        return
      }

      // Extract name
      const name = $el.find('.nomEvent').text().trim()
      if (!name) return

      // Extract location (postal code + city)
      const lieuText = $el.find('.lieuEvent span').last().text().trim().replace(/\u00a0/g, '').trim()
      const locationMatch = lieuText.match(/^(\d{5})\s+(.+)$/)
      const postalCode = locationMatch ? locationMatch[1] : ''
      const city = locationMatch ? locationMatch[2] : lieuText

      // Derive department from postal code (first 2 digits, or first 3 for DOM-TOM)
      const department = deriveDepartment(postalCode)

      // Extract detail URL
      const detailUrl = $el.attr('href') || ''

      // Extract races
      const races = parseRaces($el)

      eventsMap.set(fftriId, {
        fftriId,
        name,
        dates: [eventDate],
        city,
        postalCode,
        department,
        ligue: '',  // Will be set by the scraper based on the query param used
        detailUrl,
        races,
      })
    } catch (err) {
      // Skip malformed entries
    }
  })

  return Array.from(eventsMap.values())
}

/**
 * Parse races (épreuves) from a blocEvent element.
 */
function parseRaces($el: cheerio.Cheerio<cheerio.Element>): FFTRIRace[] {
  const races: FFTRIRace[] = []
  const $ = cheerio.load($el.html() || '')

  $('.distBlocEvent').each((_, raceEl) => {
    const $race = $(raceEl)
    const sportType = $race.find('.sportEvent').text().trim()
    const format = $race.find('.distEvent').text().trim()

    if (!sportType || !format) return

    // Extract category from CSS class
    let category = 'national'
    const classes = $race.attr('class') || ''
    if (classes.includes('youth')) category = 'youth'
    else if (classes.includes('challenge')) category = 'challenge'

    // Extract race URL from onclick
    const onclick = $race.attr('onclick') || ''
    const urlMatch = onclick.match(/window\.location\.href='([^']+)'/)
    const raceUrl = urlMatch ? urlMatch[1] : ''

    races.push({ sportType, format, category, raceUrl })
  })

  return races
}

/**
 * Derive department code from French postal code.
 * - Metropolitan: first 2 digits (e.g. 26260 → "26")
 * - Corsica: "2A" or "2B" from 20000-20999 range
 * - DOM-TOM: first 3 digits (e.g. 97100 → "971")
 */
function deriveDepartment(postalCode: string): string {
  if (!postalCode || postalCode.length < 2) return ''

  const prefix2 = postalCode.substring(0, 2)

  // DOM-TOM (97x, 98x)
  if (prefix2 === '97' || prefix2 === '98') {
    return postalCode.substring(0, 3)
  }

  // Corsica
  if (prefix2 === '20') {
    const code = parseInt(postalCode, 10)
    return code >= 20200 ? '2B' : '2A'
  }

  return prefix2
}

/**
 * Parse the event detail page to extract organizer info and GPS coordinates.
 */
export function parseEventDetails(html: string, event: FFTRIEvent): FFTRIEventDetails {
  const $ = cheerio.load(html)

  // Parse JSON-LD schema.org data
  let organizerName: string | undefined
  let organizerWebsite: string | undefined
  let latitude: number | undefined
  let longitude: number | undefined

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}')
      if (json['@type'] === 'SportsEvent' || json['@type'] === 'Event') {
        // Organizer
        if (json.organizer) {
          const org = Array.isArray(json.organizer) ? json.organizer[0] : json.organizer
          organizerName = org.name
          organizerWebsite = org.url
        }

        // Location GPS
        if (json.location?.geo) {
          latitude = parseFloat(json.location.geo.latitude)
          longitude = parseFloat(json.location.geo.longitude)
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  })

  // Fallback: parse organizer from HTML if not found in JSON-LD
  if (!organizerName) {
    // Look for organizer section in the page
    const orgText = $('.organisateur, .organizer, [class*="orga"]').first().text().trim()
    if (orgText) organizerName = orgText
  }

  // Calculate start/end dates from event.dates
  const { startDate, endDate } = calculateDateRange(event.dates, new Date().getFullYear())

  return {
    event,
    startDate,
    endDate,
    organizerName,
    organizerWebsite,
    latitude,
    longitude,
  }
}

/**
 * Calculate start and end dates from an array of FFTRIEventDate.
 */
function calculateDateRange(dates: FFTRIEventDate[], referenceYear: number): { startDate: Date; endDate: Date } {
  const MONTH_MAP: Record<string, number> = {
    'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3,
    'mai': 4, 'juin': 5, 'juillet': 6, 'août': 7,
    'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11,
    // Abbreviated forms from listing
    'janv.': 0, 'févr.': 1, 'mars.': 2, 'avr.': 3,
    'mai.': 4, 'juin.': 5, 'juil.': 6, 'août.': 7,
    'sept.': 8, 'oct.': 9, 'nov.': 10, 'déc.': 11,
    // Even shorter forms observed on the site
    'jan': 0, 'fev': 1, 'mar': 2, 'avr': 3,
    'jui': 5, 'jul': 6, 'aou': 7,
    'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
  }

  const parsedDates = dates
    .map(d => {
      const monthIndex = MONTH_MAP[d.month.toLowerCase()] ?? MONTH_MAP[d.month.toLowerCase().replace('.', '')]
      if (monthIndex === undefined) return null
      return new Date(referenceYear, monthIndex, d.day)
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())

  if (parsedDates.length === 0) {
    const now = new Date()
    return { startDate: now, endDate: now }
  }

  return {
    startDate: parsedDates[0],
    endDate: parsedDates[parsedDates.length - 1],
  }
}

export { deriveDepartment, calculateDateRange }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --testPathPatterns="fftri/__tests__/parser" --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/agents/src/fftri/parser.ts apps/agents/src/fftri/__tests__/parser.test.ts
git commit -m "feat(agents): add FFTRI listing and detail HTML parser"
```

---

### Task 4: HTTP Scraper (`fftri/scraper.ts`)

**Files:**
- Create: `apps/agents/src/fftri/scraper.ts`

No unit tests for the HTTP scraper (integration-level, requires network). Tested manually and via the agent run.

- [ ] **Step 1: Write the scraper module**

```typescript
// apps/agents/src/fftri/scraper.ts

import axios, { AxiosError } from 'axios'
import { FFTRIEvent, FFTRIEventDetails, FFTRI_LIGUE_FILTER_KEYS, FFTRI_MONTH_FILTER_KEYS } from './types'
import { parseEventsList, parseEventDetails } from './parser'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE_URL = 'https://fftri.t2area.com/calendrier.html'
const PAGE_SIZE = 10

/**
 * Build the listing URL with filters for a specific ligue and month.
 */
export function buildListingURL(ligueCode: string, month: number, limitstart: number = 0): string {
  const ligueEntry = FFTRI_LIGUE_FILTER_KEYS.find(l => l.code === ligueCode)
  const monthEntry = FFTRI_MONTH_FILTER_KEYS.find(m => m.month === month)

  if (!ligueEntry || !monthEntry) {
    throw new Error(`Invalid ligue code "${ligueCode}" or month ${month}`)
  }

  const params = new URLSearchParams()
  params.set(`filter[${ligueEntry.filterKey}]`, 'on')
  params.set(`filter[${monthEntry.filterKey}]`, 'on')

  if (limitstart > 0) {
    params.set('layout', 'new')
    params.set('limitstart', limitstart.toString())
  }

  return `${BASE_URL}?${params.toString()}`
}

/**
 * Fetch a single page of the listing.
 * Returns the parsed events and whether there might be more results.
 */
export async function fetchListingPage(
  ligueCode: string,
  month: number,
  limitstart: number = 0,
  referenceYear: number
): Promise<{ events: FFTRIEvent[], hasMore: boolean }> {
  const url = buildListingURL(ligueCode, month, limitstart)

  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
    timeout: 60000,
  })

  const events = parseEventsList(response.data, referenceYear)

  // If we got a full page of results, there might be more
  // The FFTRI site returns 10 events per page
  return {
    events,
    hasMore: events.length >= PAGE_SIZE,
  }
}

/**
 * Fetch all events for a given ligue and month, handling pagination.
 */
export async function fetchAllEventsForLigueMonth(
  ligueCode: string,
  month: number,
  referenceYear: number,
  humanDelayMs: number = 2000,
  maxPages: number = 50
): Promise<FFTRIEvent[]> {
  const allEventsMap = new Map<string, FFTRIEvent>()
  let limitstart = 0
  let hasMore = true
  let pageCount = 0

  while (hasMore && pageCount < maxPages) {
    if (pageCount > 0) {
      await humanDelay(humanDelayMs)
    }

    const { events, hasMore: moreAvailable } = await fetchListingPage(
      ligueCode, month, limitstart, referenceYear
    )

    // Merge events (dedup by fftriId, merge dates for multi-day events)
    for (const event of events) {
      if (allEventsMap.has(event.fftriId)) {
        const existing = allEventsMap.get(event.fftriId)!
        for (const date of event.dates) {
          const dateExists = existing.dates.some(d => d.day === date.day && d.month === date.month)
          if (!dateExists) existing.dates.push(date)
        }
        for (const race of event.races) {
          const raceExists = existing.races.some(r =>
            r.sportType === race.sportType && r.format === race.format && r.raceUrl === race.raceUrl
          )
          if (!raceExists) existing.races.push(race)
        }
      } else {
        event.ligue = ligueCode
        allEventsMap.set(event.fftriId, event)
      }
    }

    hasMore = moreAvailable
    limitstart += PAGE_SIZE
    pageCount++

    console.log(`[FFTRI Scraper] Page ${pageCount}: ${events.length} events (total unique: ${allEventsMap.size})`)
  }

  return Array.from(allEventsMap.values())
}

/**
 * Fetch event detail page to extract organizer info and GPS coordinates.
 */
export async function fetchEventDetails(
  event: FFTRIEvent
): Promise<FFTRIEventDetails | null> {
  try {
    await humanDelay(2000)

    const response = await axios.get(event.detailUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': BASE_URL,
      },
      timeout: 60000,
    })

    return parseEventDetails(response.data, event)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.warn(`[FFTRI Scraper] Failed to fetch details for ${event.name}: ${(error as AxiosError).message}`)
    }
    return null
  }
}

/**
 * Simulate human delay between requests with ±20% variation.
 */
export async function humanDelay(ms: number): Promise<void> {
  const variation = ms * 0.2
  const actualDelay = ms + (Math.random() * variation * 2 - variation)
  return new Promise(resolve => setTimeout(resolve, actualDelay))
}

/**
 * Generate list of months to scrape in the future window.
 * Returns array of month numbers (1-12) with their year.
 */
export function generateMonthsToScrape(windowMonths: number): Array<{ year: number, month: number }> {
  const months: Array<{ year: number, month: number }> = []
  const now = new Date()

  for (let i = 0; i < windowMonths; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push({ year: date.getFullYear(), month: date.getMonth() + 1 })
  }

  return months
}

/**
 * Format a month target as "YYYY-MM" string for progress tracking.
 */
export function formatMonthKey(target: { year: number, month: number }): string {
  return `${target.year}-${String(target.month).padStart(2, '0')}`
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agents/src/fftri/scraper.ts
git commit -m "feat(agents): add FFTRI HTTP scraper with pagination"
```

---

### Task 5: Matcher Adapter (`fftri/matcher.ts`) and Deduplication (`fftri/deduplication.ts`)

**Files:**
- Create: `apps/agents/src/fftri/matcher.ts`
- Create: `apps/agents/src/fftri/deduplication.ts`

- [ ] **Step 1: Write the matcher adapter**

```typescript
// apps/agents/src/fftri/matcher.ts

import { FFTRIEventDetails, FFTRIMatchResult, FFTRIScraperConfig } from './types'
import {
  matchEvent,
  calculateAdjustedConfidence as calculateAdjustedConfidenceGeneric,
  calculateNewEventConfidence as calculateNewEventConfidenceGeneric,
  EventMatchInput,
  EventMatchResult,
  MatchingLogger,
  MeilisearchMatchingConfig,
  LLMMatchingService,
  LLMMatchingConfig
} from '@data-agents/agent-framework'

function adaptLogger(logger: any): MatchingLogger {
  return {
    info: (msg, data) => logger.info(msg, data),
    debug: (msg, data) => logger.debug?.(msg, data) || logger.info(msg, data),
    warn: (msg, data) => logger.warn?.(msg, data) || logger.info(msg, data),
    error: (msg, data) => logger.error(msg, data)
  }
}

function fftriToMatchInput(eventDetails: FFTRIEventDetails): EventMatchInput {
  return {
    eventName: eventDetails.event.name,
    eventCity: eventDetails.event.city,
    eventDepartment: eventDetails.event.department,
    editionDate: eventDetails.startDate,
    editionYear: eventDetails.startDate.getFullYear(),
    organizerName: eventDetails.organizerName,
  }
}

function matchResultToFFTRI(result: EventMatchResult): FFTRIMatchResult {
  return {
    type: result.type,
    event: result.event ? {
      id: String(result.event.id),
      name: result.event.name,
      city: result.event.city,
      similarity: result.event.similarity
    } : undefined,
    edition: result.edition ? {
      id: String(result.edition.id),
      year: result.edition.year,
      startDate: result.edition.startDate ?? null
    } : undefined,
    confidence: result.confidence,
    rejectedMatches: result.rejectedMatches?.map(rm => ({
      eventId: typeof rm.eventId === 'number' ? rm.eventId : parseInt(String(rm.eventId), 10),
      eventName: rm.eventName,
      eventSlug: rm.eventSlug || '',
      eventCity: rm.eventCity,
      eventDepartment: rm.eventDepartment || '',
      editionId: rm.editionId ? (typeof rm.editionId === 'number' ? rm.editionId : parseInt(String(rm.editionId), 10)) : undefined,
      editionYear: rm.editionYear,
      matchScore: rm.matchScore,
      nameScore: rm.nameScore,
      cityScore: rm.cityScore,
      departmentMatch: rm.departmentMatch,
      dateProximity: rm.dateProximity
    })),
    llmNewEventConfidence: result.llmNewEventConfidence,
    llmReason: result.llmReason,
    llmCleanedEventName: result.llmCleanedEventName,
  }
}

function fftriToEventMatchResult(matchResult: FFTRIMatchResult): EventMatchResult {
  return {
    type: matchResult.type,
    confidence: matchResult.confidence,
    event: matchResult.event ? {
      id: matchResult.event.id,
      name: matchResult.event.name,
      city: matchResult.event.city,
      similarity: matchResult.event.similarity
    } : undefined,
    edition: matchResult.edition ? {
      id: matchResult.edition.id,
      year: matchResult.edition.year,
      startDate: matchResult.edition.startDate ?? undefined
    } : undefined
  }
}

/**
 * Match a FFTRI event with an existing Miles Republic event.
 * Uses the shared matching service from agent-framework.
 */
export async function matchFFTRIEvent(
  eventDetails: FFTRIEventDetails,
  sourceDb: any,
  config: FFTRIScraperConfig,
  logger: any,
  meilisearchConfig?: MeilisearchMatchingConfig,
  llmConfig?: LLMMatchingConfig
): Promise<FFTRIMatchResult> {
  const input = fftriToMatchInput(eventDetails)
  const adaptedLogger = adaptLogger(logger)

  const resolvedLlmConfig: LLMMatchingConfig | undefined = llmConfig ?? (process.env.LLM_MATCHING_API_KEY ? {
    apiKey: process.env.LLM_MATCHING_API_KEY,
    model: process.env.LLM_MATCHING_MODEL,
    enabled: process.env.LLM_MATCHING_ENABLED !== 'false',
    shadowMode: process.env.LLM_MATCHING_SHADOW_MODE === 'true',
  } : undefined)

  const llmService = resolvedLlmConfig ? new LLMMatchingService(resolvedLlmConfig, adaptedLogger) : undefined

  const result = await matchEvent(
    input,
    sourceDb,
    {
      similarityThreshold: config.similarityThreshold,
      distanceTolerancePercent: config.distanceTolerancePercent,
      confidenceBase: config.confidenceBase,
      meilisearch: meilisearchConfig,
      llm: resolvedLlmConfig,
      llmService,
    },
    adaptedLogger
  )

  return matchResultToFFTRI(result)
}

/**
 * Calculate adjusted confidence for EDITION_UPDATE and RACE_UPDATE proposals.
 */
export function calculateAdjustedConfidence(
  baseConfidence: number,
  eventDetails: FFTRIEventDetails,
  matchResult: FFTRIMatchResult
): number {
  const hasOrganizerInfo = !!eventDetails.organizerWebsite
  const raceCount = eventDetails.event.races.length
  const eventMatchResult = fftriToEventMatchResult(matchResult)
  return calculateAdjustedConfidenceGeneric(baseConfidence, eventMatchResult, hasOrganizerInfo, raceCount)
}

/**
 * Calculate confidence for NEW_EVENT proposals.
 */
export function calculateNewEventConfidence(
  baseConfidence: number,
  eventDetails: FFTRIEventDetails,
  matchResult: FFTRIMatchResult
): number {
  const hasOrganizerInfo = !!eventDetails.organizerWebsite
  const raceCount = eventDetails.event.races.length
  const eventMatchResult = fftriToEventMatchResult(matchResult)
  // FFTRI events don't have a "level" field, pass undefined
  return calculateNewEventConfidenceGeneric(baseConfidence, eventMatchResult, hasOrganizerInfo, raceCount, undefined)
}
```

- [ ] **Step 2: Write the deduplication re-export**

```typescript
// apps/agents/src/fftri/deduplication.ts

/**
 * FFTRI deduplication — identical logic to FFA.
 * Re-export from the FFA module to avoid duplication.
 */
export { hasIdenticalPendingProposal, filterNewChanges } from '../ffa/deduplication'
```

- [ ] **Step 3: Commit**

```bash
git add apps/agents/src/fftri/matcher.ts apps/agents/src/fftri/deduplication.ts
git commit -m "feat(agents): add FFTRI matcher adapter and deduplication"
```

---

### Task 6: Agent Registration (types, registry, index)

**Files:**
- Modify: `packages/types/src/agent-versions.ts`
- Create: `packages/types/src/agent-config-schemas/fftri-scraper.ts`
- Modify: `packages/types/src/agent-config-schemas/index.ts`
- Create: `apps/agents/src/registry/fftri-scraper.ts`
- Modify: `apps/agents/src/index.ts`

- [ ] **Step 1: Add FFTRI_SCRAPER to agent-versions.ts**

Add to `AGENT_VERSIONS`:
```typescript
FFTRI_SCRAPER_AGENT: '1.0.0'
```

Add `'FFTRI_SCRAPER'` to the `AgentTypeKey` union type.

Add to `AGENT_NAMES`:
```typescript
FFTRI_SCRAPER: 'FFTRI Scraper Agent',
```

- [ ] **Step 2: Create the config schema**

```typescript
// packages/types/src/agent-config-schemas/fftri-scraper.ts
import { ConfigSchema } from '../config.js'

export const FFTRIScraperAgentConfigSchema: ConfigSchema = {
  title: "Configuration FFTRI Scraper Agent",
  description: "Agent qui scrape le calendrier FFTRI pour extraire les événements de triathlon/multisport",
  categories: [
    { id: "database", label: "Base de données", description: "Configuration de la source de données" },
    { id: "scraping", label: "Scraping", description: "Paramètres de scraping du calendrier FFTRI" },
    { id: "matching", label: "Matching", description: "Configuration du matching avec Miles Republic" },
    { id: "advanced", label: "Avancé", description: "Options avancées" },
  ],
  fields: [
    {
      name: "sourceDatabase",
      label: "Base de données source",
      type: "select",
      category: "database",
      required: true,
      description: "Base de données Miles Republic",
      helpText: "Base de données contenant les événements existants pour le matching",
      options: [],
      validation: { required: true }
    },
    {
      name: "liguesPerRun",
      label: "Ligues par exécution",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 2,
      description: "Nombre de ligues à traiter par run",
      validation: { required: true, min: 1, max: 18 }
    },
    {
      name: "monthsPerRun",
      label: "Mois par exécution",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 1,
      description: "Nombre de mois à traiter par run",
      validation: { required: true, min: 1, max: 12 }
    },
    {
      name: "scrapingWindowMonths",
      label: "Fenêtre de scraping (mois)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 6,
      description: "Fenêtre temporelle à scraper (mois dans le futur)",
      validation: { required: true, min: 1, max: 24 }
    },
    {
      name: "rescanDelayDays",
      label: "Délai de rescan (jours)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 30,
      description: "Délai avant de rescanner la même période",
      validation: { required: true, min: 1, max: 365 }
    },
    {
      name: "humanDelayMs",
      label: "Délai entre requêtes (ms)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 2000,
      description: "Délai entre chaque requête HTTP",
      validation: { required: true, min: 500, max: 10000 }
    },
    {
      name: "similarityThreshold",
      label: "Seuil de similarité",
      type: "slider",
      category: "matching",
      required: true,
      defaultValue: 0.75,
      description: "Seuil minimum de similarité pour matcher un événement",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "distanceTolerancePercent",
      label: "Tolérance distance",
      type: "slider",
      category: "matching",
      required: true,
      defaultValue: 0.1,
      description: "Tolérance pour matcher les distances de courses",
      validation: { min: 0, max: 0.5, step: 0.05 }
    },
    {
      name: "confidenceBase",
      label: "Confiance de base",
      type: "slider",
      category: "advanced",
      required: true,
      defaultValue: 0.9,
      description: "Confiance de base pour les données FFTRI",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "maxEventsPerMonth",
      label: "Événements max par mois/ligue",
      type: "number",
      category: "advanced",
      required: false,
      defaultValue: 200,
      description: "Limite le nombre d'événements à traiter",
      validation: { min: 10, max: 1000 }
    },
  ]
}
```

- [ ] **Step 3: Update the config schemas index.ts**

Add the import and export for `FFTRIScraperAgentConfigSchema`, and add it to `AGENT_CONFIG_SCHEMAS` map with key `FFTRI_SCRAPER`.

- [ ] **Step 4: Create the registry entry**

```typescript
// apps/agents/src/registry/fftri-scraper.ts
import { FFTRIScraperAgent } from '../FFTRIScraperAgent'
import { FFTRIScraperAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

const DEFAULT_CONFIG = {
  name: getAgentName('FFTRI_SCRAPER'),
  description: 'Scrape automatique du calendrier FFTRI pour extraire les événements de triathlon/multisport',
  type: 'EXTRACTOR' as const,
  frequency: '0 */12 * * *',
  isActive: true,
  config: {
    agentType: 'FFTRI_SCRAPER',
    sourceDatabase: null,
    liguesPerRun: 2,
    monthsPerRun: 1,
    scrapingWindowMonths: 6,
    rescanDelayDays: 30,
    humanDelayMs: 2000,
    similarityThreshold: 0.75,
    distanceTolerancePercent: 0.1,
    confidenceBase: 0.9,
    maxEventsPerMonth: 200,
    configSchema: FFTRIScraperAgentConfigSchema
  }
}

agentRegistry.register('FFTRI_SCRAPER', FFTRIScraperAgent)

console.log('✅ FFTRI Scraper Agent enregistré dans le registry pour FFTRI_SCRAPER')

export { FFTRIScraperAgent, DEFAULT_CONFIG }
export default FFTRIScraperAgent
```

- [ ] **Step 5: Update apps/agents/src/index.ts**

Add import for `FFTRIScraperAgent` and `FFTRI_SCRAPER_AGENT_VERSION`, register it, and export it. Follow the exact pattern of the other agents in the file.

- [ ] **Step 6: Build packages/types to verify**

Run: `npm run build --workspace=packages/types`
Expected: BUILD SUCCESS

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/agent-versions.ts packages/types/src/agent-config-schemas/fftri-scraper.ts packages/types/src/agent-config-schemas/index.ts apps/agents/src/registry/fftri-scraper.ts apps/agents/src/index.ts
git commit -m "feat(agents): register FFTRI_SCRAPER agent in types and registry"
```

---

### Task 7: Main Agent (`FFTRIScraperAgent.ts`)

**Files:**
- Create: `apps/agents/src/FFTRIScraperAgent.ts`

This is the orchestration agent. It follows the same structure as `FFAScraperAgent.ts` but is significantly simpler because:
- No `inferRaceCategories()` (we use `mapFFTRISportToCategory()` from types.ts)
- No complex race matching by distance (we match by categoryLevel2 + format)
- No `parseCompetitionDetails` with LLM extraction (we use simple JSON-LD parsing)
- Distances come from the reference table, not from scraping

- [ ] **Step 1: Write the FFTRIScraperAgent**

The agent must implement:
1. `constructor()` — same pattern as FFA
2. `loadProgress()` / `saveProgress()` — state management via AgentStateService
3. `getNextTargets()` — ligue/month rotation (same logic as FFA, adapted for FFTRI_LIGUES)
4. `scrapeLigueMonth()` — call `fetchAllEventsForLigueMonth()` + `fetchEventDetails()` for each event
5. `toProposalInput()` — convert FFTRIEventDetails to ProposalInput, using `getStandardDistances()` and `mapFFTRISportToCategory()`
6. `createProposalsForCompetition()` — matching + proposal creation (same flow as FFA)
7. `run()` — main orchestration loop

Key differences from FFA:
- `source: 'fftri'` instead of `'ffa'`
- Uses `mapFFTRISportToCategory()` instead of `inferRaceCategories()`
- Uses `getStandardDistances()` to populate swim/bike/run distances
- Race matching uses categoryLevel2 comparison instead of distance-based matching
- Clean event name: strip the "(XX)" department suffix from FFTRI event names
- `getTimezoneIANA()` uses same logic as FFA (DOM-TOM specific, else Europe/Paris)

This file will be ~500-600 lines (vs 1400 for FFA) because the FFTRI-specific logic is much simpler.

**Important:** This step involves writing the full agent file. The implementing agent should base it closely on `FFAScraperAgent.ts` but use the FFTRI types, scraper, parser, matcher, and distances modules. The key methods to adapt:

- `toProposalInput()`: Use `mapFFTRISportToCategory()` for each race, `getStandardDistances()` for distances
- `compareFFTRIWithEdition()`: Simplified race matching — compare by categoryLevel2 and format size
- `scrapeLigueMonth()`: Call `fetchAllEventsForLigueMonth()` then `fetchEventDetails()` per unique event
- `createProposalsForCompetition()`: Same flow as FFA, adapted for FFTRI types
- `run()`: Same orchestration loop

- [ ] **Step 2: Build to verify**

Run: `npm run build --workspace=apps/agents`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add apps/agents/src/FFTRIScraperAgent.ts
git commit -m "feat(agents): add FFTRI Scraper Agent orchestration"
```

---

### Task 8: Full Build & Type Check

**Files:** None (verification only)

- [ ] **Step 1: Run type checking**

Run: `npm run tsc`
Expected: PASS with no errors

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: BUILD SUCCESS (Turbo handles dependency order)

- [ ] **Step 3: Run all FFTRI tests**

Run: `npx jest --testPathPatterns="fftri" --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(agents): resolve build issues for FFTRI scraper"
```

---

### Task 9: Manual Integration Test

**Files:** None (manual verification)

- [ ] **Step 1: Test the scraper against live FFTRI site**

Write a quick script or use the agent's test mode to scrape one ligue/one month and verify:
1. Listing pagination works (gets all events, not just first 10)
2. Event deduplication works (multi-day events appear once)
3. Detail page parsing extracts organizer + GPS
4. Category mapping produces valid Miles Republic categories
5. Distance table returns correct values

Run: `npx ts-node -e "..." ` (or via agent dashboard)

- [ ] **Step 2: Verify matching against a known event**

Pick a triathlon event that exists in Miles Republic and verify:
1. Meilisearch finds it as a candidate
2. LLM correctly matches it
3. Confidence score is reasonable (0.9 for exact match)

- [ ] **Step 3: Final commit with any fixes**

```bash
git add -A
git commit -m "fix(agents): integration fixes for FFTRI scraper"
```
