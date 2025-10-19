import { LogLevel } from '@prisma/client'

// Standard log levels with numeric priorities
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
} as const

export type LogLevelType = keyof typeof LOG_LEVELS

// Base structured log entry interface
export interface LogEntry {
  timestamp: string
  level: LogLevelType
  message: string
  service?: string
  component?: string
  operation?: string
  agentId?: string
  runId?: string
  userId?: string
  requestId?: string
  duration?: number
  context?: Record<string, any>
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
  metadata?: Record<string, any>
}

// Context for maintaining request/operation context
export interface LogContext {
  service?: string
  component?: string
  operation?: string
  agentId?: string
  runId?: string
  userId?: string
  requestId?: string
  startTime?: number
}

export class StructuredLogger {
  protected context: LogContext = {}
  protected minLevel: LogLevelType

  constructor(
    context: LogContext = {},
    minLevel: LogLevelType = 'INFO'
  ) {
    this.context = context
    this.minLevel = minLevel
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): StructuredLogger {
    return new StructuredLogger(
      { ...this.context, ...additionalContext },
      this.minLevel
    )
  }

  /**
   * Update the logger's context
   */
  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context }
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevelType): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel]
  }

  /**
   * Create a structured log entry
   */
  private createLogEntry(
    level: LogLevelType,
    message: string,
    data?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context
    }

    // Add duration if we have a start time
    if (this.context.startTime) {
      entry.duration = Date.now() - this.context.startTime
    }

    // Add context data
    if (data && Object.keys(data).length > 0) {
      entry.context = data
    }

    // Add error information
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      }
    }

    return entry
  }

  /**
   * Log at DEBUG level
   */
  debug(message: string, data?: Record<string, any>): void {
    if (!this.shouldLog('DEBUG')) return

    const entry = this.createLogEntry('DEBUG', message, data)
    this.output(entry)
  }

  /**
   * Log at INFO level
   */
  info(message: string, data?: Record<string, any>): void {
    if (!this.shouldLog('INFO')) return

    const entry = this.createLogEntry('INFO', message, data)
    this.output(entry)
  }

  /**
   * Log at WARN level
   */
  warn(message: string, data?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog('WARN')) return

    const entry = this.createLogEntry('WARN', message, data, error)
    this.output(entry)
  }

  /**
   * Log at ERROR level
   */
  error(message: string, data?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog('ERROR')) return

    const entry = this.createLogEntry('ERROR', message, data, error)
    this.output(entry)
  }

  /**
   * Log the start of an operation
   */
  startOperation(operation: string, data?: Record<string, any>): StructuredLogger {
    const operationContext = {
      ...this.context,
      operation,
      startTime: Date.now()
    }

    const logger = new StructuredLogger(operationContext, this.minLevel)
    logger.info(`Starting operation: ${operation}`, data)
    return logger
  }

  /**
   * Log the successful completion of an operation
   */
  completeOperation(message?: string, data?: Record<string, any>): void {
    const operation = this.context.operation
    const finalMessage = message || `Operation completed: ${operation}`
    
    this.info(finalMessage, {
      ...data,
      operationStatus: 'completed'
    })
  }

  /**
   * Log the failure of an operation
   */
  failOperation(message?: string, data?: Record<string, any>, error?: Error): void {
    const operation = this.context.operation
    const finalMessage = message || `Operation failed: ${operation}`
    
    this.error(finalMessage, {
      ...data,
      operationStatus: 'failed'
    }, error)
  }

  /**
   * Log database operations
   */
  database(operation: string, table: string, data?: Record<string, any>): void {
    this.debug(`Database ${operation}`, {
      ...data,
      dbOperation: operation,
      dbTable: table
    })
  }

  /**
   * Log API requests
   */
  apiRequest(method: string, endpoint: string, data?: Record<string, any>): void {
    this.info(`API ${method} ${endpoint}`, {
      ...data,
      httpMethod: method,
      endpoint
    })
  }

  /**
   * Log API responses
   */
  apiResponse(method: string, endpoint: string, statusCode: number, data?: Record<string, any>): void {
    const level: LogLevelType = statusCode >= 400 ? 'ERROR' : statusCode >= 300 ? 'WARN' : 'INFO'
    
    this[level.toLowerCase() as 'info' | 'warn' | 'error'](`API ${method} ${endpoint} - ${statusCode}`, {
      ...data,
      httpMethod: method,
      endpoint,
      statusCode
    })
  }

  /**
   * Log agent-specific events
   */
  agent(agentId: string, event: string, data?: Record<string, any>): StructuredLogger {
    const agentLogger = this.child({ agentId })
    agentLogger.info(`Agent ${event}`, data)
    return agentLogger
  }

  /**
   * Output the log entry - can be overridden for custom output
   */
  protected output(entry: LogEntry): void {
    // In development, use console with pretty formatting
    if (process.env.NODE_ENV === 'development') {
      const color = this.getConsoleColor(entry.level)
      const reset = '\x1b[0m'
      const timestamp = entry.timestamp.split('T')[1].split('.')[0]
      
      console.log(
        `${color}[${timestamp}] ${entry.level}${reset} ${entry.message}`,
        entry.context ? entry.context : '',
        entry.error ? entry.error : ''
      )
    } else {
      // In production, output structured JSON
      console.log(JSON.stringify(entry))
    }
  }

  /**
   * Get console color for log level
   */
  private getConsoleColor(level: LogLevelType): string {
    const colors = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m'  // Red
    }
    return colors[level] || ''
  }
}

/**
 * Global logger instance
 */
let globalLogger: StructuredLogger

/**
 * Get or create the global logger
 */
export function getLogger(context?: LogContext): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger(
      context,
      (process.env.LOG_LEVEL as LogLevelType) || 'INFO'
    )
  }
  
  return context ? globalLogger.child(context) : globalLogger
}

/**
 * Create a logger for a specific service/component
 */
export function createLogger(service: string, component?: string): StructuredLogger {
  return getLogger({ service, component })
}

/**
 * Create a logger for agent operations
 */
export function createAgentLogger(agentId: string, runId?: string): StructuredLogger {
  return getLogger({ 
    service: 'agent-framework',
    component: 'agent-execution',
    agentId, 
    runId 
  })
}

/**
 * Create a logger for database operations
 */
export function createDatabaseLogger(component?: string): StructuredLogger {
  return getLogger({ 
    service: 'database',
    component 
  })
}

/**
 * Create a logger for API operations
 */
export function createApiLogger(requestId?: string): StructuredLogger {
  return getLogger({ 
    service: 'api',
    component: 'request-handler',
    requestId 
  })
}

