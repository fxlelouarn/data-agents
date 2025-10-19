# Google Search Date Agent

Agent de recherche automatique des dates d'événements sportifs via l'API Google Custom Search.

## 📋 Description

Le **GoogleSearchDateAgent** est un agent d'extraction qui :

1. **Se connecte à la base Next Prod** et récupère les événements avec `calendarStatus = TO_BE_CONFIRMED`
2. **Effectue des recherches Google** avec une requête formatée : `"<Event.name>" "<Event.city>" <Edition.year>`
3. **Extrait les dates** des snippets de résultats Google 
4. **Propose des mises à jour** pour les dates d'édition (`Edition.startDate`) et de courses (`Race.startDate`)
5. **Gère la pagination** avec un système de batch pour parcourir tous les événements

## 🚀 Fonctionnalités

### Extraction intelligente
- **Patterns de dates multiples** : supports des formats français (`15 juin 2024`, `15/06/2024`, etc.)
- **Score de confiance** : évalue la fiabilité de chaque date extraite (0-1)
- **Filtrage temporel** : ne considère que les dates futures et raisonnables
- **Déduplication** : évite les doublons de dates extraites

### Gestion des batches
- **Parcours séquentiel** : traite les événements par groupes de taille configurable
- **État persistant** : reprend là où il s'était arrêté au run précédent
- **Tour complet** : recommence du début une fois tous les événements traités

### Propositions détaillées
- **Justifications complètes** : liens vers les sources, snippets extraits, contexte
- **Types de propositions** : `EDITION_UPDATE` et `RACE_UPDATE`
- **Métadonnées riches** : confiance, source, contexte d'extraction

## ⚙️ Configuration

### Paramètres obligatoires
```json
{
  "batchSize": 10,           // Nombre d'événements par batch (défaut: 10)
  "googleResultsCount": 5    // Nombre de résultats Google à analyser (défaut: 5)
}
```

### Paramètres optionnels
```json
{
  "googleApiKey": "your-api-key",                    // Clé API Google Custom Search
  "googleSearchEngineId": "your-search-engine-id",  // ID du moteur de recherche
  "dateConfidenceThreshold": 0.6,                   // Seuil de confiance minimum
  "maxDatesPerEvent": 5,                            // Dates maximum par événement
  "searchTimeoutMs": 10000,                         // Timeout recherche (10s)
  "enableMockMode": true,                           // Mode mock sans API
  "onlyFrenchEvents": true,                         // Limiter aux événements français
  "excludeWeekends": false                          // Exclure les weekends
}
```

### Variables d'environnement
- `GOOGLE_API_KEY` : Clé API Google Custom Search
- `GOOGLE_SEARCH_ENGINE_ID` : ID du moteur de recherche personnalisé
- `MILES_REPUBLIC_DATABASE_URL` : URL de connexion à la base Next Prod

## 🎯 Utilisation

### Enregistrement de l'agent
```typescript
import { GoogleSearchDateAgent } from './GoogleSearchDateAgent'
import { agentRegistry } from '@data-agents/agent-framework'

const config = {
  id: 'google-search-date-001',
  name: 'Google Search Date Agent',
  type: 'EXTRACTOR',
  frequency: '0 */6 * * *', // Toutes les 6 heures
  isActive: true,
  config: {
    batchSize: 10,
    googleResultsCount: 5
  }
}

agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent, config)
```

### Exécution manuelle
```typescript
const agent = new GoogleSearchDateAgent(config)
const result = await agent.run(context)

console.log(`Événements traités: ${result.metrics.eventsProcessed}`)
console.log(`Propositions créées: ${result.metrics.proposalsCreated}`)
```

## 📊 Résultats et métriques

### Structure des résultats
```typescript
interface AgentRunResult {
  success: boolean
  proposals: ProposalData[]          // Propositions générées
  message: string                    // Message de résumé
  metrics: {
    eventsProcessed: number          // Nombre d'événements traités
    proposalsCreated: number         // Nombre de propositions créées
    nextOffset: number              // Offset pour le prochain batch
  }
}
```

### Types de propositions générées

#### 1. Proposition d'édition (EDITION_UPDATE)
```json
{
  "type": "EDITION_UPDATE",
  "eventId": "event-123",
  "editionId": "edition-456", 
  "changes": {
    "startDate": {
      "new": "2024-06-15T00:00:00.000Z",
      "confidence": 0.8
    }
  },
  "justification": [
    {
      "type": "text",
      "content": "Recherche Google effectuée avec la requête: \"Marathon de Paris\" \"Paris\" 2024"
    },
    {
      "type": "url", 
      "content": "https://www.schneiderelectricparismarathon.com",
      "metadata": {
        "title": "Marathon de Paris 2024 - 7 avril",
        "snippet": "Le Marathon de Paris aura lieu le dimanche 7 avril 2024...",
        "displayLink": "schneiderelectricparismarathon.com"
      }
    }
  ]
}
```

#### 2. Proposition de course (RACE_UPDATE)
```json
{
  "type": "RACE_UPDATE",
  "eventId": "event-123", 
  "editionId": "edition-456",
  "raceId": "race-789",
  "changes": {
    "startDate": {
      "new": "2024-06-15T09:00:00.000Z",
      "confidence": 0.72
    }
  },
  "justification": [
    {
      "type": "text",
      "content": "Date proposée pour la course \"Marathon 42km\": 15 juin 2024 (extrait de: \"La course aura lieu le 15 juin 2024...\")"
    }
  ]
}
```

## 🔍 Extraction de dates

### Patterns supportés
L'agent reconnaît plusieurs formats de dates en français :

1. **Dates complètes** : `le 15 juin 2024`, `le dimanche 16 juin 2024`
2. **Formats numériques** : `15/06/2024`, `15-06-2024`  
3. **Mois uniquement** : `juin 2024`, `en juin 2024`
4. **Format ISO** : `2024-06-15`

### Scoring de confiance
- **0.8** : Dates explicites avec jour et mois (`15 juin 2024`)
- **0.7** : Formats numériques (`15/06/2024`)
- **0.6** : Dates parsées automatiquement
- **0.5** : Mois uniquement (`juin 2024`)

### Filtres appliqués
- **Plage temporelle** : Entre maintenant et +2 ans
- **Années valides** : Année courante à année courante +2
- **Déduplication** : Suppression des dates identiques
- **Tri** : Par ordre de confiance décroissante

## 🗄️ Base de données

### Requête principale
```sql
SELECT e.*, ed.* FROM Event e
JOIN Edition ed ON e.currentEditionEventId = ed.id  
WHERE ed.calendarStatus = 'TO_BE_CONFIRMED'
ORDER BY e.createdAt ASC
LIMIT batchSize OFFSET currentOffset
```

### Structure attendue
- **Event** : `id`, `name`, `city`, `currentEditionEventId`
- **Edition** : `id`, `year`, `calendarStatus`  
- **Race** : `id`, `name` (optionnel)

## 🔧 Mode développement

### Mode Mock
Si les clés API Google ne sont pas configurées, l'agent utilise des résultats mockés :

```typescript
{
  items: [
    {
      title: "Marathon de Paris - Course officielle",
      link: "https://example.com/course1", 
      snippet: "La course aura lieu le 15 juin 2024. Inscriptions ouvertes jusqu'au 10 mai 2024.",
      displayLink: "example.com"
    }
  ]
}
```

### Tests
```bash
# Exécuter l'exemple
npm run test:google-search-date

# Validation de l'agent  
npm run validate:agents
```

## 📈 Monitoring et logs

### Logs générés
- **INFO** : Début/fin d'exécution, événements traités
- **WARN** : Aucun résultat Google, dates non extraites
- **ERROR** : Erreurs de connexion, parsing, API

### Métriques trackées
- Nombre d'événements traités par run
- Nombre de propositions générées
- Taux de succès d'extraction de dates
- Temps d'exécution moyen
- Progression du batch (offset)

## ⚠️ Limitations et considérations

### Limites techniques
- **API Google** : 100 requêtes/jour par défaut (version gratuite)
- **Rate limiting** : Respecter les limites de l'API Custom Search
- **Timeout** : Requêtes limitées à 10 secondes par défaut

### Précision
- **Confiance modérée** : Les dates extraites nécessitent validation humaine
- **Contexte limité** : Basé uniquement sur les snippets Google
- **Ambiguïtés** : Dates multiples possibles, événements homonymes

### Recommandations
- **Validation manuelle** : Toujours vérifier les propositions avant application
- **Monitoring** : Surveiller les taux d'erreur et de confiance
- **Configuration** : Ajuster `batchSize` selon la charge

## 🔄 Évolutions possibles

### Améliorations courtes
- Support des formats de dates anglais/internationaux  
- Filtrage par type d'événement (marathon, trail, etc.)
- Cache des résultats Google pour éviter les doublons

### Améliorations moyennes
- Integration avec d'autres moteurs de recherche
- Extraction d'informations supplémentaires (horaires, prix)
- Validation croisée entre plusieurs sources

### Améliorations longues
- Machine Learning pour améliorer l'extraction
- Interface de validation semi-automatique
- Intégration avec calendriers officiels des fédérations

---

## 📞 Support

Pour toute question ou problème :
- Consulter les logs de l'agent via le dashboard
- Vérifier la configuration des clés API Google
- Tester en mode mock pour le développement
- Contacter l'équipe de développement pour les bugs