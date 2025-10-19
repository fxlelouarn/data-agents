import { Request, Response, NextFunction } from 'express'

export interface ApiError extends Error {
  status?: number
  code?: string
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('API Error:', error)

  const status = error.status || 500
  const message = error.message || 'Internal Server Error'
  const code = error.code || 'INTERNAL_ERROR'

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    }
  })
}

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export const createError = (status: number, message: string, code?: string): ApiError => {
  const error = new Error(message) as ApiError
  error.status = status
  error.code = code
  return error
}