# Planification : Refactoring de la gestion de l'état des propositions

**Date** : 2025-11-12  
**Statut** : ✅ PHASE 3 COMPLÈTE  
**Priorité** : 🟢 BASSE (workflow utilisateur non bloqué, optimisation)

## ⚠️ IMPORTANT - Pas de backward compatibility

**Contexte** : L'application est encore en développement (pas de production).

**Conséquence** : Nous pouvons faire un **nettoyage radical** sans maintenir l'ancien code.

**Principe** : La working proposal validée sera l'**input direct** de l'application/mise à jour. Plus besoin de logique métier complexe dans le backend pour extraire/transformer les données.

## Problème actuel

### Symptômes

Lorsqu'un utilisateur modifie manuellement des champs (ex: distance d'une course) et valide un bloc, **les modifications sont perdues**.

**Exemple concret** :
- Modification : Distance de 11km → 13km
- Validation du bloc "races"
- Résultat : Seuls les `startDate` proposés sont envoyés, la distance modifiée disparaît

### Diagnostic

Le système actuel jongle avec **4 sources de vérité différentes** :

1. **`proposal.changes`** (backend) : Valeurs proposées par les agents
2. **`proposal.userModifiedChanges`** (backend) : Modifications utilisateur sauvegardées
3. **`selectedChanges`** (frontend, état local) : Valeurs sélectionnées dans l'UI
4. **`userModifiedRaceChanges`** (frontend, état local) : Modifications de courses non synchronisées

**Conséquence** : Il y a des **désynchronisations** entre ces états, notamment :
- `RacesChangesTable` modifie `proposal.userModifiedChanges.raceEdits` via `syncWithBackend()`
- `GroupedProposalDetailBase` utilise `userModifiedRaceChanges` (état local) qui n'est jamais rempli
- `useBlockValidation` essaie de merger ces états mais ne voit pas toutes les modifications

### Architecture actuelle (cassée)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (DB)                            │
├─────────────────────────────────────────────────────────────────┤
│  Proposal {                                                     │
│    changes: { ... },              // ← Propositions agents      │
│    userModifiedChanges: {         // ← Modifications user       │
│      raceEdits: {                                               │
│        "existing-0": { distance: "13" }  // ✅ Sauvegardé       │
│      }                                                          │
│    }                                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓ GET /api/proposals
┌─────────────────────────────────────────────────────────────────┐
│                    GroupedProposalDetailBase                    │
├─────────────────────────────────────────────────────────────────┤
│  États locaux :                                                 │
│  - selectedChanges = {}           // ← Valeurs sélectionnées    │
│  - userModifiedChanges = {}       // ← Éditions édition         │
│  - userModifiedRaceChanges = {}   // ❌ VIDE (jamais rempli)    │
└─────────────────────────────────────────────────────────────────┘
                            ↓ props
┌─────────────────────────────────────────────────────────────────┐
│                      RacesChangesTable                          │
├─────────────────────────────────────────────────────────────────┤
│  État local :                                                   │
│  - raceEdits = { "existing-0": { distance: "13" } }             │
│                                                                 │
│  Sauvegarde via :                                               │
│  syncWithBackend({ raceEdits })  // ✅ Enregistré en DB         │
└─────────────────────────────────────────────────────────────────┘
                            ↓ Validation bloc
┌─────────────────────────────────────────────────────────────────┐
│                      useBlockValidation                         │
├─────────────────────────────────────────────────────────────────┤
│  Merge :                                                        │
│  - selectedChanges        // ✅ Vu                              │
│  - userModifiedChanges    // ✅ Vu                              │
│  - userModifiedRaceChanges // ❌ VIDE                           │
│                                                                 │
│  calculateFinalPayload(proposal, userModifications)             │
│  → Utilise proposal.userModifiedChanges.raceEdits              │
│  → ❌ MAIS userModifiedChanges passé est VIDE                   │
│                                                                 │
│  Résultat : Distance perdue                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Solution proposée : Single Source of Truth

### Principe

**Créer un état consolidé unique** qui représente la proposition "éditée" par l'utilisateur, mergée avec les données du backend.

```
Backend Proposal + User Edits = Working Proposal (Single Source of Truth)
```

### Architecture cible

```
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (DB)                            │
├─────────────────────────────────────────────────────────────────┤
│  Proposal {                                                     │
│    changes: { ... },              // Propositions agents        │
│    userModifiedChanges: { ... }   // Sauvegarde périodique      │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓ GET /api/proposals
┌─────────────────────────────────────────────────────────────────┐
│                    useProposalEditor                            │
│                  (nouveau hook custom)                          │
├─────────────────────────────────────────────────────────────────┤
│  État unique : workingProposal                                  │
│                                                                 │
│  workingProposal = {                                            │
│    // ✅ Merge automatique backend + éditions user              │
│    changes: mergeChanges(                                       │
│      proposal.changes,                                          │
│      proposal.userModifiedChanges                               │
│    ),                                                           │
│                                                                 │
│    // ✅ Courses avec IDs (pas d'indices)                       │
│    races: {                                                     │
│      "141826": { startDate: "...", ... },                       │
│      "141827": { startDate: "...", ... },                       │
│      "141829": { distance: "13", startDate: "..." } // ✅ OK    │
│    },                                                           │
│                                                                 │
│    // ✅ Blocs validés                                          │
│    approvedBlocks: { edition: true, races: false }             │
│  }                                                              │
│                                                                 │
│  API :                                                          │
│  - updateField(field, value)      // Édite un champ            │
│  - updateRace(raceId, field, value) // Édite une course        │
│  - validateBlock(blockKey)        // Valide un bloc            │
│  - save()                         // Sauvegarde en DB           │
│  - getPayload()                   // Export pour application    │
└─────────────────────────────────────────────────────────────────┘
                            ↓ props
┌─────────────────────────────────────────────────────────────────┐
│              GroupedProposalDetailBase (simplifié)              │
├─────────────────────────────────────────────────────────────────┤
│  const {                                                        │
│    workingProposal,      // ← État consolidé                    │
│    updateField,          // ← Fonctions d'édition              │
│    updateRace,                                                  │
│    validateBlock,                                               │
│    getPayload            // ← Export direct                     │
│  } = useProposalEditor(proposalId)                              │
│                                                                 │
│  Rendu :                                                        │
│  - Passe workingProposal aux composants enfants                 │
│  - Plus besoin de gérer selectedChanges, userModifiedChanges    │
└─────────────────────────────────────────────────────────────────┘
                            ↓ props
┌─────────────────────────────────────────────────────────────────┐
│                RacesChangesTable (simplifié)                    │
├─────────────────────────────────────────────────────────────────┤
│  Props :                                                        │
│  - races: workingProposal.races    // ← Déjà mergé             │
│  - onEdit: updateRace              // ← Callback simple        │
│                                                                 │
│  Plus d'état local raceEdits, plus de syncWithBackend()        │
└─────────────────────────────────────────────────────────────────┘
```

## Plan de développement

### Phase 1 : Création du hook `useProposalEditor`

**Objectif** : Créer le hook qui gère l'état consolidé d'une ou plusieurs propositions.

**Fichier** : `apps/dashboard/src/hooks/useProposalEditor.ts`

**Interface** :

```typescript
interface WorkingProposal {
  id: string
  originalProposal: Proposal  // Backend
  
  // État consolidé (merged)
  changes: Record<string, any>
  races: Record<string, RaceData>  // Clé = raceId
  approvedBlocks: Record<string, boolean>
  
  // Métadonnées
  isDirty: boolean  // Y a-t-il des modifications non sauvegardées ?
  lastSaved: Date | null
}

interface UseProposalEditorReturn {
  // État
  workingProposal: WorkingProposal
  isLoading: boolean
  isSaving: boolean
  
  // Actions d'édition
  updateField: (field: string, value: any) => void
  updateRace: (raceId: string, field: string, value: any) => void
  deleteRace: (raceId: string) => void
  
  // Actions de validation
  validateBlock: (blockKey: string) => Promise<void>
  unvalidateBlock: (blockKey: string) => Promise<void>
  
  // Sauvegarde
  save: () => Promise<void>  // Sauvegarde en DB
  autosave: boolean  // Sauvegarde auto (debounced)
  
  // Export
  getPayload: () => Record<string, any>  // Pour application
}

function useProposalEditor(
  proposalId: string | string[],  // Single ou grouped
  options?: {
    autosave?: boolean  // true par défaut
    autosaveDelay?: number  // 2000ms par défaut
  }
): UseProposalEditorReturn
```

**Logique interne** :

1. **Chargement initial** :
   - Fetch proposal(s) depuis backend
   - Merge `proposal.changes` + `proposal.userModifiedChanges`
   - Normaliser les courses vers structure `{ "raceId": { ... } }`

2. **Édition** :
   - Toute modification met à jour `workingProposal`
   - Marque `isDirty = true`
   - Déclenche autosave (debounced)

3. **Sauvegarde** :
   - Calcule le diff entre `workingProposal` et `originalProposal`
   - Envoie seulement le diff au backend
   - Met à jour `originalProposal` après succès
   - Marque `isDirty = false`

4. **Validation bloc** :
   - Met à jour `approvedBlocks[blockKey] = true`
   - Appelle API backend pour marquer le bloc comme validé
   - Sauvegarde automatiquement

### Phase 2 : Refactoring `GroupedProposalDetailBase`

**Objectif** : Simplifier en utilisant `useProposalEditor`.

**Changements** :

```typescript
// ❌ AVANT (complexe)
const [selectedChanges, setSelectedChanges] = useState({})
const [userModifiedChanges, setUserModifiedChanges] = useState({})
const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState({})
const { calculateFinalPayload } = useProposalLogic()
// ... 200 lignes de logique de merge

// ✅ APRÈS (simple)
const {
  workingProposal,
  updateField,
  updateRace,
  validateBlock,
  unvalidateBlock,
  getPayload
} = useProposalEditor(groupKey)

// Plus besoin de gérer les états locaux
// Plus besoin de calculateFinalPayload
```

**Impact** :
- Supprimer ~300 lignes de code
- Plus de désynchronisation possible
- Logique centralisée et testable

### Phase 3 : Simplification - Édition groupée uniquement

**Décision architecturale** : Supprimer l'édition dans les propositions simples. Forcer le passage par la vue groupée.

**Justification** :
- ✅ Réduction drastique de maintenance (-200 à -300 lignes)
- ✅ Plus de bugs de désynchronisation (une seule surface)
- ✅ Expérience utilisateur cohérente
- ✅ Architecture simplifiée (Single Source of Truth)
- ⚠️ Friction UX mineure (1 click supplémentaire) mais largement compensée

#### 3.1 - ProposalDetailBase → Lecture seule

**Changements** :
1. **Supprimer tous les handlers d'édition**
   - `handleFieldModify`, `handleRaceFieldModify`
   - `setUserModifiedChanges`, `setSelectedChanges`
   - États locaux `userModifiedChanges`, `userModifiedRaceChanges`

2. **Ajouter bouton "✏️ Éditer cette proposition"**
   ```typescript
   <Button
     variant="contained"
     startIcon={<EditIcon />}
     onClick={() => navigate(`/proposals/group/${proposalId}?edit=true`)}
   >
     Éditer cette proposition
   </Button>
   ```

3. **Rendre tous les composants en lecture seule**
   - `CategorizedEventChangesTable` : `disabled={true}`
   - `CategorizedEditionChangesTable` : `disabled={true}`
   - `RacesChangesTable` : `disabled={true}`

**Estimation de code supprimé** : ~200 lignes

#### 3.2 - Routing intelligent

**Route automatique** :
```typescript
// Nouveau composant <ProposalEditRedirect />
function ProposalEditRedirect() {
  const { proposalId } = useParams()
  
  // Redirection immédiate vers vue groupée
  return <Navigate to={`/proposals/group/${proposalId}?edit=true`} replace />
}

// Route à ajouter dans routes.tsx
<Route path="/proposals/:id/edit" element={<ProposalEditRedirect />} />
```

**Comportement utilisateur** :
- Click sur une proposition dans la liste → Vue simple (lecture seule)
- Click sur "Éditer" → Redirection `/proposals/group/:id?edit=true`
- Vue groupée (1 proposition) s'affiche avec focus auto sur le premier champ

#### 3.3 - GroupedProposalDetailBase (aucun changement)

**Compatibilité** :
- ✅ Accepte déjà `proposalId: string | string[]`
- ✅ Mode groupé à 1 élément fonctionne déjà
- ✅ Query param `?edit=true` pour focus auto (optionnel, futur)

#### 3.4 - Composants enfants (lecture seule par défaut)

**RacesChangesTable** :
```typescript
// ✅ Prop `disabled` existante
interface RacesChangesTableProps {
  races: Record<string, RaceData>
  onEdit?: (raceId: string, field: string, value: any) => void
  disabled?: boolean  // ✅ true par défaut dans vue simple
}
```

**CategorizedEditionChangesTable** :
```typescript
// ✅ Prop `disabled` existante
interface EditionChangesTableProps {
  changes: Record<string, any>
  onEdit?: (field: string, value: any) => void
  disabled?: boolean  // ✅ true par défaut dans vue simple
}
```

**Pas de changements nécessaires** : Les composants supportent déjà le mode lecture seule.

#### 3.5 - Nettoyage final (code mort)

**Supprimer dans ProposalDetailBase** :
- [ ] États `selectedChanges`, `userModifiedChanges`, `userModifiedRaceChanges`
- [ ] Handlers `handleFieldModify`, `handleRaceFieldModify`
- [ ] Logique de consolidation manuelle (redondant avec `workingProposal`)
- [ ] Import de `useProposalEditor` (plus utilisé)

**Évaluer `useProposalLogic`** :
- Garder uniquement : `formatValue()`, `formatAgentsList()`
- Supprimer : `consolidateChanges()`, `consolidateRaceChanges()`, `calculateFinalPayload()`

**Estimation totale de code supprimé** : ~300-400 lignes

### Phase 4 : Tests et validation

**Tests manuels** (propositions simples) :
- [ ] Click sur proposition → Vue simple affichée en lecture seule
- [ ] Click sur "Éditer" → Redirection vers vue groupée
- [ ] Modification dans vue groupée → Sauvegarde OK
- [ ] Validation dans vue groupée → Application OK

**Tests manuels** (propositions groupées) :
- [ ] Vue groupée avec N propositions → Édition multi-agents OK
- [ ] Vue groupée avec 1 proposition → Comportement identique aux N propositions
- [ ] Autosave fonctionne dans tous les cas

**Tests de non-régression** :
- [ ] Workflow complet NEW_EVENT
- [ ] Workflow complet EDITION_UPDATE
- [ ] Workflow complet EVENT_UPDATE
- [ ] Workflow complet RACE_UPDATE

## Bénéfices attendus

### 🎯 Résolution complète du bug

- ✅ Plus de perte de modifications
- ✅ Payload toujours correct
- ✅ Une seule source de vérité

### 🧹 Code plus simple

- ✅ -500 à -700 lignes de code complexe (avec Phase 3)
- ✅ Plus de logique de merge dispersée
- ✅ Composants plus simples (moins de props)
- ✅ Une seule surface d'édition à maintenir

### 🚀 Performance améliorée

- ✅ Moins de re-renders inutiles
- ✅ Autosave debounced (pas de spam API)
- ✅ Sauvegarde différentielle (seulement le diff)

### 🧪 Testabilité

- ✅ Logique isolée dans un hook testable
- ✅ Composants deviennent présentationnels
- ✅ Facile de mocker `useProposalEditor` pour les tests

### 🔄 Évolutivité

- ✅ Facile d'ajouter de nouveaux champs
- ✅ Facile d'ajouter de nouveaux blocs
- ✅ Support du undo/redo (futur)
- ✅ Support du collaborative editing (futur)

## Risques et mitigation

### ⚠️ Risque : Friction UX (Phase 3)

**Impact** : 1 click supplémentaire pour éditer une proposition simple.

**Mitigation** :
- Bouton "Éditer" bien visible
- Redirection instantanée
- Expérience cohérente (toujours le même workflow)
- Gain en robustesse largement supérieur à la friction

### ⚠️ Risque : Breaking change majeur

**Impact** : Tous les composants utilisant `GroupedProposalDetailBase` et `ProposalDetailBase` doivent être mis à jour.

**Mitigation** :
- Pas de production → Pas de backward compatibility nécessaire
- Migration progressive phase par phase
- Tests manuels complets

### ⚠️ Risque : Temps de développement

**Impact** : ~3-4 jours de développement + tests (avec Phase 3).

**Mitigation** :
- Développement incrémental (phase par phase)
- Tests manuels pour éviter les régressions
- Review code approfondie

## Prochaines étapes

1. ✅ **Validation de l'architecture** : Review de ce document
2. ✅ **Phase 1** : Hook `useProposalEditor` créé (mode simple + mode groupé)
3. ✅ **Phase 2** : `GroupedProposalDetailBase` et `ProposalDetailBase` migrés
4. 🎯 **Phase 3** : Simplification - Édition groupée uniquement (NOUVEAU)
5. **Phase 4** : Tests et validation complète

## Références

- `docs/FIX-BLOCK-VALIDATION-PAYLOAD.md` - Historique des patchs
- `docs/FIX-USER-MODIFICATIONS-APPLICATION.md` - Tentative précédente
- `docs/proposal-state-refactor/STATUS-2025-11-12.md` - État actuel du refactoring
- `docs/proposal-state-refactor/PHASE1.5-GROUP-SUPPORT-COMPLETE.md` - Phase 1.5 complète
- `apps/dashboard/src/hooks/useProposalEditor.ts` - Hook implémenté
- `apps/dashboard/src/hooks/useProposalLogic.ts` - Logique actuelle à simplifier
- `apps/dashboard/src/hooks/useBlockValidation.ts` - Hook à simplifier

## Auteur

- **Date** : 2025-11-11 (mis à jour 2025-11-12)
- **Contexte** : Après multiples patchs infructueux, besoin d'une refonte architecturale. Phase 3 ajoutée pour simplification maximale.
