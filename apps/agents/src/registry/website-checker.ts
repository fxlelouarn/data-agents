import { WebsiteCheckerAgent } from '../WebsiteCheckerAgent'
import { WebsiteCheckerAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

const DEFAULT_CONFIG = {
  name: getAgentName('WEBSITE_CHECKER'),
  description: 'Visite les sites web des événements pour confirmer les éditions TO_BE_CONFIRMED',
  type: 'EXTRACTOR' as const,
  frequency: '0 */8 * * *',
  isActive: true,
  config: {
    agentType: 'WEBSITE_CHECKER',
    sourceDatabase: null,
    batchSize: 30,
    cooldownDays: 14,
    lookAheadMonths: 3,
    requestDelayMs: 3000,
    requestTimeoutMs: 10000,
    dryRun: false,
    configSchema: WebsiteCheckerAgentConfigSchema,
  },
}

agentRegistry.register('WEBSITE_CHECKER', WebsiteCheckerAgent)

console.log('✅ Website Checker Agent enregistré dans le registry pour WEBSITE_CHECKER')

export { WebsiteCheckerAgent, DEFAULT_CONFIG }
export default WebsiteCheckerAgent
