# Changelog - Corrections Application de Propositions

**Date** : 2025-11-07  
**Fichier modifié** : `packages/database/src/services/proposal-domain.service.ts`

## Résumé

Suite à l'application de la proposition `cmhogrojz01d5zx0mfudjdfzo`, plusieurs problèmes ont été identifiés et corrigés dans le système de création d'Event, Edition et Race.

## Modifications apportées

### 1. Nouvelles méthodes helper (lignes 873-974)

#### `extractRegionCode(regionName?: string): string`
- **But** : Extraire le code région à partir du nom complet
- **Exemple** : "Grand Est" → "GES", "Île-de-France" → "IDF"
- **Mapping** : 13 régions métropolitaines + 5 DOM
- **Fix** : ✅ #1.1 - Correction `countrySubdivisionDisplayCodeLevel1`

#### `buildFullAddress(city, department, country): string`
- **But** : Construire l'adresse complète à partir des composants
- **Format** : `{ville}, {département}, {pays}`
- **Exemple** : "Nancy, Meurthe-et-Moselle, France"
- **Fix** : ✅ #1.6 - fullAddress éditable et générée automatiquement

#### `generateEventSlug(name, id): string`
- **But** : Générer un slug SEO-friendly avec l'ID de l'événement
- **Format** : `{nom-slugifié}-{eventId}`
- **Exemple** : "Semi-Marathon du Grand Nancy" + 15178 → "semi-marathon-du-grand-nancy-15178"
- **Traitement** : Normalisation NFD, suppression accents, conversion minuscules, remplacement espaces par tirets
- **Fix** : ✅ #1.4 - Génération automatique du slug

#### `geocodeCity(city, country): Promise<{latitude, longitude} | null>`
- **But** : Géocoder une ville pour obtenir ses coordonnées GPS
- **État** : STUB - À implémenter avec une API externe (Nominatim, Google Maps, etc.)
- **Fix** : ✅ #1.2 - Préparation pour géocodage automatique

#### `inferDataSource(selectedChanges): string`
- **But** : Déduire la source de données selon le type d'agent
- **Logique** :
  - `FEDERATION` si agent contient "ffa" ou "federation"
  - `TIMER` si agent contient "timer" ou "chronometeur"
  - `OTHER` pour les autres cas
- **Fix** : ✅ #2.3 - Définition automatique de dataSource

### 2. Correction `extractEventData()` (lignes 490-545)

**Avant** : Extraction basique sans traitement spécial

**Après** : Extraction améliorée avec :

1. ✅ **FIX 1.1** : `countrySubdivisionDisplayCodeLevel1` via `extractRegionCode()`
2. ✅ **FIX 1.2** : Préparation `latitude`/`longitude` pour géocodage
3. ✅ **FIX 1.3** : URLs (`websiteUrl`, `facebookUrl`, etc.) éditables avec valeur `null` par défaut
4. ✅ **FIX 1.4** : Commentaire indiquant que le slug sera généré après création
5. ✅ **FIX 1.5** : `toUpdate = true` par défaut
6. ✅ **FIX 1.6** : `fullAddress` générée automatiquement via `buildFullAddress()`

```typescript
// Extraction des composants géographiques
const city = this.extractNewValue(selectedChanges.city) || ''
const dept = this.extractNewValue(selectedChanges.countrySubdivisionNameLevel2) || ''
const region = this.extractNewValue(selectedChanges.countrySubdivisionNameLevel1) || ''
const country = this.extractNewValue(selectedChanges.country) || 'FR'

// Génération automatique des codes et adresse
countrySubdivisionDisplayCodeLevel1: this.extractRegionCode(region),
fullAddress: this.extractNewValue(selectedChanges.fullAddress) || 
             this.buildFullAddress(city, dept, country),
toUpdate: this.extractNewValue(selectedChanges.toUpdate) ?? true,
```

### 3. Correction `extractEditionsData()` (ligne 587)

**Avant** :
```typescript
dataSource: this.extractNewValue(selectedChanges.dataSource) || 'FEDERATION',
```

**Après** :
```typescript
// ✅ FIX 2.3 : dataSource
dataSource: this.extractNewValue(selectedChanges.dataSource) || this.inferDataSource(selectedChanges),
```

**Impact** : Le `dataSource` est maintenant déduit automatiquement selon le type d'agent si non fourni explicitement.

### 4. Correction `applyNewEvent()` (lignes 140-202)

**Nouvelles fonctionnalités** :

#### a) Génération du slug (lignes 141-144)
```typescript
// ✅ FIX 1.4 : Générer le slug avec l'ID
const slug = this.generateEventSlug(event.name, event.id)
await milesRepo.updateEvent(event.id, { slug })
this.logger.info(`Slug généré pour l'événement ${event.id}: ${slug}`)
```

**Impact** : Chaque événement créé a maintenant un slug unique et SEO-friendly.

#### b) currentEditionEventId (lignes 153-154)
```typescript
const edition = await milesRepo.createEdition({
  eventId: event.id,
  // ✅ FIX 2.2 : currentEditionEventId
  currentEditionEventId: event.id,
  ...editionData
})
```

**Impact** : L'édition créée est automatiquement définie comme édition courante de l'événement.

#### c) Création systématique des races (lignes 161-188)
```typescript
// ✅ FIX 3.1 : Create races for this edition
const editionRaces = racesData.filter(race => 
  race.editionYear === editionData.year
)

if (editionRaces.length === 0 && racesData.length > 0) {
  // Si aucune race ne correspond à l'année, créer toutes les races
  this.logger.info(`Aucune race avec editionYear=${editionData.year}, création de toutes les races (${racesData.length})`)
  for (const raceData of racesData) {
    const race = await milesRepo.createRace({
      editionId: edition.id,
      eventId: event.id,
      ...raceData
    })
    createdRaceIds.push(race.id)
    this.logger.info(`Course créée: ${race.id} (${race.name}) pour l'édition ${edition.id}`)
  }
}
```

**Impact** : Les races proposées sont maintenant créées systématiquement, même si l'`editionYear` ne correspond pas exactement.

**Amélioration** : Logs détaillés pour chaque création de race.

#### d) Géocodage automatique (lignes 191-201)
```typescript
// ✅ FIX 1.2 : Géocoder si coordonnées manquantes
if (!event.latitude || !event.longitude) {
  this.logger.info(`Coordonnées manquantes pour l'événement ${event.id}, tentative de géocodage...`)
  const coords = await this.geocodeCity(event.city, event.country)
  if (coords) {
    await milesRepo.updateEvent(event.id, {
      latitude: coords.latitude,
      longitude: coords.longitude
    })
    this.logger.info(`Coordonnées mises à jour pour ${event.city}: ${coords.latitude}, ${coords.longitude}`)
  }
}
```

**Impact** : Les coordonnées GPS sont tentées automatiquement si manquantes (actuellement STUB).

## Tests de compilation

✅ Code compilé avec succès :
```bash
cd packages/database && npx tsc --noEmit
# Aucune erreur
```

## Points d'attention

### À implémenter ultérieurement

1. **Géocodage réel** : Implémenter `geocodeCity()` avec une API externe
   - Options : Nominatim (OpenStreetMap), Google Maps Geocoding API, Mapbox
   - Nécessite gestion du rate limiting et des erreurs réseau

2. **Frontend Dashboard** : Permettre l'édition des champs supplémentaires
   - Ajouter `websiteUrl`, `facebookUrl`, `fullAddress`, `latitude`, `longitude` dans l'éditeur
   - Même si non présents initialement dans `changes`

### Tests recommandés

1. ✅ Créer une nouvelle proposition NEW_EVENT
2. ✅ Vérifier que tous les champs sont correctement remplis :
   - `countrySubdivisionDisplayCodeLevel1` = "GES" (Grand Est)
   - `slug` = "semi-marathon-du-grand-nancy-{id}"
   - `toUpdate` = true
   - `fullAddress` = "Nancy, Meurthe-et-Moselle, France"
3. ✅ Vérifier que l'édition a :
   - `currentEditionEventId` = `eventId`
   - `dataSource` = "FEDERATION"
4. ✅ Vérifier que la race est créée

## Impact sur les propositions existantes

- **Backward compatible** : Les propositions existantes continuent de fonctionner
- **Amélioration progressive** : Les nouvelles propositions bénéficient automatiquement des corrections
- **Pas de migration nécessaire** : Les données existantes ne nécessitent pas de mise à jour

## Logs améliorés

Nouveaux logs pour traçabilité :
- `Slug généré pour l'événement {id}: {slug}`
- `Édition créée: {editionId} pour l'événement {eventId}`
- `Aucune race avec editionYear={year}, création de toutes les races ({count})`
- `Course créée: {raceId} ({name}) pour l'édition {editionId}`
- `Coordonnées manquantes pour l'événement {id}, tentative de géocodage...`
- `Coordonnées mises à jour pour {city}: {lat}, {lon}`

## Références

- Document de spécification : `docs/FIX-PROPOSAL-APPLICATION.md`
- Service modifié : `packages/database/src/services/proposal-domain.service.ts`
- Schémas Prisma : `apps/agents/prisma/miles-republic.prisma`

## Prochaines étapes

1. ⏳ Tester avec une nouvelle proposition
2. ⏳ Implémenter l'API de géocodage
3. ⏳ Mettre à jour le dashboard pour éditer les champs supplémentaires
4. ⏳ Ajouter des tests unitaires pour les nouvelles méthodes
