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
}

/**
 * Détails complets d'une compétition FFA
 */
export interface FFACompetitionDetails {
  /** Informations de base */
  competition: FFACompetition
  
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
  return FFA_LIGUE_TO_REGION_CODE[ffaLigue]?.name || ffaLigue
}

/**
 * Convertit un code FFA ligue en code d'affichage (pour countrySubdivisionDisplayCodeLevel1)
 */
export function convertFFALigueToDisplayCode(ffaLigue: string): string {
  return FFA_LIGUE_TO_REGION_CODE[ffaLigue]?.displayCode || ffaLigue
}
