# Tests: Unification de la logique de suppression des courses

**Date**: 2025-12-17  
**Branche**: `fix/unify-races-delete-logic`

## Fichier de test créé

`apps/agents/src/__tests__/proposal-application/race-delete-unification.test.ts`

## Prérequis

Ces tests d'intégration nécessitent :
- Base de données PostgreSQL locale
- Variables d'environnement configurées :
  - `DATABASE_URL` ou `DATABASE_TEST_URL`
  - `MILES_REPUBLIC_DATABASE_URL` ou `MILES_REPUBLIC_TEST_DATABASE_URL`

## Catégories de tests

### 1. Extraction de racesToDelete depuis différentes sources

| Test | Description | Statut |
|------|-------------|--------|
| `should delete races from changes.racesToDelete (number[] format)` | Format tableau de nombres | ✅ |
| `should delete races from changes.racesToDelete (object[] format)` | Format tableau d'objets | ✅ |
| `should delete races from changes.races.toDelete` | Structure imbriquée | ✅ |
| `should delete races from userModifiedChanges.raceEdits._deleted (numeric key)` | Clé numérique directe | ✅ |
| `should delete races from userModifiedChanges.raceEdits._deleted (existing-index key)` | Clé existing-{index} | ✅ |

### 2. Déduplication des suppressions

| Test | Description | Statut |
|------|-------------|--------|
| `should delete race only once when present in multiple sources` | Évite les suppressions en double | ✅ |
| `should consolidate racesToDelete from all sources` | Fusion de toutes les sources | ✅ |

### 3. Ordre d'exécution DELETE → UPDATE → ADD

| Test | Description | Statut |
|------|-------------|--------|
| `should not update races that are marked for deletion` | Les courses supprimées ne sont pas mises à jour | ✅ |
| `should delete races before adding new ones to avoid duplicates` | Évite les doublons (bug Event 1108) | ✅ |

### 4. Cas limites

| Test | Description | Statut |
|------|-------------|--------|
| `should handle invalid raceId gracefully` | Gestion des IDs invalides (NaN, null, string) | ✅ |
| `should handle empty racesToDelete array` | Tableau vide | ✅ |
| `should handle racesToDelete with string IDs` | IDs en format string | ✅ |

## Exécution des tests

### Depuis la racine du projet (avec base de données configurée)

```bash
# Charger les variables d'environnement
export $(cat .env.local | grep -v '^#' | xargs)

# Exécuter les tests
npx jest --config apps/agents/jest.config.js \
  --testPathIgnorePatterns='/node_modules/' \
  --testMatch='**/__tests__/proposal-application/race-delete-unification.test.ts' \
  --no-coverage
```

### Note sur l'exclusion par défaut

Le répertoire `proposal-application/` est exclu par défaut dans `jest.config.js` car ces tests nécessitent une base de données :

```javascript
testPathIgnorePatterns: [
  '/node_modules/',
  '\\.integration\\.test\\.ts$',
  'proposal-application/',  // ← Exclus par défaut
  'auto-validator/integration'
]
```

## Tests existants validés

Les tests existants qui couvrent les opérations sur les courses passent tous :

| Fichier | Tests | Statut |
|---------|-------|--------|
| `race-operations.test.ts` | 21 | ✅ Passent |
| `user-race-edits.test.ts` | Tests suppression via `_deleted` | ✅ Passent |

## Validation manuelle recommandée

Avant déploiement en production, tester manuellement :

1. **Proposition groupée avec suppressions** :
   - Créer une proposition groupée (2+ agents)
   - Marquer des courses comme supprimées dans l'interface
   - Valider le bloc "races"
   - Vérifier que chaque course n'est supprimée qu'une seule fois dans les logs

2. **Proposition avec suppression ET mise à jour** :
   - Avoir une course à supprimer ET une course à modifier
   - Vérifier que la course supprimée n'est pas mise à jour avant suppression

3. **Proposition avec suppression ET ajout** :
   - Supprimer une course existante
   - Ajouter une nouvelle course avec le même nom
   - Vérifier qu'il n'y a pas de doublon
