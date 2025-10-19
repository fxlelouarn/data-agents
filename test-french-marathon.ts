import { GoogleSearchDateAgent } from './apps/agents/src/GoogleSearchDateAgent'

async function testFrenchMarathon() {
  console.log('🇫🇷 Test avec événement français - Marathon de Paris\n')

  const config = {
    id: 'test-french-marathon',
    name: 'Test Marathon de Paris',
    frequency: '0 */6 * * *',
    isActive: true,
    config: {
      batchSize: 5,
      googleResultsCount: 5,
      googleApiKey: process.env.GOOGLE_API_KEY,
      googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
      enableMockMode: false
    }
  }

  const agent = new GoogleSearchDateAgent(config)

  // Événement français réel
  const marathonEvent = {
    id: 'event-marathon-paris',
    name: 'Marathon de Paris',
    city: 'Paris', 
    currentEditionEventId: 'edition-marathon-2026',
    edition: {
      id: 'edition-marathon-2026',
      year: '2026',
      calendarStatus: 'TO_BE_CONFIRMED',
      races: [
        { id: 'race-marathon', name: 'Marathon 42km' }
      ]
    }
  }

  // Test avec recherche plus spécifique en français
  const buildSearchQuery = (agent as any).buildSearchQuery.bind(agent)
  const performGoogleSearch = (agent as any).performGoogleSearch.bind(agent)
  const extractDatesFromSnippets = (agent as any).extractDatesFromSnippets.bind(agent)

  try {
    // 1. Recherche générale
    console.log('🔍 Recherche générale')
    let searchQuery = buildSearchQuery(marathonEvent)
    console.log(`Requête: ${searchQuery}`)
    
    let results = await performGoogleSearch(searchQuery, config.config)
    console.log(`Résultats: ${results?.items?.length || 0}\n`)

    // 2. Recherche plus spécifique avec date 2026
    console.log('🔍 Recherche spécifique avec "date 2026"')
    searchQuery = `"Marathon de Paris" 2026 date`
    results = await performGoogleSearch(searchQuery, config.config)
    
    if (results?.items) {
      console.log(`✅ ${results.items.length} résultat(s) trouvé(s):`)
      results.items.forEach((item, i) => {
        console.log(`${i + 1}. ${item.title}`)
        console.log(`   URL: ${item.link}`)
        console.log(`   Snippet: ${item.snippet}`)
        console.log('')
      })

      // Test d'extraction de dates sur ces résultats
      const dates = await extractDatesFromSnippets(results, marathonEvent)
      console.log(`📅 Dates extraites: ${dates.length}`)
      
      dates.forEach((dateInfo, i) => {
        console.log(`${i + 1}. ${dateInfo.date.toLocaleDateString('fr-FR')} (confiance: ${Math.round(dateInfo.confidence * 100)}%)`)
        console.log(`   Context: ${dateInfo.context}`)
        console.log(`   Source: ${dateInfo.source}\n`)
      })
    }

    // 3. Test avec snippets connus contenant des dates françaises futures
    console.log('📝 Test avec patterns français manuels')
    const frenchSnippets = {
      items: [
        {
          title: 'Marathon de Paris 2026',
          link: 'https://marathon.paris.com',
          snippet: 'Le Marathon de Paris 2026 aura lieu le dimanche 12 avril 2026. Inscriptions ouvertes.',
          displayLink: 'marathon.paris.com'
        },
        {
          title: 'Calendrier Marathon',
          link: 'https://calendrier.com',
          snippet: 'Prochaine édition prévue pour le 19/04/2026. Plus d\'infos bientôt.',
          displayLink: 'calendrier.com'
        },
        {
          title: 'Course Paris',
          link: 'https://course.paris',
          snippet: 'La course se déroulera en avril 2026. Date exacte: 2026-04-12.',
          displayLink: 'course.paris'
        },
        {
          title: 'Ultra Trail Mont-Blanc',
          link: 'https://utmb.world',
          snippet: 'L\'UTMB 2026 est prévu le vendredi 28 août 2026. Inscriptions ouvertes jusqu\'au 15/02/2026.',
          displayLink: 'utmb.world'
        }
      ]
    }

    const frenchDates = await extractDatesFromSnippets(frenchSnippets, marathonEvent)
    console.log(`✅ Dates extraites des snippets français: ${frenchDates.length}`)
    
    frenchDates.forEach((dateInfo, i) => {
      console.log(`${i + 1}. ${dateInfo.date.toLocaleDateString('fr-FR')} (confiance: ${Math.round(dateInfo.confidence * 100)}%)`)
      console.log(`   Pattern: ${dateInfo.context.split('(extrait')[0]}`)
      console.log(`   Source: ${dateInfo.source}\n`)
    })

    // 4. Test de génération de propositions si on a des dates
    if (frenchDates.length > 0) {
      console.log('💡 Test de génération de propositions')
      const createDateProposals = (agent as any).createDateProposals.bind(agent)
      const proposals = await createDateProposals(marathonEvent, frenchDates, frenchSnippets)
      
      console.log(`✅ ${proposals.length} proposition(s) générée(s):`)
      proposals.forEach((prop, i) => {
        console.log(`${i + 1}. ${prop.type} pour ${prop.eventId}`)
        if (prop.changes.startDate) {
          console.log(`   Date proposée: ${new Date(prop.changes.startDate.new).toLocaleDateString('fr-FR')}`)
          console.log(`   Confiance: ${Math.round(prop.changes.startDate.confidence * 100)}%`)
        }
        console.log(`   Justifications: ${prop.justification.length} élément(s)\n`)
      })
    }

  } catch (error) {
    console.error('❌ Erreur:', error)
  }

  console.log('🎯 Test français terminé !')
}

// Variables d'environnement
process.env.GOOGLE_API_KEY = 'AIzaSyBv6rvEYkm3nSSVt6VSzU1zZsoU7mkIfTc'
process.env.GOOGLE_SEARCH_ENGINE_ID = '50eb493be7a6f476c'

testFrenchMarathon()