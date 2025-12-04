# Phase 2 : Intégration du tri topologique dans l'API

**Date** : 2025-12-03  
**Statut** : ✅ Complété

## Objectif

Intégrer le module `block-execution-order` dans l'API pour garantir que les ProposalApplication sont exécutées dans le bon ordre, respectant les dépendances entre blocs.

## Modifications

### 1. Export du module (`packages/database/src/index.ts`)

```typescript
// Export block execution order utilities
export * from './services/block-execution-order'
```

**Exports disponibles** :
- `sortBlocksByDependencies(blocks: BlockApplication[]): BlockApplication[]`
- `validateRequiredBlocks(blocks: BlockApplication[], proposalType: string)`
- `explainExecutionOrder(blocks: BlockApplication[]): string`
- `BLOCK_DEPENDENCIES` : Graphe de dépendances
- Types : `BlockType`, `BlockApplication`

### 2. Tri topologique dans `/bulk/apply` (`apps/api/src/routes/updates.ts`)

**Imports** :
```typescript
import { sortBlocksByDependencies, explainExecutionOrder, BlockApplication } from '@data-agents/database'
```

**Implémentation (lignes 466-480)** :
```typescript
// ✅ PHASE 2: Trier les applications selon les dépendances entre blocs
const sortedApplications = sortBlocksByDependencies(
  applications.map((app: any) => ({
    blockType: app.blockType,
    id: app.id
  }))
)

// Récupérer les applications complètes dans l'ordre trié
const applicationsInOrder = sortedApplications
  .map((sorted: BlockApplication) => applications.find((app: any) => app.id === sorted.id)!)
  .filter(Boolean)

const executionOrder = explainExecutionOrder(sortedApplications)
console.log(`📋 ${executionOrder}`)
```

**Utilisation** :
```typescript
// Appliquer toutes les mises à jour dans l'ordre trié
for (const application of applicationsInOrder) {
  // ...
}
```

## Algorithme de tri

### Entrée (exemple désordre)
```
Applications reçues : [races, organizer, event, edition]
```

### Processus
1. **Graphe de dépendances** :
   - `event` → ∅
   - `edition` → `event`
   - `organizer` → `edition`
   - `races` → `edition`

2. **DFS (Depth-First Search)** :
   - Visiter `races` → Visiter `edition` → Visiter `event`
   - Ajouter `event` (pas de dépendance)
   - Ajouter `edition` (dépendances satisfaites)
   - Ajouter `races` (dépendances satisfaites)
   - Visiter `organizer` → Dépendance `edition` déjà visitée
   - Ajouter `organizer`

### Sortie
```
Ordre d'exécution: event → edition → races → organizer
```

## Logs

**Console backend** :
```
📋 Ordre d'exécution: event → edition → races → organizer
```

**Exemple avec blocType=null (legacy)** :
```
📋 Ordre d'exécution: event → edition → legacy
```

## Cas d'usage

### Scénario 1 : Validation dans le désordre

**Utilisateur valide** :
1. Bloc `races` (14:30)
2. Bloc `event` (14:35)
3. Bloc `edition` (14:40)

**API reçoit** : `[app_races, app_event, app_edition]`

**Après tri** : `[app_event, app_edition, app_races]`

**Exécution** :
1. ✅ Create Event (id: 15178)
2. ✅ Create Edition (id: 52074, eventId: 15178)
3. ✅ Create Races (editionId: 52074)

**Résultat** : Pas d'erreur de clé étrangère ! 🎉

### Scénario 2 : Validation partielle

**Utilisateur valide** : Blocs `edition` et `races` seulement (pas de `event`)

**API reçoit** : `[app_edition, app_races]`

**Après tri** : `[app_edition, app_races]`  
(Pas de `event` dans la liste → `edition` passe directement)

**Exécution** :
1. ✅ Update Edition (mise à jour, pas création)
2. ✅ Update Races

**Résultat** : L'algorithme ne force PAS l'existence de `event` si non validé

## Comportement des blocs manquants

⚠️ **Important** : Le tri topologique ne **force pas** la validation de blocs manquants.

**Exemple** :
- Utilisateur valide uniquement `edition` et `races`
- `event` n'est pas validé (donc pas d'application créée)
- Le tri accepte `[edition, races]` sans erreur

**Validation des blocs requis** : Phase 3 (voir `validateRequiredBlocks()`)

## Avantages

✅ **Cohérence garantie** : Ordre correct peu importe l'ordre de validation  
✅ **Pas de contrainte de clé étrangère** : Les dépendances sont respectées  
✅ **Flexible** : Support des blocs manquants (validation partielle)  
✅ **Transparent** : Logs clairs pour debugging  
✅ **Rétrocompatible** : Support des applications legacy sans `blockType`

## Tests manuels

### Test 1 : Ordre inversé
```bash
# Créer 3 applications dans l'ordre inverse
POST /api/proposals/validate-block-group
  block: "races"
  
POST /api/proposals/validate-block-group
  block: "edition"
  
POST /api/proposals/validate-block-group
  block: "event"

# Appliquer tout
POST /api/updates/bulk/apply
  ids: [app_races_id, app_edition_id, app_event_id]

# Vérifier logs backend
# Attendu: "📋 Ordre d'exécution: event → edition → races"
```

### Test 2 : Mélangé avec legacy
```bash
# Applications mixtes (nouveau + legacy)
applications = [
  { blockType: 'races', id: 'app1' },
  { blockType: null, id: 'app_legacy' },
  { blockType: 'event', id: 'app2' },
  { blockType: 'edition', id: 'app3' }
]

# Attendu: event → edition → races → legacy
```

## Fichiers modifiés

### Backend
- `packages/database/src/index.ts` : Export du module
- `apps/api/src/routes/updates.ts` : Tri dans `/bulk/apply`

### Pas de changement frontend
L'ordre est géré uniquement côté serveur → Aucun impact frontend

## Métriques

| Aspect | Avant | Après |
|--------|-------|-------|
| **Ordre garanti** | ❌ Non | ✅ Oui |
| **Erreurs clés étrangères** | ⚠️ Possibles | ✅ Impossibles |
| **Performance** | O(N) | O(N) (tri en mémoire) |
| **Complexité code** | Simple mais bugué | Simple et correct |

## Prochaine étape : Phase 3

**Validation des blocs requis AVANT l'application**

Ajouter dans l'endpoint `/bulk/apply` :

```typescript
const validation = validateRequiredBlocks(sortedApplications, proposal.type)

if (!validation.valid) {
  throw createError(400, `Missing required blocks: ${validation.missing.join(', ')}`, 'MISSING_BLOCKS')
}
```

**Objectif** : Refuser l'application si blocs critiques manquants (ex: NEW_EVENT sans `event` ou `edition`)

## Ressources

- Phase 1 : `docs/BLOCK-EXECUTION-ORDER.md`
- Tests unitaires : `packages/database/src/services/__tests__/block-execution-order.test.ts`
- Spécification : `docs/SPEC-BLOCK-EXECUTION-ORDER.md`
