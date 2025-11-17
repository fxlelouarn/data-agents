# Pourquoi DynamicConfigForm et DynamicConfigDisplay ne sont jamais utilisés en prod

## Résumé

Ces deux composants React ne fonctionnent **qu'avec un `configSchema` valide**, qui doit être **stocké dans la config de l'agent en base de données**. Les agents en production probablement **n'ont pas ce schéma**, car ils ont été créés via d'autres moyens (script, initialisation manuelle, etc.).

## Architecture attendue

### Flow théorique ✅

```
FFAScraperAgent (agent-framework)
    ↓
    config = {
      sourceDatabase: "...",
      liguesPerRun: 2,
      ...
      configSchema: FFAScraperAgentConfigSchema  ← CLÉ MANQUANTE EN PROD
    }
    ↓
Agent créé en base de données
    ↓
AgentEdit.tsx lit agent.config.configSchema
    ↓
DynamicConfigForm affiche le formulaire
```

### Problème : agents sans schema

```
Agents en production:
- ❌ FFA Scraper Agent
- ❌ Google Search Date Agent

Config réelle en base:
{
  sourceDatabase: "miles-republic-prod",
  liguesPerRun: 2,
  monthsPerRun: 1,
  // ❌ configSchema manquant
}

Résultat:
- DynamicConfigDisplay: Rien à afficher
- DynamicConfigForm: Invisible (condition ligne 509 de AgentEdit.tsx)
- Utilisateur ne voit que l'éditeur JSON brut
```

## Où les composants sont utilisés

### `DynamicConfigForm`

**Utilisé dans :**
- `AgentCreate.tsx` (ligne 390) : Création d'agents
  - Le formulaire utilise le schéma **hardcodé** de `agentConfigSchemas[selectedAgentType]`
  - Fonctionne car le schéma vient du frontend, pas de la base
  
- `AgentEdit.tsx` (ligne 523) : Édition d'agents
  - Essaye d'utiliser `agent.config.configSchema` (ligne 131)
  - **❌ NE FONCTIONNE JAMAIS** en prod car les agents n'ont pas le schéma

### `DynamicConfigDisplay`

**Était orphelin :**
- Importé nul part (grep retournait seulement sa propre déclaration)
- **FIXÉ 2025-11-17** : Intégré dans `AgentDetail.tsx` pour affichage lecture-seule

**Maintenant utilisé dans :**
- `AgentDetail.tsx` (ligne 410+) : Affichage lecture-seule de la config
  - **❌ NE FONCTIONNE JAMAIS** en prod car les agents n'ont pas le schéma

## Pourquoi le schéma n'est pas en base

### Raison 1 : Agents créés avant l'implémentation

Les vrais agents FFA Scraper et Google Search Date ont probablement été créés avant la mise en place du système de schémas dynamiques.

```typescript
// Agent créé comme ça (avant schémas):
await createAgent({
  name: "FFA Scraper Agent",
  config: {
    sourceDatabase: "...",
    liguesPerRun: 2
    // configSchema omis
  }
})

// Devrait être créé comme ça (avec schémas):
await createAgent({
  name: "FFA Scraper Agent",
  config: {
    sourceDatabase: "...",
    liguesPerRun: 2,
    configSchema: FFAScraperAgentConfigSchema  // ← MANQUANT
  }
})
```

### Raison 2 : AgentCreate utilise le schéma du frontend

`AgentCreate.tsx` n'a **pas besoin** que le schéma soit en base, car il utilise les schémas hardcodés :

```typescript
// AgentCreate.tsx ligne 34-114
const agentConfigSchemas: Record<string, any> = {
  FFA_SCRAPER: { ... },  // ← Définition locale
  GOOGLE_SEARCH_DATE: { ... }
}
```

Donc les nouveaux agents créés depuis le dashboard **auront** le schéma.

### Raison 3 : Désynchronisation frontend ↔ backend

**Frontend** (AgentCreate.tsx) :
- Définit les schémas
- Les ajoute à la config lors de la création
- Suppose que l'API les recevra

**Backend** (API) :
- Reçoit la config avec schéma
- Mais ne fait rien de spécial pour les préserver
- Peut les écraser lors des mises à jour

## Solutions possibles

### Option A : Injection automatique au runtime (QUICK FIX) ✅

Injecter le schéma dans les agents au chargement :

```typescript
// Dans AgentDetail.tsx et AgentEdit.tsx
const getAgentSchema = (agentType: string, agentName: string): ConfigSchema | null => {
  if (agentName.includes('FFA')) {
    return FFAScraperAgentConfigSchema
  }
  if (agentName.includes('Google')) {
    return GoogleSearchDateAgentConfigSchema
  }
  return null
}

// Utiliser ce schéma si agent.config.configSchema est manquant
const configSchema = agent?.config?.configSchema || getAgentSchema(agent?.type, agent?.name) || {}
```

**Avantages :**
- Fonctionne immédiatement
- Pas de migration DB
- Les composants fonctionnent en prod

**Inconvénients :**
- Les agents ne sont pas autonomes (dépendent du frontend)
- Risque de désynchronisation si le schéma change

### Option B : Migration DB (PROPER FIX) ✅

Ajouter le schéma aux agents existants en base :

```typescript
// Fonction de migration
async function injectConfigSchemas() {
  const agents = await prisma.agent.findMany()
  
  for (const agent of agents) {
    if (agent.name.includes('FFA') && !agent.config?.configSchema) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          config: {
            ...agent.config,
            configSchema: FFAScraperAgentConfigSchema
          }
        }
      })
    }
    // ... même pour Google Search Date Agent
  }
}
```

**Avantages :**
- Agents autonomes, complets
- Les composants fonctionnent sans dépendances frontend
- Cohérence garantie

**Inconvénients :**
- Nécessite une migration
- Dépendances circulaires possibles

### Option C : Stocker schémas dans une table dédiée (FUTURE ARCHITECTURE)

```sql
CREATE TABLE agent_config_schemas (
  agent_type TEXT PRIMARY KEY,
  schema JSONB NOT NULL,
  version INT NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW()
)
```

**Avantages :**
- Schémas versionnés
- Facile à mettre à jour
- Agents légers

**Inconvénients :**
- Changement d'architecture majeur
- Complexité accrue

## État actuel (2025-11-17)

✅ **Fixé** : `DynamicConfigDisplay` intégré dans `AgentDetail`

❌ **Non fixé** : Agents en prod n'ont probablement pas de `configSchema`

## Prochaines étapes recommandées

1. **COURT TERME** : Implémenter Option A (injection au runtime)
   - Fait : Allows immediate testing in prod
   - Fichier : `apps/dashboard/src/hooks/useAgentSchema.ts` (nouveau hook)

2. **MOYEN TERME** : Implémenter Option B (migration DB)
   - Fichier : `packages/database/prisma/migrations/add-config-schemas/`
   - Script : `scripts/inject-agent-schemas.ts`

3. **LONG TERME** : Envisager Option C

## References

- `apps/dashboard/src/components/DynamicConfigForm.tsx` - Composant formulaire
- `apps/dashboard/src/components/DynamicConfigDisplay.tsx` - Composant affichage
- `apps/agents/src/FFAScraperAgent.configSchema.ts` - Schéma FFA
- `apps/agents/src/GoogleSearchDateAgent.configSchema.ts` - Schéma Google
- `apps/dashboard/src/pages/AgentDetail.tsx` - Page détail agent
- `apps/dashboard/src/pages/AgentEdit.tsx` - Page édition agent
- `apps/dashboard/src/pages/AgentCreate.tsx` - Page création agent
