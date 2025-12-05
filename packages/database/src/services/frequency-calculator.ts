/**
 * Calculateur de fréquence flexible pour les agents
 *
 * Gère le calcul de la prochaine exécution avec:
 * - Variance aléatoire (jitter)
 * - Fenêtres temporelles
 * - Timezone Europe/Paris
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import {
  addMinutes,
  addDays,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  getDay,
  differenceInMinutes,
  isBefore,
  isAfter,
  format,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import type {
  FrequencyConfig,
  FrequencyValidationResult,
  NextRunResult,
} from '@data-agents/types'

const TIMEZONE = 'Europe/Paris'

/**
 * Génère un nombre aléatoire entre -jitter et +jitter
 */
function getRandomJitter(jitterMinutes: number): number {
  return Math.floor(Math.random() * (jitterMinutes * 2 + 1)) - jitterMinutes
}

/**
 * Parse une heure au format HH:mm et retourne { hours, minutes }
 */
function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number)
  return { hours, minutes }
}

/**
 * Vérifie si une date (en timezone Paris) est dans la fenêtre horaire
 */
function isInWindow(
  dateInParis: Date,
  windowStart: string,
  windowEnd: string
): boolean {
  const start = parseTime(windowStart)
  const end = parseTime(windowEnd)

  const currentHours = dateInParis.getHours()
  const currentMinutes = dateInParis.getMinutes()
  const currentTotal = currentHours * 60 + currentMinutes

  const startTotal = start.hours * 60 + start.minutes
  const endTotal = end.hours * 60 + end.minutes

  // Cas normal: fenêtre dans la même journée (ex: 08:00 - 20:00)
  if (startTotal <= endTotal) {
    return currentTotal >= startTotal && currentTotal < endTotal
  }

  // Cas fenêtre qui traverse minuit (ex: 22:00 - 06:00)
  return currentTotal >= startTotal || currentTotal < endTotal
}

/**
 * Trouve le prochain moment dans la fenêtre horaire
 * Retourne une date en UTC
 */
function getNextWindowStart(
  fromDate: Date,
  windowStart: string,
  windowEnd: string,
  daysOfWeek?: number[]
): Date {
  const parisDate = toZonedTime(fromDate, TIMEZONE)
  const start = parseTime(windowStart)

  let candidate = setMilliseconds(
    setSeconds(setMinutes(setHours(parisDate, start.hours), start.minutes), 0),
    0
  )

  // Si on est déjà passé le début de la fenêtre aujourd'hui, passer au lendemain
  if (isBefore(candidate, parisDate)) {
    candidate = addDays(candidate, 1)
  }

  // Pour weekly: trouver le prochain jour autorisé
  if (daysOfWeek && daysOfWeek.length > 0) {
    let attempts = 0
    while (!daysOfWeek.includes(getDay(candidate)) && attempts < 7) {
      candidate = addDays(candidate, 1)
      attempts++
    }
  }

  return fromZonedTime(candidate, TIMEZONE)
}

/**
 * Génère une heure aléatoire dans la fenêtre
 */
function getRandomTimeInWindow(
  date: Date,
  windowStart: string,
  windowEnd: string
): Date {
  const start = parseTime(windowStart)
  const end = parseTime(windowEnd)

  let startTotal = start.hours * 60 + start.minutes
  let endTotal = end.hours * 60 + end.minutes

  // Gestion fenêtre qui traverse minuit
  if (endTotal <= startTotal) {
    endTotal += 24 * 60
  }

  const windowDuration = endTotal - startTotal
  const randomOffset = Math.floor(Math.random() * windowDuration)
  const targetMinutes = startTotal + randomOffset

  const parisDate = toZonedTime(date, TIMEZONE)
  let result = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(parisDate, Math.floor(targetMinutes / 60) % 24),
        targetMinutes % 60
      ),
      0
    ),
    0
  )

  // Si l'heure calculée traverse minuit, ajouter un jour
  if (targetMinutes >= 24 * 60) {
    result = addDays(result, 1)
  }

  return fromZonedTime(result, TIMEZONE)
}

/**
 * Valide une configuration de fréquence
 */
export function validateFrequencyConfig(
  config: FrequencyConfig
): FrequencyValidationResult {
  const errors: string[] = []

  if (!config.type) {
    errors.push("Le type de fréquence est requis ('interval', 'daily', 'weekly')")
    return { valid: false, errors }
  }

  if (!['interval', 'daily', 'weekly'].includes(config.type)) {
    errors.push(
      `Type de fréquence invalide: ${config.type}. Valeurs acceptées: interval, daily, weekly`
    )
  }

  if (config.type === 'interval') {
    if (!config.intervalMinutes || config.intervalMinutes <= 0) {
      errors.push("intervalMinutes est requis et doit être > 0 pour le type 'interval'")
    }
    if (
      config.jitterMinutes !== undefined &&
      config.intervalMinutes &&
      config.jitterMinutes > config.intervalMinutes / 2
    ) {
      errors.push(
        `jitterMinutes (${config.jitterMinutes}) ne peut pas dépasser la moitié de intervalMinutes (${config.intervalMinutes / 2})`
      )
    }
  }

  if (config.type === 'daily' || config.type === 'weekly') {
    if (!config.windowStart) {
      errors.push(`windowStart est requis pour le type '${config.type}'`)
    }
    if (!config.windowEnd) {
      errors.push(`windowEnd est requis pour le type '${config.type}'`)
    }
  }

  if (config.windowStart && !/^\d{2}:\d{2}$/.test(config.windowStart)) {
    errors.push(`windowStart doit être au format HH:mm (reçu: ${config.windowStart})`)
  }

  if (config.windowEnd && !/^\d{2}:\d{2}$/.test(config.windowEnd)) {
    errors.push(`windowEnd doit être au format HH:mm (reçu: ${config.windowEnd})`)
  }

  if (config.type === 'weekly') {
    if (!config.daysOfWeek || config.daysOfWeek.length === 0) {
      errors.push("daysOfWeek est requis et ne peut pas être vide pour le type 'weekly'")
    } else {
      const invalidDays = config.daysOfWeek.filter((d) => d < 0 || d > 6)
      if (invalidDays.length > 0) {
        errors.push(
          `daysOfWeek contient des valeurs invalides: ${invalidDays.join(', ')}. Valeurs acceptées: 0-6 (0=dimanche)`
        )
      }
    }
  }

  // Vérifier que la fenêtre fait au moins 1 heure
  if (config.windowStart && config.windowEnd) {
    const start = parseTime(config.windowStart)
    const end = parseTime(config.windowEnd)
    let startTotal = start.hours * 60 + start.minutes
    let endTotal = end.hours * 60 + end.minutes
    if (endTotal <= startTotal) {
      endTotal += 24 * 60
    }
    const duration = endTotal - startTotal
    if (duration < 60) {
      errors.push(
        `La fenêtre horaire doit faire au moins 1 heure (durée actuelle: ${duration} minutes)`
      )
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Calcule la prochaine exécution pour un agent
 *
 * @param config Configuration de fréquence
 * @param now Date actuelle (optionnel, pour les tests)
 * @returns Résultat avec date, délai et description
 */
export function calculateNextRun(
  config: FrequencyConfig,
  now: Date = new Date()
): NextRunResult {
  const validation = validateFrequencyConfig(config)
  if (!validation.valid) {
    throw new Error(`Configuration invalide: ${validation.errors.join(', ')}`)
  }

  let nextRunAt: Date

  switch (config.type) {
    case 'interval': {
      const jitter = config.jitterMinutes
        ? getRandomJitter(config.jitterMinutes)
        : 0
      const totalMinutes = config.intervalMinutes! + jitter
      nextRunAt = addMinutes(now, totalMinutes)

      // Si une fenêtre est définie, vérifier qu'on est dedans
      if (config.windowStart && config.windowEnd) {
        const parisDate = toZonedTime(nextRunAt, TIMEZONE)
        if (!isInWindow(parisDate, config.windowStart, config.windowEnd)) {
          // Reporter au prochain début de fenêtre + jitter aléatoire dans la fenêtre
          nextRunAt = getNextWindowStart(
            nextRunAt,
            config.windowStart,
            config.windowEnd
          )
          // Ajouter un offset aléatoire dans la fenêtre
          nextRunAt = getRandomTimeInWindow(
            nextRunAt,
            config.windowStart,
            config.windowEnd
          )
        }
      }
      break
    }

    case 'daily': {
      // Trouver le prochain jour et choisir une heure aléatoire dans la fenêtre
      const nextWindowStart = getNextWindowStart(
        now,
        config.windowStart!,
        config.windowEnd!
      )
      nextRunAt = getRandomTimeInWindow(
        nextWindowStart,
        config.windowStart!,
        config.windowEnd!
      )
      break
    }

    case 'weekly': {
      // Trouver le prochain jour autorisé et choisir une heure aléatoire dans la fenêtre
      const nextWindowStart = getNextWindowStart(
        now,
        config.windowStart!,
        config.windowEnd!,
        config.daysOfWeek
      )
      nextRunAt = getRandomTimeInWindow(
        nextWindowStart,
        config.windowStart!,
        config.windowEnd!
      )
      break
    }

    default:
      throw new Error(`Type de fréquence non supporté: ${config.type}`)
  }

  const delayMs = nextRunAt.getTime() - now.getTime()
  const parisNextRun = toZonedTime(nextRunAt, TIMEZONE)
  const description = format(parisNextRun, "EEEE d MMMM 'à' HH:mm", { locale: fr })

  return {
    nextRunAt,
    delayMs,
    description,
  }
}

/**
 * Formate une configuration de fréquence en texte lisible
 */
export function formatFrequencyConfig(config: FrequencyConfig): string {
  switch (config.type) {
    case 'interval': {
      const hours = Math.floor(config.intervalMinutes! / 60)
      const minutes = config.intervalMinutes! % 60
      let interval = ''
      if (hours > 0 && minutes > 0) {
        interval = `${hours}h${minutes}min`
      } else if (hours > 0) {
        interval = `${hours}h`
      } else {
        interval = `${minutes}min`
      }

      let result = `Toutes les ${interval}`
      if (config.jitterMinutes) {
        const jitterH = Math.floor(config.jitterMinutes / 60)
        const jitterM = config.jitterMinutes % 60
        let jitter = ''
        if (jitterH > 0 && jitterM > 0) {
          jitter = `${jitterH}h${jitterM}min`
        } else if (jitterH > 0) {
          jitter = `${jitterH}h`
        } else {
          jitter = `${jitterM}min`
        }
        result += ` ± ${jitter}`
      }

      if (config.windowStart && config.windowEnd) {
        result += ` (${config.windowStart}-${config.windowEnd})`
      }

      return result
    }

    case 'daily': {
      return `Quotidien (${config.windowStart}-${config.windowEnd})`
    }

    case 'weekly': {
      const dayNames = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
      const days = config.daysOfWeek!.sort().map((d) => dayNames[d]).join(', ')
      return `Hebdo ${days} (${config.windowStart}-${config.windowEnd})`
    }

    default:
      return 'Configuration inconnue'
  }
}

/**
 * Compare deux configurations de fréquence
 */
export function areFrequencyConfigsEqual(
  a: FrequencyConfig,
  b: FrequencyConfig
): boolean {
  if (a.type !== b.type) return false
  if (a.intervalMinutes !== b.intervalMinutes) return false
  if (a.jitterMinutes !== b.jitterMinutes) return false
  if (a.windowStart !== b.windowStart) return false
  if (a.windowEnd !== b.windowEnd) return false

  if (a.daysOfWeek && b.daysOfWeek) {
    if (a.daysOfWeek.length !== b.daysOfWeek.length) return false
    const sortedA = [...a.daysOfWeek].sort()
    const sortedB = [...b.daysOfWeek].sort()
    if (!sortedA.every((v, i) => v === sortedB[i])) return false
  } else if (a.daysOfWeek || b.daysOfWeek) {
    return false
  }

  return true
}
