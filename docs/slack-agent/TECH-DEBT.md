# Tech Debt - Agent Slack Phase 3

> Dernière mise à jour : 2025-12-12

Ce document liste les éléments de dette technique introduits lors de la Phase 3 de l'agent Slack.

---

## Éléments résolus (2025-12-12)

### ✅ 1. Connexion Miles Republic via variable d'environnement

**Résolu** : Le service utilise maintenant `ConnectionManager` + `DatabaseManager` du framework `@data-agents/agent-framework`.

**Avant** :
```typescript
const milesRepublicUrl = process.env.MILES_REPUBLIC_DATABASE_URL
// ... création manuelle du client Prisma
```

**Après** :
```typescript
import { ConnectionManager, DatabaseManager, createConsoleLogger } from '@data-agents/agent-framework'

const logger = createConsoleLogger('SlackProposalService', 'slack-proposal-service')
const connectionManager = new ConnectionManager()

async function getSourceDatabase(): Promise<PrismaClientType> {
  const dbManager = DatabaseManager.getInstance(logger)
  return connectionManager.connectToSource('miles-republic', dbManager, logger)
}
```

---

### ✅ 2. Doublon sourceMetadata / justification

**Résolu** : Suppression de l'entrée `slack_source` dans `justification`.

Les informations de source Slack sont maintenant stockées **uniquement** dans `sourceMetadata`. Le dashboard devra lire ce champ pour afficher les infos Slack (voir dette technique future ci-dessous).

---

### ✅ 3. Import dynamique du client Prisma Miles Republic

**Résolu** : Le `ConnectionManager` gère maintenant l'import dynamique du client Prisma de façon centralisée et robuste.

---

### ✅ 4. Logger simplifié

**Résolu** : Utilisation de `createConsoleLogger` de `@data-agents/agent-framework` au lieu d'un logger ad-hoc.

---

### ✅ 5. Cache connexion en variable globale

**Résolu** : Le `ConnectionManager` gère le cache des connexions de façon centralisée avec gestion du lifecycle.

---

## Dette technique future

### Refactoring `justification` → séparation des concepts

**Priorité** : Basse (à planifier)

**Contexte** : Le champ `justification` est actuellement utilisé pour deux concepts différents :
1. **Source des données** : D'où viennent les informations (Slack, FFA, Google, etc.)
2. **Justification du matching** : Pourquoi on propose ce changement (scores de matching, etc.)

**État actuel** :
- `sourceMetadata` : Nouveau champ typé pour les métadonnées de source (Slack uniquement pour l'instant)
- `justification` : Tableau hétérogène contenant types `matching`, `url_source`, `rejected_matches`, `ffa_source`, etc.

**Refactoring proposé** :

1. **Migrer tous les agents** pour utiliser `sourceMetadata` :
   - `FFAScraperAgent` : Stocker les infos FFA dans `sourceMetadata` au lieu de `justification[type=ffa_source]`
   - `GoogleSearchDateAgent` : Stocker les infos Google dans `sourceMetadata`
   - `AutoValidatorAgent` : Adapter la lecture

2. **Refactorer le dashboard** :
   - Lire `sourceMetadata` pour afficher les infos de source
   - Garder `justification` uniquement pour les infos de matching (affichage humain)

3. **Nettoyer `justification`** :
   - Ne garder que les types liés au matching : `matching`, `rejected_matches`
   - Supprimer les types de source : `ffa_source`, `url_source`, `slack_source`

**Fichiers impactés** :
- `apps/agents/src/FFAScraperAgent.ts`
- `apps/agents/src/GoogleSearchDateAgent.ts`
- `apps/agents/src/AutoValidatorAgent.ts`
- `apps/dashboard/src/pages/proposals/detail/**`
- `packages/database/prisma/schema.prisma` (potentielle migration pour typer `sourceMetadata`)

**Bénéfices** :
- Séparation claire des concepts (source vs justification)
- Accès typé aux métadonnées de source
- Code plus maintenable

---

## Récapitulatif

| # | Description | Statut | Date |
|---|-------------|--------|------|
| 1 | Connexion via DatabaseManager | ✅ Résolu | 2025-12-12 |
| 2 | Doublon sourceMetadata/justification | ✅ Résolu | 2025-12-12 |
| 3 | Import dynamique Prisma | ✅ Résolu | 2025-12-12 |
| 4 | Logger simplifié | ✅ Résolu | 2025-12-12 |
| 5 | Cache connexion globale | ✅ Résolu | 2025-12-12 |
| - | Refactoring justification → sourceMetadata | 📋 Planifié | - |
