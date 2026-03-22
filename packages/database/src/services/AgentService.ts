import { PrismaClient } from '@prisma/client'
import { IAgentService, IConnectionService, AgentFilters, ValidationResult } from './interfaces'
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  AgentFiltersSchema,
  validateWithSchema,
  CreateAgentInput,
  UpdateAgentInput,
  AgentFiltersInput
} from '../validation/schemas'
import {
  NotFoundError,
  ValidationError,
  AgentValidationError,
  DatabaseConnectionError,
  handleAsyncOperation
} from '../errors'
import { agentRegistryService } from './AgentRegistryService'

export class AgentService implements IAgentService {
  constructor(
    private prisma: PrismaClient,
    private connectionService: IConnectionService
  ) {}

  async getAgents(filters: AgentFilters = {}) {
    const validatedFilters = validateWithSchema(AgentFiltersSchema, filters)
    const { includeInactive = false, type, isActive } = validatedFilters

    const whereClause: any = {}
    if (!includeInactive) whereClause.isActive = true
    if (type) whereClause.type = type
    if (isActive !== undefined) whereClause.isActive = isActive

    const agents = await this.prisma.agent.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            runs: true,
            proposals: true,
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    // Validate all agents in parallel, reusing already-loaded agent data
    // Pre-fetch all database connections once (instead of N times)
    const dbConnectionsNeeded = agents
      .map(a => (a.config as any)?.sourceDatabase)
      .filter(Boolean)
    const uniqueDbIds = [...new Set(dbConnectionsNeeded)]
    const dbConnectionMap = new Map<string, any>()
    if (uniqueDbIds.length > 0) {
      await Promise.all(uniqueDbIds.map(async (dbId) => {
        try {
          const conn = await this.connectionService.getConnection(dbId)
          if (conn) dbConnectionMap.set(dbId, conn)
        } catch { /* ignore */ }
      }))
    }

    const agentsWithValidation = agents.map((agent) => {
      const validation = this.validateConfigurationSync(agent, dbConnectionMap)
      return {
        ...agent,
        configurationErrors: validation.errors,
        hasConfigurationErrors: !validation.isValid
      }
    })

    return agentsWithValidation
  }

  async getAgent(id: string) {
    return handleAsyncOperation(async () => {
      const agent = await this.prisma.agent.findUnique({
        where: { id },
        include: {
          runs: {
            orderBy: { startedAt: 'desc' },
            take: 10
          },
          logs: {
            orderBy: { timestamp: 'desc' },
            take: 100
          }
        }
      })

      if (!agent) {
        throw new NotFoundError('Agent', id)
      }

      return agent
    }, `Failed to retrieve agent ${id}`)
  }

  async createAgent(data: CreateAgentInput) {
    const validatedData = validateWithSchema(CreateAgentSchema, data)

    return this.prisma.agent.create({
      data: {
        ...validatedData,
        type: validatedData.type as any,
        config: validatedData.config as any
      }
    })
  }

  async updateAgent(id: string, data: UpdateAgentInput) {
    const validatedData = validateWithSchema(UpdateAgentSchema, data)
    // Si on essaie d'activer l'agent, vérifier qu'il n'a pas d'erreurs critiques
    if (validatedData.isActive === true) {
      const validation = await this.validateConfiguration(id)
      const hasCriticalErrors = validation.errors.some(e => e.severity === 'error')

      if (hasCriticalErrors) {
        const criticalErrors = validation.errors.filter(e => e.severity === 'error').map(e => e.message)
        throw new AgentValidationError(id, criticalErrors)
      }
    }

    return this.prisma.agent.update({
      where: { id },
      data: {
        ...validatedData,
        config: validatedData.config as any
      }
    })
  }

  async deleteAgent(id: string): Promise<void> {
    await this.prisma.agent.delete({
      where: { id }
    })
  }

  /**
   * Migre les anciens noms de champs vers les nouveaux noms
   * Utile lors de la réinstallation pour maintenir la compatibilité
   */
  private migrateConfigFieldNames(config: any): any {
    const migratedConfig = { ...config }

    // Migration: searchEngineId -> googleSearchEngineId
    if (migratedConfig.searchEngineId && !migratedConfig.googleSearchEngineId) {
      migratedConfig.googleSearchEngineId = migratedConfig.searchEngineId
      delete migratedConfig.searchEngineId
    }

    // Ajouter d'autres migrations ici si nécessaire
    // Ex: oldFieldName -> newFieldName

    return migratedConfig
  }

  /**
   * Réinstalle un agent en récupérant sa définition actuelle depuis le code
   */
  async reinstallAgent(id: string) {
    return handleAsyncOperation(async () => {
      const existingAgent = await this.prisma.agent.findUnique({ where: { id } })
      if (!existingAgent) {
        throw new NotFoundError('Agent', id)
      }

      // 1. Récupérer le type d'agent depuis config.agentType (prioritaire) ou détecter
      const currentConfig = (existingAgent.config as any) || {}
      let agentType = currentConfig.agentType

      if (!agentType) {
        // Fallback: détecter le type d'agent par le nom
        agentType = await agentRegistryService.detectAgentType(existingAgent.name, existingAgent.id)
      }

      if (!agentType) {
        throw new Error(`Impossible de déterminer le type d'agent pour: ${existingAgent.name}`)
      }

      // 2. Récupérer la définition actuelle depuis le code
      const agentDefinition = await agentRegistryService.getAgentDefinition(agentType, currentConfig)

      if (!agentDefinition) {
        throw new Error(`Impossible de récupérer la définition pour l'agent de type: ${agentType}`)
      }

      // 3. Convertir le schéma du format framework vers DynamicConfigForm
      const convertedSchema = agentRegistryService.convertSchemaFormat(agentDefinition.configSchema)

      // 4. Migrer les anciens noms de champs vers les nouveaux
      const migratedConfig = this.migrateConfigFieldNames(currentConfig)

      // 5. Fusionner les valeurs existantes avec la nouvelle structure
      const updatedConfig = {
        ...agentDefinition.defaultConfig, // Valeurs par défaut du code
        ...migratedConfig, // Valeurs existantes migrées (priorité)
        configSchema: convertedSchema // Nouveau schéma converti
      }

      // 5. Mettre à jour l'agent avec la nouvelle configuration
      const updatedAgent = await this.prisma.agent.update({
        where: { id },
        data: {
          config: updatedConfig as any
        }
      })

      console.log(`🔄 Agent ${existingAgent.name} réinstallé avec succès (type: ${agentType})`, {
        newSchemaFields: Object.keys(convertedSchema),
        existingFields: Object.keys(currentConfig)
      })

      return updatedAgent
    }, `Failed to reinstall agent ${id}`)
  }

  /**
   * Valide la configuration d'un agent
   */
  /**
   * Synchronous validation using pre-loaded data (no DB queries).
   * Used by getAgents() to avoid N+1 queries.
   */
  private validateConfigurationSync(
    agent: { id: string; config: any },
    dbConnectionMap: Map<string, any>
  ): ValidationResult {
    const config = agent.config as any || {}
    const configSchema = config.configSchema || {}
    const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = []

    for (const [fieldName, fieldConfig] of Object.entries(configSchema)) {
      const fieldDef = fieldConfig as any
      if (fieldDef.required) {
        const value = config[fieldName]
        if (!value || (Array.isArray(value) && value.length === 0) || value === '') {
          let message = `Le champ "${fieldDef.label || fieldName}" est requis`
          if (fieldDef.type === 'database_select') {
            message = `Aucune base de données source sélectionnée. Sélectionnez une base de données active.`
          }
          errors.push({ field: fieldName, message, severity: 'error' })
        }
      }
    }

    if (configSchema.sourceDatabase && config.sourceDatabase) {
      const database = dbConnectionMap.get(config.sourceDatabase)
      if (!database) {
        errors.push({ field: 'sourceDatabase', message: 'La base de données sélectionnée n\'existe plus', severity: 'error' })
      } else if (!database.isActive) {
        errors.push({ field: 'sourceDatabase', message: `La base de données "${database.name}" est désactivée`, severity: 'warning' })
      }
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors
    }
  }

  async validateConfiguration(agentId: string): Promise<ValidationResult> {
    return handleAsyncOperation(async () => {
      const agent = await this.prisma.agent.findUnique({ where: { id: agentId } })
      if (!agent) {
        return {
          isValid: false,
          errors: [{ field: 'agent', message: 'Agent introuvable', severity: 'error' }]
        }
      }

      const config = agent.config as any || {}
      const configSchema = config.configSchema || {}
      const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = []

      // Vérifier les champs requis
      for (const [fieldName, fieldConfig] of Object.entries(configSchema)) {
        const fieldDef = fieldConfig as any

        if (fieldDef.required) {
          const value = config[fieldName]

          if (!value || (Array.isArray(value) && value.length === 0) || value === '') {
            let message = `Le champ "${fieldDef.label || fieldName}" est requis`

            // Messages spécifiques selon le type
            if (fieldDef.type === 'database_select') {
              message = `Aucune base de données source sélectionnée. Sélectionnez une base de données active.`
            }

            errors.push({
              field: fieldName,
              message,
              severity: 'error'
            })
          }
        }
      }

      // Vérifications spécifiques aux bases de données
      if (configSchema.sourceDatabase && config.sourceDatabase) {
        try {
          const database = await this.connectionService.getConnection(config.sourceDatabase)
          if (!database) {
            errors.push({
              field: 'sourceDatabase',
              message: 'La base de données sélectionnée n\'existe plus',
              severity: 'error'
            })
          } else if (!database.isActive) {
            errors.push({
              field: 'sourceDatabase',
              message: `La base de données "${database.name}" est désactivée`,
              severity: 'warning'
            })
          }
        } catch (error) {
          errors.push({
            field: 'sourceDatabase',
            message: 'Erreur lors de la vérification de la base de données',
            severity: 'error'
          })
        }
      }

      return {
        isValid: errors.filter(e => e.severity === 'error').length === 0,
        errors
      }
    }, `Failed to validate agent configuration for ${agentId}`)
  }
}
