import { DatabaseService } from '@data-agents/database'

const db = new DatabaseService()

async function fixProposalFormats() {
  console.log('🔧 Correction du format des propositions...')

  try {
    // Récupérer toutes les propositions de mise à jour
    const proposals = await db.getProposals({
      status: 'PENDING'
    })
    
    console.log(`📋 Trouvé ${proposals.length} propositions à analyser`)

    for (const proposal of proposals) {
      // Skip les propositions NEW_EVENT qui ont déjà le bon format
      if (proposal.type === 'NEW_EVENT') {
        console.log(`⏭️  Skip ${proposal.id} (NEW_EVENT)`)
        continue
      }

      let needsUpdate = false
      const updatedChanges = { ...proposal.changes }

      // Transformer le format { old, new, confidence } vers { field, current, proposed, confidence }
      for (const [key, value] of Object.entries(proposal.changes)) {
        if (typeof value === 'object' && value !== null && 'old' in value && 'new' in value) {
          needsUpdate = true
          updatedChanges[key] = {
            field: key,
            current: (value as any).old,
            proposed: (value as any).new,
            confidence: (value as any).confidence || proposal.confidence || 0.8
          }
          console.log(`  🔄 Transformé ${key}: old/new → current/proposed`)
        }
      }

      if (needsUpdate) {
        await db.prisma.proposal.update({
          where: { id: proposal.id },
          data: { changes: updatedChanges }
        })
        console.log(`✅ Mis à jour ${proposal.id}`)
      } else {
        console.log(`⏭️  Skip ${proposal.id} (déjà au bon format)`)
      }
    }

    console.log('✨ Correction terminée avec succès')

  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error)
  } finally {
    process.exit(0)
  }
}

fixProposalFormats()