import { GoogleSearchDateAgent } from './apps/agents/src/GoogleSearchDateAgent'

async function testGoogleAgent() {
  console.log('🧪 Test rapide du Google Search Date Agent')
  
  // Configuration minimale
  const config = {
    id: 'test-agent',
    name: 'Test Google Agent',
    description: 'Agent de test',
    frequency: '0 */6 * * *',
    isActive: true,
    config: {
      batchSize: 2,
      googleResultsCount: 2,
      enableMockMode: true // Forcer le mode mock
    }
  }

  try {
    const agent = new GoogleSearchDateAgent(config)
    console.log('✅ Agent créé avec succès')

    // Test de validation
    const isValid = await agent.validate()
    console.log(`Validation: ${isValid ? '✅' : '❌'}`)

    // Contexte de test simple
    const context = {
      runId: 'test-' + Date.now(),
      startedAt: new Date(),
      logger: {
        debug: (msg: string, data?: any) => console.log(`[DEBUG] ${msg}`, data || ''),
        info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
        warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
        error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || '')
      },
      config: config.config
    }

    console.log('🚀 Lancement du test d\'exécution...')
    const result = await agent.run(context)

    console.log('\n📊 Résultats:')
    console.log(`Success: ${result.success}`)
    console.log(`Message: ${result.message}`)
    
    if (result.metrics) {
      console.log('Métriques:', JSON.stringify(result.metrics, null, 2))
    }

    if (result.proposals && result.proposals.length > 0) {
      console.log(`\n📝 ${result.proposals.length} proposition(s):`)
      result.proposals.forEach((prop, i) => {
        console.log(`\nProposition ${i + 1}:`)
        console.log(`- Type: ${prop.type}`)
        console.log(`- Event: ${prop.eventId}`)
        console.log(`- Edition: ${prop.editionId}`)
        console.log(`- Justifications: ${prop.justification.length}`)
      })
    }

  } catch (error) {
    console.error('❌ Erreur:', error)
  }
}

testGoogleAgent()