/**
 * Schémas de configuration des agents
 *
 * Source unique de vérité pour les schémas de configuration.
 * Utilisés par :
 * - apps/agents/ : validation runtime
 * - apps/api/ : endpoint /api/agents/available pour l'UI
 * - apps/dashboard/ : formulaires de création/édition
 */

export { FFAScraperAgentConfigSchema } from './ffa-scraper.js'
export { FFAResultsAgentConfigSchema } from './ffa-results.js'
export { GoogleSearchDateAgentConfigSchema } from './google-search-date.js'
export { AutoValidatorAgentConfigSchema } from './auto-validator.js'
export { SlackEventAgentConfigSchema } from './slack-event.js'
export { DuplicateDetectionAgentConfigSchema } from './duplicate-detection.js'

// Re-export pour accès par clé
import { FFAScraperAgentConfigSchema } from './ffa-scraper.js'
import { FFAResultsAgentConfigSchema } from './ffa-results.js'
import { GoogleSearchDateAgentConfigSchema } from './google-search-date.js'
import { AutoValidatorAgentConfigSchema } from './auto-validator.js'
import { SlackEventAgentConfigSchema } from './slack-event.js'
import { DuplicateDetectionAgentConfigSchema } from './duplicate-detection.js'
import type { ConfigSchema } from '../config.js'

/**
 * Map de tous les schémas de configuration par type d'agent
 */
export const AGENT_CONFIG_SCHEMAS: Record<string, ConfigSchema> = {
  FFA_SCRAPER: FFAScraperAgentConfigSchema,
  FFA_RESULTS: FFAResultsAgentConfigSchema,
  GOOGLE_SEARCH_DATE: GoogleSearchDateAgentConfigSchema,
  AUTO_VALIDATOR: AutoValidatorAgentConfigSchema,
  SLACK_EVENT: SlackEventAgentConfigSchema,
  DUPLICATE_DETECTION: DuplicateDetectionAgentConfigSchema
}
