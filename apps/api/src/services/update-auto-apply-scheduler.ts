import { PrismaClient } from '@prisma/client'
import { settingsService, AutoApplyLastRunResult } from '../config/settings'
import { sortBlocksByDependencies, BlockApplication } from '@data-agents/database'

/**
 * Service de planification pour l'application automatique des ProposalApplication PENDING
 */
class UpdateAutoApplyScheduler {
  private prisma: PrismaClient
  private intervalId: NodeJS.Timeout | null = null
  private _isRunning: boolean = false
  private _isApplying: boolean = false
  private applicationService: any = null

  constructor() {
    this.prisma = new PrismaClient()
  }

  /**
   * Initialise le service d'application (lazy loading pour éviter les dépendances circulaires)
   */
  private async ensureApplicationService(): Promise<void> {
    if (!this.applicationService) {
      // Import dynamique pour éviter les dépendances circulaires
      const { getDatabaseService } = await import('./database')
      const db = await getDatabaseService()
      this.applicationService = db.proposalApplication

      if (!this.applicationService) {
        throw new Error('ProposalApplicationService not initialized')
      }
    }
  }

  /**
   * Démarre le scheduler si l'auto-apply est activé
   */
  async start(): Promise<void> {
    const settings = await settingsService.getAutoApplySettings()

    if (!settings.enabled) {
      console.log('🔄 Auto-apply disabled, scheduler not started')
      return
    }

    // Arrêter l'ancien interval si existant
    this.stop()

    const intervalMs = settings.intervalMinutes * 60 * 1000

    // Calculer la prochaine exécution
    const nextRunAt = new Date(Date.now() + intervalMs)
    await settingsService.updateAutoApplyNextRunAt(nextRunAt)

    this.intervalId = setInterval(async () => {
      await this.runScheduledApply()
    }, intervalMs)

    this._isRunning = true
    console.log(`🔄 Auto-apply scheduler started (interval: ${settings.intervalMinutes} minutes)`)
    console.log(`   Next run at: ${nextRunAt.toLocaleString()}`)
  }

  /**
   * Arrête le scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this._isRunning = false
    console.log('🔄 Auto-apply scheduler stopped')
  }

  /**
   * Redémarre le scheduler avec les nouveaux paramètres
   */
  async restart(): Promise<void> {
    this.stop()
    await this.start()
  }

  /**
   * Vérifie si le scheduler est actif
   */
  isRunning(): boolean {
    return this._isRunning
  }

  /**
   * Vérifie si une application est en cours
   */
  isCurrentlyApplying(): boolean {
    return this._isApplying
  }

  /**
   * Exécution planifiée (appelée par setInterval)
   */
  private async runScheduledApply(): Promise<void> {
    try {
      // Mettre à jour la prochaine exécution
      const settings = await settingsService.getAutoApplySettings()
      const nextRunAt = new Date(Date.now() + settings.intervalMinutes * 60 * 1000)
      await settingsService.updateAutoApplyNextRunAt(nextRunAt)

      await this.applyAllPendingUpdates()
    } catch (error) {
      console.error('❌ Scheduled auto-apply failed:', error instanceof Error ? error.message : error)
      // Ne pas re-throw pour éviter de casser le setInterval
    }
  }

  /**
   * Exécute l'auto-apply maintenant (manuellement)
   */
  async runNow(): Promise<AutoApplyLastRunResult> {
    return await this.applyAllPendingUpdates()
  }

  /**
   * Applique toutes les mises à jour PENDING
   */
  private async applyAllPendingUpdates(): Promise<AutoApplyLastRunResult> {
    if (this._isApplying) {
      console.log('⚠️ Auto-apply already in progress, skipping')
      return {
        success: 0,
        failed: 0,
        errors: ['Auto-apply already in progress'],
        appliedIds: [],
        failedIds: []
      }
    }

    this._isApplying = true
    console.log('🔄 Starting auto-apply of pending updates...')

    const result: AutoApplyLastRunResult = {
      success: 0,
      failed: 0,
      errors: [],
      appliedIds: [],
      failedIds: []
    }

    try {
      await this.ensureApplicationService()

      // Récupérer toutes les applications PENDING
      const pendingApplications = await this.prisma.proposalApplication.findMany({
        where: { status: 'PENDING' },
        include: {
          proposal: {
            include: {
              agent: {
                select: { name: true, type: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      })

      if (pendingApplications.length === 0) {
        console.log('✅ No pending updates to apply')
        await this.saveResult(result)
        return result
      }

      console.log(`📋 Found ${pendingApplications.length} pending updates`)

      // Grouper les applications par proposalId pour trier CHAQUE proposition séparément
      const applicationsByProposal = new Map<string, typeof pendingApplications>()
      for (const app of pendingApplications) {
        const proposalId = app.proposalId
        if (!applicationsByProposal.has(proposalId)) {
          applicationsByProposal.set(proposalId, [])
        }
        applicationsByProposal.get(proposalId)!.push(app)
      }

      // Trier les blocs au sein de chaque proposition, puis concaténer
      const applicationsInOrder: typeof pendingApplications = []
      for (const [_proposalId, apps] of applicationsByProposal) {
        // Trier par dépendances au sein de cette proposition
        const sortedBlocks = sortBlocksByDependencies(
          apps.map((app) => ({
            blockType: app.blockType as BlockApplication['blockType'],
            id: app.id
          }))
        )

        // Récupérer les applications complètes dans l'ordre trié
        const sortedApps = sortedBlocks
          .map((sorted: BlockApplication) => apps.find((app) => app.id === sorted.id)!)
          .filter(Boolean)

        applicationsInOrder.push(...sortedApps)
      }

      console.log(`📋 Processing ${applicationsByProposal.size} proposal(s) with ${applicationsInOrder.length} application(s)`)
      console.log(`📋 Execution order: ${applicationsInOrder.map((a) => `${a.proposal.eventName}:${a.blockType || 'full'}`).join(' → ')}`)

      // Appliquer chaque mise à jour
      for (const application of applicationsInOrder) {
        try {
          const applyResult = await this.applySingleUpdate(application)

          if (applyResult.success) {
            result.success++
            result.appliedIds.push(application.id)
          } else {
            result.failed++
            result.failedIds.push(application.id)
            if (applyResult.error) {
              result.errors.push(`${application.id}: ${applyResult.error}`)
            }
          }
        } catch (error) {
          result.failed++
          result.failedIds.push(application.id)
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`${application.id}: ${errorMsg}`)
          console.error(`❌ Error applying update ${application.id}:`, errorMsg)
        }
      }

      console.log(`✅ Auto-apply completed: ${result.success} success, ${result.failed} failed`)

    } catch (error) {
      console.error('❌ Auto-apply failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      this._isApplying = false
      await this.saveResult(result)
    }

    return result
  }

  /**
   * Applique une seule mise à jour
   */
  private async applySingleUpdate(application: any): Promise<{ success: boolean; error?: string }> {
    const logs: string[] = []

    try {
      logs.push(`[${new Date().toISOString()}] Auto-apply starting...`)

      const applyOptions: any = {
        capturedLogs: logs,
        proposalId: application.proposalId,
        userEmail: 'auto-scheduler'  // ✅ Identifiant pour les applications automatiques
      }

      if (application.proposalIds && application.proposalIds.length > 0) {
        applyOptions.proposalIds = application.proposalIds
      }

      if (application.blockType) {
        applyOptions.blockType = application.blockType
      }

      const applyResult = await this.applicationService.applyProposal(
        application.proposalId,
        application.proposal.changes as Record<string, any>,
        applyOptions
      )

      if (applyResult.success) {
        logs.push('✅ Successfully applied changes')

        // ✅ FIX: Utiliser applyResult.appliedChanges si application.appliedChanges est vide
        // Un objet vide {} est truthy en JS, donc on vérifie explicitement
        const hasExistingChanges = application.appliedChanges && Object.keys(application.appliedChanges).length > 0
        const finalAppliedChanges = hasExistingChanges ? application.appliedChanges : applyResult.appliedChanges

        await this.prisma.proposalApplication.update({
          where: { id: application.id },
          data: {
            status: 'APPLIED',
            appliedAt: new Date(),
            logs: logs,
            appliedChanges: finalAppliedChanges,
            rollbackData: applyResult.createdIds || null
          }
        })

        return { success: true }
      } else {
        const errorMsg = applyResult.errors?.map((e: any) => e.message).join('; ') || 'Unknown error'
        logs.push(`❌ Application failed: ${errorMsg}`)

        await this.prisma.proposalApplication.update({
          where: { id: application.id },
          data: {
            status: 'FAILED',
            errorMessage: errorMsg,
            logs: logs
          }
        })

        return { success: false, error: errorMsg }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logs.push(`❌ Unexpected error: ${errorMsg}`)

      await this.prisma.proposalApplication.update({
        where: { id: application.id },
        data: {
          status: 'FAILED',
          errorMessage: errorMsg,
          logs: logs
        }
      })

      return { success: false, error: errorMsg }
    }
  }

  /**
   * Sauvegarde le résultat de l'exécution
   */
  private async saveResult(result: AutoApplyLastRunResult): Promise<void> {
    const settings = await settingsService.getAutoApplySettings()
    const nextRunAt = settings.enabled
      ? new Date(Date.now() + settings.intervalMinutes * 60 * 1000)
      : null

    await settingsService.updateAutoApplyLastRun(result, nextRunAt)
  }
}

// Instance singleton
export const updateAutoApplyScheduler = new UpdateAutoApplyScheduler()
