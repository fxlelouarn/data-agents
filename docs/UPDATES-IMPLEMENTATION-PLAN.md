# Plan d'Action - Implémentation des Mises à Jour Miles Republic

**Objectif** : Finaliser l'implémentation de l'application automatique des propositions approuvées dans la base de données Miles Republic.

**État actuel** : 
- ✅ Infrastructure en place (`ProposalApplicationService`, `ProposalDomainService`, `MilesRepublicRepository`)
- ✅ Routes API fonctionnelles (`/api/updates/:id/apply`, approbation automatique)
- ⚠️ Implémentation partielle : certains champs manquants, besoin d'audit complet

## Architecture Existante

```
ProposalApplicationService (Facade)
    ↓
ProposalDomainService (Business Logic)
    ↓
MilesRepublicRepository (Data Access)
    ↓
Miles Republic DB (Prisma Client)
```

### Flux d'Application

1. **Proposition approuvée** → `ProposalApplicationService.applyProposal()`
2. **Validation business** → Vérif statut APPROVED, merge userModifiedChanges
3. **Routing par type** → NEW_EVENT | EVENT_UPDATE | EDITION_UPDATE | RACE_UPDATE
4. **Extraction données** → `extractEventData()`, `extractEditionsData()`, `extractRacesData()`
5. **Opérations Prisma** → `MilesRepublicRepository.createEvent()` / `updateEvent()` etc.
6. **Résultat** → `ProposalApplicationResult` avec success/errors/createdIds

---

## Phase 1 : Audit de l'Implémentation

### 1.1 Vérifier les Champs Event

**Schéma Prisma Miles Republic (Event)**
```prisma
model Event {
  id                                  Int
  name                                String
  city                                String
  countrySubdivisionNameLevel1        String
  countrySubdivisionDisplayCodeLevel1 String?
  countrySubdivisionNameLevel2        String
  countrySubdivisionDisplayCodeLevel2 String
  country                             String
  longitude                           Float?
  latitude                            Float?
  peyceReview                         String?
  websiteUrl                          String?
  facebookUrl                         String?
  twitterUrl                          String?
  instagramUrl                        String?
  images                              String[]
  coverImage                          String?
  isFeatured                          Boolean?
  status                              EventStatus
  slug                                String?
  toUpdate                            Boolean?
  algoliaObjectToUpdate               Boolean?
  algoliaObjectToDelete               Boolean?
  createdAt                           DateTime
  createdBy                           String
  updatedAt                           DateTime
  updatedBy                           String
  fullAddress                         String?
  oldSlugId                           Int?
  eventHubspotId                      String?
  eventSwellId                        String?
  dataSource                          DataSource?
  isPrivate                           Boolean?
  isRecommended                       Boolean
  revalidatedAt                       DateTime?
}
```

**Implementation actuelle (MilesRepublicRepository.createEvent)**
```typescript
// ✅ Présents
name, city, country, websiteUrl, facebookUrl, instagramUrl, twitterUrl
fullAddress, latitude, longitude, coverImage
isPrivate, isFeatured, isRecommended, status
createdBy, updatedBy

// ❌ MANQUANTS
countrySubdivisionNameLevel1        // REQUIS (NOT NULL)
countrySubdivisionDisplayCodeLevel1 // Optionnel
countrySubdivisionNameLevel2        // REQUIS (NOT NULL)
countrySubdivisionDisplayCodeLevel2 // REQUIS (NOT NULL)
peyceReview                          // Optionnel (review text)
images                               // Array de URLs
slug                                 // Optionnel (auto-généré?)
toUpdate                             // Boolean par défaut false
algoliaObjectToUpdate                // Boolean par défaut false
algoliaObjectToDelete                // Boolean par défaut false
dataSource                           // Enum: ORGANIZER | TIMER | FEDERATION | PEYCE | OTHER
```

**Actions requises**
- [ ] Ajouter les champs `countrySubdivision*` avec valeurs par défaut intelligentes
- [ ] Gérer le champ `dataSource` avec valeur par défaut `FEDERATION` pour agent FFA
- [ ] Ajouter support pour `images` (array de strings)
- [ ] Gérer `peyceReview` si disponible dans les propositions
- [ ] Ajouter flags Algolia par défaut (`toUpdate: true`, `algoliaObjectToUpdate: true`)

### 1.2 Vérifier les Champs Edition

**Schéma Prisma Miles Republic (Edition)**
```prisma
model Edition {
  id                                  Int
  createdAt                           DateTime
  createdBy                           String
  updatedAt                           DateTime
  updatedBy                           String
  confirmedAt                         DateTime?
  medusaVersion                       MedusaVersion // V1 | V2
  slug                                String
  currency                            String
  startDate                           DateTime?
  endDate                             DateTime?
  year                                String
  clientExternalUrl                   String?
  registrantsNumber                   Int?
  registrationOpeningDate             DateTime?
  registrationClosingDate             DateTime?
  whatIsIncluded                      String?
  toUpdate                            Boolean
  bibWithdrawalFullAddress            String?
  volunteerCode                       String?
  isAttendeeListPublic                Boolean
  publicAttendeeListColumns           String[]
  hasEditedDates                      Boolean
  timeZone                            String
  editionInfo                         EditionInfo?
  customerType                        CustomerType? // BASIC | PREMIUM | ESSENTIAL | MEDIA | LEAD_INT | LEAD_EXT
  dataSource                          DataSource?
  status                              EditionStatus // DRAFT | LIVE
  calendarStatus                      CalendarStatus // CONFIRMED | CANCELED | TO_BE_CONFIRMED
  clientStatus                        ClientStatus?
  federationId                        String?
  airtableId                          String?
  organizerStripeConnectedAccountId   String?
  eventId                             Int
  organizationId                      Int?
}
```

**Implementation actuelle (MilesRepublicRepository.createEdition)**
```typescript
// ✅ Présents
eventId, year, calendarStatus, clientStatus, currency, customerType
medusaVersion, startDate, endDate, registrationOpeningDate, registrationClosingDate
registrantsNumber, federationId, timeZone, status
createdBy, updatedBy

// ❌ MANQUANTS
confirmedAt                         // DateTime? (date de confirmation)
slug                                // String (généré par défaut)
clientExternalUrl                   // String? (URL externe)
whatIsIncluded                      // String? (description inclusions)
toUpdate                            // Boolean (flag de sync)
bibWithdrawalFullAddress            // String? (adresse retrait dossards)
volunteerCode                       // String? (code bénévoles)
isAttendeeListPublic                // Boolean (liste participants publique)
publicAttendeeListColumns           // String[] (colonnes visibles)
hasEditedDates                      // Boolean (dates modifiées manuellement)
dataSource                          // DataSource?
airtableId                          // String? (ID Airtable legacy)
organizerStripeConnectedAccountId   // String? (Stripe account)
organizationId                      // Int? (relation Organization)
```

**Actions requises**
- [ ] Ajouter champs de métadonnées (`dataSource`, `confirmedAt`, `toUpdate`)
- [ ] Ajouter champs fonctionnels (`whatIsIncluded`, `clientExternalUrl`)
- [ ] Gérer les flags de visibilité (`isAttendeeListPublic`, `publicAttendeeListColumns`)
- [ ] Gérer l'organisation (`organizationId`) si disponible
- [ ] Ajouter valeurs par défaut correctes

### 1.3 Vérifier les Champs Race

**Schéma Prisma Miles Republic (Race)**
```prisma
model Race {
  id                                  Int
  createdAt                           DateTime
  createdBy                           String
  updatedAt                           DateTime
  updatedBy                           String
  name                                String
  startDate                           DateTime?
  swimDistance                        Float
  walkDistance                        Float
  bikeDistance                        Float
  runDistance                         Float
  runDistance2                        Float
  swimRunDistance                     Float
  bikeRunDistance                     Float
  runPositiveElevation                Float?
  runNegativeElevation                Float?
  price                               Float?
  priceType                           PriceType // PER_TEAM | PER_PERSON
  paymentCollectionType               PaymentCollectionType // SINGLE | MULTIPLE
  products                            String[]
  airtableId                          String?
  slug                                String?
  toUpdate                            Boolean
  bikeNegativeElevation               Float?
  bikePositiveElevation               Float?
  walkNegativeElevation               Float?
  walkPositiveElevation               Float?
  timeZone                            String?
  registrationClosingDate             DateTime?
  registrationOpeningDate             DateTime?
  isActive                            Boolean
  isArchived                          Boolean
  categoryLevel1                      String?
  categoryLevel2                      String?
  askAttendeeGender                   Boolean
  askAttendeeBirthDate                Boolean
  askAttendeePhoneNumber              Boolean
  askAttendeeNationality              Boolean
  askAttendeePostalAddress            Boolean
  externalFunnelURL                   String?
  minTeamSize                         Int?
  maxTeamSize                         Int?
  showClubOrAssoInput                 Boolean
  showPublicationConsentCheckbox      Boolean
  isWaitingList                       Boolean
  resaleEnabled                       Boolean
  displayOrder                        Int?
  raceVariantStoreId                  String?
  medusaProductId                     String?
  raceHubspotId                       String?
  raceSwellId                         String?
  federationId                        String?
  distance                            RaceDistance? // @deprecated
  type                                RaceType? // @deprecated
  dataSource                          DataSource?
  licenseNumberType                   LicenseNumberType? // FFA | FFTRI | FFS | NONE
  distanceCategory                    DistanceCategoryType? // XXS | XS | S | M | L | XL | XXL
  adultJustificativeOptions           AdultJustificativeType?
  minorJustificativeOptions           MinorJustificativeType?
  raceInfo                            RaceInfo?
  editionId                           Int
  eventId                             Int
  stockDisplayThreshold               RaceStockDisplayThreshold
  stockDisplayThresholdValue          Int
}
```

**Implementation actuelle (MilesRepublicRepository.createRace)**
```typescript
// ✅ Présents
editionId, eventId, name, startDate, price
runDistance, runDistance2, bikeDistance, swimDistance, walkDistance
bikeRunDistance, swimRunDistance
runPositiveElevation, runNegativeElevation
bikePositiveElevation, bikeNegativeElevation
walkPositiveElevation, walkNegativeElevation
categoryLevel1, categoryLevel2, distanceCategory
registrationOpeningDate, registrationClosingDate
federationId, isActive, type
createdBy, updatedBy

// ❌ MANQUANTS
priceType                           // PriceType (par défaut PER_PERSON)
paymentCollectionType               // PaymentCollectionType (par défaut SINGLE)
products                            // String[] (produits Medusa)
toUpdate                            // Boolean (flag de sync)
timeZone                            // String? (fuseau horaire)
isArchived                          // Boolean (archivé)
askAttendeeGender                   // Boolean (demander genre)
askAttendeeBirthDate                // Boolean (demander date naissance)
askAttendeePhoneNumber              // Boolean (demander téléphone)
askAttendeeNationality              // Boolean (demander nationalité)
askAttendeePostalAddress            // Boolean (demander adresse)
externalFunnelURL                   // String? (URL inscription externe)
minTeamSize                         // Int? (taille min équipe)
maxTeamSize                         // Int? (taille max équipe)
showClubOrAssoInput                 // Boolean (afficher club)
showPublicationConsentCheckbox      // Boolean (consentement publication)
isWaitingList                       // Boolean (liste d'attente)
resaleEnabled                       // Boolean (revente activée)
displayOrder                        // Int? (ordre affichage)
dataSource                          // DataSource?
licenseNumberType                   // LicenseNumberType? (type licence)
distance                            // RaceDistance? (@deprecated mais toujours utilisé)
adultJustificativeOptions           // AdultJustificativeType?
minorJustificativeOptions           // MinorJustificativeType?
stockDisplayThreshold               // RaceStockDisplayThreshold (par défaut BELOW)
stockDisplayThresholdValue          // Int (par défaut 10)
```

**Actions requises**
- [ ] Ajouter champs de configuration d'inscription (`askAttendee*`, `showClubOrAssoInput`, etc.)
- [ ] Ajouter champs de pricing (`priceType`, `paymentCollectionType`)
- [ ] Ajouter champs fonctionnels (`isWaitingList`, `resaleEnabled`, `externalFunnelURL`)
- [ ] Gérer les champs d'équipe (`minTeamSize`, `maxTeamSize`)
- [ ] Ajouter métadonnées (`dataSource`, `toUpdate`, `displayOrder`)
- [ ] Gérer les justificatifs (`adultJustificativeOptions`, `minorJustificativeOptions`, `licenseNumberType`)
- [ ] Ajouter valeurs par défaut pour tous les booléens et enums

---

## Phase 2 : Mapping Proposition → Miles Republic

### 2.1 NEW_EVENT - Champs Source

**Sources de données agent FFA**
```typescript
{
  // EVENT
  name: "Diab'olo Run",
  city: "Saint-Apollinaire",
  country: "FR",
  countrySubdivisionNameLevel1: "Bourgogne-Franche-Comté",
  countrySubdivisionNameLevel2: "Côte-d'Or",
  
  // EDITION
  year: "2025",
  startDate: "2025-11-24T09:00:00Z",
  calendarStatus: "CONFIRMED",
  
  // RACE
  raceName: "10 km",
  runDistance: 10.0,
  price: 15.00,
  federationId: "FFA_123456"
}
```

**Mapping vers Miles Republic**
```typescript
// Event
Event.create({
  name: changes.name,
  city: changes.city,
  country: changes.country || 'FR',
  countrySubdivisionNameLevel1: changes.countrySubdivisionNameLevel1 || '',
  countrySubdivisionNameLevel2: changes.countrySubdivisionNameLevel2 || '',
  countrySubdivisionDisplayCodeLevel2: extractDepartmentCode(changes.countrySubdivisionNameLevel2),
  status: 'DRAFT',
  dataSource: 'FEDERATION',
  createdBy: 'data-agents',
  updatedBy: 'data-agents',
  toUpdate: false,
  algoliaObjectToUpdate: true,
  isRecommended: false
})

// Edition
Edition.create({
  eventId: event.id,
  year: changes.year || new Date().getFullYear().toString(),
  startDate: changes.startDate ? new Date(changes.startDate) : null,
  calendarStatus: 'CONFIRMED',
  status: 'DRAFT',
  currency: 'EUR',
  medusaVersion: 'V1',
  timeZone: 'Europe/Paris',
  dataSource: 'FEDERATION',
  isAttendeeListPublic: true,
  hasEditedDates: false,
  toUpdate: false,
  createdBy: 'data-agents',
  updatedBy: 'data-agents'
})

// Race
Race.create({
  eventId: event.id,
  editionId: edition.id,
  name: changes.raceName || 'Course principale',
  runDistance: changes.runDistance || 0,
  price: changes.price || null,
  federationId: changes.federationId || null,
  startDate: changes.startDate ? new Date(changes.startDate) : null,
  isActive: true,
  isArchived: false,
  dataSource: 'FEDERATION',
  priceType: 'PER_PERSON',
  paymentCollectionType: 'SINGLE',
  askAttendeeGender: true,
  askAttendeeBirthDate: true,
  askAttendeePhoneNumber: true,
  askAttendeeNationality: true,
  askAttendeePostalAddress: true,
  showClubOrAssoInput: true,
  showPublicationConsentCheckbox: true,
  isWaitingList: false,
  resaleEnabled: false,
  stockDisplayThreshold: 'BELOW',
  stockDisplayThresholdValue: 10,
  swimDistance: 0,
  walkDistance: 0,
  bikeDistance: 0,
  runDistance2: 0,
  swimRunDistance: 0,
  bikeRunDistance: 0,
  toUpdate: false,
  createdBy: 'data-agents',
  updatedBy: 'data-agents'
})
```

### 2.2 EVENT_UPDATE - Champs Modifiables

**Champs autorisés pour mise à jour Event**
```typescript
// Informations de base
name, city, country
countrySubdivisionNameLevel1, countrySubdivisionNameLevel2

// URLs et liens
websiteUrl, facebookUrl, instagramUrl, twitterUrl

// Géolocalisation
fullAddress, latitude, longitude

// Visuel
coverImage, images[]

// Flags
isPrivate, isFeatured, isRecommended

// Métadonnées
dataSource, peyceReview

// Note: status n'est PAS modifiable par les agents (gestion manuelle)
```

### 2.3 EDITION_UPDATE - Champs Modifiables

**Champs autorisés pour mise à jour Edition**
```typescript
// Dates
startDate, endDate
registrationOpeningDate, registrationClosingDate

// Statuts
calendarStatus: CONFIRMED | CANCELED | TO_BE_CONFIRMED
clientStatus: EXTERNAL_SALES_FUNNEL | INTERNAL_SALES_FUNNEL | NEW_SALES_FUNNEL

// Informations
registrantsNumber
whatIsIncluded
clientExternalUrl

// Configuration
currency
timeZone
federationId

// Métadonnées
dataSource

// Races (opérations spéciales)
races: [{ raceId, runDistance, price, ... }]  // Mise à jour races existantes
racesToAdd: [{ name, runDistance, ... }]       // Ajout nouvelles races
racesToDelete: [raceId1, raceId2]              // Suppression races

// Note: status, year, medusaVersion ne sont PAS modifiables après création
```

### 2.4 RACE_UPDATE - Champs Modifiables

**Champs autorisés pour mise à jour Race**
```typescript
// Informations de base
name
startDate

// Prix
price
priceType: PER_TEAM | PER_PERSON
paymentCollectionType: SINGLE | MULTIPLE

// Distances
runDistance, runDistance2
bikeDistance, swimDistance, walkDistance
bikeRunDistance, swimRunDistance

// Dénivelés
runPositiveElevation, runNegativeElevation
bikePositiveElevation, bikeNegativeElevation
walkPositiveElevation, walkNegativeElevation

// Catégories
categoryLevel1, categoryLevel2
distanceCategory: XXS | XS | S | M | L | XL | XXL
type: ROAD_RACE | TRAIL | TRIATHLON | ...  (@deprecated)

// Dates d'inscription
registrationOpeningDate
registrationClosingDate

// Configuration
timeZone
federationId
licenseNumberType: FFA | FFTRI | FFS | NONE

// Équipes
minTeamSize, maxTeamSize

// Inscription externe
externalFunnelURL

// Métadonnées
dataSource

// Note: eventId, editionId, isActive, isArchived ne sont PAS modifiables
```

---

## Phase 3 : Implémentation Complète

### 3.1 Compléter MilesRepublicRepository

**Fichier** : `packages/database/src/repositories/miles-republic.repository.ts`

```typescript
async createEvent(data: {
  // Requis
  name: string
  city: string
  country: string
  countrySubdivisionNameLevel1: string
  countrySubdivisionNameLevel2: string
  countrySubdivisionDisplayCodeLevel2: string
  
  // Optionnels
  countrySubdivisionDisplayCodeLevel1?: string
  longitude?: number
  latitude?: number
  peyceReview?: string
  websiteUrl?: string
  facebookUrl?: string
  twitterUrl?: string
  instagramUrl?: string
  images?: string[]
  coverImage?: string
  fullAddress?: string
  
  // Flags
  isFeatured?: boolean
  isPrivate?: boolean
  isRecommended?: boolean
  
  // Métadonnées
  status?: 'DRAFT' | 'REVIEW' | 'LIVE' | 'DELETED' | 'DEAD'
  dataSource?: 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
  slug?: string
}) {
  return this.milesDb.event.create({
    data: {
      ...data,
      country: data.country || 'FR',
      countrySubdivisionNameLevel1: data.countrySubdivisionNameLevel1 || '',
      countrySubdivisionNameLevel2: data.countrySubdivisionNameLevel2 || '',
      countrySubdivisionDisplayCodeLevel2: data.countrySubdivisionDisplayCodeLevel2 || '',
      isPrivate: data.isPrivate ?? false,
      isFeatured: data.isFeatured ?? false,
      isRecommended: data.isRecommended ?? false,
      status: data.status || 'DRAFT',
      dataSource: data.dataSource,
      images: data.images || [],
      toUpdate: false,
      algoliaObjectToUpdate: true,
      algoliaObjectToDelete: false,
      createdBy: 'data-agents',
      updatedBy: 'data-agents'
    }
  })
}

async createEdition(data: {
  // Requis
  eventId: number
  year: string
  
  // Dates
  startDate?: Date | null
  endDate?: Date | null
  registrationOpeningDate?: Date | null
  registrationClosingDate?: Date | null
  confirmedAt?: Date | null
  
  // Statuts
  calendarStatus?: 'CONFIRMED' | 'CANCELED' | 'TO_BE_CONFIRMED'
  clientStatus?: 'EXTERNAL_SALES_FUNNEL' | 'INTERNAL_SALES_FUNNEL' | 'NEW_SALES_FUNNEL'
  status?: 'DRAFT' | 'LIVE'
  
  // Configuration
  currency?: string
  timeZone?: string
  medusaVersion?: 'V1' | 'V2'
  customerType?: 'BASIC' | 'PREMIUM' | 'ESSENTIAL' | 'MEDIA' | 'LEAD_INT' | 'LEAD_EXT'
  
  // Informations
  registrantsNumber?: number
  whatIsIncluded?: string
  clientExternalUrl?: string
  bibWithdrawalFullAddress?: string
  volunteerCode?: string
  
  // Flags
  isAttendeeListPublic?: boolean
  publicAttendeeListColumns?: string[]
  hasEditedDates?: boolean
  toUpdate?: boolean
  
  // Métadonnées
  federationId?: string
  dataSource?: 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
  airtableId?: string
  organizerStripeConnectedAccountId?: string
  organizationId?: number
}) {
  return this.milesDb.edition.create({
    data: {
      ...data,
      calendarStatus: data.calendarStatus || 'TO_BE_CONFIRMED',
      status: data.status || 'DRAFT',
      currency: data.currency || 'EUR',
      medusaVersion: data.medusaVersion || 'V1',
      timeZone: data.timeZone || 'Europe/Paris',
      isAttendeeListPublic: data.isAttendeeListPublic ?? true,
      publicAttendeeListColumns: data.publicAttendeeListColumns || [],
      hasEditedDates: data.hasEditedDates ?? false,
      toUpdate: data.toUpdate ?? false,
      createdBy: 'data-agents',
      updatedBy: 'data-agents'
    }
  })
}

async createRace(data: {
  // Requis
  editionId: number
  eventId: number
  name: string
  
  // Dates
  startDate?: Date | null
  registrationOpeningDate?: Date | null
  registrationClosingDate?: Date | null
  
  // Prix
  price?: number
  priceType?: 'PER_TEAM' | 'PER_PERSON'
  paymentCollectionType?: 'SINGLE' | 'MULTIPLE'
  
  // Distances (Float)
  runDistance?: number
  runDistance2?: number
  bikeDistance?: number
  swimDistance?: number
  walkDistance?: number
  bikeRunDistance?: number
  swimRunDistance?: number
  
  // Dénivelés (Float)
  runPositiveElevation?: number
  runNegativeElevation?: number
  bikePositiveElevation?: number
  bikeNegativeElevation?: number
  walkPositiveElevation?: number
  walkNegativeElevation?: number
  
  // Catégories
  categoryLevel1?: string
  categoryLevel2?: string
  distanceCategory?: 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
  distance?: string  // @deprecated RaceDistance enum
  type?: string      // @deprecated RaceType enum
  
  // Configuration inscription
  askAttendeeGender?: boolean
  askAttendeeBirthDate?: boolean
  askAttendeePhoneNumber?: boolean
  askAttendeeNationality?: boolean
  askAttendeePostalAddress?: boolean
  showClubOrAssoInput?: boolean
  showPublicationConsentCheckbox?: boolean
  
  // Équipes
  minTeamSize?: number
  maxTeamSize?: number
  
  // Fonctionnalités
  isWaitingList?: boolean
  resaleEnabled?: boolean
  externalFunnelURL?: string
  
  // Stock
  stockDisplayThreshold?: 'BELOW' | 'ALWAYS' | 'NEVER'
  stockDisplayThresholdValue?: number
  
  // Métadonnées
  federationId?: string
  licenseNumberType?: 'FFA' | 'FFTRI' | 'FFS' | 'NONE'
  dataSource?: 'ORGANIZER' | 'TIMER' | 'FEDERATION' | 'PEYCE' | 'OTHER'
  adultJustificativeOptions?: 'MEDICAL_CERTIFICATE' | 'NONE'
  minorJustificativeOptions?: 'HEALTH_QUESTIONNAIRE' | 'PARENTAL_AUTHORIZATION' | 'CHECKBOX_AUTHORIZATION' | 'NONE'
  
  // Flags
  isActive?: boolean
  isArchived?: boolean
  toUpdate?: boolean
  displayOrder?: number
  
  // Produits Medusa
  products?: string[]
  timeZone?: string
}) {
  return this.milesDb.race.create({
    data: {
      ...data,
      // Distances par défaut 0
      runDistance: data.runDistance ?? 0,
      runDistance2: data.runDistance2 ?? 0,
      bikeDistance: data.bikeDistance ?? 0,
      swimDistance: data.swimDistance ?? 0,
      walkDistance: data.walkDistance ?? 0,
      bikeRunDistance: data.bikeRunDistance ?? 0,
      swimRunDistance: data.swimRunDistance ?? 0,
      
      // Prix par défaut
      priceType: data.priceType || 'PER_PERSON',
      paymentCollectionType: data.paymentCollectionType || 'SINGLE',
      
      // Champs inscription par défaut true
      askAttendeeGender: data.askAttendeeGender ?? true,
      askAttendeeBirthDate: data.askAttendeeBirthDate ?? true,
      askAttendeePhoneNumber: data.askAttendeePhoneNumber ?? true,
      askAttendeeNationality: data.askAttendeeNationality ?? true,
      askAttendeePostalAddress: data.askAttendeePostalAddress ?? true,
      showClubOrAssoInput: data.showClubOrAssoInput ?? true,
      showPublicationConsentCheckbox: data.showPublicationConsentCheckbox ?? true,
      
      // Fonctionnalités par défaut false
      isWaitingList: data.isWaitingList ?? false,
      resaleEnabled: data.resaleEnabled ?? false,
      
      // Stock par défaut
      stockDisplayThreshold: data.stockDisplayThreshold || 'BELOW',
      stockDisplayThresholdValue: data.stockDisplayThresholdValue ?? 10,
      
      // Flags
      isActive: data.isActive !== false,
      isArchived: data.isArchived ?? false,
      toUpdate: data.toUpdate ?? false,
      
      // Produits
      products: data.products || [],
      
      // Métadonnées
      createdBy: 'data-agents',
      updatedBy: 'data-agents'
    }
  })
}
```

### 3.2 Compléter ProposalDomainService

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

```typescript
private extractEventData(selectedChanges: Record<string, any>): any {
  return {
    // Requis
    name: selectedChanges.name || '',
    city: selectedChanges.city || '',
    country: selectedChanges.country || 'FR',
    countrySubdivisionNameLevel1: selectedChanges.countrySubdivisionNameLevel1 || '',
    countrySubdivisionNameLevel2: selectedChanges.countrySubdivisionNameLevel2 || '',
    countrySubdivisionDisplayCodeLevel2: this.extractDepartmentCode(selectedChanges.countrySubdivisionNameLevel2),
    
    // Optionnels
    countrySubdivisionDisplayCodeLevel1: selectedChanges.countrySubdivisionDisplayCodeLevel1,
    websiteUrl: selectedChanges.websiteUrl,
    facebookUrl: selectedChanges.facebookUrl,
    instagramUrl: selectedChanges.instagramUrl,
    twitterUrl: selectedChanges.twitterUrl,
    fullAddress: selectedChanges.fullAddress,
    latitude: selectedChanges.latitude ? parseFloat(selectedChanges.latitude) : undefined,
    longitude: selectedChanges.longitude ? parseFloat(selectedChanges.longitude) : undefined,
    coverImage: selectedChanges.coverImage,
    images: selectedChanges.images || [],
    peyceReview: selectedChanges.peyceReview,
    
    // Flags
    isPrivate: selectedChanges.isPrivate ?? false,
    isFeatured: selectedChanges.isFeatured ?? false,
    isRecommended: selectedChanges.isRecommended ?? false,
    
    // Métadonnées
    dataSource: selectedChanges.dataSource || 'FEDERATION'
  }
}

private extractEditionsData(selectedChanges: Record<string, any>): any[] {
  if (selectedChanges.year || selectedChanges.startDate || selectedChanges.endDate) {
    return [{
      year: selectedChanges.year || new Date().getFullYear().toString(),
      
      // Dates
      startDate: selectedChanges.startDate ? new Date(selectedChanges.startDate) : null,
      endDate: selectedChanges.endDate ? new Date(selectedChanges.endDate) : null,
      registrationOpeningDate: selectedChanges.registrationOpeningDate ? new Date(selectedChanges.registrationOpeningDate) : null,
      registrationClosingDate: selectedChanges.registrationClosingDate ? new Date(selectedChanges.registrationClosingDate) : null,
      confirmedAt: selectedChanges.confirmedAt ? new Date(selectedChanges.confirmedAt) : null,
      
      // Statuts
      calendarStatus: selectedChanges.calendarStatus || 'CONFIRMED',
      clientStatus: selectedChanges.clientStatus,
      status: selectedChanges.status || 'DRAFT',
      
      // Configuration
      currency: selectedChanges.currency || 'EUR',
      timeZone: selectedChanges.timeZone || 'Europe/Paris',
      medusaVersion: selectedChanges.medusaVersion || 'V1',
      customerType: selectedChanges.customerType,
      
      // Informations
      registrantsNumber: selectedChanges.registrantsNumber ? parseInt(selectedChanges.registrantsNumber) : undefined,
      whatIsIncluded: selectedChanges.whatIsIncluded,
      clientExternalUrl: selectedChanges.clientExternalUrl,
      bibWithdrawalFullAddress: selectedChanges.bibWithdrawalFullAddress,
      volunteerCode: selectedChanges.volunteerCode,
      
      // Flags
      isAttendeeListPublic: selectedChanges.isAttendeeListPublic ?? true,
      publicAttendeeListColumns: selectedChanges.publicAttendeeListColumns || [],
      hasEditedDates: selectedChanges.hasEditedDates ?? false,
      
      // Métadonnées
      federationId: selectedChanges.federationId,
      dataSource: selectedChanges.dataSource || 'FEDERATION',
      airtableId: selectedChanges.airtableId,
      organizerStripeConnectedAccountId: selectedChanges.organizerStripeConnectedAccountId,
      organizationId: selectedChanges.organizationId ? parseInt(selectedChanges.organizationId) : undefined
    }]
  }

  // Multiple editions (edge case)
  const editions = []
  for (const [key, value] of Object.entries(selectedChanges)) {
    if (key.startsWith('edition_') && typeof value === 'object') {
      editions.push(value)
    }
  }

  return editions.length > 0 ? editions : [{
    year: new Date().getFullYear().toString(),
    calendarStatus: 'CONFIRMED',
    status: 'DRAFT'
  }]
}

private extractRacesData(selectedChanges: Record<string, any>): any[] {
  const races = []

  // Explicit race objects (race_0, race_1, etc.)
  for (const [key, value] of Object.entries(selectedChanges)) {
    if (key.startsWith('race_') && typeof value === 'object') {
      races.push(value)
    }
  }

  // Single race from flat fields
  if (races.length === 0 && (selectedChanges.runDistance || selectedChanges.price || selectedChanges.raceName)) {
    races.push({
      name: selectedChanges.raceName || 'Course principale',
      editionYear: selectedChanges.year || new Date().getFullYear().toString(),
      
      // Dates
      startDate: selectedChanges.raceStartDate ? new Date(selectedChanges.raceStartDate) : null,
      registrationOpeningDate: selectedChanges.raceRegistrationOpeningDate ? new Date(selectedChanges.raceRegistrationOpeningDate) : null,
      registrationClosingDate: selectedChanges.raceRegistrationClosingDate ? new Date(selectedChanges.raceRegistrationClosingDate) : null,
      
      // Prix
      price: selectedChanges.price ? parseFloat(selectedChanges.price) : undefined,
      priceType: selectedChanges.priceType || 'PER_PERSON',
      paymentCollectionType: selectedChanges.paymentCollectionType || 'SINGLE',
      
      // Distances
      runDistance: selectedChanges.runDistance ? parseFloat(selectedChanges.runDistance) : undefined,
      runDistance2: selectedChanges.runDistance2 ? parseFloat(selectedChanges.runDistance2) : undefined,
      bikeDistance: selectedChanges.bikeDistance ? parseFloat(selectedChanges.bikeDistance) : undefined,
      swimDistance: selectedChanges.swimDistance ? parseFloat(selectedChanges.swimDistance) : undefined,
      walkDistance: selectedChanges.walkDistance ? parseFloat(selectedChanges.walkDistance) : undefined,
      bikeRunDistance: selectedChanges.bikeRunDistance ? parseFloat(selectedChanges.bikeRunDistance) : undefined,
      swimRunDistance: selectedChanges.swimRunDistance ? parseFloat(selectedChanges.swimRunDistance) : undefined,
      
      // Dénivelés
      runPositiveElevation: selectedChanges.runPositiveElevation ? parseFloat(selectedChanges.runPositiveElevation) : undefined,
      runNegativeElevation: selectedChanges.runNegativeElevation ? parseFloat(selectedChanges.runNegativeElevation) : undefined,
      bikePositiveElevation: selectedChanges.bikePositiveElevation ? parseFloat(selectedChanges.bikePositiveElevation) : undefined,
      bikeNegativeElevation: selectedChanges.bikeNegativeElevation ? parseFloat(selectedChanges.bikeNegativeElevation) : undefined,
      walkPositiveElevation: selectedChanges.walkPositiveElevation ? parseFloat(selectedChanges.walkPositiveElevation) : undefined,
      walkNegativeElevation: selectedChanges.walkNegativeElevation ? parseFloat(selectedChanges.walkNegativeElevation) : undefined,
      
      // Catégories
      categoryLevel1: selectedChanges.categoryLevel1,
      categoryLevel2: selectedChanges.categoryLevel2,
      distanceCategory: selectedChanges.distanceCategory,
      distance: selectedChanges.distance,  // @deprecated
      type: selectedChanges.type,          // @deprecated
      
      // Métadonnées
      federationId: selectedChanges.federationId,
      licenseNumberType: selectedChanges.licenseNumberType,
      dataSource: selectedChanges.dataSource || 'FEDERATION',
      
      // Configuration inscription (valeurs par défaut dans createRace)
      askAttendeeGender: selectedChanges.askAttendeeGender,
      askAttendeeBirthDate: selectedChanges.askAttendeeBirthDate,
      askAttendeePhoneNumber: selectedChanges.askAttendeePhoneNumber,
      askAttendeeNationality: selectedChanges.askAttendeeNationality,
      askAttendeePostalAddress: selectedChanges.askAttendeePostalAddress,
      showClubOrAssoInput: selectedChanges.showClubOrAssoInput,
      showPublicationConsentCheckbox: selectedChanges.showPublicationConsentCheckbox,
      
      // Équipes
      minTeamSize: selectedChanges.minTeamSize ? parseInt(selectedChanges.minTeamSize) : undefined,
      maxTeamSize: selectedChanges.maxTeamSize ? parseInt(selectedChanges.maxTeamSize) : undefined,
      
      // Fonctionnalités
      isWaitingList: selectedChanges.isWaitingList,
      resaleEnabled: selectedChanges.resaleEnabled,
      externalFunnelURL: selectedChanges.externalFunnelURL,
      
      // Justificatifs
      adultJustificativeOptions: selectedChanges.adultJustificativeOptions,
      minorJustificativeOptions: selectedChanges.minorJustificativeOptions
    })
  }

  return races
}

/**
 * Helper: Extraire le code département depuis le nom
 * Ex: "Côte-d'Or" → "21", "Paris" → "75"
 */
private extractDepartmentCode(subdivisionName?: string): string {
  if (!subdivisionName) return ''
  
  // Mapping départements français
  const departmentCodes: Record<string, string> = {
    'Ain': '01',
    'Aisne': '02',
    'Allier': '03',
    // ... (tous les départements)
    'Côte-d\'Or': '21',
    'Paris': '75',
    // ...
  }
  
  return departmentCodes[subdivisionName] || ''
}
```

---

## Phase 4 : Valeurs Par Défaut et Contraintes

### 4.1 Champs Obligatoires (NOT NULL)

**Event**
```typescript
✅ Requis avec valeur par défaut
- country: 'FR'
- countrySubdivisionNameLevel1: '' (chaîne vide acceptable)
- countrySubdivisionNameLevel2: '' (chaîne vide acceptable)
- countrySubdivisionDisplayCodeLevel2: '' (chaîne vide acceptable)
- status: 'DRAFT'
- createdBy: 'data-agents'
- updatedBy: 'data-agents'
- isRecommended: false
```

**Edition**
```typescript
✅ Requis avec valeur par défaut
- year: new Date().getFullYear().toString()
- calendarStatus: 'CONFIRMED'
- status: 'DRAFT'
- currency: 'EUR'
- medusaVersion: 'V1'
- timeZone: 'Europe/Paris'
- isAttendeeListPublic: true
- publicAttendeeListColumns: []
- hasEditedDates: false
- toUpdate: false
- createdBy: 'data-agents'
- updatedBy: 'data-agents'
```

**Race**
```typescript
✅ Requis avec valeur par défaut
- runDistance: 0
- runDistance2: 0
- bikeDistance: 0
- swimDistance: 0
- walkDistance: 0
- swimRunDistance: 0
- bikeRunDistance: 0
- priceType: 'PER_PERSON'
- paymentCollectionType: 'SINGLE'
- products: []
- toUpdate: false
- isActive: true
- isArchived: false
- askAttendeeGender: true
- askAttendeeBirthDate: true
- askAttendeePhoneNumber: true
- askAttendeeNationality: true
- askAttendeePostalAddress: true
- showClubOrAssoInput: true
- showPublicationConsentCheckbox: true
- isWaitingList: false
- resaleEnabled: false
- stockDisplayThreshold: 'BELOW'
- stockDisplayThresholdValue: 10
- createdBy: 'data-agents'
- updatedBy: 'data-agents'
```

### 4.2 Enums Valides

**EventStatus**
```
DEAD | DRAFT | REVIEW | LIVE | DELETED
```

**EditionStatus**
```
DRAFT | LIVE
```

**CalendarStatus**
```
CONFIRMED | CANCELED | TO_BE_CONFIRMED
```

**ClientStatus**
```
EXTERNAL_SALES_FUNNEL | INTERNAL_SALES_FUNNEL | NEW_SALES_FUNNEL
```

**DataSource**
```
ORGANIZER | TIMER | FEDERATION | PEYCE | OTHER
```

**MedusaVersion**
```
V1 | V2
```

**CustomerType**
```
BASIC | PREMIUM | ESSENTIAL | MEDIA | LEAD_INT | LEAD_EXT
```

**PriceType**
```
PER_TEAM | PER_PERSON
```

**PaymentCollectionType**
```
SINGLE | MULTIPLE
```

**DistanceCategoryType**
```
XXS | XS | S | M | L | XL | XXL
```

**LicenseNumberType**
```
FFA | FFTRI | FFS | NONE
```

**RaceStockDisplayThreshold**
```
BELOW | ALWAYS | NEVER
```

---

## Phase 5 : Tests et Validation

### 5.1 Tests Unitaires

**Test NEW_EVENT**
```typescript
// Test: Créer un nouvel événement FFA complet
const proposal = {
  type: 'NEW_EVENT',
  changes: {
    name: 'Trail des Volcans',
    city: 'Clermont-Ferrand',
    country: 'FR',
    countrySubdivisionNameLevel1: 'Auvergne-Rhône-Alpes',
    countrySubdivisionNameLevel2: 'Puy-de-Dôme',
    year: '2025',
    startDate: '2025-06-15T09:00:00Z',
    raceName: '21 km',
    runDistance: 21.1,
    runPositiveElevation: 850,
    price: 45.00,
    federationId: 'FFA_123456'
  }
}

// Vérifications
✅ Event créé avec ID
✅ Edition créée liée à l'event
✅ Race créée liée à l'edition et event
✅ Champs obligatoires remplis
✅ Valeurs par défaut appliquées
✅ dataSource = 'FEDERATION'
```

**Test EVENT_UPDATE**
```typescript
// Test: Mettre à jour URL et géolocalisation
const proposal = {
  type: 'EVENT_UPDATE',
  eventId: '12345',
  changes: {
    websiteUrl: 'https://trail-volcans.fr',
    fullAddress: '1 Place de Jaude, 63000 Clermont-Ferrand',
    latitude: 45.7772,
    longitude: 3.0870
  }
}

// Vérifications
✅ Event.websiteUrl mis à jour
✅ Event.fullAddress mis à jour
✅ Event.latitude et longitude mis à jour
✅ Event.updatedAt et updatedBy mis à jour
✅ Event.toUpdate = true
✅ Event.algoliaObjectToUpdate = true
```

**Test EDITION_UPDATE**
```typescript
// Test: Confirmer calendrier et ajouter race
const proposal = {
  type: 'EDITION_UPDATE',
  editionId: '40098',
  changes: {
    calendarStatus: 'CONFIRMED',
    startDate: '2025-06-15T09:00:00Z',
    registrantsNumber: 350,
    racesToAdd: [{
      name: '10 km',
      runDistance: 10.0,
      price: 25.00,
      startDate: '2025-06-15T09:30:00Z'
    }]
  }
}

// Vérifications
✅ Edition.calendarStatus = 'CONFIRMED'
✅ Edition.startDate mis à jour
✅ Edition.registrantsNumber = 350
✅ Race créée avec tous les champs par défaut
✅ Race.editionId et Race.eventId corrects
✅ Event parent touché (updatedAt)
```

**Test RACE_UPDATE**
```typescript
// Test: Modifier distance et prix
const proposal = {
  type: 'RACE_UPDATE',
  raceId: '78901',
  changes: {
    runDistance: 10.5,
    price: 28.00,
    runPositiveElevation: 120
  }
}

// Vérifications
✅ Race.runDistance = 10.5
✅ Race.price = 28.00
✅ Race.runPositiveElevation = 120
✅ Race.updatedAt et updatedBy mis à jour
✅ Event parent touché (updatedAt)
```

### 5.2 Tests d'Intégration

**Scénario Complet FFA**
```bash
1. Exécuter l'agent FFA
   npm run dev:agents
   
2. Vérifier les propositions créées
   - GET /api/proposals?type=EDITION_UPDATE&status=PENDING
   - Vérifier que les champs FFA sont présents (federationId, calendarStatus, etc.)
   
3. Approuver une proposition
   - PUT /api/proposals/:id
   - Body: { status: 'APPROVED', appliedChanges: { ... } }
   
4. Vérifier la ProposalApplication créée
   - GET /api/updates?proposalId=xxx
   - Status devrait être PENDING
   
5. Appliquer manuellement si besoin
   - POST /api/updates/:id/apply
   
6. Vérifier dans Miles Republic DB
   - Connecter à PostgreSQL
   - SELECT * FROM "Edition" WHERE id = xxx
   - SELECT * FROM "Race" WHERE "editionId" = xxx
   - Vérifier que les champs sont corrects
```

---

## Phase 6 : Documentation et Maintenance

### 6.1 Document de Référence

Créer `docs/PROPOSAL-FIELDS-REFERENCE.md` avec :
- Tous les champs supportés par type de proposition
- Valeurs par défaut
- Contraintes et validations
- Exemples de payloads

### 6.2 Guide de Dépannage

Créer `docs/UPDATES-TROUBLESHOOTING.md` avec :
- Erreurs courantes et solutions
- Comment vérifier l'état des mises à jour
- Comment rollback manuellement
- Logs à consulter

### 6.3 Conventions et Limitations

**Limitations connues**
- ❌ Rollback automatique non implémenté (manuel via SQL)
- ❌ Pas de validation des codes département (extractDepartmentCode incomplet)
- ❌ Pas de support pour Organization (organizationId non géré)
- ❌ Pas de création automatique de EditionInfo / RaceInfo
- ❌ Pas de gestion des relations Sponsor, Tag, etc.

**Bonnes pratiques**
- ✅ Toujours utiliser `dataSource: 'FEDERATION'` pour agent FFA
- ✅ Toujours inclure countrySubdivisionNameLevel1/2 pour NEW_EVENT
- ✅ Toujours définir calendarStatus = 'CONFIRMED' si date confirmée
- ✅ Utiliser userModifiedChanges pour les corrections manuelles
- ✅ Vérifier les propositions avant approbation (preview)

---

## Résumé des Actions Prioritaires

### Actions Immédiates (P0)
1. ✅ Compléter `MilesRepublicRepository` avec tous les champs manquants
2. ✅ Compléter `extractEventData/extractEditionsData/extractRacesData` dans `ProposalDomainService`
3. ✅ Ajouter valeurs par défaut pour tous les champs obligatoires
4. ✅ Implémenter `extractDepartmentCode()` helper avec mapping complet
5. ✅ Tester NEW_EVENT end-to-end avec agent FFA

### Actions Importantes (P1)
6. ✅ Tester EDITION_UPDATE avec racesToAdd/races/racesToDelete
7. ✅ Tester EVENT_UPDATE avec géolocalisation
8. ✅ Tester RACE_UPDATE avec dénivelés
9. ✅ Créer document de référence des champs
10. ✅ Ajouter logging détaillé pour debug

### Actions Futures (P2)
11. ⚠️ Implémenter rollback automatique
12. ⚠️ Gérer Organization (création/liaison)
13. ⚠️ Gérer EditionInfo / RaceInfo si besoin
14. ⚠️ Ajouter validation stricte des enums
15. ⚠️ Tests automatisés (Jest/Vitest)

---

## Fichiers à Modifier

### Priorité 0 (Obligatoire)
- `packages/database/src/repositories/miles-republic.repository.ts`
- `packages/database/src/services/proposal-domain.service.ts`

### Priorité 1 (Important)
- `docs/PROPOSAL-FIELDS-REFERENCE.md` (nouveau)
- `docs/UPDATES-TROUBLESHOOTING.md` (nouveau)

### Priorité 2 (Future)
- `packages/database/src/repositories/miles-republic.repository.ts` (rollback)
- `packages/database/src/services/proposal-domain.service.ts` (validation)
- Tests unitaires/intégration

---

## Checklist de Validation

Avant de considérer l'implémentation complète :

**Infrastructure**
- [ ] Tous les champs du schéma Prisma sont supportés
- [ ] Toutes les valeurs par défaut sont définies
- [ ] Tous les enums sont correctement typés
- [ ] Mapping département → code implémenté

**Fonctionnalités**
- [ ] NEW_EVENT crée Event + Edition + Race
- [ ] EVENT_UPDATE modifie les champs autorisés
- [ ] EDITION_UPDATE modifie edition + gère races
- [ ] RACE_UPDATE modifie race + touch event parent
- [ ] userModifiedChanges prioritaire sur changes agent
- [ ] Approbation par blocs fonctionnelle

**Tests**
- [ ] NEW_EVENT testé avec données FFA
- [ ] EDITION_UPDATE testé avec racesToAdd
- [ ] EVENT_UPDATE testé avec géolocalisation
- [ ] RACE_UPDATE testé avec dénivelés
- [ ] Vérification Miles Republic DB après application

**Documentation**
- [ ] Champs supportés documentés
- [ ] Valeurs par défaut documentées
- [ ] Limitations connues documentées
- [ ] Guide dépannage créé
