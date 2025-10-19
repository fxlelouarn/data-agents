import { Router } from 'express'
import { DatabaseService } from '@data-agents/database'
import { asyncHandler } from '../middleware/error-handler'

const router = Router()
const db = new DatabaseService()

// GET /api/health - Health check endpoint
router.get('/', asyncHandler(async (req: any, res: any) => {
  const startTime = Date.now()
  
  try {
    // Test database connection
    await db.prisma.$queryRaw`SELECT 1`
    
    const dbLatency = Date.now() - startTime
    
    // Get basic stats
    const stats = await Promise.all([
      db.prisma.agent.count(),
      db.prisma.agentRun.count({ where: { status: 'RUNNING' } }),
      db.prisma.proposal.count({ where: { status: 'PENDING' } })
    ])

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: true,
        latency: `${dbLatency}ms`
      },
      stats: {
        totalAgents: stats[0],
        runningJobs: stats[1],
        pendingProposals: stats[2]
      },
      version: process.env.npm_package_version || '1.0.0'
    })
  } catch (error) {
    res.status(503).json({
      success: false,
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
}))

export { router as healthRouter }