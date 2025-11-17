import express from 'express'
import { PrismaClient } from '@prisma/client'

const router = express.Router()
const prisma = new PrismaClient()

// Types pour les paramètres
type TimeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

/**
 * Génère les intervalles de temps selon la granularité
 */
function generateTimeIntervals(startDate: Date, endDate: Date, granularity: TimeGranularity): Date[] {
  const intervals: Date[] = []
  let current = new Date(startDate)
  
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

    // IMPORTANT: Le champ confirmedAt doit être rempli quand calendarStatus passe à CONFIRMED
    // Cette requête utilise Edition.confirmedAt pour tracer l'évolution
    
    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const results = []

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endDate

      // Compte le nombre de confirmations dans cet intervalle
      // Note: Cette requête nécessite une connexion à Miles Republic via DatabaseManager
      // Pour l'instant, on retourne des données mockées jusqu'à l'implémentation complète
      
      results.push({
        date: formatDateLabel(currentDate, granularity),
        count: 0, // TODO: Implémenter la vraie requête sur Miles Republic
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
 * GET /api/stats/proposals-created
 * Évolution du nombre de propositions créées par type
 */
router.get('/proposals-created', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()
    const granularity = (req.query.granularity as TimeGranularity) || 'month'

    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const results = []

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endDate

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

    // Récupérer toutes les propositions dans la période avec leur reviewedBy
    const proposals = await prisma.proposal.findMany({
      where: {
        reviewedAt: {
          gte: startDate,
          lte: endDate
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
      if (!user) return // Utilisateur supprimé ?

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

export { router as statsRouter }
