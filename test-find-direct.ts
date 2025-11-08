import { PrismaClient as MilesPrismaClient } from './apps/node_modules/.prisma/client-miles';

async function test() {
  const sourceDb = new MilesPrismaClient({
    datasources: {
      db: {
        url: 'postgresql://fx@localhost:5432/peyce'
      }
    }
  });
  
  try {
    const name = 'diab olo run';
    const city = 'saint apollinaire';
    const date = new Date('2025-11-30');
    
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 60);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 60);
    
    const nameWords = name.split(' ').filter(w => w.length >= 3);
    const cityWords = city.split(' ').filter(w => w.length >= 3);
    
    console.log('nameWords:', nameWords);
    console.log('cityWords:', cityWords);
    
    const nameWordForPrefix = nameWords.find((w) => w.length >= 5) ?? nameWords.find((w) => w.length >= 4);
    const namePrefix = nameWordForPrefix ? nameWordForPrefix.substring(0, Math.min(5, nameWordForPrefix.length)) : '';
    
    console.log('namePrefix:', namePrefix);
    
    console.log('\nTest requête SQL...');
    const results = await sourceDb.event.findMany({
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
          namePrefix && namePrefix.length >= 4 ? {
            OR: [
              { name: { contains: namePrefix, mode: 'insensitive' as const } },
              ...nameWords
                .filter(w => w.length >= 4)
                .map(w => ({ name: { contains: w, mode: 'insensitive' as const } }))
            ]
          } : {}
        ]
      },
      take: 10
    });
    
    console.log(`✅ ${results.length} résultats`);
    results.forEach(r => {
      console.log(`  ${r.id}: ${r.name} (${r.city})`);
    });
    
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    console.error(error);
  } finally {
    await sourceDb.$disconnect();
  }
}

test();
