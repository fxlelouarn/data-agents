/**
 * Mapping des départements français vers les timezones IANA
 *
 * Les départements métropolitains (01-95) utilisent tous Europe/Paris.
 * Seuls les DOM-TOM ont des timezones spécifiques.
 */

/**
 * Mapping des codes départementaux DOM-TOM vers les timezones IANA
 */
export const departmentTimezones: Record<string, string> = {
  // Guadeloupe
  '971': 'America/Guadeloupe',

  // Martinique
  '972': 'America/Martinique',

  // Guyane
  '973': 'America/Cayenne',

  // La Réunion
  '974': 'Indian/Reunion',

  // Saint-Pierre-et-Miquelon
  '975': 'America/Miquelon',

  // Mayotte
  '976': 'Indian/Mayotte',

  // Saint-Barthélemy
  '977': 'America/St_Barthelemy',

  // Saint-Martin
  '978': 'America/Marigot',

  // Wallis-et-Futuna
  '986': 'Pacific/Wallis',

  // Polynésie française
  '987': 'Pacific/Tahiti',

  // Nouvelle-Calédonie
  '988': 'Pacific/Noumea',
}

/**
 * Mapping des codes de ligues FFA vers les timezones IANA
 * Utilisé principalement par l'agent FFA Scraper
 */
export const ligueTimezones: Record<string, string> = {
  // DOM-TOM
  GUA: 'America/Guadeloupe', // Guadeloupe
  GUY: 'America/Cayenne', // Guyane
  MAR: 'America/Martinique', // Martinique
  MAY: 'Indian/Mayotte', // Mayotte
  'N-C': 'Pacific/Noumea', // Nouvelle-Calédonie
  'P-F': 'Pacific/Tahiti', // Polynésie française
  REU: 'Indian/Reunion', // La Réunion
  'W-F': 'Pacific/Wallis', // Wallis-et-Futuna
}

/**
 * Mapping des pays vers les timezones IANA
 * Utilisé pour les événements hors France
 */
export const countryTimezones: Record<string, string> = {
  // Europe
  France: 'Europe/Paris',
  Belgique: 'Europe/Brussels',
  Suisse: 'Europe/Zurich',
  Luxembourg: 'Europe/Luxembourg',
  Monaco: 'Europe/Monaco',
  Espagne: 'Europe/Madrid',
  Italie: 'Europe/Rome',
  Allemagne: 'Europe/Berlin',
  'Pays-Bas': 'Europe/Amsterdam',
  'Royaume-Uni': 'Europe/London',
  Irlande: 'Europe/Dublin',
  Portugal: 'Europe/Lisbon',
  Autriche: 'Europe/Vienna',
  Pologne: 'Europe/Warsaw',

  // Afrique francophone
  Maroc: 'Africa/Casablanca',
  Algérie: 'Africa/Algiers',
  Tunisie: 'Africa/Tunis',
  Sénégal: 'Africa/Dakar',
  "Côte d'Ivoire": 'Africa/Abidjan',

  // Amérique
  Canada: 'America/Montreal',
  États: 'America/New_York',
  Québec: 'America/Montreal',
}

/**
 * Timezone par défaut (France métropolitaine)
 */
export const DEFAULT_TIMEZONE = 'Europe/Paris'
