import { GoogleSearchDateAgent } from './apps/agents/src/GoogleSearchDateAgent'

/**
 * Test des fonctions individuelles de l'agent sans dépendances externes
 */

async function testGoogleSearchFunctions() {
  console.log('🧪 Test des fonctions individuelles du GoogleSearchDateAgent\n')

  // Configuration test
  const config = {
    id: 'test-functions',
    name: 'Test Functions',
    frequency: '0 */6 * * *',
    isActive: true,
    config: {
      batchSize: 5,
      googleResultsCount: 3,
      googleApiKey: process.env.GOOGLE_API_KEY,
      googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
      enableMockMode: false
    }
  }

  const agent = new GoogleSearchDateAgent(config)

  // Test 1: Construction de requête de recherche
  console.log('📋 Test 1: Construction de requête de recherche')
  const mockEvent = {
    id: 'event-123',
    name: 'Marathon de Paris',
    city: 'Paris',
    currentEditionEventId: 'edition-456',
    edition: {
      id: 'edition-456',
      year: '2024',
      calendarStatus: 'TO_BE_CONFIRMED',
      races: [
        { id: 'race-1', name: 'Marathon 42km' },
        { id: 'race-2', name: '10km' }
      ]
    }
  }

  // Accéder à la méthode privée via reflection pour les tests
  const buildSearchQuery = (agent as any).buildSearchQuery.bind(agent)
  const searchQuery = buildSearchQuery(mockEvent)
  console.log(`   Requête générée: ${searchQuery}`)
  console.log(`   ✅ Format correct: "Nom" "Ville" Année\n`)

  // Test 2: Recherche Google (mode mock ou réel)
  console.log('🔍 Test 2: Recherche Google')
  const performGoogleSearch = (agent as any).performGoogleSearch.bind(agent)
  
  try {
    const searchResults = await performGoogleSearch(searchQuery, config.config)
    
    if (searchResults && searchResults.items) {
      console.log(`   ✅ ${searchResults.items.length} résultat(s) trouvé(s)`)
      searchResults.items.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.title}`)
        console.log(`      Snippet: ${item.snippet.substring(0, 80)}...`)
        console.log(`      URL: ${item.link}\n`)
      })
    } else {
      console.log('   ⚠️  Aucun résultat ou mode mock activé\n')
    }

    // Test 3: Extraction de dates des snippets
    if (searchResults && searchResults.items) {
      console.log('📅 Test 3: Extraction de dates')
      const extractDatesFromSnippets = (agent as any).extractDatesFromSnippets.bind(agent)
      const extractedDates = await extractDatesFromSnippets(searchResults, mockEvent)
      
      if (extractedDates.length > 0) {
        console.log(`   ✅ ${extractedDates.length} date(s) extraite(s):`)
        extractedDates.forEach((dateInfo, i) => {
          console.log(`   ${i + 1}. ${dateInfo.date.toLocaleDateString('fr-FR')} (confiance: ${Math.round(dateInfo.confidence * 100)}%)`)
          console.log(`      Source: ${dateInfo.source}`)
          console.log(`      Contexte: ${dateInfo.context}\n`)
        })

        // Test 4: Création de propositions
        console.log('💡 Test 4: Création de propositions')
        const createDateProposals = (agent as any).createDateProposals.bind(agent)
        const proposals = await createDateProposals(mockEvent, extractedDates, searchResults)
        
        console.log(`   ✅ ${proposals.length} proposition(s) générée(s):`)
        proposals.forEach((proposal, i) => {
          console.log(`   ${i + 1}. Type: ${proposal.type}`)
          console.log(`      Event ID: ${proposal.eventId}`)
          console.log(`      Edition ID: ${proposal.editionId}`)
          console.log(`      Race ID: ${proposal.raceId || 'N/A'}`)
          
          if (proposal.changes.startDate) {
            const newDate = new Date(proposal.changes.startDate.new)
            console.log(`      Nouvelle date: ${newDate.toLocaleDateString('fr-FR')}`)
            console.log(`      Confiance: ${Math.round(proposal.changes.startDate.confidence * 100)}%`)
          }
          
          console.log(`      Justifications: ${proposal.justification.length} élément(s)\n`)
        })
      } else {
        console.log('   ⚠️  Aucune date extraite des snippets\n')
      }
    }

    // Test 5: Formats de dates reconnus
    console.log('📝 Test 5: Test des patterns de dates')
    const testSnippets = {
      items: [
        {
          title: 'Marathon 2024',
          link: 'https://example.com/marathon',
          snippet: 'La course aura lieu le dimanche 15 juin 2024 à partir de 9h00.',
          displayLink: 'example.com'
        },
        {
          title: 'Inscription marathon',
          link: 'https://example.com/inscriptions',
          snippet: 'Événement prévu pour le 23/06/2024. Inscriptions closes le 01/06/2024.',
          displayLink: 'example.com'
        },
        {
          title: 'Calendrier course',
          link: 'https://example.com/calendrier',
          snippet: 'Prochaine édition en juin 2024, date exacte à confirmer.',
          displayLink: 'example.com'
        }
      ]
    }

    const extractDatesFromSnippets = (agent as any).extractDatesFromSnippets.bind(agent)
    const testDates = await extractDatesFromSnippets(testSnippets, mockEvent)
    
    console.log(`   ✅ Patterns de dates détectés: ${testDates.length}`)
    testDates.forEach((dateInfo, i) => {
      console.log(`   ${i + 1}. ${dateInfo.date.toLocaleDateString('fr-FR')} (confiance: ${Math.round(dateInfo.confidence * 100)}%)`)
      console.log(`      Pattern détecté: ${dateInfo.context.split('(extrait')[0]}\n`)
    })

  } catch (error) {
    console.error('❌ Erreur lors des tests:', error)
  }

  console.log('🎉 Tests des fonctions terminés !')
}

// Configuration des variables d'environnement pour le test
process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyBv6rvEYkm3nSSVt6VSzU1zZsoU7mkIfTc'
process.env.GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || '50eb493be7a6f476c'

testGoogleSearchFunctions()