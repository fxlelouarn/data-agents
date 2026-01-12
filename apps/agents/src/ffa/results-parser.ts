/**
 * Utilitaires de parsing HTML pour les pages de résultats FFA
 *
 * Ce module extrait le nombre de participants depuis les pages de résultats FFA
 */

import * as cheerio from 'cheerio'

/**
 * Extrait le nombre de participants depuis la page résultats FFA
 *
 * La page affiche le nombre total dans un élément du type:
 * <p class="...text-center">207 résultats</p>
 *
 * @param html Le HTML de la page de résultats
 * @returns Le nombre de participants ou null si non trouvé
 */
export function parseResultsCount(html: string): number | null {
  const $ = cheerio.load(html)

  // Pattern 1: Chercher dans les <p> avec le texte "X résultats"
  let resultsText = ''
  $('p').each((_, el) => {
    const text = $(el).text().trim()
    if (/\d+\s*résultats?/i.test(text)) {
      resultsText = text
      return false // break
    }
  })

  if (resultsText) {
    const match = resultsText.match(/(\d+)\s*résultats?/i)
    if (match) {
      return parseInt(match[1], 10)
    }
  }

  // Pattern 2: Chercher dans le sélecteur de pagination (.selector)
  const selectorText = $('.selector').text()
  const selectorMatch = selectorText.match(/(\d+)\s*résultats?/i)
  if (selectorMatch) {
    return parseInt(selectorMatch[1], 10)
  }

  // Pattern 3: Chercher dans le texte global de la page
  const bodyText = $('body').text()
  const bodyMatch = bodyText.match(/(\d+)\s*résultats?\s*(?:trouvés?)?/i)
  if (bodyMatch) {
    return parseInt(bodyMatch[1], 10)
  }

  return null
}

/**
 * Construit l'URL de la page résultats FFA à partir de l'ID de compétition
 *
 * @param ffaId L'identifiant de la compétition FFA
 * @returns L'URL complète de la page résultats
 */
export function buildResultsPageURL(ffaId: string): string {
  return `https://www.athle.fr/bases/liste.aspx?frmbase=resultats&frmmode=1&frmespace=0&frmcompetition=${ffaId}`
}

/**
 * Extrait l'ID de compétition FFA depuis une URL de résultats
 *
 * @param resultsUrl L'URL de la page résultats
 * @returns L'ID de la compétition ou null si non trouvé
 */
export function extractFFAIdFromResultsUrl(resultsUrl: string): string | null {
  const match = resultsUrl.match(/frmcompetition=(\d+)/)
  return match ? match[1] : null
}
