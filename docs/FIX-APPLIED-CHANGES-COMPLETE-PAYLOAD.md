# Fix: appliedChanges ne contenait pas le payload complet

**Date**: 2025-12-01  
**Problème**: Après l'application d'une proposition, `ProposalApplication.appliedChanges` ne contenait que les modifications de l'agent, pas les modifications utilisateur.

## Symptômes

### Avant Application (PENDING)
```json
{
  "appliedChanges": {
    "racesToAdd": [...],
    "raceEdits": {
      "existing-0": { "name": "Course 10 kms", "_deleted": false },
      "existing-1": { "_deleted": true }
    },
    "racesToAddFiltered": [0]
  }
}
```

✅ **Payload complet** : Toutes les modifications visibles dans l'interface `/updates`.

### Après Application (APPLIED)
```json
{
  "appliedChanges": {
    "racesToAdd": [...]
  }
}
```

❌ **Payload incomplet** : Seul `racesToAdd` présent, pas les modifications de nom ni les suppressions.

## Cause Racine

Dans `proposal-domain.service.ts`, les méthodes `applyNewEvent()`, `applyEventUpdate()`, `applyEditionUpdate()` et `applyRaceUpdate()` retournaient **`selectedChanges`** au lieu de **`changes`**.

### Différence entre les deux

```typescript
// Ligne 84-87 dans applyProposal()
const finalChanges = {
  ...(proposal.changes as Record<string, any>),           // Agent
  ...(proposal.userModifiedChanges as Record<string, any>) // Utilisateur (prioritaire)
}
```

- **`changes`** : Contient `proposal.changes` + `proposal.userModifiedChanges` mergées
- **`selectedChanges`** : Contient uniquement les valeurs sélectionnées de l'agent (paramètre d'entrée)

**Résultat** : Les modifications utilisateur étaient **appliquées** mais **pas stockées** dans `appliedChanges`.

## Solution

Retourner `changes` au lieu de `selectedChanges` dans tous les handlers de type de proposition.

### Fichiers Modifiés

**`packages/database/src/services/proposal-domain.service.ts`** :

1. **`applyNewEvent()`** (ligne ~269)
   ```diff
   - appliedChanges: selectedChanges,
   + appliedChanges: changes,
   ```

2. **`applyEventUpdate()`** (ligne ~307)
   ```diff
   - appliedChanges: selectedChanges
   + appliedChanges: changes
   ```

3. **`applyEditionUpdate()`** (ligne ~752)
   ```diff
   - appliedChanges: selectedChanges
   + appliedChanges: changes
   ```

4. **`applyRaceUpdate()`** (ligne ~794)
   ```diff
   - appliedChanges: selectedChanges
   + appliedChanges: changes
   ```

### Frontend

**`apps/api/src/routes/proposals.ts`** (ligne ~1140) :

```diff
- const finalPayload = Object.keys(baseChanges).length > 0 ? baseChanges : { ...changes }
+ const finalPayload = { ...baseChanges, ...changes }
```

Merge au lieu de choisir l'un ou l'autre.

## Impact

### Avant Fix

❌ Modifications utilisateur invisibles dans `/updates` après application  
❌ `appliedChanges` ne reflétait pas ce qui a vraiment été appliqué  
❌ Impossible d'auditer les modifications manuelles  

### Après Fix

✅ **Payload complet** dans `appliedChanges`  
✅ Modifications visibles dans `/updates` même après application  
✅ Traçabilité complète : agent + utilisateur  
✅ Cohérence entre "En attente" et "Appliquée"

## Tests

### Scénario 1: Modification de nom de course

1. Ouvrir proposition `3887-39618`
2. Modifier le nom d'une course : "Course 10 km" → "Course 10 kms"
3. Valider le bloc "Courses"
4. Appliquer la proposition

**Résultat attendu** :
```json
{
  "appliedChanges": {
    "racesToAdd": [...],
    "raceEdits": {
      "existing-0": { "name": "Course 10 kms" }
    }
  }
}
```

✅ **Vérifié** : Modification de nom visible dans `/updates`.

### Scénario 2: Suppression de course

1. Supprimer une course existante (bouton poubelle)
2. Valider le bloc "Courses"
3. Appliquer la proposition

**Résultat attendu** :
```json
{
  "appliedChanges": {
    "raceEdits": {
      "existing-1": { "_deleted": true }
    }
  }
}
```

✅ **Vérifié** : Suppression visible dans `/updates`.

### Scénario 3: Suppression de nouvelle course

1. Agent propose 2 nouvelles courses
2. Utilisateur supprime la 1ère course (index 0)
3. Valider le bloc "Courses"
4. Appliquer la proposition

**Résultat attendu** :
```json
{
  "appliedChanges": {
    "racesToAdd": [...],  // Seulement la 2ème course
    "racesToAddFiltered": [0]
  }
}
```

✅ **Vérifié** : Filtrage appliqué, seulement 1 course créée.

## Vérification en Base

```bash
# Vérifier appliedChanges après application
psql "$DATABASE_URL" -c "
SELECT 
  id,
  status,
  jsonb_pretty(\"appliedChanges\") 
FROM proposal_applications 
WHERE id = 'cmapp176459456777080bo19q6z';
"
```

## Ressources

- **Notebooks Warp Drive** :
  - `i6P9E1Z9pVcy5QtzRKsMjh` - Architecture merger changes
  - `dggj3NO8mUzERAAFJCSuHt` - Afficher tous les champs de tous les blocs
  
- **Code** :
  - Backend : `packages/database/src/services/proposal-domain.service.ts`
  - Frontend : `apps/api/src/routes/proposals.ts`
  - UI : `apps/dashboard/src/components/updates/BlockChangesTable.tsx`

## Prochaines Étapes

✅ **Phase 1 terminée** : appliedChanges contient le payload complet  
⏳ **Phase 2** : Simplifier BlockChangesTable (utiliser appliedChanges directement)  
⏳ **Phase 3** : Migration données existantes (optionnel)
