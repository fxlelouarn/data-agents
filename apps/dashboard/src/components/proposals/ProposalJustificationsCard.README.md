# ProposalJustificationsCard

Composant Material-UI pour afficher de manière structurée et lisible toutes les justifications d'une proposition.

## Fonctionnalités

✨ **Affichage complet des justifications** :
- Support de tous les types : `url`, `image`, `html`, `text`
- Liens web cliquables avec ouverture dans un nouvel onglet
- Affichage d'images inline (base64 ou URL)
- Visualisation du code HTML avec scroll
- Texte formaté avec préservation des retours à la ligne

🎯 **Métadonnées enrichies** :
- Détails d'extraction de dates (date, confiance, sources multiples)
- Support du nouveau format avec sources multiples
- Backward compatibility avec l'ancien format à source unique
- Affichage de toutes les métadonnées additionnelles

🎨 **Interface intuitive** :
- Accordéons interactifs avec le premier ouvert par défaut
- Icônes contextuelles selon le type de justification
- Chips pour identifier rapidement : type, nom de course, agent
- Badge de confiance global et par extraction de date
- Indicateur du nombre de sources

## Props

```typescript
interface ProposalJustificationsCardProps {
  justifications: JustificationItem[]  // Liste des justifications
  confidence?: number                   // Confiance globale de la proposition (0-1)
}

interface JustificationItem {
  type: 'url' | 'image' | 'html' | 'text'
  content: string
  metadata?: {
    dateDetails?: {
      date?: string
      confidence?: number
      source?: string
      snippet?: string
      sources?: Array<{        // Nouveau format multi-sources
        source: string
        snippet: string
      }>
    }
    extractedDate?: string     // Ancien format
    raceName?: string
    agentName?: string
    sourcesCount?: number
    [key: string]: any         // Autres métadonnées custom
  }
}
```

## Utilisation

### Exemple basique

```tsx
import ProposalJustificationsCard from '@/components/proposals/ProposalJustificationsCard'

<ProposalJustificationsCard 
  justifications={proposal.justification || []}
  confidence={proposal.confidence}
/>
```

### Exemple avec justifications typées

```tsx
const justifications = [
  {
    type: 'url',
    content: 'https://example.com/course-info',
    metadata: {
      raceName: 'Marathon de Paris',
      agentName: 'GoogleSearchDateAgent',
      dateDetails: {
        date: '2025-04-06',
        confidence: 0.95,
        sources: [
          {
            source: 'https://example.com/dates',
            snippet: 'La course aura lieu le 6 avril 2025'
          },
          {
            source: 'https://example.com/calendar',
            snippet: 'Marathon: 06/04/2025'
          }
        ]
      }
    }
  },
  {
    type: 'text',
    content: 'Information extraite du site officiel',
    metadata: {
      agentName: 'WebScraperAgent'
    }
  }
]

<ProposalJustificationsCard 
  justifications={justifications}
  confidence={0.92}
/>
```

## Intégration dans les vues

Le composant est intégré dans toutes les vues de détail de proposition simple :

- ✅ `NewEventDetail.tsx`
- ✅ `EventUpdateDetail.tsx`
- ✅ `EditionUpdateDetail.tsx`
- ✅ `RaceUpdateDetail.tsx`

Il remplace l'ancien composant `DateSourcesSection` qui n'affichait que les sources liées aux dates.

## Structure visuelle

```
┌─────────────────────────────────────────────────┐
│ ℹ️ Justifications        [N sources] [XX% conf] │
├─────────────────────────────────────────────────┤
│ Sources et raisons ayant conduit à cette...     │
│                                                  │
│ ┌─ Source 1 ▼ ─────────────────────────────┐  │
│ │ 🔗 Lien web │ Marathon │ Agent           │  │
│ │                                            │  │
│ │ Contenu:                                   │  │
│ │ https://example.com/...                    │  │
│ │ ─────────────────────────────────────────  │  │
│ │ ✓ Détails de la date extraite             │  │
│ │   Date: 2025-04-06                         │  │
│ │   Confiance: [95%]                         │  │
│ │   Sources (2):                             │  │
│ │   • https://example.com/dates              │  │
│ │     "La course aura lieu le 6 avril..."    │  │
│ │   • https://example.com/calendar           │  │
│ │     "Marathon: 06/04/2025"                 │  │
│ └────────────────────────────────────────────┘  │
│                                                  │
│ ┌─ Source 2 ▶ ─────────────────────────────┐  │
│ │ 📄 Texte │ Agent                          │  │
│ └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Formats supportés

### URL
Les URLs sont rendues cliquables avec ouverture dans un nouvel onglet.

### Image
- Images base64 : affichées inline
- URLs d'images : chargées et affichées
- Autres formats : message informatif

### HTML
Code HTML affiché dans une zone avec scroll et police monospace.

### Text
Texte simple avec préservation des retours à la ligne.
Si le texte commence par `http://` ou `https://`, il est automatiquement rendu cliquable.

## Backward Compatibility

Le composant supporte à la fois :
- **Nouveau format** : `metadata.dateDetails.sources[]` (array de sources)
- **Ancien format** : `metadata.dateDetails.source` (source unique)

Cela permet une migration progressive des agents sans casser l'affichage existant.

## Styling

Le composant utilise le thème Material-UI et respecte les conventions du projet :
- Couleurs cohérentes avec les chips de statut
- Spacing uniforme avec le reste du dashboard
- Responsive design (s'adapte à la largeur du conteneur)
- Accessibilité avec les icônes et labels appropriés
