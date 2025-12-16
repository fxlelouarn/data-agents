/**
 * Versions et noms centralisés des agents
 *
 * Ce fichier est la source unique de vérité pour les versions et noms des agents.
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
  SLACK_EVENT_AGENT: '1.0.0',
  DUPLICATE_DETECTION_AGENT: '1.0.0'
} as const

export type AgentVersionKey = keyof typeof AGENT_VERSIONS

/**
 * Identifiants techniques des agents (clés du registry)
 */
export type AgentTypeKey = 'FFA_SCRAPER' | 'GOOGLE_SEARCH_DATE' | 'AUTO_VALIDATOR' | 'SLACK_EVENT' | 'DUPLICATE_DETECTION'

/**
 * Noms lisibles des agents (utilisés en base de données)
 * Source unique de vérité pour les noms d'agents
 */
export const AGENT_NAMES: Record<AgentTypeKey, string> = {
  FFA_SCRAPER: 'FFA Scraper Agent',
  GOOGLE_SEARCH_DATE: 'Google Search Date Agent',
  AUTO_VALIDATOR: 'Auto Validator Agent',
  SLACK_EVENT: 'Slack Event Agent',
  DUPLICATE_DETECTION: 'Duplicate Detection Agent'
} as const

/**
 * Récupère le nom d'un agent depuis son type
 * À utiliser partout où on a besoin du nom d'un agent
 */
export function getAgentName(agentType: AgentTypeKey): string {
  return AGENT_NAMES[agentType]
}
