# Règles Warp pour Data Agents

Ce document contient les règles et bonnes pratiques spécifiques au projet Data Agents pour l'assistant Warp.

## ⚠️ CRITIQUE - Dépendances Circulaires Résolues

**État actuel**: ✅ Les dépendances circulaires ont été résolues en créant le package `@data-agents/types`.

```
BEFORE (❌ Circular):
agent-framework → database
database → sample-agents 
sample-agents → agent-framework

AFTER (✅ Resolved):
packages/types/ (no dependencies)
    ↓
    ├── agent-framework (+ lazy load database)
    ├── database
    └── sample-agents
```

**RÈGLES À RESPECTER**:
1. **JAMAIS** importer `DatabaseService` directement dans `agent-framework` au niveau module
2. **TOUJOURS** utiliser `getDatabaseService()` pour le lazy loading au runtime
3. **TOUS** les types partagés doivent être dans `packages/types`
4. Importer types depuis `@data-agents/types`, pas depuis `database`

## Développement

### Serveurs en mode dev
Warp ne doit pas relancer de serveur puisqu'il est déjà lancé en mode dev. Les serveurs reprennent automatiquement et immédiatement tous les changements réalisés dans le code grâce au hot reload.

**Commandes à éviter :**
- `npm run dev` quand le serveur est déjà lancé
- Redémarrage manuel des serveurs de développement

**Comportement attendu :**
- Les modifications du code sont détectées automatiquement
- Les serveurs se rechargent sans intervention manuelle
- Seul un arrêt/redémarrage est nécessaire en cas de modification des variables d'environnement ou des dépendances

## Scripts NPM Courants

### Développement
```bash
npm run dev              # Démarre tous les services en mode watch
npm run dev:api          # Démarre l'API uniquement
npm run dev:dashboard    # Démarre le dashboard uniquement
npm run dev:agents       # Démarre les agents uniquement
```

### Build
```bash
npm run build            # Build tous les packages (respecte les dépendances)
npm run build:prod       # Build pour production
npm run build:types      # Build le package types (rare)
npm run build:database   # Build le package database
npm run build:framework  # Build le package agent-framework
npm run build:agents     # Build les agents
```

### Vérification
```bash
npm run tsc              # Vérifier les types TypeScript (DOIT PASSER)
npm run lint             # Lint tous les packages
npm run test             # Exécuter les tests
```

### Base de Données
```bash
npm run db:generate      # Générer le client Prisma
npm run db:migrate       # Appliquer les migrations
npm run db:studio        # Ouvrir Prisma Studio
npm run db:seed          # Seed la base de données
```

## Architecture du projet

```
data-agents/
├── apps/
│   ├── api/                # API Node.js/Express
│   ├── dashboard/          # Interface de gestion React
│   └── agents/             # Agents d'extraction de données
├── packages/
│   ├── types/              # Types partagés (OBLIGATOIRE)
│   ├── agent-framework/    # Framework pour créer des agents
│   └── database/           # Client Prisma et schéma
```

## Base de données

Le projet utilise PostgreSQL avec Prisma pour :
- Stocker les configurations des agents
- Gérer les connexions aux bases de données externes
- Logging et métriques des agents

## Agents

Les agents sont des processus qui :
- Extraient des données depuis des sources externes
- Proposent des modifications aux données
- S'exécutent selon un calendrier défini
- Peuvent être activés/désactivés depuis l'interface d'administration

## Changelog

### 2025-01-25 - Annulation d'approbation des propositions

**Nouvelle fonctionnalité :** Possibilité d'annuler l'approbation d'une proposition avant son application.

#### Backend
- Nouvel endpoint `POST /api/proposals/:id/unapprove`
  - Vérifie que la proposition est `APPROVED`
  - Vérifie qu'elle n'a pas été appliquée (`status ≠ APPLIED`)
  - Supprime les `ProposalApplication` en attente
  - Remet la proposition au statut `PENDING`

#### Frontend - Dashboard
- **Navigation améliorée**
  - Bouton "Annuler l'approbation" ajouté dans `ProposalNavigation`
  - Visible uniquement pour les propositions `APPROVED`
  - Positionné à droite, à côté du bouton "Archiver"

- **Icônes de statut** dans les vues groupées
  - ✅ Check vert pour `APPROVED`
  - ❌ Croix rouge pour `REJECTED`
  - ⏳ Sablier orange pour `PENDING`
  - 📦 Archive gris pour `ARCHIVED`
  - Label textuel du statut affiché pour chaque proposition

- **Hooks et services**
  - `useUnapproveProposal()` dans `useApi.ts`
  - `proposalsApi.unapprove(id)` dans `api.ts`
  - Gestion des notifications et invalidation du cache

#### Sécurité
- ❌ Impossible d'annuler une approbation déjà appliquée
- ✅ Transaction atomique pour garantir la cohérence
- 📋 Logging complet pour audit

#### Documentation
- Mise à jour de `docs/PROPOSAL-APPLICATION.md`
