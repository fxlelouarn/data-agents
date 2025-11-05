/**
 * Common primitive schemas for reuse across the application
 * @module primitives/common
 */

import { z } from 'zod'

// ============================================================================
// UUID Schemas
// ============================================================================

/**
 * Standard UUID v4 format validation
 * @example "550e8400-e29b-41d4-a716-446655440000"
 */
export const uuidSchema = z.string().uuid('ID invalide')

/**
 * Optional UUID (can be undefined)
 */
export const optionalUuidSchema = uuidSchema.optional()

/**
 * Nullable UUID (can be null)
 */
export const nullableUuidSchema = uuidSchema.nullable()

// ============================================================================
// String Schemas
// ============================================================================

/**
 * Non-empty string with min/max length constraints
 * @param min - Minimum length (default: 1)
 * @param max - Maximum length (default: 255)
 */
export const constrainedString = (
  min: number = 1,
  max: number = 255,
  message?: string
) =>
  z
    .string()
    .min(min, message || `Minimum ${min} caractères requis`)
    .max(max, message || `Maximum ${max} caractères autorisés`)

/**
 * Short string (1-255 chars) - typical for names, titles
 */
export const shortString = constrainedString(1, 255)

/**
 * Medium string (1-1000 chars) - typical for descriptions
 */
export const mediumString = constrainedString(1, 1000)

/**
 * Long string (1-5000 chars) - typical for content
 */
export const longString = constrainedString(1, 5000)

/**
 * Email address validation
 */
export const emailSchema = z.string().email('Adresse email invalide')

/**
 * URL validation
 */
export const urlSchema = z.string().url('URL invalide')

/**
 * Phone number - basic validation (can be extended with region-specific formats)
 */
export const phoneSchema = z
  .string()
  .min(10, 'Numéro de téléphone invalide')
  .max(20, 'Numéro de téléphone invalide')

// ============================================================================
// Number Schemas
// ============================================================================

/**
 * Positive integer (>= 1)
 */
export const positiveInt = z.number().int().min(1, 'Doit être un entier positif')

/**
 * Non-negative integer (>= 0)
 */
export const nonNegativeInt = z.number().int().min(0, 'Ne peut pas être négatif')

/**
 * Port number (1-65535)
 */
export const portNumber = z
  .number()
  .int()
  .min(1, 'Port invalide')
  .max(65535, 'Port invalide')

/**
 * Percentage (0-100)
 */
export const percentage = z
  .number()
  .min(0, 'Pourcentage doit être >= 0')
  .max(100, 'Pourcentage doit être <= 100')

/**
 * Confidence score (0-1)
 */
export const confidenceScore = z
  .number()
  .min(0, 'Confidence doit être >= 0')
  .max(1, 'Confidence doit être <= 1')

/**
 * Timeout in milliseconds (1000-300000 = 1s to 5min)
 */
export const timeoutMs = z
  .number()
  .int()
  .min(1000, 'Timeout minimum 1 seconde')
  .max(300000, 'Timeout maximum 5 minutes')

/**
 * Price in cents (non-negative integer)
 */
export const priceInCents = nonNegativeInt

// ============================================================================
// Date Schemas
// ============================================================================

/**
 * ISO 8601 date string
 * @example "2024-01-15T10:30:00Z"
 */
export const isoDateString = z
  .string()
  .refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Date ISO invalide' }
  )

/**
 * JavaScript Date object
 */
export const dateSchema = z.date()

/**
 * Year as string (YYYY format)
 * @example "2024"
 */
export const yearString = z
  .string()
  .regex(/^\d{4}$/, 'Année invalide (format YYYY)')

/**
 * Year as number (1900-2100)
 */
export const yearNumber = z
  .number()
  .int()
  .min(1900, 'Année trop ancienne')
  .max(2100, 'Année trop éloignée')

// ============================================================================
// Boolean Schemas
// ============================================================================

/**
 * Boolean with default false
 */
export const booleanDefault = (defaultValue: boolean = false) =>
  z.boolean().default(defaultValue)

// ============================================================================
// Enum-like Schemas
// ============================================================================

/**
 * SSL Mode options for database connections
 */
export const sslModeSchema = z.enum([
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full'
])

/**
 * Common HTTP methods
 */
export const httpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE'
])

/**
 * Common log levels
 */
export const logLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR'])

// ============================================================================
// Utility Schemas
// ============================================================================

/**
 * JSON-like record (any string key, any value)
 */
export const jsonRecord = z.record(z.string(), z.any())

/**
 * Pagination offset (non-negative integer with default 0)
 */
export const paginationOffset = nonNegativeInt.default(0)

/**
 * Pagination limit (1-1000 with default 50)
 */
export const paginationLimit = z
  .number()
  .int()
  .min(1, 'Limit doit être >= 1')
  .max(1000, 'Limit doit être <= 1000')
  .default(50)

// ============================================================================
// Type Exports
// ============================================================================

export type UUID = z.infer<typeof uuidSchema>
export type Email = z.infer<typeof emailSchema>
export type URL = z.infer<typeof urlSchema>
export type Phone = z.infer<typeof phoneSchema>
export type ISODateString = z.infer<typeof isoDateString>
export type YearString = z.infer<typeof yearString>
export type YearNumber = z.infer<typeof yearNumber>
export type SSLMode = z.infer<typeof sslModeSchema>
export type HTTPMethod = z.infer<typeof httpMethodSchema>
export type LogLevel = z.infer<typeof logLevelSchema>
export type JSONRecord = z.infer<typeof jsonRecord>
