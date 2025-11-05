# Migration vers @data-agents/schemas

Ce document montre comment migrer depuis des schémas Zod inline vers le package `@data-agents/schemas`.

## Installation

```bash
pnpm add @data-agents/schemas
```

## Exemple de Migration

### ❌ Avant (Schémas inline redondants)

```typescript
// Dans database/src/validation/schemas.ts
import { z } from 'zod'

// Répété dans plusieurs fichiers...
const uuidSchema = z.string().uuid('ID invalide')
const shortString = z.string().min(1).max(255)
const mediumString = z.string().min(1).max(1000)

// Agent schema (répété partout)
export const CreateAgentSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['EXTRACTOR', 'COMPARATOR', 'VALIDATOR']),
  frequency: z.string().min(1, 'Expression cron requise'),
  config: z.record(z.string(), z.any()).default({})
})

// Database schema
export const CreateConnectionSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['POSTGRESQL', 'MYSQL', 'SQLITE']),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  // ... beaucoup de duplication
})
```

### ✅ Après (Schémas réutilisables)

```typescript
// Dans database/src/validation/schemas.ts
import {
  // Primitives
  uuidSchema,
  shortString,
  mediumString,
  
  // Composite
  createAgentSchema,
  agentTypeSchema,
  databaseConnectionSchema,
  databaseTypeSchema,
  
  // Domain
  createProposalSchema,
  proposalTypeSchema,
  
  // Utilities
  validateWithSchema,
  safeValidate
} from '@data-agents/schemas'

// Plus besoin de redéfinir ! Juste réexporter si besoin
export {
  createAgentSchema as CreateAgentSchema,
  databaseConnectionSchema as CreateConnectionSchema,
  createProposalSchema as CreateProposalSchema
}

// Types inférés automatiquement
export type CreateAgent = z.infer<typeof createAgentSchema>
export type DatabaseConnection = z.infer<typeof databaseConnectionSchema>
```

## Exemples d'Usage

### 1. Validation Simple

```typescript
import { uuidSchema, validateWithSchema } from '@data-agents/schemas'

// Valide et throw si invalide
const agentId = validateWithSchema(uuidSchema, someId)

// Safe validation (ne throw pas)
const result = safeValidate(uuidSchema, someId)
if (result.success) {
  console.log('Valid UUID:', result.data)
} else {
  console.error('Invalid:', result.error)
}
```

### 2. Composition de Schémas

```typescript
import { z } from 'zod'
import { 
  createProposalSchema, 
  uuidSchema,
  confidenceScore 
} from '@data-agents/schemas'

// Étendre un schéma existant
const myCustomProposalSchema = createProposalSchema.extend({
  customField: z.string(),
  priority: z.number().min(1).max(5)
})

// Créer un schéma partiel
const updateProposalSchema = createProposalSchema.partial()

// Picker des champs spécifiques
const proposalIdOnlySchema = z.object({
  id: uuidSchema,
  agentId: uuidSchema
})
```

### 3. Utilisation dans les Agents

```typescript
import {
  baseAgentConfigSchema,
  createProposalSchema,
  runResultSchema,
  validateWithSchema
} from '@data-agents/schemas'

class MyAgent extends BaseAgent {
  async run(context: AgentContext) {
    // Valider la config
    const config = validateWithSchema(baseAgentConfigSchema, this.config)
    
    // Créer une proposition
    const proposal = createProposalSchema.parse({
      agentId: this.id,
      type: 'NEW_EVENT',
      changes: { name: 'Event Name' },
      justification: [
        { type: 'url', content: 'https://example.com' }
      ],
      confidence: 0.85
    })
    
    // Retourner un résultat validé
    return runResultSchema.parse({
      success: true,
      message: 'Done',
      stats: {
        processed: 10,
        succeeded: 8,
        failed: 2,
        skipped: 0
      }
    })
  }
}
```

### 4. Filtres et Pagination

```typescript
import {
  agentFiltersSchema,
  proposalFiltersSchema,
  paginationSchema
} from '@data-agents/schemas'

// Dans une fonction de query
async function listAgents(filters: unknown) {
  // Valider les filtres
  const validated = agentFiltersSchema.parse(filters)
  
  // Utiliser les filtres validés
  return await prisma.agent.findMany({
    where: {
      isActive: validated.isActive,
      type: validated.type
    }
  })
}

// Pagination
const pagination = paginationSchema.parse({
  limit: 50,
  offset: 0
})
```

## Migration Checklist

- [ ] Installer `@data-agents/schemas`
- [ ] Remplacer les imports de `zod` par imports de `@data-agents/schemas`
- [ ] Supprimer les définitions de schémas redondantes
- [ ] Utiliser `validateWithSchema` au lieu de `.parse()` pour messages d'erreur formatés
- [ ] Mettre à jour les types TypeScript pour utiliser `z.infer`
- [ ] Tester que la validation fonctionne comme attendu

## Bénéfices

✅ **DRY** - Plus de duplication de schémas  
✅ **Type Safety** - Inférence TypeScript automatique  
✅ **Maintenance** - Changer une fois, appliquer partout  
✅ **Cohérence** - Messages d'erreur et validations uniformes  
✅ **Composabilité** - Facilite l'extension et la réutilisation  
✅ **Documentation** - Types auto-documentés avec JSDoc  

## Structure du Package

```
@data-agents/schemas/
├── primitives/       # Schémas atomiques
│   ├── common.ts     # UUID, dates, strings, numbers
│   └── index.ts
├── composite/        # Schémas composés
│   ├── database.ts   # Database connections
│   ├── agent.ts      # Agent configurations
│   ├── filters.ts    # Filtres et pagination
│   └── index.ts
├── domain/           # Schémas métier
│   ├── proposal.ts   # Proposals
│   ├── run.ts        # Runs et logs
│   └── index.ts
└── index.ts          # Export central + utilities
```

## API Reference

### Primitives

- `uuidSchema` - UUID v4 validation
- `shortString` - String 1-255 chars
- `mediumString` - String 1-1000 chars
- `emailSchema` - Email validation
- `urlSchema` - URL validation
- `confidenceScore` - Number 0-1
- `isoDateString` - ISO date validation
- `yearString` - YYYY format

### Composite

- `databaseConnectionSchema` - Database config
- `createAgentSchema` - Agent creation
- `baseAgentConfigSchema` - Base agent config
- `agentFiltersSchema` - Agent filtering
- `paginationSchema` - Pagination

### Domain

- `createProposalSchema` - Proposal creation
- `updateProposalSchema` - Proposal updates
- `createRunSchema` - Run creation
- `createLogSchema` - Log creation
- `runResultSchema` - Run results

### Utilities

- `validateWithSchema(schema, data)` - Validate with formatted errors
- `safeValidate(schema, data)` - Safe validation (no throw)
- `makePartial(schema)` - Make all fields optional
- `makePick(schema, keys)` - Pick specific fields
- `makeOmit(schema, keys)` - Omit specific fields

## Support

Pour questions ou problèmes, voir la documentation complète dans `/docs/REFACTORING-PHASE6-COMPLETE.md`.
