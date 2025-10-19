import { z } from 'zod'
import { AgentType, ProposalType, ProposalStatus, DatabaseType, RunStatus, LogLevel } from '@prisma/client'

// Base schemas
export const AgentTypeSchema = z.enum(['EXTRACTOR', 'COMPARATOR', 'VALIDATOR', 'CLEANER', 'DUPLICATOR', 'SPECIFIC_FIELD'])
export const ProposalTypeSchema = z.enum(['NEW_EVENT', 'EVENT_UPDATE', 'EDITION_UPDATE', 'RACE_UPDATE'])
export const ProposalStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED'])
export const DatabaseTypeSchema = z.enum(['POSTGRESQL', 'MYSQL', 'SQLITE', 'MONGODB', 'EXTERNAL_API', 'MILES_REPUBLIC'])
export const RunStatusSchema = z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'])
export const LogLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR'])

// Cron expression validation (simplified)
const CronExpressionSchema = z
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

// Agent Configuration Schemas
export const GoogleSearchConfigSchema = z.object({
  batchSize: z.number().min(1).max(100).default(10),
  googleResultsCount: z.number().min(1).max(10).default(5),
  googleApiKey: z.string().min(1, 'Clé API Google requise'),
  googleSearchEngineId: z.string().min(1, 'ID moteur de recherche Google requis'),
  sourceDatabase: z.string().uuid('ID de base de données invalide'),
  simulationMode: z.boolean().default(false).optional(),
  confidenceThreshold: z.number().min(0).max(1).default(0.7).optional(),
  onlyFrenchEvents: z.boolean().default(true).optional(),
})

export type GoogleSearchConfig = z.infer<typeof GoogleSearchConfigSchema>

// Generic agent config schema
export const BaseAgentConfigSchema = z.object({
  sourceDatabase: z.string().uuid().optional(),
  batchSize: z.number().min(1).max(1000).optional(),
  simulationMode: z.boolean().default(false).optional(),
  timeout: z.number().min(1000).max(300000).default(30000).optional(),
})

// Agent creation/update schemas
export const CreateAgentSchema = z.object({
  name: z.string().min(1, 'Le nom de l\'agent est requis').max(255),
  description: z.string().max(1000).optional(),
  type: AgentTypeSchema,
  frequency: CronExpressionSchema,
  config: z.record(z.string(), z.any()).default({}),
})

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  frequency: CronExpressionSchema.optional(),
  config: z.record(z.string(), z.any()).optional(),
})

// Database Connection schemas
export const CreateConnectionSchema = z.object({
  name: z.string().min(1, 'Le nom de la connexion est requis').max(255),
  description: z.string().max(1000).optional(),
  type: DatabaseTypeSchema,
  host: z.string().min(1).optional(),
  port: z.number().min(1).max(65535).optional(),
  database: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  connectionUrl: z.string().url().optional(),
  sslMode: z.enum(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']).default('prefer').optional(),
  timeout: z.number().min(1000).max(300000).default(30000).optional(),
  maxConnections: z.number().min(1).max(100).default(10).optional(),
  tags: z.array(z.string()).default([]).optional(),
})
.refine((data) => {
  // Either individual fields or connectionUrl must be provided
  const hasIndividualFields = data.host && data.database
  const hasConnectionUrl = data.connectionUrl
  return hasIndividualFields || hasConnectionUrl
}, {
  message: 'Soit les champs host/database, soit connectionUrl doit être fourni',
  path: ['connectionUrl']
})

export const UpdateConnectionSchema = CreateConnectionSchema.partial()

// Proposal schemas
export const CreateProposalSchema = z.object({
  agentId: z.string().uuid('ID agent invalide'),
  type: ProposalTypeSchema,
  eventId: z.string().uuid().optional(),
  editionId: z.string().uuid().optional(),
  raceId: z.string().uuid().optional(),
  changes: z.record(z.string(), z.any()),
  justification: z.array(z.object({
    type: z.enum(['url', 'image', 'html', 'text']),
    content: z.string().min(1),
    metadata: z.record(z.string(), z.any()).optional(),
  })),
  confidence: z.number().min(0).max(1).default(0.8).optional(),
})

export const UpdateProposalSchema = z.object({
  status: ProposalStatusSchema.optional(),
  reviewedAt: z.date().optional(),
  reviewedBy: z.string().uuid().optional(),
})

// Run schemas
export const UpdateRunSchema = z.object({
  status: RunStatusSchema.optional(),
  endedAt: z.date().optional(),
  duration: z.number().min(0).optional(),
  result: z.record(z.string(), z.any()).optional(),
  error: z.string().optional(),
})

// Log schemas
export const CreateLogSchema = z.object({
  agentId: z.string().uuid('ID agent invalide'),
  runId: z.string().uuid().optional(),
  level: LogLevelSchema,
  message: z.string().min(1, 'Message requis'),
  data: z.record(z.string(), z.any()).optional(),
})

// Filter schemas
export const AgentFiltersSchema = z.object({
  includeInactive: z.boolean().default(false).optional(),
  type: AgentTypeSchema.optional(),
  isActive: z.boolean().optional(),
})

export const ProposalFiltersSchema = z.object({
  status: ProposalStatusSchema.optional(),
  type: ProposalTypeSchema.optional(),
  eventId: z.string().uuid().optional(),
  editionId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
})

export const RunFiltersSchema = z.object({
  agentId: z.string().uuid().optional(),
  status: RunStatusSchema.optional(),
  limit: z.number().min(1).max(1000).default(50).optional(),
  offset: z.number().min(0).default(0).optional(),
})

export const LogFiltersSchema = z.object({
  agentId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  level: LogLevelSchema.optional(),
  limit: z.number().min(1).max(1000).default(100).optional(),
  offset: z.number().min(0).default(0).optional(),
})

// Validation helper function
export function validateWithSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues.map((err: any) => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ')
      throw new Error(`Erreur de validation: ${formattedErrors}`)
    }
    throw error
  }
}

// Export types
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>
export type CreateConnectionInput = z.infer<typeof CreateConnectionSchema>
export type UpdateConnectionInput = z.infer<typeof UpdateConnectionSchema>
export type CreateProposalInput = z.infer<typeof CreateProposalSchema>
export type UpdateProposalInput = z.infer<typeof UpdateProposalSchema>
export type CreateLogInput = z.infer<typeof CreateLogSchema>
export type UpdateRunInput = z.infer<typeof UpdateRunSchema>
export type AgentFiltersInput = z.infer<typeof AgentFiltersSchema>
export type ProposalFiltersInput = z.infer<typeof ProposalFiltersSchema>
export type RunFiltersInput = z.infer<typeof RunFiltersSchema>
export type LogFiltersInput = z.infer<typeof LogFiltersSchema>