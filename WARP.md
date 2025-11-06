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

### ⚠️ IMPORTANT - Convention de nommage des modèles Prisma

**Problème fréquent :** Accès incorrect aux modèles Prisma dans le code.

**TOUJOURS utiliser la minuscule pour accéder aux modèles Prisma** :

```typescript
// ❌ INCORRECT - Causera une erreur "Cannot read properties of undefined"
await sourceDb.Event.findMany({ ... })
await sourceDb.Edition.findUnique({ ... })
await sourceDb.Race.findFirst({ ... })

// ✅ CORRECT - Modèles Prisma avec minuscule
await sourceDb.event.findMany({ ... })
await sourceDb.edition.findUnique({ ... })
await sourceDb.race.findFirst({ ... })
```

**Explication :** 
- Dans le schéma Prisma (`miles-republic.prisma`), les modèles sont définis avec majuscule : `model Event { ... }`
- Mais le client Prisma généré expose ces modèles avec **minuscule** : `prismaClient.event`
- Ceci est une convention Prisma standard pour éviter les conflits de nommage

**Fichiers concernés :**
- `apps/agents/src/ffa/matcher.ts` - Matching d'événements FFA
- `apps/agents/src/FFAScraperAgent.ts` - Agent scraper FFA
- `apps/agents/src/GoogleSearchDateAgent.ts` - Agent recherche de dates
- Tout code utilisant `connectToSource()` pour accéder à Miles Republic

### ⚠️ IMPORTANT - Conversion des IDs entre Miles Republic et data-agents

**Problème fréquent :** Erreur de validation Prisma lors de la création de propositions.

**Incompatibilité de types :**
- **Miles Republic** : Les IDs sont de type `Int` (ex: `eventId: 12345`, `editionId: 41175`)
- **data-agents** : Les IDs sont de type `String` (schéma `Proposal`)

**TOUJOURS convertir les IDs en string lors de la création de propositions** :

```typescript
// ❌ INCORRECT - Causera une erreur de validation Prisma
await this.prisma.proposal.findMany({
  where: {
    editionId: matchResult.edition.id,  // Int de Miles Republic
    eventId: matchResult.event.id       // Int de Miles Republic
  }
})

// ✅ CORRECT - Convertir en string
await this.prisma.proposal.findMany({
  where: {
    editionId: matchResult.edition.id.toString(),
    eventId: matchResult.event.id.toString()
  }
})

// ✅ CORRECT - Lors de la création de propositions
proposals.push({
  type: ProposalType.EDITION_UPDATE,
  eventId: matchResult.event!.id.toString(),
  editionId: matchResult.edition.id.toString(),
  changes: filteredChanges,
  justification: enrichedJustifications
})
```

**Explication :**
- Miles Republic utilise des IDs numériques auto-incrémentés (`@id @default(autoincrement())`)
- data-agents utilise des CUIDs (`@id @default(cuid())`)
- Lors du passage des IDs de Miles Republic vers data-agents, une conversion explicite est nécessaire

**Cas particuliers :**
- Les IDs dans `changes` (ex: `raceId` pour mise à jour) peuvent rester en `Int` car ils sont sérialisés en JSON
- Seuls les IDs utilisés comme **filtres Prisma** ou **clés de relation** doivent être convertis

**Fichiers concernés :**
- `apps/agents/src/FFAScraperAgent.ts` - Ligne 771 (requête Prisma), lignes 840-841 (création proposition)
- Tout code créant ou recherchant des propositions avec des IDs de Miles Republic

## Agents

Les agents sont des processus qui :
- Extraient des données depuis des sources externes
- Proposent des modifications aux données
- S'exécutent selon un calendrier défini
- Peuvent être activés/désactivés depuis l'interface d'administration

## Changelog

### 2025-01-05 - Fix ConnectionManager pour multi-schema Prisma

**Problème résolu :** Erreur "Client Prisma non généré" lors de la connexion à Miles Republic.

#### Cause
Le `ConnectionManager` tentait d'importer `@prisma/client` de manière générique, mais dans un monorepo avec plusieurs schémas Prisma :
- Client principal : `packages/database/prisma/schema.prisma` → `node_modules/.prisma/client`
- Client Miles Republic : `apps/agents/prisma/miles-republic.prisma` → `apps/agents/node_modules/@prisma/client`

Node.js ne savait pas quel client charger.

#### Solution

1. **ConnectionManager amélioré** (`packages/agent-framework/src/connection-manager.ts`) :
   - Recherche multi-chemins pour trouver le bon client Prisma
   - Import dynamique avec chemin absolu
   - Messages d'erreur détaillés avec chemins essayés

2. **Scripts NPM optimisés** (`package.json`) :
   ```json
   {
     "postinstall": "npm run prisma:generate:all",
     "prisma:generate:all": "npm run prisma:generate:main && npm run prisma:generate:miles",
     "prisma:generate:main": "cd packages/database && npx prisma generate",
     "prisma:generate:miles": "cd apps/agents && npx prisma generate --schema=prisma/miles-republic.prisma"
   }
   ```

3. **Ordre de génération garanti** :
   - Client principal d'abord (framework)
   - Client Miles Republic ensuite (agents)
   - Build de l'application après

#### Déploiement

Le fichier `DEPLOY.md` documente l'ordre des opérations pour Render :
```bash
npm ci && \
npm run db:migrate:deploy && \
npm run prisma:generate:all && \
npm run build:prod
```

#### Ressources
- `DEPLOY.md` - Guide complet de déploiement
- `docs/PRISMA-MULTI-SCHEMA.md` - Configuration multi-schéma

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
