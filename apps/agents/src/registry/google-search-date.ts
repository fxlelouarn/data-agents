import { GoogleSearchDateAgent } from '../GoogleSearchDateAgent'
import { GoogleSearchDateAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

/**
 * Enregistrement du Google Search Date Agent dans le registry
 */

// Configuration par défaut de l'agent
const DEFAULT_CONFIG = {
  name: getAgentName('GOOGLE_SEARCH_DATE'),
  description: 'Recherche automatique des dates d\'événements sportifs via Google Search',
  type: 'EXTRACTOR' as const,
  frequency: '0 */6 * * *', // Toutes les 6 heures
  isActive: true,
  config: {
    agentType: 'GOOGLE_SEARCH_DATE',

    // Valeurs par défaut
    batchSize: 10,
    googleResultsCount: 5,
    sourceDatabase: null,
    googleApiKey: process.env.GOOGLE_API_KEY,
    googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
    dateConfidenceThreshold: 0.6,
    maxDatesPerEvent: 5,
    searchTimeoutMs: 10000,
    onlyFrenchEvents: true,
    excludeWeekends: false,
    cooldownDays: 14,

    // Schéma de configuration pour l'interface dynamique
    configSchema: GoogleSearchDateAgentConfigSchema
  }
}

// Enregistrer l'agent dans le registry avec un identifiant unique
agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)

console.log('✅ Google Search Date Agent enregistré dans le registry pour GOOGLE_SEARCH_DATE')

export { GoogleSearchDateAgent, DEFAULT_CONFIG }
export default GoogleSearchDateAgent
