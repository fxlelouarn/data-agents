# @data-agents/schemas

**Composable Zod schemas for data agents**

A comprehensive collection of reusable validation schemas organized in three layers: primitives, composite, and domain.

## 📦 Installation

```bash
pnpm add @data-agents/schemas
```

## 🚀 Quick Start

```typescript
import { 
  uuidSchema, 
  createProposalSchema,
  validateWithSchema 
} from '@data-agents/schemas'

// Validate a UUID
const agentId = uuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")

// Validate proposal data
const proposal = createProposalSchema.parse({
  agentId,
  type: "NEW_EVENT",
  changes: { name: "Event Name" },
  justification: [
    { type: "url", content: "https://example.com" }
  ],
  confidence: 0.85
})
```

## 📚 Architecture

```
@data-agents/schemas/
├── primitives/    # Atomic schemas (UUID, dates, strings, numbers)
├── composite/     # Composed schemas (database, agent, filters)
└── domain/        # Business logic schemas (proposals, runs, logs)
```

### Primitives (40+ schemas)

Basic building blocks for validation:

- **UUID:** `uuidSchema`, `optionalUuidSchema`, `nullableUuidSchema`
- **Strings:** `shortString`, `mediumString`, `emailSchema`, `urlSchema`
- **Numbers:** `positiveInt`, `confidenceScore`, `percentage`, `portNumber`
- **Dates:** `isoDateString`, `dateSchema`, `yearString`
- **Enums:** `logLevelSchema`, `sslModeSchema`, `httpMethodSchema`

### Composite (15 schemas)

Schemas composed from primitives:

- **Database:** `databaseConnectionSchema`, `databaseTypeSchema`
- **Agent:** `createAgentSchema`, `baseAgentConfigSchema`, `agentTypeSchema`
- **Filters:** `agentFiltersSchema`, `proposalFiltersSchema`, `paginationSchema`

### Domain (10 schemas)

Business logic schemas:

- **Proposals:** `createProposalSchema`, `proposalDataSchema`
- **Runs:** `createRunSchema`, `runResultSchema`
- **Logs:** `createLogSchema`, `logEntrySchema`

## 🎯 Key Features

### 1. Type-Safe Validation

```typescript
import { createProposalSchema } from '@data-agents/schemas'

// Type is automatically inferred
type CreateProposal = z.infer<typeof createProposalSchema>

// TypeScript knows all fields
const proposal: CreateProposal = {
  agentId: "...",
  type: "NEW_EVENT",
  changes: {},
  justification: []
}
```

### 2. Validation Utilities

```typescript
import { validateWithSchema, safeValidate } from '@data-agents/schemas'

// Throws on error with formatted message
const validated = validateWithSchema(uuidSchema, data)

// Returns result object (no throw)
const result = safeValidate(uuidSchema, data)
if (result.success) {
  console.log(result.data)
} else {
  console.error(result.error)
}
```

### 3. Schema Composition

```typescript
import { z } from 'zod'
import { createProposalSchema } from '@data-agents/schemas'

// Extend existing schema
const customSchema = createProposalSchema.extend({
  priority: z.number().min(1).max(5)
})

// Make all fields optional
const updateSchema = createProposalSchema.partial()

// Pick specific fields
const idOnlySchema = createProposalSchema.pick({
  agentId: true,
  type: true
})
```

### 4. Multi-level Exports

```typescript
// Global import
import { uuidSchema } from '@data-agents/schemas'

// Specific imports
import { uuidSchema } from '@data-agents/schemas/primitives'
import { createAgentSchema } from '@data-agents/schemas/composite'
import { createProposalSchema } from '@data-agents/schemas/domain'
```

## 📖 Examples

### Database Connection

```typescript
import { databaseConnectionSchema } from '@data-agents/schemas'

const connection = databaseConnectionSchema.parse({
  name: "Production DB",
  type: "POSTGRESQL",
  host: "localhost",
  port: 5432,
  database: "mydb",
  username: "user",
  password: "pass",
  sslMode: "require",
  timeout: 30000
})
```

### Agent Configuration

```typescript
import { createAgentSchema } from '@data-agents/schemas'

const agent = createAgentSchema.parse({
  name: "My Agent",
  description: "Does something useful",
  type: "EXTRACTOR",
  frequency: "0 */6 * * *",
  config: {
    batchSize: 10,
    timeout: 30000
  }
})
```

### Filters & Pagination

```typescript
import { runFiltersSchema } from '@data-agents/schemas'

const filters = runFiltersSchema.parse({
  agentId: "...",
  status: "SUCCESS",
  limit: 50,
  offset: 0
})
```

## 🛠️ Utilities

### makePartial

Make all fields optional:

```typescript
import { makePartial } from '@data-agents/schemas'

const updateSchema = makePartial(createAgentSchema)
```

### makePick

Select specific fields:

```typescript
import { makePick } from '@data-agents/schemas'

const idOnlySchema = makePick(proposalDataSchema, ['id', 'agentId'])
```

### makeOmit

Exclude specific fields:

```typescript
import { makeOmit } from '@data-agents/schemas'

const withoutMeta = makeOmit(proposalDataSchema, ['createdAt', 'updatedAt'])
```

## 📊 Benefits

- ✅ **DRY** - Single source of truth for schemas
- ✅ **Type Safety** - Automatic TypeScript inference
- ✅ **Maintainability** - Change once, apply everywhere
- ✅ **Consistency** - Uniform validation messages
- ✅ **Composability** - Easy to extend and reuse
- ✅ **Documentation** - JSDoc on all schemas
- ✅ **Testability** - Isolated and testable

## 📝 Documentation

- [Migration Guide](./MIGRATION-EXAMPLE.md) - How to migrate existing code
- [Complete Documentation](/docs/REFACTORING-PHASE6-COMPLETE.md) - Full details

## 🤝 Contributing

This package is part of the `data-agents` monorepo. To contribute:

1. Make changes in `packages/schemas/src/`
2. Run `pnpm build` to compile
3. Run tests with `pnpm test` (when available)
4. Update documentation

## 📄 License

MIT

## 🔗 Related Packages

- `@data-agents/utils` - Utility functions
- `@data-agents/database` - Database operations
- `@data-agents/agent-framework` - Agent framework

---

**Version:** 0.1.0  
**Author:** Data Agents Team  
**Status:** ✅ Production Ready
