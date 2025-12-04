#!/bin/bash

# Script pour créer et initialiser les bases de données de test
# Usage: ./scripts/setup-test-databases.sh

set -e

echo "🔧 Configuration des bases de données de test..."

# Charger les variables d'environnement de test
export $(cat .env.test | grep -v '^#' | xargs)

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "📋 Bases de données à créer :"
echo "  - data_agents_test"
echo "  - miles_republic_test"
echo ""

# Fonction pour créer une base de données
create_database() {
  local DB_NAME=$1
  echo -e "${YELLOW}Création de la base ${DB_NAME}...${NC}"
  
  # Vérifier si la base existe
  if psql -U "${MILES_REPUBLIC_DATABASE_USER}" -h "${MILES_REPUBLIC_DATABASE_HOST}" -d postgres -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo -e "${GREEN}✓${NC} Base ${DB_NAME} existe déjà"
  else
    # Créer la base
    if psql -U "${MILES_REPUBLIC_DATABASE_USER}" -h "${MILES_REPUBLIC_DATABASE_HOST}" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>&1; then
      echo -e "${GREEN}✓${NC} Base ${DB_NAME} créée"
    else
      echo -e "${RED}✗${NC} Erreur lors de la création de ${DB_NAME}"
      echo -e "${YELLOW}Vérifiez les permissions PostgreSQL pour l'utilisateur ${MILES_REPUBLIC_DATABASE_USER}${NC}"
    fi
  fi
}

# Créer les bases de données
create_database "data_agents_test"
create_database "miles_republic_test"

echo ""
echo "🔄 Application des migrations..."

# Appliquer les migrations pour data-agents
echo -e "${YELLOW}Migrations data-agents...${NC}"
cd packages/database
DATABASE_URL="postgresql://fx@localhost:5432/data_agents_test" npx prisma migrate deploy
cd ../..
echo -e "${GREEN}✓${NC} Migrations data-agents appliquées"

# Appliquer les migrations pour Miles Republic
echo -e "${YELLOW}Migrations Miles Republic...${NC}"
cd apps/agents

# Supprimer temporairement le fichier .env pour éviter qu'il override nos variables
mv prisma/.env prisma/.env.bak 2>/dev/null || true

# Appliquer le schéma avec les bonnes variables d'environnement
MILES_REPUBLIC_DATABASE_URL="${MILES_REPUBLIC_DATABASE_URL}" \
  npx prisma db push --schema=prisma/miles-republic.prisma --skip-generate --accept-data-loss

# Restaurer le fichier .env
mv prisma/.env.bak prisma/.env 2>/dev/null || true

cd ../..
echo -e "${GREEN}✓${NC} Schéma Miles Republic appliqué"

echo ""
echo -e "${GREEN}✅ Bases de données de test configurées avec succès !${NC}"
echo ""
echo "Pour lancer les tests :"
echo "  npm run test:proposals"
