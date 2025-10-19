import { Router, Request, Response } from 'express'
import { settingsService } from '../config/settings'
import { AgentFailureMonitor } from '../services/agent-failure-monitor'

const router = Router()
const failureMonitor = new AgentFailureMonitor()

/**
 * GET /api/settings
 * Récupère tous les paramètres système
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = settingsService.getSettings()
    
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
    const { maxConsecutiveFailures, enableAutoDisabling, checkIntervalMinutes } = req.body

    // Validation des données
    if (maxConsecutiveFailures !== undefined) {
      if (typeof maxConsecutiveFailures !== 'number' || maxConsecutiveFailures < 1) {
        return res.status(400).json({
          success: false,
          message: 'maxConsecutiveFailures must be a number >= 1'
        })
      }
      settingsService.updateSetting('maxConsecutiveFailures', maxConsecutiveFailures)
    }

    if (enableAutoDisabling !== undefined) {
      if (typeof enableAutoDisabling !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'enableAutoDisabling must be a boolean'
        })
      }
      settingsService.updateSetting('enableAutoDisabling', enableAutoDisabling)
    }

    if (checkIntervalMinutes !== undefined) {
      if (typeof checkIntervalMinutes !== 'number' || checkIntervalMinutes < 1) {
        return res.status(400).json({
          success: false,
          message: 'checkIntervalMinutes must be a number >= 1'
        })
      }
      settingsService.updateSetting('checkIntervalMinutes', checkIntervalMinutes)
    }

    const updatedSettings = settingsService.getSettings()

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
    
    res.json({
      success: true,
      data: {
        settings: {
          maxConsecutiveFailures: settingsService.getMaxConsecutiveFailures(),
          enableAutoDisabling: settingsService.isAutoDisablingEnabled()
        },
        agents: report,
        summary: {
          totalAgentsWithFailures: report.length,
          agentsAtRisk: report.filter(agent => agent.shouldDisable).length,
          agentsWithWarnings: report.filter(agent => 
            agent.consecutiveFailures >= settingsService.getMaxConsecutiveFailures() / 2 && 
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
          maxConsecutiveFailures: settingsService.getMaxConsecutiveFailures(),
          enableAutoDisabling: settingsService.isAutoDisablingEnabled()
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

export { router as settingsRouter }