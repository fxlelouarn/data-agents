import { agentRegistry } from '@data-agents/agent-framework'
import { FFAScraperAgent, FFA_SCRAPER_AGENT_VERSION } from './FFAScraperAgent'
import { GoogleSearchDateAgent, GOOGLE_SEARCH_DATE_AGENT_VERSION } from './GoogleSearchDateAgent'
import { AutoValidatorAgent, AUTO_VALIDATOR_AGENT_VERSION } from './AutoValidatorAgent'

// Register all available agents
agentRegistry.register('FFA_SCRAPER', FFAScraperAgent)
agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)
agentRegistry.register('AUTO_VALIDATOR', AutoValidatorAgent)

// Export for use in other applications
export { FFAScraperAgent, FFA_SCRAPER_AGENT_VERSION }
export { GoogleSearchDateAgent, GOOGLE_SEARCH_DATE_AGENT_VERSION }
export { AutoValidatorAgent, AUTO_VALIDATOR_AGENT_VERSION }
export { agentRegistry }

// Export versions object for easy access
export const AGENT_VERSIONS = {
  ffaScraper: FFA_SCRAPER_AGENT_VERSION,
  googleSearchDate: GOOGLE_SEARCH_DATE_AGENT_VERSION,
  autoValidator: AUTO_VALIDATOR_AGENT_VERSION
}

console.log('📦 Sample agents registered:', agentRegistry.getRegisteredTypes())
