#!/bin/bash

# 🛠️ Installation de l'environnement de test Data Agents
# Ce script configure tout ce qui est nécessaire pour utiliser l'environnement de test

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Fonctions d'affichage
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

step() {
    echo -e "${CYAN}🔧 $1${NC}"
}

# Se déplacer vers le répertoire racine du projet
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "🧪 Installation de l'environnement de test Data Agents"
echo "====================================================="
echo ""

# 1. Vérifier les prérequis
step "Vérification des prérequis..."

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    error "Node.js n'est pas installé. Veuillez installer Node.js 18+ avant de continuer."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$MAJOR_VERSION" -lt 18 ]; then
    error "Node.js version 18+ requise. Version actuelle: $NODE_VERSION"
    exit 1
fi

success "Node.js version $NODE_VERSION trouvée"

# Vérifier npm
if ! command -v npm &> /dev/null; then
    error "npm n'est pas installé"
    exit 1
fi

success "npm $(npm -v) trouvé"

# 2. Vérifier la structure du projet
step "Vérification de la structure du projet..."

if [ ! -f "package.json" ]; then
    error "Fichier package.json manquant. Êtes-vous dans le bon répertoire ?"
    exit 1
fi

if [ ! -d "test-environment" ]; then
    error "Répertoire test-environment manquant"
    exit 1
fi

success "Structure du projet vérifiée"

# 3. Créer les répertoires nécessaires
step "Création des répertoires nécessaires..."

mkdir -p logs
mkdir -p test-environment/outputs
mkdir -p test-environment/outputs/screenshots
mkdir -p test-environment/outputs/html

success "Répertoires créés"

# 4. Rendre les scripts exécutables
step "Configuration des permissions des scripts..."

chmod +x scripts/test-agent.sh
chmod +x test-environment/console-tester.js

if [ -f "scripts/install-test-environment.sh" ]; then
    chmod +x scripts/install-test-environment.sh
fi

success "Permissions configurées"

# 5. Installer les dépendances supplémentaires si nécessaire
step "Vérification des dépendances..."

# Vérifier si ts-node est disponible (pour les agents TypeScript)
if ! npm list ts-node &> /dev/null && ! npm list -g ts-node &> /dev/null; then
    warning "ts-node non trouvé. Installation recommandée pour les agents TypeScript:"
    warning "npm install -D ts-node"
fi

# 6. Créer un fichier .gitignore pour les logs
step "Configuration de .gitignore..."

if [ ! -f ".gitignore" ]; then
    touch .gitignore
fi

# Ajouter les patterns nécessaires s'ils n'existent pas déjà
grep -qxF "logs/" .gitignore || echo "logs/" >> .gitignore
grep -qxF "test-environment/outputs/" .gitignore || echo "test-environment/outputs/" >> .gitignore
grep -qxF "*.log" .gitignore || echo "*.log" >> .gitignore

success ".gitignore configuré"

# 7. Tester l'installation
step "Test de l'installation..."

echo ""
info "Test de l'environnement de test..."

# Test basique avec l'agent de test
if ./scripts/test-agent.sh quick test-agent > /dev/null 2>&1; then
    success "Test de l'agent de test : OK"
else
    error "Test de l'agent de test : ÉCHEC"
    warning "Vérifiez les logs ci-dessus pour plus de détails"
fi

# 8. Afficher le résumé
echo ""
echo "🎉 Installation terminée !"
echo "========================"
echo ""
success "L'environnement de test Data Agents est installé et prêt à utiliser"
echo ""
info "Utilisation rapide :"
echo "  ./scripts/test-agent.sh quick test-agent"
echo "  ./scripts/test-agent.sh debug GoogleSearchDateAgent"
echo "  ./scripts/test-agent.sh interactive test-agent"
echo ""
info "Documentation complète :"
echo "  - README : test-environment/README.md"
echo "  - Scripts : scripts/README.md"
echo ""
info "Répertoires créés :"
echo "  - logs/                      Logs des tests"
echo "  - test-environment/outputs/  Résultats et captures"
echo ""

# 9. Vérifications optionnelles
step "Vérifications optionnelles..."

# Vérifier si des agents réels existent
if [ -d "apps/agents/src" ]; then
    AGENT_COUNT=$(find apps/agents/src -name "*.ts" -o -name "*.js" | grep -v test | wc -l)
    if [ "$AGENT_COUNT" -gt 0 ]; then
        success "$AGENT_COUNT agents trouvés dans apps/agents/src"
    else
        info "Aucun agent trouvé dans apps/agents/src"
    fi
else
    info "Répertoire apps/agents/src non trouvé (normal pour certaines configurations)"
fi

# Suggérer la prochaine étape
echo ""
warning "Prochaines étapes suggérées :"
echo "1. Testez l'agent de test : ./scripts/test-agent.sh quick test-agent"
echo "2. Lisez la documentation : cat test-environment/README.md"
echo "3. Configurez vos agents dans test-environment/configs/"
echo "4. Testez vos agents avec --dry-run avant le mode live"
echo ""

success "Installation complète ! 🚀"