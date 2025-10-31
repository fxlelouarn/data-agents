# Agent FFA Scraper

Agent de scraping du calendrier de la Fédération Française d'Athlétisme (FFA) pour extraire automatiquement les informations des compétitions de course à pied.

## 📋 Vue d'ensemble

Cet agent scrape le calendrier FFA (https://www.athle.fr/base/calendrier) pour :
- **Extraire** les compétitions par ligues et par mois
- **Matcher** avec les événements existants dans Miles Republic
- **Créer** des propositions de création/modification d'événements, éditions et courses

## 🏗️ Architecture

```
apps/agents/src/
├── FFAScraperAgent.ts              # Classe principale
├── FFAScraperAgent.configSchema.ts # Schéma de configuration
└── ffa/
    ├── types.ts                    # Interfaces TypeScript
    ├── scraper.ts                  # Requêtes HTTP et pagination
    ├── parser.ts                   # Parsing HTML avec cheerio
    └── matcher.ts                  # Matching avec Miles Republic
```

## 🔧 Fonctionnalités

### Scraping déterministe
- Parcours par **ligues** (21 ligues françaises) et **mois**
- Gestion de la **pagination** automatique
- **Délai humain** entre requêtes (1.5-3s)
- Calcul de la **saison FFA** (sept → août)

### Extraction complète
- Nom, ville, date, département, ligue, niveau
- Détails organisateur (email, site web, téléphone)
- Liste des **courses** avec distances et dénivelés
- URL de la fiche descriptive FFA

### Matching intelligent
- Algorithme de **similarité Levenshtein** (nom + ville)
- Matching de courses par **distance** (±10% tolérance)
- Seuil configurable (défaut: 75%)
- Fenêtre temporelle ±60 jours

### Propositions automatiques
- `EVENT_CREATE` : Nouveaux événements
- `EDITION_UPDATE` : Mise à jour dates
- `RACE_CREATE` : Nouvelles courses
- `RACE_UPDATE` : Modification courses

## ⚙️ Configuration

```json
{
  "sourceDatabase": "db-miles-republic",    // Base Miles Republic
  "liguesPerRun": 2,                        // Ligues par exécution
  "monthsPerRun": 1,                        // Mois par exécution
  "levels": ["Départemental", "Régional"],  // Niveaux à inclure
  "scrapingWindowMonths": 6,                // Fenêtre de scraping (mois)
  "rescanDelayDays": 30,                    // Délai avant rescan
  "humanDelayMs": 2000,                     // Délai entre requêtes
  "similarityThreshold": 0.75,              // Seuil de matching
  "distanceTolerancePercent": 0.1,          // Tolérance distance (10%)
  "confidenceBase": 0.9                     // Confiance de base
}
```

## 🚀 Utilisation

### Test en ligne de commande
```bash
# Dry-run avec verbose
node test-environment/console-tester.js FFAScraperAgent \
  --config test-environment/configs/ffa-scraper.json \
  --dry-run --verbose

# Test réel avec une ligue
node test-environment/console-tester.js FFAScraperAgent \
  --config test-environment/configs/ffa-scraper.json \
  --verbose

# Mode debug avec export
node test-environment/console-tester.js FFAScraperAgent \
  --config test-environment/configs/ffa-scraper.json \
  --debug --output ./ffa-results.json
```

### Programmation
```typescript
import { FFAScraperAgent } from '@data-agents/agents'

const agent = new FFAScraperAgent({
  id: 'ffa-scraper',
  name: 'FFA Scraper',
  frequency: '0 */12 * * *', // Toutes les 12h
  config: {
    sourceDatabase: 'db-miles-republic',
    liguesPerRun: 2,
    monthsPerRun: 1,
    levels: ['Départemental', 'Régional']
  }
})

const result = await agent.run(context)
```

## 📊 Progression persistante

L'agent maintient un état de progression dans `AgentState` :

```typescript
{
  currentLigue: "ARA",
  currentMonth: "2025-11",
  currentPage: 0,
  completedLigues: ["ARA", "BFC"],
  completedMonths: {
    "ARA": ["2025-11", "2025-12"],
    "BFC": ["2025-11"]
  },
  lastCompletedAt: "2025-10-31T12:00:00Z",
  totalCompetitionsScraped: 145
}
```

Cela permet de :
- Reprendre après interruption
- Éviter de rescanner trop souvent
- Suivre les statistiques

## 🎯 Exemple de résultat

### Compétition scrapée
```typescript
{
  ffaId: "296095",
  name: "Trail De La Raye",
  date: new Date("2025-11-01"),
  city: "La Baume Cornillane",
  department: "026",
  ligue: "ARA",
  level: "Départemental",
  races: [
    {
      name: "Trail 10 km",
      distance: 10000,
      positiveElevation: 500,
      type: "trail"
    }
  ]
}
```

### Proposition générée
```typescript
{
  type: 'EVENT_CREATE',
  changes: {
    name: "Trail De La Raye",
    city: "La Baume Cornillane",
    country: "France",
    edition: {
      year: "2025",
      startDate: new Date("2025-11-01"),
      races: [...]
    }
  },
  justification: [{
    type: 'text',
    content: "Nouvelle compétition FFA: Trail De La Raye",
    metadata: {
      ffaId: "296095",
      confidence: 0.9,
      source: "https://www.athle.fr/competitions/..."
    }
  }]
}
```

## ⚠️ Points d'attention

1. **Respect du site FFA** : Délai humain obligatoire (1.5-3s)
2. **Saison FFA** : Calculer correctement (sept → août)
3. **Pagination** : Vérifier nombre total de pages
4. **Distances** : Toujours en mètres (conversion km → m)
5. **Matching** : Ne pas créer de doublon si >75% similarité

## 🔍 Debugging

### Activer les logs détaillés
```bash
DEBUG=* node test-environment/console-tester.js FFAScraperAgent \
  --config test-environment/configs/ffa-scraper.json \
  --verbose
```

### Tester le parsing
```typescript
import { parseFrenchDate, parseDistance, cleanEventName } from './parser'

// Test parsing date
const date = parseFrenchDate("01 novembre")
// => Date object

// Test parsing distance
const distance = parseDistance("10 km")
// => 10000 (en mètres)

// Test nettoyage nom
const clean = cleanEventName("Trail De La Raye 2025 - 3ème édition")
// => "Trail De La Raye"
```

### Tester le matching
```typescript
import { calculateSimilarity } from './matcher'

const similarity = calculateSimilarity("Trail de la Raye", "Trail Raye")
// => 0.85
```

## 📚 Références

- [Plan complet](../../../../docs/PLAN-AGENT-FFA.md)
- [Documentation FFA](../../../../docs/AGENT-FFA.md)
- [Architecture des agents](../../../../docs/AGENTS-ARCHITECTURE.md)

## 🎉 Statut

✅ **Version 1.0** - Implémentation complète
- Types TypeScript
- Scraping HTTP avec pagination
- Parsing HTML
- Matching Levenshtein
- Gestion de la progression
- Propositions automatiques

## 🚧 Améliorations futures

- [ ] Cache des compétitions scrapées
- [ ] Détection des modifications
- [ ] Parallélisation du scraping
- [ ] Export JSON des compétitions
- [ ] Dashboard de monitoring
- [ ] Alertes en cas d'erreur
