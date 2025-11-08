# Fix : Application des propositions d'organisateur

**Date** : 2025-11-08  
**Problème** : Les propositions de changement d'organisateur n'étaient pas appliquées à la base de données

## 🔴 Problème identifié

### Symptômes
1. ✅ Les propositions d'organisateur apparaissaient correctement dans l'interface
2. ✅ La validation par bloc fonctionnait
3. ❌ L'application de la proposition ne créait/mettait pas à jour l'`EditionPartner` ORGANIZER
4. ❌ Les informations de l'organisateur (nom, site web, email, téléphone) ne partaient pas dans la base

### Diagnostic

#### 1. `applyEditionUpdate` ignorait le champ `organizer`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts` (lignes 275-295)

```typescript
for (const [field, value] of Object.entries(selectedChanges)) {
  // ... traitement des races
  
  const extractedValue = this.extractNewValue(value)  // ❌ Ne fonctionne pas pour organizer
  if (extractedValue !== undefined && extractedValue !== null) {
    updateData[field] = extractedValue  // organizer n'était jamais ajouté
  }
}
```

**Cause** : Le champ `organizer` est un **objet complexe** `{name, email, phone, websiteUrl}`, pas une valeur simple. `extractNewValue()` retournait l'objet mais il n'était pas traité.

#### 2. Aucune méthode pour gérer les EditionPartners

**Fichier** : `packages/database/src/repositories/miles-republic.repository.ts`

Le repository n'avait **aucune méthode** pour :
- ❌ Créer un `EditionPartner`
- ❌ Mettre à jour un `EditionPartner`
- ❌ Rechercher un organisateur existant

#### 3. `updateEdition` ne gère pas les relations

La méthode `updateEdition()` fait un simple `prisma.edition.update()` qui ne peut **pas** gérer les relations imbriquées comme `editionPartners`.

## ✅ Solution implémentée

### 1. Ajout de méthodes dans `MilesRepublicRepository`

**Fichier** : `packages/database/src/repositories/miles-republic.repository.ts`

#### Méthode `upsertOrganizerPartner()`

```typescript
async upsertOrganizerPartner(editionId: number, organizerData: {
  name?: string
  websiteUrl?: string
  email?: string
  phone?: string
  facebookUrl?: string
  instagramUrl?: string
}) {
  // Find existing ORGANIZER partner
  const existingOrganizer = await this.milesDb.editionPartner.findFirst({
    where: {
      editionId,
      role: 'ORGANIZER'
    }
  })

  const partnerData = {
    role: 'ORGANIZER',
    name: organizerData.name || null,
    websiteUrl: organizerData.websiteUrl || null,
    facebookUrl: organizerData.facebookUrl || null,
    instagramUrl: organizerData.instagramUrl || null,
  }

  if (existingOrganizer) {
    // Update existing
    return this.milesDb.editionPartner.update({
      where: { id: existingOrganizer.id },
      data: partnerData
    })
  } else {
    // Create new
    return this.milesDb.editionPartner.create({
      data: {
        ...partnerData,
        editionId
      }
    })
  }
}
```

**Comportement** :
- Si un `EditionPartner` avec `role = 'ORGANIZER'` existe → **UPDATE**
- Sinon → **CREATE**

#### Méthode `findEditionPartners()`

```typescript
async findEditionPartners(editionId: number) {
  return this.milesDb.editionPartner.findMany({
    where: { editionId }
  })
}
```

#### Mise à jour de `findEditionById()`

Ajout de `editionPartners: true` dans l'`include` pour récupérer les partners existants.

### 2. Traitement du champ `organizer` dans `applyEditionUpdate`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

#### Séparation du champ organizer

```typescript
// Separate races and organizer from other changes
let organizerData: any | undefined

for (const [field, value] of Object.entries(selectedChanges)) {
  // ... races handling
  
  // Handle organizer (complex object)
  if (field === 'organizer') {
    organizerData = this.extractNewValue(value)
    continue  // Ne pas le mettre dans updateData
  }
  
  // ... autres champs
}
```

#### Application de l'organisateur

```typescript
// Update edition
await milesRepo.updateEdition(numericEditionId, updateData)

// Update organizer if provided
if (organizerData && typeof organizerData === 'object') {
  this.logger.info(`Mise à jour de l'organisateur pour l'édition ${numericEditionId}`)
  await milesRepo.upsertOrganizerPartner(numericEditionId, {
    name: organizerData.name,
    websiteUrl: organizerData.websiteUrl,
    email: organizerData.email,
    phone: organizerData.phone,
    facebookUrl: organizerData.facebookUrl,
    instagramUrl: organizerData.instagramUrl
  })
}

// Update parent event
if (edition?.eventId) {
  await milesRepo.touchEvent(edition.eventId)
}
```

### 3. Traitement du champ `organizer` dans `applyNewEvent`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

#### Extraction de l'organisateur

```typescript
const eventData = this.extractEventData(changes)
const editionsData = this.extractEditionsData(changes)
const racesData = this.extractRacesData(changes)
const organizerData = this.extractNewValue(changes.organizer)  // ✅ Nouveau
```

#### Création de l'organisateur

```typescript
for (const editionData of editionsData) {
  const edition = await milesRepo.createEdition({
    eventId: event.id,
    currentEditionEventId: event.id,
    ...editionData
  })

  createdEditionIds.push(edition.id)
  this.logger.info(`Édition créée: ${edition.id} pour l'événement ${event.id}`)

  // Create organizer if provided ✅ Nouveau
  if (organizerData && typeof organizerData === 'object') {
    this.logger.info(`Création de l'organisateur pour l'édition ${edition.id}`)
    await milesRepo.upsertOrganizerPartner(edition.id, {
      name: organizerData.name,
      websiteUrl: organizerData.websiteUrl,
      email: organizerData.email,
      phone: organizerData.phone,
      facebookUrl: organizerData.facebookUrl,
      instagramUrl: organizerData.instagramUrl
    })
  }

  // Create races...
}
```

## 📊 Résultat

### Avant le fix

```
Proposition → ProposalApplication → ❌ Organizer ignoré
```

**Base de données** :
- `Edition` : ✅ Mise à jour
- `EditionPartner` (ORGANIZER) : ❌ Jamais créé/mis à jour

### Après le fix

```
Proposition → ProposalApplication → ✅ Organizer appliqué
```

**Base de données** :
- `Edition` : ✅ Mise à jour
- `EditionPartner` (ORGANIZER) : ✅ Créé ou mis à jour via `upsertOrganizerPartner()`

### Logs applicatifs

**EDITION_UPDATE** :
```
Mise à jour de l'organisateur pour l'édition 43830
```

**NEW_EVENT** :
```
Création de l'organisateur pour l'édition 52074
```

## 🔍 Structure de données

### Table `EditionPartner`

```typescript
{
  id: string (UUID)
  editionId: number
  role: 'ORGANIZER' | 'SPONSOR' | 'TIMER' | 'MEDIA_PARTNER'
  name: string?
  websiteUrl: string?
  facebookUrl: string?
  instagramUrl: string?
  logoUrl: string?
  createdAt: DateTime
  updatedAt: DateTime
}
```

**Note** : Les champs `email` et `phone` ne sont **pas** dans le schéma `EditionPartner`. Ils pourraient être dans une table `Organization` ou `Contact` liée.

## ⚠️ Limitations connues

1. **email et phone** : Ces champs sont extraits de la proposition mais **ne sont pas sauvegardés** car ils n'existent pas dans le schéma `EditionPartner`. Si nécessaire, il faudrait :
   - Ajouter ces champs au schéma Prisma
   - Ou les stocker dans une table liée (`Organization`)

2. **logoUrl** : Non géré dans les propositions FFA actuellement

3. **Autres rôles** : Seul le rôle `ORGANIZER` est traité. Les sponsors, timers, etc. ne sont pas gérés.

## 🧪 Test

Pour tester le fix :

1. **Créer/approuver une proposition EDITION_UPDATE** avec un changement d'organisateur
2. **Appliquer la proposition** via l'interface Updates
3. **Vérifier dans la base** :
   ```sql
   SELECT * FROM "EditionPartner" 
   WHERE "editionId" = <editionId> AND role = 'ORGANIZER';
   ```
4. **Logs attendus** : `Mise à jour de l'organisateur pour l'édition <id>`

## 📝 Fichiers modifiés

1. `packages/database/src/repositories/miles-republic.repository.ts`
   - ✅ Ajout de `upsertOrganizerPartner()`
   - ✅ Ajout de `findEditionPartners()`
   - ✅ Mise à jour de `findEditionById()` (include editionPartners)

2. `packages/database/src/services/proposal-domain.service.ts`
   - ✅ Détection du champ `organizer` dans `applyEditionUpdate()`
   - ✅ Appel à `upsertOrganizerPartner()` dans `applyEditionUpdate()`
   - ✅ Extraction et création de l'organisateur dans `applyNewEvent()`

## 🎯 Validation

✅ **TypeScript compile sans erreur**  
✅ **Cohérent avec l'architecture existante** (Repository pattern)  
✅ **Gère UPDATE et CREATE** (EDITION_UPDATE et NEW_EVENT)  
✅ **Idempotent** (upsert : create si inexistant, update sinon)  
✅ **Logging approprié** pour débogage
