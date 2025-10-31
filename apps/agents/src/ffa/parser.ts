/**
 * Utilitaires de parsing HTML pour le calendrier FFA
 * 
 * Ce module extrait les informations des compétitions depuis le HTML du site FFA
 * en utilisant cheerio pour le parsing DOM
 */

import * as cheerio from 'cheerio'
import { FFACompetition, FFACompetitionDetails, FFARace } from './types'

/**
 * Parse le listing de compétitions depuis la table HTML FFA
 */
export function parseCompetitionsList(html: string): FFACompetition[] {
  const $ = cheerio.load(html)
  const competitions: FFACompetition[] = []

  // Table principale des compétitions
  $('#ctnCalendrier tbody tr.clickable').each((_, element) => {
    try {
      const $row = $(element)
      
      // Extraire le numéro FFA depuis l'attribut title
      const titleAttr = $row.find('td:first-child a').attr('title')
      const ffaIdMatch = titleAttr?.match(/Compétition numéro : (\d+)/)
      if (!ffaIdMatch) return

      const ffaId = ffaIdMatch[1]

      // Extraire les colonnes
      const $cells = $row.find('td')
      
      // Date
      const dateText = $cells.eq(0).find('a').text().trim()
      const date = parseFrenchDate(dateText)
      if (!date) return

      // Nom
      const name = $cells.eq(1).text().trim()

      // Lieu (Ville + Département + Ligue)
      const locationHtml = $cells.eq(2).html() || ''
      const locationParts = locationHtml.split('<br>')
      const city = cheerio.load(locationParts[0]).text().trim()
      
      // Département (ex: "074")
      const departmentMatch = locationHtml.match(/frmdepartement=(\d+)/)
      const department = departmentMatch ? departmentMatch[1] : ''

      // Ligue (ex: "ARA")
      const ligueMatch = locationHtml.match(/frmligue=([A-Z]+)/)
      const ligue = ligueMatch ? ligueMatch[1] : ''

      // Type
      const typeHtml = $cells.eq(3).html() || ''
      const type = cheerio.load(typeHtml.split('<br>')[0]).text().trim()

      // Niveau
      const level = $cells.eq(4).text().trim()

      // URL de la fiche détaillée
      const detailPath = $cells.eq(6).find('a').attr('href')
      const detailUrl = detailPath ? `https://www.athle.fr${detailPath}` : ''

      if (ffaId && name && date && city) {
        competitions.push({
          ffaId,
          name,
          date,
          city,
          department,
          ligue,
          level,
          type,
          detailUrl
        })
      }
    } catch (error) {
      // Ignorer les lignes mal formées
      console.warn('Erreur parsing ligne:', error)
    }
  })

  return competitions
}

/**
 * Parse la fiche détaillée d'une compétition
 */
export function parseCompetitionDetails(
  html: string,
  competition: FFACompetition
): FFACompetitionDetails {
  const $ = cheerio.load(html)

  const details: FFACompetitionDetails = {
    competition,
    races: []
  }

  // Extraire les informations de l'organisateur
  // Chercher dans les sections de la page
  $('section').each((_, section) => {
    const $section = $(section)
    const sectionText = $section.text()

    // Email
    const emailMatch = sectionText.match(/[\w.-]+@[\w.-]+\.\w+/)
    if (emailMatch && !details.organizerEmail) {
      details.organizerEmail = emailMatch[0]
    }

    // Téléphone
    const phoneMatch = sectionText.match(/(\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2})/)
    if (phoneMatch && !details.organizerPhone) {
      details.organizerPhone = phoneMatch[1].replace(/\s/g, '')
    }

    // URL
    const urlMatch = sectionText.match(/(https?:\/\/[^\s]+)/)
    if (urlMatch && !details.organizerWebsite) {
      details.organizerWebsite = urlMatch[1]
    }
  })

  // Parser les courses/épreuves
  details.races = parseRaces(html)

  return details
}

/**
 * Extrait les courses/épreuves depuis la section "Liste des épreuves"
 */
export function parseRaces(html: string): FFARace[] {
  const $ = cheerio.load(html)
  const races: FFARace[] = []

  // Chercher la section des épreuves
  const $eprevesSection = $('#epreuves')
  if (!$eprevesSection.length) return races

  // Parser chaque ligne de course
  $eprevesSection.find('table tr').each((index, element) => {
    if (index === 0) return // Skip header

    const $row = $(element)
    const $cells = $row.find('td')

    if ($cells.length === 0) return

    const raceName = $cells.eq(0).text().trim()
    if (!raceName) return

    // Extraire heure de départ
    const timeMatch = raceName.match(/(\d{1,2}[h:]\d{2})/)
    const startTime = timeMatch ? timeMatch[1].replace('h', ':') : undefined

    // Extraire distance
    const distanceText = $cells.eq(1)?.text().trim() || raceName
    const distance = parseDistance(distanceText)

    // Extraire dénivelé
    const elevationText = $cells.eq(2)?.text().trim() || raceName
    const positiveElevation = parseElevation(elevationText)

    // Déterminer le type de course
    let type: FFARace['type'] = 'other'
    const lowerName = raceName.toLowerCase()
    if (lowerName.includes('trail')) {
      type = 'trail'
    } else if (lowerName.includes('marche') || lowerName.includes('randonnée')) {
      type = 'walk'
    } else if (distance && distance >= 100) {
      type = 'running'
    }

    races.push({
      name: cleanEventName(raceName),
      startTime,
      distance,
      positiveElevation,
      type
    })
  })

  return races
}

/**
 * Parse une date française "30 Novembre 2025" ou "01 novembre"
 */
export function parseFrenchDate(dateStr: string): Date | undefined {
  try {
    // Mapping des mois français
    const monthsMap: Record<string, number> = {
      'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
      'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
      'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11
    }

    // Format: "01 novembre" ou "01 Novembre 2025"
    const match = dateStr.match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/)
    if (!match) return undefined

    const day = parseInt(match[1], 10)
    const monthName = match[2].toLowerCase()
    const year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear()

    const month = monthsMap[monthName]
    if (month === undefined) return undefined

    const date = new Date(year, month, day)
    return isNaN(date.getTime()) ? undefined : date
  } catch {
    return undefined
  }
}

/**
 * Parse une distance "10 km" ou "10000 m" et retourne en mètres
 */
export function parseDistance(distanceStr: string): number | undefined {
  try {
    // Nettoyer la chaîne
    const cleaned = distanceStr.toLowerCase().replace(/\s/g, '')

    // Chercher pattern distance
    const kmMatch = cleaned.match(/(\d+(?:[.,]\d+)?)\s*k[m]?/)
    if (kmMatch) {
      const km = parseFloat(kmMatch[1].replace(',', '.'))
      return Math.round(km * 1000)
    }

    const mMatch = cleaned.match(/(\d+)\s*m(?!i)/)
    if (mMatch) {
      return parseInt(mMatch[1], 10)
    }

    // Chercher juste un nombre (assumer km si > 100, sinon mètres)
    const numMatch = cleaned.match(/(\d+(?:[.,]\d+)?)/)
    if (numMatch) {
      const num = parseFloat(numMatch[1].replace(',', '.'))
      return num > 100 ? Math.round(num * 1000) : Math.round(num)
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * Parse un dénivelé "500 m" ou "D+ 500m" et retourne en mètres
 */
export function parseElevation(elevationStr: string): number | undefined {
  try {
    const cleaned = elevationStr.toLowerCase().replace(/\s/g, '')
    
    // Chercher D+ ou dénivelé
    const match = cleaned.match(/(?:d\+|dénivelé|elevation)[:\s]*(\d+)/)
    if (match) {
      return parseInt(match[1], 10)
    }

    // Si c'est dans un contexte clair de dénivelé
    if (cleaned.includes('d+') || cleaned.includes('dénivelé')) {
      const numMatch = cleaned.match(/(\d+)\s*m/)
      if (numMatch) {
        return parseInt(numMatch[1], 10)
      }
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * Nettoie un nom d'événement (retire "3ème édition", années, etc.)
 */
export function cleanEventName(name: string): string {
  let cleaned = name.trim()

  // Retirer les éditions (3ème édition, 10e édition, etc.)
  cleaned = cleaned.replace(/\d+[èe]?m?e?\s+(?:é|e)dition/gi, '')

  // Retirer les années (2025, etc.)
  cleaned = cleaned.replace(/\b20\d{2}\b/g, '')

  // Retirer les numéros d'édition seuls
  cleaned = cleaned.replace(/\b\d+e\b/gi, '')

  // Retirer les horaires en début/fin
  cleaned = cleaned.replace(/^\d{1,2}[h:]\d{2}\s*[-–]?\s*/i, '')
  cleaned = cleaned.replace(/\s*[-–]?\s*\d{1,2}[h:]\d{2}$/i, '')

  // Nettoyer espaces multiples
  cleaned = cleaned.replace(/\s+/g, ' ')

  // Nettoyer tirets/slash en début/fin
  cleaned = cleaned.replace(/^[-–/\s]+|[-–/\s]+$/g, '')

  return cleaned.trim()
}

/**
 * Extrait le nombre total de pages depuis le sélecteur de pagination
 */
export function extractTotalPages(html: string): number {
  const $ = cheerio.load(html)
  
  // Chercher dans le div de pagination
  const paginationText = $('#optionsPagination').text()
  const match = paginationText.match(/Page\s+\d+\s+\/\s+(\d+)/)
  
  if (match) {
    return parseInt(match[1], 10)
  }

  return 1 // Par défaut, 1 page
}

/**
 * Extrait le nombre total de résultats
 */
export function extractTotalResults(html: string): number {
  const $ = cheerio.load(html)
  
  // Chercher "71 résultats"
  const resultsText = $('.selector p').text()
  const match = resultsText.match(/(\d+)\s+résultats?/)
  
  if (match) {
    return parseInt(match[1], 10)
  }

  return 0
}
