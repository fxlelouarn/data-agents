# Résumé : Filtrage des propositions PENDING dans les vues groupées

**Date** : 2025-11-13  
**Problème résolu** : Les propositions déjà traitées (APPROVED/REJECTED/ARCHIVED) polluaient l'état des vues groupées

## 🎯 Objectif

Séparer les propositions **PENDING** (éditables) des propositions **historiques** (APPROVED/REJECTED/ARCHIVED) pour :
- ✅ Éviter que les blocs validés historiques n'apparaissent comme validés dans la session actuelle
- ✅ Afficher clairement l'historique sans influencer l'état éditable
- ✅ Améliorer la traçabilité

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│ useProposalEditor (hook)                    │
│                                             │
│  initializeWorkingGroup(proposals)          │
│  ├─ Filter: PENDING → originalProposals    │
│  ├─ Filter: NON-PENDING → historicalProposals│
│  ├─ Consolidate: PENDING only               │
│  └─ Validate: PENDING only                  │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│ GroupedProposalDetailBase (context)         │
│                                             │
│  groupProposals: PENDING only               │
│  allGroupProposals: PENDING + historiques   │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│ AgentInfoSection (composant)                │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ "Propositions en attente"           │   │
│  │ - Fond gris clair                   │   │
│  │ - Propositions PENDING              │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ "Historique" (si non vide)          │   │
│  │ - Fond clair + bordure              │   │
│  │ - Icône Archive                     │   │
│  │ - Message explicatif                │   │
│  │ - Propositions APPROVED/REJECTED    │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## 📝 Modifications

### 1. Hook `useProposalEditor`

**Fichier** : `apps/dashboard/src/hooks/useProposalEditor.ts`

```typescript
export interface WorkingProposalGroup {
  ids: string[]                      // Tous les IDs (PENDING + historiques)
  originalProposals: Proposal[]      // ✅ PENDING uniquement
  historicalProposals: Proposal[]    // ✅ NOUVEAU : Historiques
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaces: ConsolidatedRaceChange[]
  // ...
}

const initializeWorkingGroup = (proposals: Proposal[]): WorkingProposalGroup => {
  // ✅ Filtrage au chargement
  const pendingProposals = proposals.filter(p => p.status === 'PENDING')
  const historicalProposals = proposals.filter(p => p.status !== 'PENDING')
  
  // ✅ Consolidation UNIQUEMENT des PENDING
  const consolidatedChanges = consolidateChangesFromProposals(pendingProposals)
  const consolidatedRaces = consolidateRacesFromProposals(pendingProposals)
  
  // ✅ Blocs validés UNIQUEMENT des PENDING
  const approvedBlocks: Record<string, boolean> = {}
  pendingProposals.forEach(p => /* agrégation */)
  
  return {
    ids: proposals.map(p => p.id),
    originalProposals: pendingProposals,
    historicalProposals, // ✅ Exposé
    // ...
  }
}
```

### 2. Contexte `GroupedProposalDetailBase`

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

```typescript
export interface GroupedProposalContext {
  groupProposals: Proposal[]        // ✅ PENDING uniquement (édition)
  allGroupProposals: Proposal[]     // ✅ NOUVEAU : Toutes (sidebar)
  // ...
}

const context: GroupedProposalContext = {
  groupProposals: workingGroup?.originalProposals || groupProposals,
  allGroupProposals: groupProposals, // ✅ PENDING + historiques
  // ...
}
```

### 3. Composant `AgentInfoSection`

**Fichier** : `apps/dashboard/src/components/proposals/AgentInfoSection.tsx`

```tsx
const AgentInfoSection: React.FC<AgentInfoSectionProps> = ({ proposals }) => {
  // ✅ Filtrage interne
  const pendingProposals = proposals.filter(p => p.status === 'PENDING')
  const historicalProposals = proposals.filter(p => p.status !== 'PENDING')
  
  return (
    <>
      {/* Section PENDING */}
      {pendingProposals.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6">
              <InfoIcon /> Propositions en attente
            </Typography>
            {pendingProposals.map((p, i) => renderProposal(p, i, true))}
          </CardContent>
        </Card>
      )}
      
      {/* Section Historique */}
      {historicalProposals.length > 0 && (
        <Card sx={{ bgcolor: 'grey.50', border: 1 }}>
          <CardContent>
            <Typography variant="h6" color="text.secondary">
              <ArchiveIcon /> Historique
            </Typography>
            <Typography variant="body2" fontStyle="italic">
              Ces propositions ont déjà été traitées et n'influencent pas la proposition actuelle.
            </Typography>
            {historicalProposals.map((p, i) => renderProposal(p, i, false))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
```

### 4. Vues groupées (×3)

**Fichiers modifiés** :
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/event-update/EventUpdateGroupedDetail.tsx`

```tsx
renderSidebar={(context) => {
  const { 
    groupProposals,      // ✅ PENDING uniquement
    allGroupProposals,   // ✅ Toutes (PENDING + historiques)
    // ...
  } = context
  
  return (
    <>
      <AgentInfoSection proposals={allGroupProposals} />
    </>
  )
}}
```

## 🧩 Logique du chip "En attente" vs "Traité"

**Avant le fix** :
- "En attente" seulement si TOUTES les propositions sont PENDING
- "Traité" dès qu'UNE proposition est APPROVED/REJECTED
- ❌ Trompeur : suggère que tout est traité alors qu'il reste du travail

**Après le fix (Option 2)** :
- "En attente" si AU MOINS UNE proposition est PENDING
- "Traité" seulement si AUCUNE proposition n'est PENDING
- ✅ Intuitif : indique qu'il y a du travail à faire

```typescript
// Avant
const allPending = groupProposals.every(p => p.status === 'PENDING')
label: allPending ? 'En attente' : 'Traité'

// Après
const hasPending = groupProposals.some(p => p.status === 'PENDING')
label: hasPending ? 'En attente' : 'Traité'
```

**Exemples** :
- 1 PENDING + 1 APPROVED → 🟠 "En attente" (nouveau)
- 2 PENDING → 🟠 "En attente" (inchangé)
- 2 APPROVED → ⚪ "Traité" (inchangé)

## 🎮 Résultat visuel

**Avant** :
```
┌─────────────────────────┐
│ Propositions            │
├─────────────────────────┤
│ ⏳ Proposition 1 (90%) │  ← PENDING
│ ✅ Proposition 2 (85%) │  ← APPROVED (pollue l'état!)
│ ❌ Proposition 3 (70%) │  ← REJECTED (pollue l'état!)
└─────────────────────────┘

Problème : Les blocs validés de Proposition 2 
apparaissent comme validés pour toutes !
```

**Après** :
```
┌─────────────────────────────┐
│ Propositions en attente     │
├─────────────────────────────┤
│ ⏳ Proposition 1 (90%)      │  ← PENDING
└─────────────────────────────┘

┌─────────────────────────────┐
│ 📦 Historique               │
├─────────────────────────────┤
│ Ces propositions ont déjà   │
│ été traitées...             │
│                             │
│ ✅ Proposition 2 (85%)      │  ← APPROVED
│ ❌ Proposition 3 (70%)      │  ← REJECTED
└─────────────────────────────┘

✅ Seule Proposition 1 influence l'état éditable
✅ Historique visible mais séparé
```

## ✅ Vérifications

- [x] TypeScript compile sans erreurs
- [x] Toutes les vues groupées mises à jour (NEW_EVENT, EDITION_UPDATE, EVENT_UPDATE)
- [x] Filtrage automatique dans le hook `useProposalEditor`
- [x] Affichage séparé dans `AgentInfoSection`
- [x] Contexte exposant `allGroupProposals` pour la sidebar
- [x] Chip "En attente" affiché dès qu'il y a AU MOINS 1 proposition PENDING

## 🧪 Tests manuels requis

1. Ouvrir proposition groupée `10172-40098`
2. Vérifier que le bloc "Organisateur" n'apparaît PAS comme validé
3. Vérifier que le bouton "Annuler validation (tous les blocs)" n'apparaît PAS
4. Vérifier qu'une section "Historique" apparaît en bas de la sidebar
5. Vérifier que seules les propositions PENDING sont dans "Propositions en attente"
6. Valider un bloc → Vérifier qu'il apparaît comme validé
7. Recharger la page → Vérifier que l'état persiste correctement

## 📚 Documentation

- `docs/FIX-GROUPED-PROPOSALS-FILTER-PENDING.md` - Plan détaillé avec exemples
- `docs/FIX-GROUPED-PROPOSALS-FILTER-PENDING-SUMMARY.md` - Ce résumé
