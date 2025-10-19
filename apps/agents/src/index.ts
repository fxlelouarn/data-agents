import { agentRegistry } from '@data-agents/agent-framework'
import { FFAScraperAgent } from './ffa-scraper'
import { GoogleSearchDateAgent } from './GoogleSearchDateAgent'

// Register all available agents
agentRegistry.register('FFA_SCRAPER', FFAScraperAgent)
agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)

// Export for use in other applications
export { FFAScraperAgent, GoogleSearchDateAgent }
export { agentRegistry }

console.log('📦 Sample agents registered:', agentRegistry.getRegisteredTypes())