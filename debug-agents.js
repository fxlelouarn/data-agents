const { PrismaClient } = require('@prisma/client')

async function debugAgents() {
  const prisma = new PrismaClient()
  
  try {
    console.log('🔍 État actuel des agents:')
    console.log('=' .repeat(50))
    
    // Récupérer tous les agents avec leurs stats
    const agents = await prisma.agent.findMany({
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 10
        },
        logs: {
          where: {
            OR: [
              { message: { contains: 'désactivé' } },
              { message: { contains: 'AUTO_DISABLED' } },
              { message: { contains: 'échecs consécutifs' } }
            ]
          },
          orderBy: { timestamp: 'desc' },
          take: 5
        }
      }
    })
    
    for (const agent of agents) {
      console.log(`\n📋 Agent: ${agent.name} (${agent.id})`)
      console.log(`   État: ${agent.isActive ? '✅ Actif' : '❌ Inactif'}`)
      console.log(`   Total runs: ${agent.runs.length}`)
      
      const failedRuns = agent.runs.filter(r => r.status === 'FAILED')
      const successRuns = agent.runs.filter(r => r.status === 'SUCCESS')
      
      console.log(`   Runs échoués: ${failedRuns.length}`)
      console.log(`   Runs réussis: ${successRuns.length}`)
      
      // Analyser les échecs consécutifs
      let consecutiveFailures = 0
      for (const run of agent.runs) {
        if (run.status === 'FAILED') {
          consecutiveFailures++
        } else {
          break
        }
      }
      
      console.log(`   Échecs consécutifs: ${consecutiveFailures}`)
      
      if (agent.logs.length > 0) {
        console.log('   📝 Logs de désactivation:')
        for (const log of agent.logs) {
          console.log(`      ${log.timestamp.toISOString()}: ${log.message}`)
        }
      }
      
      if (agent.runs.length > 0) {
        console.log('   🏃 Derniers runs:')
        for (const run of agent.runs.slice(0, 3)) {
          console.log(`      ${run.startedAt.toISOString()}: ${run.status} ${run.error ? '- ' + run.error.substring(0, 100) : ''}`)
        }
      }
    }
    
    // Vérifier les logs récents d'auto-désactivation
    console.log('\n🚨 Logs de désactivation automatique:')
    console.log('=' .repeat(50))
    
    const autoDisableLogs = await prisma.agentLog.findMany({
      where: {
        OR: [
          { message: { contains: '🚨 Agent automatiquement désactivé' } },
          { message: { contains: 'AUTO_DISABLED_CONSECUTIVE_FAILURES' } }
        ]
      },
      include: {
        agent: true
      },
      orderBy: { timestamp: 'desc' },
      take: 10
    })
    
    if (autoDisableLogs.length === 0) {
      console.log('❌ Aucun log de désactivation automatique trouvé')
    } else {
      for (const log of autoDisableLogs) {
        console.log(`📝 ${log.timestamp.toISOString()} - ${log.agent.name}:`)
        console.log(`   ${log.message}`)
        if (log.data) {
          console.log(`   Détails:`, JSON.stringify(log.data, null, 2))
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error)
  } finally {
    await prisma.$disconnect()
  }
}

debugAgents()