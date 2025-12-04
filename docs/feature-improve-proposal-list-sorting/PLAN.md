# Feature: Tri global des propositions côté serveur

## Problème

Le tri des propositions dans la page `ProposalList` était effectué **côté client** sur les données déjà paginées par le serveur. Cela signifiait que le tri par `startDate` ne s'appliquait qu'à la page courante (50 propositions) et non à l'ensemble des propositions.

### Exemple du problème

```
Page 1 (50 propositions): triées par startDate ✓
Page 2 (50 propositions): triées par startDate ✓
MAIS: une proposition de la page 2 avec startDate proche
      n'apparaissait jamais en premier !
```

## Solution

Implémenter le tri **côté serveur** avec une colonne dénormalisée `proposedStartDate`.

### Pourquoi une colonne dénormalisée ?

1. **Performance** : Le tri sur une colonne indexée est O(n log n) vs parsing JSON à chaque requête
2. **Simplicité** : Prisma supporte nativement `orderBy` sur les colonnes
3. **Nulls handling** : PostgreSQL gère nativement `NULLS LAST`

## Implémentation

### 1. Migration Prisma

```prisma
model Proposal {
  // ... autres champs
  proposedStartDate DateTime?  // Nouveau champ dénormalisé
}
```

### 2. Script de backfill

Script `packages/database/scripts/backfill-proposed-start-date.ts` pour remplir les propositions existantes.

### 3. Extraction automatique à la création

Modification de `ProposalService.createProposal()` pour extraire `proposedStartDate` depuis:
- `changes.startDate` (format `{ old, new }` ou direct)
- `changes.edition.new.startDate` (structure NEW_EVENT)
- `changes.edition.startDate`

### 4. Endpoint API

Nouveau paramètre `sort` dans `GET /api/proposals`:
- `date-asc` : startDate proche en premier
- `date-desc` : startDate éloignée en premier
- `created-desc` : createdAt récent en premier (défaut)

### 5. Frontend

- Hook `useProposals` accepte le paramètre `sort`
- `ProposalList` passe `groupSort` au hook
- Tri côté client supprimé (préservation de l'ordre serveur)

## Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `packages/database/prisma/schema.prisma` | +1 champ `proposedStartDate` |
| `packages/database/scripts/backfill-proposed-start-date.ts` | **Nouveau** script de backfill |
| `packages/database/src/services/ProposalService.ts` | Extraction automatique startDate |
| `packages/database/src/repositories/proposal.repository.ts` | Type `proposedStartDate` |
| `apps/api/src/routes/proposals.ts` | Paramètre `sort` + orderBy dynamique |
| `apps/dashboard/src/services/api.ts` | Paramètre `sort` |
| `apps/dashboard/src/hooks/useApi.ts` | Paramètre `sort` dans queryKey |
| `apps/dashboard/src/pages/ProposalList.tsx` | Suppression tri client |

## Test

1. Lancer le backfill: `cd packages/database && npx tsx scripts/backfill-proposed-start-date.ts`
2. Vérifier l'API: `curl "http://localhost:4000/api/proposals?sort=date-asc&limit=10"`
3. Vérifier le dashboard: changer le tri et paginer
