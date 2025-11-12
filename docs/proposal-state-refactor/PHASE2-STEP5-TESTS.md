# Phase 2 - Étape 5 : Tests RacesChangesTable

**Date** : 2025-11-11  
**Objectif** : Vérifier que les modifications de courses passent bien par le hook `useProposalEditor`

## Modifications appliquées

### 1️⃣ RacesChangesTable.tsx

- ✅ Ajout de `handleRaceFieldModify` en prop
- ✅ Modification de `saveEdit()` pour utiliser le handler si disponible
- ✅ Fallback sur `syncWithBackend` pour rétrocompatibilité

### 2️⃣ EditionUpdateGroupedDetail.tsx

- ✅ Passage de `handleRaceFieldModify` depuis le context

### 3️⃣ EditionUpdateDetail.tsx

- ✅ Passage de `handleRaceFieldModify` depuis le context (propositions simples)

## Tests à effectuer

### Test 1 : Modifier une course dans une proposition groupée

**URL** : `http://localhost:3001/grouped-proposals/edition-update/13446-44684` (ou toute autre proposition EDITION_UPDATE groupée)

**Actions** :
1. Ouvrir les DevTools (Console)
2. Repérer une course dans la section "Courses"
3. Cliquer sur l'icône ✏️ à côté d'un champ (ex: `distance`, `startDate`)
4. Modifier la valeur
5. Cliquer sur ✓ (valider)

**Logs attendus** :

```
🚀 [RacesChangesTable] Utilisation de handleRaceFieldModify depuis le context
🔄 [handleRaceFieldModify] Appelé pour raceIndex=0, field=distance, value=12
🚀 [handleRaceFieldModify] updateRaceEditor appelé
✅ [GroupedProposalEditor] Mutation réussie: {id: [...], userModifiedChanges: {...}}
```

**Vérifications** :
- [ ] Aucune erreur dans la console
- [ ] Log "Utilisation de handleRaceFieldModify depuis le context" visible
- [ ] Log "updateRaceEditor appelé" visible (context)
- [ ] Mutation réussie
- [ ] Le champ modifié affiche la nouvelle valeur

---

### Test 2 : Vérifier que `workingGroup` contient les modifications

**Actions** :
1. Après avoir modifié une course (Test 1)
2. Dans la console, chercher le log :
   ```
   📊 [GroupedProposalContext] État actuel du workingGroup
   ```
3. Vérifier la structure de `userModifiedRaceChanges`

**Vérifications** :
- [ ] `workingGroup.userModifiedRaceChanges` contient les modifications
- [ ] Format attendu : `{ [raceIndex]: { [field]: value } }`
- [ ] Exemple : `{ 0: { distance: "12" } }`

---

### Test 3 : Modifier une course dans une proposition simple

**URL** : `http://localhost:3001/proposals/[proposalId]` (propostion EDITION_UPDATE simple)

**Actions** :
1. Ouvrir une proposition simple (non groupée)
2. Modifier une course (mêmes actions que Test 1)

**Logs attendus** :

```
🚀 [RacesChangesTable] Utilisation de handleRaceFieldModify depuis le context
```

**Vérifications** :
- [ ] Aucune erreur dans la console
- [ ] Log "Utilisation de handleRaceFieldModify" visible
- [ ] Mutation réussie
- [ ] Le champ modifié affiche la nouvelle valeur

---

### Test 4 : Fallback sur ancien flux (rétrocompatibilité)

**Actions** :
1. Dans `EditionUpdateGroupedDetail.tsx`, **commenter temporairement** la ligne :
   ```typescript
   // handleRaceFieldModify={handleRaceFieldModify}
   ```
2. Recharger la page
3. Modifier une course

**Logs attendus** :

```
📡 [RacesChangesTable] Fallback sur syncWithBackend (ancien flux)
📡 [RacesChangesTable] syncWithBackend: {proposalId: "...", updates: {...}}
```

**Vérifications** :
- [ ] Log "Fallback sur syncWithBackend" visible
- [ ] Mutation directe vers `/api/proposals/:id` (ancien flux)
- [ ] Aucune erreur
- [ ] **Restaurer la ligne après le test** ✅

---

## Résultats attendus

| Test | Statut | Notes |
|------|--------|-------|
| Modifier course groupée | ⏳ | À tester |
| Vérifier workingGroup | ⏳ | À tester |
| Modifier course simple | ⏳ | À tester |
| Fallback rétrocompatibilité | ⏳ | À tester |

---

## Si les tests passent ✅

Passer à l'**Étape 6** : Suppression des anciens états

États à supprimer dans `GroupedProposalDetailBase.tsx` :
- `userModifiedChanges`, `userModifiedRaceChanges` (ligne 133-134)
- `selectedChanges` (de `useProposalLogic`)
- `consolidatedChanges`, `consolidatedRaceChanges` calculés localement
- Auto-sélection des meilleures valeurs (déjà géré par le hook)

---

## Si les tests échouent ❌

### Erreurs possibles

**1. `handleRaceFieldModify is not a function`**

**Cause** : Le handler n'est pas passé correctement depuis le context

**Solution** :
- Vérifier que `handleRaceFieldModify` est bien extrait du context dans `EditionUpdateGroupedDetail.tsx`
- Vérifier que le handler est bien défini dans `GroupedProposalContext`

---

**2. `workingGroup is null`**

**Cause** : Le hook `useProposalEditor` n'est pas initialisé correctement

**Solution** :
- Vérifier les logs de `useProposalEditor` au chargement
- Vérifier que `workingGroup` est bien retourné par le hook en mode groupé

---

**3. Modifications non persistées**

**Cause** : `updateRaceEditor` ne sauvegarde pas correctement

**Solution** :
- Vérifier les logs de mutation dans le hook
- Vérifier que `buildGroupDiff()` inclut bien les `userModifiedRaceChanges`

---

## Logs de debugging

Pour activer tous les logs :

```typescript
// Dans useProposalEditor.ts
console.log('🔄 [handleRaceFieldModify] Appelé', { raceIndex, field, value })
console.log('🚀 [handleRaceFieldModify] updateRaceEditor appelé')

// Dans GroupedProposalContext.tsx
console.log('📊 [GroupedProposalContext] État actuel du workingGroup', workingGroup)
```

---

## Prochaine étape

Si tous les tests passent : **Étape 6 - Suppression des anciens états** 🎯
