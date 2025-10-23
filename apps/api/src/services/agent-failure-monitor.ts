import { DatabaseService, createApiLogger } from '@data-agents/database'
import { settingsService } from '../config/settings'

export interface ConsecutiveFailureCheck {
  agentId: string
  agentName: string
  consecutiveFailures: number
  shouldDisable: boolean
  lastFailureAt: Date
  recentRuns: {
    id: string
    status: string
    startedAt: Date
    error?: string
  }[]
}

export class AgentFailureMonitor {
  private db: DatabaseService
  private logger = createApiLogger().child({ component: 'failure-monitor' })

  constructor() {
    this.db = new DatabaseService()
  }

  /**
   * Vérifie les échecs consécutifs d'un agent spécifique
   */
  async checkAgentConsecutiveFailures(agentId: string): Promise<ConsecutiveFailureCheck | null> {
    try {
      const agent = await this.db.getAgent(agentId)
      if (!agent || !agent.isActive) {
        return null
      }

      const maxFailures = await settingsService.getMaxConsecutiveFailures()
      
      // Récupérer les derniers runs de l'agent, triés par date décroissante
      const recentRuns = await this.db.getAgentRuns(agentId, maxFailures + 5) // On prend un peu plus pour être sûr
      
      if (recentRuns.length === 0) {
        return null
      }

      // Compter les échecs consécutifs à partir du run le plus récent
      let consecutiveFailures = 0
      let lastFailureAt: Date | null = null
      const failedRuns = []

      for (const run of recentRuns) {
        if (run.status === 'FAILED') {
          consecutiveFailures++
          if (!lastFailureAt) {
            lastFailureAt = run.startedAt
          }
          failedRuns.push({
            id: run.id,
            status: run.status,
            startedAt: run.startedAt,
            error: run.error || undefined
          })
        } else {
          // Dès qu'on trouve un run réussi, on arrête le comptage
          break
        }
      }

      if (consecutiveFailures === 0) {
        return null
      }

      const shouldDisable = consecutiveFailures >= maxFailures

      return {
        agentId,
        agentName: agent.name,
        consecutiveFailures,
        shouldDisable,
        lastFailureAt: lastFailureAt!,
        recentRuns: failedRuns
      }

    } catch (error) {
      this.logger.error('Erreur lors de la vérification des échecs consécutifs', { agentId }, error as Error)
      return null
    }
  }

  /**
   * Désactive automatiquement un agent en cas de trop d'échecs consécutifs
   */
  async autoDisableAgentIfNeeded(agentId: string): Promise<boolean> {
    if (!(await settingsService.isAutoDisablingEnabled())) {
      return false
    }

    try {
      const failureCheck = await this.checkAgentConsecutiveFailures(agentId)
      
      if (!failureCheck || !failureCheck.shouldDisable) {
        return false
      }

      // Désactiver l'agent
      await this.db.updateAgent(agentId, { isActive: false })

      // Logger la désactivation automatique
      const logMessage = `🚨 Agent automatiquement désactivé après ${failureCheck.consecutiveFailures} échecs consécutifs`
      const logDetails = {
        reason: 'AUTO_DISABLED_CONSECUTIVE_FAILURES',
        consecutiveFailures: failureCheck.consecutiveFailures,
        maxAllowed: await settingsService.getMaxConsecutiveFailures(),
        lastFailureAt: failureCheck.lastFailureAt,
        recentFailedRuns: failureCheck.recentRuns.map(run => ({
          id: run.id,
          startedAt: run.startedAt,
          error: run.error?.substring(0, 200) + (run.error && run.error.length > 200 ? '...' : '')
        }))
      }

      await this.db.createLog({
        agentId,
        level: 'WARN',
        message: logMessage,
        data: logDetails
      })

      this.logger.warn('Agent automatiquement désactivé', {
        agentId,
        agentName: failureCheck.agentName,
        consecutiveFailures: failureCheck.consecutiveFailures,
        maxAllowed: await settingsService.getMaxConsecutiveFailures()
      })
      
      return true

    } catch (error) {
      this.logger.error('Erreur lors de la vérification auto-désactivation', { agentId }, error as Error)
      
      // Logger l'erreur
      await this.db.createLog({
        agentId,
        level: 'ERROR',
        message: 'Erreur lors de la vérification automatique de désactivation',
        data: {
          error: error instanceof Error ? error.message : String(error)
        }
      })
      
      return false
    }
  }

  /**
   * Vérifie tous les agents actifs et désactive ceux qui ont trop d'échecs consécutifs
   */
  async checkAllAgentsForAutoDisable(): Promise<{
    checkedAgents: number
    disabledAgents: string[]
  }> {
    if (!(await settingsService.isAutoDisablingEnabled())) {
      return { checkedAgents: 0, disabledAgents: [] }
    }

    try {
      const activeAgents = await this.db.getAgents(false) // Seulement les agents actifs
      const disabledAgents: string[] = []

      this.logger.info('Vérification des échecs consécutifs', { 
        activeAgentsCount: activeAgents.length 
      })

      for (const agent of activeAgents) {
        const wasDisabled = await this.autoDisableAgentIfNeeded(agent.id)
        if (wasDisabled) {
          disabledAgents.push(agent.id)
        }
      }

      if (disabledAgents.length > 0) {
        this.logger.warn('Agents auto-désactivés pour échecs consécutifs', {
          count: disabledAgents.length,
          disabledAgents
        })
      } else {
        this.logger.info('Aucun agent à auto-désactiver')
      }

      return {
        checkedAgents: activeAgents.length,
        disabledAgents
      }

    } catch (error) {
      this.logger.error('Erreur lors de la vérification en lot', {}, error as Error)
      return { checkedAgents: 0, disabledAgents: [] }
    }
  }

  /**
   * Vérifie si un agent inactif a été auto-désactivé récemment (dans les 24h)
   */
  async checkRecentlyAutoDisabledAgent(agentId: string): Promise<ConsecutiveFailureCheck | null> {
    try {
      const agent = await this.db.getAgent(agentId)
      if (!agent || agent.isActive) {
        return null
      }

      // Chercher des logs de désactivation automatique dans les 24 dernières heures
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      
      // Récupérer les runs récents pour analyser les échecs
      const recentRuns = await this.db.getAgentRuns(agentId, 10)
      
      if (recentRuns.length === 0) {
        return null
      }
      
      // Compter les échecs consécutifs
      let consecutiveFailures = 0
      let lastFailureAt: Date | null = null
      const failedRuns = []
      
      for (const run of recentRuns) {
        if (run.status === 'FAILED') {
          consecutiveFailures++
          if (!lastFailureAt) {
            lastFailureAt = run.startedAt
          }
          failedRuns.push({
            id: run.id,
            status: run.status,
            startedAt: run.startedAt,
            error: run.error || undefined
          })
        } else {
          break
        }
      }
      
      // Si pas d'échecs ou si les échecs ne justifient pas une auto-désactivation, ignorer
      if (consecutiveFailures < (await settingsService.getMaxConsecutiveFailures())) {
        return null
      }
      
      return {
        agentId,
        agentName: agent.name,
        consecutiveFailures,
        shouldDisable: true, // Déjà désactivé
        lastFailureAt: lastFailureAt!,
        recentRuns: failedRuns
      }
      
    } catch (error) {
      console.error(`Error checking recently auto-disabled agent ${agentId}:`, error)
      return null
    }
  }

  /**
   * Obtient un rapport détaillé sur les échecs consécutifs de tous les agents
   */
  async getFailureReport(): Promise<ConsecutiveFailureCheck[]> {
    try {
      const allAgents = await this.db.getAgents(true) // Inclure les agents inactifs
      const report: ConsecutiveFailureCheck[] = []

      for (const agent of allAgents) {
        // Pour les agents inactifs, vérifier s'ils ont été auto-désactivés récemment
        if (!agent.isActive) {
          const recentAutoDisableCheck = await this.checkRecentlyAutoDisabledAgent(agent.id)
          if (recentAutoDisableCheck) {
            report.push(recentAutoDisableCheck)
          }
        } else {
          // Pour les agents actifs, utiliser la logique normale
          const failureCheck = await this.checkAgentConsecutiveFailures(agent.id)
          if (failureCheck && failureCheck.consecutiveFailures > 0) {
            report.push(failureCheck)
          }
        }
      }

      // Trier par nombre d'échecs décroissant
      report.sort((a, b) => b.consecutiveFailures - a.consecutiveFailures)

      return report

    } catch (error) {
      console.error('Error generating failure report:', error)
      return []
    }
  }
}