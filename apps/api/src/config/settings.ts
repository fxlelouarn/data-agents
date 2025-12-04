import { PrismaClient } from '@prisma/client'

interface AutoApplyLastRunResult {
  success: number
  failed: number
  errors: string[]
  appliedIds: string[]
  failedIds: string[]
}

interface SystemSettings {
  /**
   * Nombre maximum d'échecs consécutifs avant désactivation automatique d'un agent
   * Par défaut: 3
   */
  maxConsecutiveFailures: number

  /**
   * Activer/désactiver la désactivation automatique des agents
   * Par défaut: true
   */
  enableAutoDisabling: boolean

  /**
   * Intervalle en minutes pour vérifier les agents à désactiver
   * Par défaut: 5 minutes
   */
  checkIntervalMinutes: number

  /**
   * URL du serveur Meilisearch
   * Par défaut: null (non configuré)
   */
  meilisearchUrl: string | null

  /**
   * Clé API Meilisearch
   * Par défaut: null (non configuré)
   */
  meilisearchApiKey: string | null

  /**
   * Activer/désactiver l'application automatique des mises à jour PENDING
   * Par défaut: false
   */
  enableAutoApplyUpdates: boolean

  /**
   * Intervalle en minutes entre chaque exécution de l'auto-apply
   * Par défaut: 60 minutes
   */
  autoApplyIntervalMinutes: number

  /**
   * Date de la dernière exécution de l'auto-apply
   */
  autoApplyLastRunAt: Date | null

  /**
   * Date de la prochaine exécution de l'auto-apply
   */
  autoApplyNextRunAt: Date | null

  /**
   * Résultat de la dernière exécution de l'auto-apply
   */
  autoApplyLastRunResult: AutoApplyLastRunResult | null
}

const defaultSettings: Omit<SystemSettings, 'autoApplyLastRunResult'> & { autoApplyLastRunResult?: any } = {
  maxConsecutiveFailures: 3,
  enableAutoDisabling: true,
  checkIntervalMinutes: 5,
  meilisearchUrl: null,
  meilisearchApiKey: null,
  enableAutoApplyUpdates: false,
  autoApplyIntervalMinutes: 60,
  autoApplyLastRunAt: null,
  autoApplyNextRunAt: null
  // autoApplyLastRunResult is omitted - will use Prisma.JsonNull for null values
}

class SettingsService {
  private prisma: PrismaClient
  private settings: SystemSettings | null = null

  constructor() {
    this.prisma = new PrismaClient()
    this.initSettings()
  }

  private async initSettings() {
    try {
      // Upsert settings avec les valeurs par défaut
      const settings = await this.prisma.settings.upsert({
        where: { id: 'singleton' },
        update: {},
        create: {
          id: 'singleton',
          ...defaultSettings
        }
      })

      this.settings = {
        maxConsecutiveFailures: settings.maxConsecutiveFailures,
        enableAutoDisabling: settings.enableAutoDisabling,
        checkIntervalMinutes: settings.checkIntervalMinutes,
        meilisearchUrl: settings.meilisearchUrl,
        meilisearchApiKey: settings.meilisearchApiKey,
        enableAutoApplyUpdates: settings.enableAutoApplyUpdates,
        autoApplyIntervalMinutes: settings.autoApplyIntervalMinutes,
        autoApplyLastRunAt: settings.autoApplyLastRunAt,
        autoApplyNextRunAt: settings.autoApplyNextRunAt,
        autoApplyLastRunResult: settings.autoApplyLastRunResult as AutoApplyLastRunResult | null
      }

      console.log('⚙️ System Settings loaded from database')
    } catch (error) {
      console.error('❌ Failed to load settings from database:', error)
      this.settings = { ...defaultSettings, autoApplyLastRunResult: null }
    }
  }

  async getSettings(): Promise<SystemSettings> {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } })

    if (!settings) {
      // Créer les settings s'ils n'existent pas
      const created = await this.prisma.settings.create({
        data: {
          id: 'singleton',
          ...defaultSettings
        }
      })

      return {
        maxConsecutiveFailures: created.maxConsecutiveFailures,
        enableAutoDisabling: created.enableAutoDisabling,
        checkIntervalMinutes: created.checkIntervalMinutes,
        meilisearchUrl: created.meilisearchUrl,
        meilisearchApiKey: created.meilisearchApiKey,
        enableAutoApplyUpdates: created.enableAutoApplyUpdates,
        autoApplyIntervalMinutes: created.autoApplyIntervalMinutes,
        autoApplyLastRunAt: created.autoApplyLastRunAt,
        autoApplyNextRunAt: created.autoApplyNextRunAt,
        autoApplyLastRunResult: created.autoApplyLastRunResult as AutoApplyLastRunResult | null
      }
    }

    return {
      maxConsecutiveFailures: settings.maxConsecutiveFailures,
      enableAutoDisabling: settings.enableAutoDisabling,
      checkIntervalMinutes: settings.checkIntervalMinutes,
      meilisearchUrl: settings.meilisearchUrl,
      meilisearchApiKey: settings.meilisearchApiKey,
      enableAutoApplyUpdates: settings.enableAutoApplyUpdates,
      autoApplyIntervalMinutes: settings.autoApplyIntervalMinutes,
      autoApplyLastRunAt: settings.autoApplyLastRunAt,
      autoApplyNextRunAt: settings.autoApplyNextRunAt,
      autoApplyLastRunResult: settings.autoApplyLastRunResult as AutoApplyLastRunResult | null
    }
  }

  async getMaxConsecutiveFailures(): Promise<number> {
    const settings = await this.getSettings()
    return settings.maxConsecutiveFailures
  }

  async isAutoDisablingEnabled(): Promise<boolean> {
    const settings = await this.getSettings()
    return settings.enableAutoDisabling
  }

  async getCheckIntervalMinutes(): Promise<number> {
    const settings = await this.getSettings()
    return settings.checkIntervalMinutes
  }

  async getMeilisearchUrl(): Promise<string | null> {
    const settings = await this.getSettings()
    return settings.meilisearchUrl
  }

  async getMeilisearchApiKey(): Promise<string | null> {
    const settings = await this.getSettings()
    return settings.meilisearchApiKey
  }

  async isMeilisearchConfigured(): Promise<boolean> {
    const settings = await this.getSettings()
    return !!(settings.meilisearchUrl && settings.meilisearchApiKey)
  }

  /**
   * Met à jour un paramètre spécifique
   */
  async updateSetting(key: keyof SystemSettings, value: any): Promise<void> {
    // Validation
    switch (key) {
      case 'maxConsecutiveFailures':
        if (typeof value !== 'number' || value < 1) {
          throw new Error('maxConsecutiveFailures must be a number >= 1')
        }
        break
      case 'enableAutoDisabling':
        if (typeof value !== 'boolean') {
          throw new Error('enableAutoDisabling must be a boolean')
        }
        break
      case 'checkIntervalMinutes':
        if (typeof value !== 'number' || value < 1) {
          throw new Error('checkIntervalMinutes must be a number >= 1')
        }
        break
      case 'meilisearchUrl':
      case 'meilisearchApiKey':
        if (value !== null && typeof value !== 'string') {
          throw new Error(`${key} must be a string or null`)
        }
        break
      case 'enableAutoApplyUpdates':
        if (typeof value !== 'boolean') {
          throw new Error('enableAutoApplyUpdates must be a boolean')
        }
        break
      case 'autoApplyIntervalMinutes':
        if (typeof value !== 'number' || value < 5 || value > 1440) {
          throw new Error('autoApplyIntervalMinutes must be a number between 5 and 1440')
        }
        break
      case 'autoApplyLastRunAt':
      case 'autoApplyNextRunAt':
        if (value !== null && !(value instanceof Date)) {
          throw new Error(`${key} must be a Date or null`)
        }
        break
      case 'autoApplyLastRunResult':
        // JSON object, no validation needed
        break
      default:
        throw new Error(`Unknown setting: ${key}`)
    }

    // Update in database
    await this.prisma.settings.upsert({
      where: { id: 'singleton' },
      update: { [key]: value },
      create: {
        id: 'singleton',
        ...defaultSettings,
        [key]: value
      }
    })

    console.log(`⚙️ Updated ${key} to: ${key.includes('ApiKey') && value ? '[REDACTED]' : value}`)
  }

  /**
   * Récupère les paramètres d'auto-apply
   */
  async getAutoApplySettings(): Promise<{
    enabled: boolean
    intervalMinutes: number
    lastRunAt: Date | null
    nextRunAt: Date | null
    lastRunResult: AutoApplyLastRunResult | null
  }> {
    const settings = await this.getSettings()
    return {
      enabled: settings.enableAutoApplyUpdates,
      intervalMinutes: settings.autoApplyIntervalMinutes,
      lastRunAt: settings.autoApplyLastRunAt,
      nextRunAt: settings.autoApplyNextRunAt,
      lastRunResult: settings.autoApplyLastRunResult
    }
  }

  /**
   * Met à jour les résultats de la dernière exécution auto-apply
   */
  async updateAutoApplyLastRun(result: AutoApplyLastRunResult, nextRunAt: Date | null): Promise<void> {
    await this.prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        autoApplyLastRunAt: new Date(),
        autoApplyNextRunAt: nextRunAt,
        autoApplyLastRunResult: result as any
      }
    })
    console.log(`🔄 Auto-apply run completed: ${result.success} success, ${result.failed} failed`)
  }

  /**
   * Met à jour la date de prochaine exécution
   */
  async updateAutoApplyNextRunAt(nextRunAt: Date | null): Promise<void> {
    await this.prisma.settings.update({
      where: { id: 'singleton' },
      data: { autoApplyNextRunAt: nextRunAt }
    })
  }
}

// Instance singleton
export const settingsService = new SettingsService()
export type { SystemSettings, AutoApplyLastRunResult }
