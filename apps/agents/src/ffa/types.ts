/**
 * Types et interfaces pour l'agent FFA Scraper
 *
 * Ce fichier définit toutes les structures de données utilisées pour :
 * - Configuration de l'agent
 * - Extraction des données FFA
 * - Matching avec la base Miles Republic
 * - Suivi de la progression du scraping
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration de l'agent FFA Scraper
 */
export interface FFAScraperConfig {
  /** ID de la base de données Miles Republic */
  sourceDatabase: string

  /** Nombre de ligues à traiter par exécution (défaut: 2) */
  liguesPerRun: number

  /** Nombre de mois à traiter par exécution (défaut: 1) */
  monthsPerRun: number

  /** Niveaux de compétition à inclure */
  levels: string[] // ['Départemental', 'Régional', 'National', 'International']

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

  /** Confiance de base pour les données FFA (défaut: 0.9) */
  confidenceBase: number

  /** Limite de compétitions par mois/ligue (sécurité) (défaut: 500) */
  maxCompetitionsPerMonth?: number
}

// ============================================================================
// DONNÉES FFA EXTRAITES
// ============================================================================

/**
 * Compétition FFA extraite du listing
 */
export interface FFACompetition {
  /** Numéro de compétition FFA (identifiant unique) */
  ffaId: string

  /** Nom de la compétition */
  name: string

  /** Date de début */
  date: Date

  /** Ville */
  city: string

  /** Département (ex: "074", "026") */
  department: string

  /** Ligue / Région (ex: "ARA", "BFC") */
  ligue: string

  /** Niveau (Départemental, Régional, National, International) */
  level: string

  /** Type (Running, Trail, etc.) */
  type: string

  /** URL de la fiche descriptive complète */
  detailUrl: string

  /** URL de la page résultats (si disponible) */
  resultsUrl?: string | null
}

/**
 * Détails complets d'une compétition FFA
 */
export interface FFACompetitionDetails {
  /** Informations de base */
  competition: FFACompetition

  /** Date de début (égale à endDate pour événements 1 jour) */
  startDate: Date

  /** Date de fin (égale à startDate pour événements 1 jour) */
  endDate: Date

  /** Nom de l'organisateur */
  organizerName?: string

  /** Adresse de l'organisateur */
  organizerAddress?: string

  /** Email de l'organisateur */
  organizerEmail?: string

  /** Site web de l'organisateur */
  organizerWebsite?: string

  /** Téléphone de l'organisateur */
  organizerPhone?: string

  /** Date de clôture des inscriptions */
  registrationClosingDate?: Date

  /** Liste des courses/épreuves */
  races: FFARace[]

  /** Services disponibles (douches, vestiaires, etc.) */
  services?: string[]

  /** Informations additionnelles */
  additionalInfo?: string
}

/**
 * Course/Épreuve FFA extraite
 */
export interface FFARace {
  /** Nom de l'épreuve */
  name: string

  /** Date de la course (pour événements multi-jours, format: "17/01") */
  raceDate?: string

  /** Heure de départ (ex: "10:00") */
  startTime?: string

  /** Distance en mètres */
  distance?: number

  /** Dénivelé positif en mètres */
  positiveElevation?: number

  /** Catégories autorisées (ex: "CA->MA") */
  categories?: string

  /** Type de course */
  type: 'running' | 'trail' | 'walk' | 'other'
}

// ============================================================================
// MATCHING
// ============================================================================

/**
 * Résultat du matching avec Miles Republic
 */
export interface MatchResult {
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
}

// ============================================================================
// PROGRESSION DU SCRAPING
// ============================================================================

/**
 * État de progression du scraping
 * Permet de reprendre le scraping là où il s'est arrêté
 */
export interface ScrapingProgress {
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

  /** Nombre total de compétitions scrapées */
  totalCompetitionsScraped: number
}

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Liste des ligues FFA (régions françaises)
 */
export const FFA_LIGUES = [
  'ARA', // Auvergne-Rhône-Alpes
  'BFC', // Bourgogne-Franche-Comté
  'BRE', // Bretagne
  'CEN', // Centre-Val de Loire
  'COR', // Corse
  'G-E', // Grand Est
  'GUA', // Guadeloupe
  'GUY', // Guyane
  'H-F', // Hauts-de-France
  'I-F', // Île-de-France
  'MAR', // Martinique
  'MAY', // Mayotte
  'N-A', // Nouvelle-Aquitaine
  'N-C', // Nouvelle-Calédonie
  'NOR', // Normandie
  'OCC', // Occitanie
  'PCA', // Provence-Alpes-Côte d'Azur
  'P-F', // Polynésie française
  'P-L', // Pays de la Loire
  'REU', // Réunion
  'W-F'  // Wallis-et-Futuna
] as const

/**
 * Type union pour les ligues FFA
 */
export type FFALigue = typeof FFA_LIGUES[number]

/**
 * Niveaux de compétition FFA
 */
export const FFA_LEVELS = [
  'Départemental',
  'Régional',
  'National',
  'International'
] as const

/**
 * Type union pour les niveaux FFA
 */
export type FFALevel = typeof FFA_LEVELS[number]

/**
 * Mapping des codes FFA vers les codes régions françaises (ISO 3166-2:FR sans le préfixe FR-)
 * et codes départements pour les territoires d'outre-mer
 */
export const FFA_LIGUE_TO_REGION_CODE: Record<string, { code: string, name: string, displayCode: string }> = {
  'ARA': { code: 'ARA', name: 'Auvergne-Rhône-Alpes', displayCode: 'ARA' },
  'BFC': { code: 'BFC', name: 'Bourgogne-Franche-Comté', displayCode: 'BFC' },
  'BRE': { code: 'BRE', name: 'Bretagne', displayCode: 'BRE' },
  'CEN': { code: 'CVL', name: 'Centre-Val de Loire', displayCode: 'CVL' },
  'COR': { code: 'COR', name: 'Corse', displayCode: 'COR' },
  'G-E': { code: 'GES', name: 'Grand Est', displayCode: 'GES' },
  'H-F': { code: 'HDF', name: 'Hauts-de-France', displayCode: 'HDF' },
  'I-F': { code: 'IDF', name: 'Île-de-France', displayCode: 'IDF' },
  'NOR': { code: 'NOR', name: 'Normandie', displayCode: 'NOR' },
  'N-A': { code: 'NAQ', name: 'Nouvelle-Aquitaine', displayCode: 'NAQ' },
  'OCC': { code: 'OCC', name: 'Occitanie', displayCode: 'OCC' },
  'P-L': { code: 'PDL', name: 'Pays de la Loire', displayCode: 'PDL' },
  'PCA': { code: 'PAC', name: "Provence-Alpes-Côte d'Azur", displayCode: 'PAC' },
  // DOM-TOM : utiliser les codes départements
  'GUA': { code: '971', name: 'Guadeloupe', displayCode: 'GP' },
  'GUY': { code: '973', name: 'Guyane', displayCode: 'GF' },
  'MAR': { code: '972', name: 'Martinique', displayCode: 'MQ' },
  'MAY': { code: '976', name: 'Mayotte', displayCode: 'YT' },
  'REU': { code: '974', name: 'La Réunion', displayCode: 'RE' },
  'N-C': { code: '988', name: 'Nouvelle-Calédonie', displayCode: 'NC' },
  'P-F': { code: '987', name: 'Polynésie française', displayCode: 'PF' },
  'W-F': { code: '986', name: 'Wallis-et-Futuna', displayCode: 'WF' }
}

/**
 * Convertit un code FFA ligue en code région français (pour countrySubdivisionCodeLevel1)
 */
export function convertFFALigueToRegionCode(ffaLigue: string): string {
  return FFA_LIGUE_TO_REGION_CODE[ffaLigue]?.code || ffaLigue
}

/**
 * Convertit un code FFA ligue en nom de région (pour countrySubdivisionNameLevel1)
 */
export function convertFFALigueToRegionName(ffaLigue: string): string {
  const result = FFA_LIGUE_TO_REGION_CODE[ffaLigue]?.name || ffaLigue
  if (!FFA_LIGUE_TO_REGION_CODE[ffaLigue]) {
    console.warn(`⚠️  Ligue FFA inconnue pour conversion en nom: "${ffaLigue}" (longueur: ${ffaLigue.length})`)
  }
  return result
}

/**
 * Convertit un code FFA ligue en code d'affichage (pour countrySubdivisionDisplayCodeLevel1)
 */
export function convertFFALigueToDisplayCode(ffaLigue: string): string {
  const result = FFA_LIGUE_TO_REGION_CODE[ffaLigue]?.displayCode || ffaLigue
  if (!FFA_LIGUE_TO_REGION_CODE[ffaLigue]) {
    console.warn(`⚠️  Ligue FFA inconnue pour conversion en display code: "${ffaLigue}" (longueur: ${ffaLigue.length})`)
  }
  return result
}

// ============================================================================
// FFA RESULTS AGENT
// ============================================================================

/**
 * Configuration de l'agent FFA Results
 */
export interface FFAResultsConfig {
  /** ID de la base de données Miles Republic */
  sourceDatabase: string

  /** Nombre de ligues à traiter par exécution (défaut: 2) */
  liguesPerRun: number

  /** Nombre de mois à traiter par exécution (défaut: 1) */
  monthsPerRun: number

  /** Niveaux de compétition à inclure */
  levels: string[]

  /** Délai en millisecondes entre les requêtes HTTP (défaut: 2000) */
  humanDelayMs: number

  /** Délai en jours avant de rescanner la même période (défaut: 30) */
  rescanDelayDays: number

  /** Seuil de similarité pour le matching nom d'événement (défaut: 0.75) */
  similarityThreshold: number

  /** Confiance de base pour les données FFA (défaut: 0.95) */
  confidenceBase: number

  /** Date minimale pour les éditions à traiter (format: YYYY-MM-DD) */
  minEditionDate: string

  /** Délai minimum en jours depuis la fin de l'événement (défaut: 30) */
  minDaysAgo: number

  /** Nombre maximum de candidats MR à proposer (défaut: 5) */
  maxCandidates: number
}

/**
 * État de progression du scraping des résultats FFA
 */
export interface FFAResultsProgress {
  /** Ligue en cours de traitement */
  currentLigue: string

  /** Mois en cours de traitement (format: "YYYY-MM") */
  currentMonth: string

  /** Page en cours dans la pagination */
  currentPage: number

  /** Ligues complètement traitées */
  completedLigues: string[]

  /** Mois complétés par ligue */
  completedMonths: Record<string, string[]>

  /** Date de dernière complétion du cycle complet */
  lastCompletedAt?: Date

  /** Nombre total de compétitions scrapées */
  totalCompetitionsScraped: number

  /** Nombre de résultats trouvés (avec registrantsNumber) */
  totalResultsFound: number

  /** Nombre de propositions créées */
  totalProposalsCreated: number
}

/**
 * Candidat Miles Republic pour le matching avec une compétition FFA
 */
export interface MREditionCandidate {
  /** ID de l'événement Miles Republic */
  eventId: number

  /** Nom de l'événement */
  eventName: string

  /** Ville de l'événement */
  eventCity: string

  /** Slug de l'événement */
  eventSlug: string

  /** Département de l'événement */
  eventDepartment: string

  /** ID de l'édition */
  editionId: number

  /** Année de l'édition */
  editionYear: string

  /** Date de début de l'édition */
  startDate: Date | null

  /** Nombre de participants actuel (null = à remplir) */
  registrantsNumber: number | null

  /** Score de matching global */
  matchScore: number

  /** Score de similarité du nom */
  nameScore: number

  /** Score de similarité de la ville */
  cityScore: number

  /** Proximité temporelle (0-1) */
  dateProximity: number
}

/**
 * Mapping des départements vers les ligues FFA
 */
export const DEPARTMENT_TO_LIGUE: Record<string, string> = {
  // Auvergne-Rhône-Alpes (ARA)
  '01': 'ARA', '03': 'ARA', '07': 'ARA', '15': 'ARA', '26': 'ARA',
  '38': 'ARA', '42': 'ARA', '43': 'ARA', '63': 'ARA', '69': 'ARA',
  '73': 'ARA', '74': 'ARA',

  // Bourgogne-Franche-Comté (BFC)
  '21': 'BFC', '25': 'BFC', '39': 'BFC', '58': 'BFC', '70': 'BFC',
  '71': 'BFC', '89': 'BFC', '90': 'BFC',

  // Bretagne (BRE)
  '22': 'BRE', '29': 'BRE', '35': 'BRE', '56': 'BRE',

  // Centre-Val de Loire (CEN)
  '18': 'CEN', '28': 'CEN', '36': 'CEN', '37': 'CEN', '41': 'CEN', '45': 'CEN',

  // Corse (COR)
  '2A': 'COR', '2B': 'COR', '20': 'COR',

  // Grand Est (G-E)
  '08': 'G-E', '10': 'G-E', '51': 'G-E', '52': 'G-E', '54': 'G-E',
  '55': 'G-E', '57': 'G-E', '67': 'G-E', '68': 'G-E', '88': 'G-E',

  // Hauts-de-France (H-F)
  '02': 'H-F', '59': 'H-F', '60': 'H-F', '62': 'H-F', '80': 'H-F',

  // Île-de-France (I-F)
  '75': 'I-F', '77': 'I-F', '78': 'I-F', '91': 'I-F', '92': 'I-F',
  '93': 'I-F', '94': 'I-F', '95': 'I-F',

  // Normandie (NOR)
  '14': 'NOR', '27': 'NOR', '50': 'NOR', '61': 'NOR', '76': 'NOR',

  // Nouvelle-Aquitaine (N-A)
  '16': 'N-A', '17': 'N-A', '19': 'N-A', '23': 'N-A', '24': 'N-A',
  '33': 'N-A', '40': 'N-A', '47': 'N-A', '64': 'N-A', '79': 'N-A',
  '86': 'N-A', '87': 'N-A',

  // Occitanie (OCC)
  '09': 'OCC', '11': 'OCC', '12': 'OCC', '30': 'OCC', '31': 'OCC',
  '32': 'OCC', '34': 'OCC', '46': 'OCC', '48': 'OCC', '65': 'OCC',
  '66': 'OCC', '81': 'OCC', '82': 'OCC',

  // Pays de la Loire (P-L)
  '44': 'P-L', '49': 'P-L', '53': 'P-L', '72': 'P-L', '85': 'P-L',

  // Provence-Alpes-Côte d'Azur (PCA)
  '04': 'PCA', '05': 'PCA', '06': 'PCA', '13': 'PCA', '83': 'PCA', '84': 'PCA',

  // DOM-TOM
  '971': 'GUA', '972': 'MAR', '973': 'GUY', '974': 'REU',
  '976': 'MAY', '987': 'P-F', '988': 'N-C', '986': 'W-F'
}

/**
 * Convertit un code département en ligue FFA
 */
export function departmentToLigue(department: string | null | undefined): string | null {
  if (!department) return null

  // Normaliser le code : retirer les zéros non significatifs
  let normalized = department.trim()

  // Si c'est un code sur 3 chiffres (ex: "074"), retirer le zéro initial
  if (/^\d{3}$/.test(normalized) && normalized.startsWith('0')) {
    normalized = normalized.substring(1)
  }

  return DEPARTMENT_TO_LIGUE[normalized] || DEPARTMENT_TO_LIGUE[department] || null
}
