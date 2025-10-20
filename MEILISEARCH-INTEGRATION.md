# Intégration Meilisearch - Guide d'utilisation

## 🎯 Résumé de l'intégration

L'intégration Meilisearch a été ajoutée au projet data-agents pour permettre la recherche d'événements dans l'autocomplétion lors de la création de nouvelles propositions.

## 🚀 Fonctionnalités implémentées

### 1. Configuration Meilisearch
- **Paramètres** : URL et clé API configurables via la page Settings
- **Storage** : Paramètres stockés dans le système de settings existant (en mémoire)
- **Validation** : Tests de connexion disponibles

### 2. Service MeilisearchService
- **Recherche** : Recherche d'événements avec autocomplétion
- **Cache** : Mise en cache automatique des événements trouvés dans `EventCache`
- **Gestion des erreurs** : Fallback gracieux en cas d'indisponibilité

### 3. API Endpoints
```
GET /api/events/search?q=marathon&limit=10
GET /api/events/autocomplete?q=paris&limit=5  
GET /api/events/:eventId?cache=true
POST /api/events/test-meilisearch
```

### 4. Interface utilisateur
- **Page Settings** : Configuration Meilisearch avec test de connexion
- **Validation visuelle** : Chips d'état (Configuré/Non configuré)

## 📋 Configuration

### 1. Via l'interface Settings (http://localhost:4000/settings)

1. Aller dans la section "🔍 Configuration Meilisearch"
2. Remplir l'URL de votre instance Meilisearch
3. Ajouter votre clé API de recherche
4. Cliquer sur "Tester la connexion"

### 2. Via variables d'environnement

```bash
# .env
MEILISEARCH_URL=https://your-meilisearch-instance.com
MEILISEARCH_API_KEY=your_search_api_key
```

## 🔌 Utilisation pour l'autocomplétion des propositions

### Frontend (Dashboard)
```javascript
// Exemple d'intégration dans un composant d'autocomplétion
const searchEvents = async (query) => {
  const response = await fetch(`/api/events/autocomplete?q=${encodeURIComponent(query)}&limit=10`)
  const data = await response.json()
  
  if (data.success && data.data.configured) {
    return data.data.events.map(event => ({
      id: event.objectID,  // Correspond à l'eventId MilesRepublic
      label: `${event.name} - ${event.city}`,
      value: event.objectID,
      meta: {
        city: event.city,
        country: event.country,
        year: event.year,
        startDate: event.startDate
      }
    }))
  }
  
  return []
}
```

### Backend (Service)
```javascript
import { getMeilisearchService } from '@data-agents/database'
import { settingsService } from '../config/settings'

// Dans votre agent ou service
if (settingsService.isMeilisearchConfigured()) {
  const meilisearchService = getMeilisearchService(
    settingsService.getMeilisearchUrl(),
    settingsService.getMeilisearchApiKey()
  )
  
  const events = await meilisearchService.searchEventsAutocomplete('marathon paris', 5)
  
  // Utiliser les events pour créer des propositions
  events.forEach(event => {
    // event.objectID correspond à l'eventId dans MilesRepublic
    createProposal({
      eventId: event.objectID,
      type: 'EVENT_UPDATE',
      changes: { /* vos changements */ }
    })
  })
}
```

## 🎨 Structure des données

### MeilisearchEvent
```typescript
{
  objectID: string        // ID de l'événement dans MilesRepublic
  name: string           // Nom de l'événement
  city: string           // Ville
  country: string        // Pays
  startDate?: string     // Date de début
  endDate?: string       // Date de fin
  year?: string          // Année
  websiteUrl?: string    // Site web
  slug?: string          // Slug
  latitude?: number      // Coordonnées
  longitude?: number     // Coordonnées
}
```

### Cache automatique
Les événements trouvés via Meilisearch sont automatiquement mis en cache dans `EventCache` :

```sql
-- Les données sont sauvegardées dans la table event_cache
SELECT * FROM event_cache WHERE id = 'event-from-meilisearch-123';
```

## ⚙️ Configuration recommandée Meilisearch

### Index Structure
Votre index Meilisearch `events` devrait contenir :

```json
{
  "objectID": "event-12345",
  "name": "Marathon de Paris",
  "city": "Paris", 
  "country": "FR",
  "startDate": "2024-04-14T08:00:00Z",
  "year": "2024",
  "websiteUrl": "https://marathon-paris.com",
  "slug": "marathon-de-paris-2024",
  "latitude": 48.8566,
  "longitude": 2.3522
}
```

### Settings Meilisearch
```json
{
  "searchableAttributes": [
    "name",
    "city",
    "country"
  ],
  "filterableAttributes": [
    "year",
    "country",
    "startDate"
  ],
  "sortableAttributes": [
    "startDate",
    "name"
  ]
}
```

## 🔍 Tests et débogage

### Test de connexion
```bash
# Via API
curl -X POST http://localhost:4001/api/events/test-meilisearch

# Via interface
http://localhost:4000/settings -> "Tester la connexion"
```

### Test de recherche
```bash
# Recherche simple
curl "http://localhost:4001/api/events/search?q=marathon"

# Autocomplétion
curl "http://localhost:4001/api/events/autocomplete?q=paris&limit=5"

# Récupération avec cache
curl "http://localhost:4001/api/events/event-123?cache=true"
```

## 📊 Monitoring

Les logs sont disponibles dans :
- **API logs** : Connexions, erreurs Meilisearch
- **Agent logs** : Si utilisé dans un agent
- **Console** : Messages de debug du service

```javascript
// Vérifier le statut
const isConfigured = settingsService.isMeilisearchConfigured()
const service = getMeilisearchService()
const isConnected = service.isConnectionActive()
```

## 🚨 Gestion d'erreur

L'intégration est conçue pour être **non-bloquante** :

- Si Meilisearch n'est pas configuré → Continue sans recherche
- Si Meilisearch est indisponible → Fallback sur cache local
- Si la recherche échoue → Retourne tableau vide

## 📈 Performance

- **Cache local** : Les événements sont mis en cache après première recherche
- **Pagination** : Support des paramètres `limit` et `offset`
- **Timeout** : Pas de timeout infini sur les requêtes Meilisearch

## 🔄 Migration des données existantes

Pour synchroniser vos événements existants avec Meilisearch :

1. Exporter les événements depuis MilesRepublic
2. Les indexer dans Meilisearch avec `objectID` = `eventId` 
3. Tester la recherche
4. Configurer l'URL et la clé API dans les settings

---

## 📞 Usage dans la création de Proposal

Quand un utilisateur crée une nouvelle proposition, l'autocomplétion peut maintenant :

1. **Rechercher** dans Meilisearch en temps réel
2. **Suggérer** les événements pertinents
3. **Utiliser** l'`objectID` comme `eventId` de la proposal
4. **Cacher** l'événement localement pour les prochaines utilisations

L'intégration est maintenant prête pour être utilisée ! 🎉