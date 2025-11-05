/**
 * Composite schemas for filtering, pagination, and querying
 * @module composite/filters
 */

import { z } from 'zod'
import {
  uuidSchema,
  paginationOffset,
  paginationLimit,
  booleanDefault
} from '../primitives/common'
import { agentTypeSchema } from './agent'

/**
 * Proposal type enumeration
 */
export const proposalTypeSchema = z.enum([
  'NEW_EVENT',
  'EVENT_UPDATE',
  'EDITION_UPDATE',
  'RACE_UPDATE'
])

export type ProposalType = z.infer<typeof proposalTypeSchema>

/**
 * Proposal status enumeration
 */
export const proposalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ARCHIVED'
])

export type ProposalStatus = z.infer<typeof proposalStatusSchema>

/**
 * Run status enumeration
 */
export const runStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED'
])

export type RunStatus = z.infer<typeof runStatusSchema>

/**
 * Agent filters schema
 */
export const agentFiltersSchema = z.object({
  includeInactive: booleanDefault(false).optional(),
  type: agentTypeSchema.optional(),
  isActive: z.boolean().optional()
})

export type AgentFilters = z.infer<typeof agentFiltersSchema>

/**
 * Proposal filters schema
 */
export const proposalFiltersSchema = z.object({
  status: proposalStatusSchema.optional(),
  type: proposalTypeSchema.optional(),
  eventId: uuidSchema.optional(),
  editionId: uuidSchema.optional(),
  agentId: uuidSchema.optional()
})

export type ProposalFilters = z.infer<typeof proposalFiltersSchema>

/**
 * Run filters schema with pagination
 */
export const runFiltersSchema = z.object({
  agentId: uuidSchema.optional(),
  status: runStatusSchema.optional(),
  limit: paginationLimit,
  offset: paginationOffset
})

export type RunFilters = z.infer<typeof runFiltersSchema>

/**
 * Log filters schema with pagination
 */
export const logFiltersSchema = z.object({
  agentId: uuidSchema.optional(),
  runId: uuidSchema.optional(),
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).optional(),
  limit: paginationLimit.default(100),
  offset: paginationOffset
})

export type LogFilters = z.infer<typeof logFiltersSchema>

/**
 * Generic pagination schema
 */
export const paginationSchema = z.object({
  limit: paginationLimit,
  offset: paginationOffset
})

export type Pagination = z.infer<typeof paginationSchema>
