import 'dotenv/config'
import { matchCompetition } from './apps/agents/src/ffa/matcher'
import { FFACompetitionDetails, FFAScraperConfig } from './apps/agents/src/ffa/types'
import { PrismaClient as MilesPrismaClient } from './apps/node_modules/.prisma/client-miles'

const logger = {
  info: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`)
}

const config: FFAScraperConfig = {
  similarityThreshold: 0.85,
  distanceTolerancePercent: 0.1
}

async function test() {
  console.log('🧪 Test Gargantuesque\n')
  console.log('='.repeat(80))
  
  const sourceDb = new MilesPrismaClient({
    datasources: {
      db: {
        url: process.env.MILES_REPUBLIC_DATABASE_URL!
      }
    }
  })
  
  await sourceDb.$connect()
  console.log('✅ Connecté à Miles Republic\n')

  const competition: FFACompetitionDetails = {
    competition: {
      name: "Trail Decouverte Le Gargantuesque",
      city: "Saint Pierre Le Moutier",
      date: new Date('2025-11-09'),
      department: "58",
      postalCode: "58240"
    },
    races: [],
    organizerEmail: null,
    organizerWebsite: null,
    registrationUrl: null
  }

  console.log('FFA: "Trail Decouverte Le Gargantuesque" à Saint Pierre Le Moutier (09/11/2025)')
  console.log('Base: "Trail le gargantuesque" à Saint-Pierre-le-Moûtier (10/11/2025)')
  console.log('Attendu: FUZZY_MATCH ou EXACT_MATCH\n')

  const result = await matchCompetition(competition, sourceDb, config, logger)
  
  console.log('\n📊 Résultat:')
  console.log('  Type:', result.type)
  console.log('  Confidence:', result.confidence.toFixed(3))
  if (result.event) {
    console.log('  Event:', result.event.name, `(${result.event.city})`)
    console.log('  Event ID:', result.event.id)
    console.log('  Similarity:', result.event.similarity.toFixed(3))
    console.log('  Edition trouvée:', result.edition ? 'OUI' : 'NON')
  }
  
  const success = result.type !== 'NO_MATCH' && result.event?.id === 3831
  console.log('\n', success ? '✅ TEST PASSÉ - Événement 3831 trouvé !' : '❌ TEST ÉCHOUÉ')

  await sourceDb.$disconnect()
  process.exit(success ? 0 : 1)
}

test().catch(error => {
  console.error('❌ Erreur:', error)
  process.exit(1)
})
