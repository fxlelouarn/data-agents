import { agentRegistry } from '@data-agents/agent-framework'
// import { FFAScraperAgent } from './ffa-scraper' // TODO: Agent non prêt pour production
import { GoogleSearchDateAgent } from './GoogleSearchDateAgent'

// Register all available agents
// agentRegistry.register('FFA_SCRAPER', FFAScraperAgent) // TODO: Agent non prêt pour production
agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)

// Export for use in other applications
// export { FFAScraperAgent } // TODO: Agent non prêt pour production
export { GoogleSearchDateAgent }
export { agentRegistry }

console.log('📦 Sample agents registered:', agentRegistry.getRegisteredTypes())