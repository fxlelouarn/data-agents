/**
 * Service pour récupérer les métadonnées des agents depuis le code source
 * 
 * Ce service permet d'enrichir automatiquement les agents lors de leur
 * création/installation avec leur version et description depuis le code.
 */

// Import dynamique pour éviter les dépendances circulaires au build
let metadataCache: Record<string, AgentMetadata> | null = null

interface AgentMetadata {
  version: string
  description: string
  defaultConfig?: Record<string, any>
}

/**
 * Charge les métadonnées des agents de manière lazy
 */
async function loadAgentMetadata(): Promise<Record<string, AgentMetadata>> {
  if (metadataCache) {
    return metadataCache
  }

  try {
    // Import dynamique depuis le package agents
    const { FFA_SCRAPER_AGENT_VERSION } = await import('@data-agents/sample-agents/dist/FFAScraperAgent')
    const { GOOGLE_SEARCH_DATE_AGENT_VERSION } = await import('@data-agents/sample-agents/dist/GoogleSearchDateAgent')
    
    metadataCache = {
      'ffa-scraper-agent': {
        version: FFA_SCRAPER_AGENT_VERSION,
        description: `Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied (v${FFA_SCRAPER_AGENT_VERSION})`
      },
      'google-search-date-agent': {
        version: GOOGLE_SEARCH_DATE_AGENT_VERSION,
        description: `Agent qui recherche les dates d'événements via Google Search et propose des mises à jour (v${GOOGLE_SEARCH_DATE_AGENT_VERSION})`
      }
    }

    return metadataCache
  } catch (error) {
    console.warn('⚠️  Impossible de charger les métadonnées des agents depuis le code:', error)
    // Fallback: retourner un objet vide
    return {}
  }
}

/**
 * Enrichit les données d'un agent avec ses métadonnées depuis le code
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
  const metadata = await loadAgentMetadata()
  
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
  const metadata = await loadAgentMetadata()
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
  const metadata = await loadAgentMetadata()
  
  return Object.entries(metadata).map(([id, meta]) => ({
    id,
    version: meta.version,
    description: meta.description
  }))
}
