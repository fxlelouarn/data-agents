import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

import { agentRouter } from './routes/agents'
import { proposalRouter } from './routes/proposals'
import { runRouter } from './routes/runs'
import { updateRouter } from './routes/updates'
import { logRouter } from './routes/logs'
import { healthRouter } from './routes/health'
import { databaseRouter } from './routes/databases'
import { settingsRouter } from './routes/settings'
import { eventsRouter } from './routes/events'
import { statsRouter } from './routes/stats'
import { versionRouter } from './routes/version'
import authRouter from './routes/auth'
import { AgentScheduler } from './services/scheduler'
import { updateAutoApplyScheduler } from './services/update-auto-apply-scheduler'
import { errorHandler } from './middleware/error-handler'
import { APP_VERSION } from './version'

// Load environment variables
dotenv.config({ path: '../../.env' })

const app = express()
const PORT = process.env.PORT || 4001

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4000',
  credentials: true
}))

// Rate limiting (assouplies pour le développement)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (plus court mais plus permissif)
  max: 500, // 500 requêtes par minute (au lieu de 100/15min = 6.6/min)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
})
app.use('/api', limiter) // Appliquer uniquement sur /api, pas sur /health

// ⏱️ Request timing middleware - measure total request time
app.use((req, res, next) => {
  const start = Date.now()
  const originalSend = res.send

  // Override res.send to log timing
  res.send = function(data) {
    const duration = Date.now() - start
    console.log(`[TIMING] ${req.method} ${req.path} - completed in ${duration}ms (status: ${res.statusCode})`)

    if (duration > 1000) {
      console.warn(`⚠️  SLOW REQUEST: ${req.method} ${req.path} took ${duration}ms (> 1s)`)
    }

    return originalSend.call(this, data)
  }

  next()
})

// ⏱️ Request timing middleware - measure total request time
app.use((req, res, next) => {
  const start = Date.now()
  const originalSend = res.send

  res.send = function(data) {
    const duration = Date.now() - start
    console.log(`[TIMING] ${req.method} ${req.path} - completed in ${duration}ms (status: ${res.statusCode})`)
    if (duration > 1000) {
      console.warn(`⚠️  SLOW REQUEST: ${req.method} ${req.path} took ${duration}ms (> 1s)`)
    }
    return originalSend.call(this, data)
  }
  next()
})

// General middleware
app.use(compression())
app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api/health', healthRouter)
app.use('/api/version', versionRouter)  // Version endpoint (public)
app.use('/api/auth', authRouter)  // Auth routes (login, users)
app.use('/api/agents', agentRouter)
app.use('/api/proposals', proposalRouter)
app.use('/api/runs', runRouter)
app.use('/api/updates', updateRouter)
app.use('/api/logs', logRouter)
app.use('/api/databases', databaseRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/events', eventsRouter)
app.use('/api/stats', statsRouter)

// Error handling
app.use(errorHandler)

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  })
})

// Initialize scheduler
const scheduler = new AgentScheduler()

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...')
  await scheduler.stop()
  updateAutoApplyScheduler.stop()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...')
  await scheduler.stop()
  updateAutoApplyScheduler.stop()
  process.exit(0)
})

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Data Agents API v${APP_VERSION} running on port ${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🐝 Node version: ${process.version}`)
  console.log(`📡 Version endpoint: http://localhost:${PORT}/api/version`)

  // Synchroniser les agents avec le code
  try {
    console.log('🔄 Synchronisation des agents avec le code...')
    const { execSync } = await import('child_process')
    execSync('npm run sync-agents', {
      stdio: 'inherit',
      cwd: process.cwd().replace('/apps/api', '')
    })
  } catch (error) {
    console.warn('⚠️  Erreur lors de la synchronisation des agents (non-bloquant):', error)
  }

  // Start scheduler
  scheduler.start().catch(console.error)

  // Start auto-apply scheduler if enabled
  updateAutoApplyScheduler.start().catch(error => {
    console.warn('⚠️  Error starting auto-apply scheduler:', error)
  })
})

export default app
