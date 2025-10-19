const { PrismaClient } = require('@prisma/client')

// Import du service en simulant le settingsService
const settingsService = {
  getMaxConsecutiveFailures: () => 3,
  isAutoDisablingEnabled: () => true
}

class TestAgentFailureMonitor {
  constructor() {
    this.db = new PrismaClient()
  }

  /**
   * Vérifie si un agent inactif a été auto-désactivé récemment
   */
  async checkRecentlyAutoDisabledAgent(agentId) {
    try {
      console.log(`🔍 Vérification agent: ${agentId}`)
      
      // Simuler la récupération d'un agent
      const agent = await this.db.agent.findUnique({ 
        where: { id: agentId },
        include: {
          runs: {
            orderBy: { startedAt: 'desc' },
            take: 10
          }
        }
      })
      
      if (!agent) {
        console.log('❌ Agent non trouvé')
        return null
      }
      
      console.log(`📋 Agent: ${agent.name}, isActive: ${agent.isActive}`)
      
      if (agent.isActive) {
        console.log('⚠️ Agent encore actif, ignoré')
        return null
      }

      const recentRuns = agent.runs
      
      if (recentRuns.length === 0) {
        console.log('📝 Aucun run trouvé')
        return null
      }
      
      console.log(`📊 ${recentRuns.length} runs trouvés`)
      
      // Compter les échecs consécutifs
      let consecutiveFailures = 0
      let lastFailureAt = null
      const failedRuns = []
      
      for (const run of recentRuns) {
        console.log(`   Run ${run.id}: ${run.status} - ${run.startedAt.toISOString()}`)
        
        if (run.status === 'FAILED') {
          consecutiveFailures++
          if (!lastFailureAt) {
            lastFailureAt = run.startedAt
          }
          failedRuns.push({
            id: run.id,
            status: run.status,
            startedAt: run.startedAt,
            error: run.error
          })
        } else {
          break
        }
      }
      
      console.log(`🔢 Échecs consécutifs: ${consecutiveFailures}`)
      console.log(`⚖️ Seuil max: ${settingsService.getMaxConsecutiveFailures()}`)
      
      // Si pas d'échecs ou si les échecs ne justifient pas une auto-désactivation
      if (consecutiveFailures < settingsService.getMaxConsecutiveFailures()) {
        console.log('✅ Pas assez d\'échecs pour justifier auto-désactivation')
        return null
      }
      
      const result = {
        agentId,
        agentName: agent.name,
        consecutiveFailures,
        shouldDisable: true, // Déjà désactivé
        lastFailureAt: lastFailureAt,
        recentRuns: failedRuns
      }
      
      console.log('🎯 Résultat:', result)
      return result
      
    } catch (error) {
      console.error(`❌ Erreur:`, error)
      return null
    }
  }

  async close() {
    await this.db.$disconnect()
  }
}

async function testFailureDetection() {
  const monitor = new TestAgentFailureMonitor()
  
  try {
    // Récupérer l'ID de l'agent Google Search Date
    const agents = await monitor.db.agent.findMany({
      where: { name: 'Google Search Date Agent' }
    })
    
    if (agents.length === 0) {
      console.log('❌ Aucun Google Search Date Agent trouvé')
      return
    }
    
    const agent = agents[0]
    console.log(`🎯 Test sur agent: ${agent.name} (${agent.id})`)
    console.log('=' .repeat(60))
    
    const result = await monitor.checkRecentlyAutoDisabledAgent(agent.id)
    
    console.log('\n📋 Résumé:')
    console.log('=' .repeat(40))
    if (result) {
      console.log('✅ Agent détecté comme auto-désactivé')
      console.log(`   Nom: ${result.agentName}`)
      console.log(`   Échecs: ${result.consecutiveFailures}`)
      console.log(`   Dernier échec: ${result.lastFailureAt}`)
      console.log(`   Runs échoués: ${result.recentRuns.length}`)
    } else {
      console.log('❌ Agent NON détecté comme auto-désactivé')
    }
    
  } catch (error) {
    console.error('💥 Erreur générale:', error)
  } finally {
    await monitor.close()
  }
}

testFailureDetection()