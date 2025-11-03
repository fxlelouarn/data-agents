# Guide d'Utilisation des Composants Catégorisés

## Vue d'ensemble

Ce document décrit comment utiliser les nouveaux composants catégorisés pour afficher les propositions de changements de manière plus organisée et lisible.

## Nouveaux Composants

### 1. `CategorizedChangesTable`
Composant générique qui affiche les changements groupés par catégorie avec des accordions.

### 2. `CategorizedEventChangesTable`
Wrapper spécialisé pour les changements d'Event avec catégorisation automatique.

### 3. `CategorizedEditionChangesTable`
Wrapper spécialisé pour les changements d'Edition avec catégorisation automatique et éditeurs personnalisés.

## Utilisation dans ProposalDetail et GroupedProposalDetail

### Option 1 : Utilisation directe (recommandée)

Pour bénéficier de la catégorisation, remplacez les composants existants :

```tsx
// Avant
import EventChangesTable from '@/components/proposals/EventChangesTable'
import EditionChangesTable from '@/components/proposals/EditionChangesTable'

// Après
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import CategorizedEditionChangesTable from '@/components/proposals/CategorizedEditionChangesTable'
```

Puis utilisez-les de la même manière :

```tsx
{isEventUpdate ? (
  <CategorizedEventChangesTable
    title="Modification de l'événement"
    changes={consolidatedChanges}
    isNewEvent={false}
    selectedChanges={selectedChanges}
    formatValue={formatValue}
    formatAgentsList={formatAgentsList}
    timezone={editionTimezone}
    onFieldSelect={handleSelectField}
    onFieldApprove={handleApproveField}
    onFieldModify={handleFieldModify}
    userModifiedChanges={userModifiedChanges}
    disabled={!allPending || updateProposalMutation.isPending}
    actions={/* boutons d'actions */}
  />
) : (
  <CategorizedEditionChangesTable
    title={isNewEvent ? 'Données du nouvel événement' : 'Modification de l\'édition'}
    changes={consolidatedChanges}
    isNewEvent={isNewEvent}
    selectedChanges={selectedChanges}
    formatValue={formatValue}
    formatAgentsList={formatAgentsList}
    timezone={editionTimezone}
    onFieldSelect={handleSelectField}
    onFieldApprove={handleApproveField}
    onFieldModify={handleFieldModify}
    userModifiedChanges={userModifiedChanges}
    disabled={!allPending || updateProposalMutation.isPending}
    isEditionCanceled={isEditionCanceled}
    actions={/* boutons d'actions */}
  />
)}
```

### Option 2 : Utilisation conditionnelle par agent

Si vous voulez utiliser la catégorisation uniquement pour certains agents (ex : FFA Scraper) et garder l'ancien affichage pour d'autres (ex : Google Agent) :

```tsx
// Dans ProposalDetail.tsx ou GroupedProposalDetail.tsx
const proposal = proposalData.data
const agentName = proposal.agent.name

// Déterminer si on doit utiliser la catégorisation
const useCategorization = agentName !== 'Google Search Date Agent'

{isEventUpdate ? (
  useCategorization ? (
    <CategorizedEventChangesTable {...props} />
  ) : (
    <EventChangesTable {...props} />
  )
) : (
  useCategorization ? (
    <CategorizedEditionChangesTable {...props} isEditionCanceled={isEditionCanceled} />
  ) : (
    <EditionChangesTable {...props} isEditionCanceled={isEditionCanceled} />
  )
)}
```

## Comportement de la Catégorisation

### Filtrage automatique

- **Catégories vides** : Les catégories sans changements ne s'affichent pas
- **Entités vides** : Si aucun champ d'une entité n'a de proposition, le bloc entier ne s'affiche pas
- **Accordions ouverts** : Toutes les catégories sont ouvertes par défaut pour une vue d'ensemble immédiate

### Exemple de rendu

Pour un EDITION_UPDATE avec des changements de dates et d'inscriptions :

```
📋 Modifications de l'édition              [Actions]
─────────────────────────────────────────────────────

  📅 Dates de l'édition                    [2 champs] ▼
  ┌──────────────────────────────────────────────────┐
  │ Champ      │ Actuel      │ Proposé     │ Conf.   │
  ├────────────┼─────────────┼─────────────┼─────────┤
  │ startDate  │ 2024-06-15  │ 2024-06-20  │ 95%     │
  │ endDate    │ 2024-06-15  │ 2024-06-20  │ 95%     │
  └──────────────────────────────────────────────────┘

  👤 Inscriptions                          [1 champ]  ▼
  ┌──────────────────────────────────────────────────┐
  │ Champ                   │ Actuel │ Proposé │ Conf│
  ├─────────────────────────┼────────┼─────────┼─────┤
  │ registrationOpeningDate │ -      │ 2024... │ 85% │
  └──────────────────────────────────────────────────┘
```

## Définition des Catégories

Les catégories sont définies dans `/apps/dashboard/src/constants/fieldCategories.ts`.

### Event Categories
- **Informations de base** : name, city, country, address, coordinates
- **Médias et visibilité** : URLs, images, visibilité
- **Métadonnées** : dataSource, status

### Edition Categories
- **Dates de l'édition** : year, startDate, endDate, timeZone
- **Inscriptions** : dates d'ouverture/fermeture, nombre d'inscrits
- **Statut et organisation** : calendarStatus, clientStatus, customerType
- **Retrait des dossards** : adresse, lieu, informations
- **Commerce** : currency, hasInsurance, inclusions, Medusa
- **Partenariats** : federationId, règlement

### Race Categories
- **Informations de base** : name, startDate, timeZone
- **Distances** : swim, bike, run, walk distances
- **Dénivelés** : positive/negative elevations
- **Classification** : distance, type, categoryLevel
- **Tarification** : price, priceType, paymentCollectionType
- **Équipes** : min/maxTeamSize
- **Licences et justificatifs** : licenseNumberType, justificatives
- **Formulaires** : champs demandés à l'inscription
- **Stock et disponibilité** : isActive, stock, waitingList
- **Intégrations externes** : URLs externes, IDs Medusa

## Ajouter une Nouvelle Catégorie

Pour ajouter une catégorie, éditez `fieldCategories.ts` :

```typescript
export const EDITION_CATEGORIES: FieldCategory[] = [
  // ... catégories existantes
  {
    id: 'edition-new-category',
    label: 'Nouvelle Catégorie',
    icon: <NewIcon />,
    description: 'Description de la catégorie',
    entityType: 'EDITION',
    priority: 7, // Ordre d'affichage
    fields: [
      'field1',
      'field2',
      'field3'
    ]
  }
]
```

## Migration depuis les Anciens Composants

### Étape 1 : Import
```typescript
// Remplacer
import EventChangesTable from '@/components/proposals/EventChangesTable'

// Par
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
```

### Étape 2 : Renommage des composants
```typescript
// Remplacer
<EventChangesTable {...props} />

// Par
<CategorizedEventChangesTable {...props} />
```

### Étape 3 : Tester
- Vérifier que tous les champs s'affichent correctement
- Vérifier que les catégories sont pertinentes
- Vérifier que les champs vides ne s'affichent pas
- Tester l'édition manuelle des champs
- Tester les éditeurs personnalisés (calendarStatus, timeZone)

## Compatibilité avec les Agents Existants

### Google Search Date Agent

Le Google Search Date Agent génère principalement des **EDITION_UPDATE** avec :
- `startDate` → catégorie "Dates de l'édition"
- `endDate` → catégorie "Dates de l'édition"
- `calendarStatus` → catégorie "Statut et organisation"

✅ **Compatible** : Tous les champs générés par le Google Agent sont catégorisés.

### FFA Scraper Agent

Le FFA Scraper génère :
- **EDITION_UPDATE** avec dates, inscriptions, fédération
- **NEW_EVENT** avec toutes les informations d'événement
- **Races** avec distances, dénivelés, prix

✅ **Compatible** : Tous les champs sont catégorisés.

## Avantages

1. **Clarté visuelle** : Les changements sont organisés logiquement par domaine
2. **Navigation rapide** : Les accordions permettent de voir ou masquer des sections
3. **Contextualisation** : L'icône et la description indiquent clairement le type de données
4. **Scalabilité** : Facile d'ajouter de nouvelles catégories
5. **Vue d'ensemble** : Toutes les catégories ouvertes par défaut permettent un scan rapide

## Troubleshooting

### Catégorie vide qui s'affiche

Vérifier que la fonction `groupChangesByCategory` filtre correctement :
```typescript
if (categoryChanges.length > 0) {
  grouped.push({ category, changes: categoryChanges })
}
```

### Champ dans la mauvaise catégorie

Éditer `fieldCategories.ts` pour déplacer le champ :
```typescript
{
  id: 'correct-category',
  fields: [
    'fieldToMove', // Déplacer ici
    // ...
  ]
}
```

### Champ non catégorisé qui ne s'affiche pas

Si un champ n'est dans aucune catégorie, il ne s'affichera pas avec les composants catégorisés. 
Solutions :
1. Ajouter le champ dans une catégorie existante
2. Créer une nouvelle catégorie "Divers" pour les champs orphelins
3. Utiliser l'ancien composant pour ce type de proposition

## Performances

Les composants catégorisés utilisent `useMemo` pour éviter les recalculs inutiles :
```typescript
const categorizedChanges = useMemo(() => {
  return groupChangesByCategory(changes, entityType)
}, [changes, entityType])
```

Les accordions utilisent `defaultExpanded` pour ouvrir toutes les catégories initialement sans impact sur les performances.
