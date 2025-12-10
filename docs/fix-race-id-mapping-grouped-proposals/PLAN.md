# Plan: Fix Race ID Mapping pour Propositions Groupées

**Date**: 2025-12-10  
**Problème**: Mélange des noms de courses dans l'affichage des propositions groupées

## Résumé du problème

### Symptôme observé

Dans une proposition groupée (ex: `6643-41545` - Trail de la galette), les noms de courses sont inversés dans l'UI :

| Course existante (DB) | Valeur actuelle | Valeur proposée (affichée) |
|-----------------------|-----------------|---------------------------|
| Randonnée 8 km | Randonnée 8 km | **Trail solo 14 km** ❌ |
| Trail solo 14 km | Trail solo 14 km | **Randonnée 8 km** ❌ |
| Trail duo 14 km | Trail duo 14 km | Trail duo 14 km ✅ |

### Cause racine identifiée

Les propositions du même groupe ont des **ordres différents** dans leur tableau `racesToUpdate` :

| Proposition | Index 0 | Index 1 | Index 2 |
|-------------|---------|---------|---------|
| **FFA Scraper** | raceId 147546 (Trail solo) | raceId 147544 (Rando) | raceId 147545 (Duo) |
| **Google Agent** | raceId 147544 (Rando) | raceId 147546 (Trail solo) | raceId 147545 (Duo) |

Le frontend utilise `existing-{index}` comme clé unique pour consolider les courses de toutes les propositions. Quand `consolidateRacesFromProposals` itère :

1. **Proposition 1 (FFA)**: `existing-0` → Trail solo 14km
2. **Proposition 2 (Google)**: `existing-0` → **écrase** avec Randonnée 8km

Résultat : données mélangées incohérentes.

## Analyse du système actuel

### Flux de données (propositions groupées)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Backend (base de données)                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Proposition FFA:                    Proposition Google:                     │
│  racesToUpdate = [                   racesToUpdate = [                       │
│    { raceId: 147546, ... },  ←──┐      { raceId: 147544, ... },  ←──┐       │
│    { raceId: 147544, ... },     │      { raceId: 147546, ... },     │       │
│    { raceId: 147545, ... }      │      { raceId: 147545, ... }      │       │
│  ]                              │    ]                              │       │
│                                 │                                   │       │
│  Index différent pour même      │    Index différent pour même      │       │
│  raceId !                       │    raceId !                       │       │
└─────────────────────────────────┴───────────────────────────────────┴───────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Frontend (useProposalEditor.ts)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  consolidateRacesFromProposals():                                           │
│                                                                             │
│  for each proposal:                                                         │
│    extractRacesOriginalData() → originalRaces["existing-{index}"]           │
│    extractRaces()             → races["existing-{index}"]                   │
│                                                                             │
│  raceMap.set("existing-0", { originalFields: ..., fields: ... })            │
│           ↑                                                                 │
│           └── PROBLÈME: même clé pour des courses différentes !             │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  RacesChangesTable (affichage)                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  consolidatedRaces[0]:                                                      │
│    raceId: "existing-0"                                                     │
│    originalFields: { name: "Randonnée 8 km" }  ← Dernière proposition lue   │
│    fields: { name: "Trail solo 14 km" }        ← Première proposition lue   │
│                                                                             │
│  → Affichage incohérent !                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pourquoi `existing-{index}` a été créé

D'après la documentation (`FIX-EXISTING-RACE-INDEX-MAPPING.md`), le système a été conçu pour :

1. **Propositions simples** : `existing-{index}` référence `racesToUpdate[index]` d'une seule proposition
2. **Backend** : Reconstruit le mapping `index → raceId` via `racesToUpdate[index].raceId`
3. **userModifiedChanges** : Stocke les modifications sous `raceEdits["existing-0"]`, etc.

Ce système fonctionne **parfaitement pour les propositions simples** où il n'y a qu'une seule source de données.

### Le problème spécifique aux propositions groupées

Quand plusieurs propositions sont consolidées :
- Chaque proposition peut avoir un ordre différent dans `racesToUpdate`
- `existing-0` de la proposition A ≠ `existing-0` de la proposition B
- La consolidation par clé `existing-{index}` mélange les données

## Solution proposée

### Principe

**Utiliser le vrai `raceId` (147544, 147545, 147546) comme clé de consolidation au lieu de `existing-{index}`.**

Chaque élément de `racesToUpdate` contient déjà le `raceId` réel :
```json
{ "raceId": 147546, "raceName": "Trail solo 14 km", ... }
```

### Changements requis

#### 1. Frontend - `useProposalEditor.ts`

**Fichier**: `apps/dashboard/src/hooks/useProposalEditor.ts`

##### a) `extractRacesOriginalData()` (ligne ~480)

```typescript
// AVANT
const raceId = `existing-${index}`

// APRÈS
const raceId = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`
```

##### b) `extractRaces()` (ligne ~681)

```typescript
// AVANT
const raceId = `existing-${index}`

// APRÈS
const raceId = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`
```

##### c) Ajout d'un mapping `raceId → index` pour `userModifiedChanges`

Le backend attend toujours `raceEdits["existing-{index}"]`. Il faut donc :
1. Utiliser le vrai `raceId` pour la consolidation (affichage)
2. Maintenir un mapping `raceId → existing-{index}` pour les sauvegardes

```typescript
// Nouveau: stocker le mapping dans le state
interface WorkingProposalGroup {
  // ... existant
  raceIdToIndexMap?: Map<string, string>  // raceId → "existing-{index}"
}
```

##### d) `updateRaceEditor()` - Adapter pour utiliser le mapping

Quand l'utilisateur modifie une course, convertir le `raceId` en `existing-{index}` pour `userModifiedChanges`.

#### 2. Frontend - `GroupedProposalDetailBase.tsx`

**Fichier**: `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

##### Propagation des dates (ligne ~832)

La propagation de date doit utiliser le vrai `raceId` pour identifier les courses :

```typescript
// AVANT
const key = `existing-${index}`
updateRaceEditor(key, 'startDate', newStartDate)

// APRÈS
const key = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`
updateRaceEditor(key, 'startDate', newStartDate)
```

#### 3. Backend - Pas de changement requis

Le backend utilise déjà le mapping `index → raceId` via `racesToUpdate[index].raceId` (lignes 1008-1017 de `proposal-domain.service.ts`).

Les `userModifiedChanges` doivent toujours contenir `raceEdits["existing-{index}"]` car le backend s'attend à ce format.

### Stratégie de compatibilité

#### Problème

Le changement de clé (`existing-{index}` → `{raceId}`) doit être compatible avec :
1. Les propositions existantes qui ont déjà des `userModifiedChanges` avec `existing-{index}`
2. Le backend qui attend `raceEdits["existing-{index}"]`

#### Solution

**Double système de clés** :

```typescript
// Affichage (consolidation) : utilise le vrai raceId
const displayKey = raceUpdate.raceId ? raceUpdate.raceId.toString() : `existing-${index}`

// Sauvegarde (userModifiedChanges) : utilise existing-{index}
const saveKey = `existing-${index}`

// Mapping pour conversion
raceIdToSaveKeyMap.set(displayKey, saveKey)
```

Quand l'utilisateur modifie une course :
1. L'UI utilise `displayKey` (raceId) pour identifier la course
2. `updateRaceEditor()` convertit en `saveKey` (existing-{index}) pour sauvegarder
3. Le backend reçoit toujours le format attendu

### Impact sur les fonctionnalités existantes

| Fonctionnalité | Impact | Action |
|----------------|--------|--------|
| Affichage courses | ✅ Corrigé | Clé = raceId |
| Modification utilisateur | ⚠️ Adapter | Mapping raceId → existing-{index} |
| Suppression course | ⚠️ Adapter | Même mapping |
| Ajout course manuelle | ✅ Inchangé | Clé = new-{timestamp} |
| Propagation dates | ⚠️ Adapter | Utiliser raceId |
| Validation par blocs | ✅ Inchangé | Ne dépend pas de la clé |
| Application backend | ✅ Inchangé | Backend utilise son propre mapping |

## Plan d'implémentation

### Phase 1 : Créer le système de mapping

1. Ajouter `raceIdToIndexMap` dans `WorkingProposalGroup`
2. Construire le mapping lors de `extractRaces()` et `extractRacesOriginalData()`
3. Exposer le mapping dans le context

### Phase 2 : Modifier la consolidation

1. Modifier `extractRacesOriginalData()` pour utiliser le vrai raceId
2. Modifier `extractRaces()` pour utiliser le vrai raceId
3. Vérifier que `consolidateRacesFromProposals()` fonctionne avec les nouvelles clés

### Phase 3 : Adapter les modifications utilisateur

1. Modifier `updateRaceEditor()` pour convertir raceId → existing-{index}
2. Modifier `deleteRace()` pour utiliser le mapping
3. Tester la sauvegarde des modifications

### Phase 4 : Adapter la propagation des dates

1. Modifier `GroupedProposalDetailBase.tsx` pour utiliser le raceId
2. Tester la propagation de dates

### Phase 5 : Tests et validation

1. Tester avec la proposition problématique (6643-41545)
2. Tester les propositions simples (régression)
3. Tester les modifications utilisateur
4. Tester l'application des propositions via le backend

## Fichiers à modifier

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `apps/dashboard/src/hooks/useProposalEditor.ts` | ~480, ~681 | Utiliser raceId au lieu de existing-{index} |
| `apps/dashboard/src/hooks/useProposalEditor.ts` | Nouveau | Ajouter raceIdToIndexMap |
| `apps/dashboard/src/hooks/useProposalEditor.ts` | ~updateRaceEditor | Convertir raceId → existing-{index} |
| `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` | ~832 | Propagation dates avec raceId |

## Risques et mitigations

### Risque 1 : Régression sur propositions simples

**Mitigation** : Le fallback `existing-${index}` est conservé si `raceId` est absent.

### Risque 2 : Incompatibilité avec userModifiedChanges existants

**Mitigation** : Le mapping permet de convertir les nouvelles clés vers l'ancien format pour la sauvegarde.

### Risque 3 : Courses avec raceId manquant

**Mitigation** : Fallback vers `existing-${index}` si `raceUpdate.raceId` est undefined.

## Questions ouvertes

1. **Migration des données** : Faut-il migrer les `userModifiedChanges` existants ? → Non, le backend utilise son propre mapping.

2. **Courses manuelles** : Les courses ajoutées manuellement (`new-{timestamp}`) ne sont pas affectées car elles n'ont pas de `raceId` existant.

3. **Performance** : Le mapping ajoute une légère surcharge mais négligeable.

## Ressources

- Documentation existante : `docs/FIX-EXISTING-RACE-INDEX-MAPPING.md`
- Documentation existante : `docs/FIX-RACE-CURRENT-VALUES-DISPLAY.md`
- Backend mapping : `packages/database/src/services/proposal-domain.service.ts` lignes 1008-1017
