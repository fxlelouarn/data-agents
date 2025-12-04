# Guide de Configuration et Correction des Tests

**Date** : 1er Décembre 2025  
**Objectif** : Configurer et corriger les tests `proposal-application`

---

## 📋 Vue d'Ensemble

Ce guide documente les 3 étapes pour rendre les tests fonctionnels :

1. ✅ **Configuration des bases de données de test**
2. ✅ **Correction automatique des tests**
3. ⏳ **Correction manuelle des problèmes restants**

---

## Étape 1 : Configuration des Bases de Données de Test

### Fichiers Créés

- `.env.test` : Variables d'environnement pour les tests
- `scripts/setup-test-databases.sh` : Script d'initialisation des BDD

### Exécution

```bash
# 1. Créer les bases de données test
npm run test:setup-db

# Ou manuellement :
./scripts/setup-test-databases.sh
```

**Actions réalisées** :
- ✅ Création de `data_agents_test`
- ✅ Création de `miles_republic_test`
- ✅ Application des migrations data-agents
- ✅ Application du schéma Miles Republic

### Vérification

```bash
# Vérifier que les bases existent
psql -U postgres -l | grep test

# Devrait afficher :
# data_agents_test
# miles_republic_test
```

---

## Étape 2 : Correction Automatique des Tests

### Script Créé

`scripts/fix-tests-auto.js` : Applique les corrections suivantes :

1. **Ajout de `await`** devant `createNewEventProposal()` et `createEditionUpdateProposal()`
2. **Correction des appels** `applyProposal` :
   - `applyProposal(proposal, ...)` → `applyProposal(proposal.id, ...)`
3. **Ajout de l'option** `milesRepublicDatabaseId: 'miles-republic-test'`
4. **Correction des signatures legacy** `applyProposal(proposal as any, {})`

### Exécution

```bash
# Lancer la correction automatique
npm run test:fix-auto

# Ou manuellement :
node scripts/fix-tests-auto.js
```

### Vérification

```bash
# Voir les changements
git diff apps/agents/src/__tests__/proposal-application/

# Résumé attendu :
# ✓ Fichiers analysés : 4
# ✓ Fichiers modifiés : 3-4
```

---

## Étape 3 : Correction Manuelle (si nécessaire)

### Problèmes Résiduels Possibles

#### 3.1 Import de DatabaseManager

**Symptôme** :
```typescript
Cannot find module '@data-agents/agent-framework'
```

**Solution** :
```typescript
// Ajouter en haut du fichier
import { DatabaseManager } from '@data-agents/agent-framework'
```

#### 3.2 Setup/Teardown

**Symptôme** :
```
TypeError: Cannot read properties of undefined
```

**Solution** : Vérifier que chaque fichier de test a :

```typescript
let domainService: ProposalDomainService
let databaseManager: DatabaseManager

beforeEach(async () => {
  await cleanDatabase()
  await cleanMilesRepublicDatabase()
  
  const setup = await setupProposalService()
  domainService = setup.proposalService
  databaseManager = setup.databaseManager
})

afterEach(async () => {
  await cleanupProposalService(databaseManager)
})
```

#### 3.3 Imports des Helpers

**Symptôme** :
```
Cannot find module './helpers'
```

**Solution** : Vérifier que tous les helpers sont exportés dans `helpers/index.ts` :

```typescript
export {
  setupProposalService,
  cleanupProposalService,
  cleanDatabase,
  cleanMilesRepublicDatabase
} from './service-setup'
```

---

## Lancer les Tests

### Tous les tests

```bash
npm run test:proposals
```

### Tests spécifiques

```bash
# NEW_EVENT uniquement
npm run test:proposals:new-event

# EDITION_UPDATE uniquement
npm run test:proposals:edition-update

# Race operations uniquement
npm run test:proposals:races
```

### Mode watch (développement)

```bash
npm run test:proposals:watch
```

### Avec coverage

```bash
npm run test:proposals:coverage
```

---

## Checklist de Validation

### Avant de Commiter

- [ ] ✅ Configuration Jest créée (`jest.config.js`)
- [ ] ✅ Dépendances Jest installées
- [ ] ✅ Bases de données de test créées
- [ ] ✅ Helpers de service créés (`service-setup.ts`)
- [ ] ✅ Fixtures corrigées (async + sauvegarde DB)
- [ ] ✅ Correction automatique exécutée
- [ ] ✅ Tests lancés et passent (au moins partiellement)
- [ ] ✅ Vérification des changements avec `git diff`

### Résultat Attendu

```bash
npm run test:proposals

# Résultat souhaité :
# Test Suites: 4 passed, 4 total
# Tests:       102 passed, 102 total
# Snapshots:   0 total
# Time:        ~20s
```

---

## Dépannage

### Erreur : "Cannot connect to database"

**Cause** : PostgreSQL n'est pas démarré ou les credentials sont incorrects

**Solution** :
```bash
# Démarrer PostgreSQL
brew services start postgresql@14

# Ou sur Linux
sudo systemctl start postgresql

# Vérifier connexion
psql -U postgres -c "SELECT version();"
```

### Erreur : "Prisma Client not generated"

**Cause** : Clients Prisma non générés

**Solution** :
```bash
npm run prisma:generate:all
```

### Erreur : "Tables not found"

**Cause** : Migrations non appliquées

**Solution** :
```bash
npm run test:setup-db
```

### Tests très lents

**Cause** : Pas de parallélisation ou connexions DB multiples

**Solution** : Les tests utilisent `--runInBand` (séquentiel) car ils modifient la DB. C'est normal.

---

## Modifications Réalisées

### Fichiers Créés

```
.env.test
jest.config.js
scripts/setup-test-databases.sh
scripts/fix-tests-auto.js
apps/agents/src/__tests__/proposal-application/helpers/service-setup.ts
docs/TEST-SETUP-GUIDE.md
```

### Fichiers Modifiés

```
package.json (ajout scripts test:setup-db et test:fix-auto)
apps/agents/src/__tests__/proposal-application/helpers/fixtures.ts (async + saveToDb)
apps/agents/src/__tests__/proposal-application/helpers/index.ts (exports service-setup)
apps/agents/src/__tests__/proposal-application/new-event.test.ts (corrections)
apps/agents/src/__tests__/proposal-application/edition-update.test.ts (corrections)
apps/agents/src/__tests__/proposal-application/race-operations.test.ts (corrections)
apps/agents/src/__tests__/proposal-application/advanced.test.ts (corrections)
```

---

## Prochaines Étapes

1. **Lancer le setup des BDD** : `npm run test:setup-db`
2. **Lancer la correction auto** : `npm run test:fix-auto`
3. **Lancer les tests** : `npm run test:proposals`
4. **Corriger manuellement** les erreurs restantes (fichier par fichier)
5. **Documenter** les corrections manuelles dans ce fichier

---

## Ressources

- **README des tests** : `apps/agents/src/__tests__/proposal-application/README.md`
- **Plan de tests** : Warp Drive Notebook `Plan de Tests - Proposal Applications`
- **Service testé** : `packages/database/src/services/proposal-domain.service.ts`
