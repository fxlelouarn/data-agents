import { SlackEventAgent } from '../SlackEventAgent'
import { SlackEventAgentConfigSchema } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

/**
 * Enregistrement du Slack Event Agent dans le registry
 */

// Configuration par défaut de l'agent
const DEFAULT_CONFIG = {
  name: 'Slack Event Agent',
  description: 'Traite les messages Slack @databot pour extraire des événements',
  type: 'EXTRACTOR' as const,
  frequency: '0 0 31 2 *', // 31 février = jamais (webhook-driven)
  isActive: true,
  config: {
    agentType: 'SLACK_EVENT',

    // Credentials (fallback sur env vars)
    slackBotToken: null,
    slackSigningSecret: null,
    anthropicApiKey: null,

    // Channels
    channels: [],

    // Extraction
    extraction: {
      preferredModel: 'haiku',
      fallbackToSonnet: true,
      maxImageSizeMB: 20
    },

    // Relances
    reminders: {
      enabled: true,
      delayHours: 24,
      maxReminders: 2
    },

    // Source database pour matching
    sourceDatabase: null,

    // Schéma de configuration pour l'interface dynamique
    configSchema: SlackEventAgentConfigSchema
  }
}

// Enregistrer l'agent dans le registry avec un identifiant unique
agentRegistry.register('SLACK_EVENT', SlackEventAgent)

console.log('✅ Slack Event Agent enregistré dans le registry pour SLACK_EVENT')

export { SlackEventAgent, DEFAULT_CONFIG }
export default SlackEventAgent
