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
 * @param html Le HTML de la page de listing
 * @param referenceDate Date de référence utilisée pour la recherche (pour déduire l'année si absente)
 */
export function parseCompetitionsList(html: string, referenceDate?: Date): FFACompetition[] {
  const $ = cheerio.load(html)
  const competitions: FFACompetition[] = []

  // Table principale des compétitions
  // Note: on ne filtre pas sur .clickable car cette classe n'existe pas dans le HTML FFA
  // On filtre plutôt les lignes de détail (detail-row) qui sont des sous-lignes mobiles
  $('table tbody tr').not('.detail-row').each((_, element) => {
    try {
      const $row = $(element)

      // Ignorer les lignes de header (colspan)
      const firstTd = $row.find('td:first-child')
      if (firstTd.attr('colspan')) return

      // Vérifier qu'on a bien plusieurs colonnes (pas une ligne de header)
      const cellsCount = $row.find('td').length
      if (cellsCount < 7) return // Une compétition valide a au moins 7 colonnes

      // Extraire le numéro FFA depuis l'attribut title
      const titleAttr = $row.find('td:first-child a').attr('title')
      const ffaIdMatch = titleAttr?.match(/Compétition numéro : (\d+)/)
      if (!ffaIdMatch) return

      const ffaId = ffaIdMatch[1]

      // Extraire les colonnes
      const $cells = $row.find('td')

      // Date
      const dateText = $cells.eq(0).find('a').text().trim()
      const date = parseFrenchDate(dateText, referenceDate)
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

      // Ligue (ex: "ARA", "H-F", "G-E")
      const ligueMatch = locationHtml.match(/frmligue=([A-Z-]+)/)
      const ligue = ligueMatch ? ligueMatch[1] : ''

      // Type
      const typeHtml = $cells.eq(3).html() || ''
      const type = cheerio.load(typeHtml.split('<br>')[0]).text().trim()

      // Niveau
      const level = $cells.eq(4).text().trim()

      // URL de la fiche détaillée (colonne 7)
      const detailPath = $cells.eq(6).find('a').attr('href')
      const detailUrl = detailPath ? `https://www.athle.fr${detailPath}` : ''

      // URL de la page résultats (colonne 8) - si disponible
      // Le lien contient "frmbase=resultats" si les résultats sont publiés
      const resultsLink = $cells.eq(7).find('a[href*="frmbase=resultats"]')
      let resultsUrl: string | null = null
      if (resultsLink.length > 0) {
        const resultsPath = resultsLink.attr('href')
        if (resultsPath) {
          resultsUrl = resultsPath.startsWith('http')
            ? resultsPath
            : `https://www.athle.fr${resultsPath}`
        }
      }

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
          detailUrl,
          resultsUrl
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
    startDate: competition.date,  // Initialisation par défaut
    endDate: competition.date,    // Initialisation par défaut
    races: []
  }

  // Vérifier si c'est un événement multi-jours
  // Format: "17 au 18 Janvier 2026" ou "17 au 18 janvier"
  // Chercher dans tous les éléments .body-small.text-dark-grey
  let dateRangeText = ''
  $('.body-small.text-dark-grey').each((_, el) => {
    const text = $(el).text().trim()
    if (text.match(/\d{1,2}\s+au\s+\d{1,2}\s+\w+/)) {
      dateRangeText = text
      return false // Stop iteration
    }
  })

  const dateRangeMatch = dateRangeText.match(/(\d{1,2})\s+au\s+(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/)

  if (dateRangeMatch) {
    // Événement multi-jours : écraser avec les dates réelles
    const startDay = parseInt(dateRangeMatch[1], 10)
    const endDay = parseInt(dateRangeMatch[2], 10)
    const monthName = dateRangeMatch[3].toLowerCase()
    const year = dateRangeMatch[4]
      ? parseInt(dateRangeMatch[4], 10)
      : competition.date.getFullYear()

    // Mapping des mois français
    const monthsMap: Record<string, number> = {
      'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
      'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
      'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11
    }

    const endMonth = monthsMap[monthName]
    if (endMonth !== undefined) {
      // Cas spécial: si startDay > endDay, l'événement chevauche 2 mois
      // Exemple: "28 au 1 Mars" = 28 février au 1er mars
      if (startDay > endDay) {
        // Le mois de début est le mois précédent
        const startMonth = endMonth === 0 ? 11 : endMonth - 1
        const startYear = endMonth === 0 ? year - 1 : year

        details.startDate = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0))
        details.endDate = new Date(Date.UTC(year, endMonth, endDay, 0, 0, 0, 0))
      } else {
        // Cas normal: même mois pour début et fin
        details.startDate = new Date(Date.UTC(year, endMonth, startDay, 0, 0, 0, 0))
        details.endDate = new Date(Date.UTC(year, endMonth, endDay, 0, 0, 0, 0))
      }
    }
  }
  // Sinon : startDate = endDate = competition.date (déjà initialisé)

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

    // Titre de la course
    // Format 1 (événement 1 jour): "14:00 - 1 km - Course HS non officielle"
    // Format 2 (événement multi-jours): "17/01 18:30 - Bol d'air de saint-av 9 km by night"
    const raceTitle = $card.find('h3').text().trim()
    if (!raceTitle) {
      console.log(`[PARSER] Card ${index}: titre vide`)
      return
    }

    // Détails de la course (catégories, distance, dénivelé)
    // Ex: "EAF / EAM - 1000 m" ou "TCF / TCM - 21000 m / 187 m D+ / 22870 m effort"
    const raceDetails = $card.find('p.text-dark-grey').first().text().trim()

    console.log(`[PARSER] Course trouvée: \"${raceTitle}\" | Détails: \"${raceDetails}\"`)

    // Extraire date (format: "17/01") pour événements multi-jours
    const dateMatch = raceTitle.match(/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})/)
    let raceDate: string | undefined
    let startTime: string | undefined
    let cleanedName = raceTitle

    if (dateMatch) {
      // Format multi-jours: "17/01 18:30"
      raceDate = `${dateMatch[1]}/${dateMatch[2]}`
      startTime = `${dateMatch[3]}:${dateMatch[4]}`
      // Retirer la date et l'heure du nom
      cleanedName = raceTitle.replace(/^\d{1,2}\/\d{2}\s+\d{1,2}:\d{2}\s*-?\s*/, '')
    } else {
      // Format 1 jour: "14:00" ou "28/02 " (date sans heure)
      const timeMatch = raceTitle.match(/(\d{1,2}):(\d{2})/)
      if (timeMatch) {
        startTime = `${timeMatch[1]}:${timeMatch[2]}`
        // Retirer l'heure du nom
        cleanedName = raceTitle.replace(/^\d{1,2}:\d{2}\s*-?\s*/, '')
      }

      // Vérifier si une date seule est présente (ex: "28/02  - Trailou")
      const dateOnlyMatch = raceTitle.match(/^(\d{1,2})\/(\d{2})\s+/)
      if (dateOnlyMatch) {
        raceDate = `${dateOnlyMatch[1]}/${dateOnlyMatch[2]}`
        // Retirer la date du nom
        cleanedName = raceTitle.replace(/^\d{1,2}\/\d{2}\s*-?\s*/, '')
      }
    }

    // Extraire distance depuis les détails OU le titre (essayer les deux)
    // Certaines pages FFA ont la distance dans les détails (ex: "21000 m")
    // D'autres l'ont uniquement dans le titre (ex: "52km - Course HS non officielle")
    const distance = parseDistance(raceDetails) || parseDistance(raceTitle)

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
      name: cleanEventName(cleanedName),
      raceDate,
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
 *
 * @param dateStr La date au format français (ex: "19 Avril 2026" ou "19 Avril")
 * @param referenceDate Date de référence pour déduire l'année si non fournie (utilise l'année du mois scrapé)
 */
export function parseFrenchDate(dateStr: string, referenceDate?: Date): Date | undefined {
  try {
    // Mapping des mois français
    const monthsMap: Record<string, number> = {
      'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
      'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
      'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11
    }

    // Format: "01 novembre" ou "01 Novembre 2025"
    // Note: \w ne matche pas les accents, utiliser [a-zà-ÿ]+ pour les mois français
    const match = dateStr.match(/(\d{1,2})\s+([a-zà-ÿ]+)(?:\s+(\d{4}))?/i)
    if (!match) return undefined

    const day = parseInt(match[1], 10)
    const monthName = match[2].toLowerCase()

    const month = monthsMap[monthName]
    if (month === undefined) return undefined

    // Déterminer l'année
    let year: number
    if (match[3]) {
      // Année explicite fournie
      year = parseInt(match[3], 10)
    } else if (referenceDate) {
      // Utiliser l'année du mois scrapé
      year = referenceDate.getFullYear()
    } else {
      // Fallback : année courante
      year = new Date().getFullYear()
    }

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
 * Normalise un nom de course FFA selon le format standard
 * [Category Level 1] [Relais ?] [Enfants ?] [Distance]
 *
 * Exemples :
 * - "1/2 Marathon" (21 km) → "Course 21 km"
 * - "Trail des Loups" (25 km) → "Trail 25 km"
 * - "Marche Nordique" (8 km) → "Marche Nordique 8 km"
 * - "Course Relais 4x5km" (20 km) → "Course Relais 20 km"
 *
 * @param raceName - Nom brut de la course FFA
 * @param categoryLevel1 - Catégorie inférée (RUNNING, TRAIL, WALK, etc.)
 * @param categoryLevel2 - Sous-catégorie inférée (HALF_MARATHON, NORDIC_WALK, etc.)
 * @param distance - Distance en km (optionnelle)
 * @returns Nom normalisé
 */
export function normalizeFFARaceName(
  raceName: string,
  categoryLevel1?: string,
  categoryLevel2?: string,
  distance?: number
): string {
  const lower = raceName.toLowerCase()

  // 1. Détection des modificateurs
  const isRelay = /relais|ekiden|x\d/.test(lower)
  const isKids = /enfant|kids|junior|jeune|pouss/.test(lower)

  // 2. Label de catégorie principal
  const categoryLabel = getCategoryLabel(categoryLevel1, categoryLevel2)

  // 3. Composition
  const parts: string[] = []

  // Ajouter le label de catégorie
  parts.push(categoryLabel)

  // Ajouter "Relais" si détecté ET pas déjà dans le label
  if (isRelay && !categoryLabel.toLowerCase().includes('relais')) {
    parts.push('Relais')
  }

  // Ajouter "Enfants" si détecté
  if (isKids) {
    parts.push('Enfants')
  }

  // Ajouter la distance (sauf pour triathlon avec format spécial)
  if (distance && categoryLevel1 !== 'TRIATHLON') {
    if (distance < 1) {
      parts.push(`${Math.round(distance * 1000)} m`)
    } else {
      // Arrondir à 1 décimale si nécessaire
      const rounded = Math.round(distance * 10) / 10
      parts.push(`${rounded} km`)
    }
  }

  return parts.join(' ')
}

/**
 * Retourne le label de catégorie à afficher selon categoryLevel1 et categoryLevel2
 *
 * Cas spéciaux basés sur level 2, sinon fallback sur level 1
 */
export function getCategoryLabel(
  categoryLevel1?: string,
  categoryLevel2?: string
): string {
  // Cas spéciaux basés sur level 2
  if (categoryLevel2) {
    switch (categoryLevel2) {
      // WALK
      case 'NORDIC_WALK':
        return 'Marche Nordique'
      case 'HIKING':
        return 'Randonnée'

      // CYCLING
      case 'GRAVEL_RIDE':
      case 'GRAVEL_RACE':
        return 'Gravel'
      case 'GRAN_FONDO':
        return 'Gran Fondo'
      case 'MOUNTAIN_BIKE_RIDE':
        return 'VTT'
      case 'ROAD_CYCLING_TOUR':
        return 'Vélo'

      // TRAIL
      case 'ULTRA_TRAIL':
        return 'Ultra Trail'
      case 'DISCOVERY_TRAIL':
      case 'SHORT_TRAIL':
      case 'LONG_TRAIL':
        return 'Trail'
      case 'VERTICAL_KILOMETER':
        return 'Kilomètre Vertical'

      // TRIATHLON
      case 'TRIATHLON_XS':
        return 'Triathlon XS'
      case 'TRIATHLON_S':
        return 'Triathlon S'
      case 'TRIATHLON_M':
        return 'Triathlon M'
      case 'TRIATHLON_L':
        return 'Triathlon L'
      case 'TRIATHLON_XXL':
        return 'Triathlon XXL'
      case 'DUATHLON':
        return 'Duathlon'
      case 'AQUATHLON':
        return 'Aquathlon'
      case 'SWIM_RUN':
        return 'Swim Run'
      case 'RUN_BIKE':
        return 'Run & Bike'
      case 'SWIM_BIKE':
        return 'Swim Bike'

      // RUNNING
      case 'EKIDEN':
        return 'Course Relais'
      case 'CROSS':
        return 'Cross'

      // FUN
      case 'OBSTACLE_RACE':
        return 'Course à Obstacles'
      case 'COLOR_RUN':
        return 'Color Run'
      case 'SPARTAN_RACE':
        return 'Spartan Race'
      case 'MUD_DAY':
        return 'Mud Day'

      // OTHER
      case 'CANICROSS':
        return 'Canicross'
      case 'ORIENTEERING':
        return 'Course d\'Orientation'
    }
  }

  // Fallback sur level 1
  if (categoryLevel1) {
    const level1Map: Record<string, string> = {
      'RUNNING': 'Course',
      'TRAIL': 'Trail',
      'WALK': 'Marche',
      'CYCLING': 'Vélo',
      'TRIATHLON': 'Triathlon',
      'FUN': 'Course Fun',
      'OTHER': 'Autre'
    }
    return level1Map[categoryLevel1] || 'Course'
  }

  return 'Course' // Défaut
}

/**
 * Classifie une URL organisateur selon son type (facebook, instagram, website)
 *
 * @param url - L'URL à classifier
 * @returns Un objet avec un seul champ URL défini selon le type détecté
 */
export function classifyOrganizerUrl(url: string | undefined): {
  websiteUrl?: string
  facebookUrl?: string
  instagramUrl?: string
} {
  if (!url) return {}

  const normalizedUrl = url.toLowerCase()

  // Détection Facebook (facebook.com, fb.com, fb.me)
  if (normalizedUrl.includes('facebook.com') || normalizedUrl.includes('fb.com') || normalizedUrl.includes('fb.me')) {
    return { facebookUrl: url }
  }

  // Détection Instagram (instagram.com, instagr.am)
  if (normalizedUrl.includes('instagram.com') || normalizedUrl.includes('instagr.am')) {
    return { instagramUrl: url }
  }

  // Par défaut, c'est un site web
  return { websiteUrl: url }
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
