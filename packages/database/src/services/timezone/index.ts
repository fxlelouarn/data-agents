/**
 * Service de résolution de timezone
 *
 * Fournit des fonctions pour déterminer la timezone IANA à partir de :
 * - Un code département français
 * - Un code de ligue FFA
 * - Un nom de pays
 */

export {
  getTimezoneFromDepartment,
  getTimezoneFromLigue,
  getTimezoneFromCountry,
  getTimezoneFromLocation,
  isDOMTOM,
  getDefaultTimezone,
} from './timezone-resolver'

export {
  departmentTimezones,
  ligueTimezones,
  countryTimezones,
  DEFAULT_TIMEZONE,
} from './department-timezones'
