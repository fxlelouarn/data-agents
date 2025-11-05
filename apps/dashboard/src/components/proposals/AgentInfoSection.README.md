# AgentInfoSection - Bouton "Voir source"

## 🎯 Objectif
Permettre l'accès rapide aux sources des propositions directement depuis la card "Propositions" dans les vues groupées, sans avoir à ouvrir les détails de chaque proposition.

## ✨ Fonctionnalité

### Bouton "Voir source"
Un nouveau bouton apparaît à côté du bouton "Voir détails" pour chaque proposition qui contient au moins une source.

**Comportement :**
- ✅ Visible uniquement si une source est disponible
- 🔗 Ouvre la source dans un nouvel onglet (`_blank`)
- 🎨 Icône `OpenInNew` pour indiquer l'ouverture externe
- ⚖️ Les deux boutons ont la même largeur (`flex: 1`)

## 📊 Extraction des sources

La fonction `getSourceUrl()` extrait la première source disponible selon l'ordre de priorité :

### Ordre de priorité :

1. **`metadata.source`** (Priorité haute)
   - Cas d'usage : FFAScraperAgent, GoogleSearchDateAgent
   - Exemple : `https://www.athle.fr/competitions/...`

2. **`content` si `type === 'url'`** (Priorité moyenne)
   - Justifications de type URL explicites
   - Exemple : justification avec type = "url"

3. **`content` si commence par `http://` ou `https://`** (Priorité basse)
   - Détection automatique d'URLs dans le texte
   - Regex : `/^https?:\/\//`

### Algorithme

```typescript
const getSourceUrl = (proposal: Proposal): string | null => {
  if (!proposal.justification || proposal.justification.length === 0) {
    return null
  }

  for (const justif of proposal.justification) {
    // 1. metadata.source (priorité haute)
    if (justif.metadata?.source) {
      return justif.metadata.source
    }
    
    // 2. content de type url (priorité moyenne)
    if (justif.type === 'url' && justif.content) {
      return justif.content
    }
    
    // 3. content qui ressemble à une URL (priorité basse)
    if (justif.content?.match(/^https?:\/\//)) {
      return justif.content
    }
  }

  return null
}
```

## 🎨 Interface utilisateur

### Avant (1 bouton)
```
┌─────────────────────────────────────┐
│ Proposition 1              [85%]    │
│ Statut : En attente                 │
│ 👤 FFA Scraper Agent                │
│ 🕒 05 novembre 2025 à 03:00         │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │     Voir détails               │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Après (2 boutons si source disponible)
```
┌─────────────────────────────────────┐
│ Proposition 1              [85%]    │
│ Statut : En attente                 │
│ 👤 FFA Scraper Agent                │
│ 🕒 05 novembre 2025 à 03:00         │
│                                     │
│ ┌───────────────┬─────────────────┐ │
│ │ Voir détails  │ 🔗 Voir source  │ │
│ └───────────────┴─────────────────┘ │
└─────────────────────────────────────┘
```

## 📁 Fichier modifié

**`apps/dashboard/src/components/proposals/AgentInfoSection.tsx`**

### Modifications apportées :

1. **Imports ajoutés :**
   ```typescript
   import { 
     OpenInNew as OpenInNewIcon 
   } from '@mui/icons-material'
   ```

2. **Interface `Proposal` étendue :**
   ```typescript
   interface Proposal {
     // ... champs existants ...
     justification?: Array<{
       type: string
       content: string
       metadata?: {
         source?: string
         [key: string]: any
       }
     }>
   }
   ```

3. **Fonction `getSourceUrl()` ajoutée**
   - Extraction intelligente de la première source disponible
   - Support des 3 formats de sources

4. **Boutons mis à jour :**
   - Wrapped dans un `Box` avec `display: flex, gap: 1`
   - Les deux boutons utilisent `flex: 1` pour largeur égale
   - Bouton source conditionnel avec `{getSourceUrl(proposal) && ...}`

## 🔍 Cas d'usage

### Proposition avec metadata.source (FFAScraperAgent)
```json
{
  "justification": [
    {
      "type": "text",
      "content": "Organisateur FFA: LA CHEVIGNOISE",
      "metadata": {
        "source": "https://www.athle.fr/competitions/235846858849195849565849761837547837"
      }
    }
  ]
}
```
**→ Bouton "Voir source" visible** ✅  
**→ Ouvre** : `https://www.athle.fr/competitions/...`

### Proposition avec content de type url
```json
{
  "justification": [
    {
      "type": "url",
      "content": "https://example.com/marathon-info"
    }
  ]
}
```
**→ Bouton "Voir source" visible** ✅  
**→ Ouvre** : `https://example.com/marathon-info`

### Proposition sans source
```json
{
  "justification": [
    {
      "type": "text",
      "content": "Information extraite automatiquement"
    }
  ]
}
```
**→ Bouton "Voir source" non visible** ❌  
**→ Seul le bouton "Voir détails" s'affiche**

## 🎯 Avantages

### Pour l'utilisateur :
- ⚡ **Accès rapide** : Pas besoin d'ouvrir les détails pour voir la source
- 🔍 **Vérification immédiate** : Consulter la source originale en un clic
- 📱 **Navigation efficace** : Deux actions parallèles disponibles

### Pour l'expérience :
- 🎨 **Interface cohérente** : Les boutons sont alignés et équilibrés
- 💡 **Feedback visuel** : Icône externe indique l'ouverture dans nouvel onglet
- ♿ **Accessible** : Utilisation standard de `window.open()`

## 🔧 Maintenance

### Pour ajouter un nouveau format de source :

1. Modifier `getSourceUrl()` pour ajouter un nouveau cas
2. Respecter l'ordre de priorité (du plus fiable au moins fiable)
3. Retourner la première source valide trouvée

Exemple d'ajout d'un nouveau format :
```typescript
// Ajout après la priorité 1
if (justif.metadata?.alternativeSource) {
  return justif.metadata.alternativeSource
}
```

### Pour modifier le style des boutons :

Les styles sont définis dans le `sx` prop du `Button` :
```typescript
sx={{ flex: 1 }}  // Largeur égale pour les deux boutons
```

## 🧪 Tests recommandés

1. **Tester avec une proposition FFA** (devrait avoir un bouton source)
2. **Tester avec une proposition sans justification** (pas de bouton source)
3. **Tester le clic sur "Voir source"** (doit ouvrir dans nouvel onglet)
4. **Tester le responsive** (les boutons doivent rester lisibles sur mobile)
5. **Tester plusieurs propositions** (chaque card doit avoir son propre bouton)

## 📝 Utilisation dans le code

Le composant est utilisé dans les vues groupées (grouped proposals) :

- `EditionUpdateGroupedDetail.tsx`
- `EventUpdateGroupedDetail.tsx`
- `NewEventGroupedDetail.tsx`
- `RaceUpdateGroupedDetail.tsx`

Exemple d'utilisation :
```tsx
<AgentInfoSection proposals={relatedProposals} />
```

Les propositions doivent maintenant inclure le champ `justification` pour que le bouton source apparaisse.
