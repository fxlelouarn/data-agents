# Corrections nécessaires - Application de propositions

## Contexte

Suite à l'application de la proposition `cmhogrojz01d5zx0mfudjdfzo`, plusieurs problèmes ont été identifiés qui nécessitent des corrections dans le système de création d'Event, Edition et Race.

## Problèmes identifiés

### 1. Event créé (ex: 15178)

#### 1.1 Subdivision Level 1 incorrecte
- **Problème** : `countrySubdivisionNameLevel1 = "G"` au lieu de `"Grand Est"`
- **Problème** : `countrySubdivisionDisplayCodeLevel1 = "G"` au lieu de `"GES"`

#### 1.2 Coordonnées géographiques manquantes
- **Problème** : `longitude` et `latitude` sont `null`
- **Solution** : Géocoder la ville pour obtenir les coordonnées

#### 1.3 URLs manquantes mais non éditables
- **Problème** : `websiteUrl` et `facebookUrl` ne sont pas dans la proposition
- **Solution** : Permettre l'édition même si non proposés initialement

#### 1.4 Slug manquant
- **Problème** : `slug` non généré
- **Format attendu** : `{nom-slugifié}-{eventId}` (ex: `semi-marathon-du-grand-nancy-15178`)

#### 1.5 Flag toUpdate
- **Problème** : `toUpdate` devrait être `true` par défaut
- **Raison** : Permet le traitement par les systèmes d'indexation (Algolia, etc.)

#### 1.6 fullAddress éditable
- **Problème** : `fullAddress` devrait être éditable
- **Format proposé** : `{ville}, {département}, {pays}`
- **Exemple** : `Nancy, Meurthe-et-Moselle, France`

### 2. Edition créée (ex: 52074)

#### 2.1 Dates manquantes
- **Problème** : `startDate` et `endDate` sont `null` alors qu'elles sont connues
- **Source** : Ces dates sont dans la proposition FFA Scraper

#### 2.2 currentEditionEventId incorrect
- **Problème** : `currentEditionEventId` devrait égaler `eventId`
- **Raison** : Cette édition est l'édition courante de l'événement

#### 2.3 dataSource incorrect
- **Problème** : `dataSource` non défini ou incorrect
- **Règles** :
  - `FEDERATION` si agent FFA Scraper ou fédération
  - `TIMER` si agent scrapant les chronométreurs
  - `OTHER` pour les autres cas

### 3. Race non créée

#### 3.1 Race manquante
- **Problème** : La race proposée n'a pas été créée
- **Vérification** : La proposition contient bien les données d'une race (distance, nom, etc.)

## Solutions à implémenter

### Solution 1 : Correction extractEventData()

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

**Ligne 490-521** : Méthode `extractEventData()`

```typescript
private extractEventData(selectedChanges: Record<string, any>): any {
  const city = this.extractNewValue(selectedChanges.city) || ''
  const dept = this.extractNewValue(selectedChanges.countrySubdivisionNameLevel2) || ''
  const region = this.extractNewValue(selectedChanges.countrySubdivisionNameLevel1) || ''
  const country = this.extractNewValue(selectedChanges.country) || 'FR'
  
  return {
    // Requis
    name: this.extractNewValue(selectedChanges.name) || '',
    city,
    country,
    countrySubdivisionNameLevel1: region,
    countrySubdivisionNameLevel2: dept,
    countrySubdivisionDisplayCodeLevel2: this.extractDepartmentCode(dept),
    
    // ✅ FIX 1.1 : Subdivision Level 1
    countrySubdivisionDisplayCodeLevel1: this.extractRegionCode(region),
    
    // ✅ FIX 1.6 : fullAddress éditable
    fullAddress: this.extractNewValue(selectedChanges.fullAddress) || 
                 this.buildFullAddress(city, dept, country),
    
    // ✅ FIX 1.2 : Coordonnées (sera géocodé si manquant)
    latitude: this.extractNewValue(selectedChanges.latitude) ? 
              parseFloat(this.extractNewValue(selectedChanges.latitude)) : 
              undefined,
    longitude: this.extractNewValue(selectedChanges.longitude) ? 
               parseFloat(this.extractNewValue(selectedChanges.longitude)) : 
               undefined,
    
    // ✅ FIX 1.3 : URLs éditables même si non proposées
    websiteUrl: this.extractNewValue(selectedChanges.websiteUrl) || null,
    facebookUrl: this.extractNewValue(selectedChanges.facebookUrl) || null,
    instagramUrl: this.extractNewValue(selectedChanges.instagramUrl) || null,
    twitterUrl: this.extractNewValue(selectedChanges.twitterUrl) || null,
    
    // ✅ FIX 1.4 : Slug (sera généré après création avec l'ID)
    // Note: slug doit être généré APRÈS la création car il contient l'ID
    
    // ✅ FIX 1.5 : toUpdate par défaut
    toUpdate: this.extractNewValue(selectedChanges.toUpdate) ?? true,
    
    // Autres champs (inchangés)
    coverImage: this.extractNewValue(selectedChanges.coverImage),
    images: this.extractNewValue(selectedChanges.images) || [],
    peyceReview: this.extractNewValue(selectedChanges.peyceReview),
    isPrivate: this.extractNewValue(selectedChanges.isPrivate) ?? false,
    isFeatured: this.extractNewValue(selectedChanges.isFeatured) ?? false,
    isRecommended: this.extractNewValue(selectedChanges.isRecommended) ?? false,
    
    // ✅ FIX 2.3 : dataSource (défini par l'agent)
    dataSource: this.extractNewValue(selectedChanges.dataSource) || 'FEDERATION'
  }
}
```

### Solution 2 : Méthode extractRegionCode()

Ajouter une méthode pour extraire les codes région (similaire à `extractDepartmentCode()`).

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

**Après ligne 871** : Ajouter

```typescript
/**
 * Extract region code from subdivision name
 * Ex: "Grand Est" → "GES", "Île-de-France" → "IDF"
 */
private extractRegionCode(regionName?: string): string {
  if (!regionName) return ''
  
  // Mapping régions françaises (13 régions métropolitaines + 5 DOM)
  const regionCodes: Record<string, string> = {
    // Métropole
    'Auvergne-Rhône-Alpes': 'ARA',
    'Bourgogne-Franche-Comté': 'BFC',
    'Bretagne': 'BRE',
    'Centre-Val de Loire': 'CVL',
    'Corse': 'COR',
    'Grand Est': 'GES',
    'Hauts-de-France': 'HDF',
    'Île-de-France': 'IDF',
    'Normandie': 'NOR',
    'Nouvelle-Aquitaine': 'NAQ',
    'Occitanie': 'OCC',
    'Pays de la Loire': 'PDL',
    'Provence-Alpes-Côte d\'Azur': 'PAC',
    // DOM-TOM
    'Guadeloupe': 'GUA',
    'Martinique': 'MTQ',
    'Guyane': 'GUY',
    'La Réunion': 'REU',
    'Mayotte': 'MAY'
  }
  
  return regionCodes[regionName] || ''
}

/**
 * Build full address from components
 */
private buildFullAddress(city: string, department: string, country: string): string {
  const parts = [city, department]
  
  // Ajouter le pays si différent de FR
  if (country !== 'FR') {
    const countryNames: Record<string, string> = {
      'FR': 'France',
      'BE': 'Belgique',
      'CH': 'Suisse',
      'LU': 'Luxembourg',
      'MC': 'Monaco'
    }
    parts.push(countryNames[country] || country)
  } else {
    parts.push('France')
  }
  
  return parts.filter(Boolean).join(', ')
}
```

### Solution 3 : Générer le slug après création

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

**Ligne 139-176** : Méthode `applyNewEvent()`

```typescript
// Create event
const event = await milesRepo.createEvent(eventData)

// ✅ FIX 1.4 : Générer le slug avec l'ID
const slug = this.generateEventSlug(event.name, event.id)
await milesRepo.updateEvent(event.id, { slug })

const createdEditionIds: number[] = []
const createdRaceIds: number[] = []

// Create editions
for (const editionData of editionsData) {
  const edition = await milesRepo.createEdition({
    eventId: event.id,
    // ✅ FIX 2.2 : currentEditionEventId
    currentEditionEventId: event.id,
    ...editionData
  })

  createdEditionIds.push(edition.id)

  // ✅ FIX 3.1 : Create races for this edition
  const editionRaces = racesData.filter(race => 
    race.editionYear === editionData.year
  )
  
  for (const raceData of editionRaces) {
    const race = await milesRepo.createRace({
      editionId: edition.id,
      eventId: event.id,
      ...raceData
    })
    createdRaceIds.push(race.id)
  }
}

// ✅ FIX 1.2 : Géocoder si coordonnées manquantes
if (!event.latitude || !event.longitude) {
  const coords = await this.geocodeCity(event.city, event.country)
  if (coords) {
    await milesRepo.updateEvent(event.id, {
      latitude: coords.latitude,
      longitude: coords.longitude
    })
  }
}
```

### Solution 4 : Méthode generateEventSlug()

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

**Après ligne 871** : Ajouter

```typescript
/**
 * Generate event slug from name and ID
 * Ex: "Semi-Marathon du Grand Nancy" + 15178 → "semi-marathon-du-grand-nancy-15178"
 */
private generateEventSlug(name: string, id: number): string {
  const slugifiedName = name
    .toLowerCase()
    .normalize('NFD') // Décompose les caractères accentués
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[^a-z0-9\s-]/g, '') // Garde uniquement lettres, chiffres, espaces et tirets
    .trim()
    .replace(/\s+/g, '-') // Remplace espaces par tirets
    .replace(/-+/g, '-') // Supprime tirets multiples
  
  return `${slugifiedName}-${id}`
}

/**
 * Geocode city to get coordinates (STUB - à implémenter avec API externe)
 */
private async geocodeCity(city: string, country: string): Promise<{latitude: number, longitude: number} | null> {
  // TODO: Implémenter avec une API de géocodage (Nominatim, Google Maps, etc.)
  this.logger.info(`Géocodage requis pour: ${city}, ${country}`)
  return null
}
```

### Solution 5 : Correction extractEditionsData()

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

**Ligne 526-583** : Méthode `extractEditionsData()`

Ajouter la logique pour `dataSource` :

```typescript
// ✅ FIX 2.3 : dataSource
dataSource: this.extractNewValue(selectedChanges.dataSource) || this.inferDataSource(selectedChanges),
```

Ajouter méthode `inferDataSource()` :

```typescript
/**
 * Infer dataSource from agent type or proposal context
 */
private inferDataSource(selectedChanges: Record<string, any>): string {
  // Vérifier si la proposition vient d'un agent fédération
  const agentName = selectedChanges._agentName || ''
  
  if (agentName.toLowerCase().includes('ffa') || 
      agentName.toLowerCase().includes('federation')) {
    return 'FEDERATION'
  }
  
  if (agentName.toLowerCase().includes('timer') || 
      agentName.toLowerCase().includes('chronometeur')) {
    return 'TIMER'
  }
  
  return 'OTHER'
}
```

### Solution 6 : Repository - Créer Event avec slug

**Fichier** : `packages/database/src/repositories/miles-republic.repository.ts`

Vérifier que la méthode `createEvent()` accepte bien le champ `slug` (optionnel).

### Solution 7 : Dashboard - Édition des champs manquants

**Fichier** : `apps/dashboard/src/components/proposals/ProposalEditor.tsx`

Ajouter les champs `websiteUrl`, `facebookUrl`, `fullAddress` dans l'éditeur de propositions, même s'ils ne sont pas dans `changes` initialement.

```typescript
// Permettre l'ajout de champs non présents initialement
const allowedAdditionalFields = [
  'websiteUrl',
  'facebookUrl',
  'instagramUrl',
  'twitterUrl',
  'fullAddress',
  'latitude',
  'longitude'
]
```

## Plan d'implémentation

1. ✅ **Documenter** : Ce fichier
2. ⏳ **Backend** : Modifications dans `proposal-domain.service.ts`
   - Ajouter `extractRegionCode()`
   - Ajouter `buildFullAddress()`
   - Ajouter `generateEventSlug()`
   - Ajouter `geocodeCity()` (stub)
   - Ajouter `inferDataSource()`
   - Modifier `extractEventData()`
   - Modifier `extractEditionsData()`
   - Modifier `applyNewEvent()`
3. ⏳ **Tests** : Valider avec une nouvelle proposition
4. ⏳ **Frontend** : Dashboard - Permettre édition champs supplémentaires
5. ⏳ **Géocodage** : Implémenter API externe (optionnel)

## Notes

- **Idempotence** : Les corrections doivent permettre de ré-appliquer une proposition sans erreur
- **Backward compatibility** : Ne pas casser les propositions existantes
- **Validation** : Ajouter des tests unitaires pour chaque correction
- **Logs** : Logger toutes les corrections appliquées pour audit

## Références

- Schéma Event : `apps/agents/prisma/miles-republic.prisma` (lignes Event)
- Schéma Edition : `apps/agents/prisma/miles-republic.prisma` (lignes Edition)
- Schéma Race : `apps/agents/prisma/miles-republic.prisma` (lignes Race)
- Service application : `packages/database/src/services/proposal-domain.service.ts`
