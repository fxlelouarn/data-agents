import { PrismaClient as MilesRepublicPrismaClient } from './apps/node_modules/.prisma/client-miles';
import { findCandidateEvents, matchCompetition } from './apps/agents/src/ffa/matcher';

async function testMatching() {
  // Créer un client Prisma pour Miles Republic
  const sourceDb = new MilesRepublicPrismaClient();

  try {
    // 1. Vérifier si l'événement 10172 existe
    console.log('=== VÉRIFICATION EVENT 10172 ===');
    const event = await sourceDb.event.findUnique({
      where: { id: 10172 },
      include: {
        editions: {
          where: {
            year: '2025'
          }
        }
      }
    });
    
    if (!event) {
      console.log('❌ Event 10172 NOT FOUND');
    } else {
      console.log('✅ Event trouvé:', event.name);
      console.log('   City:', event.city);
      console.log('   Editions 2025:', event.editions);
    }

    // 2. Simuler la recherche de candidats
    console.log('\n=== RECHERCHE CANDIDATS POUR "Diab\'olo Run" ===');
    const searchName = "diabolo run"; // normalisé (sans accent, sans apostrophe)
    const searchCity = "saint apollinaire"; // normalisé
    const searchDate = new Date('2025-11-30');
    
    const candidates = await findCandidateEvents(
      searchName,
      searchCity,
      searchDate,
      sourceDb
    );
    
    console.log(`Candidats trouvés: ${candidates.length}`);
    candidates.forEach((c: any, i: number) => {
      console.log(`${i + 1}. ID ${c.id}: ${c.name} (${c.city})`);
      if (c.editions) {
        console.log(`   Editions: ${c.editions.map((e: any) => e.year).join(', ')}`);
      }
    });

    // 3. Tester le matching complet
    console.log('\n=== TEST MATCHING COMPLET ===');
    const competition = {
      competition: {
        name: "Diab'olo Run",
        city: "Saint Apollinaire",
        date: new Date('2025-11-30'),
        ffaId: '298341',
        level: 'Départemental'
      },
      races: [],
      organizerEmail: 'aspttdijonathle@gmail.com',
      organizerWebsite: 'http://aspttdijon.athle.com'
    };
    
    const matchResult = await matchCompetition(
      competition,
      sourceDb,
      { similarityThreshold: 0.85 },
      {
        info: (...args: any[]) => console.log('[INFO]', ...args),
        error: (...args: any[]) => console.error('[ERROR]', ...args)
      }
    );
    
    console.log('\nRésultat du matching:');
    console.log('  Type:', matchResult.type);
    console.log('  Event:', matchResult.event);
    console.log('  Edition:', matchResult.edition);
    console.log('  Confidence:', matchResult.confidence);

  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await sourceDb.$disconnect();
  }
}

testMatching();
