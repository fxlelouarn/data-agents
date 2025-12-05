/**
 * Service pour récupérer les métadonnées des agents
 *
 * Ce service importe les versions depuis @data-agents/types (source unique de vérité)
 * et les enrichit avec les descriptions spécifiques et les schémas de configuration.
 */

import { AGENT_VERSIONS, ConfigSchema } from '@data-agents/types'

interface AgentMetadata {
  version: string
  description: string
  defaultConfig?: Record<string, any>
  configSchema?: ConfigSchema
}

/**
 * Schémas de configuration pour chaque type d'agent
 * Ces schémas définissent l'interface de configuration dans le Dashboard
 */
const agentConfigSchemas: Record<string, ConfigSchema> = {
  FFA_SCRAPER: {
    title: "Configuration FFA Scraper Agent",
    description: "Agent qui scrape le calendrier FFA pour extraire les compétitions",
    categories: [
      { id: "general", label: "Configuration générale" },
      { id: "performance", label: "Performance" }
    ],
    fields: [
      {
        name: "sourceDatabase",
        label: "Base de données",
        type: "select",
        category: "general",
        required: true,
        description: "Base de données Miles Republic à utiliser",
        validation: { required: true }
      },
      {
        name: "ligues",
        label: "Ligues FFA",
        type: "text",
        category: "general",
        required: true,
        defaultValue: "*",
        description: "Codes des ligues FFA séparés par des virgules (ex: ARA,IDF,PAC) ou \"*\" pour toutes",
        validation: { required: true }
      },
      {
        name: "monthsAhead",
        label: "Nombre de mois à scraper",
        type: "number",
        category: "general",
        required: false,
        defaultValue: 3,
        description: "Nombre de mois à scraper à partir d'aujourd'hui",
        validation: { min: 1, max: 12 }
      },
      {
        name: "batchSize",
        label: "Taille des lots",
        type: "number",
        category: "performance",
        required: false,
        defaultValue: 10,
        description: "Nombre de compétitions à traiter par lot",
        validation: { min: 1, max: 100 }
      }
    ]
  },
  GOOGLE_SEARCH_DATE: {
    title: "Configuration Google Search Date Agent",
    description: "Agent qui recherche les dates d'événements via Google Search",
    categories: [
      { id: "general", label: "Configuration générale" },
      { id: "performance", label: "Performance" }
    ],
    fields: [
      {
        name: "sourceDatabase",
        label: "Base de données",
        type: "select",
        category: "general",
        required: true,
        description: "Base de données Miles Republic à utiliser",
        validation: { required: true }
      },
      {
        name: "googleApiKey",
        label: "Clé API Google",
        type: "password",
        category: "general",
        required: true,
        description: "Clé d'API Google Custom Search",
        validation: { required: true }
      },
      {
        name: "searchEngineId",
        label: "Search Engine ID",
        type: "text",
        category: "general",
        required: true,
        description: "ID du moteur de recherche personnalisé Google",
        validation: { required: true }
      },
      {
        name: "batchSize",
        label: "Taille des lots",
        type: "number",
        category: "performance",
        required: false,
        defaultValue: 10,
        description: "Nombre d'événements à traiter par lot",
        validation: { min: 1, max: 50 }
      }
    ]
  },
  AUTO_VALIDATOR: {
    title: "Configuration Auto Validator Agent",
    description: "Agent qui valide automatiquement les propositions FFA sous certaines conditions",
    categories: [
      { id: "validation", label: "Validation", description: "Critères de validation automatique" },
      { id: "blocks", label: "Blocs", description: "Blocs à valider automatiquement" },
      { id: "advanced", label: "Avancé", description: "Options avancées" }
    ],
    fields: [
      {
        name: "milesRepublicDatabase",
        label: "Base Miles Republic",
        type: "select",
        category: "validation",
        required: true,
        description: "Connexion à Miles Republic pour vérifier les critères",
        helpText: "Utilisée pour vérifier isFeatured et customerType",
        validation: { required: true }
      },
      {
        name: "minConfidence",
        label: "Confiance minimale",
        type: "slider",
        category: "validation",
        required: true,
        defaultValue: 0.7,
        description: "Confiance minimale requise pour auto-valider",
        helpText: "Les propositions avec une confiance inférieure seront ignorées (0.5 = permissif, 0.9 = strict)",
        validation: { min: 0.5, max: 1.0, step: 0.05 }
      },
      {
        name: "maxProposalsPerRun",
        label: "Propositions max par run",
        type: "number",
        category: "validation",
        required: true,
        defaultValue: 100,
        description: "Nombre maximum de propositions à traiter par exécution",
        helpText: "Limite pour éviter les runs trop longs",
        validation: { required: true, min: 10, max: 500 }
      },
      {
        name: "enableEditionBlock",
        label: "Valider bloc Edition",
        type: "switch",
        category: "blocks",
        required: false,
        defaultValue: true,
        description: "Valider automatiquement les modifications d'édition",
        helpText: "Dates, URLs, infos générales de l'édition"
      },
      {
        name: "enableOrganizerBlock",
        label: "Valider bloc Organisateur",
        type: "switch",
        category: "blocks",
        required: false,
        defaultValue: true,
        description: "Valider automatiquement les modifications d'organisateur",
        helpText: "Nom, contact, URLs de l'organisateur"
      },
      {
        name: "enableRacesBlock",
        label: "Valider bloc Courses",
        type: "switch",
        category: "blocks",
        required: false,
        defaultValue: true,
        description: "Valider automatiquement les modifications de courses existantes",
        helpText: "Ne crée jamais de nouvelles courses - uniquement les mises à jour"
      },
      {
        name: "dryRun",
        label: "Mode simulation",
        type: "switch",
        category: "advanced",
        required: false,
        defaultValue: false,
        description: "Simuler sans appliquer les validations",
        helpText: "Utile pour tester la configuration avant activation"
      }
    ]
  }
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
  const configSchema = agentType ? agentConfigSchemas[agentType] : null

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
