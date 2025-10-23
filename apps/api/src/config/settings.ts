import { PrismaClient } from '@prisma/client'

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
}

const defaultSettings: SystemSettings = {
  maxConsecutiveFailures: 3,
  enableAutoDisabling: true,
  checkIntervalMinutes: 5,
  meilisearchUrl: null,
  meilisearchApiKey: null
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
        meilisearchApiKey: settings.meilisearchApiKey
      }
      
      console.log('⚙️ System Settings loaded from database')
    } catch (error) {
      console.error('❌ Failed to load settings from database:', error)
      this.settings = { ...defaultSettings }
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
        meilisearchApiKey: created.meilisearchApiKey
      }
    }
    
    return {
      maxConsecutiveFailures: settings.maxConsecutiveFailures,
      enableAutoDisabling: settings.enableAutoDisabling,
      checkIntervalMinutes: settings.checkIntervalMinutes,
      meilisearchUrl: settings.meilisearchUrl,
      meilisearchApiKey: settings.meilisearchApiKey
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
}

// Instance singleton
export const settingsService = new SettingsService()
export type { SystemSettings }