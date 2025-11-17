# Système de Synchronisation des Agents

## Vue d'ensemble

Ce document décrit le système de synchronisation automatique qui maintient les métadonnées des agents (version, description) à jour entre le code source et la base de données.

## Problème Résolu

**Avant** :
- ❌ Les agents étaient créés en DB sans version ni description depuis le code
- ❌ Impossible de savoir quelle version d'un agent tourne en production
- ❌ Les modifications de description dans le code n'étaient pas reflétées en DB

**Après** :
- ✅ Synchronisation automatique au démarrage de l'application
- ✅ Version stockée dans `agent.config.version`
- ✅ Description à jour dans `agent.description`
- ✅ Script manuel disponible : `npm run sync-agents`

## Architecture

### 1. Source de Vérité : Code Source

Chaque agent exporte sa version :

```typescript
// apps/agents/src/FFAScraperAgent.ts
export const FFA_SCRAPER_AGENT_VERSION = '2.3.0'

export class FFAScraperAgent extends BaseAgent {
  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      description: `Agent... (v${FFA_SCRAPER_AGENT_VERSION})`,
      config: {
        version: FFA_SCRAPER_AGENT_VERSION,
        // ...
      }
    }
  }
}
```

### 2. Script de Synchronisation

**Fichier** : `scripts/sync-agents.ts`

**Fonctionnement** :
1. Lit les versions depuis le code (`FFA_SCRAPER_AGENT_VERSION`, etc.)
2. Compare avec les agents en DB
3. Met à jour si nécessaire :
   - Merge la config existante avec les valeurs par défaut
   - **Toujours** écraser `config.version` avec la version du code
   - Met à jour la `description`

**Usage manuel** :
```bash
# Synchronisation standard (uniquement si version différente)
npm run sync-agents

# Forcer la réinstallation de tous les agents
npm run sync-agents -- --force
```

**Sortie exemple** :
```
🔄 Synchronisation des agents...

📦 Traitement de FFA Scraper Agent...
  ⬆️  Mise à jour 2.2.0 → 2.3.0
  ✅ Agent mis à jour avec succès

📦 Traitement de Google Search Date Agent...
  ⏭️  Déjà à jour (v1.1.0)

✅ Synchronisation terminée
```

### 3. Enrichissement Automatique (API)

**Fichier** : `apps/api/src/services/agent-metadata.ts`

Lors de la **création** d'un agent via l'API (`POST /api/agents`), les métadonnées sont automatiquement enrichies depuis le code :

```typescript
// apps/api/src/routes/agents.ts
const enriched = await enrichAgentWithMetadata({
  name,
  config,
  description
})

const agent = await db.createAgent({
  description: enriched.description,  // ✅ Description du code
  config: enriched.config            // ✅ Config avec version
})
```

### 4. Synchronisation au Démarrage

**Fichier** : `apps/api/src/index.ts`

Au démarrage de l'API :

```typescript
app.listen(PORT, async () => {
  // Synchroniser les agents avec le code
  try {
    execSync('npm run sync-agents', { stdio: 'inherit' })
  } catch (error) {
    console.warn('⚠️  Erreur non-bloquante:', error)
  }
  
  // Démarrer le scheduler
  scheduler.start()
})
```

**Avantages** :
- ✅ **Idempotent** : Peut être exécuté plusieurs fois sans effet de bord
- ✅ **Non-bloquant** : L'API démarre même si la sync échoue
- ✅ **Automatique** : Pas d'action manuelle requise

## Workflow Complet

### Installation d'un Nouvel Agent

```bash
# 1. Créer l'agent avec sa version exportée
cat > apps/agents/src/MonAgent.ts << 'EOF'
export const MON_AGENT_VERSION = '1.0.0'
export class MonAgent extends BaseAgent { ... }
EOF

# 2. Ajouter au registry
cat > apps/agents/src/registry/mon-agent.ts << 'EOF'
import { agentRegistry } from '@data-agents/agent-framework'
import { MonAgent, MON_AGENT_VERSION } from '../MonAgent'

export const DEFAULT_CONFIG = { ... }
agentRegistry.register('MON_AGENT', MonAgent)
EOF

# 3. Ajouter au script de sync
# Éditer scripts/sync-agents.ts et ajouter dans AGENT_DEFINITIONS

# 4. Synchroniser
npm run sync-agents
```

### Mise à Jour de Version d'un Agent

```bash
# 1. Modifier la version dans le code
# apps/agents/src/FFAScraperAgent.ts
export const FFA_SCRAPER_AGENT_VERSION = '2.4.0'  # Était 2.3.0

# 2. Build
npm run build

# 3. Synchroniser (ou attendre le redémarrage de l'API)
npm run sync-agents
```

**Résultat en DB** :
```sql
SELECT id, config->'version' as version, description 
FROM "Agent" 
WHERE id = 'ffa-scraper-agent';

-- id                   | version | description
-- ffa-scraper-agent   | "2.4.0" | Agent qui scrape... (v2.4.0)
```

## Vérification

### Vérifier les versions actuelles

```bash
# Script dédié
npm run show-versions

# Ou via l'API
curl http://localhost:4001/api/agents

# Ou directement en DB
psql "$DATABASE_URL" -c "
  SELECT 
    id, 
    name,
    config->'version' as version
  FROM \"Agent\"
"
```

### Vérifier les logs de synchronisation

**Au démarrage de l'API** :
```
🔄 Synchronisation des agents avec le code...
📦 Traitement de FFA Scraper Agent...
  ⏭️  Déjà à jour (v2.3.0)
...
```

**Dans les logs agents** :
```
2025-11-17T17:50:00.000Z info: 🚀 Démarrage FFA Scraper Agent v2.3.0
  version: "2.3.0"
  timestamp: "2025-11-17T17:50:00.000Z"
```

## Règles et Bonnes Pratiques

### ✅ À FAIRE

1. **Toujours** exporter la version en constante au top du fichier agent
2. **Toujours** inclure la version dans le constructeur de l'agent
3. **Toujours** logger la version au démarrage de l'agent
4. Incrémenter la version selon [SemVer](https://semver.org/) :
   - `MAJOR.MINOR.PATCH` (ex: `2.3.0`)
   - Bugfix → PATCH (+0.0.1)
   - Nouvelle feature → MINOR (+0.1.0)
   - Breaking change → MAJOR (+1.0.0)

### ❌ À ÉVITER

1. **Ne pas** hardcoder la version dans plusieurs endroits
2. **Ne pas** modifier `config.version` manuellement en DB
3. **Ne pas** oublier d'ajouter un nouvel agent au script `sync-agents.ts`

## Dépannage

### Problème : Version pas mise à jour

**Symptôme** : `agent.config.version` reste à l'ancienne version

**Solutions** :
1. Vérifier que l'agent est builded : `npm run build`
2. Exécuter manuellement : `npm run sync-agents -- --force`
3. Vérifier les logs du script pour erreurs

### Problème : Script sync-agents échoue

**Symptôme** : Erreur lors de `npm run sync-agents`

**Causes possibles** :
- Imports du code source échouent → Vérifier `npm run build`
- Prisma client pas généré → Exécuter `npm run db:generate`
- Variable `DATABASE_URL` manquante → Vérifier `.env`

**Debug** :
```bash
# Tester l'import des versions
tsx -e "import('@data-agents/sample-agents/dist/FFAScraperAgent').then(m => console.log(m.FFA_SCRAPER_AGENT_VERSION))"

# Vérifier Prisma
npx prisma db execute --stdin <<< "SELECT 1"
```

### Problème : Synchronisation au démarrage échoue

**Symptôme** : Warning dans les logs de l'API

**Impact** : Non-bloquant, l'API démarre quand même

**Solution** :
```bash
# Exécuter manuellement après le démarrage
npm run sync-agents
```

## Migration Depuis l'Ancien Système

Si vous avez des agents existants **sans** version :

```bash
# Le script détectera automatiquement et ajoutera la version
npm run sync-agents

# Vérifier
npm run show-versions
```

**Avant** :
```json
{
  "id": "ffa-scraper-agent",
  "config": {
    "liguesPerRun": 2
  }
}
```

**Après** :
```json
{
  "id": "ffa-scraper-agent",
  "config": {
    "version": "2.3.0",
    "liguesPerRun": 2
  }
}
```

## Fichiers Concernés

| Fichier | Rôle |
|---------|------|
| `scripts/sync-agents.ts` | Script de synchronisation manuel |
| `apps/api/src/services/agent-metadata.ts` | Service d'enrichissement |
| `apps/api/src/routes/agents.ts` | Enrichissement lors création |
| `apps/api/src/index.ts` | Sync au démarrage |
| `apps/agents/src/*/Agent.ts` | Constantes de version |
| `docs/AGENT-VERSIONING.md` | Documentation versioning |

## Voir Aussi

- [AGENT-VERSIONING.md](./AGENT-VERSIONING.md) - Système de versioning détaillé
- [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) - Registry des agents
- [WARP.md](../WARP.md) - Règles Warp avec versions actuelles
