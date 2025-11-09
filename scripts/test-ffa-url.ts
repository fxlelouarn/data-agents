/**
 * Script de test pour parser une URL FFA spécifique
 * 
 * Usage:
 *   npm run test:ffa-url <url>
 * 
 * Exemple:
 *   npm run test:ffa-url https://www.athle.fr/competitions/802846250846463840409834305840586837
 */

import axios from 'axios'
import { parseCompetitionDetails } from '../apps/agents/src/ffa/parser'
import { FFACompetition } from '../apps/agents/src/ffa/types'

async function testFFAUrl(url: string) {
  console.log('🔍 Test du parser FFA')
  console.log('URL:', url)
  console.log('')

  try {
    // Étape 1: Fetch du HTML
    console.log('📥 Téléchargement du HTML...')
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    console.log('✅ HTML téléchargé')
    console.log(`   Taille: ${(response.data.length / 1024).toFixed(2)} KB`)
    console.log('')

    // Étape 2: Extraire les infos de base depuis l'URL et le HTML
    console.log('🔎 Extraction des informations de base...')
    
    // Extraire le ffaId depuis l'URL
    const ffaIdMatch = url.match(/competitions\/(\d+)/)
    const ffaId = ffaIdMatch ? ffaIdMatch[1] : 'unknown'
    
    // Parser le HTML pour extraire la date de l'événement
    const dateMatch = response.data.match(/<p class="body-small text-dark-grey">(\d{1,2})\s+(?:au\s+(\d{1,2})\s+)?([A-Za-zéèû]+)\s+(\d{4})<\/p>/)
    let eventDate = new Date()
    
    if (dateMatch) {
      const [_, startDay, endDay, monthName, year] = dateMatch
      const monthsMap: Record<string, number> = {
        'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
        'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
        'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11
      }
      const month = monthsMap[monthName.toLowerCase()]
      if (month !== undefined) {
        eventDate = new Date(Date.UTC(parseInt(year), month, parseInt(startDay)))
      }
    }
    
    // Créer un objet competition minimal pour le parser
    const competition: FFACompetition = {
      ffaId,
      name: 'Compétition de test',
      date: eventDate,
      city: '',
      department: '',
      ligue: '',
      level: '',
      type: '',
      detailUrl: url
    }
    
    console.log('   ID FFA:', ffaId)
    console.log('   Date extraite:', eventDate.toISOString())
    console.log('')

    // Étape 3: Parser le HTML
    console.log('🧪 Parsing du HTML...')
    const details = parseCompetitionDetails(response.data, competition)
    
    console.log('✅ Parsing terminé')
    console.log('')

    // Étape 4: Afficher les résultats
    console.log('📊SRÉSULTATS')
    console.log('═══════════════════════════════════════════════════')
    console.log('')
    
    console.log('⚠️  NOTE: Ce script ne fait PAS la conversion timezone Europe/Paris → UTC')
    console.log('   Le vrai FFA Scraper soustrait l\'offset pour avoir un vrai UTC.')
    console.log('   Ex: 28 fév 2026 00:00 CET = 2026-02-27T23:00:00.000Z (pas 2026-02-28T00:00:00.000Z)')
    console.log('')
    
    console.log('📅 DATES (format simplifié sans conversion timezone)')
    console.log('   Start Date:', details.startDate.toISOString())
    console.log('   End Date:  ', details.endDate.toISOString())
    console.log('   Multi-jours:', details.startDate.getTime() !== details.endDate.getTime() ? 'OUI ✅' : 'NON')
    console.log('')
    
    if (details.organizerName || details.organizerEmail || details.organizerPhone) {
      console.log('👥 ORGANISATEUR')
      if (details.organizerName) console.log('   Nom:', details.organizerName)
      if (details.organizerEmail) console.log('   Email:', details.organizerEmail)
      if (details.organizerPhone) console.log('   Téléphone:', details.organizerPhone)
      if (details.organizerWebsite) console.log('   Site web:', details.organizerWebsite)
      console.log('')
    }
    
    console.log(`🏃 COURSES (${details.races.length})`)
    if (details.races.length === 0) {
      console.log('   ⚠️  Aucune course trouvée')
    } else {
      details.races.forEach((race, index) => {
        console.log(`   ${index + 1}. ${race.name}`)
        if (race.raceDate) console.log(`      Date: ${race.raceDate}`)
        if (race.startTime) console.log(`      Heure: ${race.startTime}`)
        if (race.distance) console.log(`      Distance: ${race.distance} m (${(race.distance / 1000).toFixed(1)} km)`)
        if (race.positiveElevation) console.log(`      D+: ${race.positiveElevation} m`)
        console.log(`      Type: ${race.type}`)
        console.log('')
      })
    }
    
    console.log('═══════════════════════════════════════════════════')
    console.log('')
    
    // Afficher le JSON complet si souhaité
    console.log('📄 JSON COMPLET')
    console.log(JSON.stringify(details, null, 2))
    
  } catch (error) {
    console.error('❌ ERREUR')
    if (axios.isAxiosError(error)) {
      console.error('   Type: Erreur HTTP')
      console.error('   Status:', error.response?.status)
      console.error('   Message:', error.message)
    } else if (error instanceof Error) {
      console.error('   Message:', error.message)
      console.error('   Stack:', error.stack)
    } else {
      console.error('   Erreur inconnue:', error)
    }
    process.exit(1)
  }
}

// Récupérer l'URL depuis les arguments
const url = process.argv[2]

if (!url) {
  console.error('❌ URL manquante')
  console.error('')
  console.error('Usage:')
  console.error('  npm run test:ffa-url <url>')
  console.error('')
  console.error('Exemple:')
  console.error('  npm run test:ffa-url https://www.athle.fr/competitions/802846250846463840409834305840586837')
  process.exit(1)
}

if (!url.includes('athle.fr/competitions/')) {
  console.error('❌ URL invalide')
  console.error('   L\'URL doit être une page de compétition FFA')
  console.error('   Format attendu: https://www.athle.fr/competitions/XXXXXXXXX')
  process.exit(1)
}

testFFAUrl(url)
