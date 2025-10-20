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
import { cacheRouter } from './routes/cache'
import { eventsRouter } from './routes/events'
import { AgentScheduler } from './services/scheduler'
import { errorHandler } from './middleware/error-handler'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 4001

// Security middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4000',
  credentials: true
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
})
app.use(limiter)

// General middleware
app.use(compression())
app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api/health', healthRouter)
app.use('/api/agents', agentRouter)
app.use('/api/proposals', proposalRouter)
app.use('/api/runs', runRouter)
app.use('/api/updates', updateRouter)
app.use('/api/logs', logRouter)
app.use('/api/databases', databaseRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/cache', cacheRouter)
app.use('/api/events', eventsRouter)

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
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...')
  await scheduler.stop()
  process.exit(0)
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Data Agents API server running on port ${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
  
  // Start scheduler
  scheduler.start().catch(console.error)
})

export default app