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
  'CVL', // Centre-Val de Loire
  'COR', // Corse
  'GES', // Grand Est
  'HDF', // Hauts-de-France
  'IDF', // Île-de-France
  'NOR', // Normandie
  'NAQ', // Nouvelle-Aquitaine
  'OCC', // Occitanie
  'PDL', // Pays de la Loire
  'PAC', // Provence-Alpes-Côte d'Azur
  'GUA', // Guadeloupe
  'GUY', // Guyane
  'MAR', // Martinique
  'MAY', // Mayotte
  'REU', // Réunion
  'POL', // Polynésie française
  'NCL', // Nouvelle-Calédonie
  'WF'   // Wallis-et-Futuna
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
