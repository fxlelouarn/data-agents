#!/usr/bin/env node

/**
 * Test rapide du GoogleSearchDateAgent
 */

// Test simple avec les modules compilés
const { GoogleSearchDateAgent } = require('./apps/agents/dist/GoogleSearchDateAgent.js')
const { DatabaseService } = require('./packages/database/dist/index.js')

async function testGoogleSearchAgent() {
  try {
    console.log('🧪 Test du Google Search Date Agent')
    
    const config = {
      id: 'test-google-search-agent',
      name: 'Google Search Date Agent - Test',
      description: 'Test de l\'agent Google Search',
      frequency: '0 */6 * * *',
      isActive: true,
      config: {
        batchSize: 2,  // Petit batch pour le test
        googleResultsCount: 3,
        googleApiKey: process.env.GOOGLE_API_KEY,
        googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID
      }
    }
    
    // Créer le service de base de données
    const db = new DatabaseService()
    const agent = new GoogleSearchDateAgent(config, db)
    
    console.log('✅ Agent créé, validation en cours...')
    const isValid = await agent.validate()
    
    if (!isValid) {
      console.error('❌ Validation échouée')
      return
    }
    
    console.log('✅ Agent validé, test d\'exécution...')
    
    const context = {
      runId: 'test-run-' + Date.now(),
      startedAt: new Date(),
      logger: {
        debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
        info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
        warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
        error: (msg, data) => console.error(`[ERROR] ${msg}`, data || '')
      },
      config: config.config
    }
    
    const result = await agent.run(context)
    
    console.log('\n📊 Résultats du test:')
    console.log(`Success: ${result.success}`)
    console.log(`Message: ${result.message}`)
    
    if (result.metrics) {
      console.log('Métriques:', result.metrics)
    }
    
    if (result.proposals) {
      console.log(`Propositions créées: ${result.proposals.length}`)
      result.proposals.forEach((proposal, i) => {
        console.log(`\nProposition ${i+1}:`)
        console.log(`- Type: ${proposal.type}`)
        console.log(`- Event ID: ${proposal.eventId}`)
        console.log(`- Edition ID: ${proposal.editionId}`)
        console.log(`- Changes: ${JSON.stringify(proposal.changes, null, 2)}`)
        console.log(`- Justifications: ${proposal.justification.length} élément(s)`)
      })
    }
    
  } catch (error) {
    console.error('💥 Erreur lors du test:', error.message)
    console.error('Stack:', error.stack)
  }
}

// Charger les variables d'environnement
process.env.GOOGLE_API_KEY = 'AIzaSyBv6rvEYkm3nSSVt6VSzU1zZsoU7mkIfTc'
process.env.GOOGLE_SEARCH_ENGINE_ID = '50eb493be7a6f476c'
process.env.MILES_REPUBLIC_DATABASE_URL = 'postgresql://neondb_owner:EcB08pZVgXGk@ep-summer-smoke-a29510xq-pooler.eu-central-1.aws.neon.tech/neondb'

testGoogleSearchAgent()