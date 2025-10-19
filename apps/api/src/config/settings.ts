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
}

const defaultSettings: SystemSettings = {
  maxConsecutiveFailures: 3,
  enableAutoDisabling: true,
  checkIntervalMinutes: 5
}

class SettingsService {
  private settings: SystemSettings

  constructor() {
    // Charger les settings depuis les variables d'environnement ou utiliser les défauts
    this.settings = {
      maxConsecutiveFailures: parseInt(process.env.MAX_CONSECUTIVE_FAILURES || '3', 10),
      enableAutoDisabling: process.env.ENABLE_AUTO_DISABLING !== 'false',
      checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || '5', 10)
    }

    // Validation des valeurs
    if (this.settings.maxConsecutiveFailures < 1) {
      console.warn('⚠️ MAX_CONSECUTIVE_FAILURES must be >= 1, using default value: 3')
      this.settings.maxConsecutiveFailures = defaultSettings.maxConsecutiveFailures
    }

    if (this.settings.checkIntervalMinutes < 1) {
      console.warn('⚠️ CHECK_INTERVAL_MINUTES must be >= 1, using default value: 5')
      this.settings.checkIntervalMinutes = defaultSettings.checkIntervalMinutes
    }

    console.log('⚙️ System Settings loaded:', {
      maxConsecutiveFailures: this.settings.maxConsecutiveFailures,
      enableAutoDisabling: this.settings.enableAutoDisabling,
      checkIntervalMinutes: this.settings.checkIntervalMinutes
    })
  }

  getSettings(): SystemSettings {
    return { ...this.settings }
  }

  getMaxConsecutiveFailures(): number {
    return this.settings.maxConsecutiveFailures
  }

  isAutoDisablingEnabled(): boolean {
    return this.settings.enableAutoDisabling
  }

  getCheckIntervalMinutes(): number {
    return this.settings.checkIntervalMinutes
  }

  /**
   * Met à jour un paramètre spécifique
   */
  updateSetting(key: keyof SystemSettings, value: any): void {
    switch (key) {
      case 'maxConsecutiveFailures':
        if (typeof value === 'number' && value >= 1) {
          this.settings.maxConsecutiveFailures = value
          console.log(`⚙️ Updated maxConsecutiveFailures to: ${value}`)
        } else {
          throw new Error('maxConsecutiveFailures must be a number >= 1')
        }
        break

      case 'enableAutoDisabling':
        if (typeof value === 'boolean') {
          this.settings.enableAutoDisabling = value
          console.log(`⚙️ Updated enableAutoDisabling to: ${value}`)
        } else {
          throw new Error('enableAutoDisabling must be a boolean')
        }
        break

      case 'checkIntervalMinutes':
        if (typeof value === 'number' && value >= 1) {
          this.settings.checkIntervalMinutes = value
          console.log(`⚙️ Updated checkIntervalMinutes to: ${value}`)
        } else {
          throw new Error('checkIntervalMinutes must be a number >= 1')
        }
        break

      default:
        throw new Error(`Unknown setting: ${key}`)
    }
  }
}

// Instance singleton
export const settingsService = new SettingsService()
export type { SystemSettings }