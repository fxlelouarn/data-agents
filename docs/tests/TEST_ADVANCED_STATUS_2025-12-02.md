# État Tests Advanced - 2025-12-02

## Résumé
**3/19 tests passent** (15.8%)  
**16/19 tests échouent** (84.2%)

## Problèmes identifiés

### 1. ✅ Erreur `archivedAt` - RÉSOLU
**Cause** : Le modèle `Race` n'a pas de champ `archivedAt`, mais `isArchived` (boolean)  
**Fix** : Changé `where: { archivedAt: null }` → `where: { isArchived: false }`

### 2. ❌ Table `Organizer` n'existe plus
**Cause** : Le schéma Miles Republic a remplacé `Organizer` par `EditionPartner` avec `role: ORGANIZER`  
**Impact** : 3 tests échouent avec `Cannot read properties of null (reading 'id')`  
**Solution temporaire** : Skip ces tests pour l'instant

### 3. ❌ Filtrage des blocs approuvés ne fonctionne PAS

C'est le problème principal.

#### Symptômes
- Test "should apply only approved blocks":  
  `approvedBlocks = { event: true, edition: true, races: false }`  
  **Résultat** : La course est quand même modifiée (Expected: 10, Received: 12)

- Test "should handle races block with toAdd and toUpdate":  
  `approvedBlocks = { event: false, races: true }`  
  **Résultat** : L'event est quand même modifié (Expected: 'Event Test', Received: 'New Event')

#### Analyse
Le code actuel fait :
```typescript
// 1. Merge agent + user
const finalChanges = {
  ...(proposal.changes as Record<string, any>),
  ...(proposal.userModifiedChanges ? ... : {})
}

// 2. Filtrer selectedChanges ET finalChanges
filteredSelectedChanges = filterChangesByApprovedBlocks(selectedChanges, approvedBlocks)
filteredFinalChanges = filterChangesByApprovedBlocks(finalChanges, approvedBlocks)

// 3. Passer aux fonctions apply*
await applyEditionUpdate(editionId, filteredFinalChanges, filteredSelectedChanges, ...)
```

**MAIS** la fonction `filterChangesByApprovedBlocks()` ne filtre que les **clés de premier niveau** :
```typescript
for (const [field, value] of Object.entries(selectedChanges)) {
  const block = getBlockForField(field)  // 'races', 'edition', 'event'
  
  if (approvedBlocks[block] === true) {
    filteredChanges[field] = value  // ⚠️ Copie TOUT l'objet value
  }
}
```

Si `field = 'races'`, elle copie **tout** l'objet `value = { toUpdate: [...], toAdd: [...] }` sans distinction.

Ensuite, dans `applyEditionUpdate()`, le code traite :
- `filteredFinalChanges.races.toUpdate` → applique les mises à jour
- `filteredFinalChanges.races.toAdd` → ajoute les courses
- `filteredFinalChanges.name` → met à jour l'event

Si `approvedBlocks.races = false`, alors `filteredFinalChanges.races` sera `undefined`, mais :
- `filteredFinalChanges.name` existera toujours si `approvedBlocks.event = true`
- Le problème est que dans les fonctions apply*, on accède directement à `changes.name`, `changes.city`, etc.

**Exemple concret** :

Test "should apply only approved blocks":
```
approvedBlocks = { event: true, edition: true, races: false }
changes = {
  name: { old: 'Trail Original', new: 'Trail Modifié' },  // Event
  startDate: { old: ..., new: ... },                      // Edition
  races: { toUpdate: [...] }                              // Races
}
```

Après filtrage :
```
filteredFinalChanges = {
  name: { old: 'Trail Original', new: 'Trail Modifié' },  // ✅ event approuvé
  startDate: { old: ..., new: ... },                      // ✅ edition approuvé
  // races: undefined                                      // ✅ races pas approuvé
}
```

**Ça devrait marcher !** Mais pourquoi la course est quand même modifiée ?

#### Hypothèse
Le problème doit être dans `applyEditionUpdate()`. Même si `filteredFinalChanges.races` est `undefined`, le code essaie peut-être d'accéder à `changes.races` directement (paramètre non filtré) quelque part.

### 4. ❌ userModifiedChanges ne sont pas appliqués

#### Symptômes
- Test "should override agent proposal with user modification":  
  Agent propose `runDistance: 10`, user modifie en `12`  
  **Résultat** : 10 appliqué au lieu de 12

#### Structure des données
```typescript
// Agent (proposal.changes)
{
  races: {
    toUpdate: [{
      raceId: 123,
      raceName: '10km',
      updates: { runDistance: { old: 10, new: 10 } }
    }]
  }
}

// User (proposal.userModifiedChanges)
{
  races: {
    "123": {  // ⚠️ Clé = raceId (string)
      runDistance: 12
    }
  }
}
```

**Problème** : Les deux structures sont **incompatibles**. On ne peut PAS faire un simple merge.

Le merge actuel fait :
```typescript
const finalChanges = {
  ...proposal.changes,
  ...proposal.userModifiedChanges
}
// Résultat :
{
  races: {  // ⚠️ Écrasement complet !
    "123": { runDistance: 12 }
  }
}
```

L'objet `races.toUpdate` de l'agent est **écrasé** par l'objet `races[raceId]` du user. Le code dans `applyEditionUpdate()` cherche `races.toUpdate` et ne le trouve pas.

## Solutions proposées

### Option A : Refactoring profond (complexe)
Changer la logique pour que `userModifiedChanges` et `changes` utilisent la même structure.

**Pros** : Propre, maintenable  
**Cons** : Nécessite refactoring de tout le frontend + backend  

### Option B : Merge intelligent (pragmatique)
Au lieu de faire `{ ...changes, ...userModifiedChanges }`, implémenter une fonction `mergeChangesIntelligently()` qui :
1. Garde la structure de `changes` (toUpdate, toAdd, etc.)
2. Applique les modifications de `userModifiedChanges` **dans** cette structure

**Exemple** :
```typescript
// Input
changes = { races: { toUpdate: [{ raceId: 123, updates: { runDistance: { old: 10, new: 10 } } }] } }
userModifiedChanges = { races: { "123": { runDistance: 12 } } }

// Output après merge intelligent
{
  races: {
    toUpdate: [{
      raceId: 123,
      updates: { runDistance: { old: 10, new: 12 } }  // ✅ Valeur user appliquée
    }]
  }
}
```

**Pros** : Fix minimal, respecte les structures existantes  
**Cons** : Logique de merge complexe

### Option C : Appliquer userModifiedChanges dans applyEditionUpdate() (actuel)
Le code actuel essaie déjà de faire ça dans `applyEditionUpdate()` (lignes 566-616, 751-811).

**Problème** : Le code lit `proposal.userModifiedChanges` directement, mais :
1. Le paramètre `proposal` n'est passé qu'à `applyEditionUpdate()`, pas à `applyEventUpdate()`
2. Si `filteredFinalChanges.races` est `undefined` (bloc non approuvé), le code ne traite jamais les races

## Plan d'action

### Étape 1 : Vérifier le vrai problème
Ajouter des logs pour voir :
- Que contient `filteredFinalChanges` après filtrage ?
- Est-ce que `applyEditionUpdate()` reçoit bien les bonnes données ?
- Quelle fonction modifie la course alors qu'elle ne devrait pas ?

### Étape 2 : Fix du filtrage
Si le filtrage est correct mais que la course est quand même modifiée, alors le problème est dans `applyEditionUpdate()` qui accède à des données non filtrées.

### Étape 3 : Fix des userModifiedChanges
Implémenter Option B (merge intelligent) dans `applyProposal()` avant le filtrage.

## Prochaines actions
1. Ajouter des logs dans proposal-domain.service.ts
2. Relancer les tests avec logs
3. Identifier précisément où ça échoue
4. Appliquer les fixes
