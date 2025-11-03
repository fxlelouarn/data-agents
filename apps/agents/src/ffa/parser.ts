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
  // Note: on ne filtre pas sur .clickable car cette classe n'existe pas dans le HTML FFA
  // On filtre plutôt les lignes de détail (detail-row) qui sont des sous-lignes mobiles
  $('table tbody tr').not('.detail-row').each((_, element) => {
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
  // Chercher d'abord dans le titre/header de la page pour le nom de l'organisateur
  const organizerHeading = $('h2, h3, h4').filter((_, el) => {
    const text = $(el).text().toLowerCase()
    return text.includes('organisateur') || text.includes('organisé par')
  }).first()
  
  if (organizerHeading.length > 0) {
    // Le nom peut être dans le texte qui suit directement, ou dans un élément frère
    const nextElement = organizerHeading.next()
    if (nextElement.length > 0) {
      const possibleName = nextElement.text().trim()
      if (possibleName && possibleName.length > 3 && possibleName.length < 100) {
        details.organizerName = possibleName
      }
    }
  }
  
  // Sinon, essayer de trouver dans les sections
  if (!details.organizerName) {
    $('section, div.club-card').each((_, element) => {
      const $element = $(element)
      const text = $element.text()
      
      // Chercher des patterns comme "Organisé par: ..." ou "Organisateur: ..."
      const organizerMatch = text.match(/Organis(?:é|e) par\s*:\s*([^\n\r]+)/i) ||
                             text.match(/Organisateur\s*:\s*([^\n\r]+)/i)
      
      if (organizerMatch && !details.organizerName) {
        const name = organizerMatch[1].trim()
        // Ne prendre que si c'est un nom raisonnable (pas un email ou URL)
        if (name && name.length > 3 && name.length < 100 && !name.includes('@') && !name.includes('http')) {
          details.organizerName = name
        }
      }
    })
  }
  
  // Chercher dans les sections de la page pour les autres infos
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
  if (!$eprevesSection.length) {
    console.warn('[PARSER] Section #epreuves non trouvée dans le HTML')
    // Essayer d'autres sélecteurs possibles
    const $tables = $('table')
    console.warn(`[PARSER] ${$tables.length} tables trouvées dans le HTML`)
    return races
  }
  
  console.log('[PARSER] Section #epreuves trouvée, extraction des courses...')

  // Nouvelle structure HTML : div.club-card au lieu de table
  const $clubCards = $eprevesSection.find('.club-card')
  console.log(`[PARSER] ${$clubCards.length} courses trouvées dans .club-card`)
  
  $clubCards.each((index, element) => {
    const $card = $(element)
    
    // Titre de la course (contient heure, distance, nom)
    // Ex: "14:00 - 1 km - Course HS non officielle" ou "09:00 - 22éme toussitrail 21kms - Trail XXS"
    const raceTitle = $card.find('h3').text().trim()
    if (!raceTitle) {
      console.log(`[PARSER] Card ${index}: titre vide`)
      return
    }
    
    // Détails de la course (catégories, distance, dénivelé)
    // Ex: "EAF / EAM - 1000 m" ou "TCF / TCM - 21000 m / 187 m D+ / 22870 m effort"
    const raceDetails = $card.find('p.text-dark-grey').first().text().trim()
    
    console.log(`[PARSER] Course trouvée: \"${raceTitle}\" | Détails: \"${raceDetails}\"`)

    // Extraire heure de départ depuis le titre
    const timeMatch = raceTitle.match(/(\d{1,2}):(\d{2})/)
    const startTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : undefined

    // Extraire distance depuis les détails ou le titre
    const distance = parseDistance(raceDetails || raceTitle)

    // Extraire dénivelé depuis les détails
    const positiveElevation = parseElevation(raceDetails)

    // Déterminer le type de course
    let type: FFARace['type'] = 'other'
    const lowerTitle = raceTitle.toLowerCase()
    if (lowerTitle.includes('trail')) {
      type = 'trail'
    } else if (lowerTitle.includes('marche') || lowerTitle.includes('randonnée')) {
      type = 'walk'
    } else if (distance && distance >= 100) {
      type = 'running'
    }

    races.push({
      name: cleanEventName(raceTitle),
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
 * Retourne une date à minuit UTC
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

    // Créer la date en UTC à minuit pour éviter les problèmes de timezone
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
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
 * Parse un dénivelé "500 m" ou "D+ 500m" ou "500 m D+" et retourne en mètres
 */
export function parseElevation(elevationStr: string): number | undefined {
  try {
    const cleaned = elevationStr.toLowerCase().replace(/\s/g, '')
    
    // Format 1: "D+ 500" ou "D+:500" (D+ avant le nombre)
    const match1 = cleaned.match(/(?:d\+|dénivelé|elevation)[:\s]*(\d+)/)
    if (match1) {
      return parseInt(match1[1], 10)
    }

    // Format 2: "500 m D+" ou "500m d+" (nombre avant D+)
    // Chercher un nombre suivi de 'm' puis de 'd+'
    const match2 = cleaned.match(/(\d+)\s*m\s*d\+/)
    if (match2) {
      return parseInt(match2[1], 10)
    }

    // Format 3: Si 'd+' ou 'dénivelé' est présent, chercher un nombre avec 'm'
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
