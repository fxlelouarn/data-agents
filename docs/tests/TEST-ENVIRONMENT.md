# 🧪 Test Environment - Testing des Agents

## Vue d'ensemble

Le **test-environment** est une console interactive permettant de **tester rapidement les agents** sans démarrer l'application complète. Cela facilite le développement, le debugging et la validation locale.

**Documentation détaillée** : Voir [`test-environment/README.md`](../test-environment/README.md)

---

## 1. Quick Start

### 1.1 Test Simple

```bash
# Tester l'agent de test simple
node test-environment/console-tester.js test-agent

# Avec verbosité
node test-environment/console-tester.js test-agent --verbose

# Mode dry-run (simulation)
node test-environment/console-tester.js test-agent --dry-run
```

### 1.2 Test GoogleSearchDateAgent

```bash
# Avec configuration
node test-environment/console-tester.js GoogleSearchDateAgent \
  --config test-environment/configs/google-agent.json \
  --dry-run --verbose

# Mode interactif
node test-environment/console-tester.js GoogleSearchDateAgent --interactive

# Debug mode avec output
node test-environment/console-tester.js GoogleSearchDateAgent \
  --debug \
  --output ./results.json
```

### 1.3 Options Principales

| Option | Description | Exemple |
|--------|-------------|---------|
| `--config <file>` | Fichier config JSON/JS | `--config ./configs/agent.json` |
| `--dry-run` | Mode simulation | `--dry-run` |
| `--verbose` | Logs détaillés | `--verbose` |
| `--debug` | Mode debug avec stack traces | `--debug` |
| `--interactive` | Mode interactif | `--interactive` |
| `--timeout <ms>` | Timeout exécution | `--timeout 60000` |
| `--batch-size <n>` | Taille batch | `--batch-size 5` |
| `--output <file>` | Sauvegarder résultats | `--output ./results.json` |
| `--no-color` | Désactiver couleurs | `--no-color` |

---

## 2. Structure du Test Environment

```
test-environment/
├── console-tester.js              # Point d'entrée principal
├── utils/
│   ├── AgentTester.js             # Orchestrateur tests
│   ├── logger.js                  # Logging coloré
│   ├── cli-parser.js              # Parsing arguments
│   ├── mock-context.js            # Services mockés
│   └── interactive-prompt.js      # Mode interactif
├── configs/
│   ├── google-agent.json          # Config Google Search
│   ├── ffa-scraper.json           # Config FFA
│   └── trail-urbain-live.json     # Config Trail Urbain
├── agents/
│   └── test-agent.js              # Agent de test simple
└── README.md                       # Documentstion complète
```

---

## 3. Système de Logging

### 3.1 Niveaux de Log

```
🔍 DEBUG     - Informations détaillées pour debug
ℹ️  INFO      - Informations générales
⚠️  WARN      - Avertissements
❌ ERROR     - Erreurs
✅ SUCCESS   - Opérations réussies
⚙️  OPERATION - Début/fin opérations
```

### 3.2 Exemple de Sortie

```
[10:30:15.234 +1250ms] ✅  SUCCESS     [TestRunner > agent-initialization] Agent initialized successfully
  { agentName: 'test-agent', agentType: 'TestAgent', config: { dryRun: true, batchSize: 5 } }

[10:30:15.456 +1472ms] ⚙️  OPERATION   [TestRunner > Agent] Starting operation: test-agent-execution
[10:30:15.678 +1694ms] ℹ️  INFO        [TestRunner > Agent > test-agent-execution] Starting test agent execution
  { config: { dryRun: true, batchSize: 5 }, mode: 'DRY_RUN' }
```

### 3.3 Configuration Logging

```bash
# Control le niveau de détail
LOG_LEVEL=DEBUG node test-environment/console-tester.js agent-name

# Désactiver couleurs (CI/CD)
node test-environment/console-tester.js agent-name --no-color
```

---

## 4. Contexte Mock

### 4.1 Services Mockés

Le test-environment fournit un contexte completement mock qui remplace :
- **Database** - Client Prisma simulé
- **HTTP** - Requêtes HTTP mockées
- **Browser** - Navigation Playwright simulée
- **File System** - Opérations fichiers simulées
- **External APIs** - APIs (Google, FFA, etc.) simulées

### 4.2 Avantages

✅ Tests rapides sans dépendances externes
✅ Comportement prévisible et reproductible
✅ Logging détaillé de toutes opérations
✅ Configuration flexible
✅ Pas d'effets de bord

### 4.3 Exemple Contexte Mock

```javascript
// Automatiquement fourni à l'agent
const context = {
  db: {
    prisma: {
      Event: {
        findMany: async () => [/* mock events */],
        create: async () => ({ id: '1', name: 'Test' }),
        // ...
      }
    }
  },
  api: {
    google: {
      search: async (query) => ({ items: [/* mock results */] })
    },
    ffa: {
      fetchCalendar: async () => ({ events: [] })
    }
  },
  browser: {
    newPage: async () => ({
      goto: async () => {},
      $ : async () => ({ innerHTML: '' }),
      // ...
    })
  },
  fileSystem: {
    readFile: async () => '',
    writeFile: async () => {}
  }
}
```

---

## 5. Mode Interactif

### 5.1 Utilisation

```bash
node test-environment/console-tester.js GoogleSearchDateAgent --interactive
```

### 5.2 Fonctionnalités

Chaque agent peut définir ses propres questions :

```javascript
getInteractiveQuestions() {
  return [
    {
      name: 'batchSize',
      type: 'number',
      message: 'Batch size?',
      default: 10,
      min: 1,
      max: 100
    },
    {
      name: 'mode',
      type: 'select',
      message: 'Execution mode?',
      choices: ['simulation', 'live', 'test'],
      default: 0
    }
  ]
}
```

---

## 6. Configuration des Tests

### 6.1 Format JSON

```json
{
  "batchSize": 10,
  "timeout": 30000,
  "dryRun": true,
  "googleApiKey": "your-api-key",
  "sourceDatabase": "db-miles-republic"
}
```

### 6.2 Format JavaScript

Pour logique complexe :

```javascript
module.exports = {
  batchSize: process.env.BATCH_SIZE || 10,
  timeout: 30000,
  dryRun: process.env.NODE_ENV !== 'production',
  
  // Configuration dynamique
  generateSearchQueries: () => ['marathon france', 'trail urbain'],
  
  // Transformation données
  transform: (data) => processData(data)
}
```

### 6.3 Priorité Configuration

1. **Arguments CLI** (priorité maximale)
2. **Fichier configuration**
3. **Valeurs par défaut** (priorité minimale)

---

## 7. Cas d'Utilisation Réels

### 7.1 Développement d'Agent

```bash
# Développement itératif
node test-environment/console-tester.js MonAgent \
  --config ./mon-agent-config.json \
  --verbose \
  --dry-run

# Checker logs détaillés
node test-environment/console-tester.js MonAgent \
  --debug \
  --output ./debug.json
```

### 7.2 Test Validation Config

```bash
# Tester validation agent sans dépendances
node test-environment/console-tester.js GoogleSearchDateAgent \
  --config bad-config.json \
  --verbose

# Vérifier messages erreur
```

### 7.3 Validation Extraction Données

```bash
# Tester extraction avec mock DB
node test-environment/console-tester.js GoogleSearchDateAgent \
  --config real-config.json \
  --dry-run \
  --verbose \
  --output extraction-results.json

# Analyser résultats extraction
```

### 7.4 Performance Testing

```bash
# Tester performance avec batch size varié
for SIZE in 5 10 20 50; do
  node test-environment/console-tester.js GoogleSearchDateAgent \
    --batch-size $SIZE \
    --output "perf-batch-$SIZE.json"
done

# Comparer performance par batch size
```

---

## 8. Intégration CI/CD

### 8.1 Script Test Basique

```bash
#!/bin/bash
set -e

# Test tous les agents en dry-run
for agent in test-agent GoogleSearchDateAgent FFAScraperAgent; do
  echo "Testing $agent..."
  node test-environment/console-tester.js $agent \
    --dry-run \
    --no-color \
    --output ./ci-results-$agent.json
done

echo "✅ All tests passed"
```

### 8.2 Vérification Résultats

```bash
# Vérifier succès test
if ! jq -e '.success' ci-results.json > /dev/null; then
  echo "❌ Test failed"
  exit 1
fi

echo "✅ Test passed"
```

---

## 9. Créer un Agent Testable

### 9.1 Interface Requise

```javascript
class MonAgent {
  constructor(context, logger) {
    this.context = context
    this.logger = logger
  }
  
  // Méthode d'exécution (requise)
  async execute() {
    this.logger.info('Exécution agent')
    return { success: true, itemsProcessed: 42 }
  }
  
  // Configuration (optionnel)
  async configure(config) {
    this.config = config
  }
  
  // Questions interactives (optionnel)
  getInteractiveQuestions() {
    return [
      { name: 'param1', type: 'text', message: 'Parameter?' }
    ]
  }
  
  // Appliquer réponses (optionnel)
  applyInteractiveAnswers(answers) {
    this.config = { ...this.config, ...answers }
  }
  
  // Nettoyage (optionnel)
  async cleanup() {
    // Libérer ressources
  }
}
```

### 9.2 Enregistrement

Les agents sont découverts automatiquement depuis `apps/agents/src/`.

---

## 10. Dépannage

### Problème : Agent not found

```
Error: Agent 'MonAgent' not found. Available agents: test-agent, GoogleSearchDateAgent
```

**Solution** :
- Vérifier nom agent exact
- Vérifier agent existe dans `apps/agents/src/`
- Vérifier casse du nom

### Problème : Config file not found

```
Error: Config file not found: ./config.json
```

**Solution** :
- Vérifier chemin du fichier (relatif ou absolu)
- Vérifier permissions fichier
- Créer fichier s'il n'existe pas

### Problème : Timeout

```
Error: Agent execution timeout (30000ms)
```

**Solution** :
- Augmenter timeout : `--timeout 60000`
- Vérifier logs pour blocages
- Utiliser `--debug` pour stack traces

### Problème : Mock data not working

```javascript
// ❌ MAUVAIS - attendre mais pas d'await
const events = this.context.db.prisma.Event.findMany()

// ✅ BON
const events = await this.context.db.prisma.Event.findMany()
```

---

## 11. Fichiers de Résultat

### 11.1 Format JSON Output

```json
{
  "agentName": "test-agent",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "duration": 5234,
  "options": { "dryRun": true, "batchSize": 5 },
  "success": true,
  "itemsProcessed": 5,
  "results": [
    { "id": "1", "name": "Result 1", "processed": true }
  ],
  "logs": [
    { "timestamp": "10:30:00.234", "level": "INFO", "message": "..." }
  ]
}
```

### 11.2 Analyse des Résultats

```bash
# Nombre d'items traités
cat results.json | jq '.itemsProcessed'

# Tous les succès
cat results.json | jq '.results[] | select(.processed == true)'

# Extraire métriques
cat results.json | jq '{ duration, itemsProcessed, success }'
```

---

## 12. Conseils Best Practices

✅ **À FAIRE** :
- Tester avec `--dry-run` d'abord
- Utiliser `--verbose` pour comprendre les logs
- Valider config avant run production
- Sauvegarder résultats tests avec `--output`
- Tester avec différents batch sizes
- Documenter configurations de test

❌ **À ÉVITER** :
- Dépendre d'APIs réelles (toujours mock)
- Oublier d'await sur appels async
- Ignorer messages d'erreur logging
- Modifier test-environment pour tester (créer agent)
- Hardcoder valeurs au lieu de config

---

## Voir aussi

- [`test-environment/README.md`](../test-environment/README.md) - Documentation complète
- [AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md) - Structure agents
- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Configuration agents
