# Plan: Unifier la logique de suppression des courses

## Contexte

### Problème identifié (Event 1108 - Rotatrail)

Lors de l'application d'une ProposalApplication pour l'événement 1108, les suppressions de courses ont été exécutées deux fois par deux chemins différents :

```
🗑️  Suppression de 2 course(s) (via raceEdits._deleted)
  ✅ Course 151163 supprimée
  ✅ Course 151165 supprimée
...
🗑️  Suppression de 2 course(s) de l'édition 42592
  ✅ Course 151163 supprimée
  ✅ Course 151165 supprimée
```

### Root cause

Il existe **4 chemins différents** pour supprimer des courses dans `proposal-domain.service.ts` :

1. **`racesToDelete` au niveau racine** (lignes 563-583) : Extrait depuis `changes.racesToDelete`
2. **`races.toDelete` imbriqué** (lignes 540-551) : Extrait depuis `changes.races.toDelete`
3. **`raceEdits._deleted`** (lignes 1036-1045) : Extrait depuis `proposal.userModifiedChanges.raceEdits`
4. **Application dans deux sections** (lignes 1072 et 1145) : Les suppressions sont exécutées à deux endroits

## Objectif

Simplifier vers **un seul chemin unifié** :
- Consolider toutes les sources de `racesToDelete` en un seul Set dès le début
- Exécuter la suppression une seule fois, à un seul endroit
- Ordre d'exécution : DELETE → UPDATE → ADD

## Plan d'implémentation

### Phase 1 : Écriture des tests

Fichier : `apps/agents/src/__tests__/proposal-application/race-delete-unification.test.ts`

Tests à couvrir :
- Extraction depuis `changes.racesToDelete` (number[] et object[])
- Extraction depuis `changes.races.toDelete`
- Extraction depuis `userModifiedChanges.raceEdits._deleted`
- Déduplication (même course dans plusieurs sources)
- Ordre d'exécution DELETE → UPDATE → ADD

### Phase 2 : Refactoring

1. Créer `extractRacesToDelete()` qui consolide toutes les sources
2. Réorganiser l'ordre : DELETE d'abord, puis UPDATE, puis ADD
3. Supprimer le code dupliqué (sections lignes 1072-1089 et 1145-1161)

### Phase 3 : Vérification

- Tous les tests existants passent
- Les nouveaux tests passent
- Test manuel sur un cas groupé

## Fichiers à modifier

| Fichier | Modifications |
|---------|---------------|
| `packages/database/src/services/proposal-domain.service.ts` | Refactoring principal |
| `apps/agents/src/__tests__/proposal-application/race-delete-unification.test.ts` | Nouveau fichier de tests |
