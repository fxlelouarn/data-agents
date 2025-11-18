#!/usr/bin/env node
/**
 * Script de suppression de toutes les propositions
 * 
 * ⚠️ ATTENTION : Ce script supprime TOUTES les propositions et données associées
 * (ProposalApplication, etc.) de manière irréversible.
 * 
 * Usage:
 *   npm run reset-proposals
 */

import { prisma } from '@data-agents/database'

async function resetProposals() {
  console.log('🧹 Suppression de toutes les propositions...\n')
  
  try {
    // 1. Supprimer les ProposalApplication (dépendances)
    console.log('🗑️  Suppression des applications de propositions...')
    const deletedApplications = await prisma.proposalApplication.deleteMany({})
    console.log(`  ✅ ${deletedApplications.count} applications supprimées\n`)
    
    // 2. Supprimer toutes les propositions
    console.log('🗑️  Suppression des propositions...')
    const deletedProposals = await prisma.proposal.deleteMany({})
    console.log(`  ✅ ${deletedProposals.count} propositions supprimées\n`)
    
    console.log('✅ Suppression terminée\n')
    console.log('📝 Résumé:')
    console.log(`   - ${deletedApplications.count} applications supprimées`)
    console.log(`   - ${deletedProposals.count} propositions supprimées`)
    console.log()
    console.log('💡 Les agents continueront à créer de nouvelles propositions lors de leur prochaine exécution.')
    
  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error)
    throw error
  }
}

async function main() {
  // Afficher un avertissement
  console.log('⚠️  ATTENTION ⚠️')
  console.log('Ce script va supprimer TOUTES les propositions de la base de données.')
  console.log('Cette action est IRRÉVERSIBLE.\n')
  
  try {
    await resetProposals()
  } catch (error) {
    console.error('❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
