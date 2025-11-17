# Système de versioning des agents

**Date** : 2025-11-17  
**Statut** : ✅ Implémenté

## Problème

Lors du déploiement sur Render, il n'y avait aucun moyen de vérifier quelle version du code agent était réellement exécutée. Cela causait des doutes :
- Les agents sont-ils vraiment recompilés ?
- Quelle version du code tourne en production ?
- Est-ce qu'une modification récente est bien déployée ?

## Solution

Chaque agent possède maintenant une **constante de version exportée** qui est :
1. Loggée au démarrage de chaque exécution
2. Stockée dans la base de données (champ `config`)
3. Visible dans les logs Render

### Structure

```typescript
// Dans le fichier de l'agent (ex: FFAScraperAgent.ts)
export const FFA_SCRAPER_AGENT_VERSION = '2.3.0'

export class FFAScraperAgent extends BaseAgent {
  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      description: `Agent... (v${FFA_SCRAPER_AGENT_VERSION})`,
      config: {
        version: FFA_SCRAPER_AGENT_VERSION,
        // ... autres configs
      }
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    context.logger.info(`🚀 Démarrage FFA Scraper Agent v${FFA_SCRAPER_AGENT_VERSION}`, {
      version: FFA_SCRAPER_AGENT_VERSION,
      timestamp: new Date().toISOString()
    })
    // ...
  }
}
```

## Agents versionés

| Agent | Version actuelle | Fichier |
|-------|------------------|---------|
| **FFA Scraper Agent** | `2.3.0` | `apps/agents/src/FFAScraperAgent.ts` |
| **Google Search Date Agent** | `1.1.0` | `apps/agents/src/GoogleSearchDateAgent.ts` |

## Sémantique de version

Format : `MAJOR.MINOR.PATCH`

- **MAJOR** : Changements incompatibles (breaking changes)
  - Exemple : Changement de structure de proposition
  - Exemple : Changement d'algorithme de matching incompatible
  
- **MINOR** : Nouvelles fonctionnalités rétrocompatibles
  - Exemple : Ajout de support des événements multi-jours
  - Exemple : Nouvelle logique de confiance inversée
  
- **PATCH** : Corrections de bugs
  - Exemple : Fix parsing timezone
  - Exemple : Correction déduplication

## Vérification en production

### Dans les logs Render

```bash
# Rechercher les logs de démarrage
2025-11-17T17:50:00.000Z info: 🚀 Démarrage FFA Scraper Agent v2.3.0
  version: "2.3.0"
  timestamp: "2025-11-17T17:50:00.000Z"
  liguesPerRun: 2
  monthsPerRun: 1
```

### Via l'API

```bash
# Récupérer la config d'un agent
GET /api/agents/:id

Response:
{
  "id": "cm...",
  "name": "FFA Scraper Agent",
  "description": "Agent... (v2.3.0)",
  "config": {
    "version": "2.3.0",
    "liguesPerRun": 2,
    ...
  }
}
```

### Dans la base de données

```sql
-- Vérifier la version stockée
SELECT 
  name,
  description,
  config->>'version' as version,
  "updatedAt"
FROM agents
WHERE name = 'FFA Scraper Agent';
```

## Historique des versions

### FFA Scraper Agent

| Version | Date | Changements |
|---------|------|-------------|
| **2.3.0** | 2025-11-17 | Ajout système de versioning |
| **2.2.0** | 2025-11-07 | Support événements multi-jours |
| **2.1.0** | 2025-11-06 | Fix déduplication + progression |
| **2.0.0** | 2025-11-05 | Refonte algorithme de matching |

### Google Search Date Agent

| Version | Date | Changements |
|---------|------|-------------|
| **1.1.0** | 2025-11-17 | Ajout système de versioning |
| **1.0.0** | 2025-10-15 | Version initiale |

## Workflow de déploiement

### 1. Modifier le code de l'agent

```typescript
// Incrémenter la version selon le type de changement
export const FFA_SCRAPER_AGENT_VERSION = '2.4.0' // ← MINOR bump
```

### 2. Documenter le changement

Ajouter une entrée dans `docs/AGENT-VERSIONING.md` et `WARP.md` (section Changelog).

### 3. Vérifier localement

```bash
npm run dev:agents

# Dans les logs, vérifier :
# 🚀 Démarrage FFA Scraper Agent v2.4.0
```

### 4. Déployer sur Render

```bash
git add .
git commit -m "feat(agents): [description] - v2.4.0"
git push origin main
```

### 5. Vérifier en production

Attendre le déploiement Render (2-3 min), puis :

```bash
# Via l'interface Render : Logs → rechercher "v2.4.0"
# Ou via l'API
curl https://data-agents.onrender.com/api/agents
```

## Avantages

✅ **Traçabilité** : Savoir quelle version tourne en production  
✅ **Debugging** : Identifier rapidement si un bug est lié à une version spécifique  
✅ **Confiance** : Vérifier que les changements sont bien déployés  
✅ **Audit** : Historique des versions dans la base de données  
✅ **Communication** : Les logs sont plus informatifs

## Notes

- La version est **stockée dans la DB** lors de la création/mise à jour de l'agent
- Si l'agent existe déjà, il faut soit le recréer, soit le mettre à jour manuellement
- La version apparaît dans les **3 endroits** : logs, DB, API
