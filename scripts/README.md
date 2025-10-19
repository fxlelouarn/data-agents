# 📜 Scripts Data Agents

Ce répertoire contient les scripts utilitaires pour le projet data-agents, particulièrement pour l'environnement de test des agents.

## 📁 Contenu

### `test-agent.sh` 🧪
Script principal pour tester les agents avec des raccourcis pratiques.

**Usage de base :**
```bash
./scripts/test-agent.sh <agent-name> [options]
```

**Raccourcis rapides :**
- `quick <agent>` - Test rapide en mode dry-run avec verbose
- `debug <agent>` - Test avec logs debug complets  
- `interactive <agent>` - Mode interactif avec prompts
- `live <agent>` - Exécution en mode live ⚠️

**Exemples :**
```bash
# Test rapide de l'agent de test
./scripts/test-agent.sh quick test-agent

# Debug complet du Google Search Agent
./scripts/test-agent.sh debug GoogleSearchDateAgent

# Mode interactif pour configurer dynamiquement
./scripts/test-agent.sh interactive test-agent

# Test avec configuration personnalisée
./scripts/test-agent.sh test-agent --config test-environment/configs/google-agent.json --verbose

# Test avec sauvegarde des résultats
./scripts/test-agent.sh test-agent --output logs/test-results.json --batch-size 5
```

### `install-test-environment.sh` 🛠️
Script d'installation et de configuration de l'environnement de test.

**Usage :**
```bash
./scripts/install-test-environment.sh
```

**Ce que fait le script :**
- ✅ Vérifie les prérequis (Node.js 18+, npm)
- ✅ Contrôle la structure du projet
- ✅ Crée les répertoires nécessaires (`logs/`, `test-environment/outputs/`)
- ✅ Configure les permissions des scripts
- ✅ Met à jour `.gitignore` pour exclure les logs
- ✅ Teste l'installation avec l'agent de test
- ✅ Affiche un résumé et les prochaines étapes

## 🚀 Installation rapide

Si vous venez de cloner le projet ou voulez configurer l'environnement de test :

```bash
# 1. Installer l'environnement de test
./scripts/install-test-environment.sh

# 2. Test rapide pour vérifier que tout fonctionne
./scripts/test-agent.sh quick test-agent

# 3. Lire la documentation complète
cat test-environment/README.md
```

## 🎯 Cas d'usage courants

### Développement d'un nouvel agent
```bash
# 1. Créer votre agent dans apps/agents/src/MonAgent.ts

# 2. Test initial avec l'agent de test pour valider l'environnement
./scripts/test-agent.sh quick test-agent

# 3. Premier test de votre agent en mode debug
./scripts/test-agent.sh debug MonAgent

# 4. Affinage avec le mode interactif
./scripts/test-agent.sh interactive MonAgent

# 5. Test final en dry-run avant mise en prod
./scripts/test-agent.sh MonAgent --dry-run --verbose --output logs/MonAgent-test.json
```

### Debugging d'un agent existant
```bash
# Test avec logging maximum
./scripts/test-agent.sh debug GoogleSearchDateAgent

# Test avec configuration spécifique
./scripts/test-agent.sh GoogleSearchDateAgent --config test-environment/configs/debug-config.json --debug

# Test avec timeout allongé pour debug
./scripts/test-agent.sh GoogleSearchDateAgent --debug --timeout 120000
```

### Tests automatisés / CI
```bash
# Test non-interactif pour CI
./scripts/test-agent.sh test-agent --dry-run --no-color --output ci-results.json

# Vérification de la réussite du test
if [ $? -eq 0 ]; then
    echo "Tests passed"
else
    echo "Tests failed"
    exit 1
fi
```

## 🔧 Personnalisation

### Ajouter de nouveaux raccourcis

Vous pouvez modifier `test-agent.sh` pour ajouter vos propres raccourcis :

```bash
# Dans test-agent.sh, ajouter dans le case statement :
"mon-raccourci")
    if [ -z "$2" ]; then
        error "Agent name required"
        exit 1
    fi
    mon_test_personalise "$2"
    ;;
```

### Variables d'environnement utiles

```bash
# Niveau de logging global
export LOG_LEVEL=DEBUG

# Désactiver les couleurs
export NO_COLOR=1

# Répertoire de sortie par défaut
export TEST_OUTPUT_DIR=./logs/$(date +%Y%m%d)
```

## 🔒 Sécurité et bonnes pratiques

### Mode dry-run par défaut
- Toujours tester avec `--dry-run` d'abord
- Utiliser le mode `live` uniquement quand nécessaire
- Les raccourcis `quick` et `debug` utilisent automatiquement `--dry-run`

### Gestion des secrets
- Ne jamais committer de configurations contenant des clés API réelles
- Utiliser des variables d'environnement ou des fichiers `.env.local`
- Les configurations d'exemple utilisent des placeholders (`YOUR_API_KEY_HERE`)

### Logs et outputs
- Les logs sont automatiquement exclus de git (`.gitignore`)
- Vérifier le contenu des fichiers de sortie avant de les partager
- Utiliser `--no-color` pour les logs destinés à être analysés par des outils

## 🆘 Dépannage

### Script ne s'exécute pas
```bash
# Vérifier les permissions
ls -la scripts/
chmod +x scripts/*.sh
```

### Agent non trouvé
```bash
# Lister les agents disponibles
find apps/agents/src -name "*.ts" -o -name "*.js" | grep -v test

# Vérifier la structure
./scripts/test-agent.sh
```

### Tests échouent
```bash
# Test avec l'agent minimal d'abord
./scripts/test-agent.sh debug test-agent

# Vérifier les logs détaillés
./scripts/test-agent.sh test-agent --debug --output debug.json
cat debug.json
```

### Problèmes de dépendances
```bash
# Réinstaller l'environnement
./scripts/install-test-environment.sh

# Vérifier Node.js
node -v  # doit être >= 18
npm -v
```

## 📈 Métriques et monitoring

### Collecter des métriques
```bash
# Test avec métriques détaillées
./scripts/test-agent.sh test-agent --verbose --output metrics.json

# Analyser les performances
cat metrics.json | jq '.duration, .itemsProcessed'
```

### Monitoring continu
```bash
# Script de monitoring simple
#!/bin/bash
while true; do
    ./scripts/test-agent.sh quick test-agent > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "$(date): OK"
    else
        echo "$(date): FAIL"
    fi
    sleep 300  # 5 minutes
done
```

## 🤝 Contribution

Pour ajouter de nouveaux scripts :

1. Créer le script dans `scripts/`
2. Le rendre exécutable : `chmod +x scripts/mon-script.sh`
3. Ajouter la documentation dans ce README
4. Tester sur différents environnements
5. Ajouter au script d'installation si nécessaire

---

**💡 Conseil** : Commencez toujours par `./scripts/install-test-environment.sh` sur un nouveau système !

**📚 Plus d'infos** : Consultez `test-environment/README.md` pour la documentation complète de l'environnement de test.