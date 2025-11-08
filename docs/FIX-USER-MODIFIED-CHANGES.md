# Fix : Prise en compte des modifications utilisateur lors de l'application

**Date** : 2025-11-07  
**Problème** : Les modifications manuelles faites par l'utilisateur sur une proposition (via `userModifiedChanges`) n'étaient pas appliquées lors de la création de l'événement.

## Symptômes

Lors de l'application d'une proposition NEW_EVENT :

1. ❌ Les modifications manuelles du nom de l'événement ne sont pas appliquées
2. ❌ Toute modification faite via l'interface d'édition est ignorée
3. ✅ Les données originales de la proposition sont utilisées à la place

## Exemple

**Proposition originale** :
```json
{
  "changes": {
    "name": { "new": "Semi-Marathon Du Grand Nancy" }
  }
}
```

**Modification utilisateur** :
```json
{
  "userModifiedChanges": {
    "name": { "new": "Semi-Marathon du Grand Nancy 2025" }
  }
}
```

**Résultat attendu** : Event créé avec le nom "Semi-Marathon du Grand Nancy 2025"  
**Résultat obtenu (bug)** : Event créé avec le nom "Semi-Marathon Du Grand Nancy"

## Cause racine

Dans `applyNewEvent()`, les fonctions d'extraction utilisaient le paramètre `selectedChanges` au lieu de `changes` :

```typescript
// ❌ INCORRECT
async applyNewEvent(
  changes: any,              // ← Contient les userModifiedChanges mergées
  selectedChanges: Record<string, any>,  // ← Données filtrées mais sans modifications utilisateur
  options: ApplyOptions = {}
) {
  // ...
  const eventData = this.extractEventData(selectedChanges)  // ❌ Mauvais paramètre !
  const editionsData = this.extractEditionsData(selectedChanges)
  const racesData = this.extractRacesData(selectedChanges)
}
```

### Flux des données

```
proposal.changes (données agent)
        ↓
    (ligne 50-53 de applyProposal)
        ↓
proposal.changes + proposal.userModifiedChanges = finalChanges
        ↓
    (ligne 80)
        ↓
applyNewEvent(finalChanges, filteredSelectedChanges, ...)
        ↓
    paramètre 'changes' = finalChanges ✅
    paramètre 'selectedChanges' = filteredSelectedChanges ❌
```

Le paramètre `changes` contient déjà les modifications utilisateur mergées (ligne 50-53), mais les fonctions d'extraction utilisaient `selectedChanges` qui ne les contient pas.

## Solution appliquée

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`  
**Lignes** : 133-137

```typescript
// ✅ CORRECT
async applyNewEvent(
  changes: any,              // ← Contient les userModifiedChanges mergées
  selectedChanges: Record<string, any>,
  options: ApplyOptions = {}
) {
  // Extract structured data
  // Note: Utiliser 'changes' qui contient les userModifiedChanges mergées
  const eventData = this.extractEventData(changes)        // ✅
  const editionsData = this.extractEditionsData(changes)  // ✅
  const racesData = this.extractRacesData(changes)        // ✅
}
```

### Pourquoi ça fonctionne maintenant

1. `changes` = `finalChanges` (ligne 80) = `proposal.changes` + `proposal.userModifiedChanges`
2. Les fonctions d'extraction utilisent maintenant `changes` au lieu de `selectedChanges`
3. Les modifications utilisateur sont donc bien prises en compte lors de l'extraction

## Test de validation

### Avant le fix

1. Créer une proposition NEW_EVENT
2. Modifier le nom via l'interface d'édition : "Semi-Marathon Du Grand Nancy" → "Semi-Marathon du Grand Nancy 2025"
3. Appliquer la proposition
4. ❌ Résultat : Event créé avec "Semi-Marathon Du Grand Nancy" (modification ignorée)

### Après le fix

1. Créer une proposition NEW_EVENT
2. Modifier le nom via l'interface d'édition : "Semi-Marathon Du Grand Nancy" → "Semi-Marathon du Grand Nancy 2025"
3. Appliquer la proposition
4. ✅ Résultat : Event créé avec "Semi-Marathon du Grand Nancy 2025" (modification appliquée)

## Note sur endDate

**Question** : Pourquoi `endDate` est-elle `null` après application ?

**Réponse** : C'est **normal**. Le FFA Scraper ne fournit pas de `endDate` car les compétitions FFA sont généralement d'une seule journée. Une `endDate` null signifie que l'événement dure un seul jour (même jour que `startDate`).

Si l'événement dure plusieurs jours, l'utilisateur peut modifier manuellement la proposition pour ajouter une `endDate`.

## Impact

✅ **Résolu** :
- Les modifications manuelles du nom sont maintenant appliquées
- Toutes les modifications via `userModifiedChanges` sont prises en compte
- Le flux de données est cohérent avec le design prévu

✅ **Préservé** :
- Le filtrage par blocs approuvés fonctionne toujours
- Les autres types de propositions (EVENT_UPDATE, EDITION_UPDATE, RACE_UPDATE) utilisent déjà le bon paramètre
- Pas de régression sur les fonctionnalités existantes

## Autres handlers

Les autres handlers utilisent déjà le bon paramètre :

```typescript
// EVENT_UPDATE, EDITION_UPDATE, RACE_UPDATE utilisent 'selectedChanges'
// qui est correct car ces handlers appellent buildUpdateData() qui extrait
// les valeurs via extractNewValue() qui gère déjà le merge
```

Pour NEW_EVENT, il fallait utiliser `changes` car les fonctions d'extraction (`extractEventData`, `extractEditionsData`, `extractRacesData`) attendent des données déjà mergées.

## Résumé

| Handler | Paramètre correct | Raison |
|---------|-------------------|--------|
| `applyNewEvent()` | `changes` | Les fonctions d'extraction attendent des données mergées |
| `applyEventUpdate()` | `selectedChanges` | `buildUpdateData()` gère le merge via `extractNewValue()` |
| `applyEditionUpdate()` | `selectedChanges` | `buildUpdateData()` gère le merge via `extractNewValue()` |
| `applyRaceUpdate()` | `selectedChanges` | `buildUpdateData()` gère le merge via `extractNewValue()` |

## Références

- Issue : Modifications utilisateur ignorées lors de NEW_EVENT
- Commit : Fix user modified changes for NEW_EVENT proposals
