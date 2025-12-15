# Implementation: Meilisearch Matching Integration

## Vue d'ensemble

Cette feature intègre Meilisearch dans le système de matching d'événements pour améliorer la qualité de la recherche de candidats. Meilisearch est utilisé en priorité lorsqu'il est configuré, avec un fallback automatique vers SQL en cas d'échec.

## Problème résolu

Le matching SQL avec `ILIKE` ne trouvait pas toujours les bons événements candidats, notamment :
- Les apostrophes dans les noms (ex: "d'Annecy" vs "annecy")
- Les variations de noms avec sponsors (ex: "Brooks Marathon Annecy" → "Marathon du lac d'Annecy")
- La recherche 3 passes SQL était lente et parfois incomplète

**Cas concret résolu** : La proposition `new-event-cmj62pggw001hlw21wvhwrebe` pour "Brooks Marathon Annecy 2026" ne matchait pas avec l'événement 2642 "Marathon du lac d'Annecy" car l'apostrophe dans "d'Annecy" n'était pas correctement tokenisée.

## Architecture

```
                    matchEvent()
                        │
                        ▼
              findCandidateEvents()
                        │
        ┌───────────────┴───────────────┐
        │ meilisearchConfig fourni ?    │
        │                               │
        ▼ OUI                           ▼ NON
  ┌─────────────────┐           ┌─────────────────┐
  │ findCandidates  │           │ SQL 3 passes    │
  │ ViaMeilisearch()│           │ (existant)      │
  └────────┬────────┘           └─────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ enrichCandidates    │
  │ WithEditions()      │  ← Prisma: récupère éditions
  └────────┬────────────┘
           │
           ▼
    Candidats enrichis
           │
           ▼ Si 0 résultats
    Fallback SQL ────────►
```

## Fichiers modifiés

### Package agent-framework

| Fichier | Changements |
|---------|-------------|
| `types.ts` | Ajout interface `MeilisearchMatchingConfig` |
| `event-matcher.ts` | Fonctions `findCandidatesViaMeilisearch()` et `enrichCandidatesWithEditions()`, modification de `findCandidateEvents()` et `matchEvent()` |
| `index.ts` | Export de `MeilisearchMatchingConfig` |

### Apps API

| Fichier | Changements |
|---------|-------------|
| `SlackProposalService.ts` | Récupère config Meilisearch via `settingsService`, passe à `matchEvent()` |
| `proposals.ts` | Endpoint `check-existing-event`: récupère config Meilisearch, passe à `matchEvent()` |

### Apps Agents

| Fichier | Changements |
|---------|-------------|
| `ffa/matcher.ts` | `matchCompetition()` accepte paramètre optionnel `meilisearchConfig` |
| `FFAScraperAgent.ts` | Lit `MEILISEARCH_URL` et `MEILISEARCH_API_KEY` depuis env, passe à `matchCompetition()` |

## Configuration

### API (SlackProposalService, check-existing-event)

Configuration via `settingsService` (table Settings en base) :
- `meilisearchUrl` : URL du serveur Meilisearch
- `meilisearchApiKey` : Clé API Meilisearch

### Agents (FFAScraperAgent)

Configuration via variables d'environnement :
- `MEILISEARCH_URL` : URL du serveur Meilisearch
- `MEILISEARCH_API_KEY` : Clé API Meilisearch

### Index Meilisearch

Index utilisé : `fra_events` (défaut)

Champs utilisés :
- `objectID` : ID de l'événement
- `eventName` : Nom de l'événement
- `eventCity` : Ville
- `eventSlug` : Slug URL
- `eventCountrySubdivisionDisplayCodeLevel2` : Code département

## Fonctionnement détaillé

### 1. findCandidatesViaMeilisearch()

```typescript
async function findCandidatesViaMeilisearch(
  searchQuery: string,
  config: MeilisearchMatchingConfig,
  logger: MatchingLogger
): Promise<CandidateEvent[]>
```

- Appelle `getMeilisearchService()` avec URL et API key
- Exécute `searchEvents()` avec la query (nom + ville)
- Limite à 100 résultats
- Retourne les candidats au format standardisé

### 2. enrichCandidatesWithEditions()

```typescript
async function enrichCandidatesWithEditions(
  candidates: CandidateEvent[],
  date: Date,
  sourceDb: any,
  logger: MatchingLogger
): Promise<CandidateEvent[]>
```

- Convertit les IDs string en numbers pour Prisma
- Requête `edition.findMany()` avec fenêtre ±90 jours
- Groupe les éditions par eventId
- Enrichit chaque candidat avec ses éditions

### 3. Fallback SQL

Si Meilisearch :
- N'est pas configuré
- Échoue avec une erreur
- Retourne 0 résultats

→ Fallback automatique vers la recherche SQL 3 passes existante

## Tests

### Tests unitaires ajoutés

Fichier : `event-matcher.meilisearch.test.ts`

| Test | Description |
|------|-------------|
| `devrait utiliser Meilisearch pour trouver les candidats` | Vérifie l'appel à Meilisearch |
| `devrait enrichir les résultats avec les éditions Prisma` | Vérifie l'enrichissement |
| `devrait fallback vers SQL si Meilisearch échoue` | Vérifie le fallback erreur |
| `devrait fallback vers SQL si Meilisearch retourne 0 résultats` | Vérifie le fallback vide |
| `devrait utiliser uniquement SQL si meilisearch non configuré` | Vérifie le mode sans config |
| `Cas réel: Brooks Marathon Annecy` | Vérifie le cas d'usage principal |

### Tests existants

Tous les tests existants passent sans modification car :
- Ils ne passent pas de `meilisearchConfig` → fallback SQL utilisé
- Le mock `sourceDb` reste valide pour le fallback SQL

## Backward compatibility

- **100% backward compatible** : si `meilisearchConfig` n'est pas fourni, comportement identique à avant
- Les callers existants qui ne passent pas la config Meilisearch continuent de fonctionner
- Aucune migration nécessaire

## Performance

- Meilisearch est plus rapide que les 3 passes SQL pour les grandes bases
- L'enrichissement éditions ajoute une requête Prisma supplémentaire
- Le fallback SQL garantit la disponibilité en cas de problème Meilisearch

## Variables d'environnement

```bash
# Production (.env.prod)
MEILISEARCH_URL=https://miles-meilisearch.onrender.com
MEILISEARCH_API_KEY=92ffbb85d2e5d907d0c228a472b34e0b34ac21a33a09e1262cb8b24887ccec1b

# Développement (.env.local - optionnel)
MEILISEARCH_URL=https://miles-meilisearch.onrender.com
MEILISEARCH_API_KEY=92ffbb85d2e5d907d0c228a472b34e0b34ac21a33a09e1262cb8b24887ccec1b
```
