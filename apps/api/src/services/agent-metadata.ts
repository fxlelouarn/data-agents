/**
 * Service pour récupérer les métadonnées des agents
 *
 * Ce service importe les versions et schémas depuis @data-agents/types (source unique de vérité)
 * et les enrichit avec les descriptions spécifiques.
 */

import {
  AGENT_VERSIONS,
  AGENT_CONFIG_SCHEMAS,
  AGENT_NAMES,
  ConfigSchema
} from '@data-agents/types'

interface AgentMetadata {
  version: string
  description: string
  defaultConfig?: Record<string, any>
  configSchema?: ConfigSchema
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
    },
    'auto-validator-agent': {
      version: AGENT_VERSIONS.AUTO_VALIDATOR_AGENT,
      description: `Agent qui valide automatiquement les propositions EDITION_UPDATE FFA pour les événements non-premium (v${AGENT_VERSIONS.AUTO_VALIDATOR_AGENT})`
    },
    'slack-event-agent': {
      version: AGENT_VERSIONS.SLACK_EVENT_AGENT,
      description: `Agent qui traite les messages Slack @databot pour extraire et créer des propositions d'événements (v${AGENT_VERSIONS.SLACK_EVENT_AGENT})`
    },
    'duplicate-detection-agent': {
      version: AGENT_VERSIONS.DUPLICATE_DETECTION_AGENT,
      description: `Agent qui détecte automatiquement les événements doublons dans Miles Republic (v${AGENT_VERSIONS.DUPLICATE_DETECTION_AGENT})`
    },
    'ffa-results-agent': {
      version: AGENT_VERSIONS.FFA_RESULTS_AGENT,
      description: `Agent qui récupère le nombre de participants depuis les résultats FFA (v${AGENT_VERSIONS.FFA_RESULTS_AGENT})`
    }
  }
}

/**
 * Détermine le type d'agent à partir de son nom ou de sa config
 */
function detectAgentType(name: string, config?: Record<string, any>): string | null {
  // Priorité 1: agentType explicite dans la config
  if (config?.agentType) {
    return config.agentType
  }

  // Priorité 2: Dérivation depuis le nom
  const lowerName = name.toLowerCase()

  if (lowerName.includes('ffa') || lowerName.includes('scraper')) {
    return 'FFA_SCRAPER'
  }

  if (lowerName.includes('google') || lowerName.includes('search')) {
    return 'GOOGLE_SEARCH_DATE'
  }

  if (lowerName.includes('auto') && lowerName.includes('validator')) {
    return 'AUTO_VALIDATOR'
  }

  if (lowerName.includes('slack')) {
    return 'SLACK_EVENT'
  }

  if (lowerName.includes('duplicate') || lowerName.includes('detection')) {
    return 'DUPLICATE_DETECTION'
  }

  if (lowerName.includes('ffa') && lowerName.includes('results')) {
    return 'FFA_RESULTS'
  }

  return null
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

  // Déterminer le type d'agent pour récupérer le schéma
  const agentType = detectAgentType(agentData.name, agentData.config)
  const configSchema = agentType ? AGENT_CONFIG_SCHEMAS[agentType] : null

  if (!agentMetadata) {
    console.warn(`⚠️  Aucune métadonnée trouvée pour l'agent: ${agentId}`)
    // Même sans métadonnées, on peut avoir un schéma
    return {
      description: agentData.description || '',
      config: configSchema
        ? { ...agentData.config, configSchema }
        : agentData.config
    }
  }

  // Enrichir la config avec la version et le schéma
  const enrichedConfig = {
    ...agentData.config,
    version: agentMetadata.version,
    ...(configSchema && { configSchema })
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

/**
 * Informations complètes d'un type d'agent pour l'UI de création
 */
export interface AvailableAgentInfo {
  /** Identifiant technique (FFA_SCRAPER, GOOGLE_SEARCH_DATE, etc.) */
  type: string
  /** Nom affiché dans l'UI */
  label: string
  /** Description courte */
  description: string
  /** Version actuelle */
  version: string
  /** Type d'agent (EXTRACTOR, VALIDATOR, etc.) */
  agentType: 'EXTRACTOR' | 'VALIDATOR' | 'COMPARATOR' | 'CLEANER' | 'ANALYZER'
  /** Schéma de configuration pour le formulaire dynamique */
  configSchema: ConfigSchema
}

/**
 * Mapping des types d'agents vers leurs catégories
 */
const agentTypeCategories: Record<string, 'EXTRACTOR' | 'VALIDATOR' | 'COMPARATOR' | 'CLEANER' | 'ANALYZER'> = {
  FFA_SCRAPER: 'EXTRACTOR',
  FFA_RESULTS: 'EXTRACTOR',
  GOOGLE_SEARCH_DATE: 'EXTRACTOR',
  AUTO_VALIDATOR: 'VALIDATOR',
  SLACK_EVENT: 'EXTRACTOR',
  DUPLICATE_DETECTION: 'ANALYZER'
}

/**
 * Labels lisibles pour les types d'agents
 * Réexporté depuis @data-agents/types pour rétro-compatibilité
 */
export const agentTypeLabels = AGENT_NAMES

/**
 * Récupère le nom d'un agent depuis son type
 * À utiliser partout où on a besoin du nom d'un agent
 */
export function getAgentNameByType(agentType: string): string {
  return AGENT_NAMES[agentType as keyof typeof AGENT_NAMES] || agentType
}

/**
 * Retourne la liste complète des agents disponibles pour l'UI de création
 * Cette fonction est la source unique de vérité pour AgentCreate.tsx
 */
export function getAvailableAgentsForUI(): AvailableAgentInfo[] {
  const result: AvailableAgentInfo[] = []

  for (const [type, schema] of Object.entries(AGENT_CONFIG_SCHEMAS)) {
    const versionKey = `${type.replace(/_/g, '_')}_AGENT` as keyof typeof AGENT_VERSIONS
    const version = AGENT_VERSIONS[versionKey] || '1.0.0'

    result.push({
      type,
      label: (agentTypeLabels as Record<string, string>)[type] || type,
      description: schema.description || '',
      version,
      agentType: agentTypeCategories[type] || 'EXTRACTOR',
      configSchema: schema
    })
  }

  return result
}

/**
 * Retourne le schéma de configuration pour un type d'agent donné
 */
export function getAgentConfigSchema(agentType: string): ConfigSchema | null {
  return AGENT_CONFIG_SCHEMAS[agentType] || null
}
