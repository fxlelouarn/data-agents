import { GoogleSearchDateAgent } from './apps/agents/src/GoogleSearchDateAgent'

/**
 * Test de la nouvelle requête SQL pour vérifier qu'elle retourne 
 * les mêmes résultats que votre requête SQL directe
 */
async function testNewQuery() {
  console.log('🧪 Test de la nouvelle requête GoogleSearchDateAgent\n')

  // Configuration test
  const config = {
    id: 'test-query',
    name: 'Test New Query',
    frequency: '0 */6 * * *',
    isActive: true,
    config: {
      batchSize: 100,
      googleResultsCount: 3,
      sourceDatabase: 'milesrepublic-prod', // Ajustez selon votre config
      googleApiKey: process.env.GOOGLE_API_KEY,
      googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID
    }
  }

  try {
    const agent = new GoogleSearchDateAgent(config)

    console.log('🔌 Initialisation de l\'agent...')
    
    // Accéder à la méthode privée via reflection pour les tests
    const getToBeConfirmedEvents = (agent as any).getToBeConfirmedEvents.bind(agent)
    
    console.log('📋 Récupération des événements TO_BE_CONFIRMED...')
    const events = await getToBeConfirmedEvents(100)
    
    console.log(`📊 Résultats de la nouvelle requête:`)
    console.log(`   Nombre total d'événements: ${events.length}`)
    
    if (events.length > 0) {
      console.log('\n   Premiers événements:')
      events.slice(0, 10).forEach((event, i) => {
        console.log(`   ${i + 1}. ${event.name} (${event.city})`)
        console.log(`      Edition: ${event.edition?.year} - ${event.edition?.calendarStatus}`)
        console.log(`      Event ID: ${event.id}, Edition ID: ${event.edition?.id}`)
        console.log('')
      })
      
      // Statistiques par année
      const currentYear = new Date().getFullYear().toString()
      const nextYear = (new Date().getFullYear() + 1).toString()
      
      const eventsCurrentYear = events.filter(e => e.edition?.year === currentYear).length
      const eventsNextYear = events.filter(e => e.edition?.year === nextYear).length
      
      console.log(`📈 Répartition par année:`)
      console.log(`   ${currentYear}: ${eventsCurrentYear} événements`)
      console.log(`   ${nextYear}: ${eventsNextYear} événements`)
    } else {
      console.log('   ⚠️ Aucun événement trouvé')
    }

  } catch (error) {
    console.error('❌ Erreur lors du test:', error)
  }
}

// Configuration des variables d'environnement pour le test
process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || ''
process.env.GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || ''

testNewQuery()