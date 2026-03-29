/**
 * FlexibleScheduler - Scheduler avec fréquence flexible
 *
 * Remplace le système basé sur CronJob par un système avec:
 * - Variance aléatoire (jitter)
 * - Fenêtres temporelles
 * - Persistance du nextRunAt en base
 */

import { createApiLogger, createAgentLogger } from '@data-agents/database'
import {
  agentRegistry,
  AgentContext,
  createLogger,
} from '@data-agents/agent-framework'
import { AgentFailureMonitor } from './agent-failure-monitor'
import { settingsService } from '../config/settings'
import { getDatabaseServiceSync } from './database'
import type { DatabaseService } from '@data-agents/database'
import {
  calculateNextRun,
  validateFrequencyConfig,
  formatFrequencyConfig,
} from '@data-agents/database'
import type { FrequencyConfig } from '@data-agents/types'
import * as fs from 'fs'
import * as path from 'path'

interface ScheduledJob {
  agentId: string
  timeoutId: NodeJS.Timeout
  nextRunAt: Date
}

export class FlexibleScheduler {
  private jobs = new Map<string, ScheduledJob>()
  private db: DatabaseService
  private failureMonitor: AgentFailureMonitor
  private monitoringInterval: NodeJS.Timeout | null = null
  private isRunning = false
  private logger = createApiLogger().child({ component: 'flexible-scheduler' })

  constructor() {
    this.db = getDatabaseServiceSync()
    this.failureMonitor = new AgentFailureMonitor()
  }

  /**
   * Auto-découvre et charge tous les agents disponibles dans le registry
   */
  private async loadAvailableAgents(): Promise<void> {
    const operationLogger = this.logger.startOperation('load-available-agents')

    try {
      // Chemin vers le répertoire des agents compilés
      const agentsRegistryPath = path.join(
        __dirname,
        '../../../agents/dist/registry'
      )

      if (!fs.existsSync(agentsRegistryPath)) {
        operationLogger.warn('Répertoire des agents non trouvé', {
          path: agentsRegistryPath,
        })
        return
      }

      // Lire tous les fichiers de registry
      const registryFiles = fs
        .readdirSync(agentsRegistryPath)
        .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
        .filter((file) => !file.endsWith('.d.ts'))

      operationLogger.info('Fichiers de registry trouvés', {
        count: registryFiles.length,
        files: registryFiles,
      })

      // Charger chaque agent
      for (const file of registryFiles) {
        try {
          const filePath = path.join(agentsRegistryPath, file)
          operationLogger.info("Chargement de l'agent", { file, filePath })
          await import(filePath)
        } catch (error) {
          operationLogger.error(`Erreur lors du chargement de ${file}`, { file }, error as Error)
        }
      }

      // Afficher les types d'agents enregistrés
      const registeredTypes = agentRegistry.getRegisteredTypes()
      operationLogger.info('Agents enregistrés avec succès', {
        count: registeredTypes.length,
        types: registeredTypes,
      })

      operationLogger.completeOperation('Auto-découverte des agents terminée')
    } catch (error) {
      operationLogger.failOperation(
        "Erreur lors de l'auto-découverte des agents",
        {},
        error as Error
      )
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return

    const operationLogger = this.logger.startOperation('start-scheduler')

    // Auto-découvrir et charger les agents disponibles
    await this.loadAvailableAgents()

    // Load all active agents from database
    const agents = await this.db.getAgents(false) // Only active agents

    for (const agent of agents) {
      await this.registerAgent(agent.id)
    }

    this.isRunning = true

    // Démarrer le monitoring périodique des échecs consécutifs
    this.startFailureMonitoring()

    operationLogger.completeOperation('Scheduler démarré avec succès', {
      activeJobs: this.jobs.size,
    })
  }

  async stop(): Promise<void> {
    const operationLogger = this.logger.startOperation('stop-scheduler')

    // Stop all scheduled jobs
    const stoppedJobs = []
    for (const [agentId, job] of this.jobs.entries()) {
      clearTimeout(job.timeoutId)
      stoppedJobs.push(agentId)
      this.logger.debug('Job arrêté', { agentId })
    }

    this.jobs.clear()

    // Arrêter le monitoring périodique
    this.stopFailureMonitoring()

    this.isRunning = false
    operationLogger.completeOperation('Scheduler arrêté', {
      stoppedJobs: stoppedJobs.length,
    })
  }

  async registerAgent(agentId: string): Promise<void> {
    try {
      const agent = await this.db.getAgent(agentId)
      if (!agent || !agent.isActive) {
        this.logger.debug('Agent inactif, enregistrement ignoré', { agentId })
        return
      }

      // Stop existing job if any
      const existingJob = this.jobs.get(agentId)
      if (existingJob) {
        clearTimeout(existingJob.timeoutId)
        this.jobs.delete(agentId)
      }

      // Parse and validate frequency config
      const frequencyConfig = agent.frequency as unknown as FrequencyConfig
      const validation = validateFrequencyConfig(frequencyConfig)
      if (!validation.valid) {
        this.logger.error('Configuration de fréquence invalide', {
          agentId,
          errors: validation.errors,
        })
        return
      }

      // Calculate next run (always recalculate from now)
      const nextRun = calculateNextRun(frequencyConfig)

      // Update nextRunAt in database
      await this.db.updateAgent(agentId, { nextRunAt: nextRun.nextRunAt })

      // Schedule the job
      const timeoutId = setTimeout(() => {
        this.executeAndReschedule(agentId).catch((error) => {
          this.logger.error("Erreur d'exécution d'agent", { agentId }, error as Error)
        })
      }, nextRun.delayMs)

      this.jobs.set(agentId, {
        agentId,
        timeoutId,
        nextRunAt: nextRun.nextRunAt,
      })

      this.logger.info('Agent enregistré avec succès', {
        agentId,
        name: agent.name,
        frequency: formatFrequencyConfig(frequencyConfig),
        nextRun: nextRun.description,
        delayMs: nextRun.delayMs,
      })
    } catch (error) {
      this.logger.error("Erreur lors de l'enregistrement de l'agent", { agentId }, error as Error)
    }
  }

  /**
   * Exécute un agent et le replanifie pour la prochaine exécution
   */
  private async executeAndReschedule(agentId: string): Promise<void> {
    try {
      // Exécuter l'agent
      await this.executeAgent(agentId, false)
    } catch (error) {
      this.logger.error("Erreur lors de l'exécution", { agentId }, error as Error)
    }

    // Toujours replanifier, même en cas d'erreur
    try {
      const agent = await this.db.getAgent(agentId)
      if (agent && agent.isActive) {
        const frequencyConfig = agent.frequency as unknown as FrequencyConfig
        const nextRun = calculateNextRun(frequencyConfig)

        // Update nextRunAt in database
        await this.db.updateAgent(agentId, { nextRunAt: nextRun.nextRunAt })

        // Schedule next execution
        const timeoutId = setTimeout(() => {
          this.executeAndReschedule(agentId).catch((error) => {
            this.logger.error("Erreur d'exécution d'agent", { agentId }, error as Error)
          })
        }, nextRun.delayMs)

        this.jobs.set(agentId, {
          agentId,
          timeoutId,
          nextRunAt: nextRun.nextRunAt,
        })

        this.logger.info('Agent replanifié', {
          agentId,
          nextRun: nextRun.description,
          delayMs: nextRun.delayMs,
        })
      }
    } catch (error) {
      this.logger.error('Erreur lors de la replanification', { agentId }, error as Error)
    }
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const job = this.jobs.get(agentId)
    if (job) {
      clearTimeout(job.timeoutId)
      this.jobs.delete(agentId)
      this.logger.info('Agent désenregistré', { agentId })
    }

    // Clear nextRunAt in database
    await this.db.updateAgent(agentId, { nextRunAt: null })
  }

  async updateAgent(agentId: string): Promise<void> {
    // Simply re-register the agent (will stop existing job and create new one)
    await this.registerAgent(agentId)
  }

  async runAgent(agentId: string): Promise<string> {
    this.logger.info('Exécution manuelle déclenchée', { agentId })
    return await this.executeAgent(agentId, true) // Force manual execution
  }

  private async executeAgent(
    agentId: string,
    forceExecution = false
  ): Promise<string> {
    const startTime = new Date()
    const executionLogger = createAgentLogger(agentId).startOperation(
      'execute-agent',
      { forceExecution }
    )
    let runId: string = ''

    try {
      // Get agent configuration
      const agentConfig = await this.db.getAgent(agentId)
      if (!agentConfig) {
        throw new Error(`Agent ${agentId} not found`)
      }

      if (!agentConfig.isActive && !forceExecution) {
        executionLogger.info('Agent inactif, exécution programmée ignorée', {
          agentId,
        })
        return ''
      }

      if (!agentConfig.isActive && forceExecution) {
        executionLogger.warn("Exécution forcée d'un agent inactif", { agentId })
      }

      // Validation de la configuration avant exécution
      await this.validateAgentConfiguration(agentConfig)

      // Create run record
      const run = await this.db.createRun(agentId)
      runId = run.id

      executionLogger.info("Démarrage de l'exécution", {
        agentName: agentConfig.name,
        runId,
      })

      // Create logger for this run
      const logger = createLogger(agentConfig.name, agentId, runId)

      // Create agent context
      const context: AgentContext = {
        runId,
        startedAt: startTime,
        logger,
        config: (agentConfig.config as Record<string, unknown>) || {},
      }

      // Get agent instance from registry
      const config = (agentConfig.config as Record<string, unknown>) || {}
      const agentType = (config.agentType as string) || agentConfig.type

      executionLogger.info("Résolution du type d'agent", {
        agentType,
        category: agentConfig.type,
        hasSpecificType: !!config.agentType,
      })

      const agent = agentRegistry.create(agentType, {
        id: agentConfig.id,
        name: agentConfig.name,
        description: agentConfig.description,
        type: agentConfig.type,
        frequency: agentConfig.frequency,
        isActive: agentConfig.isActive,
        config: agentConfig.config,
      })

      if (!agent) {
        throw new Error(
          `No agent implementation found for type: ${agentType}. Available types: ${agentRegistry.getRegisteredTypes().join(', ')}`
        )
      }

      // Execute the agent
      const result = await agent.run(context)

      // Update run with results
      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()

      await this.db.updateRun(runId, {
        status: result.success ? 'SUCCESS' : 'FAILED',
        endedAt: endTime,
        duration,
        result: {
          ...result,
          extractedDataCount: result.extractedData?.length || 0,
          proposalsCount: result.proposals?.length || 0,
        },
        error: result.success ? undefined : result.message,
      })

      executionLogger.completeOperation('Exécution terminée avec succès', {
        agentName: agentConfig.name,
        duration,
        proposalsCreated: result.proposals?.length || 0,
      })
      return runId
    } catch (error) {
      executionLogger.failOperation("Échec de l'exécution", { agentId }, error as Error)

      if (runId) {
        // Update run with error
        const endTime = new Date()
        const duration = endTime.getTime() - startTime.getTime()

        await this.db.updateRun(runId, {
          status: 'FAILED',
          endedAt: endTime,
          duration,
          error: error instanceof Error ? error.message : String(error),
        })

        // Vérifier les échecs consécutifs après un échec
        this.checkAgentForAutoDisable(agentId).catch((autoDisableError) => {
          console.error(
            `Error during auto-disable check for agent ${agentId}:`,
            autoDisableError
          )
        })
      }

      throw error
    }
  }

  async getAgentStatus(agentId: string): Promise<any> {
    try {
      // Only fetch agent + last run, not 100 logs
      const agent = await this.db.prisma.agent.findUnique({
        where: { id: agentId },
        include: {
          runs: {
            orderBy: { startedAt: 'desc' },
            take: 1
          }
        }
      })
      if (!agent) return null

      const job = this.jobs.get(agentId)
      const lastRun = agent.runs[0]
      const frequencyConfig = agent.frequency as unknown as FrequencyConfig

      return {
        isScheduled: !!job,
        isActive: agent.isActive,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              startedAt: lastRun.startedAt,
              endedAt: lastRun.endedAt,
              duration: lastRun.duration,
              error: lastRun.error,
            }
          : null,
        nextRun: job?.nextRunAt || (agent as any).nextRunAt || null,
        frequency: formatFrequencyConfig(frequencyConfig),
        frequencyConfig,
      }
    } catch (error) {
      console.error(`Failed to get status for agent ${agentId}:`, error)
      return null
    }
  }

  getScheduledAgents(): string[] {
    return Array.from(this.jobs.keys())
  }

  /**
   * Valide la configuration d'un agent avant son exécution
   */
  private async validateAgentConfiguration(agentConfig: any): Promise<void> {
    const config = agentConfig.config || {}
    const configSchema = config.configSchema || {}

    // Vérifier si l'agent nécessite une base de données source
    if (configSchema.sourceDatabase) {
      const sourceDatabase = config.sourceDatabase

      if (!sourceDatabase) {
        const errorMessage = `❌ Configuration incomplète : L'agent "${agentConfig.name}" nécessite une base de données source mais aucune n'a été sélectionnée.`

        console.error(errorMessage)
        console.error(`🔧 Pour résoudre ce problème :`)
        console.error(`   1. Allez dans l'édition de l'agent`)
        console.error(
          `   2. Sélectionnez une base de données active dans le champ "Base de données source"`
        )
        console.error(`   3. Sauvegardez la configuration`)

        await this.db.createLog({
          agentId: agentConfig.id,
          level: 'ERROR',
          message:
            errorMessage +
            " Veuillez configurer une base de données source dans les paramètres de l'agent.",
          data: {
            configSchema: configSchema.sourceDatabase,
            currentValue: sourceDatabase,
            solution:
              "Sélectionnez une base de données active dans la configuration de l'agent",
          },
        })

        throw new Error(
          errorMessage +
            " Veuillez éditer l'agent et sélectionner une base de données source active."
        )
      }

      // Vérifier si la base de données existe et est active
      try {
        const database = await this.db.getDatabaseConnection(sourceDatabase)
        if (!database) {
          const errorMessage = `❌ Base de données introuvable : L'agent "${agentConfig.name}" référence une base de données (ID: ${sourceDatabase}) qui n'existe plus.`

          console.error(errorMessage)

          await this.db.createLog({
            agentId: agentConfig.id,
            level: 'ERROR',
            message: errorMessage + ' Veuillez sélectionner une base de données valide.',
            data: {
              invalidDatabaseId: sourceDatabase,
              solution:
                'Sélectionnez une base de données existante dans la configuration',
            },
          })

          throw new Error(
            errorMessage +
              " Veuillez éditer l'agent et sélectionner une base de données existante."
          )
        }

        if (!database.isActive) {
          const errorMessage = `⚠️ Base de données inactive : L'agent "${agentConfig.name}" utilise la base "${database.name}" qui est désactivée.`

          console.warn(errorMessage)

          await this.db.createLog({
            agentId: agentConfig.id,
            level: 'WARN',
            message:
              errorMessage +
              " Veuillez activer la base de données ou en sélectionner une autre.",
            data: {
              databaseName: database.name,
              databaseId: sourceDatabase,
              isActive: database.isActive,
              solution:
                'Activez la base de données ou sélectionnez-en une active',
            },
          })

          throw new Error(
            errorMessage +
              " Veuillez activer cette base de données ou en sélectionner une active."
          )
        }

        console.log(`✅ Base de données valide : "${database.name}" (${database.type})`)
      } catch (dbError) {
        if (dbError instanceof Error && dbError.message.includes('❌')) {
          throw dbError
        }

        const errorMessage = `❌ Erreur technique : Impossible de vérifier la base de données de l'agent "${agentConfig.name}".`
        console.error(errorMessage, dbError)

        await this.db.createLog({
          agentId: agentConfig.id,
          level: 'ERROR',
          message: errorMessage,
          data: {
            technicalError: dbError instanceof Error ? dbError.message : String(dbError),
            databaseId: sourceDatabase,
          },
        })

        throw new Error(errorMessage + ' Erreur technique lors de la validation.')
      }
    }
  }

  /**
   * Démarre le monitoring périodique des échecs consécutifs
   */
  private async startFailureMonitoring(): Promise<void> {
    if (!(await settingsService.isAutoDisablingEnabled())) {
      console.log('📋 Auto-disabling is disabled, skipping failure monitoring')
      return
    }

    const intervalMinutes = await settingsService.getCheckIntervalMinutes()
    const intervalMs = intervalMinutes * 60 * 1000

    console.log(
      `📋 Starting failure monitoring (checking every ${intervalMinutes} minutes)`
    )

    this.monitoringInterval = setInterval(async () => {
      try {
        console.log('🔍 Performing periodic failure monitoring check...')
        await this.failureMonitor.checkAllAgentsForAutoDisable()
      } catch (error) {
        console.error('❌ Error during periodic failure monitoring:', error)
      }
    }, intervalMs)

    // Exécuter une première vérification immédiatement
    setTimeout(() => {
      this.failureMonitor.checkAllAgentsForAutoDisable().catch((error) => {
        console.error('❌ Error during initial failure monitoring check:', error)
      })
    }, 10000)
  }

  /**
   * Arrête le monitoring périodique
   */
  private stopFailureMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      console.log('📋 Failure monitoring stopped')
    }
  }

  /**
   * Vérifie un agent spécifique pour une éventuelle désactivation automatique
   */
  private async checkAgentForAutoDisable(agentId: string): Promise<void> {
    try {
      const wasDisabled = await this.failureMonitor.autoDisableAgentIfNeeded(agentId)

      if (wasDisabled) {
        await this.unregisterAgent(agentId)
        console.log(`🗑 Agent ${agentId} unregistered from scheduler due to auto-disable`)
      }
    } catch (error) {
      console.error(`Error checking agent ${agentId} for auto-disable:`, error)
    }
  }

  /**
   * Obtient un rapport détaillé sur les échecs consécutifs
   */
  async getFailureReport() {
    return await this.failureMonitor.getFailureReport()
  }
}

// Export the old name as alias for backwards compatibility during transition
export { FlexibleScheduler as AgentScheduler }

// Singleton instance - ensures a single scheduler across the entire application
let _schedulerInstance: FlexibleScheduler | null = null

export function getScheduler(): FlexibleScheduler {
  if (!_schedulerInstance) {
    _schedulerInstance = new FlexibleScheduler()
  }
  return _schedulerInstance
}
