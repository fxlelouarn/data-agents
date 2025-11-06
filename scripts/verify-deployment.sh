#!/bin/bash
# Script de vérification pré-déploiement pour data-agents
# Usage: ./scripts/verify-deployment.sh

set -e

echo "🔍 Vérification de l'environnement de déploiement..."
echo ""

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction de vérification
check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ $1${NC}"
  else
    echo -e "${RED}❌ $1${NC}"
    exit 1
  fi
}

check_warning() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ $1${NC}"
  else
    echo -e "${YELLOW}⚠️  $1${NC}"
  fi
}

# 1. Vérifier Node.js version
echo "1️⃣  Vérification de Node.js..."
node --version | grep -E "v(18|20|22)" > /dev/null
check "Node.js version >= 18"

# 2. Vérifier que les schémas Prisma existent
echo ""
echo "2️⃣  Vérification des schémas Prisma..."
[ -f "packages/database/prisma/schema.prisma" ]
check "Schéma principal existe"

[ -f "apps/agents/prisma/miles-republic.prisma" ]
check "Schéma Miles Republic existe"

# 3. Vérifier les fichiers de configuration
echo ""
echo "3️⃣  Vérification des fichiers de configuration..."
[ -f "package.json" ]
check "package.json racine existe"

[ -f "turbo.json" ]
check "turbo.json existe"

[ -f "render.yaml" ]
check "render.yaml existe"

[ -f "Dockerfile" ]
check "Dockerfile existe"

# 4. Vérifier que les fichiers sensibles ne sont pas commités
echo ""
echo "4️⃣  Vérification de la sécurité..."
! git ls-files | grep -E "(\.env$|\.env\.local|test-env\.local\.json)" > /dev/null
check "Aucun fichier .env commité"

# 5. Tester la génération des clients Prisma
echo ""
echo "5️⃣  Test de génération des clients Prisma..."
npm run prisma:generate:all > /dev/null 2>&1
check "Génération des clients Prisma réussie"

# 6. Vérifier que les clients sont bien générés
echo ""
echo "6️⃣  Vérification des clients générés..."
[ -f "node_modules/.prisma/client/index.js" ]
check "Client principal généré"

[ -f "apps/agents/node_modules/@prisma/client/index.js" ]
check "Client Miles Republic généré"

# 7. Tester le build
echo ""
echo "7️⃣  Test du build complet..."
echo "   (Cela peut prendre quelques secondes...)"
npm run build:prod > /tmp/build-test.log 2>&1
check "Build complet réussi"

# 8. Vérifier les dossiers dist
echo ""
echo "8️⃣  Vérification des fichiers compilés..."
[ -d "packages/database/dist" ]
check "packages/database/dist existe"

[ -d "packages/agent-framework/dist" ]
check "packages/agent-framework/dist existe"

[ -d "apps/api/dist" ]
check "apps/api/dist existe"

# 9. Vérifier les dépendances critiques
echo ""
echo "9️⃣  Vérification des dépendances..."
[ -d "node_modules/@prisma/client" ]
check "@prisma/client installé"

[ -d "node_modules/turbo" ]
check "turbo installé"

# 10. Vérifier le build command de render.yaml
echo ""
echo "🔟 Vérification de render.yaml..."
grep -q "npm run prisma:generate:all" render.yaml
check "render.yaml contient prisma:generate:all"

grep -q "npm run build:prod" render.yaml
check "render.yaml contient build:prod"

# Résumé
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✨ Vérification terminée avec succès !${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Checklist pour Render :"
echo "   - [ ] Base de données créée"
echo "   - [ ] Variables d'environnement configurées"
echo "   - [ ] Repository Git connecté"
echo "   - [ ] render.yaml présent à la racine"
echo ""
echo "🚀 Vous êtes prêt à déployer sur Render !"
echo ""
