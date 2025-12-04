# Fix: Affichage des blocs Edition et Races pour NEW_EVENT dans /updates

**Date**: 3 décembre 2025  
**Problème résolu**: Les changements des blocs "Edition" et "Courses" n'apparaissaient pas dans la page `/updates` après validation d'une proposition NEW_EVENT.

## Symptômes

Après validation de tous les blocs d'une proposition NEW_EVENT et création de l'update correspondante :

✅ **Bloc "Événement"** : Changements affichés correctement  
✅ **Bloc "Organisateur"** : Changements affichés correctement  
❌ **Bloc "Édition"** : Aucun changement affiché  
❌ **Bloc "Courses"** : Aucun changement affiché

## Cause racine

### Structure de données NEW_EVENT

Pour les propositions `NEW_EVENT`, `appliedChanges` a une structure **imbriquée** :

```javascript
appliedChanges = {
  // ✅ Bloc Event : Champs au niveau racine
  name: 'Trail des Loups',
  city: 'Dijon',
  country: 'France',
  
  // ✅ Bloc Organizer : Champs dans organizer.new (déjà supporté)
  organizer: {
    new: {
      name: 'Association Trail',
      email: 'contact@trail.fr'
    }
  },
  
  // ❌ Bloc Edition : Champs dans edition.new (NON SUPPORTÉ)
  edition: {
    new: {
      year: 2026,
      startDate: '2026-03-15T09:00:00.000Z',
      endDate: '2026-03-15T18:00:00.000Z',
      timeZone: 'Europe/Paris',
      // ❌ Bloc Races : Courses dans edition.new.races (NON SUPPORTÉ)
      races: [
        { name: '10km', runDistance: 10, ... },
        { name: '21km', runDistance: 21.1, ... }
      ]
    }
  }
}
```

### Pourquoi Organizer fonctionnait mais pas Edition et Races ?

`BlockChangesTable` avait déjà un **cas spécial** pour le bloc `organizer` (fonction `getOrganizerData()`) qui gérait la structure imbriquée `organizer.new`, mais :
- **Aucun cas spécial pour `edition`**
- **Aucun cas spécial pour `races` dans `edition.new.races`**

```typescript
// ✅ Existant pour organizer
const getOrganizerData = () => {
  if (blockType !== 'organizer') return null
  const organizerChange = effectiveChanges.organizer
  if (organizerChange?.new) {
    return {
      current: organizerChange.old || {},
      proposed: organizerChange.new
    }
  }
  return { current: {}, proposed: organizerChange }
}

// ❌ MANQUANT pour edition
```

## Solution appliquée

**Option choisie** : Ajouter un cas spécial pour `edition` dans `BlockChangesTable.tsx`, similaire au traitement existant de `organizer`.

### Changements dans `BlockChangesTable.tsx`

**1. Nouvelle fonction `getEditionData()` (ligne 115-132)**

```typescript
const getEditionData = () => {
  if (blockType !== 'edition') return null
  
  const editionChange = effectiveChanges.edition
  if (!editionChange) return null
  
  // Structure imbriquée (NEW_EVENT) : edition.new
  if (editionChange.new) {
    return {
      current: editionChange.old || {},
      proposed: editionChange.new
    }
  }
  
  // Structure plate (EDITION_UPDATE) : champs au niveau racine
  return null
}

const editionData = getEditionData()
```

**2. Support dans `getProposedValue()` (ligne 146-152)**

```typescript
// ✅ NOUVEAU: Cas spécial edition
if (blockType === 'edition' && editionData) {
  if (userModifiedChanges[fieldName] !== undefined) {
    return userModifiedChanges[fieldName]
  }
  return editionData.proposed?.[fieldName]
}
```

**3. Support dans `getCurrentValue()` (ligne 208-211)**

```typescript
// ✅ NOUVEAU: Cas spécial edition
if (blockType === 'edition' && editionData) {
  return editionData.current?.[fieldName]
}
```

**4. Support races dans `edition.new.races` (ligne 154-168)**

```typescript
// ✅ NOUVEAU: Cas spécial races pour NEW_EVENT
// Les courses sont dans edition.new.races, pas dans racesToAdd au niveau racine
if (blockType === 'races' && fieldName === 'racesToAdd') {
  // Priorité 1: racesToAdd au niveau racine (EDITION_UPDATE)
  if (effectiveChanges.racesToAdd) {
    return effectiveChanges.racesToAdd
  }
  
  // Priorité 2: edition.new.races (NEW_EVENT)
  if (effectiveChanges.edition?.new?.races) {
    return effectiveChanges.edition.new.races
  }
  
  return null
}
```

## Rétrocompatibilité

### Edition
✅ **Structure NEW_EVENT** (imbriquée) : `edition.new.{year, startDate, ...}`  
✅ **Structure EDITION_UPDATE** (plate) : `{year, startDate, ...}` au niveau racine

La solution gère automatiquement les deux cas :
- Si `edition.new` existe → Extraction depuis la structure imbriquée
- Sinon → Fallback sur la structure plate

### Races
✅ **Structure NEW_EVENT** (imbriquée) : `edition.new.races[]`  
✅ **Structure EDITION_UPDATE** (plate) : `racesToAdd[]` au niveau racine

La solution gère automatiquement les deux cas avec priorité :
1. Priorité 1 : `racesToAdd` au niveau racine (EDITION_UPDATE)
2. Priorité 2 : `edition.new.races` (NEW_EVENT)

## Tests créés

**Fichier** : `apps/dashboard/src/components/updates/__tests__/BlockChangesTable.test.tsx`

**Couverture** :
- ✅ **Bloc Edition - NEW_EVENT** (3 tests)
  - Affichage des champs depuis `edition.new`
  - Valeur actuelle vide (`-`) quand `edition.old` absent
  - Override par `userModifiedChanges`
  
- ✅ **Bloc Edition - EDITION_UPDATE** (1 test)
  - Rétrocompatibilité avec structure plate
  
- ✅ **Bloc Courses - NEW_EVENT** (3 tests)
  - Affichage de `racesToAdd` au niveau racine (EDITION_UPDATE)
  - Affichage de `edition.new.races` (NEW_EVENT) ⭐ **Nouveau**
  - État vide quand aucune course
  
- ✅ **Bloc Organizer** (1 test)
  - Vérification que le cas existant fonctionne toujours
  
- ✅ **Bandeau "Appliqué"** (2 tests)
  - Affichage quand `isApplied=true`
  - Caché quand `isApplied=false`

**Résultat** : ✅ **10 tests passent** (1 fichier)

```bash
$ npm run test:run -- BlockChangesTable

 PASS  src/components/updates/__tests__/BlockChangesTable.test.tsx
  BlockChangesTable
    Bloc Edition - NEW_EVENT
      ✓ should display edition fields from edition.new structure
      ✓ should display "Valeur actuelle: -" when no old value
      ✓ should handle userModifiedChanges override
    Bloc Edition - EDITION_UPDATE (rétrocompatibilité)
      ✓ should display edition fields from root structure
    Bloc Courses - NEW_EVENT
      ✓ should display racesToAdd from root structure (EDITION_UPDATE)
      ✓ should display races from edition.new.races structure (NEW_EVENT)
      ✓ should display empty state when no races
    Bloc Organizer - rétrocompatibilité
      ✓ should display organizer fields from organizer.new structure
    Bandeau "Appliqué"
      ✓ should show success banner when isApplied=true
      ✓ should not show banner when isApplied=false

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

## Configuration tests ajoutée

Pour pouvoir exécuter les tests, les fichiers suivants ont été créés :

**1. `apps/dashboard/jest.config.js`**
- Configuration Jest avec support React (JSX) via ts-jest
- Environnement jsdom pour simuler le navigateur
- Alias `@` pour imports simplifiés
- Gestion des imports CSS via identity-obj-proxy

**2. `apps/dashboard/src/test/setup.ts`**
- Import de `@testing-library/jest-dom` pour les matchers
- Mock de `window.matchMedia` (requis par Material-UI)
- Mock de `IntersectionObserver` (requis par certains composants MUI)

**3. Mise à jour `apps/dashboard/package.json`**
- Scripts ajoutés : `test`, `test:run`, `test:coverage`
- Dépendances dev ajoutées :
  - `@jest/globals`
  - `@types/jest`
  - `@testing-library/jest-dom`
  - `@testing-library/user-event`
  - `jest` + `jest-environment-jsdom`
  - `ts-jest`
  - `identity-obj-proxy`

## Impact

**Avant le fix** :
```
/updates/:id (NEW_EVENT appliquée)
  ✅ Bloc Event : name, city, country
  ✅ Bloc Organizer : name, email
  ❌ Bloc Edition : "Aucun changement détaillé disponible"
  ❌ Bloc Races : "Aucun changement détaillé disponible"
```

**Après le fix** :
```
/updates/:id (NEW_EVENT appliquée)
  ✅ Bloc Event : name, city, country
  ✅ Bloc Organizer : name, email
  ✅ Bloc Edition : year, startDate, endDate, timeZone, calendarStatus
  ✅ Bloc Races : racesToAdd (10km, 21km)
```

## Avantages de cette solution

1. ✅ **Pas de changement backend** → Risque réduit
2. ✅ **Cohérent** avec le traitement existant de `organizer`
3. ✅ **Rétrocompatible** → Support de NEW_EVENT et EDITION_UPDATE
4. ✅ **Isolé** au composant d'affichage
5. ✅ **Testé** avec 9 tests automatisés

## Fichiers modifiés

**Frontend** :
- ✅ `apps/dashboard/src/components/updates/BlockChangesTable.tsx` (ajout cas spécial edition)
- ✅ `apps/dashboard/src/components/updates/__tests__/BlockChangesTable.test.tsx` (nouveau)
- ✅ `apps/dashboard/jest.config.js` (nouveau)
- ✅ `apps/dashboard/src/test/setup.ts` (nouveau)
- ✅ `apps/dashboard/package.json` (scripts + dépendances test)

**Backend** : Aucune modification nécessaire ✅

## Ressources

- Bug report original : `docs/BUG-NEW-EVENT-UPDATES-DISPLAY.md`
- Test backend (failing avant fix) : `apps/agents/src/__tests__/proposal-application/new-event-updates-display.test.ts`
- Page `/updates` : `apps/dashboard/src/pages/UpdateGroupDetail.tsx`
- Composant : `apps/dashboard/src/components/updates/BlockChangesTable.tsx`

## Commandes utiles

```bash
# Exécuter tous les tests du dashboard
cd apps/dashboard && npm run test:run

# Exécuter uniquement les tests BlockChangesTable
cd apps/dashboard && npm run test:run -- BlockChangesTable

# Mode watch pour développement
cd apps/dashboard && npm run test

# Génerer un rapport de couverture
cd apps/dashboard && npm run test:coverage
```
