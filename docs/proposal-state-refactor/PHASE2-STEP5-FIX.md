# Phase 2 - Étape 5 : Fix Sauvegarde des modifications de courses

**Date** : 2025-11-11  
**Problème** : Les modifications de courses n'étaient pas persistées

## Diagnostic

### Symptômes

Logs observés :
```
🚀 [RacesChangesTable] Utilisation de handleRaceFieldModify depuis le context
🔄 [handleRaceFieldModify] Appelé
🚀 [handleRaceFieldModify] updateRaceEditor appelé
```

❌ **Manquant** : Pas de log "✅ [GroupedProposalEditor] Mutation réussie"
❌ **Résultat** : Changement non sauvegardé

### Cause racine

Dans `useProposalEditor.ts`, ligne 626 :

```typescript
const updateRace = useCallback((raceId: string, field: string, value: any) => {
  if (isGroupMode) {
    setWorkingGroup(prev => {
      // Met à jour workingGroup.userModifiedRaceChanges
      // ...
    })
  }
  
  // ❌ En mode groupé, PAS de sauvegarde automatique !
  if (!isGroupMode && autosave) {
    scheduleAutosave()
  }
}, [isGroupMode, autosave, scheduleAutosave])
```

**Explication** :
- En mode **simple** (`!isGroupMode`) : Autosave activé → Sauvegarde automatique ✅
- En mode **groupé** (`isGroupMode`) : Autosave désactivé → Aucune sauvegarde ❌

**Raison du design** : En mode groupé, on veut sauvegarder manuellement via le bouton ou lors de la validation par blocs.

### Problème

`RacesChangesTable` charge les modifications depuis `proposal.userModifiedChanges` (base de données), pas depuis `workingGroup` (mémoire locale).

Donc :
1. `updateRaceEditor()` met à jour `workingGroup.userModifiedRaceChanges` (mémoire) ✅
2. Mais ne persiste PAS en base de données ❌
3. Rechargement de la page → Modifications perdues ❌

## Solution

Appeler `saveEditor()` immédiatement après `updateRaceEditor()` dans `handleRaceFieldModify`.

### Modification effectuée

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

```typescript
// 🚀 PHASE 2: Utiliser le hook pour l'édition de course
if (workingGroup?.consolidatedRaces && workingGroup.consolidatedRaces[raceIndex]) {
  const raceId = workingGroup.consolidatedRaces[raceIndex].raceId
  updateRaceEditor(raceId, fieldName, newValue)
  
  // ✅ Sauvegarder immédiatement (mode groupé n'a pas d'autosave)
  saveEditor().catch(err => {
    console.error('❌ [handleRaceFieldModify] Erreur lors de la sauvegarde:', err)
  })
}
```

## Tests

### Logs attendus maintenant

```
🚀 [RacesChangesTable] Utilisation de handleRaceFieldModify depuis le context
🔄 [handleRaceFieldModify] Appelé
🚀 [handleRaceFieldModify] updateRaceEditor appelé
💾 [useProposalEditor] Sauvegarde en cours...
✅ Modifications groupées sauvegardées
```

### Vérifications

1. **Modifier une course** (nom, distance, startDate)
2. **Vérifier les logs** dans la console
3. **Rafraîchir la page** (F5)
4. **Vérifier** que la modification est toujours là ✅

## Impact

### Avant ❌

- Modifications en mémoire uniquement
- Perte des modifications au rechargement
- Incohérence entre UI et base de données

### Après ✅

- Sauvegarde immédiate en base de données
- Persistance garantie
- Cohérence UI ↔ DB

## Notes

### Alternative non retenue : Lire depuis workingGroup

On aurait pu faire en sorte que `RacesChangesTable` lise les modifications depuis `workingGroup` au lieu de `proposal.userModifiedChanges`.

**Problème** : `RacesChangesTable` est aussi utilisé dans les propositions **simples** où `workingGroup` n'existe pas. Il faudrait gérer les deux cas (simple vs groupé).

**Solution retenue** : Sauvegarder immédiatement → Plus simple et cohérent avec le comportement actuel.

---

## Prochaine étape

Si les tests passent : **Étape 6 - Suppression des anciens états** 🎯
