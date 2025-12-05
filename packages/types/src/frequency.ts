/**
 * Configuration de fréquence flexible pour les agents
 *
 * Remplace les expressions cron par un système avec variance aléatoire (jitter)
 * et fenêtres temporelles.
 *
 * Exemples:
 * - Toutes les 2h ± 1h: { type: 'interval', intervalMinutes: 120, jitterMinutes: 60 }
 * - Quotidien nuit: { type: 'daily', windowStart: '00:00', windowEnd: '05:00' }
 * - Hebdo lun-ven: { type: 'weekly', windowStart: '06:00', windowEnd: '09:00', daysOfWeek: [1,2,3,4,5] }
 */

/**
 * Type de fréquence
 * - interval: Exécution périodique avec intervalle + jitter
 * - daily: Une exécution par jour dans une fenêtre horaire
 * - weekly: Une exécution par semaine sur certains jours dans une fenêtre horaire
 */
export type FrequencyType = 'interval' | 'daily' | 'weekly'

/**
 * Configuration de fréquence flexible
 */
export interface FrequencyConfig {
  type: FrequencyType

  /**
   * Intervalle de base en minutes (pour type 'interval')
   * Ex: 120 = toutes les 2 heures
   */
  intervalMinutes?: number

  /**
   * Variance aléatoire en minutes (± jitterMinutes)
   * Ex: 60 = ±1 heure autour de l'intervalle
   * Contrainte: jitterMinutes <= intervalMinutes / 2
   */
  jitterMinutes?: number

  /**
   * Début de la fenêtre d'exécution autorisée (format HH:mm, timezone Europe/Paris)
   * Requis pour 'daily' et 'weekly', optionnel pour 'interval'
   */
  windowStart?: string

  /**
   * Fin de la fenêtre d'exécution autorisée (format HH:mm, timezone Europe/Paris)
   * Requis pour 'daily' et 'weekly', optionnel pour 'interval'
   */
  windowEnd?: string

  /**
   * Jours de la semaine autorisés (pour type 'weekly')
   * 0 = dimanche, 1 = lundi, ..., 6 = samedi
   * Ex: [1,2,3,4,5] = lundi à vendredi
   */
  daysOfWeek?: number[]
}

/**
 * Presets de fréquence prédéfinis
 */
export interface FrequencyPreset {
  id: string
  label: string
  description: string
  config: FrequencyConfig
}

/**
 * Presets disponibles pour l'UI
 */
export const FREQUENCY_PRESETS: FrequencyPreset[] = [
  {
    id: 'hourly',
    label: 'Toutes les heures ± 15min',
    description: 'Exécution environ toutes les heures (entre 45min et 1h15)',
    config: { type: 'interval', intervalMinutes: 60, jitterMinutes: 15 },
  },
  {
    id: 'every-2h',
    label: 'Toutes les 2h ± 30min',
    description: 'Exécution environ toutes les 2 heures (entre 1h30 et 2h30)',
    config: { type: 'interval', intervalMinutes: 120, jitterMinutes: 30 },
  },
  {
    id: 'every-4h',
    label: 'Toutes les 4h ± 1h',
    description: 'Exécution environ toutes les 4 heures (entre 3h et 5h)',
    config: { type: 'interval', intervalMinutes: 240, jitterMinutes: 60 },
  },
  {
    id: 'every-6h',
    label: 'Toutes les 6h ± 1h',
    description: 'Exécution environ toutes les 6 heures (entre 5h et 7h)',
    config: { type: 'interval', intervalMinutes: 360, jitterMinutes: 60 },
  },
  {
    id: 'daily-night',
    label: 'Quotidien (nuit 00h-05h)',
    description: 'Une fois par jour, entre minuit et 5h du matin',
    config: { type: 'daily', windowStart: '00:00', windowEnd: '05:00' },
  },
  {
    id: 'daily-morning',
    label: 'Quotidien (matin 06h-09h)',
    description: 'Une fois par jour, entre 6h et 9h du matin',
    config: { type: 'daily', windowStart: '06:00', windowEnd: '09:00' },
  },
  {
    id: 'daily-evening',
    label: 'Quotidien (soir 18h-22h)',
    description: 'Une fois par jour, entre 18h et 22h',
    config: { type: 'daily', windowStart: '18:00', windowEnd: '22:00' },
  },
  {
    id: 'weekly-weekdays-night',
    label: 'Hebdo lun-ven (nuit)',
    description: 'Une fois par semaine, du lundi au vendredi entre 00h et 05h',
    config: {
      type: 'weekly',
      windowStart: '00:00',
      windowEnd: '05:00',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
  },
  {
    id: 'weekly-weekend',
    label: 'Hebdo week-end (matin)',
    description: 'Une fois par semaine, samedi ou dimanche entre 06h et 10h',
    config: {
      type: 'weekly',
      windowStart: '06:00',
      windowEnd: '10:00',
      daysOfWeek: [0, 6],
    },
  },
]

/**
 * Résultat du calcul de la prochaine exécution
 */
export interface NextRunResult {
  /** Date/heure de la prochaine exécution (UTC) */
  nextRunAt: Date
  /** Délai en millisecondes jusqu'à la prochaine exécution */
  delayMs: number
  /** Description lisible du prochain run */
  description: string
}

/**
 * Validation d'une configuration de fréquence
 */
export interface FrequencyValidationResult {
  valid: boolean
  errors: string[]
}
