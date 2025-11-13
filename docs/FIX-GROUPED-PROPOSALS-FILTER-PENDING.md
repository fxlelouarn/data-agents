# Fix: Filtrer les propositions PENDING dans les vues groupées

## Problème

Lors de l'affichage d'une proposition groupée (ex: `10172-40098`), si certaines propositions du groupe ont déjà été traitées (APPROVED/REJECTED/ARCHIVED), leurs données influencent incorrectement l'état de la proposition groupée :

**Symptômes observés** :
- ✅ Le bloc "Organisateur" apparaît comme déjà validé alors qu'il n'a pas été traité dans cette session
- ✅ Le bouton "Annuler validation (tous les blocs)" apparaît alors qu'aucun bloc n'a été validé récemment
- ✅ Les `approvedBlocks` d'anciennes propositions sont agrégés avec les nouvelles

**Cause** :
```typescript
// apps/dashboard/src/hooks/useProposalEditor.ts ligne 258-264
const approvedBlocks: Record<string, boolean> = {}
const allBlockKeys = new Set<string>()
proposals.forEach(p => Object.keys(p.approvedBlocks || {}).forEach(k => allBlockKeys.add(k)))
allBlockKeys.forEach(blockKey => {
  approvedBlocks[blockKey] = proposals.every(p => p.approvedBlocks?.[blockKey])
})
// ❌ Agrège TOUTES les propositions (PENDING + APPROVED + REJECTED + ARCHIVED)
```

## Solution

### 1. Séparer les propositions PENDING des autres

Dans `initializeWorkingGroup()` :

```typescript
const initializeWorkingGroup = (proposals: Proposal[]): WorkingProposalGroup => {
  // ✅ Séparer PENDING des autres statuts
  const pendingProposals = proposals.filter(p => p.status === 'PENDING')
  const historicalProposals = proposals.filter(p => p.status !== 'PENDING')
  
  // ✅ Consolider UNIQUEMENT les PENDING
  const consolidatedChanges = consolidateChangesFromProposals(pendingProposals)
  const consolidatedRaces = consolidateRacesFromProposals(pendingProposals)
  
  // ✅ Blocs approuvés UNIQUEMENT des PENDING
  const approvedBlocks: Record<string, boolean> = {}
  const allBlockKeys = new Set<string>()
  pendingProposals.forEach(p => Object.keys(p.approvedBlocks || {}).forEach(k => allBlockKeys.add(k)))
  allBlockKeys.forEach(blockKey => {
    approvedBlocks[blockKey] = pendingProposals.every(p => p.approvedBlocks?.[blockKey])
  })
  
  return {
    ids: proposals.map(p => p.id), // ✅ Garder tous les IDs pour la navigation
    originalProposals: pendingProposals, // ✅ Seules les PENDING pour l'édition
    historicalProposals, // ✅ NOUVEAU : Propositions déjà traitées
    consolidatedChanges,
    consolidatedRaces,
    // ...
  }
}
```

### 2. Ajouter `historicalProposals` au type

```typescript
export interface WorkingProposalGroup {
  ids: string[]
  originalProposals: Proposal[] // ✅ Uniquement PENDING
  historicalProposals: Proposal[] // ✅ NOUVEAU : APPROVED/REJECTED/ARCHIVED
  consolidatedChanges: ConsolidatedChange[]
  // ...
}
```

### 3. Afficher l'historique dans l'UI

Créer un nouveau composant `HistoricalProposalsSection.tsx` :

```tsx
interface HistoricalProposalsSectionProps {
  proposals: Proposal[]
}

export const HistoricalProposalsSection: React.FC<HistoricalProposalsSectionProps> = ({ proposals }) => {
  if (proposals.length === 0) return null
  
  return (
    <Card sx={{ mb: 2, bgcolor: 'grey.50' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <HistoryIcon sx={{ mr: 1 }} />
          Historique des propositions traitées
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ces propositions ont déjà été traitées. Elles n'influencent pas la proposition actuelle.
        </Typography>
        
        {proposals.map(p => (
          <Box key={p.id} sx={{ mb: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">
                <strong>Agent :</strong> {p.agentName || 'Inconnu'}
              </Typography>
              <Chip 
                label={p.status} 
                color={
                  p.status === 'APPROVED' ? 'success' : 
                  p.status === 'REJECTED' ? 'error' : 
                  'default'
                }
                size="small"
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Traité le {format(new Date(p.reviewedAt), 'dd/MM/yyyy HH:mm')}
            </Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  )
}
```

### 4. Intégrer dans les vues groupées

Dans `NewEventGroupedDetail.tsx`, `EditionUpdateGroupedDetail.tsx`, etc. :

```tsx
import { HistoricalProposalsSection } from '@/components/proposals/HistoricalProposalsSection'

// ...

<Grid container spacing={3}>
  <Grid item xs={12}>
    {/* ✅ Afficher l'historique en premier */}
    {workingGroup.historicalProposals.length > 0 && (
      <HistoricalProposalsSection proposals={workingGroup.historicalProposals} />
    )}
  </Grid>
  
  <Grid item xs={12} md={8}>
    {/* Contenu principal (propositions PENDING uniquement) */}
    <CategorizedEventChangesTable ... />
  </Grid>
</Grid>
```

## Impact

**Avant** :
- ❌ Propositions traitées influencent l'état de la vue groupée
- ❌ Confusion sur ce qui a été validé ou non
- ❌ Risque d'appliquer des changements déjà appliqués

**Après** :
- ✅ Seules les propositions PENDING sont éditables
- ✅ Historique clairement séparé et en lecture seule
- ✅ État de validation toujours cohérent avec la session actuelle
- ✅ Traçabilité : on voit quelles propositions ont déjà été traitées

## Fichiers à modifier

1. **`apps/dashboard/src/hooks/useProposalEditor.ts`**
   - Modifier `initializeWorkingGroup()` pour filtrer PENDING
   - Ajouter `historicalProposals` au type `WorkingProposalGroup`

2. **`apps/dashboard/src/components/proposals/HistoricalProposalsSection.tsx`** (nouveau)
   - Composant d'affichage historique

3. **`apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`**
   - Intégrer `HistoricalProposalsSection`

4. **`apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`**
   - Intégrer `HistoricalProposalsSection`

5. **`apps/dashboard/src/pages/proposals/detail/event-update/EventUpdateGroupedDetail.tsx`**
   - Intégrer `HistoricalProposalsSection`

6. **`apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`**
   - Passer `historicalProposals` au contexte si nécessaire

## ✅ Implémentation terminée

### Fichiers modifiés

1. **`apps/dashboard/src/hooks/useProposalEditor.ts`**
   - Ajout de `historicalProposals: Proposal[]` au type `WorkingProposalGroup`
   - Modification de `initializeWorkingGroup()` pour filtrer PENDING vs historiques
   - Consolidation et validation uniquement sur les PENDING

2. **`apps/dashboard/src/components/proposals/AgentInfoSection.tsx`**
   - Ajout de filtrage interne : `pendingProposals` vs `historicalProposals`
   - Deux sections visuellement distinctes :
     - **"Propositions en attente"** : fond gris clair, propositions PENDING
     - **"Historique"** : fond plus clair avec bordure, icône Archive, message explicatif

3. **`apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`**
   - Ajout de `allGroupProposals: Proposal[]` au type `GroupedProposalContext`
   - Exposition de toutes les propositions (PENDING + historiques) dans le contexte

4. **`apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`**
   - Utilisation de `allGroupProposals` pour `AgentInfoSection`

5. **`apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`**
   - Utilisation de `allGroupProposals` pour `AgentInfoSection`

6. **`apps/dashboard/src/pages/proposals/detail/event-update/EventUpdateGroupedDetail.tsx`**
   - Utilisation de `allGroupProposals` pour `AgentInfoSection`

## Tests de validation

- [ ] Ouvrir proposition groupée `10172-40098`
- [ ] Vérifier que le bloc "Organisateur" n'apparaît PAS comme validé
- [ ] Vérifier que le bouton "Annuler validation (tous les blocs)" n'apparaît PAS
- [ ] Vérifier qu'une section "Historique" apparaît en bas de la sidebar si des propositions ont été traitées
- [ ] Vérifier que la section "Propositions en attente" montre uniquement les PENDING
- [ ] Valider un bloc → Vérifier qu'il apparaît comme validé
- [ ] Recharger la page → Vérifier que l'état persiste correctement
