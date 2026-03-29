import { EditionConfirmationAgent } from '../EditionConfirmationAgent'
import { EditionConfirmationAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

const DEFAULT_CONFIG = {
  name: getAgentName('EDITION_CONFIRMATION'),
  description: 'Visite les sites web des événements pour confirmer les éditions TO_BE_CONFIRMED',
  type: 'EXTRACTOR' as const,
  frequency: '0 */8 * * *',
  isActive: true,
  config: {
    agentType: 'EDITION_CONFIRMATION',
    sourceDatabase: null,
    batchSize: 30,
    cooldownDays: 14,
    lookAheadMonths: 3,
    requestDelayMs: 3000,
    requestTimeoutMs: 10000,
    dryRun: false,
    configSchema: EditionConfirmationAgentConfigSchema,
  },
}

agentRegistry.register('EDITION_CONFIRMATION', EditionConfirmationAgent)

console.log('✅ Edition Confirmation Agent enregistré dans le registry pour EDITION_CONFIRMATION')

export { EditionConfirmationAgent, DEFAULT_CONFIG }
export default EditionConfirmationAgent
