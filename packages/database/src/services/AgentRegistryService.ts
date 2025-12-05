/**
 * Service pour gérer le registry des agents côté backend
 */
export class AgentRegistryService {
  private agentRegistry: any = null

  /**
   * Charge le registry des agents de manière dynamique
   */
  private async loadAgentRegistry() {
    if (!this.agentRegistry) {
      try {
        // Import dynamique pour éviter la dépendance circulaire
        // Essayer d'abord le chemin dist, puis le chemin source
        let importPath = '@data-agents/agents'

        try {
          const agentsModule = await import(importPath)
          this.agentRegistry = agentsModule.agentRegistry
          console.log('✅ Registry des agents chargé avec succès')
        } catch (e) {
          console.warn(`⚠️ Impossible de charger via "${importPath}", tentative avec un chemin relatif...`)
          // Fallback : Calculer le chemin relatif depuis le répertoire d'exécution
          // En prod (Render), le code est dans dist/, donc remonter et aller vers apps/agents/dist
          const path = require('path')

          // __dirname pointe vers le répertoire du fichier compilé actuel
          // Ex: /opt/render/project/src/packages/database/dist/services
          // Remonter vers la racine du projet et aller vers apps/agents/dist
          // De packages/database/dist/services vers apps/agents/dist
          const relativePath = path.resolve(__dirname, '../../../../apps/agents/dist/index.js')

          console.log(`📂 Tentative de chargement depuis: ${relativePath}`)
          const agentsModule = await import(relativePath)
          this.agentRegistry = agentsModule.agentRegistry
          console.log('✅ Registry des agents chargé avec succès (chemin relatif)')
        }
      } catch (error) {
        console.warn('⚠️ Impossible de charger le registry des agents:', error)
        // Fallback: créer un registry vide
        this.agentRegistry = {
          getRegisteredTypes: () => [],
          create: () => null
        }
      }
    }
    return this.agentRegistry
  }

  /**
   * Récupère la liste des types d'agents disponibles
   */
  async getAvailableAgentTypes(): Promise<string[]> {
    const registry = await this.loadAgentRegistry()
    return registry.getRegisteredTypes()
  }

  /**
   * Crée une instance d'un agent avec une configuration temporaire
   * pour récupérer sa définition et son schéma
   */
  async getAgentDefinition(agentType: string, existingConfig?: any): Promise<{
    configSchema: any
    defaultConfig: any
  } | null> {
    try {
      const registry = await this.loadAgentRegistry()

      // Créer une configuration minimale pour l'instanciation
      const tempConfig = {
        id: 'temp-agent',
        name: 'Temporary Agent',
        type: agentType,
        frequency: '0 0 * * *',
        isActive: false,
        config: existingConfig || {}
      }

      // Instancier l'agent temporairement
      const agent = registry.create(agentType, tempConfig)

      if (!agent) {
        console.error(`Registry n'a pas pu créer d'instance pour le type: ${agentType}`)
        return null
      }

      // Récupérer la configuration de l'agent
      const agentConfig = (agent as any).config

      if (!agentConfig) {
        console.error(`Aucune propriété 'config' sur l'instance d'agent ${agentType}`)
        return null
      }

      // La configuration peut être soit dans config.config, soit directement dans config
      const configData = agentConfig.config || agentConfig
      const configSchema = configData?.configSchema || {}

      if (!configSchema || Object.keys(configSchema).length === 0) {
        console.warn(`Aucun schéma de configuration trouvé pour l'agent ${agentType}`)
      }

      return {
        configSchema: configSchema,
        defaultConfig: configData || {}
      }

    } catch (error) {
      console.error(`Erreur lors de la récupération de la définition pour l'agent ${agentType}:`, error)
      return null
    }
  }

  /**
   * Convertit un schéma du format framework vers le format DynamicConfigForm
   */
  convertSchemaFormat(frameworkSchema: any): any {
    if (!frameworkSchema || !frameworkSchema.fields || !Array.isArray(frameworkSchema.fields)) {
      return frameworkSchema // Déjà au bon format ou pas de schéma
    }

    const convertedSchema: any = {}

    for (const field of frameworkSchema.fields) {
      const { name, ...fieldConfig } = field

      convertedSchema[name] = {
        ...fieldConfig,
        type: fieldConfig.type === 'switch' ? 'boolean' : fieldConfig.type,
        description: fieldConfig.helpText || fieldConfig.description,
        default: fieldConfig.defaultValue,
        category: fieldConfig.category,
        min: fieldConfig.validation?.min,
        max: fieldConfig.validation?.max,
        step: fieldConfig.validation?.step,
        options: fieldConfig.options,
        placeholder: fieldConfig.placeholder,
        required: fieldConfig.required
      }
    }

    return convertedSchema
  }

  /**
   * Détecte le type d'agent basé sur le nom ou l'ID
   */
  async detectAgentType(agentName: string, agentId: string): Promise<string | null> {
    // Mappings connus
    const typeMapping: { [key: string]: string } = {
      'google-search': 'GOOGLE_SEARCH_DATE',
      'google_search': 'GOOGLE_SEARCH_DATE',
      'GoogleSearchDate': 'GOOGLE_SEARCH_DATE',
      'google': 'GOOGLE_SEARCH_DATE',
      'ffa-scraper': 'FFA_SCRAPER',
      'ffa_scraper': 'FFA_SCRAPER',
      'FFAScraper': 'FFA_SCRAPER',
      'ffa': 'FFA_SCRAPER',
      'auto-validator': 'AUTO_VALIDATOR',
      'auto_validator': 'AUTO_VALIDATOR',
      'AutoValidator': 'AUTO_VALIDATOR',
      'validator': 'AUTO_VALIDATOR'
    }

    const nameToCheck = (agentName || '') + ' ' + (agentId || '')

    // Chercher par nom
    for (const [pattern, type] of Object.entries(typeMapping)) {
      if (nameToCheck.toLowerCase().includes(pattern.toLowerCase())) {
        return type
      }
    }

    // Récupérer les types disponibles
    const availableTypes = await this.getAvailableAgentTypes()

    // Essayer une correspondance approximative avec les types disponibles
    for (const type of availableTypes) {
      if (nameToCheck.toLowerCase().includes(type.toLowerCase().replace(/_/g, '-'))) {
        return type
      }
    }

    // Par défaut, retourner le premier type disponible si aucun autre n'a matché
    if (availableTypes.length > 0) {
      console.warn(`Impossible de détecter le type pour l'agent "${agentName}". Utilisation du type par défaut: ${availableTypes[0]}`)
      return availableTypes[0]
    }

    return null
  }
}

// Instance globale
export const agentRegistryService = new AgentRegistryService()
