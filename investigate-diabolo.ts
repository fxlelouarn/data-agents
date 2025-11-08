import { PrismaClient } from '@data-agents/database';
import { ConnectionManager } from '@data-agents/agent-framework';

const prisma = new PrismaClient();

async function investigate() {
  try {
    // 1. Récupérer la proposition
    console.log('=== PROPOSITION ===');
    const proposal = await prisma.proposal.findUnique({
      where: { id: 'cmhn7sdxc01u3n4men1d3nbnl' }
    });
    
    if (!proposal) {
      console.log('❌ Proposition non trouvée');
      return;
    }
    
    console.log('Type:', proposal.type);
    console.log('Event ID:', proposal.eventId);
    console.log('Edition ID:', proposal.editionId);
    console.log('Changes:', JSON.stringify(proposal.changes, null, 2));
    console.log('Justification:', JSON.stringify(proposal.justification, null, 2));
    
    // 2. Se connecter à Miles Republic
    console.log('\n=== MILES REPUBLIC - EVENT 10172 ===');
    const connectionManager = new ConnectionManager();
    const sourceDb = await connectionManager.connectToSource('miles-republic');
    
    const event = await sourceDb.event.findUnique({
      where: { id: 10172 },
      include: {
        editions: {
          select: {
            id: true,
            year: true,
            startDate: true
          }
        }
      }
    });
    
    if (!event) {
      console.log('❌ Event 10172 non trouvé dans Miles Republic');
    } else {
      console.log('✅ Event trouvé:', event.name, '-', event.city);
      console.log('Editions:', event.editions.map((e: any) => `${e.year} (ID: ${e.id})`).join(', '));
    }
    
    // 3. Vérifier les données FFA de la proposition
    if (proposal.changes) {
      const changes = proposal.changes as any;
      console.log('\n=== DONNÉES FFA ===');
      console.log('Name:', changes.name);
      console.log('City:', changes.city);
      console.log('Date:', changes.startDate);
    }
    
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await prisma.$disconnect();
  }
}

investigate();
