/**
 * Type générique pour les métadonnées de source
 * Tous les agents DOIVENT utiliser ce format pour le champ sourceMetadata des propositions
 *
 * @see docs/CREATING-AGENTS.md pour les contrats obligatoires
 */

/**
 * Types de sources supportés
 */
export type SourceType = 'URL' | 'IMAGE' | 'TEXT' | 'SLACK' | 'FFA' | 'GOOGLE'

/**
 * Métadonnées de source standardisées
 * Ce format est obligatoire pour toutes les propositions créées par les agents
 */
export interface SourceMetadata {
  /**
   * Type de source (obligatoire)
   */
  type: SourceType

  /**
   * URL de la source (si applicable)
   * Pour les sources web, pages scrapées, etc.
   */
  url?: string

  /**
   * Images associées (URLs)
   * Pour les sources image ou les captures d'écran
   */
  imageUrls?: string[]

  /**
   * Texte brut extrait de la source
   * Utile pour conserver le contexte d'extraction
   */
  rawText?: string

  /**
   * Date d'extraction (obligatoire)
   * Format ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ
   */
  extractedAt: string

  /**
   * Métadonnées spécifiques au type de source (optionnel)
   * Permet d'ajouter des informations contextuelles sans casser le contrat
   */
  extra?: SourceMetadataExtra
}

/**
 * Métadonnées spécifiques au type de source
 * Structure flexible pour les informations additionnelles
 */
export interface SourceMetadataExtra {
  // Slack
  workspaceId?: string
  workspaceName?: string
  channelId?: string
  channelName?: string
  messageTs?: string
  threadTs?: string
  messageLink?: string
  userId?: string
  userName?: string

  // FFA
  ffaId?: string
  ligue?: string

  // Google
  searchQuery?: string
  resultRank?: number

  // Générique - pour extensions futures
  [key: string]: unknown
}

/**
 * Helper pour créer un SourceMetadata valide
 */
export function createSourceMetadata(
  type: SourceType,
  options: Omit<SourceMetadata, 'type' | 'extractedAt'> & { extractedAt?: string }
): SourceMetadata {
  return {
    type,
    extractedAt: options.extractedAt || new Date().toISOString(),
    ...options
  }
}
