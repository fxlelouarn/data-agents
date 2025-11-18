import { FFAScraperAgent } from '../FFAScraperAgent'
import { FFAScraperAgentConfigSchema } from '../FFAScraperAgent.configSchema'
import { agentRegistry } from '@data-agents/agent-framework'

/**
 * Enregistrement du FFA Scraper Agent dans le registry
 */

// Configuration par défaut de l'agent
const DEFAULT_CONFIG = {
  name: 'FFA Scraper Agent',
  description: 'Scrape automatique du calendrier FFA pour extraire les compétitions de course à pied',
  type: 'EXTRACTOR' as const,
  frequency: '0 */12 * * *', // Toutes les 12 heures
  isActive: true,
  config: {
    agentType: 'FFA_SCRAPER',
    
    // Valeurs par défaut
    sourceDatabase: null,
    liguesPerRun: 2,
    monthsPerRun: 1,
    levels: ['Départemental', 'Régional'],
    scrapingWindowMonths: 6,
    rescanDelayDays: 30,
    humanDelayMs: 2000,
    similarityThreshold: 0.75,
    distanceTolerancePercent: 0.1,
    confidenceBase: 0.9,
    maxCompetitionsPerMonth: 500,
    
    // Schéma de configuration pour l'interface dynamique
    configSchema: FFAScraperAgentConfigSchema
  }
}

// Enregistrer l'agent dans le registry avec un identifiant unique
agentRegistry.register('FFA_SCRAPER', FFAScraperAgent)

console.log('✅ FFA Scraper Agent enregistré dans le registry pour FFA_SCRAPER')

export { FFAScraperAgent, DEFAULT_CONFIG }
export default FFAScraperAgent
