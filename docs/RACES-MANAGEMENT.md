# Gestion des courses dans les propositions EDITION_UPDATE

## Vue d'ensemble

Les propositions `EDITION_UPDATE` permettent de gérer complètement les courses d'une édition :
- Affichage des courses existantes
- Proposition d'ajout de nouvelles courses
- Édition inline de tous les champs
- Suppression de courses existantes ou proposées

## Interface utilisateur

### Composant RacesChangesTable

Le composant `RacesChangesTable` suit le même pattern que les autres sections (Édition, Organisateur) avec une structure en ligne par champ.

#### Structure du tableau

**Colonnes** :
1. **Statut** : Chip indiquant le type de course
   - "Existante" (gris) : Course déjà présente dans l'édition
   - "Nouvelle" (vert) : Course proposée par l'agent
   - "À supprimer" (rouge) : Course existante marquée pour suppression
   - "Supprimée" (gris) : Course proposée filtrée

2. **Champ** : Nom du champ
   - Nom
   - Distance (km)
   - D+ (m)
   - Type

3. **Valeur actuelle** : Valeur en base de données
   - Pour les courses existantes : valeur actuelle
   - Pour les nouvelles courses : "-"

4. **Valeur proposée** : Valeur éditable
   - Icône crayon pour éditer
   - Édition inline avec TextField
   - Boutons Check/Close pour valider/annuler

5. **Action** : Bouton de suppression/restauration
   - Delete (rouge) : Supprimer/filtrer
   - Undo (gris) : Annuler la suppression

#### Champs de course

```typescript
const RACE_FIELDS = [
  { key: 'name', label: 'Nom' },
  { key: 'distance', label: 'Distance (km)' },
  { key: 'elevation', label: 'D+ (m)' },
  { key: 'type', label: 'Type' } // Affiché en majuscule
]
```

### Édition inline

**Démarrer l'édition** :
- Clic sur l'icône crayon
- TextField apparaît avec la valeur actuelle
- Focus automatique

**Valider** :
- Clic sur Check (vert)
- Sauvegarde dans `userModifiedChanges.raceEdits`
- Synchronisation avec le backend

**Annuler** :
- Clic sur Close
- Retour à la valeur précédente

### Suppressions

**Course existante** :
- Clic sur Delete : marque pour suppression
  - Fond rouge clair, opacité réduite
  - Chip "À supprimer"
- Clic sur Undo : annule la suppression

**Course proposée** :
- Clic sur Delete : filtre la proposition
  - Opacité réduite, texte barré
  - Chip "Supprimée"
- Clic sur Undo : restaure la proposition

## Structure des données

### userModifiedChanges

Toutes les modifications utilisateur sont stockées dans `userModifiedChanges` :

```typescript
{
  // Courses existantes à supprimer (IDs)
  racesToDelete: [123, 456],
  
  // Courses proposées à filtrer (indices)
  racesToAddFiltered: [0, 2],
  
  // Éditions de courses (existantes et nouvelles)
  raceEdits: {
    'existing-0': {
      name: 'Nouveau nom',
      distance: '10',
      elevation: '500'
    },
    'new-1': {
      name: 'Course éditée',
      type: 'TRAIL'
    }
  }
}
```

### Format des clés raceEdits

- **Courses existantes** : `existing-{index}`
  - Index correspond à la position dans `proposal.existingRaces`
  
- **Nouvelles courses** : `new-{index}`
  - Index correspond à la position dans `changes.racesToAdd.new`

### existingRaces (enrichi)

Lors de l'enrichissement de la proposition, les courses existantes sont ajoutées :

```typescript
{
  existingRaces: [
    {
      id: 12345,
      name: "10 km",
      distance: 10,
      elevation: 250,
      type: "ROAD_RACE",
      startDate: "2025-06-15T08:00:00Z"
    }
  ]
}
```

## Backend - Application

### Ordre d'exécution

Lors de l'application d'une proposition `EDITION_UPDATE` avec modifications de courses :

1. **Mise à jour de l'édition** (champs standards)

2. **Mise à jour des courses existantes éditées**
   ```typescript
   // Parcourir raceEdits['existing-*']
   // Appliquer updateRace() pour chaque course modifiée
   ```

3. **Suppression des courses existantes**
   ```typescript
   // Parcourir racesToDelete
   // Appliquer deleteRace() pour chaque ID
   ```

4. **Ajout des nouvelles courses**
   ```typescript
   // Parcourir racesToAdd (sauf racesToAddFiltered)
   // Appliquer les éditions depuis raceEdits['new-*']
   // Créer avec createRace()
   ```

### Code d'application

```typescript
// 1. Update existing races
const raceEdits = proposal?.userModifiedChanges?.raceEdits || {}
const existingRaceEdits = Object.keys(raceEdits)
  .filter(key => key.startsWith('existing-'))
  .map(key => ({ 
    index: parseInt(key.replace('existing-', '')), 
    edits: raceEdits[key] 
  }))

for (const { index, edits } of existingRaceEdits) {
  const race = proposal.existingRaces[index]
  const updateData = {
    name: edits.name,
    runDistance: parseFloat(edits.distance),
    runPositiveElevation: parseFloat(edits.elevation),
    type: edits.type
  }
  await milesRepo.updateRace(race.id, updateData)
}

// 2. Delete races
for (const raceId of racesToDelete) {
  await milesRepo.deleteRace(raceId)
}

// 3. Add new races
for (let i = 0; i < racesToAdd.length; i++) {
  if (racesToAddFiltered.includes(i)) continue
  
  const raceData = racesToAdd[i]
  const edits = raceEdits[`new-${i}`] || {}
  
  await milesRepo.createRace({
    editionId,
    eventId,
    name: edits.name || raceData.name,
    runDistance: edits.distance ? parseFloat(edits.distance) : raceData.distance,
    runPositiveElevation: edits.elevation ? parseFloat(edits.elevation) : raceData.elevation,
    type: edits.type || raceData.type
  })
}
```

## Validation par bloc

Le bouton "Valider Courses" :
- Valide l'ensemble du bloc de courses
- Inclut toutes les modifications (éditions + suppressions)
- Suit le même pattern que les autres blocs (Édition, Organisateur)

```typescript
const { isValidated, validate, cancel } = useProposalBlockValidation(
  proposalId,
  'races'
)
```

## Fichiers concernés

### Frontend
- `apps/dashboard/src/components/proposals/edition-update/RacesChangesTable.tsx`
  - Composant principal de gestion des courses
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateDetail.tsx`
  - Intégration dans la vue détail simple
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`
  - Intégration dans la vue détail groupée
- `apps/dashboard/src/types/index.ts`
  - Types `existingRaces` et `userModifiedChanges`

### Backend
- `apps/api/src/routes/proposals.ts`
  - Enrichissement avec `existingRaces`
- `packages/database/src/services/proposal-domain.service.ts`
  - Application des modifications de courses
- `packages/database/src/repositories/miles-republic.repository.ts`
  - Méthodes `deleteRace()`, `updateRace()`, `createRace()`

## Cas d'usage

### Scénario 1 : Agent FFA propose de nouvelles courses

1. Agent scrape la FFA et trouve 3 courses
2. Proposition créée avec `changes.racesToAdd`
3. Dashboard affiche :
   - Courses existantes (si présentes)
   - 3 nouvelles courses proposées
4. Utilisateur peut :
   - Éditer les noms/distances/types
   - Filtrer certaines courses proposées
   - Valider le bloc

### Scénario 2 : Correction des courses existantes

1. Édition a 5 courses avec erreurs
2. Dashboard charge et affiche les 5 courses existantes
3. Utilisateur édite :
   - Corrige le nom de la course 1
   - Ajuste la distance de la course 3
   - Supprime la course 5 (doublon)
4. Validation du bloc
5. Application : 2 updates + 1 delete

### Scénario 3 : Combinaison

1. 3 courses existantes + 2 nouvelles proposées
2. Utilisateur :
   - Édite le nom d'une existante
   - Supprime une existante
   - Édite le type d'une nouvelle
   - Filtre une nouvelle
3. Validation du bloc
4. Application :
   - 1 update (existante)
   - 1 delete (existante)
   - 1 create (nouvelle éditée)
   - 1 skip (nouvelle filtrée)

## Migration depuis RacesToAddSection

L'ancien composant `RacesToAddSection` est remplacé par `RacesChangesTable` :

**Avant** :
- Format différent des autres sections
- Dialog séparé pour éditer le nom
- Pas de gestion unifiée existantes/nouvelles

**Après** :
- Format standardisé identique à Édition/Organisateur
- Édition inline de tous les champs
- Vue unifiée courses existantes + nouvelles

## Bonnes pratiques

1. **Toujours charger existingRaces** : Même sans proposition de nouvelles courses
2. **Valider les types numériques** : Distance et dénivelé doivent être parsés en float
3. **Types en majuscule** : Toujours afficher les types en majuscule (UI)
4. **Clés cohérentes** : Respecter le format `existing-{idx}` / `new-{idx}`
5. **Synchronisation immédiate** : Sauvegarder après chaque modification

## Limitations

- Les champs `startDate` et `registrationUrl` ne sont pas éditables dans l'interface actuelle
- Pas de possibilité d'ajouter manuellement une nouvelle course (seulement éditer les proposées)
- Les modifications ne peuvent pas être annulées individuellement (seulement via unapprove global)
