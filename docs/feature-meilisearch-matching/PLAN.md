# Plan : Intégration Meilisearch dans le Matcher d'événements

## Objectif

Remplacer la recherche SQL dans `findCandidateEvents()` par une recherche Meilisearch pour améliorer la qualité du matching, notamment pour les cas comme "Brooks Marathon Annecy" → "Marathon du lac d'Annecy" (événement 2642).

## Contexte

### Problème actuel
- La recherche SQL utilise des `ILIKE` sur les mots du nom → ne trouve pas toujours les bons candidats
- L'apostrophe dans "d'Annecy" crée des problèmes de matching avec "annecy"
- 3 passes SQL séquentielles = lent et parfois incomplet

### Solution Meilisearch
- Meilisearch gère nativement le fuzzy search et la tokenization ("d'annecy" → "d" + "annecy")
- Test : recherche "marathon annecy" retourne l'événement 2642 en **premier résultat**
- `MeilisearchService` existe déjà dans `@data-agents/database`

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         matchEvent()                            │
│  1. Normalise input                                             │
│  2. Appelle findCandidateEvents() avec config Meilisearch       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    findCandidateEvents()                        │
│                                                                 │
│  ┌─── Si meilisearchConfig fourni ───┐                         │
│  │                                    │                         │
│  │  1. Recherche via Meilisearch     │                         │
│  │  2. Enrichir avec éditions Prisma │                         │
│  │  3. Si échec → fallback SQL       │                         │
│  └────────────────────────────────────┘                         │
│                                                                 │
│  ┌─── Sinon ou fallback ─────────────┐                         │
│  │  SQL 3 passes (existant)          │                         │
│  └────────────────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

## Fichiers à modifier

### 1. Types - `packages/agent-framework/src/services/event-matching/types.ts`

Ajouter l'interface de configuration Meilisearch :

```typescript
export interface MeilisearchMatchingConfig {
  url: string
  apiKey: string
  indexName?: string  // default: 'fra_events'
}

// Modifier MatchingConfig existant
export interface MatchingConfig {
  similarityThreshold: number
  distanceTolerancePercent?: number
  confidenceBase?: number
  meilisearch?: MeilisearchMatchingConfig  // NOUVEAU
}
```

### 2. Matcher principal - `packages/agent-framework/src/services/event-matching/event-matcher.ts`

- Ajouter import `getMeilisearchService` depuis `@data-agents/database`
- Ajouter fonction `findCandidatesViaMeilisearch()`
- Ajouter fonction `enrichCandidatesWithEditions()`
- Modifier `findCandidateEvents()` pour utiliser Meilisearch si configuré
- Modifier `matchEvent()` pour passer la config

### 3. Exports - `packages/agent-framework/src/services/event-matching/index.ts`

Exporter le nouveau type `MeilisearchMatchingConfig`

### 4. Callers

- `apps/api/src/services/slack/SlackProposalService.ts`
- `apps/api/src/routes/proposals.ts` (endpoint check-existing-event)
- `apps/agents/src/ffa/matcher.ts`
- `apps/agents/src/FFAScraperAgent.ts`

## Configuration Meilisearch

| Contexte | Source de config | Comment |
|----------|------------------|---------|
| **API** | `settingsService` | `await settingsService.getMeilisearchUrl()` |
| **Agents** | Variables d'env | `MEILISEARCH_URL`, `MEILISEARCH_API_KEY` |

## Tests

### Tests existants (backward compatible)

| Fichier | Impact |
|---------|--------|
| `event-matcher.test.ts` (27 tests) | ✅ Continueront à fonctionner (fallback SQL) |
| `match-races.test.ts` (11 tests) | ✅ Aucun impact |
| `matcher.race-hybrid.test.ts` (3 tests) | ✅ Aucun impact |

### Nouveaux tests à ajouter

- Test Meilisearch avec config
- Test fallback quand Meilisearch échoue
- Test enrichissement des éditions

## Ordre d'implémentation

1. Créer la branche `feature/meilisearch-matching`
2. Créer la documentation dans `docs/feature-meilisearch-matching/`
3. Modifier `types.ts`
4. Modifier `event-matcher.ts`
5. Modifier `index.ts`
6. Ajouter les tests Meilisearch
7. Modifier les callers
8. Vérifier que les tests existants passent
9. Tester manuellement
10. Rédiger `IMPLEMENTATION.md`
11. Mettre à jour `CLAUDE.md`
12. Commiter et créer PR
