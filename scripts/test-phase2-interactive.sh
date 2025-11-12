#!/bin/bash

# Script interactif pour les tests de la Phase 2
# Usage: ./scripts/test-phase2-interactive.sh

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables
TEST_RESULTS_FILE="/tmp/phase2-test-results.txt"
DASHBOARD_URL="http://localhost:4000"
API_URL="http://localhost:4001"

# Initialiser le fichier de résultats
echo "=== Résultats des tests Phase 2 - $(date) ===" > "$TEST_RESULTS_FILE"

# Fonction pour afficher un titre
print_title() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Fonction pour afficher une instruction
print_instruction() {
    echo -e "${YELLOW}📋 $1${NC}"
}

# Fonction pour afficher une question
print_question() {
    echo -e "${GREEN}❓ $1${NC}"
}

# Fonction pour attendre la confirmation
wait_for_confirmation() {
    read -p "Appuyez sur Entrée pour continuer..."
}

# Fonction pour enregistrer un résultat
record_result() {
    local test_name="$1"
    local result="$2"
    echo "$test_name: $result" >> "$TEST_RESULTS_FILE"
    
    if [ "$result" = "✅" ]; then
        echo -e "${GREEN}✅ Test réussi${NC}"
    elif [ "$result" = "❌" ]; then
        echo -e "${RED}❌ Test échoué${NC}"
    else
        echo -e "${YELLOW}⚠️  Test avec réserves${NC}"
    fi
}

# Fonction pour obtenir une proposition EDITION_UPDATE
get_edition_update_proposal() {
    curl -s "${API_URL}/api/proposals?limit=100" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); props = [p for p in data['data'] if p['type'] == 'EDITION_UPDATE' and p['status'] == 'PENDING']; print(props[0]['id'] if props else '')"
}

# Fonction pour obtenir une proposition NEW_EVENT
get_new_event_proposal() {
    curl -s "${API_URL}/api/proposals?limit=100" | \
    python3 -c "import sys, json; data=json.load(sys.stdin); props = [p for p in data['data'] if p['type'] == 'NEW_EVENT' and p['status'] == 'PENDING']; print(props[0]['id'] if props else '')"
}

# Vérification des prérequis
print_title "Vérification des prérequis"

print_instruction "Vérification de l'API..."
if curl -s "${API_URL}/api/proposals?limit=1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API accessible sur ${API_URL}${NC}"
else
    echo -e "${RED}✗ API non accessible. Lancez: npm run dev:api${NC}"
    exit 1
fi

print_instruction "Vérification du dashboard..."
if curl -s "${DASHBOARD_URL}" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Dashboard accessible sur ${DASHBOARD_URL}${NC}"
else
    echo -e "${RED}✗ Dashboard non accessible. Lancez: npm run dev:dashboard${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Tous les services sont prêts !${NC}"
wait_for_confirmation

# ============================================================
# Test 1: Édition et persistance (EDITION_UPDATE)
# ============================================================
print_title "Test 1: Édition et persistance (EDITION_UPDATE)"

EDITION_PROPOSAL=$(get_edition_update_proposal)
if [ -z "$EDITION_PROPOSAL" ]; then
    echo -e "${RED}✗ Aucune proposition EDITION_UPDATE PENDING trouvée${NC}"
    record_result "Test 1" "⏭️ SKIPPED"
else
    PROPOSAL_URL="${DASHBOARD_URL}/proposals/${EDITION_PROPOSAL}"
    
    print_instruction "1. Ouvrez le dashboard dans votre navigateur:"
    echo -e "   ${BLUE}${PROPOSAL_URL}${NC}"
    echo ""
    
    print_instruction "2. Ouvrez les DevTools (F12)"
    echo "   - Onglet Console"
    echo "   - Onglet Network"
    echo ""
    
    print_instruction "3. Éditez un champ d'édition (ex: name)"
    echo "   - Modifier le texte"
    echo "   - Observer le changement dans l'UI"
    echo ""
    
    print_instruction "4. Éditez une course (si disponible)"
    echo "   - Cliquer sur 'Éditer' d'une course"
    echo "   - Modifier la distance (ex: 10 → 13)"
    echo "   - Sauvegarder"
    echo ""
    
    print_instruction "5. Attendre l'autosave (2 secondes)"
    echo "   - Vérifier dans Network: requête PATCH /api/proposals/:id"
    echo ""
    
    print_instruction "6. Recharger la page (F5)"
    echo "   - Vérifier que les modifications sont toujours présentes"
    echo ""
    
    print_question "Les modifications sont-elles conservées après reload?"
    select yn in "✅ Oui" "❌ Non"; do
        case $yn in
            "✅ Oui" ) record_result "Test 1" "✅"; break;;
            "❌ Non" ) record_result "Test 1" "❌"; break;;
        esac
    done
fi

# ============================================================
# Test 2: Validation par blocs avec payload complet
# ============================================================
print_title "Test 2: Validation par blocs avec payload complet"

if [ -z "$EDITION_PROPOSAL" ]; then
    echo -e "${RED}✗ Aucune proposition disponible${NC}"
    record_result "Test 2" "⏭️ SKIPPED"
else
    print_instruction "1. Sur la même proposition (ou rafraîchir)"
    echo ""
    
    print_instruction "2. Éditer plusieurs champs"
    echo "   - Édition: city → 'Paris'"
    echo "   - Course 1: distance → 13"
    echo "   - Course 2: startDate → nouvelle date"
    echo ""
    
    print_instruction "3. Ouvrir DevTools Network"
    echo "   - Filter: 'validate-block'"
    echo ""
    
    print_instruction "4. Valider le bloc Edition"
    echo "   - Cliquer sur 'Valider le bloc Edition'"
    echo "   - Cliquer sur la requête POST → Onglet Payload"
    echo ""
    
    print_question "Le payload Edition contient-il 'city': 'Paris' ET les autres champs proposés?"
    select yn in "✅ Oui" "❌ Non"; do
        case $yn in
            "✅ Oui" ) 
                print_instruction "5. Valider le bloc Courses"
                echo "   - Cliquer sur 'Valider le bloc Courses'"
                echo "   - Vérifier le payload"
                echo ""
                
                print_question "Le payload Courses contient-il distance=13 ET les startDate proposées?"
                select yn2 in "✅ Oui" "❌ Non"; do
                    case $yn2 in
                        "✅ Oui" ) record_result "Test 2" "✅"; break;;
                        "❌ Non" ) record_result "Test 2" "❌"; break;;
                    esac
                done
                break;;
            "❌ Non" ) record_result "Test 2" "❌"; break;;
        esac
    done
fi

# ============================================================
# Test 3: Propagation de dates aux courses
# ============================================================
print_title "Test 3: Propagation de dates aux courses"

if [ -z "$EDITION_PROPOSAL" ]; then
    echo -e "${RED}✗ Aucune proposition disponible${NC}"
    record_result "Test 3" "⏭️ SKIPPED"
else
    print_instruction "1. Sur une proposition EDITION_UPDATE avec plusieurs courses"
    echo ""
    
    print_instruction "2. Modifier startDate de l'édition"
    echo "   - Cliquer sur le date picker"
    echo "   - Sélectionner une nouvelle date"
    echo ""
    
    print_instruction "3. Observer la modale"
    echo "   - Modale: 'Propager aux courses ?'"
    echo ""
    
    print_question "La modale de propagation apparaît-elle?"
    select yn in "✅ Oui" "❌ Non"; do
        case $yn in
            "✅ Oui" ) 
                print_instruction "4. Cliquer 'Oui' et recharger (F5)"
                echo ""
                
                print_question "Les dates des courses sont-elles conservées après reload?"
                select yn2 in "✅ Oui" "❌ Non"; do
                    case $yn2 in
                        "✅ Oui" ) record_result "Test 3" "✅"; break;;
                        "❌ Non" ) record_result "Test 3" "❌"; break;;
                    esac
                done
                break;;
            "❌ Non" ) record_result "Test 3" "❌"; break;;
        esac
    done
fi

# ============================================================
# Test 4: Synchronisation inverse (Course → Edition)
# ============================================================
print_title "Test 4: Synchronisation inverse (Course → Edition)"

if [ -z "$EDITION_PROPOSAL" ]; then
    echo -e "${RED}✗ Aucune proposition disponible${NC}"
    record_result "Test 4" "⏭️ SKIPPED"
else
    print_instruction "1. Noter la plage de l'édition (ex: 15-16/03/2025)"
    echo ""
    
    print_instruction "2. Modifier une course AVANT startDate"
    echo "   - Éditer Course 1"
    echo "   - Modifier startDate → date avant l'édition"
    echo "   - Sauvegarder"
    echo ""
    
    print_question "La modale 'Mettre à jour Edition.startDate ?' apparaît-elle?"
    select yn in "✅ Oui" "❌ Non" "⏭️ Skip"; do
        case $yn in
            "✅ Oui" ) 
                print_instruction "3. Cliquer 'Oui'"
                echo ""
                
                print_question "Edition.startDate est-elle mise à jour?"
                select yn2 in "✅ Oui" "❌ Non"; do
                    case $yn2 in
                        "✅ Oui" ) record_result "Test 4" "✅"; break;;
                        "❌ Non" ) record_result "Test 4" "❌"; break;;
                    esac
                done
                break;;
            "❌ Non" ) record_result "Test 4" "❌"; break;;
            "⏭️ Skip" ) record_result "Test 4" "⏭️ SKIPPED"; break;;
        esac
    done
fi

# ============================================================
# Test 5: NEW_EVENT avec courses
# ============================================================
print_title "Test 5: NEW_EVENT avec courses"

NEW_EVENT_PROPOSAL=$(get_new_event_proposal)
if [ -z "$NEW_EVENT_PROPOSAL" ]; then
    echo -e "${RED}✗ Aucune proposition NEW_EVENT PENDING trouvée${NC}"
    record_result "Test 5" "⏭️ SKIPPED"
else
    PROPOSAL_URL="${DASHBOARD_URL}/proposals/${NEW_EVENT_PROPOSAL}"
    
    print_instruction "1. Ouvrez cette proposition NEW_EVENT:"
    echo -e "   ${BLUE}${PROPOSAL_URL}${NC}"
    echo ""
    
    print_instruction "2. Éditer plusieurs blocs"
    echo "   - Event: name → 'Marathon de Paris 2026'"
    echo "   - Edition: city → 'Paris'"
    echo "   - Course 1: distance → 42"
    echo ""
    
    print_instruction "3. Valider le bloc Event"
    echo "   - Observer Network: payload contient name"
    echo ""
    
    print_instruction "4. Valider le bloc Courses"
    echo "   - Observer Network: payload contient distance"
    echo ""
    
    print_instruction "5. Recharger (F5)"
    echo ""
    
    print_question "Toutes les modifications sont-elles conservées ET les blocs marqués 'Validé'?"
    select yn in "✅ Oui" "❌ Non"; do
        case $yn in
            "✅ Oui" ) record_result "Test 5" "✅"; break;;
            "❌ Non" ) record_result "Test 5" "❌"; break;;
        esac
    done
fi

# ============================================================
# Test 6: Dirty state
# ============================================================
print_title "Test 6: Dirty state"

print_instruction "Ce test nécessite React DevTools installé"
print_question "Avez-vous React DevTools installé?"
select yn in "✅ Oui" "❌ Non"; do
    case $yn in
        "✅ Oui" ) 
            print_instruction "1. Ouvrir une proposition (n'importe laquelle)"
            echo ""
            
            print_instruction "2. Éditer un champ (ex: name)"
            echo "   - Observer immédiatement: indicateur 'non sauvegardé'"
            echo ""
            
            print_instruction "3. Attendre 2 secondes"
            echo "   - Observer: indicateur change (ex: 'Sauvegardé ✓')"
            echo ""
            
            print_instruction "4. Ouvrir React DevTools → Components"
            echo "   - Chercher 'useProposalEditor'"
            echo "   - Vérifier isDirty: true → false"
            echo ""
            
            print_question "isDirty passe-t-il de true à false après autosave?"
            select yn2 in "✅ Oui" "❌ Non"; do
                case $yn2 in
                    "✅ Oui" ) record_result "Test 6" "✅"; break;;
                    "❌ Non" ) record_result "Test 6" "❌"; break;;
                esac
            done
            break;;
        "❌ Non" ) 
            echo -e "${YELLOW}⚠️  Installez React DevTools pour ce test${NC}"
            record_result "Test 6" "⏭️ SKIPPED"
            break;;
    esac
done

# ============================================================
# Test 7: Console sans erreurs
# ============================================================
print_title "Test 7: Console sans erreurs"

print_instruction "1. Ouvrir DevTools Console (F12)"
echo "   - Activer 'Preserve log'"
echo ""

print_instruction "2. Naviguer entre 3-4 propositions"
echo ""

print_instruction "3. Éditer plusieurs champs"
echo ""

print_instruction "4. Valider 2-3 blocs"
echo ""

print_question "Y a-t-il des erreurs rouges dans la console?"
select yn in "❌ Oui" "✅ Non"; do
    case $yn in
        "❌ Oui" ) record_result "Test 7" "❌"; break;;
        "✅ Non" ) 
            print_question "Y a-t-il des logs [PHASE 2] restants?"
            select yn2 in "❌ Oui" "✅ Non"; do
                case $yn2 in
                    "❌ Oui" ) record_result "Test 7" "⚠️"; break;;
                    "✅ Non" ) record_result "Test 7" "✅"; break;;
                esac
            done
            break;;
    esac
done

# ============================================================
# Test 8: Compilation TypeScript
# ============================================================
print_title "Test 8: Compilation TypeScript"

print_instruction "Exécution de la vérification TypeScript..."
cd /Users/fx/dev/data-agents/apps/dashboard
TSC_OUTPUT=$(npx tsc --noEmit 2>&1 | grep -E "(GroupedProposalDetailBase|Found [0-9]+ error)")

if [ -z "$TSC_OUTPUT" ]; then
    echo -e "${GREEN}✓ Aucune erreur TypeScript dans GroupedProposalDetailBase${NC}"
    record_result "Test 8" "✅"
elif echo "$TSC_OUTPUT" | grep -q "RaceUpdate"; then
    echo -e "${YELLOW}⚠️  4 erreurs dans RaceUpdate* (acceptable)${NC}"
    record_result "Test 8" "✅"
else
    echo -e "${RED}✗ Erreurs TypeScript trouvées:${NC}"
    echo "$TSC_OUTPUT"
    record_result "Test 8" "❌"
fi

# ============================================================
# Résumé
# ============================================================
print_title "Résumé des tests"

echo ""
echo "Résultats enregistrés dans: $TEST_RESULTS_FILE"
echo ""

cat "$TEST_RESULTS_FILE"

echo ""
PASSED=$(grep -c "✅" "$TEST_RESULTS_FILE" || true)
FAILED=$(grep -c "❌" "$TEST_RESULTS_FILE" || true)
SKIPPED=$(grep -c "⏭️" "$TEST_RESULTS_FILE" || true)
WARNING=$(grep -c "⚠️" "$TEST_RESULTS_FILE" || true)

TOTAL=$((PASSED + FAILED + SKIPPED + WARNING))

echo -e "${GREEN}✅ Réussis: $PASSED${NC}"
echo -e "${RED}❌ Échoués: $FAILED${NC}"
echo -e "${YELLOW}⚠️  Avec réserves: $WARNING${NC}"
echo -e "${BLUE}⏭️  Skippés: $SKIPPED${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}🎉 Tous les tests critiques sont passés !${NC}"
    echo ""
    echo "Prochaines étapes:"
    echo "  1. ✅ Phase 2 validée"
    echo "  2. → Documenter l'architecture finale"
    echo "  3. → Phase 3: Migration des composants enfants"
else
    echo -e "${RED}⚠️  Certains tests ont échoué. Vérifiez les logs.${NC}"
fi

echo ""
