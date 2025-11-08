import { PrismaClient as MilesPrismaClient } from './apps/node_modules/.prisma/client-miles';

async function test() {
  const client = new MilesPrismaClient();
  
  try {
    console.log('Test connexion...');
    const count = await client.event.count();
    console.log(`✅ ${count} événements`);
    
    const event = await client.event.findUnique({ where: { id: 10172 } });
    console.log('Event 10172:', event?.name, '-', event?.city);
    
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await client.$disconnect();
  }
}

test();
