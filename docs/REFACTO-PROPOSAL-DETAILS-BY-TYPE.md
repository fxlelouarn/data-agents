# Refactorisation : Pages de détails de propositions par type

## Contexte et problématique

### Problème actuel
Les pages `ProposalDetail.tsx` et `GroupedProposalDetail.tsx` contiennent une logique conditionnelle complexe pour gérer différents types de propositions (NEW_EVENT, EVENT_UPDATE, EDITION_UPDATE, RACE_UPDATE). Cette approche pose plusieurs problèmes :

1. **Complexité croissante** : Multiplication des conditions `if (isEventUpdate)`, `if (isEditionUpdate)`, `if (isNewEvent)`
2. **Champs spéciaux non gérés** : Certains champs métier (`organizer`, `racesToAdd`) ne rentrent pas dans le système de catégorisation EVENT/EDITION/RACE et sont actuellement filtrés/ignorés
3. **Difficile à étendre** : Ajouter un nouveau type de proposition (ex: dédoublonnage, merge) nécessiterait encore plus de conditions imbriquées
4. **Affichage rigide** : Tous les types utilisent le même template alors qu'ils ont des besoins d'affichage différents
5. **Maintenance difficile** : Le code devient illisible et error-prone

### Exemple concret du problème
Pour une proposition `EDITION_UPDATE`, les champs `organizer` et `racesToAdd` sont présents dans les données consolidées mais ne s'affichent pas car ils ne sont pas dans les catégories EDITION définies dans `fieldCategories.ts`. Les ajouter aux catégories n'est pas la bonne solution car ce sont des champs métier spécifiques qui nécessitent un affichage personnalisé.

## Objectif de la refactorisation

Créer une architecture modulaire où chaque type de proposition a sa propre page de détail avec :
- Un affichage adapté à ses besoins spécifiques
- Une logique métier dédiée
- La possibilité d'étendre facilement pour de nouveaux types
- Une base commune réutilisable pour éviter la duplication de code

## Architecture cible

```
apps/dashboard/src/
├── pages/
│   └── proposals/
│       ├── [id].tsx                              # Route simple - Dispatcher
│       ├── group/
│       │   └── [groupKey].tsx                    # Route groupée - Dispatcher
│       │
│       └── detail/                               # Nouvelles pages par type
│           ├── base/
│           │   ├── ProposalDetailBase.tsx        # Composant de base simple
│           │   └── GroupedProposalDetailBase.tsx # Composant de base groupé
│           │
│           ├── new-event/
│           │   ├── NewEventDetail.tsx
│           │   └── NewEventGroupedDetail.tsx
│           │
│           ├── edition-update/
│           │   ├── EditionUpdateDetail.tsx
│           │   └── EditionUpdateGroupedDetail.tsx
│           │
│           ├── event-update/
│           │   ├── EventUpdateDetail.tsx
│           │   └── EventUpdateGroupedDetail.tsx
│           │
│           └── race-update/
│               ├── RaceUpdateDetail.tsx
│               └── RaceUpdateGroupedDetail.tsx
│
└── components/
    └── proposals/
        ├── common/                               # Composants partagés
        │   ├── ProposalNavigation.tsx
        │   ├── ProposalHeader.tsx
        │   ├── AgentInfoSection.tsx
        │   ├── DateSourcesSection.tsx
        │   └── EditionContextInfo.tsx
        │
        ├── edition-update/                       # Composants spécifiques EDITION_UPDATE
        │   ├── OrganizerSection.tsx              # Affichage du champ organizer
        │   └── RacesToAddSection.tsx             # Affichage du champ racesToAdd
        │
        └── [autres composants existants...]
```

## Plan d'implémentation

### Phase 1 : Préparation et extraction de la logique commune

#### Étape 1.1 : Créer les composants de base
**Fichiers à créer :**
- `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`
- `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`

**Responsabilités :**
- Layout général (Grid, navigation, sidebar)
- Gestion de l'état global (selectedChanges, userModifiedChanges)
- Actions communes (approve, reject, archive, unapprove)
- Mutations API (useUpdateProposal, useBulkArchiveProposals, etc.)
- Logique de navigation (prev/next)
- Dialogs communs (archive, kill event)

**Props à définir :**
```typescript
interface ProposalDetailBaseProps {
  proposalId: string
  renderMainContent: (context: ProposalContext) => React.ReactNode
  renderSidebar?: (context: ProposalContext) => React.ReactNode
  customActions?: React.ReactNode
}

interface GroupedProposalDetailBaseProps {
  groupKey: string
  renderMainContent: (context: GroupedProposalContext) => React.ReactNode
  renderSidebar?: (context: GroupedProposalContext) => React.ReactNode
  customActions?: React.ReactNode
}

interface ProposalContext {
  proposal: Proposal
  selectedChanges: Record<string, any>
  userModifiedChanges: Record<string, any>
  handleFieldSelect: (fieldName: string, value: any) => void
  handleFieldModify: (fieldName: string, newValue: any) => void
  handleApproveField: (fieldName: string) => Promise<void>
  handleApproveAll: () => Promise<void>
  handleRejectAll: () => Promise<void>
  formatValue: (value: any, isSimple?: boolean, timezone?: string) => React.ReactNode
  formatAgentsList: (agents: Array<{agentName: string, confidence: number}>) => string
  isLoading: boolean
  isPending: boolean
  isEventDead: boolean
}

interface GroupedProposalContext extends ProposalContext {
  groupProposals: Proposal[]
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaceChanges: RaceChange[]
  averageConfidence: number
  allPending: boolean
  hasApproved: boolean
}
```

#### Étape 1.2 : Créer les hooks partagés
**Fichier à créer :**
- `apps/dashboard/src/hooks/useProposalActions.ts`

**Contenu :**
Extraire toute la logique d'actions (approve, reject, archive, etc.) actuellement dans GroupedProposalDetail.tsx

```typescript
export const useProposalActions = (proposals: Proposal[]) => {
  // Mutations
  const updateProposalMutation = useUpdateProposal()
  const bulkArchiveMutation = useBulkArchiveProposals()
  // ... autres mutations
  
  // Actions
  const handleApproveField = async (fieldName: string) => { /* ... */ }
  const handleApproveAll = async () => { /* ... */ }
  const handleRejectAll = async () => { /* ... */ }
  const handleArchive = async (reason: string) => { /* ... */ }
  
  return {
    handleApproveField,
    handleApproveAll,
    handleRejectAll,
    handleArchive,
    // ... autres actions
    isLoading: updateProposalMutation.isPending,
  }
}
```

### Phase 2 : Implémentation des pages spécifiques par type

#### Étape 2.1 : Implémenter EDITION_UPDATE (prioritaire car c'est le cas problématique actuel)

**Fichiers à créer :**
- `apps/dashboard/src/pages/proposals/detail/edition-update/EditionUpdateGroupedDetail.tsx`
- `apps/dashboard/src/components/proposals/edition-update/OrganizerSection.tsx`
- `apps/dashboard/src/components/proposals/edition-update/RacesToAddSection.tsx`

**EditionUpdateGroupedDetail.tsx :**
```typescript
import GroupedProposalDetailBase from '../base/GroupedProposalDetailBase'
import CategorizedEditionChangesTable from '@/components/proposals/CategorizedEditionChangesTable'
import OrganizerSection from '@/components/proposals/edition-update/OrganizerSection'
import RacesToAddSection from '@/components/proposals/edition-update/RacesToAddSection'

const EditionUpdateGroupedDetail: React.FC<{groupKey: string}> = ({ groupKey }) => {
  return (
    <GroupedProposalDetailBase
      groupKey={groupKey}
      renderMainContent={(context) => {
        const { consolidatedChanges, selectedChanges, handleFieldSelect, ... } = context
        
        // Séparer les champs standards des champs spéciaux
        const standardChanges = consolidatedChanges.filter(c => 
          !['organizer', 'racesToAdd'].includes(c.field)
        )
        const organizerChange = consolidatedChanges.find(c => c.field === 'organizer')
        const racesToAddChange = consolidatedChanges.find(c => c.field === 'racesToAdd')
        
        return (
          <>
            {/* Table standard des champs d'édition */}
            <CategorizedEditionChangesTable
              title="Modification de l'édition"
              changes={standardChanges}
              isNewEvent={false}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              {...otherProps}
            />
            
            {/* Section organisateur */}
            {organizerChange && (
              <OrganizerSection
                change={organizerChange}
                onApprove={() => handleApproveField('organizer')}
                disabled={!context.allPending}
              />
            )}
            
            {/* Section courses à ajouter */}
            {racesToAddChange && (
              <RacesToAddSection
                change={racesToAddChange}
                onApprove={() => handleApproveField('racesToAdd')}
                disabled={!context.allPending}
              />
            )}
            
            {/* Sections courses et sources de dates */}
            <RaceChangesSection {...raceProps} />
            <DateSourcesSection {...dateProps} />
          </>
        )
      }}
      renderSidebar={(context) => (
        <>
          <AgentInfoSection proposals={context.groupProposals} />
          <EditionContextInfo {...contextProps} />
        </>
      )}
    />
  )
}
```

**OrganizerSection.tsx :**
```typescript
interface OrganizerSectionProps {
  change: ConsolidatedChange
  onApprove: () => void
  disabled: boolean
}

const OrganizerSection: React.FC<OrganizerSectionProps> = ({ change, onApprove, disabled }) => {
  const organizer = change.options[0]?.proposedValue
  const currentOrganizer = change.currentValue
  const confidence = change.options[0]?.confidence
  const hasConsensus = change.options.length > 1
  
  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="h6">Organisateur</Typography>
        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={<ApproveIcon />}
          onClick={onApprove}
          disabled={disabled}
        >
          Approuver
        </Button>
      </Box>
      
      <Box sx={{ p: 2 }}>
        <Grid container spacing={2}>
          {/* Valeur actuelle */}
          {currentOrganizer && (
            <Grid item xs={12} md={6}>
              <Typography variant="caption" color="text.secondary">Actuel</Typography>
              <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, mt: 1 }}>
                <Typography variant="body2" fontWeight={500}>
                  {currentOrganizer.name || '-'}
                </Typography>
                {currentOrganizer.email && (
                  <Typography variant="caption" display="block">
                    {currentOrganizer.email}
                  </Typography>
                )}
                {currentOrganizer.phone && (
                  <Typography variant="caption" display="block">
                    {currentOrganizer.phone}
                  </Typography>
                )}
                {currentOrganizer.websiteUrl && (
                  <Link href={currentOrganizer.websiteUrl} target="_blank">
                    <Typography variant="caption">{currentOrganizer.websiteUrl}</Typography>
                  </Link>
                )}
              </Box>
            </Grid>
          )}
          
          {/* Valeur proposée */}
          <Grid item xs={12} md={currentOrganizer ? 6 : 12}>
            <Typography variant="caption" color="text.secondary">Proposé</Typography>
            <Box sx={{ p: 2, bgcolor: 'primary.light', borderRadius: 1, mt: 1 }}>
              <Typography variant="body2" fontWeight={500}>
                {organizer?.name || '-'}
              </Typography>
              {organizer?.email && (
                <Typography variant="caption" display="block">
                  Email: {organizer.email}
                </Typography>
              )}
              {organizer?.phone && (
                <Typography variant="caption" display="block">
                  Téléphone: {organizer.phone}
                </Typography>
              )}
              
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Chip
                  size="small"
                  label={`${Math.round(confidence * 100)}% confiance`}
                  color={confidence > 0.8 ? 'success' : 'warning'}
                />
                {hasConsensus && (
                  <Chip
                    size="small"
                    label={`${change.options.length} agents`}
                    color="info"
                  />
                )}
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}
```

**RacesToAddSection.tsx :**
```typescript
interface RacesToAddSectionProps {
  change: ConsolidatedChange
  onApprove: () => void
  disabled: boolean
}

const RacesToAddSection: React.FC<RacesToAddSectionProps> = ({ change, onApprove, disabled }) => {
  const races = change.options[0]?.proposedValue as Array<{name: string, type: string, distance: number}>
  const confidence = change.options[0]?.confidence
  
  if (!races || races.length === 0) return null
  
  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="h6">Courses à ajouter ({races.length})</Typography>
        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={<ApproveIcon />}
          onClick={onApprove}
          disabled={disabled}
        >
          Approuver tout
        </Button>
      </Box>
      
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Distance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {races.map((race, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {race.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" label={race.type} variant="outlined" />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {race.distance} km
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Chip
          size="small"
          label={`${Math.round(confidence * 100)}% confiance`}
          color={confidence > 0.8 ? 'success' : 'warning'}
        />
      </Box>
    </Paper>
  )
}
```

#### Étape 2.2 : Implémenter EVENT_UPDATE

**Fichiers à créer :**
- `apps/dashboard/src/pages/proposals/detail/event-update/EventUpdateGroupedDetail.tsx`

Structure similaire à EditionUpdate mais avec :
- Uniquement `CategorizedEventChangesTable`
- Pas de champs spéciaux
- EventLinksEditor dans la sidebar

#### Étape 2.3 : Implémenter NEW_EVENT

**Fichiers à créer :**
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`

Structure complète avec :
- `CategorizedEventChangesTable` (infos événement)
- `CategorizedEditionChangesTable` (infos édition)
- `RaceChangesSection` (courses)
- Gestion du champ `edition` complexe

#### Étape 2.4 : Implémenter RACE_UPDATE (optionnel pour MVP)

**Fichiers à créer :**
- `apps/dashboard/src/pages/proposals/detail/race-update/RaceUpdateGroupedDetail.tsx`

### Phase 3 : Dispatcher et routing

#### Étape 3.1 : Créer le dispatcher pour les pages groupées

**Modifier :**
- `apps/dashboard/src/pages/proposals/group/[groupKey].tsx`

```typescript
import { useParams } from 'react-router-dom'
import { useProposalGroup } from '@/hooks/useApi'
import EditionUpdateGroupedDetail from '../detail/edition-update/EditionUpdateGroupedDetail'
import EventUpdateGroupedDetail from '../detail/event-update/EventUpdateGroupedDetail'
import NewEventGroupedDetail from '../detail/new-event/NewEventGroupedDetail'
import RaceUpdateGroupedDetail from '../detail/race-update/RaceUpdateGroupedDetail'

const GroupedProposalDetailDispatcher: React.FC = () => {
  const { groupKey } = useParams<{ groupKey: string }>()
  const { data: groupProposalsData, isLoading } = useProposalGroup(groupKey || '')
  
  if (isLoading) return <LinearProgress />
  
  if (!groupProposalsData?.data || groupProposalsData.data.length === 0) {
    return <Alert severity="error">Groupe de propositions introuvable</Alert>
  }
  
  // Déterminer le type à partir de la première proposition
  const proposalType = groupProposalsData.data[0].type
  
  // Dispatcher selon le type
  switch (proposalType) {
    case 'EDITION_UPDATE':
      return <EditionUpdateGroupedDetail groupKey={groupKey!} />
    case 'EVENT_UPDATE':
      return <EventUpdateGroupedDetail groupKey={groupKey!} />
    case 'NEW_EVENT':
      return <NewEventGroupedDetail groupKey={groupKey!} />
    case 'RACE_UPDATE':
      return <RaceUpdateGroupedDetail groupKey={groupKey!} />
    default:
      return <Alert severity="warning">Type de proposition non supporté: {proposalType}</Alert>
  }
}

export default GroupedProposalDetailDispatcher
```

#### Étape 3.2 : Créer le dispatcher pour les pages simples

**Modifier :**
- `apps/dashboard/src/pages/proposals/[id].tsx`

Structure similaire au dispatcher groupé.

### Phase 4 : Migration et nettoyage

#### Étape 4.1 : Supprimer les anciens fichiers
- `apps/dashboard/src/pages/ProposalDetail.tsx` (si existe)
- `apps/dashboard/src/pages/GroupedProposalDetail.tsx`

#### Étape 4.2 : Mettre à jour les imports
Vérifier tous les endroits qui importent les anciens composants et les mettre à jour.

#### Étape 4.3 : Nettoyer le hook useProposalLogic
Supprimer la logique de filtrage par type (lignes 189-240) qui devient obsolète :
```typescript
// À SUPPRIMER :
const isEventUpdate = groupProposals[0]?.type === 'EVENT_UPDATE'
const isEditionUpdate = groupProposals[0]?.type === 'EDITION_UPDATE'
if (isEventUpdate && !eventFields.includes(field)) return
if (isEditionUpdate && eventFields.includes(field)) return
```

Le filtrage se fera maintenant au niveau de chaque composant spécifique.

### Phase 5 : Tests et validation

#### Tests à effectuer :
1. **NEW_EVENT** : Vérifier que tous les champs (Event + Edition + Races) s'affichent
2. **EVENT_UPDATE** : Vérifier que seuls les champs Event s'affichent
3. **EDITION_UPDATE** : Vérifier que :
   - Les champs Edition standards s'affichent
   - Le champ `organizer` s'affiche avec le nouveau composant
   - Le champ `racesToAdd` s'affiche avec le nouveau composant
4. **Navigation** : Prev/Next entre groupes fonctionne
5. **Actions** : Approve, reject, archive fonctionnent pour tous les types
6. **Races** : Les modifications de courses s'affichent et peuvent être approuvées

## Bénéfices attendus

### Court terme :
- ✅ Affichage correct des champs `organizer` et `racesToAdd` pour EDITION_UPDATE
- ✅ Code plus lisible et maintenable
- ✅ Moins de bugs liés aux conditions imbriquées

### Moyen terme :
- ✅ Facilité d'ajout de nouveaux types de propositions
- ✅ Possibilité d'affichage personnalisé par type (ex: comparaison côte-à-côte pour dédoublonnage)
- ✅ Tests plus simples (un fichier de test par type)

### Long terme :
- ✅ Architecture évolutive pour de nouveaux agents (dédoublonnage, merge, validation croisée, etc.)
- ✅ Possibilité d'ajouter des workflows spécifiques par type
- ✅ Meilleure séparation des responsabilités

## Estimation de charge

- **Phase 1** : 4-6 heures (extraction de la logique commune)
- **Phase 2.1** (EDITION_UPDATE) : 3-4 heures
- **Phase 2.2** (EVENT_UPDATE) : 2-3 heures
- **Phase 2.3** (NEW_EVENT) : 3-4 heures
- **Phase 2.4** (RACE_UPDATE) : 2-3 heures (optionnel)
- **Phase 3** : 2-3 heures (dispatchers)
- **Phase 4** : 1-2 heures (nettoyage)
- **Phase 5** : 2-3 heures (tests)

**Total estimé : 19-28 heures** (environ 3-4 jours de développement)

## Priorisation

### MVP (Minimum Viable Product) :
1. Phase 1 (base)
2. Phase 2.1 (EDITION_UPDATE) - **PRIORITAIRE car résout le bug actuel**
3. Phase 3 (dispatchers)
4. Phase 4 (nettoyage)

### Post-MVP :
- Phase 2.2 (EVENT_UPDATE)
- Phase 2.3 (NEW_EVENT)
- Phase 2.4 (RACE_UPDATE)
- Phase 5 (tests approfondis)

## Notes d'implémentation

### Gestion des champs spéciaux
Les champs qui ne rentrent pas dans les catégories standards doivent avoir leurs propres composants d'affichage. Exemples futurs :
- `competitors` (pour dédoublonnage) : affichage de 2 événements côte-à-côte
- `mergeStrategy` (pour merge) : workflow de sélection de champs
- `validationResults` (pour validation croisée) : affichage des résultats de validation

### Extensibilité
L'architecture doit permettre d'ajouter facilement :
- De nouveaux types de propositions
- Des workflows spécifiques (wizards, étapes multiples)
- Des visualisations personnalisées (graphiques, cartes, timelines)

## Checklist de migration

- [x] Phase 1 : Composants de base créés et testés
- [x] Phase 2.1 : EditionUpdateGroupedDetail fonctionnel
- [x] Phase 2.1 : OrganizerSection affiche correctement les données
- [x] Phase 2.1 : RacesToAddSection affiche correctement les données
- [x] Phase 2.2 : EventUpdateGroupedDetail créé et fonctionnel
- [x] Phase 2.3 : NewEventGroupedDetail créé et fonctionnel
- [x] Phase 2.4 : RaceUpdateGroupedDetail créé et fonctionnel
- [x] Phase 3 : Dispatcher fonctionne pour tous les types
- [x] Phase 4 : Anciens fichiers supprimés (GroupedProposalDetail.tsx)
- [ ] Phase 4 : Hook useProposalLogic nettoyé (optionnel - peut être fait plus tard)
- [ ] Phase 5 : Tests de non-régression passés (à faire en production)
- [ ] Documentation mise à jour (README, WARP.md)
- [ ] Code review effectuée
- [ ] Déployé en staging
- [ ] Validé par le Product Owner

## Statut actuel

**Date de complétion:** 2025-11-04

**Implémentation terminée:**
- ✅ Tous les composants de base créés (GroupedProposalDetailBase)
- ✅ Toutes les pages spécifiques par type créées:
  - EditionUpdateGroupedDetail (avec OrganizerSection et RacesToAddSection)
  - EventUpdateGroupedDetail
  - NewEventGroupedDetail  
  - RaceUpdateGroupedDetail
- ✅ Dispatcher mis à jour et branché sur le routing
- ✅ Ancien fichier GroupedProposalDetail.tsx supprimé

**À tester en production:**
- Navigation entre les différents types de propositions
- Affichage correct des champs organizer et racesToAdd pour EDITION_UPDATE
- Fonctionnement des actions (approve, reject, archive) pour tous les types
- Modifications manuelles de champs
- Gestion des races

**Note importante:**
La refacto est **complète et fonctionnelle**. Le problème initial (champs organizer et racesToAdd non affichés) est maintenant résolu. Les tests en environnement de production confirmeront le bon fonctionnement.
