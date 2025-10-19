import { GoogleSearchDateAgent } from './apps/agents/src/GoogleSearchDateAgent'

async function testDateConditions() {
  console.log('🔬 Test isolé des conditions d\'extraction de dates\n')

  // Configuration simple
  const config = {
    id: 'test-conditions',
    name: 'Test Conditions',
    frequency: '0 */6 * * *',
    isActive: true,
    config: { batchSize: 1, googleResultsCount: 1 }
  }

  const agent = new GoogleSearchDateAgent(config)

  // Événement test
  const event = {
    id: 'test-event',
    name: 'Marathon Test',
    city: 'Paris',
    currentEditionEventId: 'edition-test',
    edition: {
      id: 'edition-test',
      year: '2025',
      calendarStatus: 'TO_BE_CONFIRMED',
      races: []
    }
  }

  // Snippets de test avec dates futures claires
  const testSnippets = {
    items: [
      {
        title: 'Marathon 2026',
        link: 'https://test.com',
        snippet: 'Le marathon aura lieu le dimanche 12 avril 2026.',
        displayLink: 'test.com'
      }
    ]
  }

  console.log('📅 Date actuelle:', new Date().toLocaleDateString('fr-FR'))
  console.log('📅 Date test dans snippet: 12 avril 2026\n')

  // Accéder à la méthode privée
  const extractDatesFromSnippets = (agent as any).extractDatesFromSnippets.bind(agent)

  try {
    const extractedDates = await extractDatesFromSnippets(testSnippets, event)
    console.log(`✅ Dates extraites: ${extractedDates.length}`)
    
    if (extractedDates.length > 0) {
      extractedDates.forEach((dateInfo, i) => {
        console.log(`${i + 1}. ${dateInfo.date.toLocaleDateString('fr-FR')}`)
        console.log(`   Confiance: ${Math.round(dateInfo.confidence * 100)}%`)
        console.log(`   Contexte: ${dateInfo.context}`)
        console.log(`   Source: ${dateInfo.source}\n`)
      })
    } else {
      console.log('❌ Aucune date extraite')
      
      // Debug: testons manuellement les conditions
      console.log('\n🔍 Debug des conditions:')
      
      const snippet = testSnippets.items[0].snippet.toLowerCase()
      console.log(`Snippet en minuscules: "${snippet}"`)
      
      // Test du pattern manuel
      const pattern = /(?:le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi
      const match = pattern.exec(snippet)
      
      if (match) {
        console.log(`✅ Pattern matché: "${match[0]}"`)
        console.log(`   Groupes: [${match.slice(1).join(', ')}]`)
        
        const day = parseInt(match[1])
        const monthName = match[2].toLowerCase()
        const year = parseInt(match[3])
        
        console.log(`   Day: ${day}, Month: ${monthName}, Year: ${year}`)
        
        const monthNames = {
          'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
          'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12
        }
        
        const month = monthNames[monthName as keyof typeof monthNames]
        console.log(`   Month number: ${month}`)
        
        const currentYear = new Date().getFullYear()
        const nextYear = currentYear + 1
        console.log(`   Current year: ${currentYear}, Next year: ${nextYear}`)
        console.log(`   Year condition (${year} >= ${currentYear} && ${year} <= ${nextYear + 1}): ${year >= currentYear && year <= nextYear + 1}`)
        
        if (month && year >= currentYear && year <= nextYear + 1) {
          const date = new Date(year, month - 1, day)
          console.log(`   Date construite: ${date.toLocaleDateString('fr-FR')}`)
          console.log(`   Date valide: ${!isNaN(date.getTime())}`)
          
          const now = new Date()
          const twoYearsFromNow = new Date(now.getFullYear() + 2, 11, 31)
          console.log(`   Date actuelle: ${now.toLocaleDateString('fr-FR')}`)
          console.log(`   Limite future: ${twoYearsFromNow.toLocaleDateString('fr-FR')}`)
          console.log(`   Condition temporelle (${date.toLocaleDateString('fr-FR')} >= ${now.toLocaleDateString('fr-FR')} && ${date.toLocaleDateString('fr-FR')} <= ${twoYearsFromNow.toLocaleDateString('fr-FR')}): ${date >= now && date <= twoYearsFromNow}`)
        }
        
      } else {
        console.log('❌ Aucun match du pattern')
      }
    }

  } catch (error) {
    console.error('❌ Erreur:', error)
  }
}

testDateConditions()