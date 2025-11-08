/**
 * Test du matching optimisé v2.1 - Bonus Département
 * 
 * Cas de test :
 * 1. Trail des Ducs - Ville limitrophe (Talant vs Dijon) - Même département 21
 * 2. Diab'olo Run - Ville limitrophe (Saint-Apollinaire vs Dijon) - Même département 21
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
  similarityThreshold: 0.75,
  distanceTolerancePercent: 0.1
} as FFAScraperConfig

async function testMatching() {
  console.log('🧪 Test du matching optimisé v2.1 - Bonus Département\n')
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

  // D'abord, vérifions que l'événement existe dans la base
  console.log('\n' + '='.repeat(80))
  console.log('VÉRIFICATION : Recherche du "Trail des Ducs" dans la base')
  console.log('='.repeat(80))
  
  const trailDesDucs = await sourceDb.event.findMany({
    where: {
      name: {
        contains: 'Trail des Ducs',
        mode: 'insensitive'
      }
    },
    include: {
      editions: {
        select: {
          id: true,
          year: true,
          startDate: true
        },
        orderBy: {
          year: 'desc'
        },
        take: 3
      }
    }
  })

  if (trailDesDucs.length > 0) {
    console.log(`\n✅ Trouvé ${trailDesDucs.length} événement(s) correspondant:\n`)
    trailDesDucs.forEach((event, i) => {
      console.log(`${i+1}. ID: ${event.id}`)
      console.log(`   Nom: "${event.name}"`)
      console.log(`   Ville: ${event.city}`)
      console.log(`   Département: ${event.countrySubdivisionDisplayCodeLevel2} (${event.countrySubdivisionNameLevel2})`)
      console.log(`   Éditions récentes: ${event.editions.map(e => e.year).join(', ')}`)
      console.log('')
    })
  } else {
    console.log('\n❌ Aucun événement "Trail des Ducs" trouvé dans la base')
  }

  // === TEST 1 : Trail des Ducs (ville limitrophe Valentigney vs Montbéliard) ===
  console.log('\n' + '='.repeat(80))
  console.log('TEST 1 : Trail des Ducs - Ville limitrophe avec bonus département')
  console.log('='.repeat(80))
  console.log('FFA: "Trail Des Ducs" à Valentigney (dept: 25)')
  console.log('Base: "Trail des ducs" à Montbéliard (dept: 25)')
  console.log('Attendu: EXACT_MATCH ou FUZZY_MATCH avec bonus département (+0.15)')
  console.log('Proposition réelle: cmhnkfo1m047h4m7li0tkanwr\n')

  const trailDesDucsCompetition: FFACompetitionDetails = {
    competition: {
      ffaId: '296590',
      name: "Trail Des Ducs",
      city: "Valentigney",
      date: new Date('2025-11-16'),  // Date réelle de la compétition
      department: "25",  // Doubs
      ligue: "BFC",
      level: "Départemental",
      type: "Trail",
      detailUrl: "https://www.athle.fr/competitions/807846405849270855125843652831383828"
    },
    races: [
      {
        name: '15/11 - 5 km - Course HS non officielle',
        type: 'running',
        distance: 5000,
        positiveElevation: 150
      },
      {
        name: '15/11 16:30 - 15 km nocturne - Trail XXS',
        type: 'trail',
        distance: 12000,
        positiveElevation: 200
      },
      {
        name: '16/11 09:00 - 40 km - Trail S',
        type: 'trail',
        distance: 40000,
        positiveElevation: 1500
      },
      {
        name: '16/11 09:45 - 25 km - Trail XS',
        type: 'trail',
        distance: 25000,
        positiveElevation: 700
      },
      {
        name: '16/11 10:15 - Marche nordique - MN Label Depart. Loisir/Initiation',
        type: 'running',
        distance: 10000
      }
    ],
    organizerEmail: 'president@paysdemontbeliard-triathlon.org',
    organizerWebsite: 'https://traildesducs25.alwaysdata.net/'
  }

  const trailResult = await matchCompetition(trailDesDucsCompetition, sourceDb, config, logger)
  
  console.log('\n📊 Résultat Trail des Ducs:')
  console.log('  Type:', trailResult.type)
  console.log('  Confidence:', trailResult.confidence.toFixed(3))
  if (trailResult.event) {
    console.log('  Event ID:', trailResult.event.id)
    console.log('  Event:', trailResult.event.name, `(${trailResult.event.city})`)
    console.log('  Similarity:', trailResult.event.similarity.toFixed(3))
    console.log('  Edition trouvée:', trailResult.edition ? `OUI (${trailResult.edition.year})` : 'NON')
  }
  
  const trailSuccess = trailResult.type !== 'NO_MATCH' && trailResult.confidence >= 0.75
  console.log('\n', trailSuccess ? '✅ TEST PASSÉ' : '❌ TEST ÉCHOUÉ')
  console.log('  Bonus département appliqué:', trailResult.confidence >= 0.75 && trailResult.event?.similarity ? 'OUI (détecté via même dept)' : 'Peut-être')

  // === TEST 2 : Diab'olo Run (ville limitrophe avec même département) ===
  console.log('\n' + '='.repeat(80))
  console.log('TEST 2 : Diab\'olo Run - Ville limitrophe avec bonus département')
  console.log('='.repeat(80))
  console.log('FFA: "Diab\'olo Run" à Saint-Apollinaire (dept: 21)')
  console.log('Base: "Diab\'olo run" à Dijon (dept: 21)')
  console.log('Attendu: EXACT_MATCH avec bonus département (+0.15)\n')

  const diabolo: FFACompetitionDetails = {
    competition: {
      ffaId: '67890',
      name: "Diab'olo Run",
      city: "Saint-Apollinaire",
      date: new Date('2025-11-24'),  // Édition réelle: 23-24 novembre 2025
      department: "21",  // Côte-d'Or
      ligue: "BFC",
      level: "Départemental",
      type: "Running",
      detailUrl: "https://www.ffa.com/..."
    },
    races: [],
    organizerEmail: null,
    organizerWebsite: null
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
  
  const diaboloSuccess = diaboloResult.type !== 'NO_MATCH' && diaboloResult.confidence >= 0.9
  console.log('\n', diaboloSuccess ? '✅ TEST PASSÉ' : '❌ TEST ÉCHOUÉ')
  console.log('  Bonus département appliqué:', diaboloResult.confidence >= 0.95 ? 'OUI' : 'Peut-être')

  // === RÉSUMÉ ===
  console.log('\n' + '='.repeat(80))
  console.log('📊 RÉSUMÉ DES TESTS v2.1')
  console.log('='.repeat(80))
  console.log('Test 1 (Trail des Ducs - bonus département):', trailSuccess ? '✅ PASSÉ' : '❌ ÉCHOUÉ')
  console.log('Test 2 (Diab\'olo - bonus département):', diaboloSuccess ? '✅ PASSÉ' : '❌ ÉCHOUÉ')
  
  const allSuccess = trailSuccess && diaboloSuccess
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
