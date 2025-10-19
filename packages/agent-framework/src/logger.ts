import winston from 'winston'
import { AgentLogger } from './types'
import { IDatabaseService, getDatabaseService } from './database-interface'

class DatabaseLogger implements AgentLogger {
  private winstonLogger: winston.Logger
  private db: IDatabaseService | null = null
  private agentId: string
  private runId?: string

  constructor(agentName: string, agentId: string, runId?: string) {
    this.agentId = agentId
    this.runId = runId

    // Create Winston logger for console output
    this.winstonLogger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        agent: agentName,
        agentId: agentId,
        runId: runId
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    })
  }

  setRunId(runId: string) {
    this.runId = runId
    this.winstonLogger.defaultMeta = {
      ...this.winstonLogger.defaultMeta,
      runId
    }
  }

  private async logToDatabase(level: string, message: string, data?: any) {
    try {
      if (!this.db) {
        this.db = await getDatabaseService()
      }
      await this.db.createLog({
        agentId: this.agentId,
        runId: this.runId,
        level,
        message,
        data
      })
    } catch (error) {
      // Fallback to console if database logging fails
      console.error('Failed to log to database:', error)
    }
  }

  debug(message: string, data?: any): void {
    this.winstonLogger.debug(message, data)
    this.logToDatabase('DEBUG', message, data)
  }

  info(message: string, data?: any): void {
    this.winstonLogger.info(message, data)
    this.logToDatabase('INFO', message, data)
  }

  warn(message: string, data?: any): void {
    this.winstonLogger.warn(message, data)
    this.logToDatabase('WARN', message, data)
  }

  error(message: string, data?: any): void {
    this.winstonLogger.error(message, data)
    this.logToDatabase('ERROR', message, data)
  }
}

class ConsoleOnlyLogger implements AgentLogger {
  private winstonLogger: winston.Logger
  private agentId: string
  private runId?: string

  constructor(agentName: string, agentId: string, runId?: string) {
    this.agentId = agentId
    this.runId = runId

    // Create Winston logger for console output only
    this.winstonLogger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        agent: agentName,
        agentId: agentId,
        runId: runId
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    })
  }

  setRunId(runId: string) {
    this.runId = runId
    this.winstonLogger.defaultMeta = {
      ...this.winstonLogger.defaultMeta,
      runId
    }
  }

  debug(message: string, data?: any): void {
    this.winstonLogger.debug(message, data)
  }

  info(message: string, data?: any): void {
    this.winstonLogger.info(message, data)
  }

  warn(message: string, data?: any): void {
    this.winstonLogger.warn(message, data)
  }

  error(message: string, data?: any): void {
    this.winstonLogger.error(message, data)
  }
}

export function createLogger(agentName: string, agentId: string, runId?: string): AgentLogger {
  return new DatabaseLogger(agentName, agentId, runId)
}

export function createConsoleLogger(agentName: string, agentId: string, runId?: string): AgentLogger {
  return new ConsoleOnlyLogger(agentName, agentId, runId)
}
