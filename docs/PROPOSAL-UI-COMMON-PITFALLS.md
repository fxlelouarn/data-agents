# Pièges courants - Interfaces de propositions

Ce document répertorie les bugs typiques rencontrés lors de modifications des interfaces de propositions.

## 🎯 Règle d'or

**Toute modification sur une vue de proposition doit être répliquée dans TOUTES les variantes :**
- ✅ Propositions simples (`*Detail.tsx`)
- ✅ Propositions groupées (`*GroupedDetail.tsx`)
- ✅ Tous les types : NEW_EVENT, EDITION_UPDATE, EVENT_UPDATE, RACE_UPDATE

## 🐛 Bugs typiques

### 1. Props manquantes dans les vues groupées

**Symptôme** : Un bouton/fonctionnalité apparaît dans les propositions simples mais pas dans les propositions groupées.

**Exemple concret** :
```typescript
// ❌ NewEventDetail.tsx (FONCTIONNE)
<RacesChangesTable
  existingRaces={[]}
  racesToAdd={proposal?.changes?.edition?.new?.races || []}
  isBlockValidated={isBlockValidated('races')}      // ✅ Props de validation
  onValidateBlock={() => validateBlock('races', blockProposals['races'] || [])}
  onUnvalidateBlock={() => unvalidateBlock('races')}
  isBlockPending={isBlockPending}
  validationDisabled={isEventDead}
/>

// ❌ NewEventGroupedDetail.tsx (BUG)
<RacesChangesTable
  existingRaces={[]}
  racesToAdd={groupProposals[0]?.changes?.edition?.new?.races || []}
  disabled={!allPending || isPending || isEventDead}
  // ❌ Props de validation manquantes !
/>
```

**Solution** : Copier les props de validation depuis la version simple vers la version groupée.

**Fichiers concernés** :
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`
- Tous les `*GroupedDetail.tsx`

---

### 2. Blocs Event et Edition mal séparés

**Symptôme** : Valider le bloc "Event" impacte visuellement le bloc "Edition".

**Cause** : Avant le fix du 2025-11-08, les blocs "Event" et "Edition" contenaient les mêmes propositions sans distinction des champs.

**Solution** : Utiliser `isFieldInBlock()` pour filtrer les propositions par bloc.

```typescript
// ❌ AVANT (incorrect)
const editionProposalIds = groupProposals
  .filter(p => consolidatedChanges.some(c => 
    !['organizer', 'racesToAdd'].includes(c.field) &&  // Trop large !
    c.options.some(o => o.proposalId === p.id)
  ))

// ✅ APRÈS (correct)
const editionProposalIds = groupProposals
  .filter(p => consolidatedChanges.some(c => 
    isFieldInBlock(c.field, 'edition') &&  // Uniquement champs edition
    c.options.some(o => o.proposalId === p.id)
  ))
```

**Documentation** : `docs/BLOCK-SEPARATION-EVENT-EDITION.md`

---

### 3. Mauvais bloc utilisé pour la validation

**Symptôme** : Le bouton de validation d'un bloc valide un autre bloc.

**Exemple concret** :
```typescript
// ❌ INCORRECT - Event table valide le bloc edition
<CategorizedEventChangesTable
  title="Informations de l'événement"
  changes={eventChangesWithUrls}
  isBlockValidated={isBlockValidated('edition')}  // ❌ Mauvais bloc !
  onValidateBlock={() => validateBlock('edition', blockProposals['edition'] || [])}
/>

// ✅ CORRECT - Event table valide le bloc event
<CategorizedEventChangesTable
  title="Informations de l'événement"
  changes={eventChangesWithUrls}
  isBlockValidated={isBlockValidated('event')}  // ✅ Bon bloc
  onValidateBlock={() => validateBlock('event', blockProposals['event'] || [])}
/>
```

---

### 4. Props obsolètes non supprimées

**Symptôme** : Props qui n'existent plus causent des erreurs TypeScript.

**Exemple concret** :
```typescript
// ❌ INCORRECT - validationDisabled n'existe pas sur CategorizedEventChangesTable
<CategorizedEventChangesTable
  isBlockValidated={isBlockValidated('event')}
  onValidateBlock={() => validateBlock('event', blockProposals['event'] || [])}
  onUnvalidateBlock={() => unvalidateBlock('event')}
  validationDisabled={isEventDead}  // ❌ Cette prop n'existe pas !
/>

// ✅ CORRECT - Supprimer la prop
<CategorizedEventChangesTable
  isBlockValidated={isBlockValidated('event')}
  onValidateBlock={() => validateBlock('event', blockProposals['event'] || [])}
  onUnvalidateBlock={() => unvalidateBlock('event')}
/>
```

---

### 5. Oubli de mise à jour dans les composants Base

**Symptôme** : Modifications dans les vues spécifiques mais pas dans la logique partagée.

**Exemple** : Ajout d'un nouveau type de bloc dans `NewEventGroupedDetail.tsx` sans mettre à jour la définition de `blockProposals` dans `GroupedProposalDetailBase.tsx`.

**Solution** : Toujours vérifier les **composants Base** en plus des vues spécifiques :
- `ProposalDetailBase.tsx`
- `GroupedProposalDetailBase.tsx`

---

## ✅ Checklist de vérification

Avant de considérer une modification terminée :

### 1. Composants Base
- [ ] `ProposalDetailBase.tsx` modifié si nécessaire
- [ ] `GroupedProposalDetailBase.tsx` modifié si nécessaire
- [ ] Logique de `blockProposals` mise à jour si nouveau bloc

### 2. Vues simples
- [ ] `new-event/NewEventDetail.tsx`
- [ ] `edition-update/EditionUpdateDetail.tsx`
- [ ] `event-update/EventUpdateDetail.tsx`
- [ ] `race-update/RaceUpdateDetail.tsx`

### 3. Vues groupées
- [ ] `new-event/NewEventGroupedDetail.tsx`
- [ ] `edition-update/EditionUpdateGroupedDetail.tsx`
- [ ] `event-update/EventUpdateGroupedDetail.tsx`
- [ ] `race-update/RaceUpdateGroupedDetail.tsx`

### 4. Composants partagés
Si modification d'un composant partagé, tester dans :
- [ ] Propositions NEW_EVENT (simple + groupée)
- [ ] Propositions EDITION_UPDATE (simple + groupée)
- [ ] Propositions EVENT_UPDATE (simple + groupée)

### 5. Compilation
- [ ] `npm run tsc` passe sans erreur

### 6. Tests manuels
- [ ] Au moins 1 proposition NEW_EVENT groupée testée
- [ ] Au moins 1 proposition EDITION_UPDATE groupée testée
- [ ] Au moins 1 proposition simple de chaque type testée

---

## 📝 Template de commit

Pour documenter clairement les modifications multi-fichiers :

```
fix(proposals): [description du fix]

Appliqué dans :
- ✅ ProposalDetailBase.tsx
- ✅ GroupedProposalDetailBase.tsx
- ✅ NewEventDetail.tsx
- ✅ NewEventGroupedDetail.tsx
- ✅ EditionUpdateDetail.tsx
- ✅ EditionUpdateGroupedDetail.tsx

Tests :
- ✅ NEW_EVENT groupée
- ✅ EDITION_UPDATE groupée
- ✅ Propositions simples
```

---

## 🔍 Commandes utiles

### Vérifier cohérence entre simple/groupée
```bash
# Comparer les props passées à RacesChangesTable
grep -A 10 "RacesChangesTable" apps/dashboard/src/pages/proposals/detail/new-event/NewEventDetail.tsx
grep -A 10 "RacesChangesTable" apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx
```

### Trouver tous les fichiers à modifier
```bash
# Lister toutes les vues de propositions
find apps/dashboard/src/pages/proposals/detail -name "*Detail.tsx" -o -name "*GroupedDetail.tsx"
```

### Vérifier TypeScript
```bash
cd apps/dashboard && npx tsc --noEmit
```

---

## 📚 Ressources

- `WARP.md` - Section "Dashboard - Interfaces de propositions"
- `docs/BLOCK-SEPARATION-EVENT-EDITION.md` - Séparation des blocs
- `docs/BLOCK-SEPARATION-SUMMARY.md` - Résumé des modifications récentes
