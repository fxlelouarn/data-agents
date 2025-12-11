import express from 'express'
import { PrismaClient } from '@prisma/client'
import { DatabaseManager, createConsoleLogger } from '@data-agents/agent-framework'

const router = express.Router()
const prisma = new PrismaClient()

// Cache pour la connexion Miles Republic
let milesRepublicDb: any = null
let milesRepublicDbInitPromise: Promise<any> | null = null

/**
 * Initialise et retourne la connexion à Miles Republic (singleton)
 */
async function getMilesRepublicConnection(): Promise<any> {
  if (milesRepublicDb) return milesRepublicDb

  // Éviter les initialisations concurrentes
  if (milesRepublicDbInitPromise) return milesRepublicDbInitPromise

  milesRepublicDbInitPromise = (async () => {
    const milesRepublicConn = await prisma.databaseConnection.findFirst({
      where: { type: 'MILES_REPUBLIC', isActive: true }
    })

    if (!milesRepublicConn) {
      throw new Error('Miles Republic connection not found')
    }

    const logger = createConsoleLogger('API', 'stats')
    const dbManager = DatabaseManager.getInstance(logger)
    milesRepublicDb = await dbManager.getConnection(milesRepublicConn.id)
    return milesRepublicDb
  })()

  return milesRepublicDbInitPromise
}

// Types pour les paramètres
type TimeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

/**
 * Normalise une date au début de la période selon la granularité
 * Ex: pour 'month', 15/11/2025 devient 01/11/2025
 */
function normalizeToStartOfPeriod(date: Date, granularity: TimeGranularity): Date {
  const normalized = new Date(date)

  switch (granularity) {
    case 'day':
      // Déjà au début du jour (minuit)
      normalized.setHours(0, 0, 0, 0)
      break
    case 'week':
      // Début de la semaine (lundi)
      const dayOfWeek = normalized.getDay()
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Lundi = 1
      normalized.setDate(normalized.getDate() + diff)
      normalized.setHours(0, 0, 0, 0)
      break
    case 'month':
      // Premier jour du mois
      normalized.setDate(1)
      normalized.setHours(0, 0, 0, 0)
      break
    case 'quarter':
      // Premier jour du trimestre
      const quarterMonth = Math.floor(normalized.getMonth() / 3) * 3
      normalized.setMonth(quarterMonth, 1)
      normalized.setHours(0, 0, 0, 0)
      break
    case 'year':
      // Premier jour de l'année
      normalized.setMonth(0, 1)
      normalized.setHours(0, 0, 0, 0)
      break
  }

  return normalized
}

/**
 * Calcule le début de la période suivante
 * Ex: pour 'month' et 15/11/2025, retourne 01/12/2025
 */
function getNextPeriodStart(date: Date, granularity: TimeGranularity): Date {
  const next = normalizeToStartOfPeriod(date, granularity)

  switch (granularity) {
    case 'day':
      next.setDate(next.getDate() + 1)
      break
    case 'week':
      next.setDate(next.getDate() + 7)
      break
    case 'month':
      next.setMonth(next.getMonth() + 1)
      break
    case 'quarter':
      next.setMonth(next.getMonth() + 3)
      break
    case 'year':
      next.setFullYear(next.getFullYear() + 1)
      break
  }

  return next
}

/**
 * Génère les intervalles de temps selon la granularité
 * Les intervalles commencent toujours au début de la période (ex: 1er du mois pour 'month')
 */
function generateTimeIntervals(startDate: Date, endDate: Date, granularity: TimeGranularity): Date[] {
  const intervals: Date[] = []

  // Normaliser la date de début au début de la période
  let current = normalizeToStartOfPeriod(startDate, granularity)

  while (current <= endDate) {
    intervals.push(new Date(current))

    switch (granularity) {
      case 'day':
        current.setDate(current.getDate() + 1)
        break
      case 'week':
        current.setDate(current.getDate() + 7)
        break
      case 'month':
        current.setMonth(current.getMonth() + 1)
        break
      case 'quarter':
        current.setMonth(current.getMonth() + 3)
        break
      case 'year':
        current.setFullYear(current.getFullYear() + 1)
        break
    }
  }

  return intervals
}

/**
 * Formatte une date selon la granularité
 */
function formatDateLabel(date: Date, granularity: TimeGranularity): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  switch (granularity) {
    case 'day':
      return `${day}/${month}/${year}`
    case 'week':
      return `S${Math.ceil(date.getDate() / 7)} ${month}/${year}`
    case 'month':
      return `${month}/${year}`
    case 'quarter':
      return `T${Math.ceil((date.getMonth() + 1) / 3)} ${year}`
    case 'year':
      return String(year)
    default:
      return date.toISOString().split('T')[0]
  }
}

/**
 * GET /api/stats/calendar-confirmations
 * Évolution du nombre d'éditions confirmées (calendarStatus = CONFIRMED)
 */
router.get('/calendar-confirmations', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 jours par défaut
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()
    const granularity = (req.query.granularity as TimeGranularity) || 'month'

    // Connexion à Miles Republic pour récupérer les éditions confirmées
    const sourceDb = await getMilesRepublicConnection()

    // Pour le dernier intervalle, on va jusqu'au début de la période suivante
    const endPeriodBoundary = getNextPeriodStart(endDate, granularity)

    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const results = []

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endPeriodBoundary

      // Compte le nombre d'éditions confirmées dans cet intervalle
      // On utilise confirmedAt pour tracer quand l'édition a été confirmée
      const count = await sourceDb.edition.count({
        where: {
          confirmedAt: {
            gte: currentDate,
            lt: nextDate
          },
          calendarStatus: 'CONFIRMED'
        }
      })

      results.push({
        date: formatDateLabel(currentDate, granularity),
        count,
        timestamp: currentDate.toISOString()
      })
    }

    res.json({
      success: true,
      data: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        granularity,
        results
      }
    })
  } catch (error) {
    console.error('Error fetching calendar confirmations stats:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar confirmations statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * GET /api/stats/pending-confirmations
 * Évolution du nombre d'éditions futures en TO_BE_CONFIRMED
 * Montre combien d'éditions dans le futur n'ont pas encore été confirmées
 */
router.get('/pending-confirmations', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()
    const granularity = (req.query.granularity as TimeGranularity) || 'month'

    // Connexion à Miles Republic
    const sourceDb = await getMilesRepublicConnection()

    const endPeriodBoundary = getNextPeriodStart(endDate, granularity)
    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const results = []

    // Date actuelle pour filtrer les éditions futures
    const now = new Date()

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endPeriodBoundary

      // Compte les éditions TO_BE_CONFIRMED dont la date de début est dans le futur
      // et dont le startDate de l'édition tombe dans cet intervalle
      const count = await sourceDb.edition.count({
        where: {
          calendarStatus: 'TO_BE_CONFIRMED',
          startDate: {
            gte: now // Seulement les éditions futures
          },
          // On groupe par la date de l'édition (quand elle aura lieu)
          AND: [
            { startDate: { gte: currentDate } },
            { startDate: { lt: nextDate } }
          ]
        }
      })

      results.push({
        date: formatDateLabel(currentDate, granularity),
        count,
        timestamp: currentDate.toISOString()
      })
    }

    res.json({
      success: true,
      data: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        granularity,
        results
      }
    })
  } catch (error) {
    console.error('Error fetching pending confirmations stats:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending confirmations statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * GET /api/stats/proposals-created
 * Évolution du nombre de propositions créées par type
 */
router.get('/proposals-created', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()
    const granularity = (req.query.granularity as TimeGranularity) || 'month'

    // Pour le dernier intervalle, on va jusqu'au début de la période suivante
    // Ex: si endDate = 11/12/2025 et granularity = 'month', on va jusqu'au 01/01/2026
    const endPeriodBoundary = getNextPeriodStart(endDate, granularity)

    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const results = []

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endPeriodBoundary

      // Requête groupée par type de proposition
      const proposalsByType = await prisma.proposal.groupBy({
        by: ['type'],
        where: {
          createdAt: {
            gte: currentDate,
            lt: nextDate
          }
        },
        _count: {
          id: true
        }
      })

      const dataPoint: any = {
        date: formatDateLabel(currentDate, granularity),
        timestamp: currentDate.toISOString(),
        total: 0
      }

      // Ajouter les counts par type
      proposalsByType.forEach(item => {
        dataPoint[item.type] = item._count.id
        dataPoint.total += item._count.id
      })

      // S'assurer que tous les types sont présents (même avec 0)
      const allTypes = ['NEW_EVENT', 'EVENT_UPDATE', 'EDITION_UPDATE', 'RACE_UPDATE']
      allTypes.forEach(type => {
        if (!(type in dataPoint)) {
          dataPoint[type] = 0
        }
      })

      results.push(dataPoint)
    }

    res.json({
      success: true,
      data: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        granularity,
        results
      }
    })
  } catch (error) {
    console.error('Error fetching proposals created stats:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch proposals created statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * GET /api/stats/user-leaderboard
 * Classement des utilisateurs par nombre de propositions traitées
 */
router.get('/user-leaderboard', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 jours par défaut
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()

    // Pour inclure la journée entière, on va jusqu'au jour suivant à minuit
    const endDateInclusive = new Date(endDate)
    endDateInclusive.setDate(endDateInclusive.getDate() + 1)
    endDateInclusive.setHours(0, 0, 0, 0)

    // Récupérer toutes les propositions dans la période avec leur reviewedBy
    const proposals = await prisma.proposal.findMany({
      where: {
        reviewedAt: {
          gte: startDate,
          lt: endDateInclusive  // lt au lieu de lte pour être cohérent
        },
        reviewedBy: {
          not: null
        }
      },
      select: {
        reviewedBy: true,
        status: true
      }
    })

    // Récupérer les infos des utilisateurs
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    })

    // Créer un map pour accéder rapidement aux infos utilisateur
    const userMap = new Map(users.map(u => [u.id, u]))

    // Agréger les stats par utilisateur
    const userStats = new Map<string, {
      userId: string
      firstName: string
      lastName: string
      email: string
      approved: number
      rejected: number
      archived: number
      total: number
    }>()

    proposals.forEach(proposal => {
      if (!proposal.reviewedBy) return

      const user = userMap.get(proposal.reviewedBy)

      // Si pas d'utilisateur correspondant, utiliser reviewedBy comme nom
      // (pour les validateurs système comme "auto-validator-agent", "system", etc.)
      const displayName = user
        ? `${user.firstName} ${user.lastName}`.trim()
        : proposal.reviewedBy

      if (!userStats.has(proposal.reviewedBy)) {
        userStats.set(proposal.reviewedBy, {
          userId: proposal.reviewedBy,
          firstName: user?.firstName || displayName,
          lastName: user?.lastName || '',
          email: user?.email || '',
          approved: 0,
          rejected: 0,
          archived: 0,
          total: 0
        })
      }

      const stats = userStats.get(proposal.reviewedBy)!

      switch (proposal.status) {
        case 'APPROVED':
          stats.approved++
          break
        case 'REJECTED':
          stats.rejected++
          break
        case 'ARCHIVED':
          stats.archived++
          break
      }

      stats.total++
    })

    // Convertir en tableau et trier par total descendant
    const leaderboard = Array.from(userStats.values())
      .sort((a, b) => b.total - a.total)

    res.json({
      success: true,
      data: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        leaderboard
      }
    })
  } catch (error) {
    console.error('Error fetching user leaderboard:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user leaderboard',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

export { router as statsRouter }
