# Implementation : Fusion d'événements (Event Merge)

## Vue d'ensemble

Cette fonctionnalité permet de fusionner deux événements doublons dans Miles Republic. L'événement "doublon" est marqué comme DELETED et son ID est stocké dans `oldSlugId` de l'événement conservé pour permettre les redirections.

### Fonctionnalités principales

1. **Fusion de base** : L'événement doublon est marqué DELETED, son ID devient l'`oldSlugId` de l'événement conservé
2. **Copie des éditions manquantes** : Les éditions du doublon qui n'existent pas (par année) sur l'événement conservé sont automatiquement copiées avec leurs courses
3. **Renommage optionnel** : Possibilité de renommer l'événement conservé lors de la fusion
4. **Gestion des redirections existantes** : Support du forceOverwrite si l'événement conservé a déjà une redirection

---

## Backend

### 1. Schema Prisma

**Fichier** : `packages/database/prisma/schema.prisma`

```prisma
enum ProposalType {
  NEW_EVENT
  EVENT_UPDATE
  EDITION_UPDATE
  RACE_UPDATE
  EVENT_MERGE  // Ajouté
}
```

### 2. Types TypeScript

**Fichier** : `packages/types/src/database.ts`

```typescript
export enum ProposalType {
  NEW_EVENT = 'NEW_EVENT',
  EVENT_UPDATE = 'EVENT_UPDATE',
  EDITION_UPDATE = 'EDITION_UPDATE',
  RACE_UPDATE = 'RACE_UPDATE',
  EVENT_MERGE = 'EVENT_MERGE',  // Ajouté
}
```

**Fichier** : `apps/dashboard/src/types/index.ts`

```typescript
export type ProposalType = 'NEW_EVENT' | 'EVENT_UPDATE' | 'EDITION_UPDATE' | 'RACE_UPDATE' | 'EVENT_MERGE'
```

### 3. Endpoint POST /api/proposals/merge

**Fichier** : `apps/api/src/routes/proposals.ts`

**Paramètres** :
- `keepEventId` (required) : ID de l'événement à conserver
- `duplicateEventId` (required) : ID de l'événement doublon à supprimer
- `newEventName` (optional) : Nouveau nom pour l'événement conservé
- `reason` (optional) : Justification de la fusion
- `forceOverwrite` (optional) : Force l'écrasement si oldSlugId existe déjà
- `copyMissingEditions` (optional, default: true) : Copier les éditions manquantes du doublon

```typescript
router.post('/merge', async (req, res) => {
  const { keepEventId, duplicateEventId, newEventName, reason, forceOverwrite, copyMissingEditions = true } = req.body

  // Validations
  if (!keepEventId || !duplicateEventId) {
    return res.status(400).json({ error: 'keepEventId et duplicateEventId sont requis' })
  }

  if (keepEventId === duplicateEventId) {
    return res.status(400).json({ error: 'Impossible de fusionner un événement avec lui-même' })
  }

  // Vérifier que les événements existent
  const sourceDb = await dbManager.connectToSource('MILES_REPUBLIC')
  const keepEvent = await sourceDb.event.findUnique({
    where: { id: keepEventId },
    include: { editions: true }
  })
  const duplicateEvent = await sourceDb.event.findUnique({
    where: { id: duplicateEventId },
    include: { editions: true }
  })

  if (!keepEvent) {
    return res.status(404).json({ error: `Événement à conserver non trouvé (ID: ${keepEventId})` })
  }
  if (!duplicateEvent) {
    return res.status(404).json({ error: `Événement doublon non trouvé (ID: ${duplicateEventId})` })
  }

  // Vérifier si keepEvent a déjà un oldSlugId
  if (keepEvent.oldSlugId) {
    // Vérifier si cet oldSlugId correspond à un événement existant
    const existingRedirectEvent = await sourceDb.event.findUnique({
      where: { id: keepEvent.oldSlugId },
      select: { id: true, name: true }
    })

    if (existingRedirectEvent && !forceOverwrite) {
      // L'oldSlugId pointe vers un événement existant - demander confirmation
      return res.status(400).json({
        error: `L'événement "${keepEvent.name}" a déjà une redirection vers "${existingRedirectEvent.name}" (ID: ${keepEvent.oldSlugId}). Utilisez forceOverwrite: true pour écraser.`,
        code: 'ALREADY_HAS_REDIRECT',
        details: {
          existingRedirect: {
            oldSlugId: keepEvent.oldSlugId,
            eventExists: true,
            eventName: existingRedirectEvent.name
          },
          canForce: true
        }
      })
    }
    // Si l'événement n'existe pas (orphelin) ou forceOverwrite=true, on continue
  }

  // Créer la proposition
  const changes = {
    merge: {
      keepEventId,
      keepEventName: keepEvent.name,
      keepEventCity: keepEvent.city,
      keepEventEditionsCount: keepEvent.editions.length,
      duplicateEventId,
      duplicateEventName: duplicateEvent.name,
      duplicateEventCity: duplicateEvent.city,
      duplicateEventEditionsCount: duplicateEvent.editions.length,
      newEventName: newEventName || null,
      // Ajouter info si on a forcé l'écrasement
      ...(keepEvent.oldSlugId && forceOverwrite && {
        forceOverwrite: true,
        previousOldSlugId: keepEvent.oldSlugId
      })
    }
  }

  // Récupérer ou créer l'agent "Manual Actions"
  let manualAgent = await db.prisma.agent.findFirst({ where: { name: 'Manual Actions' } })
  if (!manualAgent) {
    manualAgent = await db.prisma.agent.create({
      data: {
        name: 'Manual Actions',
        type: 'EXTRACTOR',
        isActive: true,
        frequency: {},
        config: {}
      }
    })
  }

  const proposal = await db.prisma.proposal.create({
    data: {
      agentId: manualAgent.id,
      type: 'EVENT_MERGE',
      status: 'PENDING',
      eventId: keepEventId.toString(),
      changes,
      justification: [{
        type: 'user_action',
        message: reason || 'Fusion manuelle d\'événements doublons'
      }],
      confidence: 1.0,
      eventName: keepEvent.name,
      eventCity: keepEvent.city
    }
  })

  res.json({ success: true, proposal })
})
```

### 4. Endpoint GET /api/events/:id/details

**Fichier** : `apps/api/src/routes/events.ts`

```typescript
router.get('/:eventId/details', async (req, res) => {
  const eventId = parseInt(req.params.eventId)

  if (isNaN(eventId)) {
    return res.status(400).json({ error: 'ID événement invalide' })
  }

  const sourceDb = await dbManager.connectToSource('MILES_REPUBLIC')
  const event = await sourceDb.event.findUnique({
    where: { id: eventId },
    include: {
      editions: {
        orderBy: { year: 'desc' },
        select: {
          id: true,
          year: true,
          startDate: true,
          status: true,
          calendarStatus: true
        }
      }
    }
  })

  if (!event) {
    return res.status(404).json({ error: 'Événement non trouvé' })
  }

  res.json({ success: true, event })
})
```

### 5. ProposalDomainService.applyEventMerge()

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

Cette méthode effectue les opérations suivantes :

1. **Validation** : Vérifie que les deux événements existent
2. **Gestion oldSlugId** : Vérifie si l'événement conservé a déjà une redirection
3. **Mise à jour keepEvent** : Définit oldSlugId et optionnellement renomme
4. **Suppression doublon** : Marque l'événement doublon comme DELETED
5. **Copie des éditions** : Si `copyMissingEditions=true`, copie les éditions manquantes avec leurs courses

```typescript
async applyEventMerge(
  changes: any,
  options: ApplyOptions = {}
): Promise<ProposalApplicationResult> {
  const milesRepo = await this.getMilesRepublicRepository(...)

  const { keepEventId, duplicateEventId, newEventName, copyMissingEditions = true } = changes.merge

  // 1. Vérifications...
  // 2. Gestion oldSlugId existant...

  // 3. Mettre à jour l'événement à conserver
  const keepEventUpdate = {
    oldSlugId: duplicateEventId,
    toUpdate: true,
    algoliaObjectToUpdate: true,
    ...(newEventName && { name: newEventName.trim() })
  }
  await milesRepo.updateEvent(keepEventId, keepEventUpdate)

  // 4. Marquer l'événement doublon comme DELETED
  await milesRepo.updateEvent(duplicateEventId, {
    status: 'DELETED',
    toUpdate: true,
    algoliaObjectToDelete: true
  })

  // 5. Copier les éditions manquantes
  const copiedEditions = []
  if (copyMissingEditions) {
    const keepEventYears = new Set(keepEvent.editions.map(e => e.year))
    const editionsToCopy = duplicateEvent.editions.filter(e => !keepEventYears.has(e.year))

    for (const edition of editionsToCopy) {
      const fullEdition = await milesRepo.findEditionById(edition.id)
      const newEdition = await milesRepo.createEdition({
        eventId: keepEventId,
        year: fullEdition.year,
        // ... tous les champs de l'édition
      })

      // Copier les courses de cette édition
      for (const race of fullEdition.races) {
        await milesRepo.createRace({
          editionId: newEdition.id,
          eventId: keepEventId,
          // ... tous les champs de la course
        })
      }

      copiedEditions.push({
        originalId: edition.id,
        newId: newEdition.id,
        year: fullEdition.year
      })
    }
  }

  return {
    success: true,
    appliedChanges: {
      keepEvent: { id, previousName, newName, oldSlugId },
      duplicateEvent: { id, name, previousStatus, newStatus: 'DELETED' },
      copiedEditions: copiedEditions.length > 0 ? copiedEditions : undefined
    }
  }
}
```

---

## Frontend

### 1. Hooks API

**Fichier** : `apps/dashboard/src/hooks/useApi.ts`

```typescript
// Hook pour récupérer les détails d'un événement
export const useEventDetails = (eventId: number | null) => {
  return useQuery({
    queryKey: ['event-details', eventId],
    queryFn: async () => {
      if (!eventId) return null
      const response = await eventsApi.getDetails(eventId)
      return response.data?.event || null
    },
    enabled: !!eventId
  })
}

// Hook pour créer une proposition de fusion
export const useCreateMergeProposal = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: async (params: {
      keepEventId: number
      duplicateEventId: number
      newEventName?: string
    }) => {
      return proposalsApi.createMerge(params)
    },
    onSuccess: () => {
      enqueueSnackbar('Proposition de fusion créée', { variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
    },
    onError: (error: any) => {
      enqueueSnackbar(error.response?.data?.error || 'Erreur lors de la création', { variant: 'error' })
    }
  })
}
```

**Fichier** : `apps/dashboard/src/services/api.ts`

```typescript
export const eventsApi = {
  getDetails: (eventId: number) => api.get(`/api/events/${eventId}/details`),
}

export const proposalsApi = {
  // ... existing methods
  createMerge: (params: { keepEventId: number; duplicateEventId: number; newEventName?: string }) =>
    api.post('/api/proposals/merge', params),
}
```

### 2. Page EventMerge.tsx

**Fichier** : `apps/dashboard/src/pages/EventMerge.tsx`

Fonctionnalités :
- Deux colonnes avec Autocomplete Meilisearch
- Affichage des cartes événement avec éditions
- Toggle buttons pour choisir l'événement à conserver
- Heuristique : suggère l'événement avec le plus d'éditions
- Champ de texte pour renommer (optionnel)
- Bouton de soumission avec validation

### 3. Composant EventMergeDetail.tsx

**Fichier** : `apps/dashboard/src/pages/proposals/detail/event-merge/EventMergeDetail.tsx`

Affiche :
- Header avec titre et statut
- Alerte résumant la fusion
- Deux cartes côte à côte (conservé vs doublon)
- Justification
- Boutons d'action (Approuver/Rejeter/Archiver) si PENDING
- Alertes de statut final

### 4. Intégration dans le dispatcher

**Fichier** : `apps/dashboard/src/pages/proposals/ProposalDetailDispatcher.tsx`

```typescript
import EventMergeDetail from './detail/event-merge/EventMergeDetail'

// Dans le switch
case 'EVENT_MERGE':
  return <EventMergeDetail proposal={proposalData.data} />
```

### 5. Route

**Fichier** : `apps/dashboard/src/App.tsx`

```tsx
import EventMerge from '@/pages/EventMerge'

<Route path="/events/merge" element={<EventMerge />} />
```

### 6. Menu dropdown

**Fichier** : `apps/dashboard/src/pages/ProposalList.tsx`

```tsx
import { Merge as MergeIcon } from '@mui/icons-material'

<MenuItem onClick={() => { setCreateMenuAnchor(null); navigate('/events/merge') }}>
  <MergeIcon sx={{ mr: 1 }} fontSize="small" />
  Fusionner des doublons
</MenuItem>
```

### 7. Constantes

**Fichier** : `apps/dashboard/src/constants/proposals.ts`

```typescript
// Labels
export const proposalTypeLabels: Record<ProposalType, string> = {
  // ...
  EVENT_MERGE: 'Fusion événements',
}

// Couleurs pour graphiques
export const proposalTypeColors: Record<ProposalType, string> = {
  // ...
  EVENT_MERGE: '#f97316',
}

// Styles pour chips
export const proposalTypeStyles: Record<ProposalType, any> = {
  // ...
  EVENT_MERGE: {
    backgroundColor: '#f97316',
    color: 'white',
    borderColor: '#ea580c',
    '& .MuiChip-icon': {
      color: '#c2410c'
    }
  },
}
```

---

## Gestion de oldSlugId existant

Quand l'événement à conserver a déjà un `oldSlugId`, le comportement dépend de si cet ID pointe vers un événement existant :

### Cas 1 : oldSlugId orphelin (événement n'existe plus)

Si `oldSlugId` pointe vers un ID d'événement qui n'existe plus en base :
- L'écrasement est **automatique**
- Pas de confirmation demandée
- L'ancien oldSlugId est simplement remplacé par le nouveau

### Cas 2 : oldSlugId pointe vers un événement existant

Si `oldSlugId` pointe vers un événement qui existe encore :
- L'API retourne une erreur `ALREADY_HAS_REDIRECT`
- L'erreur contient `canForce: true` indiquant qu'on peut forcer
- L'interface affiche un dialogue de confirmation
- Si l'utilisateur confirme, la requête est renvoyée avec `forceOverwrite: true`
- L'ancienne redirection est écrasée

### Flux frontend

```
1. Utilisateur clique "Créer la proposition"
2. POST /api/proposals/merge { keepEventId, duplicateEventId }
3. Si erreur ALREADY_HAS_REDIRECT avec canForce: true
   → Afficher dialogue de confirmation
4. Si utilisateur confirme
   → POST /api/proposals/merge { keepEventId, duplicateEventId, forceOverwrite: true }
5. Proposition créée avec changes.merge.forceOverwrite = true
```

---

## Structure des données

### Proposal.changes pour EVENT_MERGE

```json
{
  "merge": {
    "keepEventId": 100,
    "keepEventName": "Marathon de Paris",
    "keepEventCity": "Paris",
    "keepEventEditionsCount": 5,
    "duplicateEventId": 200,
    "duplicateEventName": "Marathon Paris",
    "duplicateEventCity": "Paris",
    "duplicateEventEditionsCount": 1,
    "newEventName": null,
    "copyMissingEditions": true,
    "editionsToCopy": [
      { "id": 2001, "year": "2023", "startDate": "2023-04-02", "status": "LIVE" },
      { "id": 2003, "year": "2026", "startDate": "2026-04-05", "status": "LIVE" }
    ],
    // Optionnel - si l'utilisateur a forcé l'écrasement d'une redirection existante
    "forceOverwrite": true,
    "previousOldSlugId": 50
  }
}
```

### ProposalApplication.appliedChanges après application

```json
{
  "keepEvent": {
    "id": 100,
    "previousName": "Marathon de Paris",
    "newName": "Marathon de Paris",
    "oldSlugId": 200
  },
  "duplicateEvent": {
    "id": 200,
    "name": "Marathon Paris",
    "previousStatus": "LIVE",
    "newStatus": "DELETED"
  },
  "copiedEditions": [
    { "originalId": 2001, "newId": 3001, "year": "2023" },
    { "originalId": 2003, "newId": 3002, "year": "2026" }
  ]
}
```

---

## Tests

### Backend

| Fichier | Tests |
|---------|-------|
| `packages/database/src/services/__tests__/event-merge.test.ts` | 20 tests pour applyEventMerge (incluant 5 tests pour copyMissingEditions) |
| `apps/api/src/routes/__tests__/proposals.merge.test.ts` | 22 tests pour les endpoints (incluant 3 tests pour editionsToCopy) |

### Frontend

| Fichier | Tests |
|---------|-------|
| `apps/dashboard/src/pages/proposals/detail/event-merge/__tests__/EventMergeDetail.test.tsx` | 19 tests |
| `apps/dashboard/src/pages/__tests__/EventMerge.test.tsx` | 16 tests |

**Total : 77 tests**

### Tests spécifiques à la copie des éditions

**Backend (event-merge.test.ts)** :
- `should copy editions from duplicate that do not exist on keepEvent (by year)`
- `should not copy editions when copyMissingEditions is false`
- `should not copy editions when all years already exist on keepEvent`
- `should copy editions by default (copyMissingEditions defaults to true)`
- `should handle edition not found gracefully and continue with others`

**API (proposals.merge.test.ts)** :
- `should include editionsToCopy when duplicate has editions not in keepEvent`
- `should set copyMissingEditions to false when explicitly disabled`
- `should set editionsToCopy to null when all years already exist`
