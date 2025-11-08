import { PrismaClient as MilesPrismaClient } from './apps/node_modules/.prisma/client-miles';
import { findCandidateEvents, matchCompetition } from './apps/agents/src/ffa/matcher';

const sourceDb = new MilesPrismaClient({
  datasources: {
    db: {
      url: process.env.MILES_REPUBLIC_DATABASE_URL || 'postgresql://fx@localhost:5432/peyce'
    }
  }
});

async function testMatching() {
  try {
    console.log('=== TEST 1: Diab\'olo Run (ville FFA: Saint-Apollinaire, base: Dijon) ===');
    const diabCompetition = {
      competition: {
        name: "Diab'olo Run",
        city: "Saint Apollinaire",  // Vraie ville selon FFA, mais base a Dijon
        date: new Date('2025-11-30'),
        ffaId: '298341',
        level: 'Départemental'
      },
      races: [],
      organizerEmail: 'aspttdijonathle@gmail.com',
      organizerWebsite: 'http://aspttdijon.athle.com'
    };
    
    const diabResult = await matchCompetition(
      diabCompetition,
      sourceDb,
      { similarityThreshold: 0.85 },
      {
        info: (...args: any[]) => console.log('[INFO]', ...args),
        error: (...args: any[]) => console.error('[ERROR]', ...args)
      }
    );
    
    console.log('\n✅ Résultat:');
    console.log('  Type:', diabResult.type);
    console.log('  Event:', diabResult.event?.id, '-', diabResult.event?.name);
    console.log('  City:', diabResult.event ? 'dans la base' : 'N/A');
    console.log('  Edition:', diabResult.edition ? `${diabResult.edition.id} (${diabResult.edition.year})` : 'N/A');
    console.log('  Confidence:', diabResult.confidence);
    
    console.log('\n=== TEST 2: Nevers Marathon (Ekiden) ===');
    const ekindenCompetition = {
      competition: {
        name: "Nevers Marathon By Nexson",
        city: "Nevers",
        date: new Date('2025-04-06'),
        ffaId: '123456',
        level: 'National'
      },
      races: [],
      organizerEmail: null,
      organizerWebsite: null
    };
    
    const ekidenResult = await matchCompetition(
      ekindenCompetition,
      sourceDb,
      { similarityThreshold: 0.85 },
      {
        info: (...args: any[]) => console.log('[INFO]', ...args),
        error: (...args: any[]) => console.error('[ERROR]', ...args)
      }
    );
    
    console.log('\n✅ Résultat:');
    console.log('  Type:', ekidenResult.type);
    console.log('  Event:', ekidenResult.event?.id, '-', ekidenResult.event?.name);
    console.log('  City:', ekidenResult.event ? `(${ekidenResult.event})` : 'N/A');
    console.log('  Edition:', ekidenResult.edition ? `${ekidenResult.edition.id} (${ekidenResult.edition.year})` : 'N/A');
    console.log('  Confidence:', ekidenResult.confidence);
    
    // Vérifier si on a bien trouvé les événements attendus
    console.log('\n=== VALIDATION ===');
    if (diabResult.event?.id === 10172) {
      console.log('✅ Diab\'olo Run: TROUVÉ (event 10172)');
    } else {
      console.log('❌ Diab\'olo Run: PAS TROUVÉ (attendu: 10172, obtenu:', diabResult.event?.id || 'null', ')');
    }
    
    if (ekidenResult.event?.id === 3182) {
      console.log('✅ Nevers Marathon: TROUVÉ (event 3182)');
    } else {
      console.log('❌ Nevers Marathon: PAS TROUVÉ (attendu: 3182, obtenu:', ekidenResult.event?.id || 'null', ')');
    }
    
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await sourceDb.$disconnect();
  }
}

testMatching();
