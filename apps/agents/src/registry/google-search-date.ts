import { GoogleSearchDateAgent } from '../GoogleSearchDateAgent'
import { agentRegistry } from '@data-agents/agent-framework'

/**
 * Enregistrement du Google Search Date Agent dans le registry
 */

// Configuration par défaut de l'agent
const DEFAULT_CONFIG = {
  name: 'Google Search Date Agent',
  description: 'Recherche automatique des dates d\'événements sportifs via Google Search',
  type: 'EXTRACTOR' as const,
  frequency: '0 */6 * * *', // Toutes les 6 heures
  isActive: true,
  config: {
    // Paramètres par défaut
    batchSize: 10,                    // Événements par batch
    googleResultsCount: 5,            // Résultats Google à analyser
    
    // Base de données source - doit être configurée explicitement
    sourceDatabase: null, // ID de la base source (requis)
    
    // Clés API (variables d'environnement)
    googleApiKey: process.env.GOOGLE_API_KEY,
    googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
    
    // Configuration avancée
    dateConfidenceThreshold: 0.6,     // Seuil de confiance minimum
    maxDatesPerEvent: 5,              // Dates maximum par événement
    searchTimeoutMs: 10000,           // Timeout recherche Google
    
    // Filtres
    onlyFrenchEvents: true,           // Limiter aux événements français
    excludeWeekends: false,           // Exclure les weekends
    
    // Base de données Next Prod
    nextProdUrl: process.env.MILES_REPUBLIC_DATABASE_URL
  }
}

// Enregistrer l'agent dans le registry avec un identifiant unique
agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)

console.log('✅ Google Search Date Agent enregistré dans le registry pour GOOGLE_SEARCH_DATE')

export { GoogleSearchDateAgent, DEFAULT_CONFIG }
export default GoogleSearchDateAgent