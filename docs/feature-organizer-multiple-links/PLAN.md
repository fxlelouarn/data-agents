# Plan : Support des liens multiples pour l'Organisateur

## Contexte

Le bloc Organisateur dans les propositions groupées n'affiche actuellement qu'un seul champ `websiteUrl`. La table `EditionPartner` de Miles Republic supporte pourtant 3 types de liens :
- `websiteUrl` - Site web principal
- `facebookUrl` - Page Facebook
- `instagramUrl` - Compte Instagram

### Problèmes actuels

1. **FFA Parser** : Extrait un seul lien (`organizerWebsite`) sans distinguer le type
2. **FFAScraperAgent** : Code existant tente de détecter facebook/instagram mais de manière incorrecte (met le même lien dans websiteUrl ET facebookUrl/instagramUrl)
3. **OrganizerSection** : N'affiche que `websiteUrl` avec le label "Site web"
4. **Valeurs existantes écrasées** : Si la proposition n'a pas de valeur pour un champ URL, le code actuel pourrait écraser la valeur existante

### Capture d'écran du problème

Dans l'UI actuelle, on voit "Site web" en gras avec une valeur existante (http://trail-auray.fr/) et une valeur proposée "-", ce qui suggère que le champ sera écrasé à null.

## Objectifs

1. Afficher les 3 champs de liens dans `OrganizerSection` (Facebook, Instagram, Site web)
2. Classifier automatiquement le lien extrait par FFA selon son domaine
3. Ne pas écraser les valeurs existantes si la proposition n'a pas de nouvelle valeur

## Modifications

### 1. FFA Parser (`apps/agents/src/ffa/parser.ts`)

**Ajout d'une fonction de classification des URLs** :

```typescript
/**
 * Classifie une URL organisateur selon son type (facebook, instagram, website)
 */
export function classifyOrganizerUrl(url: string): {
  websiteUrl?: string
  facebookUrl?: string
  instagramUrl?: string
} {
  if (!url) return {}
  
  const normalizedUrl = url.toLowerCase()
  
  if (normalizedUrl.includes('facebook.com') || normalizedUrl.includes('fb.com') || normalizedUrl.includes('fb.me')) {
    return { facebookUrl: url }
  }
  
  if (normalizedUrl.includes('instagram.com') || normalizedUrl.includes('instagr.am')) {
    return { instagramUrl: url }
  }
  
  // Par défaut, c'est un site web
  return { websiteUrl: url }
}
```

### 2. FFAScraperAgent (`apps/agents/src/FFAScraperAgent.ts`)

**Modifier la logique de création du bloc organisateur** :

```typescript
// Avant
new: {
  name: ffaData.organizerName,
  websiteUrl: ffaData.organizerWebsite,
  facebookUrl: ffaData.organizerWebsite?.includes('facebook.com') ? ffaData.organizerWebsite : undefined,
  instagramUrl: ffaData.organizerWebsite?.includes('instagram.com') ? ffaData.organizerWebsite : undefined,
  ...
}

// Après
import { classifyOrganizerUrl } from './ffa/parser'

const classifiedUrls = classifyOrganizerUrl(ffaData.organizerWebsite)

new: {
  name: ffaData.organizerName,
  ...classifiedUrls,  // Ne contient qu'un seul champ URL
  email: ffaData.organizerEmail,
  phone: ffaData.organizerPhone
}
```

**Modifier la condition de mise à jour** :

```typescript
// Vérifier chaque URL individuellement
const existingOrgFacebook = existingOrganizer?.facebookUrl
const existingOrgInstagram = existingOrganizer?.instagramUrl

const classifiedUrls = classifyOrganizerUrl(ffaData.organizerWebsite)

const shouldUpdate = !existingOrganizer || 
                     existingOrgName !== ffaData.organizerName ||
                     (classifiedUrls.websiteUrl && classifiedUrls.websiteUrl !== existingOrgWebsite) ||
                     (classifiedUrls.facebookUrl && classifiedUrls.facebookUrl !== existingOrgFacebook) ||
                     (classifiedUrls.instagramUrl && classifiedUrls.instagramUrl !== existingOrgInstagram)
```

**Inclure les valeurs existantes dans `old`** :

```typescript
old: existingOrganizer ? {
  name: existingOrgName,
  websiteUrl: existingOrgWebsite,
  facebookUrl: existingOrgFacebook,
  instagramUrl: existingOrgInstagram
} : null,
```

### 3. OrganizerSection (`apps/dashboard/src/components/proposals/edition-update/OrganizerSection.tsx`)

**Ajouter les 3 champs de liens** :

```typescript
const fields: OrganizerField[] = [
  { key: 'name', label: 'Nom', currentValue: currentOrganizer?.name, proposedValue: organizer?.name },
  { key: 'email', label: 'Email', currentValue: currentOrganizer?.email, proposedValue: organizer?.email },
  { key: 'phone', label: 'Téléphone', currentValue: currentOrganizer?.phone, proposedValue: organizer?.phone },
  { key: 'websiteUrl', label: 'Site web', currentValue: currentOrganizer?.websiteUrl, proposedValue: organizer?.websiteUrl },
  { key: 'facebookUrl', label: 'Facebook', currentValue: currentOrganizer?.facebookUrl, proposedValue: organizer?.facebookUrl },
  { key: 'instagramUrl', label: 'Instagram', currentValue: currentOrganizer?.instagramUrl, proposedValue: organizer?.instagramUrl }
].filter(f => f.proposedValue || f.currentValue)
```

**Modifier `formatFieldValue` pour gérer tous les types d'URL** :

```typescript
const isUrlField = ['websiteUrl', 'facebookUrl', 'instagramUrl'].includes(key)
if (isUrlField && value) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Link href={value} target="_blank" rel="noopener">
        <Typography variant="body2">{value}</Typography>
      </Link>
      {isModified && (/* ... */)}
    </Box>
  )
}
```

### 4. Préservation des valeurs existantes

**Logique** : Un champ ne doit être en gras (indiquant un changement) que si :
- La proposition a une valeur différente de la valeur actuelle
- ET la proposition n'est pas `undefined` ou `null`

**Dans OrganizerSection** :

```typescript
// Détecter si le champ va réellement être modifié
const willBeChanged = (field: OrganizerField): boolean => {
  // Si pas de valeur proposée, pas de changement
  if (field.proposedValue === undefined || field.proposedValue === null) {
    return false
  }
  // Si valeur proposée différente de l'actuelle, c'est un changement
  return field.proposedValue !== field.currentValue
}

// Dans le rendu
<Typography
  variant="body2"
  fontWeight={willBeChanged(field) ? 'bold' : 500}
>
  {field.label}
</Typography>
```

## Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| `apps/agents/src/ffa/parser.ts` | Ajout fonction `classifyOrganizerUrl` |
| `apps/agents/src/FFAScraperAgent.ts` | Utilisation classification URL, inclusion valeurs existantes dans `old` |
| `apps/dashboard/src/components/proposals/edition-update/OrganizerSection.tsx` | Ajout champs facebookUrl/instagramUrl, correction logique gras |

## Tests à effectuer

1. **FFA avec lien Facebook** : Vérifier que le lien est attribué à `facebookUrl`
2. **FFA avec lien Instagram** : Vérifier que le lien est attribué à `instagramUrl`
3. **FFA avec site web** : Vérifier que le lien est attribué à `websiteUrl`
4. **Préservation valeurs** : Vérifier qu'un champ existant n'est pas écrasé si la proposition n'a pas de nouvelle valeur
5. **UI** : Vérifier l'affichage des 3 champs dans le bloc Organisateur
