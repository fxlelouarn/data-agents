/**
 * Types pour l'agent Auto-Validateur
 */

/**
 * Configuration de l'agent Auto-Validateur
 */
export interface AutoValidatorConfig {
  /** Connexion à Miles Republic pour vérifier les critères */
  milesRepublicDatabase: string

  /** Nombre maximum de propositions à traiter par exécution */
  maxProposalsPerRun: number

  /** Confiance minimale requise pour auto-valider (0.5 - 1.0) */
  minConfidence: number

  /** Activer la validation automatique du bloc edition */
  enableEditionBlock: boolean

  /** Activer la validation automatique du bloc organizer */
  enableOrganizerBlock: boolean

  /** Activer la validation automatique du bloc races */
  enableRacesBlock: boolean

  /** Mode simulation (log sans valider réellement) */
  dryRun: boolean
}

/**
 * Raisons d'exclusion possibles pour une proposition
 */
export type ExclusionReason =
  | 'featuredEvent'    // Event.isFeatured = true
  | 'premiumCustomer'  // Edition.customerType != null
  | 'newRaces'         // Proposition contient des courses sans raceId
  | 'lowConfidence'    // Confiance < minConfidence
  | 'otherAgent'       // Proposition d'un agent non autorisé

/**
 * Résultat de la validation d'une proposition
 */
export interface ValidationResult {
  /** La proposition est-elle valide pour validation automatique */
  isValid: boolean

  /** Raison du rejet (si isValid = false) */
  reason?: string

  /** Type d'exclusion (pour les statistiques) */
  exclusionReason?: ExclusionReason

  /** Détails supplémentaires */
  details?: Record<string, any>
}

/**
 * Résultat d'un run de l'agent Auto-Validateur
 */
export interface AutoValidatorRunResult {
  /** Nombre de propositions analysées */
  proposalsAnalyzed: number

  /** Nombre de propositions validées */
  proposalsValidated: number

  /** Nombre de propositions ignorées */
  proposalsIgnored: number

  /** Détail des exclusions */
  exclusionReasons: {
    featuredEvent: number
    premiumCustomer: number
    newRaces: number
    lowConfidence: number
    otherAgent: number
  }

  /** Liste des propositions traitées */
  processedProposals: ProcessedProposal[]
}

/**
 * Information sur une proposition traitée
 */
export interface ProcessedProposal {
  /** ID de la proposition */
  id: string

  /** Nom de l'événement */
  eventName: string

  /** Action effectuée */
  action: 'validated' | 'ignored'

  /** Raison de l'ignorance (si action = 'ignored') */
  reason?: string

  /** Blocs validés (si action = 'validated') */
  blocksValidated?: string[]

  /** IDs des ProposalApplication créées */
  applicationIds?: string[]
}

/**
 * Statistiques globales de l'agent (stockées dans AgentState)
 */
export interface AutoValidatorStats {
  /** Nombre total de runs */
  totalRuns: number

  /** Nombre de runs réussis */
  successfulRuns: number

  /** Nombre de runs échoués */
  failedRuns: number

  /** Nombre total de propositions analysées */
  totalProposalsAnalyzed: number

  /** Nombre total de propositions validées */
  totalProposalsValidated: number

  /** Nombre total de propositions ignorées */
  totalProposalsIgnored: number

  /** Répartition des exclusions */
  exclusionBreakdown: {
    featuredEvent: number
    premiumCustomer: number
    newRaces: number
    lowConfidence: number
    otherAgent: number
  }

  /** Date du dernier run (ISO string) */
  lastRunAt: string
}

/**
 * Structure d'un changement de course dans les propositions
 */
export interface RaceChange {
  /** ID de la course (si existante) */
  raceId?: number

  /** Nom de la course */
  raceName?: string

  /** Mises à jour à appliquer */
  updates?: Record<string, {
    old?: any
    new: any
  }>

  /** Données actuelles de la course */
  currentData?: Record<string, any>
}
