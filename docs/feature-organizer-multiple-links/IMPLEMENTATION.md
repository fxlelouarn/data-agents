# Implémentation : Support des liens multiples pour l'Organisateur

## Résumé

Cette fonctionnalité permet au bloc Organisateur de gérer 3 types de liens distincts :
- `websiteUrl` - Site web principal
- `facebookUrl` - Page Facebook  
- `instagramUrl` - Compte Instagram

Le FFA scraper détecte automatiquement le type de lien extrait et l'attribue au bon champ.

## Modifications effectuées

### 1. Parser FFA (`apps/agents/src/ffa/parser.ts`)

**Nouvelle fonction `classifyOrganizerUrl`** :

```typescript
export function classifyOrganizerUrl(url: string | undefined): {
  websiteUrl?: string
  facebookUrl?: string
  instagramUrl?: string
}
```

- Détecte les URLs Facebook : `facebook.com`, `fb.com`, `fb.me`
- Détecte les URLs Instagram : `instagram.com`, `instagr.am`
- Tout autre lien est classifié comme `websiteUrl`

### 2. FFAScraperAgent (`apps/agents/src/FFAScraperAgent.ts`)

**Modifications** :
- Import de `classifyOrganizerUrl` depuis le parser
- Classification automatique du lien extrait
- Inclusion des valeurs existantes (`facebookUrl`, `instagramUrl`) dans `old`
- Condition de mise à jour étendue pour chaque type d'URL

```typescript
const classifiedUrls = classifyOrganizerUrl(ffaData.organizerWebsite)

changes.organizer = {
  old: existingOrganizer ? {
    name: existingOrgName,
    websiteUrl: existingOrgWebsite,
    facebookUrl: existingOrgFacebook,
    instagramUrl: existingOrgInstagram
  } : null,
  new: {
    name: ffaData.organizerName,
    ...classifiedUrls,  // Un seul champ défini selon le type
    email: ffaData.organizerEmail,
    phone: ffaData.organizerPhone
  },
  confidence: confidence * 0.85
}
```

### 3. OrganizerSection (`apps/dashboard/src/components/proposals/edition-update/OrganizerSection.tsx`)

**Modifications** :
- Ajout des champs `facebookUrl` et `instagramUrl` dans le tableau
- Tous les champs URL sont cliquables (liens)
- Correction de la logique "gras" : un champ n'est en gras que si la proposition a une valeur ET elle diffère de l'actuelle

```typescript
const fields: OrganizerField[] = [
  { key: 'name', label: 'Nom', ... },
  { key: 'email', label: 'Email', ... },
  { key: 'phone', label: 'Téléphone', ... },
  { key: 'websiteUrl', label: 'Site web', ... },
  { key: 'facebookUrl', label: 'Facebook', ... },
  { key: 'instagramUrl', label: 'Instagram', ... }
]

// Nouvelle logique pour le gras
const willBeChanged = (field: OrganizerField): boolean => {
  if (field.proposedValue === undefined || field.proposedValue === null) {
    return false
  }
  return field.proposedValue !== field.currentValue
}
```

### 4. Repository Miles Republic (`packages/database/src/repositories/miles-republic.repository.ts`)

**Méthode `upsertOrganizerPartner` modifiée** :
- En mode UPDATE : ne met à jour que les champs avec une nouvelle valeur
- Préserve les valeurs existantes si pas de nouvelle valeur dans la proposition

```typescript
if (existingOrganizer) {
  // Update - SEULEMENT les champs qui ont une nouvelle valeur
  const updateData: Record<string, any> = {}
  
  if (organizerData.name !== undefined) updateData.name = organizerData.name
  if (organizerData.websiteUrl !== undefined) updateData.websiteUrl = organizerData.websiteUrl
  if (organizerData.facebookUrl !== undefined) updateData.facebookUrl = organizerData.facebookUrl
  if (organizerData.instagramUrl !== undefined) updateData.instagramUrl = organizerData.instagramUrl
  
  // Si aucun champ à mettre à jour, retourner l'existant
  if (Object.keys(updateData).length === 0) {
    return existingOrganizer
  }
  
  return this.milesDb.editionPartner.update({
    where: { id: existingOrganizer.id },
    data: updateData
  })
}
```

## Comportement

### Extraction FFA

| Lien extrait | Champ attribué |
|--------------|----------------|
| `https://facebook.com/event123` | `facebookUrl` |
| `https://www.instagram.com/montrail` | `instagramUrl` |
| `https://trail-auray.fr` | `websiteUrl` |

### Affichage UI

Le bloc Organisateur affiche maintenant jusqu'à 6 champs :
1. **Nom** - Nom de l'organisateur
2. **Email** - Email de contact
3. **Téléphone** - Numéro de téléphone
4. **Site web** - URL du site principal
5. **Facebook** - Page Facebook
6. **Instagram** - Compte Instagram

Seuls les champs ayant une valeur (actuelle ou proposée) sont affichés.

### Préservation des valeurs

Si une édition a déjà un `websiteUrl` existant et que le FFA extrait un lien Facebook :
- Le `websiteUrl` existant est **préservé**
- Le `facebookUrl` est **ajouté/mis à jour**
- Dans l'UI, seul le champ Facebook apparaît en gras (changement)

## Fichiers modifiés

| Fichier | Lignes modifiées |
|---------|------------------|
| `apps/agents/src/ffa/parser.ts` | +29 (nouvelle fonction) |
| `apps/agents/src/FFAScraperAgent.ts` | ~20 lignes modifiées |
| `apps/dashboard/src/components/proposals/edition-update/OrganizerSection.tsx` | ~25 lignes modifiées |
| `packages/database/src/repositories/miles-republic.repository.ts` | ~20 lignes modifiées |

## Tests recommandés

1. **Lien Facebook** : Vérifier qu'un lien `facebook.com` est classifié en `facebookUrl`
2. **Lien Instagram** : Vérifier qu'un lien `instagram.com` est classifié en `instagramUrl`
3. **Site web** : Vérifier qu'un lien classique est classifié en `websiteUrl`
4. **Préservation** : Vérifier qu'un `websiteUrl` existant n'est pas écrasé par une proposition sans `websiteUrl`
5. **UI gras** : Vérifier que seuls les champs avec changement réel sont en gras
