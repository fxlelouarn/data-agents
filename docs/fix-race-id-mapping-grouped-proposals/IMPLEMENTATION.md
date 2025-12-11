# Fix: Race ID Mapping pour Propositions Groupées

**Date**: 2025-12-10  
**Statut**: Implémenté

## Problème résolu

Dans les propositions groupées (même événement/édition), les noms de courses étaient mélangés dans l'affichage car les propositions du groupe avaient des ordres différents dans leur tableau `racesToUpdate`.

### Exemple concret

| Proposition | Index 0 | Index 1 | Index 2 |
|-------------|---------|---------|---------|
| **FFA Scraper** | raceId 147546 (Trail solo) | raceId 147544 (Rando) | raceId 147545 (Duo) |
| **Google Agent** | raceId 147544 (Rando) | raceId 147546 (Trail solo) | raceId 147545 (Duo) |

Le frontend utilisait `existing-{index}` comme clé unique pour consolider les courses. Quand plusieurs propositions étaient consolidées avec des ordres différents, `existing-0` de la proposition FFA (Trail solo) était écrasé par `existing-0` de la proposition Google (Randonnée), causant un mélange des données.

## Solution implémentée

### Principe

**Utiliser le vrai `raceId` (147544, 147545, 147546) comme clé de consolidation** au lieu de `existing-{index}`, tout en maintenant un **mapping bidirectionnel** pour la compatibilité avec le backend qui attend des clés `existing-{index}`.

### Flux de données

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AVANT (bug)                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Proposition FFA: existing-0 = Trail solo                                    │
│  Proposition Google: existing-0 = Randonnée (écrase!)                        │
│  → Mélange des données                                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  APRÈS (fix)                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Proposition FFA: "147546" = Trail solo                                      │
│  Proposition Google: "147544" = Randonnée                                    │
│  → Chaque course a sa propre clé unique                                      │
│                                                                              │
│  Mapping sauvegardé: { "147546": "existing-0", "147544": "existing-1", ... } │
│  → Converti en existing-{index} lors de la sauvegarde pour le backend        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Fichiers modifiés

### 1. `apps/dashboard/src/hooks/useProposalEditor.ts`

#### a) Interface `WorkingProposalGroup` - Ajout du mapping
```typescript
// Nouveau champ
raceIdToIndexMap: Record<string, string> // ex: { "147544": "existing-0" }
```

#### b) `extractRacesOriginalData()` (ligne ~480)
```typescript
// AVANT
const raceId = `existing-${index}`

// APRÈS
const raceId = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`
```

#### c) `extractRaces()` (ligne ~681)
```typescript
// AVANT
const raceId = `existing-${index}`

// APRÈS
const raceId = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`
// + stockage de _originalIndex pour le mapping
```

#### d) `consolidateRacesFromProposals()` - Construction du mapping
```typescript
// Retourne maintenant { races, raceIdToIndexMap }
// Construit le mapping raceId → existing-{index}
```

#### e) `initializeWorkingGroup()` - Conversion des clés sauvegardées
```typescript
// Convertit les clés existing-{index} sauvegardées en vrais raceId
// pour matcher avec les courses consolidées
```

#### f) `buildGroupDiff()`, `getBlockPayload()`, `getPayload()` - Reconversion à la sauvegarde
```typescript
// Convertit les vrais raceId en existing-{index} pour le backend
const saveKey = working.raceIdToIndexMap?.[raceId] || raceId
```

### 2. `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

#### Propagation des dates (ligne ~832)
```typescript
// AVANT
const key = `existing-${index}`

// APRÈS
const key = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`
```

## Compatibilité

| Aspect | Impact |
|--------|--------|
| **Backend** | Pas de changement requis - reçoit toujours `existing-{index}` |
| **Propositions existantes** | Compatible - les clés `existing-{index}` sont converties à la lecture |
| **Nouvelles courses** | Inchangé - utilisent toujours `new-{index}` ou `new-{timestamp}` |
| **Propositions simples** | Fallback vers `existing-{index}` si `raceId` absent |

## Tests effectués

- [x] Compilation TypeScript sans erreurs
- [ ] Test manuel avec proposition problématique 6643-41545
- [ ] Test régression sur propositions simples
- [ ] Test modification utilisateur sur course
- [ ] Test suppression de course
- [ ] Test propagation de dates

## Documentation liée

- Plan initial : `docs/fix-race-id-mapping-grouped-proposals/PLAN.md`
- Documentation existante : `docs/FIX-EXISTING-RACE-INDEX-MAPPING.md`
- Documentation existante : `docs/FIX-RACE-CURRENT-VALUES-DISPLAY.md`
