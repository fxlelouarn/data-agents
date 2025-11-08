/**
 * Test du matching optimisé v2.0
 * 
 * Cas de test :
 * 1. Diab'olo Run - Ville limitrophe (Saint-Apollinaire vs Dijon)
 * 2. Ekiden Nevers Marathon - Ville différente (Nevers vs Magny-Cours)
 */

import 'dotenv/config'
import { matchCompetition } from './apps/agents/src/ffa/matcher'
import { FFACompetitionDetails, FFAScraperConfig } from './apps/agents/src/ffa/types'
import { PrismaClient as MilesPrismaClient } from './apps/node_modules/.prisma/client-miles'

// Logger simple
const logger = {
  info: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`)
}

// Config agent FFA
const config: FFAScraperConfig = {
  similarityThreshold: 0.85,
  distanceTolerancePercent: 0.1
}

async function testMatching() {
  console.log('🧪 Test du matching optimisé v2.0\n')
  console.log('='.repeat(80))
  
  // Connexion à Miles Republic (client Prisma généré depuis miles-republic.prisma)
  const sourceDb = new MilesPrismaClient({
    datasources: {
      db: {
        url: process.env.MILES_REPUBLIC_DATABASE_URL!
      }
    }
  })
  
  await sourceDb.$connect()
  console.log('✅ Connecté à Miles Republic\n')

  // === TEST 1 : Diab'olo Run (ville limitrophe) ===
  console.log('\n' + '='.repeat(80))
  console.log('TEST 1 : Diab\'olo Run - Ville limitrophe')
  console.log('='.repeat(80))
  console.log('FFA: "Diab\'olo Run" à Saint-Apollinaire')
  console.log('Base: "Diab\'olo run" à Dijon')
  console.log('Attendu: EXACT_MATCH ou FUZZY_MATCH avec score > 0.8\n')

  const diabolo: FFACompetitionDetails = {
    competition: {
      name: "Diab'olo Run",
      city: "Saint-Apollinaire",
      date: new Date('2025-11-24'),  // Édition réelle: 23-24 novembre 2025
      department: "21",
      postalCode: "21000"
    },
    races: [],
    organizerEmail: null,
    organizerWebsite: null,
    registrationUrl: null
  }

  const diaboloResult = await matchCompetition(diabolo, sourceDb, config, logger)
  
  console.log('\n📊 Résultat Diab\'olo Run:')
  console.log('  Type:', diaboloResult.type)
  console.log('  Confidence:', diaboloResult.confidence.toFixed(3))
  if (diaboloResult.event) {
    console.log('  Event:', diaboloResult.event.name, `(${diaboloResult.event.city})`)
    console.log('  Similarity:', diaboloResult.event.similarity.toFixed(3))
    console.log('  Edition trouvée:', diaboloResult.edition ? 'OUI' : 'NON')
  }
  
  const diaboloSuccess = diaboloResult.type !== 'NO_MATCH' && diaboloResult.confidence >= 0.8
  console.log('\n', diaboloSuccess ? '✅ TEST PASSÉ' : '❌ TEST ÉCHOUÉ')

  // === TEST 2 : Ekiden Nevers Marathon (ville différente, date proche) ===
  console.log('\n' + '='.repeat(80))
  console.log('TEST 2 : Ekiden Nevers Marathon - Ville différente')
  console.log('='.repeat(80))
  console.log('FFA: "Nevers Marathon" à Nevers (06/04/2025)')
  console.log('Base: "Ekiden Nevers Marathon" à Magny-Cours (22/11/2025)')
  console.log('Attendu: NO_MATCH (fenêtre temporelle dépassée) OU FUZZY_MATCH si date ajustée\n')

  const ekiden: FFACompetitionDetails = {
    competition: {
      name: "Nevers Marathon",
      city: "Nevers",
      date: new Date('2025-04-06'),
      department: "58",
      postalCode: "58000"
    },
    races: [],
    organizerEmail: null,
    organizerWebsite: null,
    registrationUrl: null
  }

  const ekidenResult = await matchCompetition(ekiden, sourceDb, config, logger)
  
  console.log('\n📊 Résultat Ekiden Nevers:')
  console.log('  Type:', ekidenResult.type)
  console.log('  Confidence:', ekidenResult.confidence.toFixed(3))
  if (ekidenResult.event) {
    console.log('  Event:', ekidenResult.event.name, `(${ekidenResult.event.city})`)
    console.log('  Similarity:', ekidenResult.event.similarity.toFixed(3))
    console.log('  Edition trouvée:', ekidenResult.edition ? 'OUI' : 'NON')
  } else {
    console.log('  Aucun match trouvé (normal si fenêtre temporelle dépassée)')
  }

  // === TEST 3 : Ekiden avec date ajustée (même année) ===
  console.log('\n' + '='.repeat(80))
  console.log('TEST 3 : Ekiden Nevers Marathon - Date ajustée dans la fenêtre')
  console.log('='.repeat(80))
  console.log('FFA: "Nevers Marathon" à Nevers (15/11/2025)')
  console.log('Base: "Ekiden Nevers Marathon" à Magny-Cours (22/11/2025)')
  console.log('Attendu: FUZZY_MATCH avec score > 0.7 malgré ville différente\n')

  const ekidenAdjusted: FFACompetitionDetails = {
    competition: {
      name: "Nevers Marathon",
      city: "Nevers",
      date: new Date('2025-11-15'),
      department: "58",
      postalCode: "58000"
    },
    races: [],
    organizerEmail: null,
    organizerWebsite: null,
    registrationUrl: null
  }

  const ekidenAdjustedResult = await matchCompetition(ekidenAdjusted, sourceDb, config, logger)
  
  console.log('\n📊 Résultat Ekiden Nevers (date ajustée):')
  console.log('  Type:', ekidenAdjustedResult.type)
  console.log('  Confidence:', ekidenAdjustedResult.confidence.toFixed(3))
  if (ekidenAdjustedResult.event) {
    console.log('  Event:', ekidenAdjustedResult.event.name, `(${ekidenAdjustedResult.event.city})`)
    console.log('  Similarity:', ekidenAdjustedResult.event.similarity.toFixed(3))
    console.log('  Edition trouvée:', ekidenAdjustedResult.edition ? 'OUI' : 'NON')
  }
  
  const ekidenSuccess = ekidenAdjustedResult.type !== 'NO_MATCH' && ekidenAdjustedResult.confidence >= 0.7
  console.log('\n', ekidenSuccess ? '✅ TEST PASSÉ' : '❌ TEST ÉCHOUÉ')

  // === RÉSUMÉ ===
  console.log('\n' + '='.repeat(80))
  console.log('📊 RÉSUMÉ DES TESTS')
  console.log('='.repeat(80))
  console.log('Test 1 (Diab\'olo - ville limitrophe):', diaboloSuccess ? '✅ PASSÉ' : '❌ ÉCHOUÉ')
  console.log('Test 2 (Ekiden - date ajustée):', ekidenSuccess ? '✅ PASSÉ' : '❌ ÉCHOUÉ')
  
  const allSuccess = diaboloSuccess && ekidenSuccess
  console.log('\n' + (allSuccess ? '✅ TOUS LES TESTS PASSÉS' : '❌ CERTAINS TESTS ONT ÉCHOUÉ'))

  // Déconnexion
  await sourceDb.$disconnect()
  process.exit(allSuccess ? 0 : 1)
}

// Exécution
testMatching().catch(error => {
  console.error('❌ Erreur lors des tests:', error)
  process.exit(1)
})
