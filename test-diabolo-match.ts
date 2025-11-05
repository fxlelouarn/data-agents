/**
 * Script de test pour vérifier que le matching trouve bien le Diab'olo Run
 * malgré la différence de ville (Saint-Apollinaire vs Dijon)
 */

import { calculateSimilarity } from './apps/agents/src/ffa/matcher'

async function testDiaboloMatch() {
  const { PrismaClient } = await import('@prisma/client')
  const sourceDb = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgresql://fx@localhost:5432/peyce'
      }
    }
  })

  try {
    console.log('🔍 Test de matching pour Diab\'olo Run\n')
    
    // Données de la compétition FFA
    const ffaName = "Diab'olo Run"
    const ffaCity = "Saint Apollinaire"
    const ffaDate = new Date('2025-11-30')
    
    console.log('📋 Données FFA:')
    console.log(`   Nom: ${ffaName}`)
    console.log(`   Ville: ${ffaCity}`)
    console.log(`   Date: ${ffaDate.toISOString().split('T')[0]}\n`)
    
    // Import dynamique de findCandidateEvents
    const { findCandidateEvents } = await import('./apps/agents/src/ffa/matcher')
    
    // Rechercher les candidats
    const normalizedName = ffaName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
    const normalizedCity = ffaCity.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
    
    const candidates = await findCandidateEvents(
      normalizedName,
      normalizedCity,
      ffaDate,
      sourceDb
    )
    
    console.log(`✅ Trouvé ${candidates.length} candidat(s):\n`)
    
    for (const candidate of candidates) {
      const nameSimilarity = calculateSimilarity(
        ffaName.toLowerCase(),
        candidate.name.toLowerCase()
      )
      const citySimilarity = calculateSimilarity(
        ffaCity.toLowerCase(),
        candidate.city.toLowerCase()
      )
      
      console.log(`📌 ${candidate.name} (${candidate.city})`)
      console.log(`   ID: ${candidate.id}`)
      console.log(`   Similarité nom: ${(nameSimilarity * 100).toFixed(1)}%`)
      console.log(`   Similarité ville: ${(citySimilarity * 100).toFixed(1)}%`)
      console.log(`   Éditions: ${candidate.editions?.map(e => e.year).join(', ') || 'aucune'}\n`)
    }
    
    // Vérifier si le bon événement (ID 10172) est trouvé
    const foundDiabolo = candidates.find(c => c.id === '10172')
    
    if (foundDiabolo) {
      console.log('✅ SUCCESS: L\'événement Diab\'olo Run (ID 10172) a été trouvé!')
    } else {
      console.log('❌ FAIL: L\'événement Diab\'olo Run (ID 10172) n\'a PAS été trouvé')
      console.log('   Les améliorations du matching n\'ont pas suffi.')
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error)
  } finally {
    await sourceDb.$disconnect()
  }
}

testDiaboloMatch()
