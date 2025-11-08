# Fix : Extraction correcte des champs Edition et création des courses

**Date** : 2025-11-07  
**Problème** : Les champs `startDate`, `endDate` de l'Edition et les courses proposées n'étaient pas créés lors de l'application d'une proposition NEW_EVENT.

## Symptômes

Lors de l'application d'une proposition NEW_EVENT (ex: Semi-Marathon Du Grand Nancy) :

1. ❌ `Edition.startDate` était `null` alors qu'elle était présente dans la proposition
2. ❌ `Edition.endDate` était `null` 
3. ❌ Les courses (`Race`) n'étaient pas créées alors qu'elles étaient proposées
4. ✅ `Edition.currentEditionEventId` était bien défini (déjà corrigé)

## Cause racine

### Structure des données de proposition FFA Scraper

Les propositions NEW_EVENT du FFA Scraper ont une structure imbriquée :

```json
{
  "edition": {
    "new": {
      "year": "2025",
      "startDate": "2025-03-29T09:00:00.000Z",
      "races": [
        {
          "name": "1/2 Marathon",
          "type": "RUNNING",
          "startDate": "2025-03-29T09:00:00.000Z",
          "runDistance": 21.1
        }
      ]
    }
  }
}
```

### Erreur dans le code

Les fonctions `extractEditionsData()` et `extractRacesData()` cherchaient les données au mauvais endroit :

```typescript
// ❌ INCORRECT - Cherchait au niveau racine
if (selectedChanges.year || selectedChanges.startDate || selectedChanges.endDate) {
  return [{
    startDate: this.extractDate(selectedChanges.startDate), // undefined !
    endDate: this.extractDate(selectedChanges.endDate),     // undefined !
  }]
}
```

Au lieu de chercher dans `selectedChanges.edition.new`.

## Solution appliquée

### 1. Correction de `extractEditionsData()`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`  
**Lignes** : 588-695

```typescript
private extractEditionsData(selectedChanges: Record<string, any>): any[] {
  // ✅ FIX: Extraire depuis edition.new si présent
  const editionData = this.extractNewValue(selectedChanges.edition)
  
  if (editionData && typeof editionData === 'object') {
    // Edition imbriquée (structure FFA Scraper)
    return [{
      year: editionData.year || new Date().getFullYear().toString(),
      
      // Dates
      startDate: this.parseDate(editionData.startDate),
      endDate: this.parseDate(editionData.endDate),
      // ... autres champs
    }]
  }
  
  // Fallback: chercher au niveau racine (ancienne structure)
  if (selectedChanges.year || selectedChanges.startDate || selectedChanges.endDate) {
    // ... ancien code
  }
}
```

**Changements clés** :
- Extraction depuis `selectedChanges.edition` via `extractNewValue()`
- Utilisation de `parseDate()` au lieu de `extractDate()` (valeurs déjà extraites)
- Fallback vers l'ancienne structure pour rétrocompatibilité

### 2. Correction de `extractRacesData()`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`  
**Lignes** : 698-720

```typescript
private extractRacesData(selectedChanges: Record<string, any>): any[] {
  const races = []

  // ✅ FIX: Extraire depuis edition.new.races si présent (structure FFA Scraper)
  const editionData = this.extractNewValue(selectedChanges.edition)
  if (editionData && typeof editionData === 'object' && Array.isArray(editionData.races)) {
    for (const raceData of editionData.races) {
      races.push({
        name: raceData.name || 'Course principale',
        editionYear: editionData.year || new Date().getFullYear().toString(),
        startDate: this.parseDate(raceData.startDate),
        runDistance: raceData.runDistance ? parseFloat(raceData.runDistance) : undefined,
        // Mapper type (obsolète) vers categoryLevel1
        categoryLevel1: raceData.categoryLevel1 || raceData.type,
        price: raceData.price ? parseFloat(raceData.price) : undefined
      })
    }
  }

  // Fallback vers race_0, race_1, etc. (ancienne structure)
  // ...
}
```

**Changements clés** :
- Extraction depuis `editionData.races` (tableau de courses)
- Conversion des types numériques (`runDistance`, `price`)
- Utilisation de `editionData.year` pour `editionYear` (lien avec édition parent)
- **Mapping `type` → `categoryLevel1`** : Le champ `type` est obsolète, on mappe vers `categoryLevel1`

### 3. Ajout de `parseDate()`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`  
**Lignes** : 872-879

```typescript
/**
 * Helper to parse a raw date value (without extractNewValue)
 * Used when value is already extracted (e.g. from edition.new.startDate)
 */
private parseDate(value: any): Date | null {
  if (!value) return null
  return new Date(value)
}
```

**Différence avec `extractDate()`** :
- `extractDate(value)` : appelle `extractNewValue()` puis `new Date()` → pour objets `{old, new}`
- `parseDate(value)` : appelle directement `new Date()` → pour valeurs déjà extraites

## Test de validation

### Avant le fix

```sql
-- Event 15178 créé mais incomplet
SELECT id, name FROM "Event" WHERE id = 15178;
-- ✅ Event créé

SELECT id, "startDate", "endDate" FROM "Edition" WHERE "eventId" = 15178;
-- ❌ startDate: null, endDate: null

SELECT id, name FROM "Race" WHERE "eventId" = 15178;
-- ❌ Aucune race créée
```

### Après le fix

```sql
-- Event, Edition et Race créés correctement
SELECT id, name FROM "Event" WHERE id = 15178;
-- ✅ Event créé

SELECT id, "startDate", "endDate" FROM "Edition" WHERE "eventId" = 15178;
-- ✅ startDate: 2025-03-29 09:00:00
-- ✅ endDate: 2025-03-29 (ou null si pas fournie)

SELECT id, name, "runDistance" FROM "Race" WHERE "eventId" = 15178;
-- ✅ 40098 | 1/2 Marathon | 21.1
```

## Rétrocompatibilité

✅ **Les deux structures sont supportées** :

### Structure FFA Scraper (nouvelle)
```json
{
  "edition": {
    "new": {
      "year": "2025",
      "startDate": "2025-03-29T09:00:00.000Z",
      "races": [...]
    }
  }
}
```

### Structure plate (ancienne)
```json
{
  "year": { "new": "2025" },
  "startDate": { "new": "2025-03-29T09:00:00.000Z" },
  "race_0": { ... }
}
```

## Résumé des modifications

| Fichier | Méthode | Changement |
|---------|---------|------------|
| `proposal-domain.service.ts` | `extractEditionsData()` | Extraction depuis `edition.new` + fallback niveau racine |
| `proposal-domain.service.ts` | `extractRacesData()` | Extraction depuis `edition.new.races` + fallback race_X |
| `proposal-domain.service.ts` | `parseDate()` | Nouvelle méthode pour parsing direct de dates |

## Impact

✅ **Résolu** :
- Les dates d'édition sont maintenant correctement extraites
- Les courses proposées sont créées lors de l'application
- Support de la structure imbriquée du FFA Scraper

✅ **Préservé** :
- Rétrocompatibilité avec l'ancienne structure plate
- `currentEditionEventId` déjà corrigé précédemment
- Tous les autres champs d'édition fonctionnent

## Commande de test

```bash
# Appliquer une proposition NEW_EVENT
curl -X POST http://localhost:3000/api/proposals/{proposalId}/apply

# Vérifier la création
psql $DATABASE_URL -c "
SELECT 
  e.id as event_id, 
  e.name as event_name,
  ed.id as edition_id,
  ed.\"startDate\",
  r.id as race_id,
  r.name as race_name
FROM \"Event\" e
LEFT JOIN \"Edition\" ed ON ed.\"eventId\" = e.id
LEFT JOIN \"Race\" r ON r.\"eventId\" = e.id
WHERE e.id = 15178;
"
```

## Références

- Issue : Dates et courses manquantes lors de création NEW_EVENT
- PR : Fix extraction edition.new fields
- Commit : `<hash>` - Fix edition and race extraction from nested structure
