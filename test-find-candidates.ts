import { PrismaClient as MilesPrismaClient } from './apps/node_modules/.prisma/client-miles';

const sourceDb = new MilesPrismaClient();

async function test() {
  try {
    // Test avec les données de la proposition
    const name = "diabolo run"; // normalisé par l'algo
    const city = "saint apollinaire"; // normalisé
    const date = new Date('2025-11-30');
    
    console.log('Recherche pour:');
    console.log('  Name:', name);
    console.log('  City:', city);
    console.log('  Date:', date);
    
    // Calculer la fenêtre temporelle (±60 jours)
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 60);
    
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 60);
    
    console.log('\nFenêtre temporelle:');
    console.log('  Start:', startDate.toISOString());
    console.log('  End:', endDate.toISOString());
    
    // Extraire les mots clés
    const nameWords = name.split(' ').filter(w => w.length >= 4);
    const cityWords = city.split(' ').filter(w => w.length >= 3);
    
    console.log('\nMots-clés:');
    console.log('  Name words:', nameWords);
    console.log('  City words:', cityWords);
    
    // Passe 1 : Nom + Ville
    const namePrefix = nameWords.length > 0 ? nameWords[0].substring(0, 5) : '';
    console.log('  Name prefix:', namePrefix);
    
    console.log('\n=== PASSE 1 : Nom ET Ville ===');
    const pass1Results = await sourceDb.event.findMany({
      where: {
        AND: [
          {
            editions: {
              some: {
                startDate: {
                  gte: startDate,
                  lte: endDate
                }
              }
            }
          },
          {
            OR: cityWords.map(word => ({
              city: {
                contains: word,
                mode: 'insensitive' as const
              }
            }))
          },
          namePrefix.length >= 5 ? {
            name: {
              contains: namePrefix,
              mode: 'insensitive' as const
            }
          } : {}
        ]
      },
      include: {
        editions: {
          where: {
            startDate: {
              gte: startDate,
              lte: endDate
            }
          },
          select: {
            id: true,
            year: true,
            startDate: true
          }
        }
      },
      take: 10
    });
    
    console.log(`Résultats: ${pass1Results.length}`);
    pass1Results.forEach((e: any) => {
      console.log(`  - ${e.id}: ${e.name} (${e.city})`);
      console.log(`    Editions: ${e.editions.map((ed: any) => `${ed.year} (${ed.id})`).join(', ')}`);
    });
    
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await sourceDb.$disconnect();
  }
}

test();
