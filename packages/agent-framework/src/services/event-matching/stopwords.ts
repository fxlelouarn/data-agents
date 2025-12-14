/**
 * Stopwords et mots génériques pour le matching d'événements sportifs
 *
 * Ces mots sont filtrés car ils n'apportent pas d'information distinctive
 * et peuvent faire chuter le score de similarité.
 */

/**
 * Sponsors connus à retirer des noms d'événements avant matching
 * Ces marques sont souvent ajoutées au nom officiel mais pas dans la base
 */
export const EVENT_SPONSORS = new Set([
  // Équipementiers running
  'brooks', 'asics', 'nike', 'adidas', 'salomon', 'hoka', 'saucony', 'new balance',
  'mizuno', 'puma', 'reebok', 'under armour', 'decathlon', 'kalenji',

  // Sponsors énergie/nutrition
  'edf', 'engie', 'total', 'totalenergies', 'isostar', 'overstim', 'aptonia',
  'maurten', 'gu', 'clif', 'powerbar',

  // Sponsors tech/telecom
  'orange', 'sfr', 'bouygues', 'free', 'samsung', 'apple', 'garmin', 'suunto',
  'polar', 'coros', 'strava',

  // Sponsors banque/assurance
  'bnp', 'bnp paribas', 'credit agricole', 'societe generale', 'lcl', 'caisse epargne',
  'axa', 'allianz', 'generali', 'maif', 'macif', 'groupama',

  // Sponsors auto
  'renault', 'peugeot', 'citroen', 'toyota', 'volkswagen', 'bmw', 'mercedes',

  // Sponsors divers
  'schneider', 'schneider electric', 'harmonie mutuelle', 'apicil', 'vittel',
  'evian', 'perrier', 'contrex', 'powerade', 'gatorade', 'red bull',

  // Médias
  'france bleu', 'france 3', 'lequipe', "l'equipe", 'rmc', 'bfm'
])

/**
 * Mots à ignorer lors du matching de noms d'événements
 */
export const EVENT_NAME_STOPWORDS = new Set([
  // Articles
  'le', 'la', 'les', 'un', 'une', 'des',

  // Prépositions courantes
  'de', 'du', 'des', 'en', 'au', 'aux', 'a',

  // Mots édition/version
  'edition', 'eme', 'ere', 'decouverte', 'nouveau', 'nouvelle',

  // Mots organisateurs
  'by', 'organise', 'presente', 'propose',

  // Types d'événements (trop génériques)
  'trail', 'course', 'semi', 'marathon', 'km', 'run', 'running',
  'corrida', 'foulees', 'relais', 'marche', 'randonnee',

  // Qualificatifs génériques
  'grand', 'grande', 'petit', 'petite', 'super', 'mega',
  'international', 'nationale', 'regional', 'departemental',

  // Mots temporels
  'nocturne', 'diurne', 'matinal', 'vesperale'
])

/**
 * Mots à ignorer lors du matching de villes
 */
export const CITY_NAME_STOPWORDS = new Set([
  'saint', 'sainte', 'sur', 'sous', 'les', 'en'
])

/**
 * Retire les stopwords d'un texte normalisé
 *
 * @param text - Texte normalisé (minuscules, sans accents)
 * @param stopwords - Set de stopwords à retirer
 * @param minWordLength - Longueur minimale des mots à garder
 * @returns Texte sans stopwords
 */
export function removeStopwords(
  text: string,
  stopwords: Set<string> = EVENT_NAME_STOPWORDS,
  minWordLength: number = 3
): string {
  return text
    .split(/\s+/)
    .filter(word =>
      word.length >= minWordLength &&
      !stopwords.has(word)
    )
    .join(' ')
    .trim()
}

/**
 * Retire les noms de sponsors d'un nom d'événement
 *
 * @param eventName - Nom de l'événement
 * @returns Nom sans les sponsors
 *
 * @example
 * removeSponsors("Brooks Marathon Annecy 2026")
 * // → "Marathon Annecy 2026"
 *
 * removeSponsors("Schneider Electric Marathon de Paris")
 * // → "Marathon de Paris"
 */
export function removeSponsors(eventName: string): string {
  let result = eventName

  // Trier les sponsors par longueur décroissante pour matcher les plus longs d'abord
  // Ex: "schneider electric" avant "schneider"
  const sortedSponsors = Array.from(EVENT_SPONSORS).sort((a, b) => b.length - a.length)

  for (const sponsor of sortedSponsors) {
    // Matcher le sponsor en début de chaîne ou après un espace, suivi d'un espace ou fin
    const regex = new RegExp(`(^|\\s)${sponsor}(\\s|$)`, 'gi')
    result = result.replace(regex, '$1$2')
  }

  // Nettoyer les espaces multiples
  return result.replace(/\s+/g, ' ').trim()
}

/**
 * Extrait les mots-clés significatifs d'un nom d'événement
 *
 * @param eventName - Nom de l'événement (normalisé)
 * @returns Mots-clés triés par longueur décroissante
 *
 * @example
 * extractKeywords("trail decouverte le gargantuesque")
 * // → ["gargantuesque", "decouverte"]
 */
export function extractKeywords(eventName: string): string[] {
  const cleaned = removeStopwords(eventName, EVENT_NAME_STOPWORDS, 4)

  return cleaned
    .split(/\s+/)
    .filter(word => word.length >= 4)
    .sort((a, b) => b.length - a.length) // Plus longs d'abord
}

/**
 * Extrait le mot-clé principal (plus long et distinctif)
 *
 * @param eventName - Nom de l'événement (normalisé)
 * @returns Le mot-clé principal ou undefined
 *
 * @example
 * getPrimaryKeyword("trail decouverte le gargantuesque")
 * // → "gargantuesque"
 */
export function getPrimaryKeyword(eventName: string): string | undefined {
  const keywords = extractKeywords(eventName)
  return keywords[0]
}

/**
 * Calcule un score de qualité pour un nom d'événement
 * basé sur le nombre de mots distinctifs
 *
 * @param eventName - Nom de l'événement (normalisé)
 * @returns Score entre 0 et 1 (1 = très distinctif)
 */
export function calculateNameQuality(eventName: string): number {
  const keywords = extractKeywords(eventName)
  const totalWords = eventName.split(/\s+/).length

  if (totalWords === 0) return 0

  // Plus il y a de mots distinctifs, meilleur est le nom
  const ratio = keywords.length / totalWords

  // Bonus si le mot principal est long (> 8 caractères)
  const primaryKeyword = keywords[0]
  const bonus = primaryKeyword && primaryKeyword.length > 8 ? 0.2 : 0

  return Math.min(ratio + bonus, 1)
}
