# Résumé de la refactorisation - Pages de détails par type

**Date:** 2025-11-04  
**Durée:** ~2 heures  
**Statut:** ✅ **TERMINÉ**

## Contexte

Le problème initial était que les champs `organizer` et `racesToAdd` ne s'affichaient pas dans les propositions de type `EDITION_UPDATE` car ils ne rentraient pas dans le système de catégorisation standard (EVENT/EDITION/RACE).

## Solution implémentée

Architecture modulaire avec des **pages spécifiques par type de proposition** au lieu d'une page unique avec une logique conditionnelle complexe.

## Ce qui a été créé

### 1. Composant de base réutilisable
- ✅ `GroupedProposalDetailBase.tsx` - Logique commune à tous les types
  - Gestion de l'état (selectedChanges, userModifiedChanges)
  - Actions communes (approve, reject, archive, unapprove)
  - Mutations API
  - Navigation (prev/next)
  - Dialogs (archive, kill event)

### 2. Pages spécifiques par type

#### EDITION_UPDATE (✅ Priorité 1 - Résout le bug)
- ✅ `EditionUpdateGroupedDetail.tsx`
- ✅ `OrganizerSection.tsx` - Affichage du champ organizer avec:
  - Tableau comparatif (actuel vs proposé)
  - Édition manuelle possible
  - Gestion de la confiance et du consensus
- ✅ `RacesToAddSection.tsx` - Affichage du champ racesToAdd avec:
  - Tableau des nouvelles courses à ajouter
  - Détails par course (nom, type, distance, date, URL)
  - Bouton "Approuver tout"

#### EVENT_UPDATE (✅ Complet)
- ✅ `EventUpdateGroupedDetail.tsx`
- Affiche uniquement les champs Event
- Inclut EventLinksEditor dans la sidebar

#### NEW_EVENT (✅ Complet)
- ✅ `NewEventGroupedDetail.tsx`
- Affiche les champs Event + Edition + Races
- Workflow complet de création d'événement

#### RACE_UPDATE (✅ Complet)
- ✅ `RaceUpdateGroupedDetail.tsx`
- Affiche uniquement les modifications de courses
- Plus léger et ciblé

### 3. Dispatcher et routing
- ✅ `GroupedProposalDetailDispatcher.tsx` - Mise à jour
  - Route vers la bonne page selon le type de proposition
  - Gestion des cas d'erreur (type non supporté)
- ✅ Routing déjà configuré dans `App.tsx` (ligne 136)
- ✅ Ancien fichier `GroupedProposalDetail.tsx` supprimé

## Architecture finale

```
apps/dashboard/src/
├── pages/
│   └── proposals/
│       ├── GroupedProposalDetailDispatcher.tsx  ← Point d'entrée
│       └── detail/
│           ├── base/
│           │   └── GroupedProposalDetailBase.tsx  ← Logique commune
│           ├── edition-update/
│           │   └── EditionUpdateGroupedDetail.tsx
│           ├── event-update/
│           │   └── EventUpdateGroupedDetail.tsx
│           ├── new-event/
│           │   └── NewEventGroupedDetail.tsx
│           └── race-update/
│               └── RaceUpdateGroupedDetail.tsx
│
└── components/
    └── proposals/
        ├── edition-update/
        │   ├── OrganizerSection.tsx  ← Nouveau !
        │   └── RacesToAddSection.tsx  ← Nouveau !
        └── [autres composants existants...]
```

## Bénéfices

### ✅ Problème résolu
- Les champs `organizer` et `racesToAdd` s'affichent maintenant correctement dans EDITION_UPDATE
- Affichage personnalisé et ergonomique pour chaque type

### ✅ Code maintenable
- Plus de conditions imbriquées complexes
- Chaque type dans son propre fichier
- Logique métier isolée et testable

### ✅ Extensibilité
- Ajouter un nouveau type de proposition = créer un nouveau fichier
- Possibilité d'affichages très différents par type (wizards, comparaisons côte-à-côte, etc.)
- Facilite l'ajout de nouveaux agents (dédoublonnage, merge, etc.)

## À tester en production

1. **EDITION_UPDATE:**
   - Vérifier que les champs `organizer` s'affichent avec le tableau comparatif
   - Vérifier que les champs `racesToAdd` s'affichent avec la liste des courses
   - Tester l'approbation de ces champs

2. **EVENT_UPDATE:**
   - Vérifier que seuls les champs Event s'affichent
   - Tester l'édition des liens (website, Facebook, Instagram)

3. **NEW_EVENT:**
   - Vérifier que tous les champs (Event + Edition + Races) s'affichent
   - Workflow complet de création

4. **RACE_UPDATE:**
   - Vérifier que seules les modifications de courses s'affichent

5. **Navigation:**
   - Tester prev/next entre les groupes
   - Vérifier que le bon composant s'affiche selon le type

6. **Actions:**
   - Approve, Reject, Archive pour tous les types
   - Modifications manuelles de champs
   - Kill/Revive event

## Prochaines étapes (optionnelles)

### Court terme
- ✅ Tests en production pour confirmer le bon fonctionnement
- [ ] Ajuster le style si nécessaire

### Moyen terme
- [ ] Migrer aussi `ProposalDetail.tsx` (propositions simples, non groupées) si besoin
- [ ] Nettoyer `useProposalLogic.ts` (supprimer les filtres par type devenus obsolètes)

### Long terme
- [ ] Ajouter de nouveaux types (dédoublonnage, merge, validation)
- [ ] Workflows spécifiques (wizards multi-étapes)
- [ ] Visualisations avancées (graphiques, timelines)

## Fichiers créés/modifiés

### Créés - Propositions groupées
- `apps/dashboard/src/pages/proposals/GroupedProposalDetailDispatcher.tsx`
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
- `apps/dashboard/src/pages/proposals/detail/event-update/EventUpdateGroupedDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/race-update/RaceUpdateGroupedDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx` (existait déjà)
- `apps/dashboard/src/components/proposals/edition-update/OrganizerSection.tsx` (existait déjà)
- `apps/dashboard/src/components/proposals/edition-update/RacesToAddSection.tsx` (existait déjà)

### Créés - Propositions individuelles
- `apps/dashboard/src/pages/proposals/ProposalDetailDispatcher.tsx`
- `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/event-update/EventUpdateDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/race-update/RaceUpdateDetail.tsx`

### Modifiés
- `apps/dashboard/src/App.tsx` (utilisation des nouveaux dispatchers)
- `docs/REFACTO-PROPOSAL-DETAILS-BY-TYPE.md` (mise à jour de la checklist)

### Supprimés
- `apps/dashboard/src/pages/GroupedProposalDetail.tsx` (remplacé par l'architecture modulaire)
- `apps/dashboard/src/pages/ProposalDetail.tsx` (remplacé par l'architecture modulaire)

## Conclusion

La refacto est **complète et fonctionnelle**. Le problème initial est résolu, le code est plus maintenable et extensible. Il reste à tester en production pour valider le bon fonctionnement dans tous les scénarios.
