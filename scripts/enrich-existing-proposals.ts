import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function enrichProposals() {
  console.log('🔄 Début de l\'enrichissement des propositions existantes...')
  
  // Récupérer toutes les propositions qui n'ont pas encore de contexte
  const proposals = await prisma.proposal.findMany({
    where: {
      OR: [
        { eventName: null },
        { editionYear: null }
      ]
    }
  })
  
  console.log(`📋 ${proposals.length} proposition(s) à enrichir`)
  
  let enriched = 0
  let skipped = 0
  
  for (const proposal of proposals) {
    try {
      let eventName: string | undefined
      let eventCity: string | undefined
      let editionYear: number | undefined
      let raceName: string | undefined
      
      // Extraire depuis la justification
      if (Array.isArray(proposal.justification) && proposal.justification.length > 0) {
        const firstJustification = proposal.justification[0] as any
        if (firstJustification.metadata) {
          eventName = firstJustification.metadata.eventName
          eventCity = firstJustification.metadata.eventCity
          // Convertir l'année en nombre si c'est une chaîne
          const yearValue = firstJustification.metadata.editionYear
          editionYear = yearValue ? (typeof yearValue === 'string' ? parseInt(yearValue) : yearValue) : undefined
          raceName = firstJustification.metadata.raceName
        }
      }
      
      // Mettre à jour si on a trouvé des informations
      if (eventName || editionYear || raceName) {
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: {
            eventName,
            eventCity,
            editionYear,
            raceName
          }
        })
        console.log(`✅ Enrichi: ${eventName || 'N/A'} - ${editionYear || 'N/A'}`)
        enriched++
      } else {
        console.log(`⏭️  Ignoré (pas de données): ${proposal.id}`)
        skipped++
      }
    } catch (error) {
      console.error(`❌ Erreur pour la proposition ${proposal.id}:`, error)
      skipped++
    }
  }
  
  console.log(`\n✨ Terminé !`)
  console.log(`   - ${enriched} proposition(s) enrichie(s)`)
  console.log(`   - ${skipped} proposition(s) ignorée(s)`)
}

enrichProposals()
  .then(() => {
    console.log('✅ Script terminé avec succès')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erreur:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
