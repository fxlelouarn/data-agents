/**
 * Stopwords et mots génériques pour le matching d'événements sportifs
 * 
 * Ces mots sont filtrés car ils n'apportent pas d'information distinctive
 * et peuvent faire chuter le score de similarité.
 */

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
