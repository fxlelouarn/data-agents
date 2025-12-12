import { AutoValidatorAgent } from '../AutoValidatorAgent'
import { AutoValidatorAgentConfigSchema } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

/**
 * Enregistrement de l'Auto Validator Agent dans le registry
 */

// Configuration par défaut de l'agent
const DEFAULT_CONFIG = {
  name: 'Auto Validator Agent',
  description: 'Valide automatiquement les propositions FFA sous certaines conditions',
  type: 'VALIDATOR' as const,
  frequency: '0 * * * *', // Toutes les heures
  isActive: true,
  config: {
    agentType: 'AUTO_VALIDATOR',

    // Valeurs par défaut
    milesRepublicDatabase: null,
    maxProposalsPerRun: 100,
    minConfidence: 0.7,
    enableEditionBlock: true,
    enableOrganizerBlock: true,
    enableRacesBlock: true,
    dryRun: false,

    // Schéma de configuration pour l'interface dynamique
    configSchema: AutoValidatorAgentConfigSchema
  }
}

// Enregistrer l'agent dans le registry avec un identifiant unique
agentRegistry.register('AUTO_VALIDATOR', AutoValidatorAgent)

console.log('✅ Auto Validator Agent enregistré dans le registry pour AUTO_VALIDATOR')

export { AutoValidatorAgent, DEFAULT_CONFIG }
export default AutoValidatorAgent
