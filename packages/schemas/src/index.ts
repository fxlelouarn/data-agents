/**
 * @data-agents/schemas - Composable Zod schemas for data agents
 * 
 * This package provides a comprehensive set of reusable Zod schemas
 * organized in three layers:
 * 
 * 1. **Primitives** - Atomic schemas (UUID, dates, strings, numbers)
 * 2. **Composite** - Composed schemas (database, agent, filters)
 * 3. **Domain** - Business logic schemas (proposals, runs, logs)
 * 
 * @example
 * ```typescript
 * import { uuidSchema, createProposalSchema } from '@data-agents/schemas'
 * 
 * // Validate a UUID
 * const id = uuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")
 * 
 * // Validate proposal data
 * const proposal = createProposalSchema.parse({
 *   agentId: "...",
 *   type: "NEW_EVENT",
 *   changes: { name: "New Event" },
 *   justification: [{ type: "url", content: "https://example.com" }]
 * })
 * ```
 * 
 * @module @data-agents/schemas
 */

import { z } from 'zod'

// ============================================================================
// Re-export all schemas
// ============================================================================

export * from './primitives'
export * from './composite'
export * from './domain'

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate data against a Zod schema with formatted error messages
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Parsed and validated data
 * @throws Error with formatted validation errors
 * 
 * @example
 * ```typescript
 * const validated = validateWithSchema(uuidSchema, "550e8400-e29b-41d4-a716-446655440000")
 * ```
 */
export function validateWithSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ')
      throw new Error(`Erreur de validation: ${formattedErrors}`)
    }
    throw error
  }
}

/**
 * Safely validate data and return result with success flag
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Object with success flag and either data or error
 * 
 * @example
 * ```typescript
 * const result = safeValidate(uuidSchema, "invalid-uuid")
 * if (result.success) {
 *   console.log(result.data)
 * } else {
 *   console.error(result.error)
 * }
 * ```
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)
  
  if (result.success) {
    return { success: true, data: result.data }
  } else {
    const formattedErrors = result.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ')
    return { success: false, error: formattedErrors }
  }
}

/**
 * Create a partial version of a schema (all fields optional)
 * 
 * @param schema - Zod object schema
 * @returns Partial version of the schema
 * 
 * @example
 * ```typescript
 * const partialProposal = makePartial(createProposalSchema)
 * // All fields are now optional
 * ```
 */
export function makePartial<T extends z.ZodObject<any>>(schema: T) {
  return schema.partial()
}

/**
 * Create a picked version of a schema (select specific fields)
 * 
 * @param schema - Zod object schema
 * @param keys - Keys to pick from the schema
 * @returns Schema with only selected fields
 * 
 * @example
 * ```typescript
 * const agentIdOnly = makePick(createProposalSchema, ['agentId'])
 * ```
 */
export function makePick<T extends z.ZodObject<any>, K extends keyof T['shape']>(
  schema: T,
  keys: K[]
) {
  const pickObj = {} as any
  keys.forEach(key => { pickObj[key] = true })
  return schema.pick(pickObj)
}

/**
 * Create an omitted version of a schema (exclude specific fields)
 * 
 * @param schema - Zod object schema
 * @param keys - Keys to omit from the schema
 * @returns Schema without the omitted fields
 * 
 * @example
 * ```typescript
 * const withoutId = makeOmit(proposalDataSchema, ['id', 'createdAt'])
 * ```
 */
export function makeOmit<T extends z.ZodObject<any>, K extends keyof T['shape']>(
  schema: T,
  keys: K[]
) {
  const omitObj = {} as any
  keys.forEach(key => { omitObj[key] = true })
  return schema.omit(omitObj)
}
