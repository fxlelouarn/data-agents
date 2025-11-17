#!/usr/bin/env node
/**
 * Script de synchronisation des agents
 * 
 * Ce script met à jour la base de données avec les métadonnées actuelles
 * des agents (version, description) depuis le code source.
 * 
 * Usage:
 *   npm run sync-agents
 *   npm run sync-agents -- --force  (réinstalle tous les agents)
 */

import { prisma } from '@data-agents/database'
import { FFAScraperAgent, FFA_SCRAPER_AGENT_VERSION } from '../apps/agents/src/FFAScraperAgent'
import { GoogleSearchDateAgent, GOOGLE_SEARCH_DATE_AGENT_VERSION } from '../apps/agents/src/GoogleSearchDateAgent'
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

/**
 * Registry des agents avec leurs métadonnées depuis le code
 */
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

async function syncAgents(force = false) {
  console.log('🔄 Synchronisation des agents...\n')
  
  for (const [agentId, definition] of Object.entries(AGENT_DEFINITIONS)) {
    console.log(`📦 Traitement de ${definition.name}...`)
    
    try {
      // Vérifier si l'agent existe déjà
      const existingAgent = await prisma.agent.findUnique({
        where: { id: agentId }
      })
      
      if (existingAgent) {
        // Agent existe déjà
        const currentVersion = (existingAgent.config as any)?.version
        const needsUpdate = force || currentVersion !== definition.version
        
        if (needsUpdate) {
          console.log(`  ⬆️  Mise à jour ${currentVersion || 'inconnue'} → ${definition.version}`)
          
          // Merger la config existante avec les valeurs par défaut
          const existingConfig = (existingAgent.config as any) || {}
          const mergedConfig = {
            ...definition.defaultConfig,
            ...existingConfig,
            version: definition.version // Toujours écraser la version
          }
          
          await prisma.agent.update({
            where: { id: agentId },
            data: {
              description: definition.description,
              config: mergedConfig
            }
          })
          
          console.log(`  ✅ Agent mis à jour avec succès`)
        } else {
          console.log(`  ⏭️  Déjà à jour (v${currentVersion})`)
        }
      } else {
        // Agent n'existe pas, l'installer
        console.log(`  ➕ Installation de l'agent...`)
        
        await prisma.agent.create({
          data: {
            id: agentId,
            name: definition.name,
            description: definition.description,
            type: definition.type,
            frequency: definition.defaultFrequency,
            isActive: false, // Désactivé par défaut lors de l'installation
            config: {
              ...definition.defaultConfig,
              version: definition.version
            }
          }
        })
        
        console.log(`  ✅ Agent installé avec succès (v${definition.version})`)
        console.log(`  ⚠️  Agent désactivé par défaut - activez-le via le dashboard`)
      }
    } catch (error) {
      console.error(`  ❌ Erreur lors du traitement de ${definition.name}:`, error)
    }
    
    console.log()
  }
  
  console.log('✅ Synchronisation terminée\n')
}

async function main() {
  const force = process.argv.includes('--force')
  
  if (force) {
    console.log('⚠️  Mode FORCE activé - tous les agents seront réinstallés\n')
  }
  
  try {
    await syncAgents(force)
  } catch (error) {
    console.error('❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
