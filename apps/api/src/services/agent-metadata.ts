/**
 * Service pour récupérer les métadonnées des agents
 * 
 * Ce service importe les versions depuis @data-agents/types (source unique de vérité)
 * et les enrichit avec les descriptions spécifiques.
 */

import { AGENT_VERSIONS } from '@data-agents/types'

interface AgentMetadata {
  version: string
  description: string
  defaultConfig?: Record<string, any>
}

/**
 * Charge les métadonnées des agents depuis la source centralisée
 */
function loadAgentMetadata(): Record<string, AgentMetadata> {
  return {
    'ffa-scraper-agent': {
      version: AGENT_VERSIONS.FFA_SCRAPER_AGENT,
      description: `Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied (v${AGENT_VERSIONS.FFA_SCRAPER_AGENT})`
    },
    'google-search-date-agent': {
      version: AGENT_VERSIONS.GOOGLE_SEARCH_DATE_AGENT,
      description: `Agent qui recherche les dates d'événements via Google Search et propose des mises à jour (v${AGENT_VERSIONS.GOOGLE_SEARCH_DATE_AGENT})`
    }
  }
}

/**
 * Enrichit les données d'un agent avec ses métadonnées depuis la source centralisée
 */
export async function enrichAgentWithMetadata(agentData: {
  id?: string
  name: string
  config: Record<string, any>
  description?: string
}): Promise<{
  description: string
  config: Record<string, any>
}> {
  const metadata = loadAgentMetadata()
  
  // Déterminer l'ID de l'agent (soit fourni, soit dérivé du nom)
  const agentId = agentData.id || deriveAgentId(agentData.name)
  
  // Récupérer les métadonnées pour cet agent
  const agentMetadata = metadata[agentId]
  
  if (!agentMetadata) {
    console.warn(`⚠️  Aucune métadonnée trouvée pour l'agent: ${agentId}`)
    return {
      description: agentData.description || '',
      config: agentData.config
    }
  }
  
  // Enrichir la config avec la version
  const enrichedConfig = {
    ...agentData.config,
    version: agentMetadata.version
  }
  
  return {
    description: agentMetadata.description,
    config: enrichedConfig
  }
}

/**
 * Dérive un ID d'agent depuis son nom
 */
function deriveAgentId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Récupère la version d'un agent depuis son ID
 */
export async function getAgentVersion(agentId: string): Promise<string | null> {
  const metadata = loadAgentMetadata()
  return metadata[agentId]?.version || null
}

/**
 * Liste tous les agents disponibles avec leurs métadonnées
 */
export async function listAvailableAgents(): Promise<Array<{
  id: string
  version: string
  description: string
}>> {
  const metadata = loadAgentMetadata()
  
  return Object.entries(metadata).map(([id, meta]) => ({
    id,
    version: meta.version,
    description: meta.description
  }))
}
