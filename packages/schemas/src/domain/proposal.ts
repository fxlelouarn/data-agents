/**
 * Domain schemas for proposals
 * @module domain/proposal
 */

import { z } from 'zod'
import {
  uuidSchema,
  shortString,
  confidenceScore,
  jsonRecord,
  dateSchema
} from '../primitives/common'
import {
  proposalTypeSchema,
  proposalStatusSchema
} from '../composite/filters'

/**
 * Justification types for proposals
 */
export const justificationTypeSchema = z.enum([
  'url',
  'image',
  'html',
  'text'
])

export type JustificationType = z.infer<typeof justificationTypeSchema>

/**
 * Individual justification item
 */
export const justificationItemSchema = z.object({
  type: justificationTypeSchema,
  content: shortString,
  metadata: jsonRecord.optional()
})

export type JustificationItem = z.infer<typeof justificationItemSchema>

/**
 * Create proposal schema
 */
export const createProposalSchema = z.object({
  agentId: uuidSchema,
  type: proposalTypeSchema,
  eventId: uuidSchema.optional(),
  editionId: uuidSchema.optional(),
  raceId: uuidSchema.optional(),
  changes: jsonRecord,
  justification: z.array(justificationItemSchema),
  confidence: confidenceScore.default(0.8).optional()
})

export type CreateProposal = z.infer<typeof createProposalSchema>

/**
 * Update proposal schema
 */
export const updateProposalSchema = z.object({
  status: proposalStatusSchema.optional(),
  reviewedAt: dateSchema.optional(),
  reviewedBy: uuidSchema.optional()
})

export type UpdateProposal = z.infer<typeof updateProposalSchema>

/**
 * Proposal data with metadata
 */
export const proposalDataSchema = createProposalSchema.extend({
  id: uuidSchema,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  status: proposalStatusSchema
})

export type ProposalData = z.infer<typeof proposalDataSchema>
