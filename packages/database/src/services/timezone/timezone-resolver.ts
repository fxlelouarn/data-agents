/**
 * Service de résolution de timezone depuis la localisation
 *
 * Permet de déterminer la timezone IANA à partir de :
 * - Un code département français
 * - Un code de ligue FFA
 * - Un nom de pays
 */

import {
  departmentTimezones,
  ligueTimezones,
  countryTimezones,
  DEFAULT_TIMEZONE,
} from './department-timezones'

/**
 * Résout la timezone IANA depuis le département
 *
 * Pour les départements métropolitains (01-95), retourne Europe/Paris
 * Pour les DOM-TOM, retourne la timezone spécifique
 *
 * @param department - Code département (ex: "971", "75", "2A")
 * @returns Timezone IANA (ex: "Europe/Paris", "America/Guadeloupe")
 */
export function getTimezoneFromDepartment(department: string | undefined): string {
  if (!department) {
    return DEFAULT_TIMEZONE
  }

  // Normaliser le code département (retirer les zéros en début si présent)
  // "01" -> "1", "971" -> "971"
  const normalizedDept = department.replace(/^0+/, '') || department

  // Vérifier si c'est un DOM-TOM
  if (normalizedDept in departmentTimezones) {
    return departmentTimezones[normalizedDept]
  }

  // Départements avec lettres (Corse)
  if (department.toUpperCase() === '2A' || department.toUpperCase() === '2B') {
    return DEFAULT_TIMEZONE // Corse est en Europe/Paris
  }

  // Par défaut, métropole
  return DEFAULT_TIMEZONE
}

/**
 * Résout la timezone IANA depuis le code de ligue FFA
 *
 * @param ligue - Code ligue FFA (ex: "GUA", "REU", "IDF")
 * @returns Timezone IANA
 */
export function getTimezoneFromLigue(ligue: string | undefined): string {
  if (!ligue) {
    return DEFAULT_TIMEZONE
  }

  // Vérifier si c'est une ligue DOM-TOM
  if (ligue in ligueTimezones) {
    return ligueTimezones[ligue]
  }

  // Par défaut, métropole
  return DEFAULT_TIMEZONE
}

/**
 * Résout la timezone IANA depuis le pays
 *
 * @param country - Nom du pays (ex: "France", "Belgique", "Suisse")
 * @returns Timezone IANA
 */
export function getTimezoneFromCountry(country: string | undefined): string {
  if (!country) {
    return DEFAULT_TIMEZONE
  }

  // Recherche exacte
  if (country in countryTimezones) {
    return countryTimezones[country]
  }

  // Recherche insensible à la casse
  const lowerCountry = country.toLowerCase()
  for (const [key, tz] of Object.entries(countryTimezones)) {
    if (key.toLowerCase() === lowerCountry) {
      return tz
    }
  }

  // Par défaut, France
  return DEFAULT_TIMEZONE
}

/**
 * Résout la timezone IANA depuis la localisation
 *
 * Ordre de priorité :
 * 1. Code département (plus précis, surtout pour les DOM-TOM)
 * 2. Code ligue FFA (si disponible)
 * 3. Pays
 * 4. Défaut (Europe/Paris)
 *
 * @param options - Options de localisation
 * @returns Timezone IANA
 */
export function getTimezoneFromLocation(options: {
  department?: string
  ligue?: string
  country?: string
}): string {
  const { department, ligue, country } = options

  // 1. Priorité au département (plus précis pour DOM-TOM)
  if (department) {
    const deptTz = getTimezoneFromDepartment(department)
    // Si ce n'est pas le défaut, c'est qu'on a trouvé un DOM-TOM
    if (deptTz !== DEFAULT_TIMEZONE) {
      return deptTz
    }
  }

  // 2. Vérifier la ligue FFA
  if (ligue) {
    const ligueTz = getTimezoneFromLigue(ligue)
    if (ligueTz !== DEFAULT_TIMEZONE) {
      return ligueTz
    }
  }

  // 3. Vérifier le pays
  if (country) {
    return getTimezoneFromCountry(country)
  }

  // 4. Défaut
  return DEFAULT_TIMEZONE
}

/**
 * Vérifie si un département est un DOM-TOM
 *
 * @param department - Code département
 * @returns true si c'est un DOM-TOM
 */
export function isDOMTOM(department: string | undefined): boolean {
  if (!department) return false

  const normalizedDept = department.replace(/^0+/, '') || department
  return normalizedDept in departmentTimezones
}

/**
 * Retourne la timezone par défaut
 */
export function getDefaultTimezone(): string {
  return DEFAULT_TIMEZONE
}
