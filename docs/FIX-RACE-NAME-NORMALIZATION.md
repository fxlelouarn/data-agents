# Fix: Normalisation des noms de courses FFA

**Date** : 2025-11-14  
**Status** : ✅ Implémenté  
**Impact** : Nommage standardisé et meilleur matching des courses

## Problème

Les courses FFA ont des noms très variés et non normalisés :
- `"1/2 Marathon"` → Devrait être `"Course 21 km"`
- `"Trail 10km"` → Devrait être `"Trail 10 km"`
- `"10 km Enfants"` → Devrait être `"Course Enfants 10 km"`
- `"Marche Nordique 8 km"` → Devrait être `"Marche Nordique 8 km"` ✅
- `"Course Relais 4x5km"` → Devrait être `"Course Relais 20 km"`

**Conséquence** :
- Difficulté à matcher avec les courses existantes
- Noms incohérents dans Miles Republic
- Impossibilité de rechercher par format standard

## Solution : Format standardisé

### Format cible

```
[Category Level 1] [Relais ?] [Enfants ?] [Distance]
```

**Exemples** :
- `"Course 21 km"` (RUNNING, HALF_MARATHON)
- `"Trail 25 km"` (TRAIL, LONG_TRAIL)
- `"Marche Nordique 8 km"` (WALK, NORDIC_WALK)
- `"Course Relais 20 km"` (RUNNING, EKIDEN)
- `"Course Enfants 5 km"` (RUNNING, KM5)
- `"Triathlon S"` (TRIATHLON, TRIATHLON_S)

### Règles de normalisation

#### 1. Extraction de Category Level 1

```typescript
const categoryLevel1Map = {
  'RUNNING': 'Course',
  'TRAIL': 'Trail',
  'WALK': 'Marche',
  'CYCLING': 'Vélo',
  'TRIATHLON': 'Triathlon',
  'FUN': 'Course Fun',
  'OTHER': 'Autre'
}
```

**Cas spéciaux** :
- `NORDIC_WALK` → `"Marche Nordique"`
- `GRAVEL_RIDE` → `"Gravel"`
- `ULTRA_TRAIL` → `"Ultra Trail"`
- `EKIDEN` → Ajouter le mot "Relais" après

#### 2. Détection des modificateurs

**Relais** :
- Mots-clés : `"relais"`, `"ekiden"`, `"x"`
- Exemple : `"4x5km"` → `"Relais 20 km"`

**Enfants** :
- Mots-clés : `"enfant"`, `"kids"`, `"junior"`, `"jeune"`
- Exemple : `"10km enfants"` → `"Course Enfants 10 km"`

#### 3. Normalisation de la distance

```typescript
// Si distance présente
if (distance) {
  distanceStr = `${distance} km`
}

// Cas spéciaux
- < 1 km : "${distance * 1000} m"
- Triathlon : Pas de distance simple (utiliser le nom de level 2)
```

#### 4. Ordre de composition

```
1. Category Label (ex: "Course", "Trail")
2. Qualificatif de type (ex: "Nordique", "Fun")
3. "Relais" (si présent)
4. "Enfants" (si présent)
5. Distance (ex: "21 km")
```

## Implémentation

### Nouvelle fonction `normalizeRaceName()`

```typescript
/**
 * Normalise un nom de course FFA selon le format standard
 * [Category Level 1] [Relais ?] [Enfants ?] [Distance]
 * 
 * @param raceName - Nom brut de la course FFA
 * @param categoryLevel1 - Catégorie inférée
 * @param categoryLevel2 - Sous-catégorie inférée
 * @param distance - Distance en km (optionnelle)
 * @returns Nom normalisé
 */
export function normalizeFFARaceName(
  raceName: string,
  categoryLevel1?: string,
  categoryLevel2?: string,
  distance?: number
): string {
  const lower = raceName.toLowerCase()
  
  // 1. Détection des modificateurs
  const isRelay = /relais|ekiden|x\d/.test(lower)
  const isKids = /enfant|kids|junior|jeune/.test(lower)
  
  // 2. Label de catégorie principal
  let categoryLabel = getCategoryLabel(categoryLevel1, categoryLevel2)
  
  // 3. Composition
  const parts: string[] = []
  
  // Ajouter le label de catégorie
  parts.push(categoryLabel)
  
  // Ajouter "Relais" si détecté
  if (isRelay) {
    parts.push('Relais')
  }
  
  // Ajouter "Enfants" si détecté
  if (isKids) {
    parts.push('Enfants')
  }
  
  // Ajouter la distance
  if (distance) {
    if (distance < 1) {
      parts.push(`${Math.round(distance * 1000)} m`)
    } else {
      parts.push(`${distance} km`)
    }
  }
  
  return parts.join(' ')
}

/**
 * Retourne le label de catégorie à afficher
 */
function getCategoryLabel(
  categoryLevel1?: string,
  categoryLevel2?: string
): string {
  // Cas spéciaux basés sur level 2
  if (categoryLevel2) {
    switch (categoryLevel2) {
      case 'NORDIC_WALK':
        return 'Marche Nordique'
      case 'GRAVEL_RIDE':
      case 'GRAVEL_RACE':
        return 'Gravel'
      case 'ULTRA_TRAIL':
        return 'Ultra Trail'
      case 'TRIATHLON_XS':
      case 'TRIATHLON_S':
      case 'TRIATHLON_M':
      case 'TRIATHLON_L':
      case 'TRIATHLON_XXL':
        return `Triathlon ${categoryLevel2.split('_')[1]}`
      case 'DUATHLON':
        return 'Duathlon'
      case 'AQUATHLON':
        return 'Aquathlon'
      case 'SWIM_RUN':
        return 'Swim Run'
      case 'RUN_BIKE':
        return 'Run Bike'
      // ... autres cas spéciaux
    }
  }
  
  // Fallback sur level 1
  if (categoryLevel1) {
    const level1Map: Record<string, string> = {
      'RUNNING': 'Course',
      'TRAIL': 'Trail',
      'WALK': 'Marche',
      'CYCLING': 'Vélo',
      'TRIATHLON': 'Triathlon',
      'FUN': 'Course Fun',
      'OTHER': 'Autre'
    }
    return level1Map[categoryLevel1] || 'Course'
  }
  
  return 'Course' // Défaut
}
```

## Utilisation dans le matching

### 1. Lors de la création des propositions (FFAScraperAgent)

```typescript
// Ligne 458 (racesToAdd)
const [categoryLevel1, categoryLevel2] = this.inferRaceCategories(
  ffaRace.name,
  ffaRace.distance ? ffaRace.distance / 1000 : undefined
)

// ✅ NOUVEAU : Normaliser le nom
const normalizedName = normalizeFFARaceName(
  ffaRace.name,
  categoryLevel1,
  categoryLevel2,
  ffaRace.distance ? ffaRace.distance / 1000 : undefined
)

racesToAdd.push({
  name: normalizedName,  // Au lieu de ffaRace.name
  distance: ffaRace.distance,
  elevation: ffaRace.positiveElevation,
  startDate: raceStartDate,
  categoryLevel1,
  categoryLevel2
})
```

### 2. Dans l'algorithme de matching hybride (matcher.ts)

```typescript
// Ligne 545 (matchRacesByDistanceAndName)
// Normaliser les deux côtés pour comparaison
const normalizedFFAName = normalizeFFARaceName(
  ffaRace.name,
  ffaRace.categoryLevel1,
  ffaRace.categoryLevel2,
  totalDistanceKm
)

const normalizedDBName = normalizeFFARaceName(
  race.name,
  race.categoryLevel1,
  race.categoryLevel2,
  totalDistanceKm
)

// Fuzzy match sur les noms normalisés
const fuse = new Fuse(normalizedCandidates, {
  keys: ['normalizedName'],
  threshold: 0.4  // Plus strict car noms standardisés
})
```

## Exemples de transformation

### Avant normalization

| Nom FFA | Nom DB | Match ? |
|---------|--------|---------|
| `"1/2 Marathon"` | `"Semi-Marathon"` | ❌ Faible |
| `"Trail 10km"` | `"Trail 10 km"` | ⚠️ Moyen |
| `"Course Relais 4,3km"` | `"Course relais adulte 4,3 km"` | ⚠️ Moyen |
| `"Marche 4,3 km"` | `"Marche nordique 4,3 km"` | ❌ Faible |

### Après normalization

| Nom FFA normalisé | Nom DB normalisé | Match ? |
|-------------------|------------------|---------|
| `"Course 21 km"` | `"Course 21 km"` | ✅ Exact |
| `"Trail 10 km"` | `"Trail 10 km"` | ✅ Exact |
| `"Course Relais 4 km"` | `"Course Relais 4 km"` | ✅ Exact |
| `"Marche 4 km"` | `"Marche Nordique 4 km"` | ✅ Fort |

## Tests

```typescript
// Test 1: Course simple
normalizeFFARaceName("1/2 Marathon", "RUNNING", "HALF_MARATHON", 21)
// → "Course 21 km"

// Test 2: Trail
normalizeFFARaceName("Trail des Loups", "TRAIL", "LONG_TRAIL", 25)
// → "Trail 25 km"

// Test 3: Marche nordique
normalizeFFARaceName("Marche Nordique", "WALK", "NORDIC_WALK", 8)
// → "Marche Nordique 8 km"

// Test 4: Relais
normalizeFFARaceName("Course Relais 4x5km", "RUNNING", "EKIDEN", 20)
// → "Course Relais 20 km"

// Test 5: Enfants
normalizeFFARaceName("10 km Enfants", "RUNNING", "KM10", 10)
// → "Course Enfants 10 km"

// Test 6: Triathlon
normalizeFFARaceName("Triathlon S", "TRIATHLON", "TRIATHLON_S")
// → "Triathlon S"
```

## Impact

### Avant
- ❌ Noms disparates et non standardisés
- ❌ Matching par distance seule (confusion entre courses similaires)
- ❌ Perte d'information sémantique

### Après
- ✅ Noms cohérents et lisibles
- ✅ Matching hybride distance + nom normalisé
- ✅ Préservation des informations (catégorie, type, distance)
- ✅ Meilleure expérience utilisateur

## Fichiers modifiés

1. **`apps/agents/src/ffa/parser.ts`**
   - Nouvelle fonction `normalizeFFARaceName()`
   - Nouvelle fonction `getCategoryLabel()`

2. **`apps/agents/src/FFAScraperAgent.ts`**
   - Utilisation de `normalizeFFARaceName()` pour `racesToAdd` (ligne 458+)
   - Utilisation de `normalizeFFARaceName()` pour NEW_EVENT (ligne 1207+)

3. **`apps/agents/src/ffa/matcher.ts`**
   - Normalisation dans `matchRacesByDistanceAndName()` (ligne 545+)

4. **`apps/api/src/routes/proposals.ts`**
   - Normalisation dans `/convert-to-edition-update` (ligne 1073+)

5. **`docs/FIX-RACE-NAME-NORMALIZATION.md`** (ce fichier)

## Migration

Pas de migration nécessaire pour les données existantes. Le fix s'applique prospectiveement à toutes les nouvelles propositions.

**Note** : Pour renormaliser les courses existantes, voir script à venir.
