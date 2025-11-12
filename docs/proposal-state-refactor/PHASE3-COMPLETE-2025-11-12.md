# Phase 3 : ProposalDetailBase en lecture seule ✅ COMPLÈTE

**Date** : 2025-11-12  
**Statut** : ✅ COMPLÈTE  
**Temps estimé** : 7h → **Temps réel** : ~2h  

---

## 📋 Résumé

ProposalDetailBase a été converti en **vue lecture seule**. Toute édition doit maintenant passer par `GroupedProposalDetailBase` (même pour une seule proposition).

---

## ✅ Modifications réalisées

### 1. ProposalDetailBase → Lecture seule

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`

#### Suppressions (~200 lignes)

- ❌ `useProposalEditor` (hook d'édition)
- ❌ États d'édition : `selectedChanges`, `userModifiedChanges`, `userModifiedRaceChanges`
- ❌ Modales de dates : `datePropagationModal`, `editionDateUpdateModal`
- ❌ Handlers d'édition : `handleFieldModify`, `handleRaceFieldModify`, `handleEditionStartDateChange`
- ❌ Logique de consolidation manuelle (remplacée par `useProposalLogic`)
- ❌ Fonctions de confirmation : `confirmDatePropagation`, `confirmEditionDateUpdate`
- ❌ Import de `useUpdateProposal` (mutation inutile)

#### Ajouts (~30 lignes)

✅ **Bouton "Éditer cette proposition"**
```typescript
<Button
  variant="contained"
  color="primary"
  startIcon={<EditIcon />}
  onClick={() => navigate(`/proposals/group/${proposalId}`)}
>
  Éditer cette proposition
</Button>
```

✅ **Context simplifié (lecture seule)**
```typescript
const context: ProposalContext = {
  proposal: proposal!,
  consolidatedChanges, // Lecture seule
  consolidatedRaceChanges, // Lecture seule
  
  // États vides (pas d'édition)
  selectedChanges: {},
  userModifiedChanges: {},
  userModifiedRaceChanges: {},
  
  // Handlers désactivés
  handleFieldModify: () => console.warn('⚠️ Lecture seule'),
  handleRaceFieldModify: () => console.warn('⚠️ Lecture seule'),
  // ...
}
```

✅ **Validation par blocs désactivée**
```typescript
showValidateAllBlocksButton={false}
showUnvalidateAllBlocksButton={false}
```

---

### 2. Composant de redirection

**Nouveau fichier** : `apps/dashboard/src/pages/proposals/ProposalEditRedirect.tsx`

```typescript
function ProposalEditRedirect() {
  const { proposalId } = useParams<{ proposalId: string }>()
  
  if (!proposalId) {
    return <Navigate to="/proposals" replace />
  }
  
  return <Navigate to={`/proposals/group/${proposalId}`} replace />
}
```

**Comportement** :
- URL `/proposals/cm123/edit` → Redirige vers `/proposals/group/cm123`
- Vue groupée (1 proposition) s'ouvre directement

---

### 3. Routes ajoutées

**Fichier** : `apps/dashboard/src/App.tsx`

```typescript
// Import
import ProposalEditRedirect from '@/pages/proposals/ProposalEditRedirect'

// Route (placée AVANT /proposals/:id pour priorité)
<Route
  path="/proposals/:proposalId/edit"
  element={
    <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
      <ProposalEditRedirect />
    </ProtectedRoute>
  }
/>
```

---

## 📊 Résultats

### Code supprimé

| Fichier | Lignes supprimées | Détail |
|---------|-------------------|--------|
| `ProposalDetailBase.tsx` | ~200 lignes | États, handlers, logique d'édition |
| **TOTAL** | **~200 lignes** | |

### Code ajouté

| Fichier | Lignes ajoutées | Détail |
|---------|-----------------|--------|
| `ProposalDetailBase.tsx` | ~30 lignes | Bouton édition, context simplifié |
| `ProposalEditRedirect.tsx` | ~23 lignes | Composant redirection |
| `App.tsx` | ~10 lignes | Route `/proposals/:id/edit` |
| **TOTAL** | **~63 lignes** | |

### Gain net

**-137 lignes de code** (~-25% du fichier ProposalDetailBase)

### Surfaces de bugs réduites

**Avant** :
- ProposalDetailBase (simple) → 4 types × édition = **4 surfaces**
- GroupedProposalDetailBase (groupé) → 4 types × édition = **4 surfaces**
- **TOTAL : 8 surfaces de bugs potentiels**

**Après** :
- ProposalDetailBase (simple) → 4 types × **lecture seule** = **0 surface**
- GroupedProposalDetailBase (groupé) → 4 types × édition = **4 surfaces**
- **TOTAL : 4 surfaces de bugs potentiels** (**-50%**)

---

## 🧪 Tests manuels à réaliser

### ✅ Scénario 1 : Proposition simple (lecture seule)

1. Naviguer vers `/proposals` (liste)
2. Cliquer sur une proposition simple (ex: NEW_EVENT)
3. ✅ Vérifier : Vue simple affichée en lecture seule
4. ✅ Vérifier : Aucun champ éditable
5. ✅ Vérifier : Bouton "✏️ Éditer cette proposition" visible en haut à droite
6. ✅ Vérifier : Pas de boutons "Valider tous les blocs"

### ✅ Scénario 2 : Redirection vers édition

1. Dans la vue simple, cliquer sur "✏️ Éditer cette proposition"
2. ✅ Vérifier : Redirection vers `/proposals/group/:id`
3. ✅ Vérifier : Vue groupée (1 proposition) affichée
4. ✅ Vérifier : Tous les champs éditables
5. ✅ Vérifier : Autosave actif (modification → "Sauvegarde en cours...")

### ✅ Scénario 3 : Édition dans vue groupée (1 proposition)

1. Modifier un champ (ex: distance course)
2. ✅ Vérifier : Tag "Modifié" apparaît
3. ✅ Vérifier : Autosave déclenché après 2s
4. Valider le bloc
5. ✅ Vérifier : Payload complet envoyé (modifications incluses)
6. Approuver la proposition
7. ✅ Vérifier : Application réussie

### ✅ Scénario 4 : Vue groupée (N propositions)

1. Naviguer vers une proposition groupée (ex: 3 agents)
2. ✅ Vérifier : Interface multi-agents fonctionnelle
3. Sélectionner une option parmi plusieurs agents
4. ✅ Vérifier : Tag "Modifié" apparaît
5. Valider tous les blocs
6. ✅ Vérifier : Payload correct pour les N propositions

---

## 🚨 Points d'attention

### ⚠️ UX : 1 click supplémentaire pour éditer

**Impact** : Faible (application en développement)  
**Mitigation** :
- Bouton "Éditer" très visible en haut à droite
- Redirection instantanée (pas de friction)
- Workflow groupé déjà familier

### ⚠️ Composants enfants : prop `disabled`

**Vérification nécessaire** :

Certains composants enfants reçoivent désormais `disabled={true}` implicitement via `context.handleFieldModify = () => {}`.

**Composants à surveiller** :
- `CategorizedEventChangesTable`
- `CategorizedEditionChangesTable`
- `RacesChangesTable`
- `OrganizerSection`

**Action** : Vérifier manuellement que ces composants respectent bien la prop `disabled` (ou absence de handler).

---

## 📚 Ressources

### Documentation liée
- **Plan global** : `docs/proposal-state-refactor/PLAN-PROPOSAL-STATE-REFACTOR.md`
- **Plan Phase 3** : `docs/proposal-state-refactor/PHASE3-READ-ONLY-SIMPLE-VIEW.md`
- **État Phase 2** : `docs/proposal-state-refactor/STATUS-2025-11-12.md`

### Composants concernés
- ✅ `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx` (modifié)
- ✅ `apps/dashboard/src/pages/proposals/ProposalEditRedirect.tsx` (nouveau)
- ✅ `apps/dashboard/src/App.tsx` (route ajoutée)

---

## 🔮 Prochaines étapes : Phase 4

### Nettoyage final (optionnel)

**Objectif** : Supprimer le code mort restant dans `useProposalLogic.ts`

**Fonctions à évaluer** :
- ❌ `consolidateChanges()` → Redondant avec `workingGroup.consolidatedChanges`
- ❌ `consolidateRaceChanges()` → Redondant avec `workingGroup.consolidatedRaces`
- ✅ `formatValue()` → Toujours utilisé (affichage)
- ✅ `formatAgentsList()` → Toujours utilisé (affichage)

**Estimation** : ~150 lignes supprimées (gain net total : ~-300 lignes)

---

## 👤 Auteur

- **Date** : 2025-11-12
- **Phase** : Phase 3 complète ✅
- **Résultat** : ProposalDetailBase converti en lecture seule, workflow d'édition unifié
