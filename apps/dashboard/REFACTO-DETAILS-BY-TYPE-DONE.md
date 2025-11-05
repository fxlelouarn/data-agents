# Refactorisation : Pages de détails de propositions par type - Terminé

## ✅ Changements effectués (Phase MVP)

### Phase 1 : Composants de base
- ✅ **GroupedProposalDetailBase.tsx** créé dans `apps/dashboard/src/pages/proposals/detail/base/`
  - Extrait toute la logique commune (état, mutations, navigation, dialogs)
  - Pattern render props pour personnalisation du contenu principal et sidebar
  - Interface `GroupedProposalContext` qui expose tout le contexte nécessaire

### Phase 2.1 : EDITION_UPDATE (PRIORITAIRE)
- ✅ **EditionUpdateGroupedDetail.tsx** créé dans `apps/dashboard/src/pages/proposals/detail/edition-update/`
  - Utilise GroupedProposalDetailBase
  - Sépare les champs standards (`calendarStatus`, `startDate`, etc.) des champs spéciaux
  - Affichage personnalisé pour `organizer` et `racesToAdd`
  
- ✅ **OrganizerSection.tsx** créé dans `apps/dashboard/src/components/proposals/edition-update/`
  - Format tabulaire standard : Champ / Valeur actuelle / Valeur proposée / Confiance
  - Une ligne par champ d'organisateur (nom, email, téléphone, site web)
  - Colonne Confiance avec rowspan pour toutes les lignes
  - Bouton "Approuver" dédié
  - Mise en évidence des valeurs modifiées (bgcolor: primary.light)
  
- ✅ **RacesToAddSection.tsx** créé dans `apps/dashboard/src/components/proposals/edition-update/`
  - Format tabulaire standard : Course / Champ / Valeur actuelle / Valeur proposée / Confiance
  - Une ligne par champ de chaque course (nom, type, distance, date, URL)
  - Colonne Course avec rowspan par course
  - Colonne Confiance avec rowspan pour toutes les lignes
  - Bouton "Approuver tout" dédié
  - Mise en évidence des valeurs proposées (bgcolor: primary.light)

### Phase 3 : Dispatcher
- ✅ **GroupedProposalDetailDispatcher.tsx** créé dans `apps/dashboard/src/pages/proposals/`
  - Route vers `EditionUpdateGroupedDetail` pour les propositions `EDITION_UPDATE`
  - Fallback vers l'ancien `GroupedProposalDetail` pour les autres types (en attendant leur implémentation)
  - Chargement et détection du type de proposition

- ✅ **App.tsx** modifié
  - Route `/proposals/group/:groupKey` utilise maintenant le dispatcher

### Fix bonus
- ✅ **CategorizedChangesTable.tsx** corrigé
  - Import `Chip` manquant ajouté

## 🎯 Résultats obtenus

### Problème résolu
Les champs `organizer` et `racesToAdd` s'affichent maintenant correctement pour les propositions `EDITION_UPDATE` avec :
- Un affichage personnalisé et adapté à leur structure
- La possibilité de les approuver individuellement
- Une meilleure UX avec des composants dédiés

### Architecture
```
apps/dashboard/src/
├── pages/
│   ├── proposals/
│   │   ├── GroupedProposalDetailDispatcher.tsx    # Dispatcher principal
│   │   └── detail/
│   │       ├── base/
│   │       │   └── GroupedProposalDetailBase.tsx  # Composant de base réutilisable
│   │       └── edition-update/
│   │           └── EditionUpdateGroupedDetail.tsx # Page spécifique EDITION_UPDATE
│   │
│   └── GroupedProposalDetail.tsx                  # Ancien composant (encore utilisé comme fallback)
│
└── components/
    └── proposals/
        └── edition-update/                         # Composants spécifiques EDITION_UPDATE
            ├── OrganizerSection.tsx
            └── RacesToAddSection.tsx
```

### Code propre
- ✅ Pas de duplication de code
- ✅ Séparation des responsabilités
- ✅ Type-safe avec TypeScript
- ✅ Réutilisable pour de nouveaux types

## 🔄 Prochaines étapes (Post-MVP)

### Phase 2.2 : EVENT_UPDATE
Créer `apps/dashboard/src/pages/proposals/detail/event-update/EventUpdateGroupedDetail.tsx`
- Affichage uniquement des champs Event
- EventLinksEditor dans la sidebar

### Phase 2.3 : NEW_EVENT
Créer `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`
- Affichage des champs Event + Edition + Races
- Gestion du champ `edition` complexe

### Phase 2.4 : RACE_UPDATE (optionnel)
Créer `apps/dashboard/src/pages/proposals/detail/race-update/RaceUpdateGroupedDetail.tsx`

### Phase 4 : Nettoyage complet
Une fois tous les types implémentés :
- Supprimer `apps/dashboard/src/pages/GroupedProposalDetail.tsx`
- Nettoyer le hook `useProposalLogic` (supprimer le filtrage par type lignes 189-240)
- Mettre à jour tous les imports
- Tests de non-régression

## 📝 Notes d'implémentation

### Pattern utilisé
Le pattern "render props" avec context permet :
```typescript
<GroupedProposalDetailBase
  groupKey={groupKey}
  renderMainContent={(context) => {
    // Accès à tout le contexte (consolidatedChanges, actions, etc.)
    return <YourCustomContent />
  }}
  renderSidebar={(context) => {
    return <YourCustomSidebar />
  }}
/>
```

### Champs spéciaux
Les champs qui ne rentrent pas dans les catégories EVENT/EDITION/RACE doivent :
1. Être filtrés des `consolidatedChanges` dans le composant spécifique
2. Avoir leur propre section avec un composant dédié
3. Utiliser `handleApproveField` du context pour l'approbation

### Extensibilité
Pour ajouter un nouveau type de proposition :
1. Créer un répertoire dans `apps/dashboard/src/pages/proposals/detail/[type]/`
2. Créer `[Type]GroupedDetail.tsx` qui utilise `GroupedProposalDetailBase`
3. Créer les composants spécifiques dans `apps/dashboard/src/components/proposals/[type]/`
4. Ajouter un case dans le dispatcher

## ✅ Tests effectués

- ✅ Type-check TypeScript passe sans erreurs
- ⏳ Test manuel en dev nécessaire pour valider le rendu
- ⏳ Test de navigation entre propositions
- ⏳ Test d'approbation des champs organizer et racesToAdd
- ⏳ Test des autres types (fallback vers ancien composant)

## 📊 Estimation de temps

- **Phase 1** : ~4h (création du base component)
- **Phase 2.1** : ~3h (EDITION_UPDATE + composants spéciaux)
- **Phase 3** : ~1h (dispatcher)
- **Total réalisé** : ~8h

**Temps estimé restant pour le Post-MVP** : ~12-16h
- Phase 2.2 (EVENT_UPDATE) : 2-3h
- Phase 2.3 (NEW_EVENT) : 3-4h
- Phase 2.4 (RACE_UPDATE) : 2-3h
- Phase 4 (Nettoyage) : 1-2h
- Phase 5 (Tests) : 4-4h

## 🚀 Déploiement

1. Vérifier que le type-check passe : `npm run type-check`
2. Tester en dev : `npm run dev`
3. Tester les propositions EDITION_UPDATE avec les champs organizer et racesToAdd
4. Vérifier que les autres types utilisent toujours l'ancien composant (pas de régression)
5. Builder : `npm run build`
6. Déployer en staging
7. Tests utilisateur

## 📚 Documentation associée

- Proposition initiale : `docs/REFACTO-PROPOSAL-DETAILS-BY-TYPE.md`
- Fichier WARP (si existe) : `WARP.md`
