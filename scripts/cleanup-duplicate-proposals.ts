#!/usr/bin/env npx ts-node
/**
 * Script de nettoyage des propositions en double
 *
 * Ce script identifie et supprime les propositions PENDING qui sont des doublons,
 * c'est-à-dire qui proposent les mêmes changements (ou un sous-ensemble) pour la même édition.
 *
 * Logique:
 * 1. Pour chaque édition avec plusieurs propositions PENDING du même type
 * 2. Comparer les changements proposés
 * 3. Si une proposition est un sous-ensemble d'une autre plus ancienne → supprimer
 * 4. Si deux propositions sont identiques → garder la plus ancienne, supprimer l'autre
 *
 * Usage:
 *   npx ts-node scripts/cleanup-duplicate-proposals.ts --dry-run   # Simulation
 *   npx ts-node scripts/cleanup-duplicate-proposals.ts             # Exécution réelle
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface Proposal {
  id: string
  editionId: string | null
  eventId: string | null
  type: string
  status: string
  changes: any
  createdAt: Date
}

/**
 * Compare deux valeurs de manière profonde
 */
function areValuesEqual(value1: any, value2: any): boolean {
  if (value1 === value2) return true
  if (value1 === null || value1 === undefined) return value2 === null || value2 === undefined
  if (value2 === null || value2 === undefined) return false

  if (Array.isArray(value1) && Array.isArray(value2)) {
    if (value1.length !== value2.length) return false
    return value1.every((item, index) => areValuesEqual(item, value2[index]))
  }

  if (typeof value1 === 'object' && typeof value2 === 'object') {
    const keys1 = Object.keys(value1).sort()
    const keys2 = Object.keys(value2).sort()
    if (keys1.length !== keys2.length) return false
    if (!areValuesEqual(keys1, keys2)) return false
    return keys1.every(key => areValuesEqual(value1[key], value2[key]))
  }

  return false
}

/**
 * Vérifie si les changements de proposal2 sont un sous-ensemble de proposal1
 * (tous les champs de proposal2 existent dans proposal1 avec les mêmes valeurs)
 */
function isSubsetOf(proposal1: Proposal, proposal2: Proposal): boolean {
  const changes1 = proposal1.changes
  const changes2 = proposal2.changes

  // Pour chaque champ de proposal2
  for (const [field, changeData2] of Object.entries(changes2)) {
    const changeData1 = changes1[field]

    // Si le champ n'existe pas dans proposal1, ce n'est pas un sous-ensemble
    if (!changeData1) return false

    // Comparer les valeurs "new" (ignorer "old" et "confidence")
    const value1 = (changeData1 as any).new
    const value2 = (changeData2 as any).new

    if (!areValuesEqual(value1, value2)) return false
  }

  return true
}

/**
 * Vérifie si deux propositions sont identiques (mêmes changements)
 */
function areChangesIdentical(proposal1: Proposal, proposal2: Proposal): boolean {
  return isSubsetOf(proposal1, proposal2) && isSubsetOf(proposal2, proposal1)
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')

  console.log('='.repeat(60))
  console.log('🧹 Nettoyage des propositions en double')
  console.log('='.repeat(60))
  console.log(`Mode: ${isDryRun ? '🔍 SIMULATION (dry-run)' : '⚠️  EXÉCUTION RÉELLE'}`)
  console.log('')

  // Trouver les éditions avec plusieurs propositions PENDING
  const duplicateGroups = await prisma.$queryRaw<Array<{ editionId: string, type: string, count: bigint }>>`
    SELECT "editionId", type, COUNT(*) as count
    FROM proposals
    WHERE status = 'PENDING'
      AND "editionId" IS NOT NULL
    GROUP BY "editionId", type
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `

  console.log(`📊 Groupes avec doublons potentiels: ${duplicateGroups.length}`)
  console.log('')

  let totalToDelete = 0
  let totalDeleted = 0
  const proposalsToDelete: string[] = []

  for (const group of duplicateGroups) {
    const { editionId, type, count } = group

    // Récupérer toutes les propositions de ce groupe
    const proposals = await prisma.proposal.findMany({
      where: {
        editionId,
        type: type as any,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        editionId: true,
        eventId: true,
        type: true,
        status: true,
        changes: true,
        createdAt: true,
        eventName: true
      }
    }) as Proposal[]

    console.log(`\n📁 Édition ${editionId} (${type}) - ${proposals.length} propositions`)
    console.log(`   Event: ${(proposals[0] as any).eventName || 'N/A'}`)

    // Identifier les doublons
    const toKeep: Set<string> = new Set()
    const toDelete: Set<string> = new Set()

    for (let i = 0; i < proposals.length; i++) {
      const proposal = proposals[i]

      // Si déjà marquée pour suppression, passer
      if (toDelete.has(proposal.id)) continue

      for (let j = i + 1; j < proposals.length; j++) {
        const otherProposal = proposals[j]

        // Si déjà marquée pour suppression, passer
        if (toDelete.has(otherProposal.id)) continue

        // Cas 1: Propositions identiques → garder la plus ancienne
        if (areChangesIdentical(proposal, otherProposal)) {
          console.log(`   ✂️  Doublon exact: ${otherProposal.id} (créée ${otherProposal.createdAt.toISOString()})`)
          console.log(`       → Garde: ${proposal.id} (créée ${proposal.createdAt.toISOString()})`)
          toDelete.add(otherProposal.id)
          toKeep.add(proposal.id)
          continue
        }

        // Cas 2: otherProposal est un sous-ensemble de proposal → supprimer otherProposal
        if (isSubsetOf(proposal, otherProposal)) {
          const fieldsInProposal = Object.keys(proposal.changes).length
          const fieldsInOther = Object.keys(otherProposal.changes).length
          console.log(`   ✂️  Sous-ensemble: ${otherProposal.id} (${fieldsInOther} champs)`)
          console.log(`       → Contenu dans: ${proposal.id} (${fieldsInProposal} champs)`)
          toDelete.add(otherProposal.id)
          toKeep.add(proposal.id)
          continue
        }

        // Cas 3: proposal est un sous-ensemble de otherProposal → supprimer proposal
        if (isSubsetOf(otherProposal, proposal)) {
          const fieldsInProposal = Object.keys(proposal.changes).length
          const fieldsInOther = Object.keys(otherProposal.changes).length
          console.log(`   ✂️  Sous-ensemble: ${proposal.id} (${fieldsInProposal} champs)`)
          console.log(`       → Contenu dans: ${otherProposal.id} (${fieldsInOther} champs)`)
          toDelete.add(proposal.id)
          toKeep.add(otherProposal.id)
          break // Sortir de la boucle interne car proposal est marquée pour suppression
        }
      }
    }

    if (toDelete.size === 0) {
      console.log(`   ℹ️  Pas de doublons (propositions différentes)`)
    } else {
      console.log(`   📌 À garder: ${toKeep.size}, À supprimer: ${toDelete.size}`)
      proposalsToDelete.push(...toDelete)
    }

    totalToDelete += toDelete.size
  }

  console.log('\n' + '='.repeat(60))
  console.log(`📊 Résumé: ${totalToDelete} propositions à supprimer`)
  console.log('='.repeat(60))

  if (totalToDelete === 0) {
    console.log('✅ Aucun doublon trouvé!')
    await prisma.$disconnect()
    return
  }

  if (isDryRun) {
    console.log('\n🔍 Mode simulation - aucune suppression effectuée')
    console.log('   Relancez sans --dry-run pour supprimer les doublons')
  } else {
    console.log('\n⚠️  Suppression en cours...')

    // Supprimer d'abord les ProposalApplication liées
    const deletedApps = await prisma.proposalApplication.deleteMany({
      where: {
        proposalId: { in: proposalsToDelete }
      }
    })
    console.log(`   🗑️  ${deletedApps.count} ProposalApplication supprimées`)

    // Supprimer les propositions
    const deleted = await prisma.proposal.deleteMany({
      where: {
        id: { in: proposalsToDelete }
      }
    })
    totalDeleted = deleted.count
    console.log(`   🗑️  ${totalDeleted} propositions supprimées`)
  }

  console.log('\n✅ Terminé!')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('❌ Erreur:', e)
  await prisma.$disconnect()
  process.exit(1)
})
