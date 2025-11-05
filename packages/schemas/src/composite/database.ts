/**
 * Composite schemas for database connections and configurations
 * @module composite/database
 */

import { z } from 'zod'
import {
  shortString,
  mediumString,
  uuidSchema,
  portNumber,
  urlSchema,
  sslModeSchema,
  timeoutMs,
  positiveInt
} from '../primitives/common'

/**
 * Database type enumeration
 */
export const databaseTypeSchema = z.enum([
  'POSTGRESQL',
  'MYSQL',
  'SQLITE',
  'MONGODB',
  'EXTERNAL_API',
  'MILES_REPUBLIC'
])

export type DatabaseType = z.infer<typeof databaseTypeSchema>

/**
 * Database connection credentials
 */
export const databaseCredentialsSchema = z.object({
  host: shortString.optional(),
  port: portNumber.optional(),
  database: shortString.optional(),
  username: shortString.optional(),
  password: shortString.optional()
})

export type DatabaseCredentials = z.infer<typeof databaseCredentialsSchema>

/**
 * Complete database connection schema with validation
 * Either individual fields OR connectionUrl must be provided
 */
export const databaseConnectionSchema = z
  .object({
    name: shortString,
    description: mediumString.optional(),
    type: databaseTypeSchema,
    host: shortString.optional(),
    port: portNumber.optional(),
    database: shortString.optional(),
    username: shortString.optional(),
    password: shortString.optional(),
    connectionUrl: urlSchema.optional(),
    sslMode: sslModeSchema.default('prefer').optional(),
    timeout: timeoutMs.default(30000).optional(),
    maxConnections: positiveInt.max(100).default(10).optional(),
    tags: z.array(z.string()).default([]).optional()
  })
  .refine(
    (data) => {
      const hasIndividualFields = data.host && data.database
      const hasConnectionUrl = data.connectionUrl
      return hasIndividualFields || hasConnectionUrl
    },
    {
      message: 'Soit les champs host/database, soit connectionUrl doit être fourni',
      path: ['connectionUrl']
    }
  )

export type DatabaseConnection = z.infer<typeof databaseConnectionSchema>

/**
 * Partial update schema for database connections
 * Since databaseConnectionSchema uses refine(), we need to build the partial manually
 */
export const updateDatabaseConnectionSchema = z
  .object({
    name: shortString.optional(),
    description: mediumString.optional(),
    type: databaseTypeSchema.optional(),
    host: shortString.optional(),
    port: portNumber.optional(),
    database: shortString.optional(),
    username: shortString.optional(),
    password: shortString.optional(),
    connectionUrl: urlSchema.optional(),
    sslMode: sslModeSchema.optional(),
    timeout: timeoutMs.optional(),
    maxConnections: positiveInt.max(100).optional(),
    tags: z.array(z.string()).optional()
  })

export type UpdateDatabaseConnection = z.infer<typeof updateDatabaseConnectionSchema>

/**
 * Database connection reference (just the ID)
 */
export const databaseReferenceSchema = z.object({
  id: uuidSchema
})

export type DatabaseReference = z.infer<typeof databaseReferenceSchema>
