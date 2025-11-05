# Améliorations des Justifications - ProposalJustificationsCard

## 🎯 Objectif
Rendre toutes les URLs sources cliquables et facilement accessibles dans les justifications des propositions.

## ✨ Nouvelles fonctionnalités

### 1. Lien rapide dans l'en-tête de l'accordéon
Chaque justification qui contient une source dans `metadata.source` affiche maintenant un lien "Voir la source" directement dans l'en-tête, sans avoir besoin d'ouvrir l'accordéon.

```
┌─ Source 1 ▼ ───────────────────────────────┐
│ 🔗 Lien web  [🔗 Voir la source]            │
│              Marathon | Agent               │
└─────────────────────────────────────────────┘
```

**Comportement :**
- Cliquer sur "Voir la source" ouvre l'URL dans un nouvel onglet
- L'événement `stopPropagation()` empêche l'accordéon de s'ouvrir/fermer
- Le lien reste accessible même quand l'accordéon est fermé

### 2. URLs cliquables dans les métadonnées
Toutes les URLs dans les métadonnées additionnelles sont maintenant automatiquement détectées et rendues cliquables.

**Avant :**
```
source: https://www.athle.fr/competitions/...
```

**Après :**
```
source: [https://www.athle.fr/competitions/...] (cliquable)
```

**Détection automatique :**
- Regex pattern: `/^https?:\/\//`
- S'applique à toutes les valeurs de type `string` dans les métadonnées
- Attributs : `target="_blank"` et `rel="noopener noreferrer"`

### 3. Structure complète des sources cliquables

Le composant rend maintenant cliquables les URLs dans :

✅ **Content principal** (type `url` ou `text` commençant par http)
✅ **metadata.source** (lien rapide dans l'en-tête)
✅ **metadata.dateDetails.source** (source unique - ancien format)
✅ **metadata.dateDetails.sources[].source** (sources multiples - nouveau format)
✅ **metadata.[anyKey]** (toute métadonnée contenant une URL)

## 📊 Exemple d'utilisation

### Justification typique du FFAScraperAgent

```json
{
  "type": "text",
  "content": "Organisateur FFA: LA CHEVIGNOISE (nouveau site web)",
  "metadata": {
    "source": "https://www.athle.fr/competitions/235846858849195849565849761837547837",
    "contact": {
      "email": "service.sports@chevigny-saint-sauveur.fr",
      "phone": "0380489207",
      "website": "http://www.chevigny-saint-sauveur.fr"
    },
    "reasons": ["nouveau site web"],
    "newOrganizer": "LA CHEVIGNOISE"
  }
}
```

**Affichage :**
```
┌─ Source 1 ▼ ─────────────────────────────────┐
│ 📄 Texte  [🔗 Voir la source]  FFA | Agent   │
└───────────────────────────────────────────────┘
  ↓ Ouvre l'accordéon ↓
  
Contenu:
Organisateur FFA: LA CHEVIGNOISE (nouveau site web)

───────────────────────────────────────────────

Métadonnées additionnelles:
  source: [https://www.athle.fr/...] (cliquable)
  contact: {"email": "...", "phone": "...", "website": "http://..."} 
  reasons: ["nouveau site web"]
  newOrganizer: LA CHEVIGNOISE
```

### Justification avec extraction de dates

```json
{
  "type": "url",
  "content": "https://example.com/marathon-info",
  "metadata": {
    "raceName": "Marathon de Paris",
    "agentName": "GoogleSearchDateAgent",
    "source": "https://example.com/dates",
    "dateDetails": {
      "date": "2025-04-06",
      "confidence": 0.95,
      "sources": [
        {
          "source": "https://example.com/calendar",
          "snippet": "Marathon: 06/04/2025"
        },
        {
          "source": "https://example.com/inscriptions",
          "snippet": "Date de la course: 6 avril 2025"
        }
      ]
    }
  }
}
```

**Affichage :**
```
┌─ Source 1 ▼ ──────────────────────────────────────┐
│ 🔗 Lien web  [🔗 Voir la source]                   │
│              Marathon de Paris | GoogleSearchAgent │
└────────────────────────────────────────────────────┘
  ↓ Ouvre l'accordéon ↓
  
Contenu:
[https://example.com/marathon-info] (cliquable)

───────────────────────────────────────────────

✓ Détails de la date extraite
  Date: 2025-04-06
  Confiance: [95%]
  
  Sources (2):
  • [https://example.com/calendar] (cliquable)
    "Marathon: 06/04/2025"
  
  • [https://example.com/inscriptions] (cliquable)
    "Date de la course: 6 avril 2025"

───────────────────────────────────────────────

Métadonnées additionnelles:
  raceName: Marathon de Paris
  agentName: GoogleSearchDateAgent
  source: [https://example.com/dates] (cliquable)
```

## 🔧 Implémentation technique

### Fonction `formatMetadataValue`

```typescript
const formatMetadataValue = (value: any): React.ReactNode => {
  // Détection d'URL
  if (typeof value === 'string' && value.match(/^https?:\/\//)) {
    return (
      <Link 
        href={value} 
        target="_blank" 
        rel="noopener noreferrer"
        sx={{ wordBreak: 'break-all', fontSize: '0.75rem' }}
      >
        {value}
      </Link>
    )
  }
  
  // Formatage JSON pour objets
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  
  // Valeur brute pour le reste
  return String(value)
}
```

### Lien rapide dans AccordionSummary

```tsx
{justification.metadata?.source && (
  <Link
    href={justification.metadata.source}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()} // Important !
    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
  >
    <LinkIcon sx={{ fontSize: '0.9rem' }} />
    Voir la source
  </Link>
)}
```

## 🎨 Styling

- **Lien en-tête :** `fontSize: 0.7rem` avec icône `LinkIcon`
- **Liens métadonnées :** `fontSize: 0.75rem` avec `wordBreak: 'break-all'`
- **Couleur :** Utilise la couleur primaire du thème MUI
- **Hover :** Soulignement automatique (comportement standard des liens MUI)

## 🔄 Backward Compatibility

Le composant continue de supporter :
- Les justifications sans métadonnées
- Les justifications sans source
- L'ancien format avec source unique
- Le nouveau format avec sources multiples

Tous les cas d'usage existants fonctionnent sans modification.

## ✅ Tests recommandés

1. **Tester avec une proposition FFA** (organizer + races)
2. **Tester avec une proposition de date** (dateDetails avec sources)
3. **Tester le clic sur "Voir la source"** (doit ouvrir dans nouvel onglet)
4. **Tester que l'accordéon ne s'ouvre pas** quand on clique sur le lien
5. **Tester les liens dans les métadonnées** (doivent tous être cliquables)

## 📝 Commande de test

```bash
# Visualiser une proposition avec justifications
node scripts/view-proposal.js cmhlcp7gr01rvqy79muaap880

# Voir toutes les propositions en attente
curl http://localhost:3001/api/proposals?status=PENDING | jq '.data[].id'
```
