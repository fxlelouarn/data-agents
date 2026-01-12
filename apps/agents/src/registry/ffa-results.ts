import { FFAResultsAgent } from '../FFAResultsAgent'
import { FFAResultsAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

/**
 * Enregistrement du FFA Results Agent dans le registry
 */

// Configuration par défaut de l'agent
const DEFAULT_CONFIG = {
  name: getAgentName('FFA_RESULTS'),
  description: 'Récupère le nombre de participants depuis les résultats FFA pour les éditions passées',
  type: 'EXTRACTOR' as const,
  frequency: '0 6 * * *', // Tous les jours à 6h
  isActive: true,
  config: {
    agentType: 'FFA_RESULTS',

    // Valeurs par défaut
    sourceDatabase: null,
    liguesPerRun: 2,
    monthsPerRun: 1,
    levels: ['Départemental', 'Régional', 'National', 'International'],
    humanDelayMs: 2000,
    rescanDelayDays: 30,
    similarityThreshold: 0.75,
    confidenceBase: 0.95,
    minEditionDate: '2025-01-01',
    minDaysAgo: 30,
    maxCandidates: 5,

    // Schéma de configuration pour l'interface dynamique
    configSchema: FFAResultsAgentConfigSchema
  }
}

// Enregistrer l'agent dans le registry avec un identifiant unique
agentRegistry.register('FFA_RESULTS', FFAResultsAgent)

console.log('✅ FFA Results Agent enregistré dans le registry pour FFA_RESULTS')

export { FFAResultsAgent, DEFAULT_CONFIG }
export default FFAResultsAgent
