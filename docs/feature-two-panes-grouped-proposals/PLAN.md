# Plan d'implémentation : Proposal Editor - Deux panes en miroir

## Contexte

Le système actuel de fusion automatique des propositions groupées est complexe et bugué (8 points de friction identifiés). Cette refonte introduit une interface à **deux panes en miroir** : une Working Proposal éditable à gauche, et les propositions sources en lecture seule à droite.

**Document de conception** : `PROPOSAL-EDITOR-SKETCH.md`

---

## Principes directeurs

1. **Réutiliser `useProposalEditor`** : C'est le cœur du système actuel, on l'adapte plutôt que de le réécrire
2. **Conserver les automatisations existantes** : Si on réutilise les composants d'édition, les automatisations (cascade dates, etc.) restent fonctionnelles
3. **Tests existants** : Doivent continuer à passer (adaptation si nécessaire)
4. **Refactoring progressif** : Créer de nouveaux composants pour le pane droit, réutiliser l'existant pour le pane gauche
5. **Rétrocompatibilité** : Les propositions simples (non groupées) continuent de fonctionner

---

## Phase 0 : Préparation et audit

### 0.1 - Analyse de `useProposalEditor.ts` (1616 lignes)

**Structure actuelle du hook** :

```
useProposalEditor.ts
├── Types & Interfaces (lignes 1-196)
│   ├── getAgentPriority()           - Priorité agent FFA > Slack > Google
│   ├── WorkingProposal              - État pour mode simple
│   ├── WorkingProposalGroup         - État pour mode groupé
│   ├── ConsolidatedChange           - Changement avec options multiples
│   ├── ConsolidatedRaceChange       - Course consolidée
│   └── UseProposalEditorReturn/GroupReturn
│
├── États React (lignes 206-243)
│   ├── workingProposal / workingGroup
│   ├── isLoading, isSaving, error
│   └── refs pour autosave
│
├── Initialisation (lignes 247-436)
│   ├── loadProposal()               - Charge depuis API
│   ├── initializeWorkingGroup()     - ⚠️ COMPLEXE: 100 lignes de consolidation
│   └── initializeWorkingProposal()  - Mode simple
│
├── Consolidation (lignes 438-671)
│   ├── mergeChanges()               - Merge proposed + userModified
│   ├── consolidateChangesFromProposals()  - ⚠️ COMPLEXE: fusion multi-agents
│   ├── extractRacesOriginalData()   - Données originales des courses
│   └── consolidateRacesFromProposals()    - ⚠️ TRÈS COMPLEXE: fusion courses
│
├── Extraction (lignes 673-893)
│   ├── extractNewValue() / extractOldValue()
│   ├── extractRaces()               - ⚠️ COMPLEXE: 135 lignes, 6 formats différents
│   └── normalizeRace()
│
├── Sauvegarde (lignes 895-1338)
│   ├── save()                       - Autosave debounced
│   ├── scheduleAutosave()
│   ├── buildGroupDiff()             - Construit le diff pour le backend
│   └── calculateDiff()              - Mode simple
│
├── Édition (lignes 968-1250)
│   ├── updateField()                - Modification champ
│   ├── updateRace()                 - Modification course
│   ├── deleteRace()                 - Soft delete toggle
│   └── addRace()                    - Ajout nouvelle course
│
└── Validation (lignes 1340-1615)
    ├── validateBlock()              - Valide un bloc
    ├── unvalidateBlock()            - Annule validation
    ├── getPayloadForBlock()
    ├── getPayload()
    └── reset() / hasUnsavedChanges()
```

**Problèmes identifiés avec le mode groupé** :

1. **`initializeWorkingGroup()`** (lignes 284-383) : Crée un état "consolidé" en fusionnant toutes les propositions. C'est ça qu'on veut remplacer par "une proposition principale + sources".

2. **`consolidateChangesFromProposals()`** (lignes 463-522) : Crée les `options[]` multiples par champ. Dans notre nouveau modèle, on n'a plus besoin de ça.

3. **`consolidateRacesFromProposals()`** (lignes 614-671) : Fusion complexe des courses avec mapping `raceIdToIndexMap`. À simplifier.

4. **`ConsolidatedChange.options[]`** : Structure pour les selects multiples. Plus nécessaire.

**Fonctions à CONSERVER** (réutilisables) :

- `getAgentPriority()` - Tri des sources
- `extractNewValue()` / `extractOldValue()` - Extraction des valeurs
- `extractRaces()` / `normalizeRace()` - Parsing des courses (supporte 6 formats)
- `extractRacesOriginalData()` - Valeurs originales
- `save()` / `scheduleAutosave()` - Autosave
- `updateField()` / `updateRace()` / `deleteRace()` / `addRace()` - Édition
- `validateBlock()` / `unvalidateBlock()` - Validation
- `buildGroupDiff()` / `calculateDiff()` - Construction payload

**Fonctions à REMPLACER** :

- `initializeWorkingGroup()` → Nouvelle logique : copie de la proposition prioritaire
- `consolidateChangesFromProposals()` → Plus de fusion, juste extraction simple
- `consolidateRacesFromProposals()` → Plus de fusion, juste extraction simple

### 0.2 - Inventaire des tests existants

**Tests à préserver** :
- `useProposalEditor.agentPriority.test.ts` - Logique de priorité agent (FFA > Slack > Google)
- `useProposalEditor.addRace.test.ts` - Ajout de courses manuelles
- `useChangesTable.test.ts` - Gestion des options et sélection
- `RacesChangesTable.test.tsx` - Affichage des courses

**Action** : Exécuter `npm run test` et s'assurer que tous les tests passent avant de commencer.

### 0.3 - Identifier les automatisations existantes

**Automatisations connues** :
- Cascade de dates : Edition.startDate → Races.startDate (dans `GroupedProposalDetailBase.tsx`)
- Potentiellement d'autres dans les composants d'édition

**Action** : Documenter toutes les automatisations. Elles seront **conservées** car on réutilise les composants d'édition existants (pane gauche).

### 0.4 - Vérifier le backend pour l'archivage

**À vérifier** : Le backend gère peut-être déjà l'archivage automatique des autres propositions lors de la validation.

**Action** : Explorer `apps/api/src/routes/proposals.ts` pour confirmer.

---

## Phase 1 : Extension de `useProposalEditor`

### 1.1 - Ajouter le mode "two panes" au hook existant

**Fichier** : `apps/dashboard/src/hooks/useProposalEditor.ts`

**Objectif** : Étendre le hook existant pour gérer les sources et les fonctions de copie, plutôt que de créer un nouveau hook.

**Nouvelles propriétés à ajouter dans le return (mode groupe)** :

```typescript
// Dans UseProposalEditorGroupReturn
interface UseProposalEditorGroupReturn extends UseProposalEditorBaseReturn {
  // ... existant ...

  // NOUVEAU: Gestion des sources
  sourceProposals: Proposal[]           // Propositions triées par priorité
  activeSourceIndex: number             // Index de la source affichée
  setActiveSourceIndex: (index: number) => void

  // NOUVEAU: Fonctions de copie
  copyFieldFromSource: (field: string) => void
  copyRaceFromSource: (sourceRaceId: string, targetRaceId?: string) => void  // targetRaceId optionnel
  copyAllFromSource: () => void

  // NOUVEAU: Comparaison
  getFieldDifferences: () => FieldDiff[]
  getRaceDifferences: () => RaceDiff[]
}
```

**Logique d'initialisation** :
1. Charger toutes les propositions PENDING du groupe (existant)
2. Trier par priorité agent FFA > Slack > Google (existant)
3. `workingProposal` = copie profonde de la première (plus haute priorité)
4. `sourceProposals` = toutes les propositions (triées)
5. `activeSourceIndex` = 1 si plusieurs sources (pour voir les différences), sinon 0

### 1.2 - Fonctions de copie

```typescript
// Copier un champ depuis la source active
copyFieldFromSource(field: string) {
  const source = sourceProposals[activeSourceIndex]
  const value = extractFieldValue(source, field)
  updateField(field, value)
}

// Copier une course depuis la source active
// targetRaceId permet de choisir la course de destination :
// - undefined → créer une nouvelle course
// - raceId existant → remplacer cette course
copyRaceFromSource(sourceRaceId: string, targetRaceId?: string) {
  const source = sourceProposals[activeSourceIndex]
  const race = extractRaceFromProposal(source, sourceRaceId)

  if (targetRaceId) {
    // Remplacer la course existante
    replaceRace(targetRaceId, race)
  } else {
    // Ajouter comme nouvelle course
    addRace(race)
  }
}

// Copier toute la proposition
// IMPORTANT: Doit écraser TOUT, pas merger. Pas de leftovers.
copyAllFromSource() {
  const source = sourceProposals[activeSourceIndex]
  // Reset complet de la working proposal
  resetWorkingProposal(deepClone(source))
}
```

### 1.3 - Fonctions de comparaison

```typescript
interface FieldDiff {
  field: string
  workingValue: any
  sourceValue: any
  isDifferent: boolean
  isAbsentInSource: boolean
  isAbsentInWorking: boolean
}

interface RaceDiff {
  raceId: string
  raceName: string
  existsInWorking: boolean
  existsInSource: boolean
  workingRaceId?: string   // ID dans working (pour mapping)
  sourceRaceId?: string    // ID dans source
  fieldDiffs: FieldDiff[]
}
```

### 1.4 - Gestion du `copyAllFromSource` sans leftovers

**Problème critique** : Si je copie intégralement depuis Source A, puis depuis Source B, il ne doit rester AUCUN vestige de Source A.

**Solution** : `copyAllFromSource` doit faire un **reset complet** :

```typescript
copyAllFromSource() {
  const source = sourceProposals[activeSourceIndex]

  // Reset TOTAL - pas de merge avec l'existant
  setWorkingGroup(prev => ({
    ...prev,
    // Écraser tous les changes
    consolidatedChanges: extractChangesFromProposal(source),
    // Écraser toutes les courses
    consolidatedRaces: extractRacesFromProposal(source),
    // Reset les modifications utilisateur
    userModifiedChanges: {},
    userModifiedRaceChanges: {},
    // Marquer dirty
    isDirty: true
  }))
}
```

---

## Phase 2 : Composants UI pour les deux panes

### 2.1 - Layout principal

**Fichier** : `apps/dashboard/src/components/proposals/grouped/TwoPaneLayout.tsx`

```tsx
interface TwoPaneLayoutProps {
  leftPane: React.ReactNode
  rightPane: React.ReactNode
  leftTitle?: string
  rightTitle?: string
}
```

**Responsive** :
- Desktop (≥1024px) : Deux colonnes 50/50
- Mobile (<1024px) : Tabs pour switcher entre les deux vues

### 2.2 - Pane gauche : Working Proposal

**Fichier** : `apps/dashboard/src/components/proposals/grouped/WorkingProposalPane.tsx`

**Réutilisation** :
- `CategorizedEventChangesTable` → Mode édition
- `CategorizedEditionChangesTable` → Mode édition
- `RacesChangesTable` → Mode édition

**Différences avec l'existant** :
- Pas de selects multiples (une seule valeur par champ)
- Pas de fusion automatique
- Bouton `[← Copier toute la proposition]` en haut

### 2.3 - Pane droit : Source Proposal

**Fichier** : `apps/dashboard/src/components/proposals/grouped/SourceProposalPane.tsx`

**Nouveaux composants** :
- `SourceTabs.tsx` : Onglets pour changer de source
- `SourceChangesTable.tsx` : Table en lecture seule avec boutons `[←]`
- `SourceRacesTable.tsx` : Table des courses avec boutons `[←]` et `[+]`

**Logique d'affichage** :
- Chaque champ affiche : valeur + indicateur (⚠️ différent / ✓ identique / 💭 absent)
- Bouton `[←]` visible uniquement si la valeur est différente
- Bouton `[+]` pour les courses absentes de la working proposal

---

## Phase 3 : Intégration dans les vues groupées

### 3.1 - Commencer par `NewEventGroupedDetail`

**Fichier** : `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`

**Étapes** :
1. Remplacer `GroupedProposalDetailBase` par le nouveau layout TwoPaneLayout
2. Utiliser le hook étendu avec les nouvelles fonctions de copie
3. Conserver `RejectedMatchesCard` (pas de place pour la card agents, elle n'est plus nécessaire)
4. `ExistingEventAlert` reste en haut de page

**Éléments à retirer** :
- La card "Agents ayant proposé" (on voit les agents dans les onglets du pane droit)

### 3.2 - Migrer `EditionUpdateGroupedDetail`

**Note** : Les vues `EventUpdateGroupedDetail` et `RaceUpdateGroupedDetail` n'existent pas (pas de propositions de ces types). On se concentre sur :
1. `NewEventGroupedDetail.tsx`
2. `EditionUpdateGroupedDetail.tsx`

---

## Phase 4 : Archivage automatique

### 4.1 - Backend : Archiver les autres propositions

À la validation de la working proposal :
1. Appliquer les changements de la working proposal
2. Archiver silencieusement les autres propositions du groupe
3. Retourner le résultat

**Endpoint existant à modifier** : `POST /api/proposals/validate-block-group`

### 4.2 - Frontend : Pas de confirmation

L'archivage est silencieux. L'utilisateur n'a pas à confirmer.

---

## Phase 5 : Tests

### 5.1 - Tests de la ProposalApplication générée

**CRITIQUE** : S'assurer que la `ProposalApplication` générée est cohérente après diverses manipulations.

**Scénarios à tester** :

| Scénario | Action | Résultat attendu |
|----------|--------|------------------|
| Copie intégrale A puis B | `copyAllFromSource(A)` puis `copyAllFromSource(B)` | ProposalApplication = B uniquement, aucun vestige de A |
| Copie partielle | `copyFieldFromSource('startDate')` depuis B | Seul startDate vient de B, le reste de A |
| Copie partielle puis intégrale | Cherry-pick depuis B, puis `copyAllFromSource(C)` | ProposalApplication = C, les cherry-picks sont écrasés |
| Édition manuelle puis copie intégrale | Modifier un champ, puis `copyAllFromSource(B)` | ProposalApplication = B, modifications manuelles écrasées |
| Copie course vers nouvelle | `copyRaceFromSource(raceId, undefined)` | Nouvelle course ajoutée dans ProposalApplication |
| Copie course vers existante | `copyRaceFromSource(sourceRaceId, targetRaceId)` | Course existante remplacée |

### 5.2 - Tests unitaires du hook étendu

**Fichier** : `apps/dashboard/src/hooks/__tests__/useProposalEditor.twoPanes.test.ts`

**Scénarios** :
- Initialisation avec priorité agent correcte (FFA > Slack > Google)
- `sourceProposals` contient toutes les propositions triées
- `activeSourceIndex` = 1 par défaut (2ème source)
- `copyFieldFromSource` copie la bonne valeur
- `copyRaceFromSource` avec/sans targetRaceId
- `copyAllFromSource` fait un reset complet
- `getFieldDifferences` retourne les bonnes différences

### 5.3 - Tests d'intégration (E2E légers)

**Scénarios** :
- Groupe FFA + Google : FFA est la working par défaut
- Cherry-pick d'un champ : la valeur est copiée, ProposalApplication correcte
- Ajout d'une course depuis une source : la course apparaît
- Validation : seule la working est appliquée, autres archivées

### 5.4 - Tests de non-régression

S'assurer que les tests existants passent toujours :
- `useProposalEditor.agentPriority.test.ts` - Adapter si nécessaire
- `useProposalEditor.addRace.test.ts`
- `useChangesTable.test.ts`
- Mode simple (une seule proposition) inchangé

---

## Éléments explicitement exclus de la V1

1. **Fusion automatique** : Le système actuel de consolidation est remplacé, pas amélioré
2. **Mode mobile optimisé** : Layout basique (tabs), pas d'UX mobile poussée

**Éléments CONSERVÉS** (car réutilisation des composants) :
- Cascade de dates (via les composants existants)

---

## Checklist pré-implémentation

- [ ] Exécuter `npm run test` - tous les tests passent
- [ ] Exécuter `npm run tsc` - pas d'erreurs de type
- [ ] Vérifier si le backend archive déjà automatiquement les autres propositions
- [ ] Valider le plan

---

## Estimation de complexité

| Phase | Effort | Fichiers principaux |
|-------|--------|---------------------|
| Phase 0 | Faible | Audit, tests existants |
| Phase 1 | Élevé | `useProposalEditor.ts` (1616 lignes à comprendre et étendre) |
| Phase 2 | Moyen | 4-5 nouveaux composants UI |
| Phase 3 | Moyen | 2 vues groupées à migrer |
| Phase 4 | Faible | Vérifier backend existant |
| Phase 5 | Élevé | Tests critiques sur ProposalApplication |

---

## Décisions prises

1. **Hook** : Étendre `useProposalEditor` existant plutôt que créer un nouveau hook
2. **Historique des copies** : Non nécessaire pour le moment
3. **Cascade de dates** : Conservée (réutilisation des composants)
4. **Archivage** : Silencieux, vérifier si le backend le fait déjà
5. **Types de propositions** : Seulement NEW_EVENT et EDITION_UPDATE (pas EventUpdate ni RaceUpdate)

---

## Risques identifiés

1. **Complexité du hook existant** : 1616 lignes avec beaucoup de logique imbriquée. Risque de casser quelque chose.
   - Mitigation : Tests de non-régression avant/après

2. **Formats multiples de courses** : `extractRaces()` supporte 6 formats différents. La copie de courses doit les gérer tous.
   - Mitigation : Utiliser les fonctions existantes (`extractRaces`, `normalizeRace`)

3. **Mapping raceId ↔ existing-{index}** : Logique fragile qui a déjà causé des bugs.
   - Mitigation : Bien comprendre le flux avant de modifier

4. **ProposalApplication incohérente** : Risque de leftovers après copies successives.
   - Mitigation : Tests spécifiques (Phase 5.1)
