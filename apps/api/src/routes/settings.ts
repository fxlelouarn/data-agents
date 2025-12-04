import { Router, Request, Response } from 'express'
import { settingsService } from '../config/settings'
import { AgentFailureMonitor } from '../services/agent-failure-monitor'
import { updateAutoApplyScheduler } from '../services/update-auto-apply-scheduler'

const router = Router()
const failureMonitor = new AgentFailureMonitor()

/**
 * GET /api/settings
 * Récupère tous les paramètres système
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await settingsService.getSettings()

    res.json({
      success: true,
      data: settings
    })
  } catch (error) {
    console.error('Error fetching settings:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * PUT /api/settings
 * Met à jour les paramètres système
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const { maxConsecutiveFailures, enableAutoDisabling, checkIntervalMinutes, meilisearchUrl, meilisearchApiKey } = req.body

    // Validation des données
    if (maxConsecutiveFailures !== undefined) {
      if (typeof maxConsecutiveFailures !== 'number' || maxConsecutiveFailures < 1) {
        return res.status(400).json({
          success: false,
          message: 'maxConsecutiveFailures must be a number >= 1'
        })
      }
      await settingsService.updateSetting('maxConsecutiveFailures', maxConsecutiveFailures)
    }

    if (enableAutoDisabling !== undefined) {
      if (typeof enableAutoDisabling !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'enableAutoDisabling must be a boolean'
        })
      }
      await settingsService.updateSetting('enableAutoDisabling', enableAutoDisabling)
    }

    if (checkIntervalMinutes !== undefined) {
      if (typeof checkIntervalMinutes !== 'number' || checkIntervalMinutes < 1) {
        return res.status(400).json({
          success: false,
          message: 'checkIntervalMinutes must be a number >= 1'
        })
      }
      await settingsService.updateSetting('checkIntervalMinutes', checkIntervalMinutes)
    }

    if (meilisearchUrl !== undefined) {
      if (meilisearchUrl !== null && (typeof meilisearchUrl !== 'string' || !meilisearchUrl.trim())) {
        return res.status(400).json({
          success: false,
          message: 'meilisearchUrl must be a non-empty string or null'
        })
      }
      await settingsService.updateSetting('meilisearchUrl', meilisearchUrl)
    }

    if (meilisearchApiKey !== undefined) {
      if (meilisearchApiKey !== null && (typeof meilisearchApiKey !== 'string' || !meilisearchApiKey.trim())) {
        return res.status(400).json({
          success: false,
          message: 'meilisearchApiKey must be a non-empty string or null'
        })
      }
      await settingsService.updateSetting('meilisearchApiKey', meilisearchApiKey)
    }

    // Auto-apply settings
    const { enableAutoApplyUpdates, autoApplyIntervalMinutes } = req.body

    if (enableAutoApplyUpdates !== undefined) {
      if (typeof enableAutoApplyUpdates !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'enableAutoApplyUpdates must be a boolean'
        })
      }
      await settingsService.updateSetting('enableAutoApplyUpdates', enableAutoApplyUpdates)

      // Restart scheduler with new settings
      if (enableAutoApplyUpdates) {
        await updateAutoApplyScheduler.start()
      } else {
        updateAutoApplyScheduler.stop()
      }
    }

    if (autoApplyIntervalMinutes !== undefined) {
      if (typeof autoApplyIntervalMinutes !== 'number' || autoApplyIntervalMinutes < 5 || autoApplyIntervalMinutes > 1440) {
        return res.status(400).json({
          success: false,
          message: 'autoApplyIntervalMinutes must be a number between 5 and 1440'
        })
      }
      await settingsService.updateSetting('autoApplyIntervalMinutes', autoApplyIntervalMinutes)

      // Restart scheduler with new interval if enabled
      const settings = await settingsService.getSettings()
      if (settings.enableAutoApplyUpdates) {
        await updateAutoApplyScheduler.restart()
      }
    }

    const updatedSettings = await settingsService.getSettings()

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: updatedSettings
    })
  } catch (error) {
    console.error('Error updating settings:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * GET /api/settings/failure-report
 * Récupère un rapport détaillé sur les échecs consécutifs des agents
 */
router.get('/failure-report', async (req: Request, res: Response) => {
  try {
    const report = await failureMonitor.getFailureReport()
    const maxConsecutiveFailures = await settingsService.getMaxConsecutiveFailures()
    const enableAutoDisabling = await settingsService.isAutoDisablingEnabled()

    res.json({
      success: true,
      data: {
        settings: {
          maxConsecutiveFailures,
          enableAutoDisabling
        },
        agents: report,
        summary: {
          totalAgentsWithFailures: report.length,
          agentsAtRisk: report.filter(agent => agent.shouldDisable).length,
          agentsWithWarnings: report.filter(agent =>
            agent.consecutiveFailures >= maxConsecutiveFailures / 2 &&
            !agent.shouldDisable
          ).length
        }
      }
    })
  } catch (error) {
    console.error('Error generating failure report:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to generate failure report',
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * POST /api/settings/check-failures
 * Lance manuellement une vérification de tous les agents pour désactivation automatique
 */
router.post('/check-failures', async (req: Request, res: Response) => {
  try {
    const result = await failureMonitor.checkAllAgentsForAutoDisable()

    res.json({
      success: true,
      message: 'Failure check completed',
      data: result
    })
  } catch (error) {
    console.error('Error during manual failure check:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to perform failure check',
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * GET /api/settings/agent/:agentId/failures
 * Récupère les détails des échecs consécutifs pour un agent spécifique
 */
router.get('/agent/:agentId/failures', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params
    const failureCheck = await failureMonitor.checkAgentConsecutiveFailures(agentId)

    if (!failureCheck) {
      return res.json({
        success: true,
        data: {
          agentId,
          consecutiveFailures: 0,
          shouldDisable: false,
          message: 'No consecutive failures found for this agent'
        }
      })
    }

    res.json({
      success: true,
      data: {
        ...failureCheck,
        settings: {
          maxConsecutiveFailures: await settingsService.getMaxConsecutiveFailures(),
          enableAutoDisabling: await settingsService.isAutoDisablingEnabled()
        }
      }
    })
  } catch (error) {
    console.error(`Error checking failures for agent ${req.params.agentId}:`, error)
    res.status(500).json({
      success: false,
      message: 'Failed to check agent failures',
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * GET /api/settings/auto-apply-status
 * Récupère le statut de l'auto-apply
 */
router.get('/auto-apply-status', async (req: Request, res: Response) => {
  try {
    const autoApplySettings = await settingsService.getAutoApplySettings()
    const isRunning = updateAutoApplyScheduler.isRunning()

    res.json({
      success: true,
      data: {
        ...autoApplySettings,
        isSchedulerRunning: isRunning,
        isCurrentlyApplying: updateAutoApplyScheduler.isCurrentlyApplying()
      }
    })
  } catch (error) {
    console.error('Error fetching auto-apply status:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch auto-apply status',
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

/**
 * POST /api/settings/run-auto-apply
 * Lance manuellement une exécution de l'auto-apply
 */
router.post('/run-auto-apply', async (req: Request, res: Response) => {
  try {
    if (updateAutoApplyScheduler.isCurrentlyApplying()) {
      return res.status(409).json({
        success: false,
        message: 'Auto-apply is already running'
      })
    }

    const result = await updateAutoApplyScheduler.runNow()

    res.json({
      success: true,
      message: 'Auto-apply completed',
      data: result
    })
  } catch (error) {
    console.error('Error during manual auto-apply:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to run auto-apply',
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

export { router as settingsRouter }
