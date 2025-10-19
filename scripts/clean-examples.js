#!/usr/bin/env node

/**
 * Script pour nettoyer les agents et propositions d'exemple
 * 
 * Usage: node scripts/clean-examples.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

async function cleanExamples() {
  try {
    console.log('🧹 Nettoyage des données d\'exemple...\n')
    
    // 1. Lister tous les agents existants
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        _count: {
          select: {
            runs: true,
            proposals: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    })
    
    if (agents.length === 0) {
      console.log('ℹ️  Aucun agent trouvé dans la base de données')
      return
    }
    
    console.log('📋 Agents actuels:')
    agents.forEach((agent, index) => {
      const isExample = agent.name.toLowerCase().includes('example') || 
                       agent.name.toLowerCase().includes('test') ||
                       agent.name.toLowerCase().includes('sample')
      
      console.log(`  ${index + 1}. ${agent.name} (${agent.type})`)
      console.log(`     ID: ${agent.id}`)
      console.log(`     Créé: ${agent.createdAt.toISOString().split('T')[0]}`)
      console.log(`     Runs: ${agent._count.runs}, Propositions: ${agent._count.proposals}`)
      console.log(`     ${isExample ? '❌ EXEMPLE' : '✅ Production'}`)
      console.log('')
    })
    
    // 2. Identifier les agents à nettoyer
    const exampleAgents = agents.filter(agent => 
      agent.name.toLowerCase().includes('example') || 
      agent.name.toLowerCase().includes('test') ||
      agent.name.toLowerCase().includes('sample') ||
      agent.name.toLowerCase().includes('ffa') // Agent FFA d'exemple
    )
    
    if (exampleAgents.length === 0) {
      console.log('✅ Aucun agent d\'exemple à nettoyer')
    } else {
      console.log(`🗑️  ${exampleAgents.length} agent(s) d'exemple identifié(s):`)
      exampleAgents.forEach(agent => {
        console.log(`   - ${agent.name} (${agent._count.runs} runs, ${agent._count.proposals} propositions)`)
      })
      
      // Supprimer les agents d'exemple (cascade delete pour runs, logs, proposals)
      for (const agent of exampleAgents) {
        await prisma.agent.delete({
          where: { id: agent.id }
        })
        console.log(`   ❌ Supprimé: ${agent.name}`)
      }
    }
    
    // 3. Nettoyer les propositions orphelines (au cas où)
    console.log('\n🔍 Vérification des propositions orphelines...')
    
    const orphanProposals = await prisma.proposal.findMany({
      where: {
        agent: null
      }
    })
    
    if (orphanProposals.length > 0) {
      await prisma.proposal.deleteMany({
        where: {
          agent: null
        }
      })
      console.log(`🗑️  ${orphanProposals.length} proposition(s) orpheline(s) supprimée(s)`)
    } else {
      console.log('✅ Aucune proposition orpheline')
    }
    
    // 4. Nettoyer les runs orphelins
    console.log('🔍 Vérification des runs orphelins...')
    
    const orphanRuns = await prisma.agentRun.findMany({
      where: {
        agent: null
      }
    })
    
    if (orphanRuns.length > 0) {
      await prisma.agentRun.deleteMany({
        where: {
          agent: null
        }
      })
      console.log(`🗑️  ${orphanRuns.length} run(s) orphelin(s) supprimé(s)`)
    } else {
      console.log('✅ Aucun run orphelin')
    }
    
    // 5. Nettoyer les logs orphelins
    console.log('🔍 Vérification des logs orphelins...')
    
    const orphanLogs = await prisma.agentLog.findMany({
      where: {
        agent: null
      }
    })
    
    if (orphanLogs.length > 0) {
      await prisma.agentLog.deleteMany({
        where: {
          agent: null
        }
      })
      console.log(`🗑️  ${orphanLogs.length} log(s) orphelin(s) supprimé(s)`)
    } else {
      console.log('✅ Aucun log orphelin')
    }
    
    // 6. Statistiques finales
    console.log('\n📊 État final de la base de données:')
    const finalCounts = await Promise.all([
      prisma.agent.count(),
      prisma.agentRun.count(), 
      prisma.proposal.count(),
      prisma.agentLog.count()
    ])
    
    console.log(`   Agents: ${finalCounts[0]}`)
    console.log(`   Runs: ${finalCounts[1]}`)
    console.log(`   Propositions: ${finalCounts[2]}`)
    console.log(`   Logs: ${finalCounts[3]}`)
    
    // 7. Lister les agents restants
    if (finalCounts[0] > 0) {
      const remainingAgents = await prisma.agent.findMany({
        select: {
          name: true,
          type: true,
          isActive: true
        }
      })
      
      console.log('\n🔧 Agents de production restants:')
      remainingAgents.forEach(agent => {
        console.log(`   ${agent.isActive ? '✅' : '⏸️ '} ${agent.name} (${agent.type})`)
      })
    }
    
    console.log('\n✨ Nettoyage terminé !')
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Options en ligne de commande
const args = process.argv.slice(2)
const isForced = args.includes('--force') || args.includes('-f')

if (isForced) {
  console.log('⚠️  Mode forcé activé - suppression sans confirmation')
  cleanExamples()
} else {
  console.log('🧹 Nettoyage des données d\'exemple')
  console.log('Pour lancer le nettoyage: node scripts/clean-examples.js --force')
  console.log('')
  console.log('Cette opération va supprimer:')
  console.log('- Les agents contenant "example", "test", "sample" ou "ffa" dans le nom')
  console.log('- Tous les runs, logs et propositions associés')  
  console.log('- Les données orphelines')
  console.log('')
  console.log('L\'agent "Google Search Date Agent" sera préservé.')
}