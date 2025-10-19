# 🧪 Data Agents Test Environment

Environnement de test console pour les agents du projet data-agents. Permet de tester et débugger facilement les agents directement depuis la ligne de commande avec des logs détaillés et colorés.

## 🚀 Quick Start

```bash
# Lancer un agent de test simple
node test-environment/console-tester.js test-agent --verbose

# Tester le GoogleSearchDateAgent avec configuration
node test-environment/console-tester.js GoogleSearchDateAgent --config test-environment/configs/google-agent.json --dry-run

# Mode interactif
node test-environment/console-tester.js test-agent --interactive --debug

# Sauvegarder les résultats
node test-environment/console-tester.js test-agent --output ./logs/test-results.json
```

## 📁 Structure

```
test-environment/
├── console-tester.js          # Point d'entrée principal
├── utils/
│   ├── logger.js             # Système de logging coloré
│   ├── AgentTester.js        # Orchestrateur des tests
│   ├── cli-parser.js         # Parseur d'arguments CLI
│   ├── mock-context.js       # Contexte simulé pour les tests
│   └── interactive-prompt.js # Interface interactive
├── configs/                  # Configurations d'exemple
│   ├── google-agent.json
│   └── ffa-scraper.json
├── agents/                   # Agents de test
│   └── test-agent.js
└── README.md                # Cette documentation
```

## 🛠️ Utilisation

### Arguments de base

```bash
node console-tester.js <agent-name> [options]
```

### Options disponibles

| Option | Description | Exemple |
|--------|-------------|---------|
| `--config <file>` | Fichier de configuration JSON/JS | `--config ./configs/agent.json` |
| `--dry-run` | Mode simulation (pas d'actions réelles) | `--dry-run` |
| `--verbose` | Logging détaillé | `--verbose` |
| `--interactive` | Mode interactif avec prompts | `--interactive` |
| `--timeout <ms>` | Timeout d'exécution (défaut: 30000) | `--timeout 60000` |
| `--batch-size <n>` | Taille de batch (défaut: 10) | `--batch-size 5` |
| `--output <file>` | Sauvegarder la sortie dans un fichier | `--output ./results.json` |
| `--no-color` | Désactiver les couleurs | `--no-color` |
| `--debug` | Mode debug avec détails extra | `--debug` |

### Variables d'environnement

| Variable | Description | Valeurs |
|----------|-------------|---------|
| `LOG_LEVEL` | Niveau de logging | `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `NODE_ENV` | Environnement d'exécution | `development`, `test`, `production` |

## 📋 Exemples d'utilisation

### Test simple avec l'agent de test

```bash
# Test basique
node test-environment/console-tester.js test-agent

# Test avec configuration personnalisée
node test-environment/console-tester.js test-agent --dry-run --verbose --batch-size 3

# Test interactif
node test-environment/console-tester.js test-agent --interactive
```

### Test du GoogleSearchDateAgent

```bash
# Configuration depuis fichier
node test-environment/console-tester.js GoogleSearchDateAgent \
  --config test-environment/configs/google-agent.json \
  --dry-run --verbose

# Test en mode debug
node test-environment/console-tester.js GoogleSearchDateAgent \
  --debug --timeout 45000 --output ./logs/google-test.json
```

### Test du FFA Scraper

```bash
# Test avec simulation
node test-environment/console-tester.js ffa-scraper \
  --config test-environment/configs/ffa-scraper.json \
  --dry-run --verbose

# Test avec sauvegarde de résultats
node test-environment/console-tester.js ffa-scraper \
  --output ./logs/ffa-results.json --batch-size 5
```

## 🎨 Système de Logging

Le système de logging intégré offre :

### Niveaux de log
- 🔍 **DEBUG** : Informations détaillées de débogage
- ℹ️ **INFO** : Informations générales
- ⚠️ **WARN** : Avertissements
- ❌ **ERROR** : Erreurs
- ✅ **SUCCESS** : Opérations réussies
- ⚙️ **OPERATION** : Début/fin d'opérations

### Fonctionnalités
- **Couleurs** : Sortie colorée pour une meilleure lisibilité
- **Timestamps** : Horodatage avec temps écoulé
- **Contexte hiérarchique** : Suivi des opérations imbriquées
- **Métadonnées structurées** : Données JSON attachées aux logs
- **Sauvegarde fichier** : Option de sauvegarde des logs
- **Troncature intelligente** : Limitation de la taille des données

### Exemple de sortie

```
[10:30:15.234 +1250ms] ✅  SUCCESS     [TestRunner > agent-initialization] Agent initialized successfully
  { agentName: 'test-agent', agentType: 'TestAgent', config: { dryRun: true, batchSize: 5 } }

[10:30:15.456 +1472ms] ⚙️  OPERATION   [TestRunner > Agent] Starting operation: test-agent-execution
[10:30:15.678 +1694ms] ℹ️  INFO        [TestRunner > Agent > test-agent-execution] Starting test agent execution
  { config: { dryRun: true, batchSize: 5 }, mode: 'DRY_RUN' }
```

## 🤖 Contexte Mock

L'environnement de test fournit un contexte simulé qui remplace les vrais services :

### Services mockés
- **Database** : Client Prisma simulé
- **HTTP Client** : Requêtes HTTP simulées
- **Browser** : Navigation Playwright simulée
- **File System** : Opérations fichier simulées
- **External APIs** : APIs Google, FFA, etc. simulées

### Avantages
- ✅ Tests rapides sans dépendances externes
- ✅ Comportement prévisible
- ✅ Logging détaillé des opérations
- ✅ Configuration flexible
- ✅ Pas d'effets de bord

### Exemple d'utilisation dans un agent

```javascript
// L'agent reçoit le contexte mock automatiquement
async execute() {
    // Les appels sont automatiquement mockés
    const events = await this.context.db.prisma.event.findMany();
    const searchResults = await this.context.api.google.search('marathon france');
    const page = await this.context.browser.newPage();
    
    // Toutes ces opérations sont loggées et simulées
}
```

## 🎛️ Mode Interactif

Le mode interactif permet de configurer l'agent dynamiquement :

```bash
node test-environment/console-tester.js test-agent --interactive
```

### Fonctionnalités interactives
- **Questions personnalisées** : Chaque agent peut définir ses questions
- **Validation** : Validation des entrées utilisateur
- **Types variés** : Texte, nombres, confirmations, sélections
- **Valeurs par défaut** : Configuration pré-remplie
- **Interface intuitive** : Menus et prompts clairs

### Exemple de questions d'agent

```javascript
getInteractiveQuestions() {
    return [
        {
            name: 'batchSize',
            type: 'number',
            message: 'Combien d\'items traiter ?',
            default: 10,
            min: 1,
            max: 100
        },
        {
            name: 'mode',
            type: 'select',
            message: 'Mode d\'exécution ?',
            choices: ['simulation', 'live', 'test'],
            default: 0
        }
    ];
}
```

## 📝 Configuration

### Fichiers de configuration

Les configurations peuvent être au format JSON ou JavaScript :

#### JSON (recommandé)
```json
{
  "agentParam1": "value1",
  "timeout": 30000,
  "dryRun": true,
  "batchSize": 10
}
```

#### JavaScript (pour logique complexe)
```javascript
module.exports = {
    agentParam1: process.env.PARAM1 || "default",
    timeout: 30000,
    dryRun: process.env.NODE_ENV !== 'production',
    
    // Configuration dynamique
    searchQueries: generateQueries(),
    
    // Transformation des données
    transform: (data) => processData(data)
};
```

### Priorité des configurations

1. **Arguments CLI** (priorité maximale)
2. **Fichier de configuration**
3. **Valeurs par défaut** (priorité minimale)

## 🔧 Créer un Agent Testable

### Interface requise

```javascript
class MonAgent {
    constructor(context, logger) {
        this.context = context;
        this.logger = logger;
    }
    
    // Méthode d'exécution (requise)
    async execute() {
        // Logique de l'agent
        return { success: true, itemsProcessed: 42 };
    }
    
    // Configuration (optionnel)
    async configure(config) {
        this.config = config;
    }
    
    // Questions interactives (optionnel)
    getInteractiveQuestions() {
        return [/* questions */];
    }
    
    // Application des réponses interactives (optionnel)
    applyInteractiveAnswers(answers) {
        this.config = { ...this.config, ...answers };
    }
    
    // Nettoyage (optionnel)
    async cleanup() {
        // Libérer les ressources
    }
}
```

### Méthodes d'exécution supportées

L'environnement de test recherche ces méthodes dans l'ordre :
1. `execute()`
2. `run()`
3. `process()`
4. `scrape()`
5. `extract()`

### Exemple complet

Voir `test-environment/agents/test-agent.js` pour un exemple complet d'agent testable.

## 🚨 Gestion des Erreurs

### Types d'erreurs gérées
- **Erreurs d'initialisation** : Agent non trouvé, configuration invalide
- **Erreurs d'exécution** : Timeout, exceptions agent
- **Erreurs de configuration** : Fichiers manquants, format invalide

### Récupération gracieuse
- **Cleanup automatique** : Ressources libérées même en cas d'erreur
- **Logs détaillés** : Stack traces en mode debug
- **Codes de sortie** : Codes d'erreur appropriés pour les scripts

### Debug des erreurs

```bash
# Mode debug pour erreurs détaillées
node test-environment/console-tester.js agent-name --debug

# Timeout plus long pour éviter les timeouts prématurés
node test-environment/console-tester.js agent-name --timeout 120000

# Sauvegarde pour analyse post-mortem
node test-environment/console-tester.js agent-name --output ./debug-output.json
```

## 📊 Analyse des Résultats

### Format de sortie JSON

```json
{
  "agentName": "test-agent",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "duration": 5234,
  "options": { "dryRun": true, "batchSize": 5 },
  "success": true,
  "itemsProcessed": 5,
  "results": [/* résultats de l'agent */]
}
```

### Métriques collectées
- **Durée d'exécution** : Temps total en millisecondes
- **Items traités** : Nombre d'éléments processés
- **Taux de succès** : Ratio succès/échec
- **Logs structurés** : Historique complet des opérations

### Analyse avec des outils externes

```bash
# Analyser les résultats avec jq
cat results.json | jq '.results | length'
cat results.json | jq '.results[] | select(.processed == true)'

# Extraire les métriques
cat results.json | jq '{ duration, itemsProcessed, success }'
```

## 🤝 Intégration CI/CD

### Tests automatisés

```bash
# Script de test pour CI
#!/bin/bash
set -e

# Test de base
node test-environment/console-tester.js test-agent --dry-run --no-color --output ./ci-results.json

# Vérifier le succès
if ! jq -e '.success' ./ci-results.json > /dev/null; then
    echo "Test failed"
    exit 1
fi

echo "Test passed"
```

### Tests de régression

```bash
# Comparer avec résultats de référence
node test-environment/console-tester.js GoogleSearchDateAgent \
  --config baseline-config.json \
  --output current-results.json

# Comparaison des métriques
diff baseline-results.json current-results.json || echo "Results differ"
```

## 🔍 Dépannage

### Problèmes courants

#### Agent non trouvé
```bash
Error: Agent 'MonAgent' not found. Available agents: test-agent, GoogleSearchDateAgent
```
**Solution** : Vérifier le nom de l'agent et qu'il existe dans `apps/agents/src/`

#### Erreur de configuration
```bash
Error: Config file not found: ./config.json
```
**Solution** : Vérifier le chemin du fichier de configuration

#### Timeout
```bash
Error: Agent execution timeout
```
**Solution** : Augmenter le timeout avec `--timeout 60000`

### Debugging avancé

```bash
# Logging maximum
LOG_LEVEL=DEBUG node test-environment/console-tester.js agent-name --debug --verbose

# Test avec agent minimal
node test-environment/console-tester.js test-agent --debug

# Vérification de l'environnement
node -e "console.log(process.version, process.cwd())"
```

## 📚 Ressources

### Fichiers d'exemple
- `test-environment/agents/test-agent.js` - Agent de test simple
- `test-environment/configs/` - Configurations d'exemple
- Logs de test dans `./logs/` (créé automatiquement)

### Extensions possibles
- Support des tests parallèles
- Interface web pour les résultats
- Intégration avec des outils de monitoring
- Génération de rapports automatisés

---

**💡 Tip** : Commencez toujours par tester avec `test-agent` pour valider que l'environnement fonctionne correctement !

**🐛 Bug report** : Pour signaler un problème, utilisez `--debug --output bug-report.json` et partagez le fichier généré.