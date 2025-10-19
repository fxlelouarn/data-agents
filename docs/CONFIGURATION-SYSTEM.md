# ⚙️ Configuration System - Configuration Dynamique des Agents

## Vue d'ensemble

Le système de configuration permet à chaque agent de **définir dynamiquement ses paramètres** via des **schémas JSON descriptifs**. Cela permet à l'interface web de générer automatiquement des formulaires adaptés à chaque type d'agent.

---

## 1. Architecture du Système

### 1.1 Schéma de Configuration

Chaque agent implémente un `ConfigSchema` qui décrit ses paramètres :

```typescript
export interface ConfigSchema {
  title: string                        // Titre du formulaire
  description?: string                 // Description générale
  categories?: ConfigCategory[]        // Catégories (optionnel)
  fields: ConfigField[]                // Liste des champs
}

export interface ConfigField {
  name: string                         // Clé du paramètre
  label: string                        // Label affiché
  type: 'text' | 'number' | 'password' | 'select' | 'textarea' | 'switch' | 'slider'
  category?: string                    // Catégorie (si applicable)
  required?: boolean                   // Champ requis
  defaultValue?: any                   // Valeur par défaut
  description?: string                 // Description détaillée
  helpText?: string                    // Aide supplémentaire
  placeholder?: string                 // Placeholder input
  options?: ConfigFieldOption[]        // Pour select
  validation?: ConfigFieldValidation   // Règles validation
}

export interface ConfigFieldValidation {
  required?: boolean
  min?: number
  max?: number
  step?: number
  pattern?: string
  message?: string
}

export interface ConfigFieldOption {
  value: string
  label: string
}

export interface ConfigCategory {
  id: string
  label: string
  description?: string
}
```

---

## 2. Exemple : GoogleSearchDateAgent

### 2.1 Fichier Schema

**Fichier** : `apps/agents/src/GoogleSearchDateAgent.configSchema.ts`

```typescript
import { ConfigSchema } from '@data-agents/agent-framework'

export const GoogleSearchDateAgentConfigSchema: ConfigSchema = {
  title: 'Google Search Date Agent Configuration',
  description: 'Configure automatic date extraction via Google Search',
  categories: [
    { id: 'general', label: 'General Settings' },
    { id: 'google', label: 'Google Search' },
    { id: 'advanced', label: 'Advanced' }
  ],
  fields: [
    // Catégorie General
    {
      name: 'batchSize',
      label: 'Batch Size',
      type: 'number',
      category: 'general',
      required: true,
      defaultValue: 10,
      description: 'Number of events to process per batch',
      helpText: 'Larger batches process faster but use more memory',
      validation: {
        required: true,
        min: 1,
        max: 100,
        message: 'Batch size must be between 1 and 100'
      }
    },
    {
      name: 'cooldownDays',
      label: 'Cooldown Period (days)',
      type: 'number',
      category: 'general',
      defaultValue: 14,
      description: 'Days to wait before re-processing an event',
      validation: {
        min: 1,
        max: 365
      }
    },
    {
      name: 'sourceDatabase',
      label: 'Source Database',
      type: 'select',
      category: 'general',
      required: true,
      description: 'Database to read events from',
      helpText: 'Must be a configured Miles Republic database',
      options: [] // Peuplé dynamiquement depuis les connexions disponibles
    },

    // Catégorie Google
    {
      name: 'googleApiKey',
      label: 'Google API Key',
      type: 'password',
      category: 'google',
      required: true,
      description: 'Your Google Custom Search API key',
      helpText: 'Get from Google Cloud Console',
      validation: {
        required: true,
        pattern: '^[A-Za-z0-9_-]{40,}$',
        message: 'Invalid API key format'
      }
    },
    {
      name: 'googleSearchEngineId',
      label: 'Search Engine ID',
      type: 'text',
      category: 'google',
      required: true,
      description: 'Your Google Custom Search engine ID',
      validation: {
        required: true
      }
    },
    {
      name: 'googleResultsCount',
      label: 'Results per Query',
      type: 'number',
      category: 'google',
      defaultValue: 5,
      description: 'Number of Google search results to analyze',
      validation: {
        min: 1,
        max: 10
      }
    },

    // Catégorie Advanced
    {
      name: 'dateConfidenceThreshold',
      label: 'Confidence Threshold',
      type: 'slider',
      category: 'advanced',
      defaultValue: 0.6,
      description: 'Minimum confidence to accept extracted dates',
      validation: {
        min: 0,
        max: 1,
        step: 0.1
      }
    },
    {
      name: 'onlyFrenchEvents',
      label: 'French Events Only',
      type: 'switch',
      category: 'advanced',
      defaultValue: true,
      description: 'Filter to French events only'
    }
  ]
}
```

### 2.2 Import dans l'Agent

```typescript
import { GoogleSearchDateAgentConfigSchema } from './GoogleSearchDateAgent.configSchema'

export class GoogleSearchDateAgent extends BaseAgent {
  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      // ...
      config: {
        // ...
        configSchema: GoogleSearchDateAgentConfigSchema // Ajouter le schéma
      }
    }
    super(agentConfig, db, logger)
  }
}
```

---

## 3. Validation de Configuration

### 3.1 Validation dans BaseAgent

```typescript
async validate(): Promise<boolean> {
  // Validation base
  if (!this.config.name || !this.config.type || !this.config.frequency) {
    return false
  }

  // Validation cron
  const cronRegex = /^(\*|[0-5]?\d) (\*|[01]?\d|2[0-3]) (\*|[012]?\d|3[01]) (\*|[0-9]|1[012]|JAN|...) (\*|[0-7]|SUN|...)/
  if (!cronRegex.test(this.config.frequency)) {
    return false
  }

  return true
}
```

### 3.2 Validation Spécifique dans GoogleSearchDateAgent

```typescript
async validate(): Promise<boolean> {
  const baseValid = await super.validate()
  if (!baseValid) return false

  const config = this.config.config as GoogleSearchDateConfig

  // Vérifier batchSize
  if (!config.batchSize || config.batchSize <= 0) {
    this.logger.error('batchSize must be > 0')
    return false
  }

  // Vérifier Google API keys
  if (!config.googleApiKey || !config.googleSearchEngineId) {
    this.logger.error('Google API credentials missing')
    return false
  }

  // Vérifier database source
  try {
    const available = await this.dbManager.getAvailableDatabases()
    if (!available.find(db => db.id === config.sourceDatabase)) {
      this.logger.error(`Source DB not found: ${config.sourceDatabase}`)
      return false
    }

    const testResult = await this.dbManager.testConnection(config.sourceDatabase)
    if (!testResult) {
      this.logger.error(`Connection test failed for: ${config.sourceDatabase}`)
      return false
    }
  } catch (error) {
    this.logger.error('Cannot validate source database', { error })
    return false
  }

  this.logger.info('Validation successful')
  return true
}
```

---

## 4. Utilisation dans l'API

### 4.1 Endpoint : Récupérer Schéma

```typescript
// GET /api/agents/types/:type/schema
router.get('/types/:type/schema', (req, res) => {
  try {
    const agent = agentRegistry.create(req.params.type, {})
    if (!agent) {
      return res.status(404).json({ error: 'Agent type not found' })
    }

    // Si l'agent a un schéma config
    if (agent.config?.config?.configSchema) {
      return res.json(agent.config.config.configSchema)
    }

    res.json(null) // Pas de schéma
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

### 4.2 Endpoint : Créer Agent avec Validation

```typescript
// POST /api/agents
router.post('/', async (req, res) => {
  try {
    const { name, type, frequency, config } = req.body

    // 1. Vérifier que le type existe
    const agent = agentRegistry.create(type, {
      id: 'temp',
      name,
      type,
      frequency,
      config
    })
    if (!agent) {
      return res.status(400).json({ error: `Unknown agent type: ${type}` })
    }

    // 2. Valider la configuration
    const isValid = await agent.validate()
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid agent configuration' })
    }

    // 3. Sauvegarder en BD
    const created = await agentService.createAgent({
      name,
      type,
      frequency,
      config,
      isActive: false // Inactif par défaut
    })

    res.status(201).json(created)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

---

## 5. Utilisation dans le Dashboard

### 5.1 Générer Formulaire Dynamique

```typescript
// dashboard/components/AgentForm.tsx

function AgentForm({ agentType, initialConfig }: Props) {
  const [schema, setSchema] = useState<ConfigSchema | null>(null)

  useEffect(() => {
    // Récupérer le schéma
    fetch(`/api/agents/types/${agentType}/schema`)
      .then(r => r.json())
      .then(setSchema)
  }, [agentType])

  if (!schema) return <Skeleton />

  return (
    <form>
      {schema.fields.map(field => (
        <FormField key={field.name} field={field} />
      ))}
    </form>
  )
}
```

### 5.2 Rendu Conditionnel par Type

```typescript
function FormField({ field, value, onChange }: Props) {
  switch (field.type) {
    case 'text':
      return <TextField label={field.label} value={value} onChange={onChange} />
    
    case 'number':
      return (
        <TextField
          type="number"
          label={field.label}
          value={value}
          onChange={onChange}
          inputProps={{
            min: field.validation?.min,
            max: field.validation?.max,
            step: field.validation?.step
          }}
        />
      )
    
    case 'password':
      return (
        <TextField
          type="password"
          label={field.label}
          value={value}
          onChange={onChange}
        />
      )
    
    case 'select':
      return (
        <Select label={field.label} value={value} onChange={onChange}>
          {field.options?.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      )
    
    case 'switch':
      return (
        <FormControlLabel
          control={<Switch checked={value} onChange={onChange} />}
          label={field.label}
        />
      )
    
    case 'slider':
      return (
        <Slider
          label={field.label}
          value={value}
          onChange={onChange}
          min={field.validation?.min}
          max={field.validation?.max}
          step={field.validation?.step}
        />
      )
    
    default:
      return <TextField label={field.label} value={value} onChange={onChange} />
  }
}
```

---

## 6. Types de Champs Supportés

| Type | Utilité | Exemple |
|------|---------|---------|
| `text` | Texte simple | Nom, URL, clé API |
| `password` | Données sensibles | Mot de passe, API key |
| `number` | Nombres entiers/décimaux | Batch size, timeout, ratio |
| `textarea` | Texte multi-lignes | JSON config, scripts |
| `select` | Sélection parmi options | Base de données, type |
| `switch` | Booléen on/off | Flags activation |
| `slider` | Nombre dans plage | Confiance (0-1), ratio |

---

## 7. Catégories de Champs

Organiser les champs par catégories pour meilleure UX :

```typescript
categories: [
  { id: 'general', label: 'Général' },
  { id: 'google', label: 'Google Search' },
  { id: 'filters', label: 'Filtres' },
  { id: 'advanced', label: 'Avancé' }
]
```

L'UI peut afficher :
- Onglets par catégorie
- Sections collapsibles
- Accordions

---

## 8. Validation Côté Client

### 8.1 Valider avant Soumission

```typescript
function validateForm(data: Record<string, any>, schema: ConfigSchema): string[] {
  const errors: string[] = []

  for (const field of schema.fields) {
    const value = data[field.name]
    
    // Vérifier requis
    if (field.required && !value) {
      errors.push(`${field.label} is required`)
    }

    // Vérifier validation
    if (field.validation && value) {
      const val = field.validation

      if (val.min !== undefined && value < val.min) {
        errors.push(`${field.label} must be >= ${val.min}`)
      }

      if (val.max !== undefined && value > val.max) {
        errors.push(`${field.label} must be <= ${val.max}`)
      }

      if (val.pattern && !new RegExp(val.pattern).test(String(value))) {
        errors.push(val.message || `${field.label} format invalid`)
      }
    }
  }

  return errors
}
```

---

## 9. Bonnes Pratiques

### 9.1 Schémas Complets

```typescript
// ✅ BON - Schéma bien décrit
{
  name: 'batchSize',
  label: 'Batch Size',
  type: 'number',
  required: true,
  defaultValue: 10,
  description: 'How many events to process per batch',
  helpText: 'Larger batches are faster but use more memory',
  validation: {
    required: true,
    min: 1,
    max: 100,
    message: 'Batch size must be between 1 and 100'
  }
}
```

### 9.2 Valeurs par Défaut

Toujours fournir des défauts sensibles :

```typescript
{
  name: 'timeout',
  label: 'Timeout (ms)',
  defaultValue: 30000,  // ✅ Bon défaut
  // ...
}
```

### 9.3 Sécurité des Mots de Passe

```typescript
// ✅ Utiliser type password
{
  name: 'apiKey',
  type: 'password',  // Masquer en input
  // ...
}
```

---

## 10. Exemple Complet : FFA Scraper

```typescript
export const FFAScraperConfigSchema: ConfigSchema = {
  title: 'FFA Scraper Configuration',
  description: 'Automatic extraction from FFA calendar',
  categories: [
    { id: 'general', label: 'General' },
    { id: 'performance', label: 'Performance' }
  ],
  fields: [
    {
      name: 'startDate',
      label: 'Start Date',
      type: 'text',
      category: 'general',
      defaultValue: new Date().toISOString().split('T')[0],
      description: 'Date to start scraping from',
      validation: {
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        message: 'Format: YYYY-MM-DD'
      }
    },
    {
      name: 'maxPages',
      label: 'Max Pages',
      type: 'number',
      category: 'performance',
      defaultValue: 10,
      description: 'Maximum pages to scrape',
      validation: { min: 1, max: 100 }
    },
    {
      name: 'timeout',
      label: 'Timeout (ms)',
      type: 'number',
      category: 'performance',
      defaultValue: 30000,
      validation: { min: 5000, max: 120000 }
    },
    {
      name: 'retryOnError',
      label: 'Retry on Error',
      type: 'switch',
      category: 'performance',
      defaultValue: true
    }
  ]
}
```

---

## Voir aussi

- [AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md) - Détails agents
- [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) - Enregistrement
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Vue d'ensemble
