/**
 * Types standardisés pour les justifications des propositions
 * Tous les agents DOIVENT utiliser ce format pour le champ justification des propositions
 *
 * @see docs/CREATING-AGENTS.md pour les contrats obligatoires
 */

/**
 * Types de justification supportés
 */
export type JustificationType =
  | 'url_source'        // Source URL extraite
  | 'rejected_matches'  // Événements similaires rejetés (score < seuil)
  | 'matching'          // Résultat de matching avec événement existant
  | 'extraction'        // Information sur l'extraction de données
  | 'validation'        // Résultat de validation automatique

/**
 * Justification standardisée
 * Ce format est obligatoire pour toutes les propositions créées par les agents
 */
export interface Justification {
  /**
   * Type de justification (obligatoire)
   */
  type: JustificationType

  /**
   * Description lisible par un humain
   */
  content: string

  /**
   * Métadonnées structurées (optionnel, dépend du type)
   */
  metadata?: JustificationMetadata
}

/**
 * Métadonnées de justification
 * Structure dépendante du type de justification
 */
export interface JustificationMetadata {
  // Pour type === 'url_source'
  url?: string

  // Pour type === 'rejected_matches' (OBLIGATOIRE si ce type)
  rejectedMatches?: RejectedMatch[]

  // Pour type === 'matching'
  matchType?: 'EXACT' | 'FUZZY_MATCH' | 'NO_MATCH'
  matchedEventId?: number
  matchedEventName?: string
  similarity?: number
  matchedEditionId?: number
  matchedEditionYear?: string

  // Pour type === 'extraction'
  extractionMethod?: 'html' | 'image' | 'text' | 'api'

  // Pour type === 'validation'
  validationRules?: string[]
  validationScore?: number

  // Générique - pour extensions futures
  [key: string]: unknown
}

/**
 * Structure d'un événement similaire rejeté
 * Affiché dans la card "Événements similaires détectés"
 */
export interface RejectedMatch {
  /**
   * ID de l'événement dans Miles Republic
   */
  eventId: number

  /**
   * Nom de l'événement
   */
  eventName: string

  /**
   * Slug URL de l'événement (pour le lien Miles Republic)
   */
  eventSlug: string

  /**
   * Ville de l'événement
   */
  eventCity: string

  /**
   * Code département de l'événement
   */
  eventDepartment: string

  /**
   * ID de l'édition (si existe)
   */
  editionId?: number

  /**
   * Année de l'édition (si existe)
   */
  editionYear?: string

  /**
   * Score de matching global (0-1)
   */
  matchScore: number

  /**
   * Score de similarité du nom (0-1)
   */
  nameScore: number

  /**
   * Score de similarité de la ville (0-1)
   */
  cityScore: number

  /**
   * Indique si le département correspond
   */
  departmentMatch: boolean

  /**
   * Score de proximité de date (0-1)
   */
  dateProximity: number
}

/**
 * Helper pour créer une justification de type 'rejected_matches'
 */
export function createRejectedMatchesJustification(
  rejectedMatches: RejectedMatch[]
): Justification {
  return {
    type: 'rejected_matches',
    content: `Top ${rejectedMatches.length} événements similaires trouvés mais rejetés`,
    metadata: { rejectedMatches }
  }
}

/**
 * Helper pour créer une justification de type 'url_source'
 */
export function createUrlSourceJustification(url: string): Justification {
  return {
    type: 'url_source',
    content: `Source: ${url}`,
    metadata: { url }
  }
}

/**
 * Helper pour créer une justification de type 'matching'
 */
export function createMatchingJustification(
  matchType: 'EXACT' | 'FUZZY_MATCH' | 'NO_MATCH',
  event?: { id: number; name: string; similarity?: number },
  edition?: { id: number; year: string }
): Justification {
  const content = matchType === 'NO_MATCH'
    ? 'Aucun événement correspondant trouvé'
    : `Match ${matchType} avec "${event?.name}"`

  return {
    type: 'matching',
    content,
    metadata: {
      matchType,
      matchedEventId: event?.id,
      matchedEventName: event?.name,
      similarity: event?.similarity,
      matchedEditionId: edition?.id,
      matchedEditionYear: edition?.year
    }
  }
}
