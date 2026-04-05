/**
 * Types et interfaces pour l'agent FFTRI Scraper
 *
 * Ce fichier définit toutes les structures de données utilisées pour :
 * - Configuration de l'agent
 * - Extraction des données FFTRI
 * - Matching avec la base Miles Republic
 * - Suivi de la progression du scraping
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration de l'agent FFTRI Scraper
 */
export interface FFTRIScraperConfig {
  /** ID de la base de données Miles Republic */
  sourceDatabase: string

  /** Nombre de ligues à traiter par exécution (défaut: 2) */
  liguesPerRun: number

  /** Nombre de mois à traiter par exécution (défaut: 1) */
  monthsPerRun: number

  /** Fenêtre de scraping en mois dans le futur (défaut: 6) */
  scrapingWindowMonths: number

  /** Délai en jours avant de rescanner la même période (défaut: 30) */
  rescanDelayDays: number

  /** Délai en millisecondes entre les requêtes HTTP (défaut: 2000) */
  humanDelayMs: number

  /** Seuil de similarité pour le matching nom d'événement (défaut: 0.75) */
  similarityThreshold: number

  /** Tolérance en pourcentage pour matcher les distances de courses (défaut: 0.1 = 10%) */
  distanceTolerancePercent: number

  /** Confiance de base pour les données FFTRI (défaut: 0.9) */
  confidenceBase: number

  /** Limite d'événements par mois (sécurité) */
  maxEventsPerMonth?: number
}

// ============================================================================
// DONNÉES FFTRI EXTRAITES
// ============================================================================

/**
 * Date partielle d'un événement FFTRI (depuis le listing)
 */
export interface FFTRIEventDate {
  /** Jour de la semaine (ex: "Dim") */
  dayOfWeek: string

  /** Jour du mois (ex: "15") */
  day: string

  /** Mois (ex: "Juin") */
  month: string
}

/**
 * Épreuve FFTRI extraite du listing
 */
export interface FFTRIRace {
  /** Type de sport (ex: "TRI", "DUA", "AQUA", "S&R") */
  sportType: string

  /** Format de distance (ex: "S", "M", "XL", "JEUNES-1") */
  format: string

  /** Catégorie (ex: "national", "youth", "challenge") */
  category: string

  /** URL de la page individuelle de l'épreuve */
  raceUrl?: string
}

/**
 * Événement FFTRI extrait du listing
 */
export interface FFTRIEvent {
  /** Identifiant unique FFTRI (ex: "12345") */
  fftriId: string

  /** Nom de l'événement */
  name: string

  /** Date(s) de l'événement */
  dates: FFTRIEventDate[]

  /** Ville */
  city: string

  /** Code postal */
  postalCode?: string

  /** Département (ex: "026") */
  department?: string

  /** Ligue / Région (ex: "ARA", "BFC") */
  ligue: string

  /** URL de la fiche descriptive complète */
  detailUrl: string

  /** Épreuves proposées */
  races: FFTRIRace[]
}

/**
 * Détails complets d'un événement FFTRI
 */
export interface FFTRIEventDetails {
  /** Informations de base de l'événement */
  event: FFTRIEvent

  /** Date de début */
  startDate: Date

  /** Date de fin */
  endDate: Date

  /** Nom de l'organisateur */
  organizerName?: string

  /** Site web de l'organisateur */
  organizerWebsite?: string

  /** Latitude GPS */
  latitude?: number

  /** Longitude GPS */
  longitude?: number
}

// ============================================================================
// MATCHING
// ============================================================================

/**
 * Résultat du matching avec Miles Republic
 * Même shape que MatchResult du FFA Scraper
 */
export interface FFTRIMatchResult {
  /** Type de match trouvé */
  type: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'NO_MATCH'

  /** Événement matché (si trouvé) */
  event?: {
    id: string
    name: string
    city: string
    similarity: number
  }

  /** Édition matchée (si trouvée) */
  edition?: {
    id: string
    year: string
    startDate: Date | null
  }

  /** Courses matchées (si trouvées) */
  races?: Array<{
    id: string
    name: string
    distance: number
    similarity: number
  }>

  /** Confiance globale du match */
  confidence: number

  /** Top 3 matches rejetés (pour propositions NEW_EVENT) */
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

  /** LLM confidence that this is a NEW event (only when type=NO_MATCH and LLM was used) */
  llmNewEventConfidence?: number

  /** LLM reason for the judgment */
  llmReason?: string

  /** LLM-cleaned event name (edition-agnostic) */
  llmCleanedEventName?: string
}

// ============================================================================
// PROGRESSION DU SCRAPING
// ============================================================================

/**
 * État de progression du scraping FFTRI
 * Permet de reprendre le scraping là où il s'est arrêté
 */
export interface FFTRIScrapingProgress {
  /** Ligue en cours de traitement */
  currentLigue: string

  /** Mois en cours de traitement (format: "YYYY-MM") */
  currentMonth: string

  /** Page en cours dans la pagination */
  currentPage: number

  /** Ligues complètement traitées */
  completedLigues: string[]

  /** Mois complétés par ligue */
  completedMonths: Record<string, string[]> // { "ARA": ["2025-11", "2025-12"] }

  /** Date de dernière complétion du cycle complet */
  lastCompletedAt?: Date

  /** Nombre total d'événements scrapés */
  totalEventsScraped: number
}

// ============================================================================
// CONSTANTES - LIGUES
// ============================================================================

/**
 * Liste des ligues FFTRI (18 régions)
 * Codes utilisés en interne pour identifier les ligues
 */
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
  'PF',  // Fédération Tahitienne (Polynésie française)
] as const

/**
 * Type union pour les ligues FFTRI
 */
export type FFTRILigue = typeof FFTRI_LIGUES[number]

/**
 * Mapping des ligues FFTRI vers les clés de filtre de l'URL
 * et les noms complets
 */
export const FFTRI_LIGUE_FILTER_KEYS: Array<{
  code: string
  filterKey: string
  name: string
}> = [
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

/**
 * Mapping des mois vers les clés de filtre de l'URL
 */
export const FFTRI_MONTH_FILTER_KEYS: Array<{
  month: number
  filterKey: string
  name: string
}> = [
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
]

// ============================================================================
// CONSTANTES - MAPPING LIGUES → RÉGIONS
// ============================================================================

/**
 * Mapping des codes FFTRI vers les codes régions françaises
 * et informations d'affichage
 */
export const FFTRI_LIGUE_TO_REGION: Record<string, { code: string; name: string; displayCode: string }> = {
  'ARA': { code: 'ARA', name: 'Auvergne-Rhône-Alpes', displayCode: 'ARA' },
  'BFC': { code: 'BFC', name: 'Bourgogne-Franche-Comté', displayCode: 'BFC' },
  'BRE': { code: 'BRE', name: 'Bretagne', displayCode: 'BRE' },
  'CVL': { code: 'CVL', name: 'Centre-Val de Loire', displayCode: 'CVL' },
  'COR': { code: 'COR', name: 'Corse', displayCode: 'COR' },
  'GES': { code: 'GES', name: 'Grand Est', displayCode: 'GES' },
  'GP':  { code: '971', name: 'Guadeloupe', displayCode: 'GP' },
  'HDF': { code: 'HDF', name: 'Hauts-de-France', displayCode: 'HDF' },
  'IDF': { code: 'IDF', name: 'Île-de-France', displayCode: 'IDF' },
  'MQ':  { code: '972', name: 'Martinique', displayCode: 'MQ' },
  'NOR': { code: 'NOR', name: 'Normandie', displayCode: 'NOR' },
  'NC':  { code: '988', name: 'Nouvelle-Calédonie', displayCode: 'NC' },
  'NAQ': { code: 'NAQ', name: 'Nouvelle-Aquitaine', displayCode: 'NAQ' },
  'OCC': { code: 'OCC', name: 'Occitanie', displayCode: 'OCC' },
  'PDL': { code: 'PDL', name: 'Pays de la Loire', displayCode: 'PDL' },
  'PAC': { code: 'PAC', name: "Provence-Alpes-Côte d'Azur", displayCode: 'PAC' },
  'RE':  { code: '974', name: 'La Réunion', displayCode: 'RE' },
  'PF':  { code: '987', name: 'Polynésie française', displayCode: 'PF' },
}

/**
 * Convertit un code FFTRI ligue en nom de région
 */
export function convertFFTRILigueToRegionName(fftriLigue: string): string {
  const result = FFTRI_LIGUE_TO_REGION[fftriLigue]?.name
  if (!result) {
    console.warn(`⚠️  Ligue FFTRI inconnue pour conversion en nom: "${fftriLigue}"`)
    return fftriLigue
  }
  return result
}

/**
 * Convertit un code FFTRI ligue en code d'affichage
 */
export function convertFFTRILigueToDisplayCode(fftriLigue: string): string {
  const result = FFTRI_LIGUE_TO_REGION[fftriLigue]?.displayCode
  if (!result) {
    console.warn(`⚠️  Ligue FFTRI inconnue pour conversion en display code: "${fftriLigue}"`)
    return fftriLigue
  }
  return result
}

// ============================================================================
// MAPPING CATÉGORIES FFTRI → MILES REPUBLIC
// ============================================================================

/**
 * Résultat du mapping de catégorie
 */
export interface FFTRICategoryMapping {
  categoryLevel1: string
  categoryLevel2: string
}

/**
 * Supprime les suffixes d'équipe/format avant le matching
 * -OP (open), -EQ (équipe), -CLM (contre-la-montre), -OPEN
 */
function stripFormatSuffixes(format: string): string {
  return format
    .replace(/-OP$/i, '')
    .replace(/-EQ$/i, '')
    .replace(/-CLM$/i, '')
    .replace(/-OPEN$/i, '')
}

/**
 * Mappe un type de sport et format FFTRI vers les catégories Miles Republic
 *
 * @param sportType - Type de sport FFTRI (ex: "TRI", "DUA", "AQUA", "CYCL")
 * @param format - Format de distance (ex: "S", "M", "JEUNES-1", "XXS-JEUNES")
 * @returns Mapping categoryLevel1/categoryLevel2 ou null si ignoré
 */
export function mapFFTRISportToCategory(
  sportType: string,
  format: string
): FFTRICategoryMapping | null {
  // CYCL (cyclathlon) : ignoré, pas de catégorie correspondante
  if (sportType === 'CYCL') {
    return null
  }

  // Détecter les épreuves JEUNES (format contient "JEUNES")
  // Exemples: "JEUNES-1", "JEUNES-2", "S-JEUNES", "XXS-JEUNES", "XS-JEUNES", "XXS-JEUNES-EQ"
  if (format.toUpperCase().includes('JEUNES')) {
    return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_KIDS' }
  }

  // Mapping selon le type de sport
  switch (sportType) {
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

    case 'TRI': {
      // Supprimer les suffixes avant de matcher le format
      const cleanFormat = stripFormatSuffixes(format).toUpperCase()

      switch (cleanFormat) {
        case 'XXS':
          return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_XS' }
        case 'XS':
          return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_XS' }
        case 'S':
          return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_S' }
        case 'M':
          return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_M' }
        case 'L':
          return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_L' }
        case 'XL':
          return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_XL' }
        case 'XXL':
          return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_XXL' }
        default:
          // Format inconnu : retourner TRIATHLON_M par défaut
          return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_M' }
      }
    }

    default:
      // Type de sport inconnu : retourner TRIATHLON générique
      return { categoryLevel1: 'TRIATHLON', categoryLevel2: 'TRIATHLON_M' }
  }
}
