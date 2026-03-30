import express from 'express'
import { PrismaClient } from '@prisma/client'
import { DatabaseManager, createConsoleLogger } from '@data-agents/agent-framework'

const router = express.Router()
const prisma = new PrismaClient()

// Sport group mapping: categoryLevel1 → sport group key
const SPORT_GROUP_SQL_CASE = `
  CASE
    WHEN dominant_sport IN ('RUNNING', 'TRAIL', 'WALK') THEN 'running_trail'
    WHEN dominant_sport = 'TRIATHLON' THEN 'triathlon'
    WHEN dominant_sport = 'CYCLING' THEN 'cycling'
    ELSE 'other'
  END
`

const ALL_SPORT_GROUPS = ['running_trail', 'triathlon', 'cycling', 'other'] as const

/**
 * Sous-requête SQL pour déterminer le sport dominant d'une édition.
 * Retourne le categoryLevel1 le plus fréquent parmi les courses de l'édition.
 */
const DOMINANT_SPORT_SUBQUERY = `
  COALESCE(
    (SELECT r."categoryLevel1"
     FROM "Race" r
     WHERE r."editionId" = e.id
     GROUP BY r."categoryLevel1"
     ORDER BY COUNT(*) DESC, r."categoryLevel1" ASC
     LIMIT 1),
    'OTHER'
  )
`

type SportGroupKey = typeof ALL_SPORT_GROUPS[number]

/**
 * Initialise un objet avec tous les groupes sport à 0
 */
function emptySportCounts(): Record<SportGroupKey, number> {
  return { running_trail: 0, triathlon: 0, cycling: 0, other: 0 }
}

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
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()
    const granularity = (req.query.granularity as TimeGranularity) || 'month'
    const sportFilter = req.query.sport as SportGroupKey | undefined

    const sourceDb = await getMilesRepublicConnection()
    const endPeriodBoundary = getNextPeriodStart(endDate, granularity)
    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const results = []

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endPeriodBoundary

      if (sportFilter) {
        // Filtered mode: return count for selected sport only
        const rows: any[] = await sourceDb.$queryRawUnsafe(`
          WITH edition_sports AS (
            SELECT e.id,
              ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
            FROM "Edition" e
            WHERE e."calendarStatus" = 'CONFIRMED'
              AND e."confirmedAt" >= $1
              AND e."confirmedAt" < $2
          )
          SELECT COUNT(*)::int as count
          FROM edition_sports
          WHERE ${SPORT_GROUP_SQL_CASE} = $3
        `, currentDate, nextDate, sportFilter)

        results.push({
          date: formatDateLabel(currentDate, granularity),
          count: rows[0]?.count || 0,
          timestamp: currentDate.toISOString()
        })
      } else {
        // Default mode: return breakdown by sport group
        const rows: any[] = await sourceDb.$queryRawUnsafe(`
          WITH edition_sports AS (
            SELECT e.id,
              ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
            FROM "Edition" e
            WHERE e."calendarStatus" = 'CONFIRMED'
              AND e."confirmedAt" >= $1
              AND e."confirmedAt" < $2
          )
          SELECT ${SPORT_GROUP_SQL_CASE} as sport_group, COUNT(*)::int as count
          FROM edition_sports
          GROUP BY sport_group
        `, currentDate, nextDate)

        const counts = emptySportCounts()
        let total = 0
        for (const row of rows) {
          const key = row.sport_group as SportGroupKey
          if (key in counts) {
            counts[key] = row.count
            total += row.count
          }
        }

        results.push({
          date: formatDateLabel(currentDate, granularity),
          ...counts,
          total,
          timestamp: currentDate.toISOString()
        })
      }
    }

    res.json({
      success: true,
      data: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), granularity, results }
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
 * Évolution du nombre d'éditions futures (confirmées et à confirmer)
 * Retourne un stacked bar chart avec les deux statuts
 */
router.get('/pending-confirmations', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()
    const granularity = (req.query.granularity as TimeGranularity) || 'month'
    const sportFilter = req.query.sport as SportGroupKey | undefined

    const sourceDb = await getMilesRepublicConnection()

    const endPeriodBoundary = getNextPeriodStart(endDate, granularity)
    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const now = new Date()
    const results = []

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endPeriodBoundary

      if (sportFilter) {
        // Filtered mode: return confirmed/toBeConfirmed for selected sport
        const rows: any[] = await sourceDb.$queryRawUnsafe(`
          WITH edition_sports AS (
            SELECT e.id, e."calendarStatus",
              ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
            FROM "Edition" e
            WHERE e."startDate" >= $1
              AND e."startDate" >= $2
              AND e."startDate" < $3
              AND e."calendarStatus" IN ('CONFIRMED', 'TO_BE_CONFIRMED')
          )
          SELECT
            "calendarStatus",
            COUNT(*)::int as count
          FROM edition_sports
          WHERE ${SPORT_GROUP_SQL_CASE} = $4
          GROUP BY "calendarStatus"
        `, now, currentDate, nextDate, sportFilter)

        let confirmed = 0
        let toBeConfirmed = 0
        for (const row of rows) {
          if (row.calendarStatus === 'CONFIRMED') confirmed = row.count
          if (row.calendarStatus === 'TO_BE_CONFIRMED') toBeConfirmed = row.count
        }

        results.push({
          date: formatDateLabel(currentDate, granularity),
          confirmed,
          toBeConfirmed,
          total: confirmed + toBeConfirmed,
          timestamp: currentDate.toISOString()
        })
      } else {
        // Default mode: grouped+stacked by sport
        const rows: any[] = await sourceDb.$queryRawUnsafe(`
          WITH edition_sports AS (
            SELECT e.id, e."calendarStatus",
              ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
            FROM "Edition" e
            WHERE e."startDate" >= $1
              AND e."startDate" >= $2
              AND e."startDate" < $3
              AND e."calendarStatus" IN ('CONFIRMED', 'TO_BE_CONFIRMED')
          )
          SELECT
            ${SPORT_GROUP_SQL_CASE} as sport_group,
            "calendarStatus",
            COUNT(*)::int as count
          FROM edition_sports
          GROUP BY sport_group, "calendarStatus"
        `, now, currentDate, nextDate)

        const dataPoint: any = {
          date: formatDateLabel(currentDate, granularity),
          timestamp: currentDate.toISOString()
        }

        let total = 0
        for (const group of ALL_SPORT_GROUPS) {
          dataPoint[`${group}_confirmed`] = 0
          dataPoint[`${group}_toBeConfirmed`] = 0
        }

        for (const row of rows) {
          const group = row.sport_group as SportGroupKey
          if (row.calendarStatus === 'CONFIRMED') {
            dataPoint[`${group}_confirmed`] = row.count
          } else if (row.calendarStatus === 'TO_BE_CONFIRMED') {
            dataPoint[`${group}_toBeConfirmed`] = row.count
          }
          total += row.count
        }

        dataPoint.total = total
        results.push(dataPoint)
      }
    }

    res.json({
      success: true,
      data: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), granularity, results }
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
 * Exclut les agents et utilisateurs système (seuls les vrais users de la table User sont inclus)
 */
router.get('/user-leaderboard', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 jours par défaut
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()

    // Pour inclure la journée entière, on va jusqu'au jour suivant à minuit
    const endDateInclusive = new Date(endDate)
    endDateInclusive.setDate(endDateInclusive.getDate() + 1)
    endDateInclusive.setHours(0, 0, 0, 0)

    // Récupérer d'abord les vrais utilisateurs
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    })

    // Créer un map et un set des IDs utilisateurs valides
    const userMap = new Map(users.map(u => [u.id, u]))
    const validUserIds = users.map(u => u.id)

    // Récupérer uniquement les propositions validées par de vrais utilisateurs
    const proposals = await prisma.proposal.findMany({
      where: {
        reviewedAt: {
          gte: startDate,
          lt: endDateInclusive
        },
        reviewedBy: {
          in: validUserIds
        }
      },
      select: {
        reviewedBy: true,
        status: true
      }
    })

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
      if (!user) return // Sécurité supplémentaire

      if (!userStats.has(proposal.reviewedBy)) {
        userStats.set(proposal.reviewedBy, {
          userId: proposal.reviewedBy,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
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

/**
 * GET /api/stats/confirmation-rate-by-sport
 * Snapshot: taux de confirmation des éditions futures par groupe sport
 */
router.get('/confirmation-rate-by-sport', async (req, res) => {
  try {
    const sourceDb = await getMilesRepublicConnection()
    const now = new Date()

    const SPORT_LABELS: Record<SportGroupKey, string> = {
      running_trail: 'Course à pied / Trail',
      triathlon: 'Triathlon',
      cycling: 'Cyclisme',
      other: 'Autres',
    }

    const rows: any[] = await sourceDb.$queryRawUnsafe(`
      WITH edition_sports AS (
        SELECT e.id, e."calendarStatus",
          ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
        FROM "Edition" e
        WHERE e."startDate" >= $1
          AND e."calendarStatus" IN ('CONFIRMED', 'TO_BE_CONFIRMED')
      )
      SELECT
        ${SPORT_GROUP_SQL_CASE} as sport_group,
        "calendarStatus",
        COUNT(*)::int as count
      FROM edition_sports
      GROUP BY sport_group, "calendarStatus"
    `, now)

    // Aggregate into sport groups
    const sportData: Record<SportGroupKey, { confirmed: number; toBeConfirmed: number }> = {
      running_trail: { confirmed: 0, toBeConfirmed: 0 },
      triathlon: { confirmed: 0, toBeConfirmed: 0 },
      cycling: { confirmed: 0, toBeConfirmed: 0 },
      other: { confirmed: 0, toBeConfirmed: 0 },
    }

    for (const row of rows) {
      const group = row.sport_group as SportGroupKey
      if (!(group in sportData)) continue
      if (row.calendarStatus === 'CONFIRMED') {
        sportData[group].confirmed = row.count
      } else if (row.calendarStatus === 'TO_BE_CONFIRMED') {
        sportData[group].toBeConfirmed = row.count
      }
    }

    const results = ALL_SPORT_GROUPS.map(sport => {
      const data = sportData[sport]
      const total = data.confirmed + data.toBeConfirmed
      return {
        sport,
        label: SPORT_LABELS[sport],
        confirmed: data.confirmed,
        toBeConfirmed: data.toBeConfirmed,
        total,
        rate: total > 0 ? Math.round((data.confirmed / total) * 1000) / 10 : 0
      }
    })

    res.json({ success: true, data: { results } })
  } catch (error) {
    console.error('Error fetching confirmation rate by sport:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch confirmation rate by sport',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

export { router as statsRouter }
