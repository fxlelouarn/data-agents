# Stats : Ventilation par type de sport

**Date** : 2026-03-30
**Branche** : à créer (`feature/stats-sport-breakdown`)

## Objectif

Enrichir les graphiques de statistiques du dashboard pour différencier les éditions par type de sport : Course à pied / Trail, Triathlon, Cyclisme, et Autres.

## Mapping des catégories sport

| Groupe affiché | Clé API | `categoryLevel1` sources | Couleur |
|---|---|---|---|
| Course à pied / Trail | `running_trail` | `RUNNING`, `TRAIL`, `WALK` | `#3b82f6` (bleu) |
| Triathlon | `triathlon` | `TRIATHLON` | `#f59e0b` (orange) |
| Cyclisme | `cycling` | `CYCLING` | `#22c55e` (vert) |
| Autres | `other` | `FUN`, `OTHER`, `null`, tout le reste | `#8b5cf6` (violet) |

## Détermination du sport d'une édition

Le sport d'une édition est déterminé par le **sport dominant** : le `categoryLevel1` le plus fréquent parmi les courses de l'édition. En cas d'égalité, le premier par ordre alphabétique. Si aucune course n'existe, l'édition est classée dans "Autres".

### Requête SQL (sport dominant)

```sql
SELECT e.id,
  COALESCE(
    (SELECT r."categoryLevel1"
     FROM "Race" r
     WHERE r."editionId" = e.id
     GROUP BY r."categoryLevel1"
     ORDER BY COUNT(*) DESC, r."categoryLevel1" ASC
     LIMIT 1),
    'OTHER'
  ) as "dominantSport"
FROM "Edition" e
WHERE ...
```

### Fonction de mapping (backend)

```typescript
const SPORT_GROUP_MAP: Record<string, string> = {
  RUNNING: 'running_trail',
  TRAIL: 'running_trail',
  WALK: 'running_trail',
  TRIATHLON: 'triathlon',
  CYCLING: 'cycling',
  FUN: 'other',
  OTHER: 'other',
}

function getSportGroup(categoryLevel1: string | null): string {
  if (!categoryLevel1) return 'other'
  return SPORT_GROUP_MAP[categoryLevel1] || 'other'
}
```

## Backend : Endpoints modifiés

### 1. `GET /api/stats/calendar-confirmations`

**Paramètres ajoutés :**
- `sport` (optionnel) : `running_trail` | `triathlon` | `cycling` | `other`

**Réponse sans filtre sport** (ventilation par groupe) :

```json
{
  "success": true,
  "data": {
    "startDate": "...",
    "endDate": "...",
    "granularity": "month",
    "results": [
      {
        "date": "03/2026",
        "running_trail": 45,
        "triathlon": 12,
        "cycling": 8,
        "other": 15,
        "total": 80,
        "timestamp": "2026-03-01T00:00:00.000Z"
      }
    ]
  }
}
```

**Réponse avec filtre sport** (`?sport=running_trail`) :

```json
{
  "results": [
    {
      "date": "03/2026",
      "count": 45,
      "timestamp": "2026-03-01T00:00:00.000Z"
    }
  ]
}
```

Quand un sport est filtré, le format reste identique à l'actuel (champ `count`) pour compatibilité.

### 2. `GET /api/stats/pending-confirmations`

**Paramètres ajoutés :**
- `sport` (optionnel) : `running_trail` | `triathlon` | `cycling` | `other`

**Réponse sans filtre sport** (grouped + stacked par sport) :

```json
{
  "results": [
    {
      "date": "03/2026",
      "running_trail_confirmed": 30,
      "running_trail_toBeConfirmed": 15,
      "triathlon_confirmed": 8,
      "triathlon_toBeConfirmed": 4,
      "cycling_confirmed": 5,
      "cycling_toBeConfirmed": 3,
      "other_confirmed": 10,
      "other_toBeConfirmed": 5,
      "total": 80,
      "timestamp": "2026-03-01T00:00:00.000Z"
    }
  ]
}
```

**Réponse avec filtre sport** (`?sport=triathlon`) :

```json
{
  "results": [
    {
      "date": "03/2026",
      "confirmed": 8,
      "toBeConfirmed": 4,
      "total": 12,
      "timestamp": "2026-03-01T00:00:00.000Z"
    }
  ]
}
```

Quand un sport est filtré, le format reste identique à l'actuel pour compatibilité.

### 3. `GET /api/stats/confirmation-rate-by-sport` (nouveau)

Snapshot des éditions futures : taux de confirmation par groupe sport.

**Paramètres :** aucun (snapshot à date)

**Réponse :**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "sport": "running_trail",
        "label": "Course à pied / Trail",
        "confirmed": 320,
        "toBeConfirmed": 180,
        "total": 500,
        "rate": 64.0
      },
      {
        "sport": "triathlon",
        "label": "Triathlon",
        "confirmed": 85,
        "toBeConfirmed": 45,
        "total": 130,
        "rate": 65.4
      },
      {
        "sport": "cycling",
        "label": "Cyclisme",
        "confirmed": 60,
        "toBeConfirmed": 40,
        "total": 100,
        "rate": 60.0
      },
      {
        "sport": "other",
        "label": "Autres",
        "confirmed": 30,
        "toBeConfirmed": 25,
        "total": 55,
        "rate": 54.5
      }
    ]
  }
}
```

## Backend : Implémentation SQL

Pour chaque endpoint, la stratégie est la même :

1. Sous-requête pour déterminer le sport dominant de chaque édition
2. Mapping vers le groupe sport
3. Agrégation par intervalle de temps + groupe sport

**Requête type pour `calendar-confirmations` sans filtre :**

```sql
WITH edition_sports AS (
  SELECT
    e.id,
    e."confirmedAt",
    COALESCE(
      (SELECT r."categoryLevel1"
       FROM "Race" r
       WHERE r."editionId" = e.id
       GROUP BY r."categoryLevel1"
       ORDER BY COUNT(*) DESC, r."categoryLevel1" ASC
       LIMIT 1),
      'OTHER'
    ) as dominant_sport
  FROM "Edition" e
  WHERE e."calendarStatus" = 'CONFIRMED'
    AND e."confirmedAt" >= $1
    AND e."confirmedAt" < $2
)
SELECT
  CASE
    WHEN dominant_sport IN ('RUNNING', 'TRAIL', 'WALK') THEN 'running_trail'
    WHEN dominant_sport = 'TRIATHLON' THEN 'triathlon'
    WHEN dominant_sport = 'CYCLING' THEN 'cycling'
    ELSE 'other'
  END as sport_group,
  COUNT(*) as count
FROM edition_sports
GROUP BY sport_group
```

Cette requête est exécutée pour chaque intervalle de temps (comme actuellement avec `edition.count`), ou idéalement en une seule requête avec un `date_trunc` pour toute la période.

## Frontend : Graphiques

### Sélecteur sport (composant partagé)

Un `Select` MUI ajouté dans la barre de filtres de chaque graphique concerné :

```
[Tous les sports ▾]  — valeur par défaut, affiche la ventilation
[Course à pied / Trail]
[Triathlon]
[Cyclisme]
[Autres]
```

### 1. Évolution des confirmations calendrier (LineChart)

**Sans filtre sport :**
- 4 `Line` (une par groupe sport), chacune avec sa couleur
- Pas de ligne "Total" (les lignes empilées suffisent à voir la tendance globale)

**Avec filtre sport :**
- 1 seule `Line` pour le sport sélectionné (comportement identique à l'actuel)

### 2. Éditions futures par statut (BarChart grouped + stacked)

**Sans filtre sport :**
- Pour chaque période : 4 barres côte à côte (une par sport)
- Chaque barre est empilée : confirmé (bas) + à confirmer (haut)
- Implémentation Recharts : 8 `Bar` au total (4 sports x 2 statuts), avec `stackId` par sport

```
Mars 2026              Avril 2026
[▓░] [▓░] [▓] [▓░]    [▓░] [▓░] [▓] [▓░]
 R/T  Tri  Cyc Aut      R/T  Tri  Cyc Aut

▓ = confirmé (couleur pleine)
░ = à confirmer (couleur avec opacité 50%)
```

- Couleur confirmée = couleur du sport pleine
- Couleur à confirmer = même couleur avec `opacity: 0.5`
- Label total au-dessus de chaque barre

**Avec filtre sport :**
- Retour au comportement actuel : 1 barre stacked confirmé/à confirmer par période
- Couleurs : vert (confirmé) / orange (à confirmer) comme actuellement

### 3. Taux de confirmation par sport (BarChart horizontal — nouveau)

- Placé entre "Éditions futures par statut" et "Propositions créées"
- 4 barres horizontales, une par sport
- Chaque barre = stacked 100% (confirmé en couleur du sport, à confirmer en couleur + opacité)
- Label à droite : `320/500 (64%)`
- Pas de filtre date, pas de granularité — snapshot des éditions futures
- Titre : "Taux de confirmation par sport"

### API client et hooks

**Nouveau dans `statsApi`** (api.ts) :
- `getConfirmationRateBySport()` — appel à `/api/stats/confirmation-rate-by-sport`

**Hooks modifiés** (useApi.ts) :
- `useCalendarConfirmations(filters)` — ajout paramètre `sport?` dans les filtres
- `usePendingConfirmations(filters)` — ajout paramètre `sport?` dans les filtres

**Nouveau hook** :
- `useConfirmationRateBySport()` — pour le nouveau graphique

### Constantes sport (nouveau fichier ou dans constants existant)

```typescript
export const SPORT_GROUPS = {
  running_trail: { label: 'Course à pied / Trail', color: '#3b82f6' },
  triathlon: { label: 'Triathlon', color: '#f59e0b' },
  cycling: { label: 'Cyclisme', color: '#22c55e' },
  other: { label: 'Autres', color: '#8b5cf6' },
} as const

export type SportGroup = keyof typeof SPORT_GROUPS
```

## Fichiers impactés

**Backend :**
- `apps/api/src/routes/stats.ts` — modification des 2 endpoints existants + ajout du nouveau

**Frontend :**
- `apps/dashboard/src/pages/Statistics.tsx` — modification des 2 graphiques + ajout du nouveau
- `apps/dashboard/src/services/api.ts` — ajout appel API + modification filtres
- `apps/dashboard/src/hooks/useApi.ts` — ajout hook + modification filtres
- `apps/dashboard/src/constants/sports.ts` — nouveau fichier pour les constantes sport

## Ce qui ne change pas

- Graphique "Propositions créées par type" — pas concerné par le sport
- Leaderboard utilisateurs — pas concerné par le sport
- Aucune migration Prisma — tout est calculé à la volée via SQL raw
