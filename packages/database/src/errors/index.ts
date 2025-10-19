/**
 * Base class for all custom application errors
 */
export abstract class BaseError extends Error {
  public abstract readonly statusCode: number
  public abstract readonly code: string
  public readonly timestamp: Date
  public readonly context?: Record<string, any>

  constructor(
    message: string,
    context?: Record<string, any>
  ) {
    super(message)
    this.name = this.constructor.name
    this.timestamp = new Date()
    this.context = context
    
    // Maintains proper stack trace for where error was thrown (only available in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Convert error to a structured object for logging/responses
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack
    }
  }

  /**
   * Convert error to a safe object for client responses (no stack trace)
   */
  toSafeJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString()
    }
  }
}

/**
 * Validation errors (400)
 */
export class ValidationError extends BaseError {
  public readonly statusCode = 400
  public readonly code = 'VALIDATION_ERROR'

  constructor(message: string, context?: Record<string, any>) {
    super(message, context)
  }
}

/**
 * Resource not found errors (404)
 */
export class NotFoundError extends BaseError {
  public readonly statusCode = 404
  public readonly code = 'NOT_FOUND'

  constructor(resource: string, identifier?: string, context?: Record<string, any>) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`
    super(message, context)
  }
}

/**
 * Configuration errors (422)
 */
export class ConfigurationError extends BaseError {
  public readonly statusCode = 422
  public readonly code = 'CONFIGURATION_ERROR'

  constructor(message: string, context?: Record<string, any>) {
    super(message, context)
  }
}

/**
 * Database connection errors (503)
 */
export class DatabaseConnectionError extends BaseError {
  public readonly statusCode = 503
  public readonly code = 'DATABASE_CONNECTION_ERROR'

  constructor(message: string, context?: Record<string, any>) {
    super(message, context)
  }
}

/**
 * External service errors (502)
 */
export class ExternalServiceError extends BaseError {
  public readonly statusCode = 502
  public readonly code = 'EXTERNAL_SERVICE_ERROR'

  constructor(service: string, message: string, context?: Record<string, any>) {
    super(`${service}: ${message}`, context)
  }
}

/**
 * Agent-specific errors (422)
 */
export class AgentError extends BaseError {
  public readonly statusCode = 422
  public readonly code = 'AGENT_ERROR'

  constructor(agentId: string, message: string, context?: Record<string, any>) {
    super(`Agent ${agentId}: ${message}`, { ...context, agentId })
  }
}

/**
 * Agent execution errors (500)
 */
export class AgentExecutionError extends BaseError {
  public readonly statusCode = 500
  public readonly code = 'AGENT_EXECUTION_ERROR'

  constructor(agentId: string, message: string, context?: Record<string, any>) {
    super(`Agent execution failed for ${agentId}: ${message}`, { ...context, agentId })
  }
}

/**
 * Agent validation errors (422)
 */
export class AgentValidationError extends BaseError {
  public readonly statusCode = 422
  public readonly code = 'AGENT_VALIDATION_ERROR'

  constructor(agentId: string, errors: string[], context?: Record<string, any>) {
    const message = `Agent validation failed for ${agentId}: ${errors.join(', ')}`
    super(message, { ...context, agentId, validationErrors: errors })
  }
}

/**
 * State management errors (422)
 */
export class StateError extends BaseError {
  public readonly statusCode = 422
  public readonly code = 'STATE_ERROR'

  constructor(agentId: string, key: string, message: string, context?: Record<string, any>) {
    super(`State error for agent ${agentId}, key '${key}': ${message}`, { 
      ...context, 
      agentId, 
      stateKey: key 
    })
  }
}

/**
 * Business logic errors (422)
 */
export class BusinessLogicError extends BaseError {
  public readonly statusCode = 422
  public readonly code = 'BUSINESS_LOGIC_ERROR'

  constructor(message: string, context?: Record<string, any>) {
    super(message, context)
  }
}

/**
 * Rate limiting errors (429)
 */
export class RateLimitError extends BaseError {
  public readonly statusCode = 429
  public readonly code = 'RATE_LIMIT_ERROR'

  constructor(resource: string, resetTime?: Date, context?: Record<string, any>) {
    const message = resetTime 
      ? `Rate limit exceeded for ${resource}. Resets at ${resetTime.toISOString()}`
      : `Rate limit exceeded for ${resource}`
    super(message, { ...context, resource, resetTime })
  }
}

/**
 * Permission errors (403)
 */
export class PermissionError extends BaseError {
  public readonly statusCode = 403
  public readonly code = 'PERMISSION_ERROR'

  constructor(action: string, resource: string, context?: Record<string, any>) {
    super(`Permission denied: cannot ${action} ${resource}`, { 
      ...context, 
      action, 
      resource 
    })
  }
}

/**
 * Type guard to check if an error is a custom BaseError
 */
export function isBaseError(error: any): error is BaseError {
  return error instanceof BaseError
}

/**
 * Utility function to wrap unknown errors as BaseError
 */
export function wrapError(error: unknown, fallbackMessage = 'Unknown error occurred'): BaseError {
  if (isBaseError(error)) {
    return error
  }
  
  if (error instanceof Error) {
    return new BusinessLogicError(error.message, { 
      originalError: error.name,
      stack: error.stack 
    })
  }
  
  return new BusinessLogicError(fallbackMessage, { 
    originalError: String(error) 
  })
}

/**
 * Utility function to handle async operations with proper error wrapping
 */
export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  errorMessage?: string
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw wrapError(error, errorMessage)
  }
}

// Export all error types for convenience
export const Errors = {
  ValidationError,
  NotFoundError,
  ConfigurationError,
  DatabaseConnectionError,
  ExternalServiceError,
  AgentError,
  AgentExecutionError,
  AgentValidationError,
  StateError,
  BusinessLogicError,
  RateLimitError,
  PermissionError,
  BaseError,
  isBaseError,
  wrapError,
  handleAsyncOperation
} as const

export type ErrorType = keyof typeof Errors