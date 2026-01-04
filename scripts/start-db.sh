#!/bin/bash
# Script pour démarrer PostgreSQL 17

set -e

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🐘 Démarrage de PostgreSQL 17...${NC}"

# Vérifier si PostgreSQL est déjà en cours d'exécution
if brew services list | grep -q "postgresql@17.*started"; then
    echo -e "${GREEN}✅ PostgreSQL 17 est déjà en cours d'exécution${NC}"
else
    brew services start postgresql@17
    echo -e "${GREEN}✅ PostgreSQL 17 démarré${NC}"
fi

# Attendre que PostgreSQL soit prêt
echo -e "${YELLOW}⏳ Attente de la disponibilité...${NC}"
for i in {1..10}; do
    if pg_isready -q 2>/dev/null; then
        echo -e "${GREEN}✅ PostgreSQL est prêt !${NC}"
        exit 0
    fi
    sleep 1
done

echo -e "${RED}❌ PostgreSQL n'a pas démarré à temps${NC}"
exit 1
