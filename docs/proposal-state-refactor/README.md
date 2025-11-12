# Documentation : Refactoring Proposal State Management

Ce répertoire contient toute la documentation liée à la **refonte majeure de la gestion de l'état des propositions** dans le dashboard.

## 📖 Vue d'ensemble

**Objectif** : Résoudre les problèmes de perte de modifications utilisateur en créant un **Single Source of Truth** via le hook `useProposalEditor`.

**Statut actuel** : 🟡 PHASE 2 partiellement terminée (2025-11-12)

| Composant | Statut |
|-----------|--------|
| `GroupedProposalDetailBase` | ✅ Migré |
| `ProposalDetailBase` | ❌ Non migré |

## 📂 Organisation des documents

### ⭐ COMMENCER ICI

- **`STATUS-2025-11-12.md`** - État actuel du refactoring
  - Vue d'ensemble de ce qui a été fait
  - Ce qui reste à faire (ProposalDetailBase)
  - Métriques de succès

### 🎯 Plans de migration

- **`PLAN-PROPOSAL-STATE-REFACTOR.md`** - Plan complet de la refonte (6 phases)
  - Architecture actuelle (cassée) vs architecture cible
  - Spécifications du hook `useProposalEditor`
  - Plan de développement phase par phase

- **`PHASE2-PROPOSAL-DETAIL-BASE.md`** ⭐ PROCHAINE ÉTAPE
  - Plan détaillé de migration de `ProposalDetailBase`
  - 5 étapes avec checklist
  - Estimation : 3h

### ✅ Phase 1 : Création du hook (COMPLÈTE)

- **`REFACTORING-PHASE1-COMPLETE.md`** - Création du hook pour mode simple
- **`HOOK-PROPOSAL-EDITOR.md`** - Documentation technique du hook

### ✅ Phase 1.5 : Support mode groupé (COMPLÈTE)

- **`PHASE1.5-GROUP-SUPPORT-COMPLETE.md`** - Extension du hook pour propositions groupées
  - Types : `WorkingProposalGroup`, `ConsolidatedChange`, `ConsolidatedRaceChange`
  - Fonctions : `consolidateChangesFromProposals()`, `selectOption()`, `validateAllBlocks()`
  - Exemples d'utilisation

### ✅ Phase 2 : Intégration GroupedProposalDetailBase (TERMINÉE)

- **`archive/PHASE2-MIGRATION-PROGRESS-ARCHIVED.md`** - Historique de la migration
  - Étapes suivies pour GroupedProposalDetailBase
  - Archivé car terminé

### 🗂️ Archives

Documents des phases terminées ou corrections passées :

- **`archive/PHASE2-MIGRATION-PROGRESS-ARCHIVED.md`** - Migration GroupedProposalDetailBase (terminée)
- **`archive/FIX-BLOCK-VALIDATION-PAYLOAD.md`** - Fix payload validation
- **`archive/FIX-USER-MODIFICATIONS-APPLICATION.md`** - Fix application modifications

## 🗺️ Navigation rapide

### Je veux comprendre l'état actuel

➡️ Lire : **`STATUS-2025-11-12.md`** ⭐

### Je veux migrer ProposalDetailBase

➡️ Lire : **`PHASE2-PROPOSAL-DETAIL-BASE.md`** ⭐
  - 5 étapes détaillées
  - Checklist complète
  - Tests de non-régression

### Je veux comprendre le hook useProposalEditor

➡️ Lire :
1. `PHASE1.5-GROUP-SUPPORT-COMPLETE.md` - Support mode groupé
2. Code source : `apps/dashboard/src/hooks/useProposalEditor.ts`

### Je veux voir l'historique complet

➡️ Lire dans l'ordre :
1. `PLAN-PROPOSAL-STATE-REFACTOR.md` - Plan global
2. `PHASE1.5-GROUP-SUPPORT-COMPLETE.md` - Hook avec support groupé
3. `archive/PHASE2-MIGRATION-PROGRESS-ARCHIVED.md` - Migration GroupedProposalDetailBase
4. `STATUS-2025-11-12.md` - État actuel

## 📊 Diagrammes et architecture

### Architecture actuelle (problématique)

```
Backend (DB)
  ↓ GET /api/proposals
GroupedProposalDetailBase
  - États locaux : selectedChanges, userModifiedChanges, userModifiedRaceChanges ❌
  - Logique de merge dispersée ❌
  ↓ props
Composants enfants
  - Gèrent leur propre état local (raceEdits) ❌
  - Synchro manuelle avec backend ❌
```

**Problème** : 4 sources de vérité différentes → désynchronisation → perte de modifications

### Architecture cible (Phase 2)

```
Backend (DB)
  ↓ GET /api/proposals
useProposalEditor (hook)
  - workingGroup (Single Source of Truth) ✅
  - Consolidation automatique ✅
  - Sauvegarde groupée ✅
  ↓ props
GroupedProposalDetailBase (simplifié)
  - Passe workingGroup aux composants ✅
  - Plus d'états locaux ✅
  ↓ props
Composants enfants (simplifiés)
  - Consomment workingGroup directement ✅
  - Callbacks simples (updateField, updateRace) ✅
```

**Bénéfice** : Une seule source de vérité → cohérence garantie → pas de perte

## 🔗 Ressources externes

### Fichiers source principaux

- **Hook** : `apps/dashboard/src/hooks/useProposalEditor.ts`
- **Composant** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
- **Types** : `apps/dashboard/src/types/index.ts`

### Documentation projet

- **WARP.md** : Documentation générale du projet (voir section Changelog)
- **docs/PROPOSAL-UI-COMMON-PITFALLS.md** : Guide des pièges courants UI propositions

## 📞 Contact

En cas de questions sur cette refonte :
- Consulter `PLAN-PROPOSAL-STATE-REFACTOR.md` pour le contexte complet
- Vérifier `PHASE2-INTEGRATION-STATUS.md` pour l'état actuel
- Référencer les issues/PRs liées dans le changelog

---

**Date de création** : 2025-11-11  
**Dernière mise à jour** : 2025-11-12
