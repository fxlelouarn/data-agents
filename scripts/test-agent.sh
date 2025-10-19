#!/bin/bash

# 🧪 Data Agents Test Environment - Script de raccourci
# Usage: ./scripts/test-agent.sh <agent-name> [options]

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'affichage avec couleurs
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

# Se déplacer vers le répertoire racine du projet
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Vérifier que nous sommes dans le bon répertoire
if [ ! -d "test-environment" ]; then
    error "Erreur: Impossible de trouver le répertoire test-environment"
    error "Répertoire actuel: $(pwd)"
    exit 1
fi

# Fonction d'aide
show_help() {
    echo "🧪 Data Agents Test Environment - Script de raccourci"
    echo ""
    echo "Usage: ./scripts/test-agent.sh <agent-name> [options]"
    echo ""
    echo "Raccourcis rapides:"
    echo "  quick <agent>       Test rapide en mode dry-run avec verbose"
    echo "  debug <agent>       Test avec logs debug complets"
    echo "  interactive <agent> Mode interactif"
    echo "  live <agent>        Exécution en mode live (attention !)"
    echo ""
    echo "Agents disponibles:"
    echo "  test-agent               Agent de test simple"
    echo "  GoogleSearchDateAgent    Agent de recherche Google"
    echo "  ffa-scraper             Scraper FFA"
    echo ""
    echo "Exemples:"
    echo "  ./scripts/test-agent.sh quick test-agent"
    echo "  ./scripts/test-agent.sh debug GoogleSearchDateAgent"
    echo "  ./scripts/test-agent.sh interactive test-agent"
    echo "  ./scripts/test-agent.sh test-agent --config test-environment/configs/google-agent.json --verbose"
    echo ""
    echo "Options complètes:"
    node test-environment/console-tester.js --help
}

# Fonction pour les tests rapides
quick_test() {
    local agent_name="$1"
    info "🚀 Test rapide de l'agent: $agent_name"
    node test-environment/console-tester.js "$agent_name" --dry-run --verbose --batch-size 3
}

# Fonction pour les tests debug
debug_test() {
    local agent_name="$1"
    warning "🔍 Test debug de l'agent: $agent_name (mode verbose complet)"
    node test-environment/console-tester.js "$agent_name" --debug --dry-run --batch-size 3
}

# Fonction pour le mode interactif
interactive_test() {
    local agent_name="$1"
    info "🎯 Test interactif de l'agent: $agent_name"
    node test-environment/console-tester.js "$agent_name" --interactive --verbose
}

# Fonction pour le mode live
live_test() {
    local agent_name="$1"
    warning "⚡ ATTENTION: Test en mode LIVE de l'agent: $agent_name"
    warning "Ce mode peut effectuer de vraies actions !"
    read -p "Êtes-vous sûr de vouloir continuer ? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node test-environment/console-tester.js "$agent_name" --verbose
    else
        info "Test annulé"
    fi
}

# Parse des arguments
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

case "$1" in
    "help"|"-h"|"--help")
        show_help
        ;;
    "quick")
        if [ -z "$2" ]; then
            error "Nom d'agent requis pour le test rapide"
            exit 1
        fi
        quick_test "$2"
        ;;
    "debug")
        if [ -z "$2" ]; then
            error "Nom d'agent requis pour le test debug"
            exit 1
        fi
        debug_test "$2"
        ;;
    "interactive")
        if [ -z "$2" ]; then
            error "Nom d'agent requis pour le mode interactif"
            exit 1
        fi
        interactive_test "$2"
        ;;
    "live")
        if [ -z "$2" ]; then
            error "Nom d'agent requis pour le mode live"
            exit 1
        fi
        live_test "$2"
        ;;
    *)
        # Passer tous les arguments directement à console-tester.js
        info "🧪 Lancement de l'environnement de test avec les arguments: $*"
        node test-environment/console-tester.js "$@"
        ;;
esac

# Afficher le code de sortie
exit_code=$?
if [ $exit_code -eq 0 ]; then
    success "Test terminé avec succès"
else
    error "Test échoué (code: $exit_code)"
fi

exit $exit_code