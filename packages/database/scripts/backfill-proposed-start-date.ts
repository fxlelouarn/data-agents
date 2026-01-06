/**
 * Script de backfill pour remplir proposedStartDate sur les propositions existantes
 *
 * Usage: npx tsx scripts/backfill-proposed-start-date.ts
 *
 * Ce script extrait la startDate depuis le champ JSON 'changes' et la stocke
 * dans la colonne dénormalisée 'proposedStartDate' pour permettre un tri efficace.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Convertit une valeur en Date si possible
 */
function toDate(value: any): Date | null {
  if (!value) return null

  // Déjà un objet Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }

  // String ISO ou autre format parsable
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

/**
 * Extrait la startDate depuis l'objet changes d'une proposition
 */
function extractStartDate(changes: Record<string, any>): Date | null {
  if (!changes) return null

  // Cas 1: changes.startDate directement (format { old, new } ou valeur directe)
  if (changes.startDate) {
    const startDate = typeof changes.startDate === 'object' && 'new' in changes.startDate
      ? changes.startDate.new
      : changes.startDate

    const parsed = toDate(startDate)
    if (parsed) return parsed
  }

  // Cas 2: changes.edition.new.startDate (structure NEW_EVENT)
  if (changes.edition?.new?.startDate) {
    const parsed = toDate(changes.edition.new.startDate)
    if (parsed) return parsed
  }

  // Cas 3: changes.edition.startDate (autre variante)
  if (changes.edition?.startDate) {
    const startDate = typeof changes.edition.startDate === 'object' && 'new' in changes.edition.startDate
      ? changes.edition.startDate.new
      : changes.edition.startDate

    const parsed = toDate(startDate)
    if (parsed) return parsed
  }

  return null
}

async function main() {
  console.log('🔄 Début du backfill de proposedStartDate...\n')

  // Récupérer toutes les propositions sans proposedStartDate
  const proposals = await prisma.proposal.findMany({
    where: {
      proposedStartDate: null
    },
    select: {
      id: true,
      type: true,
      changes: true
    }
  })

  console.log(`📊 ${proposals.length} propositions à traiter\n`)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const proposal of proposals) {
    try {
      const changes = proposal.changes as Record<string, any>
      const startDate = extractStartDate(changes)

      if (startDate) {
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: { proposedStartDate: startDate }
        })
        updated++
        console.log(`✅ ${proposal.id} (${proposal.type}): ${startDate.toISOString().split('T')[0]}`)
      } else {
        skipped++
        // Log seulement les premiers pour ne pas spammer
        if (skipped <= 10) {
          console.log(`⏭️  ${proposal.id} (${proposal.type}): Pas de startDate trouvée`)
        }
      }
    } catch (error) {
      errors++
      console.error(`❌ ${proposal.id}: ${error}`)
    }
  }

  console.log('\n📈 Résumé:')
  console.log(`   ✅ Mises à jour: ${updated}`)
  console.log(`   ⏭️  Ignorées (pas de date): ${skipped}`)
  console.log(`   ❌ Erreurs: ${errors}`)
  console.log('\n✨ Backfill terminé!')
}

main()
  .catch((e) => {
    console.error('Erreur fatale:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
