# Phase 2 : Avancement de la refactorisation

**Date** : 2025-11-11  
**Statut** : 🟡 PAUSE - Décision requise

## ✅ Ce qui a été fait

### 1. Préparation de GroupedProposalDetailBase
- [x] Import du nouveau hook `useProposalEditor`
- [x] Commentaires TODO pour guider la suite de la migration
- [x] Ancien code conservé en parallèle (migration progressive)

### 2. Documentation créée
- [x] `docs/PHASE2-MIGRATION-PROGRESS.md` - Plan détaillé de la migration
- [x] Analyse des deux options possibles (Option A vs Option B)

## 🛑 Décision requise

**Question clé** : Comment gérer les **propositions groupées** ?

Le hook `useProposalEditor` actuel ne gère qu'une proposition à la fois, mais `GroupedProposalDetailBase` gère **plusieurs propositions consolidées** (ex: 3 agents proposent des modifications pour la même édition).

### Option A : Simple et rapide ⚡
**Approche** : Utiliser le hook uniquement pour la première proposition du groupe.

```typescript
const firstProposalId = groupProposals[0]?.id
const { workingProposal, updateField, updateRace } = useProposalEditor(firstProposalId)
```

**Pros** :
- ✅ Fonctionne immédiatement
- ✅ Pas de modification du hook

**Cons** :
- ❌ Les autres propositions du groupe ne bénéficient pas du nouveau système
- ❌ On perd la consolidation multi-agents
- ❌ Régression fonctionnelle

### Option B : Robuste et évolutif 🏗️ (RECOMMANDÉ)
**Approche** : Étendre le hook pour supporter les groupes nativement.

```typescript
const proposalIds = groupProposals.map(p => p.id)
const {
  workingProposals, // Tableau de WorkingProposal
  consolidatedChanges, // Merge automatique des 3 agents
  updateField, // Appliqué à toutes les propositions
  validateBlock
} = useProposalEditor(proposalIds)
```

**Pros** :
- ✅ Architecture propre et scalable
- ✅ Consolidation multi-agents conservée
- ✅ Réutilisable pour d'autres vues groupées
- ✅ Cohérent avec l'objectif "Single Source of Truth"

**Cons** :
- ⏱️ Nécessite de modifier `useProposalEditor` (~2-3h de travail)

## 📊 Impact estimé

| Aspect | Option A | Option B |
|--------|----------|----------|
| Temps dev | 1 jour | 2-3 jours |
| Qualité code | ⚠️ Compromis | ✅ Excellente |
| Bugs potentiels | ⚠️ Risque moyen | ✅ Risque faible |
| Évolutivité | ❌ Limitée | ✅ Excellente |
| Consolidation | ❌ Perdue | ✅ Améliorée |

## 💡 Recommandation

**Choisir l'Option B** pour les raisons suivantes :

1. **Cohérence architecturale** : On veut une "Single Source of Truth", pas un système hybride
2. **Qualité à long terme** : 1-2 jours de travail supplémentaire pour éviter des mois de dette technique
3. **Bugs évités** : Le système actuel a déjà causé plusieurs bugs (perte de modifications, etc.)
4. **Réutilisabilité** : D'autres vues utilisent aussi des groupes (ex: EDITION_UPDATE)

## 🎯 Prochaines étapes (si Option B choisie)

### Étape 2.1 : Étendre useProposalEditor
- [ ] Modifier la signature : `proposalId: string | string[]`
- [ ] Ajouter `loadProposalGroup()` pour charger plusieurs propositions
- [ ] Ajouter `consolidateProposals()` pour merger les changements
- [ ] Retourner `workingProposals[]` + `consolidatedChanges`

### Étape 2.2 : Intégrer dans GroupedProposalDetailBase
- [ ] Initialiser le hook avec `groupProposals.map(p => p.id)`
- [ ] Remplacer `selectedChanges` par `consolidatedChanges`
- [ ] Remplacer `handleFieldModify` par `updateField`
- [ ] Remplacer `handleRaceFieldModify` par `updateRace`

### Étape 2.3 : Tester en parallèle
- [ ] Comparer les payloads (ancien vs nouveau système)
- [ ] Vérifier que la sauvegarde fonctionne
- [ ] Vérifier que la validation par blocs fonctionne

### Étape 2.4 : Basculer et nettoyer
- [ ] Supprimer l'ancien code
- [ ] Supprimer `selectedChanges`, `userModifiedChanges`, `userModifiedRaceChanges`
- [ ] Mettre à jour la documentation

## ❓ Questions ouvertes

1. **Faut-il implémenter le support groupé en Phase 2 ou le faire en Phase 1.5 (retour sur useProposalEditor) ?**
   - Recommandation : Phase 1.5 (modifier le hook avant de l'utiliser)

2. **Faut-il garder l'ancien code en "feature flag" ou migrer d'un coup ?**
   - Recommandation : Migration progressive (moins risqué)

## 📝 Décision

**Quelle option choisis-tu ?**
- [ ] Option A : Simple et rapide (1 jour, compromis sur la qualité)
- [ ] Option B : Robuste et évolutif (2-3 jours, qualité optimale)

---

**Fichiers modifiés dans cette Phase** :
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (import + TODO)
- `docs/PHASE2-MIGRATION-PROGRESS.md` (plan détaillé)
- `docs/PHASE2-SUMMARY.md` (ce fichier)
