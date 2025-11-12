# Phase 3 : Simplification - Édition groupée uniquement

**Date** : 2025-11-12  
**Statut** : 📋 PLANIFIÉ  
**Objectif** : Réduire drastiquement la maintenance en supprimant l'édition des propositions simples

---

## 🎯 Décision architecturale

**Principe** : Supprimer complètement l'édition dans les vues simples (`ProposalDetailBase`). Toute modification doit passer par la vue groupée (`GroupedProposalDetailBase`), même pour une seule proposition.

---

## 📊 Analyse coûts/bénéfices

### ✅ Avantages

| Aspect | Gain | Impact |
|--------|------|--------|
| **Maintenance** | -200 à -300 lignes de code | ⭐⭐⭐⭐⭐ |
| **Bugs évités** | Une seule surface d'édition à tester | ⭐⭐⭐⭐⭐ |
| **Complexité** | Architecture unifiée | ⭐⭐⭐⭐ |
| **Testabilité** | Un seul workflow à valider | ⭐⭐⭐⭐ |

**Total avantages** : +18/20

### ⚠️ Inconvénients

| Aspect | Coût | Impact |
|--------|------|--------|
| **UX** | 1 click supplémentaire pour éditer | ⭐⭐ |

**Total inconvénients** : -2/20

### 📈 Ratio bénéfice/coût : **+16/20** → Très favorable

---

## 🏗️ Architecture actuelle vs cible

### ❌ Avant (complexe)

```
Liste propositions
    ↓ Click
Vue simple (ProposalDetailBase)
    ├─ ✏️ Édition activée
    ├─ Handlers : handleFieldModify, handleRaceFieldModify
    ├─ États : userModifiedChanges, userModifiedRaceChanges
    └─ Logique de consolidation manuelle
```

**Problèmes** :
- 2 surfaces d'édition à maintenir (simple + groupée)
- Duplication de logique
- Bugs de désynchronisation possibles

### ✅ Après (simplifié)

```
Liste propositions
    ↓ Click
Vue simple (ProposalDetailBase) - LECTURE SEULE
    ├─ 📖 Affichage uniquement
    ├─ Bouton "✏️ Éditer cette proposition"
    └─ Redirection → /proposals/group/:id

Vue groupée (GroupedProposalDetailBase)
    ├─ ✏️ Édition activée
    ├─ Support mode 1 proposition
    └─ Seule surface d'édition
```

**Bénéfices** :
- Une seule surface d'édition (groupée)
- Pas de duplication de logique
- Workflow cohérent

---

## 📝 Plan d'implémentation

### Étape 3.1 : ProposalDetailBase → Lecture seule

#### Fichier : `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`

#### Suppressions

**1. États locaux d'édition** (lignes ~100-110) :
```typescript
// ❌ SUPPRIMER
const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<string, any>>({})
const [selectedChanges, setSelectedChanges] = useState<Record<string, any>>({})
```

**2. Import et appel du hook** (ligne ~102) :
```typescript
// ❌ SUPPRIMER
const editorResult = useProposalEditor(proposalId, { autosave: true })
```

**3. Handlers d'édition** (lignes ~208-240) :
```typescript
// ❌ SUPPRIMER
const handleFieldModify = (fieldName: string, newValue: any) => { ... }
const handleRaceFieldModify = (raceId: string, fieldName: string, newValue: any) => { ... }
const handleEditionStartDateChange = (fieldName: string, newValue: any) => { ... }
```

**4. Logique de consolidation manuelle** (lignes ~310-376) :
```typescript
// ❌ SUPPRIMER
const consolidatedChanges = useMemo(() => {
  if (workingProposal && proposal) {
    // ... logique complexe
  }
  return consolidateChanges([proposalData.data], isNewEvent)
}, [workingProposal, proposal, ...])
```

**5. Props `onEdit` dans les composants enfants** :
```typescript
// ❌ SUPPRIMER tous les `onEdit`, `onRaceEdit`, etc.
<CategorizedEventChangesTable
  // onEdit={handleFieldModify}  ← Supprimer
  disabled={true}  // ← Ajouter
/>
```

**Estimation** : ~200 lignes supprimées

#### Ajouts

**1. Bouton "Éditer cette proposition"** :
```typescript
import EditIcon from '@mui/icons-material/Edit'
import { useNavigate } from 'react-router-dom'

function ProposalDetailBase() {
  const navigate = useNavigate()
  const { proposalId } = useParams()
  
  // ... existing code ...
  
  return (
    <Box>
      {/* Barre d'actions en haut de page */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<EditIcon />}
          onClick={() => navigate(`/proposals/group/${proposalId}?edit=true`)}
        >
          Éditer cette proposition
        </Button>
      </Box>
      
      {/* Reste du contenu (lecture seule) */}
      {/* ... */}
    </Box>
  )
}
```

**2. Props `disabled={true}` sur tous les composants enfants** :
```typescript
<CategorizedEventChangesTable
  changes={eventChanges}
  disabled={true}  // ← Ajouter
/>

<CategorizedEditionChangesTable
  changes={editionChanges}
  disabled={true}  // ← Ajouter
/>

<RacesChangesTable
  races={consolidatedRaceChanges}
  disabled={true}  // ← Ajouter
/>

<OrganizerSection
  organizer={proposal.changes?.organizer}
  disabled={true}  // ← Ajouter
/>
```

**Estimation** : ~30 lignes ajoutées

---

### Étape 3.2 : Routing intelligent

#### Fichier : `apps/dashboard/src/routes/proposals.tsx` (ou équivalent)

**Nouveau composant** :
```typescript
import { Navigate, useParams } from 'react-router-dom'

/**
 * Composant de redirection pour forcer l'édition via la vue groupée
 */
function ProposalEditRedirect() {
  const { proposalId } = useParams<{ proposalId: string }>()
  
  if (!proposalId) {
    return <Navigate to="/proposals" replace />
  }
  
  return <Navigate to={`/proposals/group/${proposalId}?edit=true`} replace />
}

export default ProposalEditRedirect
```

**Route à ajouter** :
```typescript
<Route path="/proposals/:id/edit" element={<ProposalEditRedirect />} />
```

**Comportement** :
- URL `/proposals/cm123/edit` → Redirige vers `/proposals/group/cm123?edit=true`
- Vue groupée (1 proposition) s'ouvre directement en mode édition

---

### Étape 3.3 : GroupedProposalDetailBase (aucun changement)

**Compatibilité existante** :
```typescript
// ✅ Déjà fonctionnel
const proposalIds = ['cm123']  // 1 seule proposition
const { workingGroup, ... } = useProposalEditor(proposalIds, { autosave: true })
```

**Vérifications** :
- [ ] Mode groupé avec 1 proposition fonctionne correctement
- [ ] Toutes les fonctionnalités d'édition disponibles
- [ ] Sauvegarde automatique active
- [ ] Validation par blocs fonctionnelle

---

### Étape 3.4 : Composants enfants (vérification `disabled`)

#### RacesChangesTable

**Vérifier** : La prop `disabled` désactive bien l'édition
```typescript
interface RacesChangesTableProps {
  races: ConsolidatedRaceChange[]
  onEdit?: (raceId: string, field: string, value: any) => void
  disabled?: boolean  // ← Doit empêcher toute édition
}

// Dans le composant
const handleEditClick = () => {
  if (disabled) return  // ← Vérifier ce guard
  setEditing(true)
}
```

#### CategorizedEditionChangesTable

**Vérifier** : La prop `disabled` désactive bien les inputs
```typescript
<TextField
  value={value}
  disabled={disabled}  // ← Doit griser le champ
  onChange={onChange}
/>
```

#### OrganizerSection

**Vérifier** : Mode lecture seule correct
```typescript
<OrganizerSection
  organizer={data}
  disabled={true}  // ← Pas de boutons "Éditer"
/>
```

---

### Étape 3.5 : Nettoyage final (code mort)

#### useProposalLogic.ts

**Évaluer quelles fonctions restent utiles** :

✅ **Garder** :
- `formatValue(field, value)` → Utilisé pour l'affichage
- `formatAgentsList(agents)` → Utilisé dans les propositions groupées
- `extractNewValue(change)` → Utilisé par le hook

❌ **Supprimer** :
- `consolidateChanges()` → Redondant avec `workingGroup.consolidatedChanges`
- `consolidateRaceChanges()` → Redondant avec `workingGroup.consolidatedRaces`
- `calculateFinalPayload()` → Redondant avec hook

**Estimation** : ~150 lignes supprimées

#### ProposalDetailBase (suite)

**Code legacy restant** :
```typescript
// ❌ SUPPRIMER si pas utilisé ailleurs
const { formatValue, formatAgentsList } = useProposalLogic()
```

Si ces fonctions sont utilisées uniquement pour l'affichage, les garder. Sinon, les supprimer et utiliser directement `workingProposal`.

---

## 🧪 Tests manuels

### Scénario 1 : Proposition simple (lecture seule)

**Étapes** :
1. Naviguer vers la liste des propositions
2. Cliquer sur une proposition simple (ex: NEW_EVENT)
3. ✅ Vérifier : Vue simple affichée en lecture seule
4. ✅ Vérifier : Aucun champ éditable
5. ✅ Vérifier : Bouton "✏️ Éditer cette proposition" visible en haut à droite
6. ✅ Vérifier : Pas de boutons "Sauvegarder" ou "Annuler"

### Scénario 2 : Redirection vers édition

**Étapes** :
1. Dans la vue simple, cliquer sur "✏️ Éditer cette proposition"
2. ✅ Vérifier : Redirection vers `/proposals/group/:id?edit=true`
3. ✅ Vérifier : Vue groupée (1 proposition) affichée
4. ✅ Vérifier : Tous les champs éditables
5. ✅ Vérifier : Autosave actif (modification → "Sauvegarde en cours...")

### Scénario 3 : Édition dans vue groupée (1 proposition)

**Étapes** :
1. Modifier un champ (ex: distance course)
2. ✅ Vérifier : Tag "Modifié" apparaît
3. ✅ Vérifier : Autosave déclenché après 2s
4. Valider le bloc
5. ✅ Vérifier : Payload complet envoyé (modifications incluses)
6. Approuver la proposition
7. ✅ Vérifier : Application réussie

### Scénario 4 : Vue groupée (N propositions)

**Étapes** :
1. Naviguer vers une proposition groupée (ex: 3 agents)
2. ✅ Vérifier : Interface multi-agents fonctionnelle
3. Sélectionner une option parmi plusieurs agents
4. ✅ Vérifier : Tag "Modifié" apparaît
5. Valider tous les blocs
6. ✅ Vérifier : Payload correct pour les N propositions

---

## 📊 Métriques de succès

### Code supprimé

| Fichier | Lignes supprimées | Estimation |
|---------|-------------------|------------|
| `ProposalDetailBase.tsx` | États, handlers, logique | ~200 |
| `useProposalLogic.ts` | Fonctions obsolètes | ~150 |
| Imports et dépendances | Nettoyage | ~50 |
| **TOTAL** | | **~400 lignes** |

### Surfaces de test réduites

**Avant** :
- ProposalDetailBase (simple) → 4 types × édition = **4 surfaces**
- GroupedProposalDetailBase (groupé) → 4 types × édition = **4 surfaces**
- **TOTAL : 8 surfaces de bugs potentiels**

**Après** :
- ProposalDetailBase (simple) → 4 types × **lecture seule** = 0 surface
- GroupedProposalDetailBase (groupé) → 4 types × édition = **4 surfaces**
- **TOTAL : 4 surfaces de bugs potentiels** (-50%)

### Complexité cyclomatique (estimation)

**Avant** :
- ProposalDetailBase : ~40 chemins d'exécution (édition + validation + sauvegarde)
- GroupedProposalDetailBase : ~50 chemins d'exécution

**Après** :
- ProposalDetailBase : ~10 chemins d'exécution (affichage uniquement)
- GroupedProposalDetailBase : ~50 chemins d'exécution (inchangé)

**Gain net** : -30 chemins d'exécution (-30%)

---

## ⏱️ Estimation de temps

| Étape | Temps estimé | Complexité |
|-------|--------------|------------|
| 3.1 - ProposalDetailBase → Lecture seule | 2h | ⭐⭐ |
| 3.2 - Routing intelligent | 30min | ⭐ |
| 3.3 - Vérification GroupedProposalDetailBase | 30min | ⭐ |
| 3.4 - Tests composants enfants | 1h | ⭐⭐ |
| 3.5 - Nettoyage `useProposalLogic` | 1h | ⭐⭐ |
| **Tests manuels complets** | 2h | ⭐⭐⭐ |
| **TOTAL** | **~7h** | |

---

## 🚨 Risques et mitigation

### Risque 1 : Utilisateurs habitués à éditer directement

**Impact** : Frustration si workflow connu change  
**Probabilité** : Faible (application en développement)  
**Mitigation** :
- Bouton "Éditer" très visible
- Redirection instantanée (pas de friction)
- Workflow groupé déjà familier

### Risque 2 : Bugs dans la vue groupée (1 proposition)

**Impact** : Blocage complet de l'édition  
**Probabilité** : Faible (déjà testé en Phase 2)  
**Mitigation** :
- Tests manuels exhaustifs avant déploiement
- Vérifier tous les cas d'usage (NEW_EVENT, EDITION_UPDATE, etc.)
- Rollback facile si problème détecté

### Risque 3 : Code legacy oublié

**Impact** : Régression ou confusion  
**Probabilité** : Moyenne  
**Mitigation** :
- Checklist de nettoyage complète
- Recherche globale de références (`selectedChanges`, etc.)
- Tests de compilation TypeScript

---

## ✅ Checklist de déploiement

### Avant développement
- [ ] Review de ce document avec l'équipe
- [ ] Validation de l'approche (édition groupée uniquement)
- [ ] Backup du code actuel

### Pendant développement
- [ ] 3.1 - ProposalDetailBase en lecture seule
- [ ] 3.2 - Routing intelligent
- [ ] 3.3 - Vérification GroupedProposalDetailBase
- [ ] 3.4 - Tests composants enfants
- [ ] 3.5 - Nettoyage code mort

### Tests
- [ ] Scénario 1 : Vue simple lecture seule ✅
- [ ] Scénario 2 : Redirection édition ✅
- [ ] Scénario 3 : Édition 1 proposition ✅
- [ ] Scénario 4 : Édition N propositions ✅
- [ ] Tests de non-régression (4 types de propositions)

### Déploiement
- [ ] Commit avec message explicite
- [ ] Mise à jour du `STATUS-2025-11-12.md`
- [ ] Mise à jour du changelog dans `WARP.md`

---

## 📚 Ressources

### Documentation liée
- **Plan global** : `docs/proposal-state-refactor/PLAN-PROPOSAL-STATE-REFACTOR.md`
- **État actuel** : `docs/proposal-state-refactor/STATUS-2025-11-12.md`
- **Phase 1.5** : `docs/proposal-state-refactor/PHASE1.5-GROUP-SUPPORT-COMPLETE.md`

### Composants concernés
- `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`
- `apps/dashboard/src/hooks/useProposalLogic.ts`
- `apps/dashboard/src/routes/proposals.tsx`

### Composants enfants
- `apps/dashboard/src/components/proposals/CategorizedEventChangesTable.tsx`
- `apps/dashboard/src/components/proposals/CategorizedEditionChangesTable.tsx`
- `apps/dashboard/src/components/proposals/RacesChangesTable.tsx`
- `apps/dashboard/src/components/proposals/OrganizerSection.tsx`

---

## 👤 Auteur

- **Date** : 2025-11-12
- **Contexte** : Phase 2 complète - Proposition de simplification maximale pour réduire la maintenance
