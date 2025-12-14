# Feature: Alerte et conversion pour NEW_EVENT avec événement existant

## Contexte

Quand un agent (FFA Scraper, Slack Event Agent, etc.) crée une proposition `NEW_EVENT`, il est possible qu'un événement correspondant soit créé dans Miles Republic entre-temps, soit manuellement par un utilisateur, soit par un autre processus.

Sans cette fonctionnalité, l'utilisateur pourrait valider la proposition `NEW_EVENT` et créer un doublon.

### Cas réel déclencheur

- **Proposition** : `cmiri1tbj39ldlx1v47t0eo4t` (Trail Blanc du Corbier)
- **Créée le** : 2025-12-04 13:56:36
- **Événement créé dans MR** : 2025-12-04 17:40:58 (par Carlos, 4h après)
- **Résultat sans cette feature** : Proposition NEW_EVENT obsolète, risque de doublon

## Fonctionnalité

### Comportement

1. L'utilisateur ouvre une proposition `NEW_EVENT` en statut `PENDING`
2. Le frontend appelle automatiquement `GET /api/proposals/:id/check-existing-event`
3. L'API utilise `matchEvent` pour chercher un événement correspondant dans Miles Republic
4. Si un match est trouvé, une alerte s'affiche en haut de la page

### Interface utilisateur

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Un événement correspondant existe maintenant             │
│                                                             │
│ Trail Blanc du Corbier ↗                                   │
│ Villarembert • Édition 2026                                │
│ [Score: 85%]                                                │
│                                                             │
│ [Convertir en mise à jour]  [Archiver]                     │
│                                                             │
│ (Si édition manquante: message d'avertissement)            │
└─────────────────────────────────────────────────────────────┘
```

### Actions disponibles

| Action | Description |
|--------|-------------|
| **Convertir en mise à jour** | Transforme la proposition `NEW_EVENT` en `EDITION_UPDATE` via l'endpoint existant `/convert-to-edition-update`. Redirige vers la nouvelle proposition. |
| **Archiver** | Archive la proposition obsolète avec la raison "Événement déjà créé dans Miles Republic". Redirige vers la liste des propositions. |

### Cas particulier : édition manquante

Si l'événement existe mais pas l'édition correspondante (ex: événement créé pour 2025 mais proposition pour 2026) :
- Le bouton "Convertir" est désactivé
- Un message indique : "L'édition 2026 n'existe pas encore dans Miles Republic. Créez-la d'abord pour pouvoir convertir."

---

## Implémentation

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
├─────────────────────────────────────────────────────────────┤
│  NewEventDetail.tsx / NewEventGroupedDetail.tsx             │
│         │                                                    │
│         ▼                                                    │
│  useCheckExistingEvent(proposalId, enabled)                 │
│         │                                                    │
│         ▼                                                    │
│  ExistingEventAlert                                          │
│    ├── useConvertToEditionUpdate()                          │
│    └── useBulkArchiveProposals()                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                               │
├─────────────────────────────────────────────────────────────┤
│  GET /api/proposals/:id/check-existing-event                │
│         │                                                    │
│         ▼                                                    │
│  matchEvent() from @data-agents/agent-framework             │
│         │                                                    │
│         ▼                                                    │
│  Miles Republic Database (via DatabaseManager)              │
└─────────────────────────────────────────────────────────────┘
```

### Fichiers modifiés/créés

#### Backend

| Fichier | Type | Description |
|---------|------|-------------|
| `apps/api/src/routes/proposals.ts` | Modifié | Nouvel endpoint `GET /:id/check-existing-event` |
| `apps/api/src/routes/__tests__/proposals.check-existing-event.test.ts` | Nouveau | 14 tests unitaires |

#### Frontend

| Fichier | Type | Description |
|---------|------|-------------|
| `apps/dashboard/src/services/api.ts` | Modifié | Méthode `checkExistingEvent()` |
| `apps/dashboard/src/hooks/useApi.ts` | Modifié | Hook `useCheckExistingEvent()` |
| `apps/dashboard/src/components/proposals/new-event/ExistingEventAlert.tsx` | Nouveau | Composant d'alerte |
| `apps/dashboard/src/pages/proposals/detail/new-event/NewEventDetail.tsx` | Modifié | Intégration alerte |
| `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx` | Modifié | Intégration alerte |
| `apps/dashboard/src/hooks/__tests__/useCheckExistingEvent.test.tsx` | Nouveau | 8 tests |
| `apps/dashboard/src/components/proposals/new-event/__tests__/ExistingEventAlert.test.tsx` | Nouveau | 15 tests |

---

## API

### `GET /api/proposals/:id/check-existing-event`

Vérifie si un événement correspondant existe maintenant dans Miles Republic.

#### Contraintes

- Uniquement pour propositions `NEW_EVENT`
- Uniquement pour propositions `PENDING`
- Lecture seule (ne modifie rien)

#### Paramètres de requête

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `similarityThreshold` | number | 0.75 | Seuil de similarité pour le matching |

#### Réponse

```typescript
{
  hasMatch: boolean
  match?: {
    type: 'EXACT_MATCH' | 'FUZZY_MATCH'
    eventId: number
    eventName: string
    eventSlug: string
    eventCity: string
    editionId?: number      // undefined si l'édition n'existe pas
    editionYear?: string
    confidence: number      // 0-1
  }
  proposalData: {
    eventName: string | null
    eventCity: string | null
    eventDepartment: string | null
    editionYear: number | null
    editionDate: string | null
  }
}
```

#### Exemples

**Match trouvé avec édition :**
```json
{
  "hasMatch": true,
  "match": {
    "type": "FUZZY_MATCH",
    "eventId": 15388,
    "eventName": "Trail Blanc du Corbier",
    "eventSlug": "trail-blanc-du-corbier-15388",
    "eventCity": "Villarembert",
    "editionId": 55062,
    "editionYear": "2026",
    "confidence": 0.85
  },
  "proposalData": {
    "eventName": "Trail Blanc Du Corbier",
    "eventCity": "Le Corbier",
    "eventDepartment": "73",
    "editionYear": 2026,
    "editionDate": "2026-01-24T17:00:00.000Z"
  }
}
```

**Aucun match :**
```json
{
  "hasMatch": false,
  "proposalData": {
    "eventName": "Nouvel Événement",
    "eventCity": "Ma Ville",
    "eventDepartment": "75",
    "editionYear": 2025,
    "editionDate": "2025-06-15T08:00:00.000Z"
  }
}
```

---

## Réutilisabilité pour agent de doublons

L'endpoint est conçu pour être réutilisable par un futur agent de détection de doublons :

1. **Paramètre `similarityThreshold`** : L'agent peut ajuster le seuil selon ses besoins
2. **Réponse `proposalData`** : Contient les données normalisées pour le matching
3. **Pattern réutilisable** : L'agent peut appeler cet endpoint pour chaque proposition NEW_EVENT

### Futur endpoint batch (à créer)

```typescript
// POST /api/proposals/batch-check-duplicates
// Corps: { proposalIds: string[], similarityThreshold?: number }
// Retourne: { results: { proposalId, hasMatch, match }[] }
```

---

## Tests

### Couverture

| Composant | Tests | Couverture |
|-----------|-------|------------|
| `useCheckExistingEvent` | 8 | Enabled/disabled, matches, erreurs, cache |
| `ExistingEventAlert` | 15 | Affichage, boutons, états loading, types de match |
| Logique backend | 14 | Validation, données insuffisantes, matching |
| **Total** | **37** | |

### Lancer les tests

```bash
# Tests frontend
cd apps/dashboard
npx jest --testPathPatterns="useCheckExistingEvent"
npx jest --testPathPatterns="ExistingEventAlert"

# Tests backend
cd apps/api
npx jest --testPathPatterns="check-existing-event"
```

---

## Changelog

### 2025-12-14 - Feature initiale

- Endpoint `GET /api/proposals/:id/check-existing-event`
- Hook `useCheckExistingEvent`
- Composant `ExistingEventAlert`
- Intégration dans `NewEventDetail` et `NewEventGroupedDetail`
- 37 tests
