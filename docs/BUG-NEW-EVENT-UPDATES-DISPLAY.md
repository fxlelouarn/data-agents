# Bug: Affichage des blocs Edition et Races pour NEW_EVENT dans /updates

**Date**: 3 décembre 2025  
**Problème**: Les changements des blocs "Edition" et "Courses" n'apparaissent pas dans la page `/updates` après validation d'une proposition NEW_EVENT.

## Symptômes

Après validation de tous les blocs d'une proposition NEW_EVENT et création de l'update correspondante :

✅ **Bloc "Événement"** : Changements affichés correctement  
✅ **Bloc "Organisateur"** : Changements affichés correctement  
❌ **Bloc "Édition"** : Aucun changement affiché  
❌ **Bloc "Courses"** : Aucun changement affiché

## Cause racine

### Structure de données attendue vs réelle

`BlockChangesTable.tsx` (ligne 89) cherche les champs avec :

```typescript
const fields = BLOCK_FIELDS[blockType] || []

// Pour 'edition' :
const fields = ['year', 'startDate', 'endDate', 'timeZone', 'calendarStatus', ...]

// Pour 'races' :
const fields = ['races', 'racesToUpdate', 'racesToAdd', 'racesToDelete']
```

Puis extrait les valeurs avec `getProposedValue(fieldName)` qui cherche :

```typescript
const change = effectiveChanges[fieldName]  // effectiveChanges = appliedChanges
```

### Structure réelle des données NEW_EVENT

Pour un NEW_EVENT, `appliedChanges` a une structure **imbriquée** :

```javascript
appliedChanges = {
  // ✅ Bloc Event : Champs au niveau racine
  name: 'Trail des Loups',
  city: 'Dijon',
  country: 'France',
  
  // ✅ Bloc Organizer : Champs dans organizer.new
  organizer: {
    new: {
      name: 'Association Trail',
      email: 'contact@trail.fr'
    }
  },
  
  // ❌ Bloc Edition : Champs dans edition.new
  edition: {
    new: {
      year: 2026,
      startDate: '2026-03-15T09:00:00.000Z',
      endDate: '2026-03-15T18:00:00.000Z',
      timeZone: 'Europe/Paris'
    }
  },
  
  // ❌ Bloc Races : Courses dans racesToAdd (ou races ?)
  racesToAdd: [
    { name: '10km', runDistance: 10, ... },
    { name: '21km', runDistance: 21.1, ... }
  ]
}
```

### Pourquoi Organizer fonctionne mais pas Edition ?

`BlockChangesTable` a un **cas spécial** pour le bloc `organizer` (ligne 92-113) :

```typescript
const getOrganizerData = () => {
  if (blockType !== 'organizer') return null
  
  const organizerChange = effectiveChanges.organizer
  if (!organizerChange) return null
  
  // ✅ Gère la structure imbriquée organizer.new
  if (organizerChange.new) {
    return {
      current: organizerChange.old || {},
      proposed: organizerChange.new
    }
  }
  
  return {
    current: {},
    proposed: organizerChange
  }
}
```

Mais **aucun cas spécial** pour `edition` ou `races` !

## Extraction des valeurs actuellement (ligne 116-170)

```typescript
const getProposedValue = (fieldName: string) => {
  // ✅ Cas spécial organizer
  if (blockType === 'organizer' && organizerData) {
    if (userModifiedChanges.organizer?.[fieldName] !== undefined) {
      return userModifiedChanges.organizer[fieldName]
    }
    return organizerData.proposed?.[fieldName]
  }

  // ❌ Cas edition : cherche effectiveChanges['year']
  // Mais les données sont dans effectiveChanges.edition.new.year !
  
  // ❌ Cas races : cherche effectiveChanges['racesToAdd']
  // Cela fonctionne SI racesToAdd est au niveau racine
  // Mais qu'en est-il si c'est dans races.new ?

  const change = effectiveChanges[fieldName]
  if (!change) return null  // ❌ Retourne null car year/startDate n'existent pas au niveau racine
  
  if (change.new !== undefined) {
    return change.new
  }
  
  return change
}
```

## Solutions possibles

### Option 1 : Ajuster la structure de `appliedChanges` (Backend)

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`  
**Méthode** : `applyNewEvent()` (ligne 202-315)

Actuellement retourne :

```typescript
return {
  success: true,
  appliedChanges: changes  // ❌ Structure imbriquée
}
```

**Proposition** : Aplatir les champs Edition au niveau racine

```typescript
return {
  success: true,
  appliedChanges: {
    ...changes,
    // ✅ Aplatir les champs Edition
    year: changes.edition?.new?.year || changes.year,
    startDate: changes.edition?.new?.startDate || changes.startDate,
    endDate: changes.edition?.new?.endDate || changes.endDate,
    timeZone: changes.edition?.new?.timeZone || changes.timeZone,
    calendarStatus: changes.edition?.new?.calendarStatus || changes.calendarStatus,
    // ...autres champs Edition
  }
}
```

**Avantages** :
- ✅ Pas de changement frontend
- ✅ Cohérent avec les autres types de propositions (EDITION_UPDATE, EVENT_UPDATE)

**Inconvénients** :
- ❌ Perte de structure (impossible de distinguer Edition vs Event)
- ❌ Risque de conflit de noms (ex: `name` existe dans Event ET Edition)
- ❌ Duplication des données

### Option 2 : Ajouter un cas spécial pour Edition dans BlockChangesTable (Frontend)

**Fichier** : `apps/dashboard/src/components/updates/BlockChangesTable.tsx`  
**Ligne** : 116-170 (fonction `getProposedValue`)

```typescript
const getProposedValue = (fieldName: string) => {
  // ✅ Cas spécial organizer (existant)
  if (blockType === 'organizer' && organizerData) {
    // ...
  }

  // ✅ NOUVEAU: Cas spécial edition
  if (blockType === 'edition') {
    const editionChange = effectiveChanges.edition
    if (editionChange?.new) {
      return editionChange.new[fieldName]
    }
    // Fallback niveau racine (EDITION_UPDATE)
    const change = effectiveChanges[fieldName]
    if (change?.new !== undefined) {
      return change.new
    }
    return effectiveChanges[fieldName]
  }

  // ✅ NOUVEAU: Cas spécial races
  if (blockType === 'races') {
    // Chercher racesToAdd au niveau racine (NEW_EVENT)
    if (fieldName === 'racesToAdd' && effectiveChanges.racesToAdd) {
      return effectiveChanges.racesToAdd
    }
    // Fallback races.new (si structure imbriquée)
    if (fieldName === 'races' && effectiveChanges.races?.new) {
      return effectiveChanges.races.new
    }
  }

  // Cas général (existant)
  const change = effectiveChanges[fieldName]
  // ...
}
```

**Avantages** :
- ✅ Pas de changement backend
- ✅ Structure imbriquée préservée
- ✅ Support de plusieurs structures (NEW_EVENT vs EDITION_UPDATE)

**Inconvénients** :
- ❌ Complexité frontend accrue
- ❌ Risque de bugs si structure évolue

### Option 3 : Unifier la structure avec un blockType dédié

**Idée** : Au lieu de stocker toute la proposition dans `appliedChanges`, stocker uniquement **le bloc validé** avec `blockType`.

```typescript
// Application bloc 'edition'
{
  blockType: 'edition',
  appliedChanges: {
    year: 2026,
    startDate: '2026-03-15T09:00:00.000Z',
    endDate: '2026-03-15T18:00:00.000Z',
    timeZone: 'Europe/Paris'
  }
}

// Application bloc 'races'
{
  blockType: 'races',
  appliedChanges: {
    racesToAdd: [
      { name: '10km', ... },
      { name: '21km', ... }
    ]
  }
}
```

**Avantages** :
- ✅ Structure simple et plate
- ✅ Pas de confusion entre blocs
- ✅ Facile à afficher

**Inconvénients** :
- ❌ Changement majeur backend ET frontend
- ❌ Perte de contexte (impossible de voir les autres blocs)

## Recommendation

**Option 2** : Ajouter des cas spéciaux pour `edition` et `races` dans `BlockChangesTable`.

**Raisons** :
1. Pas de changement backend (risque réduit)
2. Cohérent avec le traitement existant de `organizer`
3. Support de plusieurs structures (rétrocompatibilité)
4. Isolé au composant d'affichage

## Tests nécessaires

Créer des tests frontend pour `BlockChangesTable` avec différentes structures :

```typescript
describe('BlockChangesTable', () => {
  it('should display edition fields from edition.new structure (NEW_EVENT)', () => {
    const appliedChanges = {
      edition: {
        new: {
          year: 2026,
          startDate: '2026-03-15T09:00:00.000Z'
        }
      }
    }
    
    render(<BlockChangesTable blockType="edition" appliedChanges={appliedChanges} />)
    
    expect(screen.getByText('Année')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('should display edition fields from root structure (EDITION_UPDATE)', () => {
    const appliedChanges = {
      year: 2026,
      startDate: { 
        old: '2026-03-15T09:00:00.000Z',
        new: '2026-03-20T09:00:00.000Z'
      }
    }
    
    render(<BlockChangesTable blockType="edition" appliedChanges={appliedChanges} />)
    
    expect(screen.getByText('Année')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })
})
```

## Ressources

- Test d'intégration (failing) : `apps/agents/src/__tests__/proposal-application/new-event-updates-display.test.ts`
- Composant frontend : `apps/dashboard/src/components/updates/BlockChangesTable.tsx`
- Service backend : `packages/database/src/services/proposal-domain.service.ts` (méthode `applyNewEvent`)
- Page `/updates` : `apps/dashboard/src/pages/UpdateGroupDetail.tsx`
