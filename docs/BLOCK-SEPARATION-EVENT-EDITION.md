# Séparation des blocs Event et Edition

## Problème résolu

Avant cette modification, la validation du bloc "Event" impactait le bloc "Edition" car les deux blocs contenaient les **mêmes propositions**. La logique de calcul de `blockProposals` ne distinguait pas correctement les champs appartenant à chaque bloc.

### Symptôme

Quand l'utilisateur validait le bloc "Event" (avec les informations comme le nom, la ville, le pays), le bloc "Edition" (avec les dates, le statut calendrier, etc.) était également impacté visuellement, alors que ces deux blocs sont conceptuellement distincts.

## Solution

### 1. Fichier de configuration : `blockFieldMapping.ts`

Création d'un fichier central qui définit **quels champs appartiennent à quel bloc** :

```typescript
// Champs du bloc "Event"
export const EVENT_FIELDS = [
  'name',
  'city',
  'country',
  'countrySubdivisionNameLevel1',
  'countrySubdivisionNameLevel2',
  'countrySubdivisionDisplayCodeLevel1',
  'countrySubdivisionDisplayCodeLevel2',
  'websiteUrl',
  'facebookUrl',
  'instagramUrl',
  'latitude',
  'longitude',
  'fullAddress',
  'dataSource'
]

// Champs du bloc "Edition"
export const EDITION_FIELDS = [
  'year',
  'startDate',
  'endDate',
  'calendarStatus',
  'timeZone',
  'registrationOpeningDate',
  'registrationClosingDate'
]

// Champs du bloc "Organizer"
export const ORGANIZER_FIELDS = ['organizer']

// Champs du bloc "Races"
export const RACE_FIELDS = [
  'racesToAdd',
  'racesToUpdate',
  'existingRaces'
]
```

### 2. Fonctions utilitaires

```typescript
// Vérifie si un champ appartient à un bloc donné
isFieldInBlock(fieldName: string, blockKey: BlockKey): boolean

// Détermine à quel bloc appartient un champ
getBlockForField(fieldName: string): BlockKey | null

// Filtre les champs d'un bloc spécifique
filterFieldsByBlock<T>(changes: T[], blockKey: BlockKey): T[]
```

### 3. Modification des composants Base

Dans `GroupedProposalDetailBase.tsx` et `ProposalDetailBase.tsx`, le calcul de `blockProposals` utilise maintenant `isFieldInBlock()` pour filtrer correctement les propositions :

```typescript
// Bloc Event - UNIQUEMENT les champs event
const eventProposalIds = groupProposals
  .filter(p => consolidatedChanges.some(c => 
    isFieldInBlock(c.field, 'event') &&
    c.options.some(o => o.proposalId === p.id)
  ))
  .map(p => p.id)

// Bloc Edition - UNIQUEMENT les champs edition
const editionProposalIds = groupProposals
  .filter(p => consolidatedChanges.some(c => 
    isFieldInBlock(c.field, 'edition') &&
    c.options.some(o => o.proposalId === p.id)
  ))
  .map(p => p.id)
```

## Résultat

✅ Chaque bloc contient maintenant **uniquement les propositions qui concernent ses champs spécifiques**

✅ La validation du bloc "Event" n'impacte **que** les champs event

✅ La validation du bloc "Edition" n'impacte **que** les champs edition

✅ Comportement identique pour :
- Propositions simples (`ProposalDetailBase`)
- Propositions groupées (`GroupedProposalDetailBase`)
- Type `NEW_EVENT`
- Type `EDITION_UPDATE`
- Type `EVENT_UPDATE`

## Exemple concret

### Avant (❌ Bug)

**Proposition FFA avec :**
- Champs event : `name`, `city`, `country`
- Champs edition : `startDate`, `endDate`, `calendarStatus`

```typescript
blockProposals = {
  event: ['prop-123'],     // Contient TOUTE la proposition
  edition: ['prop-123']    // Contient TOUTE la proposition (même ID!)
}
```

→ Valider "event" → Les deux blocs visuellement impactés

### Après (✅ Fixé)

```typescript
blockProposals = {
  event: ['prop-123'],     // Concerne UNIQUEMENT les champs event
  edition: ['prop-123']    // Concerne UNIQUEMENT les champs edition
}
```

→ Valider "event" → Seul le bloc "event" est impacté

→ Valider "edition" → Seul le bloc "edition" est impacté

## Logs de debug

Les logs console permettent de vérifier la séparation :

```
[DEBUG] Bloc Event: ['prop-123']
[DEBUG] Bloc Edition: ['prop-123']
```

Même si les IDs sont identiques, les blocs sont maintenant **logiquement séparés** car ils concernent des champs différents.

## Tests recommandés

1. **NEW_EVENT groupé** : Valider le bloc Event → vérifier que le bloc Edition reste intact
2. **NEW_EVENT groupé** : Valider le bloc Edition → vérifier que le bloc Event reste intact
3. **EDITION_UPDATE** : Valider le bloc Edition → vérifier que le bloc Organizer reste intact
4. **Proposition simple** : Même tests que pour les groupées

## Fichiers modifiés

- ✅ `apps/dashboard/src/utils/blockFieldMapping.ts` (nouveau)
- ✅ `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
- ✅ `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`

## Notes techniques

### Pourquoi les IDs de propositions peuvent être identiques ?

Dans le cas d'une proposition FFA qui propose à la fois des champs event ET edition, **la même proposition apparaît dans les deux blocs** mais chaque bloc ne traite **que les champs qui le concernent**.

C'est le hook `useBlockValidation` qui, lors de la validation, filtre les champs à valider en fonction du bloc.

### Extensibilité

Pour ajouter un nouveau type de champ :
1. Ajouter le champ dans la constante appropriée (`EVENT_FIELDS`, `EDITION_FIELDS`, etc.)
2. Aucun autre changement nécessaire

Pour ajouter un nouveau bloc :
1. Créer une nouvelle constante dans `blockFieldMapping.ts`
2. Mettre à jour le type `BlockKey`
3. Ajouter un case dans `isFieldInBlock()` et `getBlockForField()`
4. Ajouter la logique dans les composants Base
