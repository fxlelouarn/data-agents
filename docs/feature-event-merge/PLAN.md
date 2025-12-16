# Plan : Fusion d'événements (Event Merge)

## Résumé

Ajouter une fonctionnalité permettant de fusionner deux événements doublons. L'utilisateur sélectionne deux événements via Meilisearch, choisit lequel conserver, et le système crée une proposition pour :
1. Stocker l'ID du doublon dans `oldSlugId` de l'événement conservé (pour redirections)
2. Marquer l'événement doublon avec `status = DELETED`
3. Optionnellement renommer l'événement conservé

## Décisions de conception

| Question | Décision |
|----------|----------|
| `oldSlugId` unique | Garder le comportement actuel (un seul oldSlugId par événement) |
| Éditions du doublon | Ne pas toucher (restent liées à l'événement DELETED) |
| Agent automatique | Non, interface manuelle uniquement pour V1 |
| Accès | Via dropdown "Nouvelle proposition" sur ProposalList |

---

## Phase 1 : Backend - Schéma et Types

### 1.1 Modifier l'enum ProposalType

**Fichier** : `packages/database/prisma/schema.prisma`

```prisma
enum ProposalType {
  NEW_EVENT
  EVENT_UPDATE
  EDITION_UPDATE
  RACE_UPDATE
  EVENT_MERGE  // NOUVEAU
}
```

### 1.2 Ajouter les types TypeScript

**Fichier** : `packages/types/src/database.ts`

Ajouter `EVENT_MERGE` à l'enum ProposalType TypeScript.

### 1.3 Migration Prisma

```bash
npm run db:generate
npm run db:migrate
```

---

## Phase 2 : Backend - Endpoint de création

### 2.1 Nouvel endpoint POST /api/proposals/merge

**Fichier** : `apps/api/src/routes/proposals.ts`

```typescript
// POST /api/proposals/merge
router.post('/merge', async (req, res) => {
  const { keepEventId, duplicateEventId, newEventName, reason } = req.body

  // 1. Valider que les deux événements existent
  // 2. Vérifier que keepEvent n'a pas déjà un oldSlugId
  // 3. Créer la proposition avec type EVENT_MERGE
})
```

### 2.2 Endpoint GET pour récupérer les infos d'un événement

**Fichier** : `apps/api/src/routes/events.ts`

```typescript
// GET /api/events/:id/details
// Retourne l'événement avec ses éditions
```

---

## Phase 3 : Backend - Application de la fusion

### 3.1 Ajouter applyEventMerge dans ProposalDomainService

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

```typescript
async applyEventMerge(changes, options): Promise<ProposalApplicationResult> {
  // 1. Mettre à jour keepEvent avec oldSlugId = duplicateEventId
  // 2. Optionnellement renommer keepEvent
  // 3. Marquer duplicateEvent avec status = DELETED
}
```

---

## Phase 4 : Frontend - Page de création

### 4.1 Nouvelle page EventMerge.tsx

**Fichier** : `apps/dashboard/src/pages/EventMerge.tsx`

Structure :
- Deux colonnes avec recherche Meilisearch
- Affichage des infos événement + nombre d'éditions
- Toggle pour choisir quel événement conserver
- Heuristique : suggérer celui avec le plus d'éditions
- Champ optionnel pour renommer
- Bouton "Créer la proposition"

### 4.2 Hooks

- `useEventDetails(eventId)` : Récupérer les détails d'un événement
- `useCreateMergeProposal()` : Créer la proposition de fusion

---

## Phase 5 : Frontend - Intégration

### 5.1 Modifier ProposalList dropdown

Ajouter option "Fusionner des doublons" dans le menu "Nouvelle proposition"

### 5.2 Ajouter route

```tsx
<Route path="/events/merge" element={<EventMerge />} />
```

---

## Phase 6 : Frontend - Vue détail

### 6.1 Composant EventMergeDetail.tsx

Affiche :
- Les deux événements côte à côte (conservé vs doublon)
- Le résultat attendu de la fusion
- Boutons Approuver / Rejeter / Archiver

### 6.2 Intégrer dans ProposalDetailDispatcher

```tsx
case 'EVENT_MERGE':
  return <EventMergeDetail proposal={proposal} />
```

### 6.3 Ajouter les constantes

Labels et styles pour EVENT_MERGE dans `constants/proposals.ts`

---

## Flux ProposalApplication

Le flux pour EVENT_MERGE suit exactement le même pattern que les autres types :

```
1. POST /api/proposals/merge
   → Crée Proposal (type: EVENT_MERGE, status: PENDING)

2. PUT /api/proposals/:id (status: APPROVED)
   → Crée ProposalApplication (status: PENDING)
   → L'application apparaît dans /updates

3. POST /api/updates/:id/apply (depuis UpdateList/UpdateDetail)
   → ProposalDomainService.applyProposal()
   → case 'EVENT_MERGE': applyEventMerge()
   → ProposalApplication.status = APPLIED
```

---

## Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `packages/database/prisma/schema.prisma` | Ajouter `EVENT_MERGE` à ProposalType |
| `packages/types/src/database.ts` | Ajouter `EVENT_MERGE` à l'enum TS |
| `apps/api/src/routes/proposals.ts` | Ajouter endpoint `POST /merge` |
| `apps/api/src/routes/events.ts` | Ajouter endpoint `GET /:id/details` |
| `packages/database/src/services/proposal-domain.service.ts` | Ajouter `applyEventMerge()` |
| `apps/dashboard/src/pages/EventMerge.tsx` | **Créer** - Page de fusion |
| `apps/dashboard/src/hooks/useApi.ts` | Ajouter hooks |
| `apps/dashboard/src/pages/ProposalList.tsx` | Modifier dropdown |
| `apps/dashboard/src/App.tsx` | Ajouter route `/events/merge` |
| `apps/dashboard/src/pages/proposals/detail/event-merge/EventMergeDetail.tsx` | **Créer** |
| `apps/dashboard/src/pages/proposals/ProposalDetailDispatcher.tsx` | Ajouter case |
| `apps/dashboard/src/constants/proposals.ts` | Ajouter labels et styles |
| `apps/dashboard/src/types/index.ts` | Ajouter EVENT_MERGE au type |

---

## Validation

### Scénario de test

1. Aller sur `/proposals`
2. Cliquer "Nouvelle proposition" → "Fusionner des doublons"
3. Rechercher et sélectionner deux événements
4. Vérifier que l'heuristique suggère le bon événement à conserver
5. Optionnellement modifier le nom
6. Créer la proposition
7. Vérifier la proposition dans la liste
8. Approuver la proposition
9. Appliquer la proposition
10. Vérifier en base : `oldSlugId` rempli, doublon `DELETED`

### Cas d'erreur à tester

- Événement conservé a déjà un `oldSlugId` → message d'erreur
- Même événement sélectionné deux fois → bloquer
- Événement non trouvé → erreur 404
