#!/usr/bin/env node
/**
 * Script de réinitialisation des agents
 * 
 * ⚠️ ATTENTION : Ce script supprime TOUS les agents et leur état en base de données,
 * puis les réinstalle avec leur configuration par défaut.
 * 
 * Usage:
 *   npm run reset-agents
 */

import { prisma } from '@data-agents/database'
import { FFA_SCRAPER_AGENT_VERSION } from '../apps/agents/src/FFAScraperAgent'
import { GOOGLE_SEARCH_DATE_AGENT_VERSION } from '../apps/agents/src/GoogleSearchDateAgent'
import { DEFAULT_CONFIG as FFA_DEFAULT_CONFIG } from '../apps/agents/src/registry/ffa-scraper'
import { DEFAULT_CONFIG as GOOGLE_DEFAULT_CONFIG } from '../apps/agents/src/registry/google-search-date'

interface AgentDefinition {
  id: string
  name: string
  description: string
  version: string
  type: string
  defaultFrequency: string
  defaultConfig: Record<string, any>
}

const AGENT_DEFINITIONS: Record<string, AgentDefinition> = {
  'ffa-scraper-agent': {
    id: 'ffa-scraper-agent',
    name: 'FFA Scraper Agent',
    description: `Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied (v${FFA_SCRAPER_AGENT_VERSION})`,
    version: FFA_SCRAPER_AGENT_VERSION,
    type: 'EXTRACTOR',
    defaultFrequency: FFA_DEFAULT_CONFIG.frequency,
    defaultConfig: FFA_DEFAULT_CONFIG.config
  },
  'google-search-date-agent': {
    id: 'google-search-date-agent',
    name: 'Google Search Date Agent',
    description: `Agent qui recherche les dates d'événements via Google Search et propose des mises à jour (v${GOOGLE_SEARCH_DATE_AGENT_VERSION})`,
    version: GOOGLE_SEARCH_DATE_AGENT_VERSION,
    type: 'EXTRACTOR',
    defaultFrequency: GOOGLE_DEFAULT_CONFIG.frequency,
    defaultConfig: GOOGLE_DEFAULT_CONFIG.config
  }
}

async function resetAgents() {
  console.log('🧹 Réinitialisation des agents...\n')
  
  try {
    // 1. Supprimer l'état des agents (AgentState)
    console.log('📊 Suppression de l\'état des agents...')
    const deletedStates = await prisma.agentState.deleteMany({})
    console.log(`  ✅ ${deletedStates.count} états supprimés\n`)
    
    // 2. Supprimer les agents
    console.log('🗑️  Suppression des agents...')
    const deletedAgents = await prisma.agent.deleteMany({})
    console.log(`  ✅ ${deletedAgents.count} agents supprimés\n`)
    
    // 3. Réinstaller les agents avec configuration par défaut
    console.log('📦 Réinstallation des agents...\n')
    
    for (const [agentId, definition] of Object.entries(AGENT_DEFINITIONS)) {
      console.log(`➕ Installation de ${definition.name}...`)
      
      await prisma.agent.create({
        data: {
          id: agentId,
          name: definition.name,
          description: definition.description,
          type: definition.type,
          frequency: definition.defaultFrequency,
          isActive: false, // Désactivé par défaut
          config: {
            ...definition.defaultConfig,
            version: definition.version
          }
        }
      })
      
      console.log(`  ✅ ${definition.name} installé (v${definition.version})`)
      console.log(`  ⚠️  Agent désactivé par défaut - activez-le via le dashboard\n`)
    }
    
    console.log('✅ Réinitialisation terminée\n')
    console.log('📝 Résumé:')
    console.log(`   - ${deletedStates.count} états supprimés`)
    console.log(`   - ${deletedAgents.count} agents supprimés`)
    console.log(`   - ${Object.keys(AGENT_DEFINITIONS).length} agents réinstallés`)
    console.log()
    console.log('⚠️  N\'oubliez pas d\'activer les agents dans le dashboard!')
    
  } catch (error) {
    console.error('❌ Erreur lors de la réinitialisation:', error)
    throw error
  }
}

async function main() {
  // Demander confirmation
  console.log('⚠️  ATTENTION ⚠️')
  console.log('Ce script va supprimer TOUS les agents et leur état en base de données.')
  console.log('Cette action est IRRÉVERSIBLE.\n')
  
  // En production, on pourrait ajouter une confirmation interactive
  // Pour l'instant, on exécute directement
  
  try {
    await resetAgents()
  } catch (error) {
    console.error('❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
