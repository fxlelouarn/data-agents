import { PrismaClient } from '@data-agents/database';
import { PrismaClient as MilesPrismaClient } from './apps/node_modules/.prisma/client-miles';

const prisma = new PrismaClient();
const milesDb = new MilesPrismaClient();

async function investigate() {
  try {
    // 1. Récupérer la proposition
    console.log('=== PROPOSITION cmhn7sdx801ttn4me1z03orop ===');
    const proposal = await prisma.proposal.findUnique({
      where: { id: 'cmhn7sdx801ttn4me1z03orop' }
    });
    
    if (!proposal) {
      console.log('❌ Proposition non trouvée');
      return;
    }
    
    console.log('Type:', proposal.type);
    console.log('Event ID:', proposal.eventId);
    console.log('Edition ID:', proposal.editionId);
    
    const changes = proposal.changes as any;
    const ffaName = changes.name?.new || changes.name;
    const ffaCity = changes.city?.new || changes.city;
    
    console.log('\n=== DONNÉES FFA ===');
    console.log('Name:', ffaName);
    console.log('City:', ffaCity);
    
    // 2. Vérifier l'événement 3182
    console.log('\n=== ÉVÉNEMENT 3182 dans Miles Republic ===');
    const event = await milesDb.event.findUnique({
      where: { id: 3182 },
      include: {
        editions: {
          where: { year: '2025' },
          select: { id: true, year: true, startDate: true }
        }
      }
    });
    
    if (event) {
      console.log('✅ Event trouvé:', event.name);
      console.log('   City:', event.city);
      console.log('   Editions 2025:', event.editions.map(e => `${e.id} (${e.startDate})`).join(', '));
    } else {
      console.log('❌ Event 3182 non trouvé');
    }
    
    // 3. Comparer les noms
    if (event && ffaName) {
      console.log('\n=== COMPARAISON ===');
      console.log('FFA name:  "' + ffaName + '"');
      console.log('Miles name: "' + event.name + '"');
      console.log('FFA city:  "' + ffaCity + '"');
      console.log('Miles city: "' + event.city + '"');
    }
    
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await prisma.$disconnect();
    await milesDb.$disconnect();
  }
}

investigate();
