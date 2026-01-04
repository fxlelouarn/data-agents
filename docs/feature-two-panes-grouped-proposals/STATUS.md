# Status - Proposal Editor Two Panes

## Phase 0 : Préparation et audit ✅ TERMINÉE

### 0.1 - Analyse de `useProposalEditor.ts` ✅

**Fichier** : `apps/dashboard/src/hooks/useProposalEditor.ts` (1616 lignes → 2027 lignes après Phase 1)

#### Structure identifiée

| Section | Lignes | Description |
|---------|--------|-------------|
| Types & Interfaces | 1-196 | `WorkingProposal`, `WorkingProposalGroup`, `ConsolidatedChange`, etc. |
| États React | 206-243 | `workingProposal`, `workingGroup`, `isLoading`, `isSaving` |
| Initialisation | 247-436 | `loadProposal()`, `initializeWorkingGroup()`, `initializeWorkingProposal()` |
| Consolidation | 438-671 | `mergeChanges()`, `consolidateChangesFromProposals()`, `consolidateRacesFromProposals()` |
| Extraction | 673-893 | `extractNewValue()`, `extractOldValue()`, `extractRaces()`, `normalizeRace()` |
| Sauvegarde | 895-1338 | `save()`, `scheduleAutosave()`, `buildGroupDiff()`, `calculateDiff()` |
| Édition | 968-1250 | `updateField()`, `updateRace()`, `deleteRace()`, `addRace()` |
| Validation | 1340-1615 | `validateBlock()`, `unvalidateBlock()`, `getPayloadForBlock()`, `getPayload()` |

#### Fonctions à CONSERVER (réutilisables)

- `getAgentPriority()` - Tri des sources FFA > Slack > Google
- `extractNewValue()` / `extractOldValue()` - Extraction des valeurs
- `extractRaces()` / `normalizeRace()` - Parsing des courses (supporte 6 formats)
- `extractRacesOriginalData()` - Valeurs originales
- `save()` / `scheduleAutosave()` - Autosave
- `updateField()` / `updateRace()` / `deleteRace()` / `addRace()` - Édition
- `validateBlock()` / `unvalidateBlock()` - Validation
- `buildGroupDiff()` / `calculateDiff()` - Construction payload

#### Fonctions à REMPLACER/MODIFIER

| Fonction | Raison | Nouvelle logique |
|----------|--------|------------------|
| `initializeWorkingGroup()` | Crée un état "consolidé" fusionné | Copie de la proposition prioritaire |
| `consolidateChangesFromProposals()` | Crée les `options[]` multiples | Plus de fusion, extraction simple |
| `consolidateRacesFromProposals()` | Fusion complexe des courses | Plus de fusion, extraction simple |

---

### 0.2 - Tests existants ✅

**Résultat** : 141 tests passent, 10 suites

```
PASS src/hooks/__tests__/useProposalEditor.agentPriority.test.ts
PASS src/hooks/__tests__/useProposalEditor.addRace.test.ts
PASS src/hooks/__tests__/useAutoApply.test.ts
PASS src/hooks/__tests__/useCheckExistingEvent.test.tsx
PASS src/hooks/__tests__/useChangesTable.test.ts
PASS src/components/updates/__tests__/BlockChangesTable.test.tsx
PASS src/components/proposals/new-event/__tests__/ExistingEventAlert.test.tsx
PASS src/pages/proposals/detail/event-merge/__tests__/EventMergeDetail.test.tsx
PASS src/pages/__tests__/EventMerge.test.tsx
PASS src/components/proposals/edition-update/__tests__/RacesChangesTable.test.tsx

Test Suites: 10 passed, 10 total
Tests:       141 passed, 141 total
```

---

### 0.3 - Automatisations existantes ✅

#### 1. Cascade de dates Edition → Races

**Fichiers concernés** :
- `apps/dashboard/src/components/proposals/modals/ConfirmDatePropagationModal.tsx`
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

**Mécanisme** :
1. Quand l'utilisateur modifie `Edition.startDate` → Modale de confirmation
2. Si confirmé : propager la nouvelle date à toutes les courses via `updateRaceEditor()`
3. Flag `skipDateCascade` pour éviter la propagation inverse

#### 2. Ajustement Edition depuis Course

**Fichier** : `GroupedProposalDetailBase.tsx` (ligne ~390)

**Mécanisme** :
1. Si une course est modifiée avec une date hors des bornes de l'édition
2. Modale `ConfirmEditionDateUpdateModal` pour demander si on ajuste l'édition
3. Si confirmé : ajuster `Edition.startDate` ou `Edition.endDate`

#### Impact pour la refonte

**Conservation** : Ces automatisations sont implémentées dans `GroupedProposalDetailBase.tsx` qui réutilise les fonctions du hook (`updateFieldEditor`, `updateRaceEditor`). Elles resteront fonctionnelles car on réutilise les composants d'édition existants dans le pane gauche.

---

### 0.4 - Backend : Archivage automatique ✅

**Fichier** : `apps/api/src/routes/proposals.ts` (lignes 1787-1824)

**Mécanisme existant** :
```typescript
// ✅ AUTO-ARCHIVAGE : Archiver les autres propositions PENDING du même groupe
// Quand une proposition est validée, les autres du même groupe deviennent obsolètes
if (firstProposal.eventId && firstProposal.editionId) {
  const otherPendingProposals = await db.prisma.proposal.findMany({
    where: {
      eventId: firstProposal.eventId,
      editionId: firstProposal.editionId,
      id: { notIn: proposalIds },
      status: 'PENDING'
    }
  })

  if (otherPendingProposals.length > 0) {
    await db.prisma.proposal.updateMany({
      where: { id: { in: otherPendingProposals.map(p => p.id) } },
      data: {
        status: 'ARCHIVED',
        reviewedBy: 'system-auto-archive',
        modificationReason: `Auto-archived: superseded by validated proposals [${proposalIds.join(', ')}]`
      }
    })
  }
}
```

**Conclusion** : Le backend gère déjà l'archivage automatique des autres propositions PENDING lors de la validation. Pas de modification nécessaire pour la Phase 4.

---

## Phase 1 : Extension de `useProposalEditor` ✅ TERMINÉE

**Date** : 2025-12-27 (complété 2025-12-28)

### 1.0 - Modification de `initializeWorkingGroup()` ✅

**Date** : 2025-12-28

**Problème identifié** : La Phase 1 initiale avait ajouté les nouvelles fonctions de copie mais n'avait **pas** modifié `initializeWorkingGroup()` qui continuait à fusionner toutes les propositions.

**Correction appliquée** :
- `initializeWorkingGroup()` ne fusionne plus les propositions
- Prend uniquement la proposition prioritaire (FFA > Slack > Google)
- Nouvelles fonctions `extractChangesFromSingleProposal()` et `extractRacesFromSingleProposal()` créées

**Ancien comportement** (fusion) :
```typescript
// Consolidait TOUTES les propositions
const consolidatedChanges = consolidateChangesFromProposals(proposalsToConsolidate)
const { races } = consolidateRacesFromProposals(proposalsToConsolidate)
```

**Nouveau comportement** (Two-Panes) :
```typescript
// Prend UNIQUEMENT la proposition prioritaire
const primaryProposal = proposalsToUse[0]
const consolidatedChanges = extractChangesFromSingleProposal(primaryProposal)
const { races } = extractRacesFromSingleProposal(primaryProposal)
```

**Tests adaptés** :
- `useProposalEditor.agentPriority.test.ts` : 2 tests modifiés pour refléter le nouveau comportement

### 1.1 - Nouveaux types ajoutés ✅

```typescript
/**
 * Différence de champ entre Working Proposal et Source
 */
export interface FieldDiff {
  field: string
  workingValue: any
  sourceValue: any
  isDifferent: boolean
  isAbsentInSource: boolean
  isAbsentInWorking: boolean
}

/**
 * Différence de course entre Working Proposal et Source
 */
export interface RaceDiff {
  raceId: string
  raceName: string
  existsInWorking: boolean
  existsInSource: boolean
  workingRaceId?: string
  sourceRaceId?: string
  fieldDiffs: FieldDiff[]
}
```

### 1.2 - Nouveaux états ajoutés ✅

```typescript
// États pour mode Two-Panes (groupé uniquement)
const [sourceProposals, setSourceProposals] = useState<Proposal[]>([])
const [activeSourceIndex, setActiveSourceIndex] = useState<number>(0)
```

**Initialisation** : Dans `loadProposal()`, après le chargement des propositions :
- Tri par priorité agent (FFA > Slack > Google)
- `activeSourceIndex` = 1 si plusieurs sources (pour voir les différences), sinon 0

### 1.3 - Nouvelles fonctions implémentées ✅

| Fonction | Description |
|----------|-------------|
| `extractFieldValueFromProposal()` | Extrait la valeur d'un champ depuis une proposition source |
| `extractRacesFromProposal()` | Extrait les courses depuis une proposition source |
| `copyFieldFromSource()` | Copie un champ depuis la source active vers la working proposal |
| `copyRaceFromSource()` | Copie une course (vers existante ou nouvelle) |
| `copyAllFromSource()` | Reset complet avec les données de la source (pas de merge) |
| `getFieldDifferences()` | Compare les champs entre working et source active |
| `getRaceDifferences()` | Compare les courses entre working et source active |

### 1.4 - Interface `UseProposalEditorGroupReturn` étendue ✅

```typescript
interface UseProposalEditorGroupReturn {
  // ... existant ...

  // Mode Two-Panes : Gestion des sources et copie
  sourceProposals: Proposal[]
  activeSourceIndex: number
  setActiveSourceIndex: (index: number) => void
  copyFieldFromSource: (field: string) => void
  copyRaceFromSource: (sourceRaceId: string, targetRaceId?: string) => void
  copyAllFromSource: () => void
  getFieldDifferences: () => FieldDiff[]
  getRaceDifferences: () => RaceDiff[]
}
```

### 1.5 - Tests de non-régression ✅

**Résultat** : 141 tests passent, aucune régression

```
Test Suites: 10 passed, 10 total
Tests:       141 passed, 141 total
Time:        4.561 s
```

### 1.6 - Statistiques

- **Lignes ajoutées** : ~410 lignes
- **Fichier modifié** : `apps/dashboard/src/hooks/useProposalEditor.ts`
- **Taille finale** : ~2027 lignes

---

## Phase 2 : Composants UI ✅ TERMINÉE

**Date** : 2025-12-27

### 2.1 - Composants créés

**Dossier** : `apps/dashboard/src/components/proposals/grouped/`

| Composant | Lignes | Description |
|-----------|--------|-------------|
| `TwoPaneLayout.tsx` | 82 | Layout responsive deux colonnes (desktop) / onglets (mobile) |
| `SourceTabs.tsx` | 119 | Onglets de sélection de source avec indicateur priorité (étoile) |
| `CopyFieldButton.tsx` | 55 | Bouton [←] pour copier un champ, visible uniquement si différent |
| `CopyRaceButton.tsx` | 100 | Bouton [←] (remplacer) ou [+] (ajouter) pour les courses |
| `SourceProposalPane.tsx` | 280 | Pane droit : affichage source en lecture seule avec boutons copie |
| `WorkingProposalPane.tsx` | 175 | Pane gauche : réutilise les tables existantes en mode édition |
| `index.ts` | 12 | Exports centralisés |

**Total** : ~823 lignes de code

### 2.2 - Détails des composants

#### TwoPaneLayout

```tsx
interface TwoPaneLayoutProps {
  leftPane: React.ReactNode   // Working Proposal (éditable)
  rightPane: React.ReactNode  // Source Proposal (lecture seule)
  leftTitle?: string          // Affiché en mode mobile
  rightTitle?: string
}
```

**Comportement responsive** :
- Desktop (≥1024px) : Deux colonnes côte à côte avec sticky positioning
- Mobile (<1024px) : Tabs MUI pour basculer entre les vues

#### SourceTabs

- Affiche un onglet par source avec :
  - Nom de l'agent (FFA, Slack, Google, etc.)
  - Couleur selon le type d'agent
  - Score de confiance en pourcentage
  - Étoile pour la source prioritaire (première)
- Si une seule source : simple header sans onglets

#### CopyFieldButton / CopyRaceButton

- **CopyFieldButton** : Bouton [←] visible uniquement si la valeur diffère
- **CopyRaceButton** : 
  - [←] si la course existe dans working (remplacer)
  - [+] si la course n'existe pas (ajouter)
- **CopyAllRacesButton** : Bouton pour copier toutes les courses d'une source

#### SourceProposalPane

- Affiche les onglets de sélection de source
- Bouton "Copier toute la proposition"
- Sections Événement, Édition, Courses avec :
  - Indicateurs visuels (⚠️ différent, ✓ identique, 💭 absent)
  - Boutons [←] de copie par champ/course
  - Highlight des différences (background coloré)

#### WorkingProposalPane

- Header avec bouton "Valider tous les blocs (N)"
- Réutilise les composants existants :
  - `CategorizedEventChangesTable`
  - `CategorizedEditionChangesTable`
  - `RacesChangesTable`
- Fonctions de formatage intégrées (`formatValue`, `formatAgentsList`)

### 2.3 - Vérification TypeScript ✅

```bash
cd apps/dashboard && npx tsc --noEmit
# Aucune erreur
```

### 2.4 - Fichiers créés

```
apps/dashboard/src/components/proposals/grouped/
├── TwoPaneLayout.tsx
├── SourceTabs.tsx
├── CopyFieldButton.tsx
├── CopyRaceButton.tsx
├── SourceProposalPane.tsx
├── WorkingProposalPane.tsx
└── index.ts
```

---

## Phase 3 : Intégration ✅ TERMINÉE

**Date** : 2025-12-28

### 3.1 - Vues migrées vers le nouveau layout

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `NewEventGroupedDetail.tsx` | ~370 | Vue NEW_EVENT avec Two-Panes |
| `EditionUpdateGroupedDetail.tsx` | ~340 | Vue EDITION_UPDATE avec Two-Panes |

### 3.2 - Architecture de l'intégration

Les deux vues utilisent désormais une architecture conditionnelle :

```typescript
// Si plusieurs sources → Mode Two-Panes
if (hasMultipleSources) {
  return (
    <GroupedProposalDetailBase>
      <TwoPaneLayout
        leftPane={<MainContent />}
        rightPane={<SourceProposalPane />}
      />
    </GroupedProposalDetailBase>
  )
}

// Sinon → Layout existant (rétrocompatibilité)
return (
  <GroupedProposalDetailBase>
    <MainContent />
  </GroupedProposalDetailBase>
)
```

### 3.3 - Composants internes extraits

Pour éviter la duplication de code, deux composants internes ont été créés :

1. **`MainContent`** : Contient les tables d'édition (Event, Edition, Organizer, Races)
2. **`SidebarContent`** : Contient les informations contextuelles (EditionContextInfo, AgentInfoSection, RejectedMatchesCard)

### 3.4 - Connexion avec le hook

Les nouvelles fonctions du hook sont connectées au `SourceProposalPane` :

```typescript
const {
  sourceProposals,
  activeSourceIndex,
  setActiveSourceIndex,
  copyFieldFromSource,
  copyRaceFromSource,
  copyAllFromSource,
  getFieldDifferences,
  getRaceDifferences
} = editorResult

<SourceProposalPane
  sourceProposals={sourceProposals}
  activeSourceIndex={activeSourceIndex}
  onChangeSource={setActiveSourceIndex}
  fieldDifferences={getFieldDifferences()}
  raceDifferences={getRaceDifferences()}
  onCopyField={copyFieldFromSource}
  onCopyRace={copyRaceFromSource}
  onCopyAll={copyAllFromSource}
  isValidated={isAllValidated}
/>
```

### 3.5 - Tests de non-régression ✅

```bash
cd apps/dashboard && npm run test:run

Test Suites: 10 passed, 10 total
Tests:       141 passed, 141 total
Time:        5.345 s
```

### 3.6 - Vérification TypeScript ✅

```bash
cd apps/dashboard && npx tsc --noEmit
# Aucune erreur
```

---

## Phase 4 : Archivage automatique ✅ DÉJÀ IMPLÉMENTÉ

Le backend gère déjà l'archivage silencieux des autres propositions lors de la validation.

---

## Phase 5 : Tests ✅ TERMINÉE

**Date** : 2025-12-28

### 5.1 - Tests unitaires Two-Panes créés ✅

**Fichier** : `apps/dashboard/src/hooks/__tests__/useProposalEditor.twoPanes.test.ts`

**19 tests créés couvrant** :

| Catégorie | Tests |
|-----------|-------|
| Source Management | 4 tests (tri par priorité, activeSourceIndex, changement de source) |
| copyFieldFromSource | 2 tests (copie simple, copie startDate différent) |
| copyRaceFromSource | 2 tests (ajout nouvelle course, remplacement existante) |
| copyAllFromSource - No Leftovers | 3 tests (reset complet, pas de vestiges, gestion courses) |
| getFieldDifferences | 3 tests (mode non-groupe, champs différents, champs absents) |
| getRaceDifferences | 3 tests (courses communes, courses uniquement working, courses uniquement source) |
| Dirty State | 2 tests (dirty après copy field, dirty après copy all) |

### 5.2 - Tests de non-régression ✅

**Résultat** : 160 tests passent (141 existants + 19 nouveaux)

```
PASS src/hooks/__tests__/useProposalEditor.agentPriority.test.ts
PASS src/hooks/__tests__/useProposalEditor.twoPanes.test.ts
PASS src/hooks/__tests__/useChangesTable.test.ts
PASS src/components/updates/__tests__/BlockChangesTable.test.tsx
PASS src/components/proposals/new-event/__tests__/ExistingEventAlert.test.tsx
PASS src/hooks/__tests__/useProposalEditor.addRace.test.ts
PASS src/hooks/__tests__/useAutoApply.test.ts
PASS src/hooks/__tests__/useCheckExistingEvent.test.tsx
PASS src/pages/proposals/detail/event-merge/__tests__/EventMergeDetail.test.tsx
PASS src/pages/__tests__/EventMerge.test.tsx
PASS src/components/proposals/edition-update/__tests__/RacesChangesTable.test.tsx

Test Suites: 11 passed, 11 total
Tests:       160 passed, 160 total
```

### 5.3 - Tests adaptés au nouveau comportement ✅

2 tests dans `useProposalEditor.agentPriority.test.ts` ont été adaptés :

1. **`should include only primary proposal in proposalIds (Two-Panes mode)`** : Vérifie que seule la proposition prioritaire est dans `proposalIds`
2. **`should handle agents proposing different races (no overlap)`** : Vérifie que seules les courses de la proposition prioritaire sont dans la working proposal

### 5.4 - Scénarios critiques validés ✅

| Scénario | Status | Test |
|----------|--------|------|
| Copie intégrale sans leftovers | ✅ | `should completely replace working proposal with source (no leftovers)` |
| Copie partielle (cherry-pick) | ✅ | `should copy a field from the active source to working proposal` |
| Copie course vers nouvelle | ✅ | `should add a new race when targetRaceId is undefined` |
| Copie course vers existante | ✅ | `should replace an existing race when targetRaceId is provided` |
| Reset userModifiedChanges | ✅ | `should reset userModifiedChanges when copying all` |
| Gestion courses après copyAll | ✅ | `should handle races correctly when copying all` |

---

## Risques identifiés

| Risque | Mitigation |
|--------|-----------|
| Complexité du hook (2027 lignes) | Tests de non-régression avant/après ✅ |
| 6 formats de courses dans `extractRaces()` | Réutiliser les fonctions existantes ✅ |
| Mapping raceId ↔ existing-{index} fragile | Bien comprendre le flux avant modification |
| ProposalApplication incohérente après copies | Tests spécifiques Phase 5 |

---

## Décisions prises

1. **Hook** : Étendre `useProposalEditor` existant (pas de nouveau hook) ✅
2. **Onglet source par défaut** : 2ème priorité (pour voir les différences) ✅
3. **Cascade de dates** : Conservée (réutilisation composants) ✅
4. **Archivage** : Silencieux, déjà implémenté backend ✅
5. **Types de propositions** : NEW_EVENT et EDITION_UPDATE uniquement
6. **Responsive** : Desktop = colonnes, Mobile = tabs ✅
7. **Composants réutilisés** : Tables existantes dans WorkingProposalPane ✅
8. **Rétrocompatibilité** : Si une seule source, utiliser le layout existant ✅

---

## Statistiques globales

| Phase | Lignes ajoutées/modifiées | Fichiers créés/modifiés |
|-------|---------------------------|-------------------------|
| Phase 1 | ~510 (+100 pour initializeWorkingGroup) | 1 (useProposalEditor.ts) |
| Phase 2 | ~823 | 7 (nouveau dossier grouped/) |
| Phase 3 | ~710 | 2 (vues groupées) |
| Phase 5 | ~600 | 1 (twoPanes.test.ts) + 1 modifié (agentPriority.test.ts) |
| **Total** | **~2643** | **12** |

---

## Prochaines étapes

1. ✅ ~~**Phase 5** : Tests unitaires pour les fonctions de copie~~
2. **Tests manuels** : Tester avec des propositions groupées réelles (FFA + Google)
3. **Affinage UI** : Ajuster les couleurs/icônes selon retours utilisateur

---

## Audit Plan vs STATUS.md (2025-12-28)

### Écart identifié et corrigé

Le Plan Phase 1 stipulait :
> **Fonctions à REMPLACER** :
> - `initializeWorkingGroup()` → Nouvelle logique : copie de la proposition prioritaire

Cette modification n'avait pas été faite initialement. L'ancienne logique de fusion était toujours active.

**Correction appliquée** :
- `initializeWorkingGroup()` modifié pour ne prendre que la proposition prioritaire
- Nouvelles fonctions `extractChangesFromSingleProposal()` et `extractRacesFromSingleProposal()`
- Tests adaptés au nouveau comportement

### Toutes les phases sont maintenant complètes

| Phase | Status |
|-------|--------|
| Phase 0 : Audit | ✅ |
| Phase 1 : Hook | ✅ (complété 2025-12-28) |
| Phase 2 : UI | ✅ |
| Phase 3 : Intégration | ✅ |
| Phase 4 : Archivage | ✅ (déjà implémenté) |
| Phase 5 : Tests | ✅ |
| Phase 6 : Backend primaryProposalId | ✅ (2025-12-28) |

---

## Phase 6 : Backend - Utilisation de primaryProposalId ✅ TERMINÉE

**Date** : 2025-12-28

### Problème identifié

Le backend (`validate-block-group`) faisait un **merge des `changes` de toutes les propositions** du groupe, ce qui contredisait la logique Two-Panes où seule la proposition prioritaire doit être utilisée.

### Solution implémentée

Ajout du paramètre `primaryProposalId` dans toute la chaîne :

1. **Frontend → Backend** : Le `primaryProposalId` est envoyé au backend
2. **Backend** : Si `primaryProposalId` est fourni, utiliser **uniquement** ses `changes` (pas de merge)

### Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| `apps/dashboard/src/services/api.ts` | Ajout paramètre `primaryProposalId` à `validateBlockGroup()` |
| `apps/dashboard/src/hooks/useApi.ts` | Passage de `primaryProposalId` dans l'appel API |
| `apps/dashboard/src/hooks/useBlockValidation.ts` | Nouvelle prop `primaryProposalId`, transmise à l'API |
| `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` | Passage de `workingGroup.primaryProposalId` à `useBlockValidation` |
| `apps/api/src/routes/proposals.ts` | Endpoint `validate-block-group` : si `primaryProposalId` fourni, pas de merge |

### Comportement

```
AVANT (legacy mode - conservé pour rétrocompatibilité):
- Backend reçoit proposalIds sans primaryProposalId
- Merge des changes de TOUTES les propositions
- Log: "⚠️ Legacy mode: Fusion des changes de toutes les propositions"

APRÈS (Two-Panes mode):
- Backend reçoit proposalIds + primaryProposalId
- Utilise UNIQUEMENT les changes de primaryProposalId
- Log: "✅ Two-Panes: Utilisation des changes de la proposition prioritaire uniquement"
```

### Corrections TypeScript additionnelles

- `validateBlock(blockKey, proposalIds)` : Le paramètre `proposalIds` est maintenant optionnel dans toutes les interfaces
- Cela permet aux vues simples d'appeler `validateBlock('event')` sans passer les proposalIds

### Tests

- 160 tests passent (aucune régression)
- Dashboard compile sans erreur
