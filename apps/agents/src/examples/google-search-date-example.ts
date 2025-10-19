import { GoogleSearchDateAgent } from '../GoogleSearchDateAgent'
import { DatabaseService } from '@data-agents/database'

/**
 * Exemple d'utilisation du GoogleSearchDateAgent
 * 
 * Cet agent recherche automatiquement les dates d'événements sportifs 
 * via Google Search pour les événements ayant un statut TO_BE_CONFIRMED
 */

async function runGoogleSearchDateAgentExample() {
  try {
    // Configuration de l'agent avec paramètres personnalisables
    const agentConfig = {
      id: 'google-search-date-agent-001',
      name: 'Google Search Date Agent - Exemple',
      description: 'Agent de recherche Google pour extraction automatique de dates',
      frequency: '0 */6 * * *', // Toutes les 6 heures
      isActive: true,
      config: {
        // Taille du batch (défaut: 10)
        batchSize: 5, // Plus petit batch pour les tests
        
        // Nombre de résultats Google à analyser (défaut: 5)
        googleResultsCount: 3,
        
        // Clés API Google (optionnelles, utilise les variables d'env par défaut)
        // googleApiKey: 'your-google-api-key',
        // googleSearchEngineId: 'your-search-engine-id'
      }
    }

    // Initialisation de l'agent
    const db = new DatabaseService()
    const agent = new GoogleSearchDateAgent(agentConfig, db)

    console.log('🚀 Initialisation de l\'agent Google Search Date...')
    
    // Validation de l'agent
    const isValid = await agent.validate()
    if (!isValid) {
      throw new Error('Validation de l\'agent échouée')
    }
    
    console.log('✅ Agent validé avec succès')
    
    // Simulation d'un contexte d'exécution
    const context = {
      runId: 'test-run-001',
      startedAt: new Date(),
      logger: {
        debug: (msg: string, data?: any) => console.log(`[DEBUG] ${msg}`, data || ''),
        info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
        warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
        error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || '')
      },
      config: agentConfig.config
    }

    console.log('🔍 Lancement de l\'exécution de l\'agent...')
    
    // Exécution de l'agent
    const result = await agent.run(context)
    
    if (result.success) {
      console.log('✅ Exécution réussie!')
      console.log(`📊 Métriques:`, result.metrics)
      console.log(`💬 Message: ${result.message}`)
      
      if (result.proposals && result.proposals.length > 0) {
        console.log(`📝 ${result.proposals.length} proposition(s) créée(s):`)
        
        result.proposals.forEach((proposal: any, index: number) => {
          console.log(`\n--- Proposition ${index + 1} ---`)
          console.log(`Type: ${proposal.type}`)
          console.log(`Event ID: ${proposal.eventId}`)
          console.log(`Edition ID: ${proposal.editionId}`)
          console.log(`Race ID: ${proposal.raceId || 'N/A'}`)
          console.log(`Changements:`)
          
          Object.entries(proposal.changes).forEach(([field, change]) => {
            console.log(`  - ${field}: ${JSON.stringify(change)}`)
          })
          
          console.log(`Justifications: ${proposal.justification.length} élément(s)`)
        })
      } else {
        console.log('ℹ️  Aucune proposition créée lors de cette exécution')
      }
      
    } else {
      console.error('❌ Échec de l\'exécution:', result.message)
    }

    // Vérification du statut de l'agent
    const status = await agent.getStatus()
    console.log('\n📈 Statut de l\'agent:')
    console.log(`  - Healthy: ${status.healthy}`)
    console.log(`  - Last Run: ${status.lastRun || 'N/A'}`)
    console.log(`  - Next Run: ${status.nextRun || 'N/A'}`)
    console.log(`  - Message: ${status.message || 'N/A'}`)

  } catch (error) {
    console.error('💥 Erreur lors de l\'exécution de l\'exemple:', error)
  }
}

/**
 * Configuration JSON pour l'agent dans la base de données
 */
export const GOOGLE_SEARCH_DATE_AGENT_CONFIG = {
  name: 'Google Search Date Agent',
  description: 'Recherche automatique des dates d\'événements sportifs via Google Search',
  type: 'EXTRACTOR',
  frequency: '0 */6 * * *', // Toutes les 6 heures
  isActive: true,
  config: {
    // Paramètres configurables
    batchSize: 10,           // Nombre d'événements par batch
    googleResultsCount: 5,   // Nombre de résultats Google à analyser
    
    // Variables d'environnement optionnelles
    // GOOGLE_API_KEY - Clé API Google Custom Search
    // GOOGLE_SEARCH_ENGINE_ID - ID du moteur de recherche personnalisé
    // MILES_REPUBLIC_DATABASE_URL - URL de connexion à la base Next Prod
    
    // Configuration avancée
    dateConfidenceThreshold: 0.6,  // Seuil de confiance minimum pour les dates
    maxDatesPerEvent: 5,           // Nombre maximum de dates à extraire par événement
    searchTimeoutMs: 10000,        // Timeout pour les requêtes Google (10s)
    
    // Filtres et restrictions
    onlyFrenchEvents: true,        // Limiter aux événements français
    excludeWeekends: false,        // Exclure les dates de weekend
  }
}

/**
 * Exemples de requêtes que l'agent va effectuer
 */
export const EXAMPLE_SEARCH_QUERIES = [
  '"Marathon de Paris" "Paris" 2024',
  '"Trail de Belledonne" "Grenoble" 2024', 
  '"10 km de Tours" "Tours" 2024',
  '"Triathlon de Nice" "Nice" 2024',
  '"Ultra Trail du Mont Blanc" "Chamonix" 2024'
]

/**
 * Structure des propositions générées
 */
export interface ExampleProposal {
  type: 'EDITION_UPDATE' | 'RACE_UPDATE'
  eventId: string
  editionId: string
  raceId?: string
  changes: {
    startDate?: {
      new: Date
      confidence: number
    }
  }
  justification: Array<{
    type: 'text' | 'url'
    content: string
    metadata?: any
  }>
}

// Exécution de l'exemple si le script est appelé directement
if (require.main === module) {
  runGoogleSearchDateAgentExample()
    .then(() => {
      console.log('\n✨ Exemple terminé')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n💥 Erreur fatale:', error)
      process.exit(1)
    })
}