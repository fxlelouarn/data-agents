# Fix: Traitement des courses ajoutées manuellement lors de l'application

**Date** : 2025-12-04
**Branche** : `manual-add-race`
**Statut** : ✅ Implémenté

## Problème

Les courses ajoutées manuellement par l'utilisateur via le bouton "Ajouter une course" n'étaient pas créées en base de données lors de l'application du bloc `races`, et n'apparaissaient pas dans la page `/updates`.

### Symptômes

1. L'utilisateur ajoute une course manuellement dans une proposition
2. Il valide le bloc `races`
3. Dans `/updates`, la section "Courses" n'affiche que les courses existantes modifiées
4. La nouvelle course manuelle n'apparaît nulle part
5. Après application, la course n'est pas créée dans Miles Republic

## Cause racine

**Deux systèmes de stockage différents pour les nouvelles courses :**

| Type de course | Clé dans raceEdits | Stockage | Traitement backend |
|----------------|---------------------|----------|-------------------|
| Proposée par agent | `new-0`, `new-1`, `new-2`... | `changes.racesToAdd` | ✅ Traité |
| Ajoutée manuellement | `new-{timestamp}` (ex: `new-1764849197632`) | `userModifiedChanges.raceEdits` | ❌ **Non traité** |

Le code backend ne traitait que les courses de `racesToAdd` avec des index numériques simples :

```typescript
// Code existant - ne traite que new-0, new-1, etc.
for (const { race: raceData, originalIndex } of racesToAddWithIndex) {
  const editedData = raceEdits[`new-${originalIndex}`] || {}  // ← Ne matche jamais "new-1764849197632"
  // ...
}
```

## Solution

### 1. Backend - `packages/database/src/services/proposal-domain.service.ts`

Ajout d'un nouveau bloc de traitement pour les courses manuelles (après le traitement de `racesToAdd`) :

```typescript
// ✅ NOUVEAU: Traiter les courses ajoutées MANUELLEMENT par l'utilisateur
const manualRaceEdits = (proposal?.userModifiedChanges as any)?.raceEdits || {}
const manuallyAddedRaces = Object.entries(manualRaceEdits)
  .filter(([key, value]: [string, any]) => {
    if (!key.startsWith('new-')) return false
    if (value._deleted) return false
    const numericPart = key.replace('new-', '')
    const num = parseInt(numericPart)
    // Les courses manuelles ont un timestamp (> 1000000), pas un index (0, 1, 2...)
    return !isNaN(num) && num > 1000000
  })
  .map(([key, raceData]) => ({ key, raceData: raceData as any }))

if (manuallyAddedRaces.length > 0) {
  for (const { key, raceData } of manuallyAddedRaces) {
    const racePayload = {
      editionId: numericEditionId,
      eventId: edition?.eventId,
      name: raceData.name,
      startDate: raceData.startDate ? new Date(raceData.startDate) : null,
      categoryLevel1: raceData.categoryLevel1,
      categoryLevel2: raceData.categoryLevel2,
      timeZone: raceData.timeZone,
      // + distances et élévations
    }
    
    await milesRepo.createRace(racePayload)
  }
}
```

### 2. Frontend - `apps/dashboard/src/components/updates/BlockChangesTable.tsx`

#### Ajout du champ `manuallyAddedRaces`

```typescript
const BLOCK_FIELDS: Record<string, string[]> = {
  // ...
  races: ['races', 'racesToUpdate', 'racesToAdd', 'manuallyAddedRaces', 'racesToDelete'],
}

const FIELD_LABELS: Record<string, string> = {
  // ...
  manuallyAddedRaces: 'Courses ajoutées manuellement',
}
```

#### Extraction des courses manuelles dans `getProposedValue()`

```typescript
if (blockType === 'races' && fieldName === 'manuallyAddedRaces') {
  const raceEdits = effectiveChanges.raceEdits || {}
  const manualRaces = Object.entries(raceEdits)
    .filter(([key, value]: [string, any]) => {
      if (!key.startsWith('new-')) return false
      if (value._deleted) return false
      const num = parseInt(key.replace('new-', ''))
      return !isNaN(num) && num > 1000000
    })
    .map(([key, raceData]: [string, any]) => ({
      ...raceData,
      _manualKey: key
    }))
  
  return manualRaces.length > 0 ? manualRaces : null
}
```

#### Affichage dans `formatValue()`

```typescript
if (fieldName && ['racesToUpdate', 'racesToAdd', 'racesToDelete', 'races', 'manuallyAddedRaces'].includes(fieldName)) {
  // ...
  if (fieldName === 'racesToAdd' || fieldName === 'manuallyAddedRaces') {
    // Afficher nom + détails (distance, catégorie, date)
  }
}
```

## Comportement après correction

| Étape | Avant | Après |
|-------|-------|-------|
| Ajout manuel d'une course | ✅ OK | ✅ OK |
| Validation bloc races | ✅ OK | ✅ OK |
| Affichage dans /updates | ❌ Course invisible | ✅ Section "Courses ajoutées manuellement" |
| Application du bloc | ❌ Course non créée | ✅ Course créée en base |

## Logs de debug

Le backend affiche maintenant des logs détaillés :

```
➕ Ajout de 1 course(s) ajoutée(s) MANUELLEMENT par l'utilisateur
  ➡️  Ajout course manuelle "new-1764849197632": Semi-marathon
🔍 [MANUAL RACE new-1764849197632] Payload FINAL avant createRace:
  { "editionId": 39888, "name": "Semi-marathon", "runDistance": 21.1, ... }
  ✅ Course manuelle créée: 141595 (Semi-marathon)
```

## Tests manuels

1. **Ajouter une course manuellement**
   - Aller sur une proposition EDITION_UPDATE
   - Cliquer "Ajouter une course"
   - Remplir le formulaire et valider

2. **Vérifier l'affichage dans /updates**
   - Valider le bloc races
   - Aller dans /updates
   - Vérifier que "Courses ajoutées manuellement" apparaît avec la nouvelle course

3. **Appliquer et vérifier en base**
   - Appliquer le bloc races
   - Vérifier dans Miles Republic que la course a été créée

## Fichiers modifiés

- `packages/database/src/services/proposal-domain.service.ts` - Traitement backend
- `apps/dashboard/src/components/updates/BlockChangesTable.tsx` - Affichage frontend
