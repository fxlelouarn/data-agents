import { PrismaClient } from '@prisma/client'
import { StructuredLogger, LogEntry, LogContext, LogLevelType } from './StructuredLogger'

/**
 * Database-backed logger that persists logs to the database
 */
export class DatabaseLogger extends StructuredLogger {
  constructor(
    private prisma: PrismaClient,
    context: LogContext = {},
    minLevel: LogLevelType = 'INFO'
  ) {
    super(context, minLevel)
  }

  /**
   * Override output to also persist to database
   */
  protected output(entry: LogEntry): void {
    // Call parent output for console/JSON logging
    super.output(entry)

    // Also persist to database (async, non-blocking)
    this.persistToDatabase(entry).catch(error => {
      // Fallback to console if database fails
      console.error('Failed to persist log to database:', error)
    })
  }

  /**
   * Persist log entry to database
   */
  private async persistToDatabase(entry: LogEntry): Promise<void> {
    try {
      // Only persist if we have an agentId (agent-specific logs)
      if (entry.agentId) {
        await this.prisma.agentLog.create({
          data: {
            agentId: entry.agentId,
            runId: entry.runId || null,
            level: entry.level as any,
            message: entry.message,
            data: {
              timestamp: entry.timestamp,
              service: entry.service,
              component: entry.component,
              operation: entry.operation,
              duration: entry.duration,
              context: entry.context,
              error: entry.error,
              metadata: entry.metadata
            }
          }
        })
      }
    } catch (error) {
      // Don't throw here to avoid logging loops
      console.error('Database log persistence failed:', error)
    }
  }

  /**
   * Create a child logger that also persists to database
   */
  child(additionalContext: Partial<LogContext>): DatabaseLogger {
    return new DatabaseLogger(
      this.prisma,
      { ...this.context, ...additionalContext },
      this.minLevel
    )
  }
}

/**
 * Factory function to create database-backed loggers
 */
export function createDatabaseBackedLogger(
  prisma: PrismaClient,
  context?: LogContext
): DatabaseLogger {
  return new DatabaseLogger(
    prisma,
    context,
    (process.env.LOG_LEVEL as LogLevelType) || 'INFO'
  )
}

/**
 * Create a database-backed logger for agents
 */
export function createAgentDatabaseLogger(
  prisma: PrismaClient,
  agentId: string,
  runId?: string
): DatabaseLogger {
  return createDatabaseBackedLogger(prisma, {
    service: 'agent-framework',
    component: 'agent-execution',
    agentId,
    runId
  })
}