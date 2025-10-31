import { agentRegistry } from '@data-agents/agent-framework'
import { FFAScraperAgent } from './FFAScraperAgent'
import { GoogleSearchDateAgent } from './GoogleSearchDateAgent'

// Register all available agents
agentRegistry.register('FFA_SCRAPER', FFAScraperAgent)
agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)

// Export for use in other applications
export { FFAScraperAgent }
export { GoogleSearchDateAgent }
export { agentRegistry }

console.log('📦 Sample agents registered:', agentRegistry.getRegisteredTypes())