import { FFTRIScraperAgent } from '../FFTRIScraperAgent'
import { FFTRIScraperAgentConfigSchema, getAgentName } from '@data-agents/types'
import { agentRegistry } from '@data-agents/agent-framework'

/**
 * Enregistrement du FFTRI Scraper Agent dans le registry
 */

// Configuration par défaut de l'agent
const DEFAULT_CONFIG = {
  name: getAgentName('FFTRI_SCRAPER'),
  description: 'Scrape automatique du calendrier FFTRI pour extraire les événements de triathlon/multisport',
  type: 'EXTRACTOR' as const,
  frequency: '0 */12 * * *', // Toutes les 12 heures
  isActive: true,
  config: {
    agentType: 'FFTRI_SCRAPER',

    // Valeurs par défaut
    sourceDatabase: null,
    liguesPerRun: 2,
    monthsPerRun: 1,
    scrapingWindowMonths: 6,
    rescanDelayDays: 30,
    humanDelayMs: 2000,
    similarityThreshold: 0.75,
    distanceTolerancePercent: 0.1,
    confidenceBase: 0.9,
    maxEventsPerMonth: 200,

    // Schéma de configuration pour l'interface dynamique
    configSchema: FFTRIScraperAgentConfigSchema
  }
}

// Enregistrer l'agent dans le registry avec un identifiant unique
agentRegistry.register('FFTRI_SCRAPER', FFTRIScraperAgent)

console.log('✅ FFTRI Scraper Agent enregistré dans le registry pour FFTRI_SCRAPER')

export { FFTRIScraperAgent, DEFAULT_CONFIG }
export default FFTRIScraperAgent
