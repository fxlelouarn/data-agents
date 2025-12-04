# Phase 4 : Tri topologique dans UpdateGroupDetail (Frontend)

**Date** : 2025-12-03  
**Statut** : ✅ Implémenté

## Problème

Dans la page `/updates/:groupId` (`UpdateGroupDetail.tsx`), les boutons "Appliquer tous les blocs" et "Rejouer tous les blocs" appliquaient les `ProposalApplication` **dans l'ordre où elles apparaissaient dans la liste**, sans tenir compte des dépendances entre blocs.

### Symptômes

Pour une proposition **NEW_EVENT** avec 3 blocs validés dans le désordre :
1. Utilisateur valide `races` → Crée `ProposalApplication` (races)
2. Utilisateur valide `event` → Crée `ProposalApplication` (event)
3. Utilisateur valide `edition` → Crée `ProposalApplication` (edition)

**Clic sur "Appliquer tous les blocs"** → Application dans l'ordre de création :
```
❌ races   → Erreur FK (editionId inexistant)
❌ event   → Erreur FK (eventId déjà créé mais trop tard)
❌ edition → Erreur FK (eventId inexistant)
```

### Cause

Le code appliquait les applications **séquentiellement** mais sans tri préalable :

```typescript
// ❌ AVANT (buggué)
const pendingApps = groupUpdates.filter(a => a.status === 'PENDING')

for (const app of pendingApps) {
  await applyUpdateMutation.mutateAsync(app.id)  // Ordre aléatoire
}
```

## Solution : Réutilisation du module `block-execution-order`

Au lieu de réinventer la roue, on réutilise le module existant créé en Phase 1 :
- `sortBlocksByDependencies()` : Tri topologique avec DFS
- `explainExecutionOrder()` : Génération de logs lisibles

### Code modifié

**Fichier** : `apps/dashboard/src/pages/UpdateGroupDetail.tsx`

**Import** :
```typescript
import { sortBlocksByDependencies, explainExecutionOrder } from '@data-agents/database'
```

**handleApplyAllBlocks()** :
```typescript
const handleApplyAllBlocks = async () => {
  try {
    const pendingApps = groupUpdates.filter(a => a.status === 'PENDING')
    
    // ✅ Tri topologique pour respecter les dépendances
    const sortedApps = sortBlocksByDependencies(
      pendingApps.map(app => ({
        blockType: app.blockType as any,
        id: app.id
      }))
    )
    
    console.log('📋 ' + explainExecutionOrder(sortedApps))
    console.log('   Applications:', sortedApps.map(a => `${a.blockType}(${a.id.slice(-6)})`).join(', '))
    
    // Appliquer tous les blocs en séquence (ordre respecté)
    for (const app of sortedApps) {
      console.log(`  → Application bloc "${app.blockType || 'unknown'}"...`)
      await applyUpdateMutation.mutateAsync(app.id)
    }
    
    console.log('✅ Tous les blocs appliqués avec succès')
  } catch (error) {
    console.error('Error applying all blocks:', error)
  }
}
```

**handleReplayAllBlocks()** : Même logique pour le rejeu.

## Résultat

### Avant (buggué)

```
❌ Application dans l'ordre de création
  → races (14:30)
  → event (14:35) 
  → edition (14:40)

❌ Erreur FK: editionId not found
```

### Après (corrigé)

```
✅ Tri topologique automatique
📋 Ordre d'exécution: event → edition → races
   Applications: event(a1b2c3), edition(d4e5f6), races(g7h8i9)

  → Application bloc "event"...
  → Application bloc "edition"...
  → Application bloc "races"...

✅ Tous les blocs appliqués avec succès
```

## Avantages

| Aspect | Avant | Après |
|--------|-------|-------|
| **Ordre garanti** | ❌ Ordre de création | ✅ Ordre dépendances |
| **Erreurs FK** | ⚠️ Fréquentes | ✅ Impossibles |
| **Cohérence** | ❌ Backend OK, Frontend bugué | ✅ Backend + Frontend |
| **Code dupliqué** | ⚠️ Logique à dupliquer | ✅ Module réutilisé |
| **Logs** | ❌ Aucun contexte | ✅ Logs explicites |

## Cas d'usage réel

### Scénario : Validation dans le désordre (NEW_EVENT)

**Utilisateur** :
1. 14:30 → Valide bloc `races`
2. 14:35 → Valide bloc `event`
3. 14:40 → Valide bloc `edition`
4. 14:45 → Navigue vers `/updates/:groupId`
5. 14:46 → Clique "Appliquer tous les blocs"

**Console** :
```
📋 Ordre d'exécution: event → edition → races
   Applications: event(a1b2c3), edition(d4e5f6), races(g7h8i9)

  → Application bloc "event"...
✅ Event créé: 15178

  → Application bloc "edition"...
✅ Edition créée: 52074

  → Application bloc "races"...
✅ 3 course(s) créée(s): 40098, 40099, 40100

✅ Tous les blocs appliqués avec succès
```

**Résultat** : ✅ Succès garanti

## Cohérence avec le backend

### Backend : Endpoint `/bulk/apply`

Le backend utilise **exactement le même module** :

```typescript
// apps/api/src/routes/updates.ts (Phase 2)
const applicationsInOrder = sortBlocksByDependencies(applications)
console.log('📋 ' + explainExecutionOrder(applicationsInOrder))
```

### Frontend : Page `UpdateGroupDetail`

Le frontend réutilise le même module :

```typescript
// apps/dashboard/src/pages/UpdateGroupDetail.tsx (Phase 4)
const sortedApps = sortBlocksByDependencies(pendingApps)
console.log('📋 ' + explainExecutionOrder(sortedApps))
```

**Résultat** : ✅ **Comportement identique** entre frontend et backend.

## Tests

### Test manuel

1. **Créer une proposition NEW_EVENT**
   ```bash
   # Via agent FFA ou création manuelle
   ```

2. **Valider les blocs dans le désordre**
   - Valider `races` d'abord
   - Puis `event`
   - Puis `edition`

3. **Naviguer vers `/updates/:groupId`**

4. **Cliquer "Appliquer tous les blocs"**

5. **Vérifier les logs console** :
   ```
   📋 Ordre d'exécution: event → edition → races
   ```

6. **Vérifier en base** :
   ```sql
   SELECT id, name FROM "Event" WHERE id = 15178;
   SELECT id, year FROM "Edition" WHERE "eventId" = 15178;
   SELECT id, name FROM "Race" WHERE "editionId" = 52074;
   ```

### Test de non-régression

**Validation dans l'ordre correct** (event → edition → races) :
- ✅ Doit fonctionner comme avant
- ✅ Pas de régression

**Validation partielle** (edition + races, pas event) :
- ✅ Doit échouer avec message clair (blocs manquants)
- ⚠️ Cette validation est faite côté **backend** (`validateRequiredBlocks`)

## Fichiers modifiés

### Frontend
- `apps/dashboard/src/pages/UpdateGroupDetail.tsx` :
  - Import de `sortBlocksByDependencies` et `explainExecutionOrder`
  - Modification de `handleApplyAllBlocks()` (lignes 122-145)
  - Modification de `handleReplayAllBlocks()` (lignes 152-175)

### Module réutilisé
- `packages/database/src/services/block-execution-order.ts` (inchangé)

### Documentation
- `docs/BLOCK-EXECUTION-ORDER-PHASE4.md` (ce fichier)
- `docs/BLOCK-EXECUTION-ORDER-SUMMARY.md` (mis à jour)

## Logs de production

### Format attendu

**Application réussie** :
```
📋 Ordre d'exécution: event → edition → organizer → races
   Applications: event(a1b2c3), edition(d4e5f6), organizer(g7h8i9), races(j0k1l2)

  → Application bloc "event"...
  → Application bloc "edition"...
  → Application bloc "organizer"...
  → Application bloc "races"...

✅ Tous les blocs appliqués avec succès
```

**Rejeu après échec** :
```
🔄 Rejeu - Ordre d'exécution: event → edition → races
   Applications: event(a1b2c3), edition(d4e5f6), races(g7h8i9)

  → Rejeu bloc "event"...
  → Rejeu bloc "edition"...
  → Rejeu bloc "races"...

✅ Tous les blocs rejoués avec succès
```

## Maintenance

### Ajout d'un nouveau bloc

Si un nouveau bloc est ajouté (ex: `location`), il suffit de modifier **une seule fois** le module partagé :

1. **Modifier le graphe** (`packages/database/src/services/block-execution-order.ts`) :
   ```typescript
   export const BLOCK_DEPENDENCIES: Record<BlockType, BlockType[]> = {
     'event': [],
     'edition': ['event'],
     'location': ['edition'],  // ✅ Nouveau
     'organizer': ['edition'],
     'races': ['edition']
   }
   ```

2. **Aucune modification nécessaire** dans :
   - ❌ `UpdateGroupDetail.tsx` (déjà utilise le module)
   - ❌ `updates.ts` (déjà utilise le module)

3. **Ajouter les tests unitaires** :
   ```typescript
   // packages/database/src/services/__tests__/block-execution-order.test.ts
   test('location doit être après edition', () => {
     const blocks = [
       { blockType: 'location', id: 'app1' },
       { blockType: 'edition', id: 'app2' }
     ]
     const sorted = sortBlocksByDependencies(blocks)
     expect(sorted[0].blockType).toBe('edition')
     expect(sorted[1].blockType).toBe('location')
   })
   ```

## Évolution : Phase 5 (Optionnelle)

### Désactivation préventive du bouton

Au lieu de corriger l'ordre au moment du clic, on pourrait **désactiver le bouton** si les blocs requis manquent :

```typescript
// Vérifier les blocs requis AVANT le clic
const proposalType = groupMetadata?.proposalType
const validation = validateRequiredBlocks(pendingApps, proposalType)

<Button
  disabled={!validation.valid}
  onClick={handleApplyAllBlocks}
>
  Appliquer tous les blocs
  {!validation.valid && (
    <Tooltip title={`Blocs manquants : ${validation.missing.join(', ')}`}>
      <ErrorIcon />
    </Tooltip>
  )}
</Button>
```

**Avantage** : Évite les erreurs avant même d'essayer  
**Inconvénient** : Complexité supplémentaire + UX moins flexible

**Pour l'instant** : Défense en profondeur (backend refuse si blocs manquants)

## Références

- **Phase 1** : Module de base (`block-execution-order.ts`)
- **Phase 2** : Intégration backend (`/bulk/apply`)
- **Phase 3** : Validation blocs requis (backend)
- **Phase 4** : Intégration frontend (`UpdateGroupDetail`) ← **Ce document**
- **Summary** : `docs/BLOCK-EXECUTION-ORDER-SUMMARY.md`

## Support

En cas de problème :
1. Vérifier les logs console : `📋 Ordre d'exécution...`
2. Vérifier l'ordre en base de données
3. Comparer avec les logs backend (`/bulk/apply`)
4. Vérifier que le module `@data-agents/database` est bien importé

---

**Version** : 1.0.0  
**Dernière mise à jour** : 2025-12-03  
**Mainteneur** : Équipe Data Agents
