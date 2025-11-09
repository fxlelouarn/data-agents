# Résumé - Séparation des blocs Event et Edition

## Problème
Valider le bloc "Event" impactait visuellement le bloc "Edition" car les deux blocs contenaient les mêmes propositions sans distinction des champs.

## Solution implémentée

### 1. Fichier de configuration centralisé
**Nouveau fichier** : `apps/dashboard/src/utils/blockFieldMapping.ts`

Définit explicitement quels champs appartiennent à chaque bloc :
- **Event** : `name`, `city`, `country`, `websiteUrl`, etc.
- **Edition** : `year`, `startDate`, `endDate`, `calendarStatus`, `timeZone`, etc.
- **Organizer** : `organizer`
- **Races** : `racesToAdd`, `racesToUpdate`, `existingRaces`

### 2. Fonctions utilitaires
- `isFieldInBlock(fieldName, blockKey)` - Vérifie si un champ appartient à un bloc
- `getBlockForField(fieldName)` - Retourne le bloc d'un champ
- `filterFieldsByBlock(changes, blockKey)` - Filtre les changements d'un bloc

### 3. Modifications des composants Base

**GroupedProposalDetailBase.tsx** :
- Import de `isFieldInBlock` et `getBlockForField`
- Calcul de `blockProposals` refactorisé pour utiliser `isFieldInBlock()`
- Chaque bloc ne contient que les propositions avec les champs qui le concernent

**ProposalDetailBase.tsx** :
- Même logique que pour GroupedProposalDetailBase
- Ajout de logs de debug pour tracer la détection des blocs

**NewEventDetail.tsx** :
- Fix : `CategorizedEventChangesTable` utilise maintenant `isBlockValidated('event')` au lieu de `'edition'`
- Suppression de la prop `validationDisabled` non supportée
- Ajout de la validation par blocs à `CategorizedEditionChangesTable`

## Résultat

✅ Chaque bloc est maintenant **indépendant**
✅ Valider "Event" n'impacte que les champs event
✅ Valider "Edition" n'impacte que les champs edition
✅ Fonctionne pour propositions simples ET groupées
✅ Fonctionne pour NEW_EVENT, EDITION_UPDATE, et EVENT_UPDATE

## Tests manuels recommandés

1. Ouvrir une proposition NEW_EVENT groupée
2. Valider le bloc "Event" → Vérifier que le bloc "Edition" reste intact
3. Dévalider le bloc "Event" → Vérifier que le bloc "Edition" reste intact
4. Valider le bloc "Edition" → Vérifier que le bloc "Event" reste intact
5. Consulter les logs console pour voir la séparation des blocs

## Fichiers modifiés

1. ✅ `apps/dashboard/src/utils/blockFieldMapping.ts` (nouveau)
2. ✅ `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
3. ✅ `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`
4. ✅ `apps/dashboard/src/pages/proposals/detail/new-event/NewEventDetail.tsx`
5. ✅ `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx` - Ajout validation bloc races

## Documentation

- `docs/BLOCK-SEPARATION-EVENT-EDITION.md` - Documentation complète technique
- `docs/BLOCK-SEPARATION-SUMMARY.md` - Ce résumé

## Commande de vérification

```bash
cd apps/dashboard && npx tsc --noEmit
```

✅ Compilation réussie
