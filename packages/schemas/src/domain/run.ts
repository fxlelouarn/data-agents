/**
 * Domain schemas for agent runs and logs
 * @module domain/run
 */

import { z } from 'zod'
import {
  uuidSchema,
  shortString,
  dateSchema,
  nonNegativeInt,
  jsonRecord,
  logLevelSchema
} from '../primitives/common'
import { runStatusSchema } from '../composite/filters'

/**
 * Create run schema (for starting a new run)
 */
export const createRunSchema = z.object({
  agentId: uuidSchema,
  startedAt: dateSchema.default(() => new Date()),
  status: runStatusSchema.default('RUNNING')
})

export type CreateRun = z.infer<typeof createRunSchema>

/**
 * Update run schema (for completing/failing a run)
 */
export const updateRunSchema = z.object({
  status: runStatusSchema.optional(),
  endedAt: dateSchema.optional(),
  duration: nonNegativeInt.optional(),
  result: jsonRecord.optional(),
  error: z.string().optional()
})

export type UpdateRun = z.infer<typeof updateRunSchema>

/**
 * Run result data
 */
export const runResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: jsonRecord.optional(),
  stats: z.object({
    processed: nonNegativeInt,
    succeeded: nonNegativeInt,
    failed: nonNegativeInt,
    skipped: nonNegativeInt
  }).optional()
})

export type RunResult = z.infer<typeof runResultSchema>

/**
 * Create log entry schema
 */
export const createLogSchema = z.object({
  agentId: uuidSchema,
  runId: uuidSchema.optional(),
  level: logLevelSchema,
  message: shortString,
  data: jsonRecord.optional()
})

export type CreateLog = z.infer<typeof createLogSchema>

/**
 * Log entry with metadata
 */
export const logEntrySchema = createLogSchema.extend({
  id: uuidSchema,
  createdAt: dateSchema
})

export type LogEntry = z.infer<typeof logEntrySchema>
