import { EditionDuplicatorAgent } from '../EditionDuplicatorAgent'
import { EditionDuplicatorAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

const DEFAULT_CONFIG = {
  name: getAgentName('EDITION_DUPLICATOR'),
  description: 'Duplique les éditions terminées pour l\'année suivante (remplace le workflow n8n)',
  type: 'EXTRACTOR' as const,
  frequency: '0 3 * * *',
  isActive: true,
  config: {
    agentType: 'EDITION_DUPLICATOR',
    sourceDatabase: null,
    batchSize: 50,
    dryRun: false,
    configSchema: EditionDuplicatorAgentConfigSchema,
  },
}

agentRegistry.register('EDITION_DUPLICATOR', EditionDuplicatorAgent)

console.log('✅ Edition Duplicator Agent enregistré dans le registry pour EDITION_DUPLICATOR')

export { EditionDuplicatorAgent, DEFAULT_CONFIG }
export default EditionDuplicatorAgent
