/**
 * Versions centralisées des agents
 *
 * Ce fichier est la source unique de vérité pour les versions des agents.
 * Il est importé par :
 * - Les agents eux-mêmes (pour exporter la version)
 * - L'API (pour enrichir les métadonnées)
 * - Le dashboard (si nécessaire)
 * - Les scripts de sync
 *
 * Avantage: pas de duplication, une seule source de vérité
 */

export const AGENT_VERSIONS = {
  FFA_SCRAPER_AGENT: '2.3.0',
  GOOGLE_SEARCH_DATE_AGENT: '1.1.0',
  AUTO_VALIDATOR_AGENT: '1.0.0',
  SLACK_EVENT_AGENT: '1.0.0'
} as const

export type AgentVersionKey = keyof typeof AGENT_VERSIONS
