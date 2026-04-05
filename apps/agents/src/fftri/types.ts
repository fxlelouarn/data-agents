/**
 * Types, config, ligues constants, and category mapping for the FFTRI scraper agent.
 */

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
// CONSTANTES - MAPPING RÉGIONS
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

// ============================================================================
// CONSTANTES - MAPPING CATÉGORIES
// ============================================================================

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

  // Extract the base format (before -OP, -EQ, -CLM, -OPEN suffixes)
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
        categoryLevel2: triMap[baseFormat] || 'TRIATHLON_S'
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
