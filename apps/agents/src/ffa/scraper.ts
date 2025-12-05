/**
 * Utilitaires de scraping HTTP pour le calendrier FFA
 *
 * Ce module gère les requêtes HTTP vers le site FFA avec :
 * - Construction des URLs de listing
 * - Gestion de la pagination
 * - Délais entre requêtes (comportement humain)
 * - Calcul de la saison FFA
 */

import axios, { AxiosError } from 'axios'
import { FFACompetition, FFACompetitionDetails } from './types'
import {
  parseCompetitionsList,
  parseCompetitionDetails,
  extractTotalPages,
  extractTotalResults
} from './parser'

/**
 * User-Agent réaliste pour les requêtes
 */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Calcule la saison FFA à partir d'une date
 * Une saison FFA commence le 1er septembre et se termine le 31 août de l'année suivante
 * Ex: 31 décembre 2025 -> saison 2026 (car entre sept 2025 et août 2026)
 */
export function calculateFFASeason(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth()

  // Si on est entre septembre (mois 8) et décembre (mois 11), la saison est l'année suivante
  // Sinon, la saison est l'année en cours
  if (month >= 8) {
    return (year + 1).toString()
  }

  return year.toString()
}

/**
 * Construit l'URL de listing FFA
 */
export function buildListingURL(
  ligue: string,
  startDate: Date,
  endDate: Date,
  season: string,
  page: number = 0
): string {
  const baseUrl = 'https://www.athle.fr/bases/liste.aspx'

  // Formater les dates en YYYY-MM-DD
  const formatDate = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const params = new URLSearchParams({
    frmpostback: 'true',
    frmbase: 'calendrier',
    frmmode: '1',
    frmespace: '0',
    frmsaisonffa: season,
    frmdate1: formatDate(startDate),
    frmdate2: formatDate(endDate),
    frmtype1: 'Running', // Filtrer sur Running (inclut trails, courses route, etc.)
    frmniveau: '',
    frmligue: ligue,
    frmdepartement: '',
    frmniveaulab: '',
    frmepreuve: '',
    frmtype2: '',
    frmtype3: '',
    frmtype4: ''
  })

  // Ajouter la pagination si nécessaire
  if (page > 0) {
    params.append('frmpage', page.toString())
  }

  return `${baseUrl}?${params.toString()}`
}

/**
 * Récupère la liste des compétitions pour une ligue et un mois donnés
 */
export async function fetchCompetitionsList(
  ligue: string,
  startDate: Date,
  endDate: Date,
  levels: string[],
  page: number = 0,
  humanDelayMs: number = 2000
): Promise<{
  competitions: FFACompetition[],
  hasNextPage: boolean,
  totalResults: number,
  totalPages: number
}> {
  try {
    // Calculer la saison FFA
    const season = calculateFFASeason(startDate)

    // Construire l'URL
    const url = buildListingURL(ligue, startDate, endDate, season, page)

    // Log pour debug
    console.log(`[FFA Scraper] URL construite: ${url.substring(0, 100)}...`)

    // Vérifier que l'URL est valide
    if (!url.startsWith('https://')) {
      throw new Error(`URL invalide (ne commence pas par https://): ${url}`)
    }

    // Attendre le délai humain (sauf pour la première page de la première requête)
    if (page > 0) {
      await humanDelay(humanDelayMs)
    }

    // Effectuer la requête
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 60000, // 60 secondes timeout
      maxRedirects: 5,
      // Gérer les redirections relatives en les convertissant en absolues
      beforeRedirect: (options: any, responseDetails: any) => {
        console.log(`[FFA Scraper] Redirection détectée: ${responseDetails.headers.location}`)
      }
    })

    const html = response.data

    // Parser les compétitions en passant la date de référence (mois scrapé)
    let competitions = parseCompetitionsList(html, startDate)

    // Filtrer par niveaux si spécifié
    if (levels && levels.length > 0) {
      competitions = competitions.filter(comp => levels.includes(comp.level))
    }

    // Extraire infos pagination
    const totalPages = extractTotalPages(html)
    const totalResults = extractTotalResults(html)
    const hasNextPage = page < totalPages - 1

    return {
      competitions,
      hasNextPage,
      totalResults,
      totalPages
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      if (axiosError.response?.status === 404) {
        // Pas de données pour cette période
        return { competitions: [], hasNextPage: false, totalResults: 0, totalPages: 1 }
      }
      throw new Error(`Erreur HTTP ${axiosError.response?.status}: ${axiosError.message}`)
    }
    throw error
  }
}

/**
 * Récupère les détails d'une compétition depuis sa fiche
 */
export async function fetchCompetitionDetails(
  detailUrl: string,
  competition: FFACompetition,
  humanDelayMs: number = 2000
): Promise<FFACompetitionDetails | null> {
  try {
    // Attendre le délai humain
    await humanDelay(humanDelayMs)

    // Effectuer la requête
    const response = await axios.get(detailUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.athle.fr/base/calendrier'
      },
      timeout: 60000
    })

    const html = response.data

    // Parser les détails
    const details = parseCompetitionDetails(html, competition)

    return details
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      console.warn(`Impossible de récupérer les détails de ${competition.name}: ${axiosError.message}`)
      // Retourner les infos de base sans les détails
      return {
        competition,
        startDate: competition.date,
        endDate: competition.date,
        races: []
      }
    }
    return null
  }
}

/**
 * Simule un délai humain entre requêtes
 */
export async function humanDelay(ms: number): Promise<void> {
  // Ajouter une variation aléatoire de ±20%
  const variation = ms * 0.2
  const actualDelay = ms + (Math.random() * variation * 2 - variation)

  return new Promise(resolve => setTimeout(resolve, actualDelay))
}

/**
 * Récupère toutes les pages de compétitions pour une période donnée
 */
export async function fetchAllCompetitionsForPeriod(
  ligue: string,
  startDate: Date,
  endDate: Date,
  levels: string[],
  humanDelayMs: number = 2000,
  maxPages: number = 50
): Promise<FFACompetition[]> {
  const allCompetitions: FFACompetition[] = []
  let currentPage = 0
  let hasNextPage = true

  while (hasNextPage && currentPage < maxPages) {
    const result = await fetchCompetitionsList(
      ligue,
      startDate,
      endDate,
      levels,
      currentPage,
      humanDelayMs
    )

    allCompetitions.push(...result.competitions)
    hasNextPage = result.hasNextPage
    currentPage++

    // Log de progression
    if (result.totalResults > 0) {
      console.log(
        `Page ${currentPage}/${result.totalPages}: ${result.competitions.length} compétitions (total: ${allCompetitions.length}/${result.totalResults})`
      )
    }
  }

  return allCompetitions
}

/**
 * Génère les dates de début/fin pour un mois donné
 */
export function getMonthBounds(yearMonth: string): { startDate: Date, endDate: Date } {
  const [year, month] = yearMonth.split('-').map(Number)

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0) // Dernier jour du mois

  return { startDate, endDate }
}

/**
 * Génère la liste des mois à scraper dans la fenêtre temporelle
 */
export function generateMonthsToScrape(windowMonths: number): string[] {
  const months: string[] = []
  const now = new Date()

  for (let i = 0; i < windowMonths; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    months.push(`${year}-${month}`)
  }

  return months
}
