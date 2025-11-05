/**
 * Composite schemas for agent configurations
 * @module composite/agent
 */

import { z } from 'zod'
import {
  shortString,
  mediumString,
  uuidSchema,
  positiveInt,
  timeoutMs,
  booleanDefault,
  jsonRecord
} from '../primitives/common'

/**
 * Agent type enumeration
 */
export const agentTypeSchema = z.enum([
  'EXTRACTOR',
  'COMPARATOR',
  'VALIDATOR',
  'CLEANER',
  'DUPLICATOR',
  'SPECIFIC_FIELD'
])

export type AgentType = z.infer<typeof agentTypeSchema>

/**
 * Cron expression validation (simplified - 5 parts)
 */
export const cronExpressionSchema = z
  .string()
  .min(1, 'Expression cron requise')
  .refine(
    (val) => {
      // Simple validation - check if it has 5 parts separated by spaces
      const parts = val.trim().split(/\s+/)
      return parts.length === 5
    },
    { message: 'Expression cron invalide (doit avoir 5 parties séparées par des espaces)' }
  )

export type CronExpression = z.infer<typeof cronExpressionSchema>

/**
 * Base agent configuration (common to all agents)
 */
export const baseAgentConfigSchema = z.object({
  sourceDatabase: uuidSchema.optional(),
  batchSize: positiveInt.max(1000).optional(),
  simulationMode: booleanDefault(false).optional(),
  timeout: timeoutMs.default(30000).optional()
})

export type BaseAgentConfig = z.infer<typeof baseAgentConfigSchema>

/**
 * Agent creation schema
 */
export const createAgentSchema = z.object({
  name: shortString,
  description: mediumString.optional(),
  type: agentTypeSchema,
  frequency: cronExpressionSchema,
  config: jsonRecord.default({})
})

export type CreateAgent = z.infer<typeof createAgentSchema>

/**
 * Agent update schema
 */
export const updateAgentSchema = z.object({
  name: shortString.optional(),
  description: mediumString.optional(),
  isActive: z.boolean().optional(),
  frequency: cronExpressionSchema.optional(),
  config: jsonRecord.optional()
})

export type UpdateAgent = z.infer<typeof updateAgentSchema>

/**
 * Google Search specific configuration
 */
export const googleSearchConfigSchema = z.object({
  batchSize: positiveInt.max(100).default(10),
  googleResultsCount: positiveInt.max(10).default(5),
  googleApiKey: shortString,
  googleSearchEngineId: shortString,
  sourceDatabase: uuidSchema,
  simulationMode: booleanDefault(false).optional(),
  confidenceThreshold: z.number().min(0).max(1).default(0.7).optional(),
  onlyFrenchEvents: booleanDefault(true).optional()
})

export type GoogleSearchConfig = z.infer<typeof googleSearchConfigSchema>
