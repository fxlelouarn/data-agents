# Dashboard - Architecture des Propositions

## Vue d'ensemble

Le dashboard de propositions permet de visualiser, valider et modifier les changements suggérés par les agents sur les événements, éditions et courses de Miles Republic.

## Architecture Frontend

### Structure des Composants

```
apps/dashboard/src/
├── pages/
│   ├── ProposalList.tsx           # Liste des propositions
│   ├── ProposalDetail.tsx         # Détail d'une proposition
│   └── GroupedProposalDetail.tsx  # Propositions groupées
├── components/proposals/
│   ├── BaseChangesTable.tsx       # Composant générique (logique commune)
│   ├── EventChangesTable.tsx      # Spécialisé pour Event
│   ├── EditionChangesTable.tsx    # Spécialisé pour Edition
│   ├── RaceChangesTable.tsx       # Spécialisé pour Race
│   ├── CalendarStatusEditor.tsx   # Éditeur de statut calendrier
│   ├── EventLinksEditor.tsx       # Éditeur de liens événement
│   ├── EditionContextInfo.tsx     # Affichage contexte édition précédente
│   ├── DateSourcesSection.tsx     # Section sources de dates
│   └── RaceChangesSection.tsx     # Section changements de course
└── hooks/
    ├── useProposalLogic.ts        # Logique métier des propositions
    └── useApi.ts                  # Hooks d'API (useEventContext, etc.)
```

### Architecture des Tables de Changements

Précédemment, un composant monolithique `ChangesTable` gérait tous les types d'entités, créant une confusion des types et rendant le code difficile à maintenir.

#### Nouvelle Architecture Modulaire

```
BaseChangesTable (composant générique)
├── EventChangesTable (pour Event)
├── EditionChangesTable (pour Edition)
└── RaceChangesTable (pour Race)
```

#### BaseChangesTable

Composant générique réutilisable avec toute la logique commune :
- Affichage du tableau : Champ | Valeur actuelle | Valeur proposée | Confiance
- Gestion de la sélection de valeurs multiples
- Affichage des modifications utilisateur
- Support des éditeurs personnalisés via `renderCustomEditor`
- Support de la désactivation conditionnelle via `isFieldDisabledFn`

**Props importantes** :
```typescript
interface BaseChangesTableProps {
  title: string
  changes: Record<string, any>
  isNewEvent: boolean
  selectedChanges: Record<string, any>
  formatValue: (field: string, value: any) => string
  formatAgentsList: (agents: any[]) => string
  timezone?: string
  onFieldApprove: (field: string, value: any) => void
  onFieldModify: (field: string, value: any) => void
  disabled?: boolean
  
  // Props avancées
  renderCustomEditor?: (field: string, value: any, onChange: Function) => ReactNode
  isFieldDisabledFn?: (field: string) => boolean
}
```

#### EventChangesTable

Composant pour les changements d'**Event** uniquement.

**Caractéristiques** :
- N'affiche **PAS** `calendarStatus` ni `timeZone` (champs d'Edition)
- Pas d'éditeurs personnalisés par défaut
- Pas de logique de désactivation spéciale

**Usage** :
```tsx
<EventChangesTable
  title="Modification de l'événement"
  changes={consolidatedChanges}
  isNewEvent={false}
  selectedChanges={selectedChanges}
  formatValue={formatValue}
  formatAgentsList={formatAgentsList}
  onFieldApprove={handleApprove}
  onFieldModify={handleModify}
  disabled={!isPending}
/>
```

#### EditionChangesTable

Composant pour les changements d'**Edition**.

**Caractéristiques** :
- **Inclut** `calendarStatus` et `timeZone`
- Éditeurs personnalisés :
  - `CalendarStatusEditor` pour `calendarStatus`
  - `TimezoneEditor` pour `timeZone` (si disponible)
- Désactive tous les champs (sauf `calendarStatus`) si l'édition est annulée

**Props spécifiques** :
```typescript
interface EditionChangesTableProps extends BaseChangesTableProps {
  isEditionCanceled: boolean  // Désactive les champs si true
}
```

**Usage** :
```tsx
<EditionChangesTable
  title="Modification de l'édition"
  changes={consolidatedChanges}
  isNewEvent={false}
  selectedChanges={selectedChanges}
  formatValue={formatValue}
  formatAgentsList={formatAgentsList}
  timezone={editionTimezone}
  onFieldApprove={handleApprove}
  onFieldModify={handleModify}
  isEditionCanceled={isEditionCanceled}
  disabled={!isPending}
/>
```

#### RaceChangesTable

Composant pour les changements de **Race**.

**Caractéristiques** :
- Désactive **tous** les champs si l'édition parente est annulée
- Pas d'éditeurs personnalisés

**Usage** :
```tsx
<RaceChangesTable
  title="Modification de la course"
  changes={consolidatedRaceChanges}
  isNewEvent={false}
  selectedChanges={selectedRaceChanges}
  formatValue={formatValue}
  formatAgentsList={formatAgentsList}
  timezone={editionTimezone}
  onFieldApprove={handleApprove}
  onFieldModify={handleModify}
  isEditionCanceled={isEditionCanceled}
  disabled={!isPending}
/>
```

### Utilisation dans les Pages

#### ProposalDetail.tsx

```tsx
// Déterminer le type de proposition
const isEventUpdate = proposal.type === 'EVENT_UPDATE'
const isNewEvent = proposal.type === 'NEW_EVENT'

// Utiliser le bon composant
{isEventUpdate ? (
  <EventChangesTable {...props} />
) : (
  <EditionChangesTable 
    {...props} 
    isEditionCanceled={isEditionCanceled} 
  />
)}
```

#### GroupedProposalDetail.tsx

```tsx
// Même logique
const isEventUpdateDisplay = groupProposals[0]?.type === 'EVENT_UPDATE'

{isEventUpdateDisplay ? (
  <EventChangesTable {...props} />
) : (
  <EditionChangesTable 
    {...props} 
    isEditionCanceled={isEditionCanceled} 
  />
)}
```

## Backend API

### Enrichissement des Propositions

Fonction `enrichProposal()` qui ajoute du contexte aux propositions selon leur type :

#### Pour EVENT_UPDATE
Ajoute les informations de l'événement depuis Miles Republic :
```typescript
{
  eventName: string,      // Event.name
  eventCity: string,      // Event.city
  eventStatus: string     // Event.status
}
```

#### Pour EDITION_UPDATE / NEW_EVENT
Ajoute les informations de l'édition précédente :
```typescript
{
  previousEditionCalendarStatus: string,  // calendarStatus de N-1
  previousEditionYear: string,            // Année de N-1
  previousEditionStartDate: Date,         // Date début de N-1
  eventStatus: string                     // Status de l'événement
}
```

### Nouveaux Endpoints

#### GET /api/events/:id
Récupère les détails d'un événement depuis Miles Republic.

**Response** :
```typescript
{
  data: {
    id: number
    name: string
    city: string
    status: string
    // ...autres champs
  }
}
```

#### GET /api/updates/context
Récupère le contexte enrichi pour une mise à jour (événement + édition précédente).

**Query params** :
- `eventId`: ID de l'événement
- `editionYear`: Année de l'édition

**Response** :
```typescript
{
  data: {
    event: { id, name, city, status, ... }
    previousEdition?: { calendarStatus, year, startDate, ... }
  }
}
```

## Hooks et Services

### useProposalLogic

Hook principal qui centralise la logique métier des propositions :

```typescript
const {
  consolidatedChanges,
  selectedChanges,
  isEditionCanceled,
  handleApprove,
  handleModify,
  // ...
} = useProposalLogic(proposal, editionData)
```

**Fonctionnalités** :
- Consolidation des changements proposés et modifiés
- Détection d'édition annulée (`calendarStatus: 'CANCELED'`)
- Gestion des sélections de champs
- Application et annulation des modifications

### useEventContext

Hook pour récupérer le contexte d'un événement :

```typescript
const { data: eventContext, isLoading } = useEventContext(eventId)
```

### useUpdateContext

Hook pour récupérer le contexte complet d'une mise à jour :

```typescript
const { data: updateContext, isLoading } = useUpdateContext(eventId, editionYear)
```

## Types TypeScript

### Proposal (étendu)

```typescript
interface Proposal {
  id: string
  type: ProposalType
  status: ProposalStatus
  
  // Contexte Event (pour EVENT_UPDATE)
  eventName?: string
  eventCity?: string
  eventStatus?: string
  
  // Contexte Edition précédente (pour EDITION_UPDATE/NEW_EVENT)
  previousEditionCalendarStatus?: string
  previousEditionYear?: string
  previousEditionStartDate?: Date
  
  // Données standard
  changes: Record<string, any>
  userModifiedChanges?: Record<string, any>
  modificationReason?: string
  justification?: string
  confidence?: number
  
  // Relations
  agentId: string
  eventId?: number
  editionId?: number
  raceId?: number
}
```

## Bénéfices de l'Architecture

### Séparation des Responsabilités
Chaque composant gère un seul type d'entité avec ses règles métier spécifiques.

### Type Safety
Les champs spécifiques (comme `calendarStatus` pour Edition) n'apparaissent que dans les contextes appropriés.

### Extensibilité
Facile d'ajouter des comportements ou éditeurs spécifiques à chaque type d'entité.

### Maintenabilité
Code plus clair, plus facile à comprendre et à déboguer.

### Réutilisabilité
La logique commune est centralisée dans `BaseChangesTable`, évitant la duplication.

## Flux de Validation

1. **Agent** crée une proposition avec des changements suggérés
2. **API** enrichit la proposition avec le contexte (événement/édition précédente)
3. **Dashboard** affiche la proposition avec le composant approprié :
   - `EventChangesTable` pour EVENT_UPDATE
   - `EditionChangesTable` pour EDITION_UPDATE/NEW_EVENT
   - `RaceChangesTable` pour les courses
4. **Utilisateur** peut :
   - Approuver les valeurs suggérées (clic sur la valeur)
   - Modifier manuellement une valeur (édition inline)
   - Ajouter une raison de modification
5. **Dashboard** envoie les modifications à l'API
6. **API** applique les changements validés dans Miles Republic

## Détection d'Édition Annulée

Une édition est considérée comme annulée si :
- Le `calendarStatus` actuel ou proposé est `'CANCELED'`

**Comportement** :
- **EditionChangesTable** : Tous les champs désactivés sauf `calendarStatus`
- **RaceChangesTable** : Tous les champs désactivés

**Logique** :
```typescript
const isEditionCanceled = 
  currentData?.calendarStatus === 'CANCELED' ||
  selectedChanges?.calendarStatus === 'CANCELED'
```

## Affichage du Contexte

### EditionContextInfo

Composant qui affiche les informations de l'édition précédente :

```tsx
<EditionContextInfo
  eventName="Marathon de Paris"
  eventCity="Paris"
  eventStatus="ACTIVE"
  previousEditionYear="2024"
  previousEditionStatus="CONFIRMED"
  previousEditionDate={new Date('2024-04-07')}
/>
```

Affiche :
- **Événement** : Nom, ville, statut
- **Édition précédente** : Année, statut calendrier, date

## Gestion des Timezones

Les dates sont affichées en tenant compte du timezone de l'édition :
- Récupéré depuis `editionData.timeZone` ou `selectedChanges.timeZone`
- Utilisé pour formater les dates avec `formatInTimeZone()`
- Passé aux composants via la prop `timezone`

## Migration et Compatibilité

### Ancien Code
```tsx
<ChangesTable
  changes={changes}
  onApprove={handleApprove}
/>
```

### Nouveau Code
```tsx
{isEventUpdate ? (
  <EventChangesTable
    changes={changes}
    onFieldApprove={handleApprove}
  />
) : (
  <EditionChangesTable
    changes={changes}
    onFieldApprove={handleApprove}
    isEditionCanceled={isEditionCanceled}
  />
)}
```

## Tests et Validation

Avant de valider une proposition :
1. Vérifier que tous les champs modifiés ont une valeur valide
2. S'assurer que la raison de modification est fournie si nécessaire
3. Confirmer que les champs désactivés ne sont pas modifiables
4. Tester avec différents types de propositions (EVENT_UPDATE, EDITION_UPDATE, etc.)

## Troubleshooting

### Les champs sont désactivés alors qu'ils ne devraient pas
- Vérifier que `isEditionCanceled` est correctement calculé
- Vérifier que le `calendarStatus` n'est pas 'CANCELED'

### L'éditeur personnalisé ne s'affiche pas
- Vérifier que `renderCustomEditor` est bien passé au composant
- Vérifier que le champ correspond à un éditeur personnalisé

### Le contexte d'événement ne s'affiche pas
- Vérifier que l'API `/api/events/:id` retourne bien les données
- Vérifier que `eventId` est présent dans la proposition
- Vérifier que le hook `useEventContext` est utilisé

## Performance

- Les hooks `useEventContext` et `useUpdateContext` utilisent React Query avec cache
- Les composants de table sont optimisés avec `React.memo` si nécessaire
- Le contexte n'est chargé que si l'`eventId` est présent

## Dernière mise à jour

Documentation mise à jour le **30 octobre 2024** après refactoring de l'architecture des tables de changements.
