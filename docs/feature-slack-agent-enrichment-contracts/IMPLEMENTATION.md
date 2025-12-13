# Implementation: Amélioration de l'Agent Slack + Contrats Agents

**Date**: 2025-12-13
**Branche**: `feature/slack-agent-enrichment-contracts`
**Statut**: Phases 0-3 terminées, Phase 4 différée

---

## Résumé

Cette implémentation ajoute des services partagés pour l'enrichissement des courses et la résolution de timezone, ainsi que des contrats standardisés pour `SourceMetadata` et `Justification`. Le SlackProposalService a été enrichi pour utiliser ces services, et le Dashboard a été corrigé pour afficher correctement les événements similaires rejetés.

---

## Fichiers créés

### Types partagés (`packages/database/src/types/`)

| Fichier | Description |
|---------|-------------|
| `source-metadata.ts` | Type générique `SourceMetadata` pour toutes les sources (URL, IMAGE, TEXT, SLACK, FFA, GOOGLE) avec helper `createSourceMetadata()` |
| `justification.ts` | Type standardisé `Justification` avec `RejectedMatch` et helpers (`createRejectedMatchesJustification`, `createUrlSourceJustification`, `createMatchingJustification`) |
| `index.ts` | Exports de tous les types et helpers |

### Service race-enrichment (`packages/database/src/services/race-enrichment/`)

| Fichier | Description |
|---------|-------------|
| `category-inference.ts` | `inferRaceCategories(name, runDistance?, bikeDistance?, swimDistance?, walkDistance?)` - Infère `categoryLevel1` et `categoryLevel2` depuis le nom et les distances |
| `race-normalizer.ts` | `normalizeRaceName()`, `cleanRaceName()`, `normalizeRaceNameWithCategory()`, `getCategoryLabel()` |
| `index.ts` | Exports du service |

### Service timezone (`packages/database/src/services/timezone/`)

| Fichier | Description |
|---------|-------------|
| `department-timezones.ts` | Mappings des départements DOM-TOM, ligues FFA et pays vers timezones IANA |
| `timezone-resolver.ts` | `getTimezoneFromLocation({department?, ligue?, country?})`, `getTimezoneFromDepartment()`, `getTimezoneFromLigue()`, `getTimezoneFromCountry()`, `isDOMTOM()` |
| `index.ts` | Exports du service |

---

## Fichiers modifiés

### Backend

| Fichier | Modifications |
|---------|---------------|
| `packages/database/src/index.ts` | Ajout exports des types et services partagés |
| `apps/api/src/services/slack/SlackProposalService.ts` | - Import des services partagés<br>- `enrichRaceWithCategories()` pour inférer les catégories<br>- `calculateRaceStartDate()` pour calculer les dates avec timezone<br>- `convertToSourceMetadata()` pour le format générique<br>- `buildNewEventChanges()` enrichi avec catégories, dates et timezone<br>- `buildEditionUpdateChanges()` enrichi<br>- `buildJustifications()` utilise les helpers du contrat |

### Dashboard

| Fichier | Modifications |
|---------|---------------|
| `apps/dashboard/src/pages/proposals/detail/new-event/NewEventDetail.tsx` | Recherche `type === 'rejected_matches'` avec fallback sur `type === 'text'` pour rétro-compatibilité |
| `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx` | Idem |
| `apps/dashboard/src/components/proposals/AgentInfoSection.tsx` | - Ajout interface `SourceMetadata`<br>- `getSourceUrl()` supporte `sourceMetadata.url`, `sourceMetadata.extra.messageLink`, et fallback sur `justification` |

### Documentation

| Fichier | Modifications |
|---------|---------------|
| `docs/CREATING-AGENTS.md` | Ajout section "Contrats Obligatoires" avec exemples pour `SourceMetadata` et `Justification` |

---

## Types et interfaces

### SourceMetadata (contrat)

```typescript
interface SourceMetadata {
  type: 'URL' | 'IMAGE' | 'TEXT' | 'SLACK' | 'FFA' | 'GOOGLE'
  url?: string
  imageUrls?: string[]
  rawText?: string
  extractedAt: string  // ISO 8601
  extra?: {
    // Slack
    workspaceId?: string
    channelId?: string
    messageLink?: string
    userId?: string
    userName?: string
    // FFA
    ffaId?: string
    ligue?: string
    // Google
    searchQuery?: string
    resultRank?: number
  }
}
```

### Justification (contrat)

```typescript
interface Justification {
  type: 'url_source' | 'rejected_matches' | 'matching' | 'extraction' | 'validation'
  content: string
  metadata?: {
    url?: string
    rejectedMatches?: RejectedMatch[]
    matchType?: 'EXACT' | 'FUZZY_MATCH' | 'NO_MATCH'
    matchedEventId?: number
    matchedEventName?: string
    similarity?: number
    matchedEditionId?: number
    matchedEditionYear?: string
  }
}

interface RejectedMatch {
  eventId: number
  eventName: string
  eventSlug: string
  eventCity: string
  eventDepartment: string
  editionId?: number
  editionYear?: string
  matchScore: number
  nameScore: number
  cityScore: number
  departmentMatch: boolean
  dateProximity: number
}
```

---

## Fonctionnalités implémentées

### 1. Enrichissement automatique des catégories

Les courses proposées par le SlackProposalService ont maintenant automatiquement leurs catégories inférées si non fournies :

```typescript
// Avant
{ name: "Trail 25km", categoryLevel1: undefined }

// Après
{ name: "Trail 25km", categoryLevel1: "TRAIL", categoryLevel2: "SHORT_TRAIL" }
```

### 2. Dates avec heures et timezone

Les dates d'édition et de course incluent maintenant l'heure et la timezone :

```typescript
// Avant
{ startDate: "2025-03-15" }

// Après
{ 
  startDate: "2025-03-15T09:00:00.000Z",  // UTC (09:00 Paris = 08:00 UTC en mars)
  timeZone: "Europe/Paris"
}
```

### 3. Timezone inférée depuis la localisation

La timezone est automatiquement déterminée :
- DOM-TOM (971-988) → timezone spécifique (America/Guadeloupe, Indian/Reunion, etc.)
- Métropole → Europe/Paris
- Autres pays → timezone du pays

### 4. Affichage des événements similaires rejetés

Le dashboard affiche maintenant la card "Événements similaires détectés" grâce à la correction de la recherche du type de justification :

```typescript
// Avant (ne trouvait pas les rejectedMatches de Slack)
j.type === 'text'

// Après (compatible Slack et ancien format)
j.type === 'rejected_matches' || j.type === 'text'
```

### 5. Bouton "Voir source" amélioré

Le bouton supporte maintenant le format générique `SourceMetadata` en plus des formats legacy.

---

## Phase 4 différée

La migration des agents existants (FFAScraperAgent, GoogleSearchDateAgent) vers les services partagés a été différée car :

1. **Les services sont disponibles** : Les nouveaux agents peuvent les utiliser immédiatement
2. **SlackProposalService migré** : Le cas d'usage principal est fonctionnel
3. **Risque de régression** : Les agents existants fonctionnent bien avec leur code actuel
4. **Effort important** : ~15 occurrences à modifier dans FFAScraperAgent seul

La migration peut être faite ultérieurement dans une PR dédiée.

---

## Tests recommandés

1. **Créer une proposition via Slack avec une URL**
   - Vérifier que `sourceMetadata.url` contient l'URL
   - Vérifier que `sourceMetadata.type === 'SLACK'`

2. **Vérifier l'enrichissement des catégories**
   - Créer une proposition avec une course "Trail 30km"
   - Vérifier que `categoryLevel1 === 'TRAIL'` et `categoryLevel2 === 'SHORT_TRAIL'`

3. **Vérifier les dates avec heures**
   - Créer une proposition avec `startTime: "09:00"`
   - Vérifier que `startDate` contient l'heure (pas 00:00:00)

4. **Vérifier la timezone DOM-TOM**
   - Créer une proposition avec `department: "974"` (La Réunion)
   - Vérifier que `timeZone === 'Indian/Reunion'`

5. **Vérifier la card "Événements similaires"**
   - Créer une proposition NEW_EVENT avec un matching proche du seuil
   - Vérifier que la card s'affiche avec les rejectedMatches

6. **Vérifier le bouton "Voir source"**
   - Créer une proposition avec `sourceMetadata.url`
   - Vérifier que le bouton s'affiche et ouvre l'URL
