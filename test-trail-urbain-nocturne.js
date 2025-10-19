require('dotenv').config()
const axios = require('axios')

// Configuration Google Search
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID

// Configuration de la base Miles Republic
// Utiliser le client généré depuis apps/agents avec connexion directe
const path = require('path')
const agentsPath = path.join(__dirname, 'apps', 'agents')
const { PrismaClient } = require(path.join(agentsPath, 'node_modules', '@prisma', 'client'))

// Créer le client avec la bonne URL de connexion
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.MILES_REPUBLIC_DATABASE_URL
    }
  }
})

async function getEventData(eventId) {
  console.log(`🔍 Récupération des données pour l'événement ID: ${eventId}`)
  
  const event = await prisma.Event.findUnique({
    where: { id: parseInt(eventId) },
    include: {
      editions: {
        where: {
          AND: [
            { calendarStatus: 'TO_BE_CONFIRMED' },
            { status: 'LIVE' },
            { 
              year: {
                in: ['2024', '2025']
              }
            }
          ]
        },
        include: {
          races: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  })
  
  return event
}

function buildSearchQuery(event) {
  const edition = event.editions[0]
  const year = edition?.year || new Date().getFullYear().toString()
  return `"${event.name}" "${event.city}" ${year}`
}

async function performGoogleSearch(query) {
  console.log(`🔍 Recherche Google: "${query}"`)
  
  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_SEARCH_ENGINE_ID,
        q: query,
        num: 5,
        dateRestrict: 'y1'
      }
    })
    
    return response.data
  } catch (error) {
    console.error('❌ Erreur lors de la recherche Google:', error.response?.data || error.message)
    return null
  }
}

function extractDatesFromSnippets(searchResults, event) {
  const dates = []
  const currentYear = new Date().getFullYear()
  const nextYear = currentYear + 1
  
  if (!searchResults.items) return dates
  
  console.log(`📋 Analyse de ${searchResults.items.length} résultats Google:`)
  
  for (let i = 0; i < searchResults.items.length; i++) {
    const item = searchResults.items[i]
    const snippet = item.snippet.toLowerCase()
    const context = `${item.title} - ${item.snippet}`
    
    console.log(`\n📄 Résultat ${i + 1}:`)
    console.log(`   Titre: ${item.title}`)
    console.log(`   URL: ${item.link}`)
    console.log(`   Snippet: ${item.snippet}`)
    
    // Patterns de dates en français
    const datePatterns = [
      // "le 15 juin 2024", "le dimanche 16 juin 2024"
      /(?:le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi,
      // "04 janvier" (sans année)
      /(?:le )?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche )?(?:(?:le )|(?:du ))?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)(?![\d\s]*\d{4})/gi,
      // "15/06/2024", "15-06-2024"
      /(\d{1,2})[\\/\-](\d{1,2})[\\/\-](\d{4})/g,
      // "juin 2024", "en juin 2024"
      /(?:en\s+)?(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi,
      // "2024-06-15" (format ISO)
      /(\d{4})-(\d{1,2})-(\d{1,2})/g
    ]
    
    const monthNames = {
      'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
      'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12
    }
    
    for (const pattern of datePatterns) {
      let match
      while ((match = pattern.exec(snippet)) !== null) {
        try {
          let date
          let confidence = 0.6
          
          console.log(`   🎯 Pattern trouvé: "${match[0]}"`)
          
          if (pattern.source.includes('janvier|') && pattern.source.includes('\\d{4}')) {
            // Pattern avec nom de mois français et année explicite
            const day = parseInt(match[1])
            const monthName = match[2].toLowerCase()
            const year = parseInt(match[3])
            const month = monthNames[monthName]
            
            if (month && year >= currentYear && year <= nextYear + 1) {
              date = new Date(year, month - 1, day)
              confidence = 0.8
              console.log(`   ✅ Date extraite: ${date.toLocaleDateString('fr-FR')} (confiance: ${confidence})`)
            }
            
          } else if (pattern.source.includes('janvier|') && pattern.source.includes('(?![')) {
            // Pattern "04 janvier" sans année
            const day = parseInt(match[1])
            const monthName = match[2].toLowerCase()
            const month = monthNames[monthName]
            
            if (month) {
              const editionYear = event.editions[0]?.year ? parseInt(event.editions[0].year) : nextYear
              date = new Date(editionYear, month - 1, day)
              confidence = 0.75
              console.log(`   ✅ Date extraite (année inférée): ${date.toLocaleDateString('fr-FR')} (confiance: ${confidence})`)
            }
            
          } else if (pattern.source.includes('\\/\\-')) {
            // Pattern DD/MM/YYYY
            const day = parseInt(match[1])
            const month = parseInt(match[2])
            const year = parseInt(match[3])
            
            if (year >= currentYear && year <= nextYear + 1 && month >= 1 && month <= 12) {
              date = new Date(year, month - 1, day)
              confidence = 0.7
              console.log(`   ✅ Date extraite: ${date.toLocaleDateString('fr-FR')} (confiance: ${confidence})`)
            }
            
          } else if (pattern.source.includes('(\\d{4})-')) {
            // Pattern YYYY-MM-DD
            const year = parseInt(match[1])
            const month = parseInt(match[2])
            const day = parseInt(match[3])
            
            if (year >= currentYear && year <= nextYear + 1 && month >= 1 && month <= 12) {
              date = new Date(year, month - 1, day)
              confidence = 0.8
              console.log(`   ✅ Date extraite: ${date.toLocaleDateString('fr-FR')} (confiance: ${confidence})`)
            }
            
          } else {
            // Pattern mois seul
            const monthName = match[1].toLowerCase()
            const year = parseInt(match[2])
            const month = monthNames[monthName]
            
            if (month && year >= currentYear && year <= nextYear + 1) {
              date = new Date(year, month - 1, 1)
              confidence = 0.5
              console.log(`   ⚠️ Date extraite (mois seul): ${date.toLocaleDateString('fr-FR')} (confiance: ${confidence})`)
            }
          }
          
          // Vérifier que la date est valide et dans une plage raisonnable
          if (date && !isNaN(date.getTime())) {
            const now = new Date()
            const twoYearsFromNow = new Date(now.getFullYear() + 2, 11, 31)
            
            if (date >= now && date <= twoYearsFromNow) {
              dates.push({
                date,
                confidence,
                source: item.link,
                context: match[0] + ` (extrait de: "${context.substring(0, 100)}...")`
              })
            }
          }
        } catch (error) {
          console.log(`   ❌ Erreur parsing: ${error.message}`)
        }
      }
    }
  }
  
  // Supprimer les doublons et trier par confiance
  const uniqueDates = dates.filter((date, index, self) => 
    index === self.findIndex(d => d.date.getTime() === date.date.getTime())
  ).sort((a, b) => b.confidence - a.confidence)
  
  console.log(`\n📊 ${uniqueDates.length} date(s) unique(s) extraite(s):`)
  uniqueDates.forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.date.toLocaleDateString('fr-FR')} (confiance: ${d.confidence})`)
    console.log(`      Source: ${d.source}`)
    console.log(`      Contexte: ${d.context}`)
  })
  
  return uniqueDates.slice(0, 5)
}

function createDateProposals(event, extractedDates, searchResults) {
  const proposals = []
  
  if (!event.editions[0] || extractedDates.length === 0) return proposals
  
  console.log(`\n🏗️ Construction des propositions...`)
  
  // Grouper les dates extraites par date
  const dateGroups = new Map()
  
  for (const extractedDate of extractedDates) {
    const dateKey = extractedDate.date.toDateString()
    if (!dateGroups.has(dateKey)) {
      dateGroups.set(dateKey, [])
    }
    dateGroups.get(dateKey).push(extractedDate)
  }
  
  console.log(`📋 ${dateGroups.size} groupe(s) de dates:`)
  
  // Créer une proposition par date trouvée
  for (const [dateKey, datesGroup] of dateGroups.entries()) {
    const primaryDate = datesGroup[0]
    const allSources = datesGroup.map(d => ({ source: d.source, snippet: d.context }))
    
    // Calculer la confiance moyenne
    const avgConfidence = datesGroup.reduce((sum, d) => sum + d.confidence, 0) / datesGroup.length
    
    console.log(`\n   📅 Date: ${primaryDate.date.toLocaleDateString('fr-FR')}`)
    console.log(`   🎯 Confiance moyenne: ${Math.round(avgConfidence * 100)}%`)
    console.log(`   📄 ${datesGroup.length} source(s):`)
    
    datesGroup.forEach((d, i) => {
      console.log(`      ${i + 1}. ${d.source} (confiance: ${d.confidence})`)
    })
    
    // Structure de la proposition
    const changes = {
      startDate: {
        new: primaryDate.date,
        confidence: avgConfidence
      }
    }
    
    // Ajouter les courses si présentes
    if (event.editions[0].races && event.editions[0].races.length > 0) {
      changes.races = event.editions[0].races.map(race => ({
        raceId: race.id.toString(),
        raceName: race.name,
        startDate: {
          new: primaryDate.date,
          confidence: avgConfidence * 0.95
        }
      }))
      
      console.log(`   🏃 ${changes.races.length} course(s) incluse(s):`)
      changes.races.forEach(race => {
        console.log(`      - ${race.raceName} (ID: ${race.raceId})`)
      })
    }
    
    const consolidatedJustification = {
      type: 'text',
      content: `Date proposée: ${primaryDate.date.toLocaleDateString('fr-FR')} (${datesGroup.length} source(s))`,
      metadata: {
        extractedDate: primaryDate.date.toISOString(),
        confidence: avgConfidence,
        eventName: event.name,
        eventCity: event.city,
        editionYear: event.editions[0].year,
        sourcesCount: datesGroup.length,
        dateDetails: {
          date: primaryDate.date.toLocaleDateString('fr-FR'),
          confidence: Math.round(avgConfidence * 100),
          sources: allSources
        }
      }
    }
    
    proposals.push({
      type: 'EDITION_UPDATE',
      eventId: event.id.toString(),
      editionId: event.editions[0].id.toString(),
      changes,
      justification: [consolidatedJustification]
    })
  }
  
  return proposals
}

async function main() {
  try {
    console.log('🚀 Test GoogleSearchDateAgent - Trail urbain nocturne de la cité de l\'écrit')
    console.log('=' .repeat(80))
    
    // 1. Récupérer les données de l'événement
    const event = await getEventData(738)
    
    if (!event) {
      console.log('❌ Événement non trouvé')
      return
    }
    
    console.log(`\n📋 Données de l'événement:`)
    console.log(`   ID: ${event.id}`)
    console.log(`   Nom: ${event.name}`)
    console.log(`   Ville: ${event.city}`)
    console.log(`   Éditions TO_BE_CONFIRMED: ${event.editions.length}`)
    
    if (event.editions.length === 0) {
      console.log('❌ Aucune édition TO_BE_CONFIRMED trouvée')
      return
    }
    
    const edition = event.editions[0]
    console.log(`\n   Édition sélectionnée:`)
    console.log(`     ID: ${edition.id}`)
    console.log(`     Année: ${edition.year}`)
    console.log(`     Status: ${edition.calendarStatus}`)
    console.log(`     Courses: ${edition.races.length}`)
    
    edition.races.forEach((race, i) => {
      console.log(`       ${i + 1}. ${race.name} (ID: ${race.id})`)
    })
    
    // 2. Construire la requête Google
    const searchQuery = buildSearchQuery(event)
    console.log(`\n🔍 Requête Google construite: "${searchQuery}"`)
    
    // 3. Effectuer la recherche Google
    const searchResults = await performGoogleSearch(searchQuery)
    
    if (!searchResults || !searchResults.items) {
      console.log('❌ Aucun résultat Google obtenu')
      return
    }
    
    console.log(`\n📊 ${searchResults.items.length} résultat(s) Google obtenus`)
    
    // 4. Extraire les dates des snippets
    const extractedDates = extractDatesFromSnippets(searchResults, event)
    
    if (extractedDates.length === 0) {
      console.log('\n⚠️ Aucune date extraite des résultats Google')
      return
    }
    
    // 5. Créer les propositions
    const proposals = createDateProposals(event, extractedDates, searchResults)
    
    console.log(`\n🎯 ${proposals.length} proposition(s) créée(s):`)
    console.log('=' .repeat(80))
    
    proposals.forEach((proposal, i) => {
      console.log(`\n📝 Proposition ${i + 1}:`)
      console.log(`   Type: ${proposal.type}`)
      console.log(`   Event ID: ${proposal.eventId}`)
      console.log(`   Edition ID: ${proposal.editionId}`)
      console.log(`   Date proposée: ${proposal.changes.startDate.new.toLocaleDateString('fr-FR')}`)
      console.log(`   Confiance: ${Math.round(proposal.changes.startDate.confidence * 100)}%`)
      
      if (proposal.changes.races) {
        console.log(`   Courses mises à jour: ${proposal.changes.races.length}`)
        proposal.changes.races.forEach(race => {
          console.log(`     - ${race.raceName}: ${race.startDate.new.toLocaleDateString('fr-FR')} (${Math.round(race.startDate.confidence * 100)}%)`)
        })
      }
      
      console.log(`   Justification: ${proposal.justification[0].content}`)
      console.log(`   Sources: ${proposal.justification[0].metadata.sourcesCount}`)
      
      console.log(`\n   📋 Détails de la justification:`)
      console.log(JSON.stringify(proposal.justification[0].metadata, null, 2))
    })
    
  } catch (error) {
    console.error('❌ Erreur:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()