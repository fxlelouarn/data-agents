# Règles Warp pour Data Agents

Ce document contient les règles et bonnes pratiques spécifiques au projet Data Agents pour l'assistant Warp.

## Changelog

### 2025-11-28 - Fix: Updates en double lors de la validation par blocs ✅

**Problème résolu** : Lors de la validation de propositions groupées, plusieurs `ProposalApplication` identiques pouvaient être créées au lieu d'une seule, causant des doublons dans la page `/updates`.

#### Symptômes

- Validation d'un groupe de propositions → Plusieurs updates identiques créées
- Page `/updates` affichait plusieurs lignes pour la même modification
- Problème particulièrement visible lors de la validation complète de tous les blocs

#### Cause

L'endpoint `POST /api/proposals/validate-block-group` ne vérifiait **pas** si des applications PENDING identiques existaient déjà avant d'en créer une nouvelle.

**Comparaison avec autres endpoints** :

| Endpoint | Logique déduplication | Résultat |
|----------|----------------------|----------|
| `PUT /api/proposals/:id` | ✅ Vérifie doublons | Pas de doublons |
| `POST /api/proposals/bulk-approve` | ✅ Vérifie doublons | Pas de doublons |
| `POST /api/proposals/validate-block-group` | ❌ **Aucune vérification** | ⚠️ DOUBLONS |

#### Solution

**Fichier** : `apps/api/src/routes/proposals.ts` (lignes 1073-1162)

**Ajout de déduplication** :

```typescript
if (!existingApp) {
  // ✅ Vérifier si une application PENDING avec changements identiques existe
  const proposalChanges = JSON.stringify(firstProposal.changes)
  const allPendingApplications = await db.prisma.proposalApplication.findMany({
    where: { status: 'PENDING' },
    include: { proposal: true }
  })
  
  const duplicateApp = allPendingApplications.find(app => {
    // Vérifier type et cible (event/edition/race)
    if (app.proposal.type !== firstProposal.type) return false
    if (app.proposal.eventId !== firstProposal.eventId) return false
    if (app.proposal.editionId !== firstProposal.editionId) return false
    if (app.proposal.raceId !== firstProposal.raceId) return false
    
    // Vérifier si changements identiques
    const appChanges = JSON.stringify(app.proposal.changes)
    return appChanges === proposalChanges
  })
  
  if (duplicateApp) {
    // Ne pas créer de nouvelle application
    await db.createLog({ reason: 'duplicate_changes' })
  } else {
    // Créer la nouvelle application
  }
}
```

#### Résultats

**Avant** :
- ❌ Validation groupe A → 1 application créée
- ❌ Validation groupe B (mêmes changements) → 1 application créée (doublon)
- ❌ Page `/updates` : 2 lignes identiques

**Après** :
- ✅ Validation groupe A → 1 application créée
- ✅ Validation groupe B (mêmes changements) → Doublon détecté, aucune application créée
- ✅ Page `/updates` : 1 seule ligne

#### Fichiers modifiés

- Backend : `apps/api/src/routes/proposals.ts` (endpoint `validate-block-group`)

#### Ressources

- Documentation complète : `docs/FIX-DUPLICATE-BLOCK-VALIDATION-UPDATES.md`
- Problème lié : `DUPLICATE_UPDATES_FIX.md` (fix similaire pour autres endpoints)

---

### 2025-11-17 (partie 2) - Système de versioning des agents ✅

**Nouvelle fonctionnalité** : Chaque agent possède maintenant un numéro de version explicit qui est logé à chaque exécution et stocké en base de données.

#### Problème

❌ Impossible de vérifier quelle version du code agent tourne en production  
❌ Doutes lors des déploiements : "Les agents sont-ils vraiment recompilés ?"  
❌ Difficulté à tracer les bugs liés à une version spécifique

#### Solution

Chaque agent exporte une constante de version :

```typescript
// apps/agents/src/FFAScraperAgent.ts
export const FFA_SCRAPER_AGENT_VERSION = '2.3.0'

export class FFAScraperAgent extends BaseAgent {
  constructor(config: any, db?: any, logger?: any) {
    const agentConfig = {
      description: `Agent... (v${FFA_SCRAPER_AGENT_VERSION})`,
      config: {
        version: FFA_SCRAPER_AGENT_VERSION,
        // ...
      }
    }
  }

  async run(context: AgentContext): Promise<AgentRunResult> {
    context.logger.info(`🚀 Démarrage FFA Scraper Agent v${FFA_SCRAPER_AGENT_VERSION}`, {
      version: FFA_SCRAPER_AGENT_VERSION,
      timestamp: new Date().toISOString()
    })
  }
}
```

#### Versions actuelles

| Agent | Version | Fichier |
|-------|---------|----------|
| **FFA Scraper Agent** | `2.3.0` | `apps/agents/src/FFAScraperAgent.ts` |
| **Google Search Date Agent** | `1.1.0` | `apps/agents/src/GoogleSearchDateAgent.ts` |

#### Vérification

**En local** :
```bash
npm run show-versions
# Affiche les versions depuis le code source
```

**En production (logs Render)** :
```
2025-11-17T17:50:00.000Z info: 🚀 Démarrage FFA Scraper Agent v2.3.0
  version: "2.3.0"
  timestamp: "2025-11-17T17:50:00.000Z"
```

**Via l'API** :
```bash
GET /api/agents/:id
# Réponse inclut config.version
```

#### Avantages

✅ **Traçabilité** : Savoir quelle version tourne en production  
✅ **Debugging** : Identifier rapidement si un bug est lié à une version spécifique  
✅ **Confiance** : Vérifier que les changements sont bien déployés  
✅ **Audit** : Historique des versions dans la base de données  
✅ **Communication** : Les logs sont plus informatifs

#### Fichiers modifiés

- `apps/agents/src/FFAScraperAgent.ts` : Ajout `FFA_SCRAPER_AGENT_VERSION = '2.3.0'`
- `apps/agents/src/GoogleSearchDateAgent.ts` : Ajout `GOOGLE_SEARCH_DATE_AGENT_VERSION = '1.1.0'`
- `scripts/show-agent-versions.ts` : Nouveau script d'affichage
- `package.json` : Script `show-versions`

#### Ressources

- Documentation complète : `docs/AGENT-VERSIONING.md`

---

### 2025-11-17 (partie 1) - Fix: Bouton "Valider Event" ne fonctionnait pas pour les propositions EDITION_UPDATE ✅

**Problème résolu** : Le bouton "Valider Event" ne faisait rien lorsqu'on cliquait dessus dans les propositions groupées de type `EDITION_UPDATE`.

#### Symptômes

- Bouton "Valider Event" visible et cliquable (vert)
- Aucune action lors du clic
- Console affichait : `proposalIds: Array(0), proposalCount: 0`

#### Cause

**Condition trop restrictive** dans `GroupedProposalDetailBase.tsx` ligne 878 :

```typescript
// ❌ AVANT (bugé)
if (isNewEvent || proposals[0]?.type === 'EVENT_UPDATE') {
  // Créer le bloc Event
}
// Les propositions EDITION_UPDATE n'étaient PAS incluses
```

**Conséquence** : Le bloc `blockProposals['event']` était créé mais **vide** (`[]`), et `useBlockValidation` retournait immédiatement sans appeler l'API.

**Explication** : Les propositions `EDITION_UPDATE` peuvent **aussi modifier des champs Event** (`name`, `city`, `country`, etc.) en plus des champs Edition. Le scraper FFA propose souvent ces modifications groupées.

#### Solution

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (ligne 878)

```typescript
// ✅ APRÈS (corrigé)
if (isNewEvent || proposals[0]?.type === 'EVENT_UPDATE' || proposals[0]?.type === 'EDITION_UPDATE') {
  const eventProposalIds = proposals
    .filter(p => changes.some(c => 
      isFieldInBlock(c.field, 'event') &&
      c.options.some(o => o.proposalId === p.id)
    ))
    .map(p => p.id)
  
  if (eventProposalIds.length > 0) {
    blocks['event'] = eventProposalIds
  }
}
```

#### Résultats

| Aspect | Avant | Après |
|--------|-------|-------|
| **blockProposals['event']** | `[]` (vide) ❌ | `[id1, id2, id3]` ✅ |
| **Clic sur "Valider Event"** | Rien ne se passe ❌ | Appel API validé ✅ |
| **Validation par blocs** | Impossible ❌ | Fonctionne ✅ |

#### Fichiers modifiés

- Frontend : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (ligne 878)

---

### 2025-11-16 - Fix: Suppressions de nouvelles courses (racesToAdd) non enregistrées ✅

**Problème résolu** : Les suppressions de nouvelles courses (`racesToAdd`) n'étaient pas enregistrées lors de la validation du bloc "Courses".

#### Symptômes

Lorsqu'un utilisateur :
1. Ouvrait une proposition avec des nouvelles courses (`racesToAdd`)
2. Supprimait certaines courses avec le bouton poubelle 🗑️
3. Validait le bloc "Courses"

**Résultat attendu** : Les courses supprimées ne doivent pas être créées lors de l'application de la proposition.

**Résultat observé** : 
- Les courses apparaissaient grisées (UI)
- Mais la suppression **N'ÉTAIT PAS enregistrée** dans `userModifiedChanges`
- Lors de l'application, les courses supprimées étaient quand même créées ❌

#### Cause

**Désalignement frontend ↔ backend** :

- **Le backend attendait** (`proposal-domain.service.ts` ligne 421) :
  ```typescript
  const racesToAddFiltered = (proposal?.userModifiedChanges)?.racesToAddFiltered || []
  // Tableau d'indices des courses SUPPRIMÉES : [0, 1]
  ```

- **Le frontend envoyait** :
  ```typescript
  userModifiedRaceChanges = {
    "new-0": { _deleted: true },  // ❌ Mauvaise structure
    "new-1": { _deleted: true }
  }
  ```

**Résultat** : `racesToAddFiltered` était toujours `[]` → Aucune course filtrée → Toutes les courses créées ❌

#### Solution

**Fichier** : `apps/dashboard/src/hooks/useBlockValidation.ts` (lignes 75-91)

**Ajout** : Construction de `racesToAddFiltered` depuis les clés `new-{index}` marquées `_deleted: true`

```typescript
// Construire racesToAddFiltered depuis userModifiedRaceChanges
const racesToAddFiltered: number[] = []

Object.entries(userModifiedRaceChanges).forEach(([key, mods]: [string, any]) => {
  if (key.startsWith('new-') && mods._deleted === true) {
    const index = parseInt(key.replace('new-', ''))
    if (!isNaN(index)) {
      racesToAddFiltered.push(index)
    }
  }
})

if (racesToAddFiltered.length > 0) {
  changes.racesToAddFiltered = racesToAddFiltered
}
```

#### Résultats

| Aspect | Avant | Après |
|--------|-------|-------|
| **Payload frontend** | `raceEdits: {"new-0": {_deleted: true}}` | `racesToAddFiltered: [0]` ✅ |
| **Backend filtre** | Aucun filtrage ❌ | Courses indexées supprimées ✅ |
| **Résultat application** | Toutes courses créées ❌ | Seulement courses non supprimées ✅ |

#### Fichiers modifiés

- Frontend : `apps/dashboard/src/hooks/useBlockValidation.ts` (lignes 75-91)

#### Ressources

- Documentation : `docs/BUG-RACES-TO-ADD-DELETE.md`

---

### 2025-11-15 - Fix: Synchronisation des clients Prisma dans le monorepo ✅

**Problème résolu** : Erreurs TypeScript et runtime dues à la résolution différente de `@prisma/client` selon les packages.

#### Symptômes

```
error TS2305: Module '"@prisma/client"' has no exported member 'AgentType'.
Error: @prisma/client did not initialize yet. Please run "prisma generate"
```

#### Cause racine

**Résolution de modules différente par package** :
- `packages/database` résout depuis `packages/database/node_modules/@prisma/client`
- `apps/api` et `apps/agents` résolvent depuis `node_modules/@prisma/client` (racine)
- Prisma génère uniquement dans `packages/database/node_modules/`
- **Résultat** : Les apps ne trouvent pas le client généré

#### Solution : Script de synchronisation

**Approche pragmatique** : Laisser Prisma générer dans son emplacement par défaut, puis **copier** les clients vers tous les emplacements où ils sont recherchés.

**Nouveau script** : `scripts/sync-prisma-clients.js`

```javascript
// Copie les clients générés vers la racine
const SOURCES = [
  {
    src: 'packages/database/node_modules/@prisma/client',
    dest: 'node_modules/@prisma/client'
  },
  {
    src: 'packages/database/node_modules/.prisma/client',
    dest: 'node_modules/.prisma/client'
  }
];
```

**Intégration dans package.json** :
```json
{
  "scripts": {
    "prisma:generate:all": "npm run prisma:generate:main && npm run prisma:sync && ...",
    "prisma:sync": "node scripts/sync-prisma-clients.js"
  }
}
```

#### Résultats

| Aspect | Avant | Après |
|--------|-------|-------|
| **Génération** | `packages/database/node_modules/` uniquement | Génération + copie vers racine ✅ |
| **Résolution packages/database** | `packages/database/node_modules/` | Fonctionne ✅ |
| **Résolution apps/*" | `node_modules/` (vide) ❌ | `node_modules/` (copié) ✅ |
| **Build TypeScript** | Échoue | Passe ✅ |
| **Runtime Render** | Échoue | Passe ✅ |

#### Fichiers modifiés

- `scripts/sync-prisma-clients.js` : Nouveau script de synchronisation
- `package.json` : Ajout commande `prisma:sync`
- `packages/database/prisma/schema.prisma` : Pas de directive `output` (défaut Prisma)

#### Pourquoi cette approche ?

1. **Réaliste** : Respecte la résolution native de Node.js
2. **Robuste** : Fonctionne avec npm workspaces sans configuration spéciale
3. **Testable** : Identique en local et sur Render
4. **Maintenable** : Script simple et explicite

#### Ressources

- Script : `scripts/sync-prisma-clients.js`
- Documentation Prisma : [Multiple Prisma Clients](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/use-custom-model-and-field-names#using-multiple-prisma-clients)

---

### 2025-11-14 (partie 4) - Fix: Statut APPROVED quand tous les blocs validés ✅

**Problème résolu** : Les propositions groupées restaient au statut `PENDING` avec le bouton "Tout valider (blocs)" visible même après validation de tous les blocs.

#### Symptômes

- ❌ **Badge "En attente"** affiché alors que tous les blocs sont validés
- ❌ **Bouton "Tout valider (blocs)"** visible alors qu'il n'y a plus rien à valider
- ❌ **Statut `PENDING`** dans la base malgré `approvedBlocks` complets

#### Cause

**Backend** : L'algorithme vérifiait **tous les blocs possibles** `['event', 'edition', 'organizer', 'races']` au lieu de vérifier uniquement les **blocs existants** pour cette proposition.

```typescript
// ❌ AVANT (bugué)
const allBlocks = ['event', 'edition', 'organizer', 'races']
const allBlocksValidated = allBlocks.every(b => approvedBlocksObj[b] === true)
// Une proposition EDITION_UPDATE n'a pas de bloc 'event' → toujours false
```

**Frontend** : Le bouton ne vérifiait pas si tous les blocs étaient déjà validés.

#### Solution

**Backend** : Vérifier uniquement les blocs existants

```typescript
// ✅ APRÈS (corrigé)
const existingBlocks = Object.keys(approvedBlocksObj)
const allBlocksValidated = existingBlocks.length > 0 && 
  existingBlocks.every(blockKey => approvedBlocksObj[blockKey] === true)
```

**Frontend** : Cacher le bouton quand tous validés

```typescript
showValidateAllBlocksButton={hasPending && !isEventDead && 
  Object.keys(blockProposals).length > 0 && !allBlocksValidated}
```

#### Résultats

| Blocs validés | Status DB | Badge UI | Bouton "Tout valider" |
|---------------|-----------|----------|-----------------------|
| Avant : `edition`, `organizer`, `races` | `PENDING` ❌ | "En attente" ❌ | Visible ❌ |
| Après : `edition`, `organizer`, `races` | `APPROVED` ✅ | "Traité" ✅ | Caché ✅ |

#### Fichiers modifiés

- Backend : `apps/api/src/routes/proposals.ts` (lignes 728-736)
- Frontend : `apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx` (ligne 1022)

#### Ressources

- Documentation : `docs/FIX-APPROVED-STATUS-ALL-BLOCKS.md`

---

### 2025-11-14 (partie 3) - Single Group Application ✅

**Problème résolu** : Lors de la validation par blocs de propositions groupées, chaque proposition créait sa propre `ProposalApplication`, causant des modifications dupliquées dans Miles Republic.

#### Symptomômes

- **Validation de 3 propositions** → **3 ProposalApplication** créées
- **Application** → **3 mises à jour identiques** dans Miles Republic ❌
- Logs backend montrant 3 exécutions de `applyProposal()`
- Risque d'écrasement mutuel et d'incohérence

#### Solution

Nouveau workflow **Single Group Application** :

1. **Endpoint groupé** : `POST /api/proposals/validate-block-group`
   - Reçoit `proposalIds[]` + `block` + `changes`
   - Met à jour TOUTES les propositions avec le même payload
   - Crée UNE SEULE `ProposalApplication` quand tous les blocs validés

2. **Frontend refactoré** : `useBlockValidation`
   - Appelle `validateBlockGroup()` avec tous les IDs à la fois
   - Payload consolidé (modifications utilisateur + sélections agent)
   - **1 appel API** au lieu de N appels

3. **Backend intelligent** : Détection mode groupé
   - `ProposalApplication.proposalIds[]` : Tous les IDs du groupe
   - Passage de `proposalIds` aux options d'application
   - `ProposalDomainService` log : 📦 MODE GROUPÉ détecté
   - Une seule exécution de la logique d'application

#### Modifications

**Schéma Prisma :**
```prisma
model ProposalApplication {
  proposalIds  String[]  @default([])  // ✅ Nouveau champ
}
```

**Backend :**
- `apps/api/src/routes/proposals.ts` : Endpoint `/validate-block-group`
- `apps/api/src/routes/updates.ts` : Passage `proposalIds` à `applyProposal()`
- `packages/database/src/services/proposal-domain.service.ts` : Détection mode groupé
- `packages/database/src/services/interfaces.ts` : `ApplyOptions.proposalIds`

**Frontend :**
- `apps/dashboard/src/hooks/useBlockValidation.ts` : Refactoring pour appel groupé
- `apps/dashboard/src/hooks/useApi.ts` : `useUpdateProposal` mode groupé
- `apps/dashboard/src/services/api.ts` : Méthode `validateBlockGroup()`

#### Résultats

| Aspect | Avant | Après |
|--------|-------|-------|
| **Applications créées** | N (une par proposition) | **1** (✅ une pour le groupe) |
| **Appels API (validation)** | N × 4 blocs | **4** (1 par bloc) |
| **Mises à jour DB** | N × 1 | **1** (✅ une seule) |
| **Logs clairs** | ❌ Confusion | ✅ 📦 MODE GROUPÉ |
| **Duplication** | ❌ Risque élevé | ✅ Zéro |

#### Ressources

- Spécification : `docs/SPEC-SINGLE-GROUP-APPLICATION.md`
- Plan de tests : `docs/TEST-SINGLE-GROUP-APPLICATION.md`
- Migration Prisma : `packages/database/prisma/migrations/20251114140354_add_proposal_ids_to_application/`

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

### Dépendance circulaire database ↔ agent-framework

**Problème** (2025-11-14) : `database` a besoin d'importer `agent-framework` dynamiquement dans `ConnectionService.testConnection()` pour utiliser `DatabaseManager`.

**Solution appliquée** :
1. **Import dynamique avec `@ts-ignore`** dans `packages/database/src/services/ConnectionService.ts` (ligne 196)
   ```typescript
   // @ts-ignore - Lazy loading au runtime pour éviter cycle database <-> agent-framework
   const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
   ```

2. **PAS de dépendance dans package.json** : `agent-framework` n'est pas listé dans les dependencies/devDependencies de `database`

3. **Ordre de build garanti par Turbo** : `dependsOn: ["^build"]` assure que `agent-framework` est buildé avant `database`

4. **Pas de `composite: true`** dans les tsconfig.json : Cette option empêchait la génération des fichiers `.d.ts` nécessaires

**RÈGLES À RESPECTER**:
1. **JAMAIS** ajouter `agent-framework` dans les dependencies de `database`
2. **TOUJOURS** utiliser l'import dynamique avec `@ts-ignore` pour éviter l'erreur TypeScript au build
3. **TOUS** les types partagés doivent être dans `packages/types`
4. Importer types depuis `@data-agents/types`, pas depuis `database` ou `agent-framework`
5. **JAMAIS** utiliser `composite: true` dans les tsconfig - cela casse la génération des `.d.ts`

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

**⚠️ Note importante sur l'ordre de build** :
- Turbo gère automatiquement l'ordre via `dependsOn: ["^build"]` dans `turbo.json`
- `agent-framework` est toujours buildé avant `database` grâce à cette configuration
- En cas d'erreur de build, vérifier que `packages/agent-framework/dist/types.d.ts` existe
- Si le fichier `.d.ts` manque, supprimer `composite: true` des tsconfig si présent

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

## Performance

### Optimisation API : Enrichissement des Propositions

**Problème** : L'API enrichit chaque proposition avec des données de Miles Republic (nom d'événement, ville, etc.). Avec beaucoup de propositions, cela peut être lent.

**Configuration actuelle** (`apps/api/src/routes/proposals.ts` ligne 164) :
```typescript
const enrichLimit = pLimit(process.env.NODE_ENV === 'production' ? 10 : 20)
```

**Impact sur les performances** :
- **Dev local (pLimit 20)** : 20 propositions en ~1s, 100 propositions en ~5s
- **Production (pLimit 10)** : Plus conservateur pour éviter "too many clients" PostgreSQL

**Si c'est trop lent en dev** :
1. Augmenter la limite : `pLimit(30)` ou `pLimit(50)`
2. Vérifier `max_connections` de votre PostgreSQL local
3. En production, garder une limite basse (10-20) selon la config du serveur

**Amélioration future** : Cacher `eventName`, `eventCity`, etc. directement dans la table `Proposal` lors de la création (nécessite migration Prisma).

## Stack technique

### Backend
- **Runtime** : Node.js v22
- **Framework API** : Express.js
- **Language** : TypeScript
- **ORM** : Prisma (avec support multi-schémas)
- **Base de données** : PostgreSQL
- **Build tool** : npm workspaces + TypeScript compiler

### Frontend (Dashboard)
- **Framework** : React 18 avec Vite
- **UI Library** : Material-UI (MUI) v5
  - Composants : `Card`, `Button`, `Chip`, `Typography`, `Box`, etc.
  - Icônes : `@mui/icons-material`
  - Thème personnalisé avec système de couleurs
- **Routing** : React Router v6
- **State Management** : 
  - React Query (TanStack Query) pour le cache serveur
  - React hooks pour l'état local
- **Forms & Validation** : React Hook Form + Yup
- **Notifications** : notistack (snackbar)
- **Date manipulation** : date-fns (avec timezone support via date-fns-tz)

### Agents
- **Runtime** : Node.js v22
- **Language** : TypeScript
- **Framework** : Agent-framework custom (`@data-agents/agent-framework`)
- **Scraping** : Cheerio pour le parsing HTML
- **Fuzzy matching** : fuse.js pour l'algorithme de matching
- **HTTP Client** : node-fetch

### Infrastructure
- **Déploiement** : Render.com
- **CI/CD** : GitHub Actions (potentiel)
- **Monitoring** : Logs via Winston/Pino

### Outils de développement
- **Package manager** : npm (workspaces natifs)
- **Linting** : ESLint
- **Formatting** : Prettier
- **Testing** : Jest + React Testing Library

### ⚠️ IMPORTANT - Conventions UI

**Le projet utilise Material-UI (MUI), PAS Shadcn UI ni lucide-react**

- ❌ Ne pas utiliser : `lucide-react`, `@shadcn/ui`, Tailwind classes
- ✅ Utiliser : `@mui/material`, `@mui/icons-material`, `sx` props

**Exemple de composant correct** :
```tsx
import { Card, CardContent, Typography, Button, Chip } from '@mui/material'
import { CheckCircle as CheckCircleIcon } from '@mui/icons-material'

function MyComponent() {
  return (
    <Card sx={{ mb: 2, p: 2 }}>
      <CardContent>
        <Typography variant="h6">Titre</Typography>
        <Button variant="contained" startIcon={<CheckCircleIcon />}>
          Action
        </Button>
        <Chip label="Badge" color="primary" size="small" />
      </CardContent>
    </Card>
  )
}
```

## Architecture du projet

```
data-agents/
├── apps/
│   ├── api/                # API Node.js/Express
│   ├── dashboard/          # Interface de gestion React + MUI
│   └── agents/             # Agents d'extraction de données
│       ├── src/ffa/        # Agent FFA avec algorithme de matching
│       │   └── MATCHING.md # Documentation de l'algorithme de matching
│       └── prisma/         # Schéma Miles Republic
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

### ⚠️ IMPORTANT - Vérification des données en base

**JAMAIS utiliser Prisma Studio pour vérifier des données en base de données.**

**Variables d'environnement pour les connexions** :
- `DATABASE_URL` : Base de données data-agents (propositions, agents, etc.)
- `MILES_REPUBLIC_DATABASE_URL` : Base de données Miles Republic (Events, Editions, Races)

**Pour vérifier un Event, Edition ou Race dans Miles Republic** :
- **TOUJOURS** faire des requêtes SQL directement en base de données
- Utiliser `psql "$MILES_REPUBLIC_DATABASE_URL" -c "..."`
- Consulter la documentation des schémas : [Miles Republic Schema](https://app.warp.dev/drive/notebook/Next-ke4tc02CYq8nPyEgErILtF)

**Exemples de requêtes SQL Miles Republic** :
```bash
# Chercher un événement par nom
psql "$MILES_REPUBLIC_DATABASE_URL" -c "SELECT * FROM \"Event\" WHERE name ILIKE '%Trail des Loups%';"

# Chercher une édition spécifique
psql "$MILES_REPUBLIC_DATABASE_URL" -c "SELECT * FROM \"Edition\" WHERE \"eventId\" = 13446 AND year = 2025;"

# Chercher les courses d'une édition
psql "$MILES_REPUBLIC_DATABASE_URL" -c "SELECT * FROM \"Race\" WHERE \"editionId\" = 40098;"

# Jointure complète
psql "$MILES_REPUBLIC_DATABASE_URL" -c "SELECT 
  e.id as event_id, 
  e.name as event_name,
  ed.id as edition_id,
  ed.year,
  r.id as race_id,
  r.name as race_name
FROM \"Event\" e
LEFT JOIN \"Edition\" ed ON e.id = ed.\"eventId\"
LEFT JOIN \"Race\" r ON ed.id = r.\"editionId\"
WHERE e.name ILIKE '%Trail des Loups%';"
```

**Raisons** :
- Prisma Studio est trop lent pour les grandes tables
- SQL offre plus de flexibilité pour les recherches complexes
- Évite les erreurs de typage/casse dans Prisma Studio
- Permet de faire des analyses directement (COUNT, GROUP BY, etc.)

### Schéma data-agents

**Base de données principale** : Stocke les agents, propositions et configurations.

**Tables principales** :

```sql
-- Agents configurés
agents (
  id TEXT PRIMARY KEY (CUID),
  name TEXT UNIQUE,
  type TEXT, -- EXTRACTOR, COMPARATOR, etc.
  isActive BOOLEAN,
  frequency TEXT,
  config JSONB
)

-- Propositions de modifications
proposals (
  id TEXT PRIMARY KEY (CUID),
  agentId TEXT REFERENCES agents(id),
  type TEXT, -- NEW_EVENT, EVENT_UPDATE, EDITION_UPDATE, RACE_UPDATE
  status TEXT, -- PENDING, APPROVED, REJECTED, ARCHIVED
  eventId TEXT, -- ID Miles Republic (converti en string)
  editionId TEXT, -- ID Miles Republic (converti en string)
  raceId TEXT,
  changes JSONB, -- Modifications proposées
  justification JSONB,
  confidence FLOAT,
  userModifiedChanges JSONB, -- Modifications manuelles
  approvedBlocks JSONB, -- Blocs approuvés séparément
  eventName TEXT, -- Cache pour affichage
  eventCity TEXT,
  editionYear INT,
  createdAt TIMESTAMP,
  reviewedAt TIMESTAMP
)

-- Applications de propositions
proposal_applications (
  id TEXT PRIMARY KEY (CUID),
  proposalId TEXT REFERENCES proposals(id),
  status TEXT, -- PENDING, APPLIED, FAILED
  scheduledAt TIMESTAMP,
  appliedAt TIMESTAMP,
  errorMessage TEXT,
  appliedChanges JSONB,
  rollbackData JSONB
)

-- État d'avancement des agents
agent_states (
  id TEXT PRIMARY KEY (CUID),
  agentId TEXT REFERENCES agents(id),
  key TEXT,
  value JSONB, -- Ex: { currentLigue: 'BFC', currentMonth: '2025-11' }
  UNIQUE(agentId, key)
)
```

**Exemples de requêtes data-agents** :

```bash
# Trouver une proposition par ID
psql "$DATABASE_URL" -c "SELECT * FROM proposals WHERE id = 'cmhstf28403tjmu3ref0q3nbz';"

# Propositions NEW_EVENT avec confiance basse
psql "$DATABASE_URL" -c "SELECT id, \"eventName\", confidence, changes->>'matchScore' as match_score
FROM proposals
WHERE type = 'NEW_EVENT' AND confidence < 0.5
ORDER BY confidence ASC;"

# Voir les métadonnées de matching d'une proposition
psql "$DATABASE_URL" -c "SELECT 
  id,
  \"eventName\",
  confidence,
  changes,
  justification
FROM proposals
WHERE id = 'cmhstf28403tjmu3ref0q3nbz';"

# État d'avancement du FFA scraper
psql "$DATABASE_URL" -c "SELECT 
  a.name,
  s.value->>'currentLigue' as ligue,
  s.value->>'currentMonth' as mois,
  s.\"updatedAt\"
FROM agents a
JOIN agent_states s ON a.id = s.\"agentId\"
WHERE a.name = 'FFA Scraper' AND s.key = 'progress';"

# Propositions par agent et statut
psql "$DATABASE_URL" -c "SELECT 
  a.name as agent,
  p.status,
  COUNT(*) as count
FROM proposals p
JOIN agents a ON p.\"agentId\" = a.id
GROUP BY a.name, p.status
ORDER BY a.name, p.status;"
```

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

### ⚠️ IMPORTANT - Catégorisation des courses (Race)

**Champs dépréciés** : `type` et `distance` (enum `RaceType` et `RaceDistance`)

**✅ Champs à utiliser** : `categoryLevel1` et `categoryLevel2`

#### categoryLevel1 (Catégorie principale)

Valeurs possibles :
- `RUNNING` - Course à pied
- `TRAIL` - Trail / Course nature
- `WALK` - Marche
- `CYCLING` - Cyclisme
- `TRIATHLON` - Triathlon
- `FUN` - Course fun / obstacles
- `OTHER` - Autre

#### categoryLevel2 (Sous-catégorie)

Valeurs dépendant de `categoryLevel1` :

**RUNNING** :
- `MARATHON` - Marathon (42.195 km)
- `HALF_MARATHON` - Semi-marathon (21.1 km)
- `KM10` - 10 km
- `KM5` - 5 km
- `LESS_THAN_5_KM` - Moins de 5 km
- `ULTRA_RUNNING` - Ultra (> 42 km)
- `CROSS` - Cross-country
- `VERTICAL_KILOMETER` - Kilomètre vertical
- `EKIDEN` - Ekiden (relais)

**TRAIL** :
- `ULTRA_TRAIL` - Ultra trail (> 42 km)
- `LONG_TRAIL` - Trail long (20-42 km)
- `SHORT_TRAIL` - Trail court (< 20 km)
- `DISCOVERY_TRAIL` - Trail découverte
- `VERTICAL_KILOMETER` - Kilomètre vertical

**WALK** :
- `NORDIC_WALK` - Marche nordique
- `HIKING` - Randonnée

**CYCLING** :
- `XC_MOUNTAIN_BIKE` - VTT cross-country
- `ENDURO_MOUNTAIN_BIKE` - VTT enduro
- `GRAVEL_RACE` - Gravel
- `ROAD_CYCLING_TOUR` - Route
- `TIME_TRIAL` - Contre-la-montre
- `GRAN_FONDO` - Gran Fondo
- `ULTRA_CYCLING` - Ultra cyclisme

**Exemple de requête SQL** :
```bash
# Chercher toutes les courses d'un type
psql "$MILES_REPUBLIC_DATABASE_URL" -c "SELECT id, name, \"categoryLevel1\", \"categoryLevel2\" FROM \"Race\" WHERE \"categoryLevel1\" = 'TRAIL' AND \"categoryLevel2\" = 'ULTRA_TRAIL' LIMIT 10;"
```

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

## Dashboard - Interfaces de propositions

### ⚠️ RÈGLE CRITIQUE - Cohérence entre propositions simples et groupées

**Lors de toute modification des interfaces visuelles de propositions, TOUJOURS vérifier que le changement est appliqué partout :**

#### Structure des composants

```
apps/dashboard/src/pages/proposals/detail/
├── base/
│   ├── ProposalDetailBase.tsx         # Logique propositions SIMPLES
│   └── GroupedProposalDetailBase.tsx  # Logique propositions GROUPÉES
├── new-event/
│   ├── NewEventDetail.tsx             # Vue NEW_EVENT simple
│   └── NewEventGroupedDetail.tsx      # Vue NEW_EVENT groupée ⚠️
├── edition-update/
│   ├── EditionUpdateDetail.tsx        # Vue EDITION_UPDATE simple
│   └── EditionUpdateGroupedDetail.tsx # Vue EDITION_UPDATE groupée ⚠️
├── event-update/
│   ├── EventUpdateDetail.tsx          # Vue EVENT_UPDATE simple
│   └── EventUpdateGroupedDetail.tsx   # Vue EVENT_UPDATE groupée ⚠️
└── race-update/
    ├── RaceUpdateDetail.tsx           # Vue RACE_UPDATE simple
    └── RaceUpdateGroupedDetail.tsx    # Vue RACE_UPDATE groupée ⚠️
```

#### Checklist obligatoire

Avant de considérer une modification comme terminée, vérifier **TOUS** les points suivants :

- [ ] ✅ Le changement est appliqué dans `ProposalDetailBase.tsx` ET `GroupedProposalDetailBase.tsx`
- [ ] ✅ Le changement est appliqué dans TOUTES les vues simples (`*Detail.tsx`)
- [ ] ✅ Le changement est appliqué dans TOUTES les vues groupées (`*GroupedDetail.tsx`)
- [ ] ✅ Les props passées aux composants enfants sont identiques (ex: validation par blocs)
- [ ] ✅ Tests manuels effectués pour au moins :
  - Une proposition NEW_EVENT groupée
  - Une proposition EDITION_UPDATE groupée
  - Une proposition simple de chaque type

#### Exemple de bug typique

**Symptôme** : Un bouton de validation apparaît dans les propositions simples mais pas dans les propositions groupées.

**Cause** : Les props de validation par blocs ont été ajoutées uniquement dans `NewEventDetail.tsx` mais oubliées dans `NewEventGroupedDetail.tsx`.

**Solution** : Toujours vérifier les **2 versions** (simple + groupée) pour chaque type de proposition.

#### Composants partagés à surveiller

Ces composants sont utilisés dans plusieurs vues - toute modification doit être testée partout :

- `CategorizedEventChangesTable` - Infos événement
- `CategorizedEditionChangesTable` - Infos édition
- `RacesChangesTable` - Courses
- `OrganizerSection` - Organisateur

#### Documentation

- `docs/BLOCK-SEPARATION-EVENT-EDITION.md` - Séparation des blocs
- `docs/BLOCK-SEPARATION-SUMMARY.md` - Résumé modifications récentes
- `docs/PROPOSAL-UI-COMMON-PITFALLS.md` - Guide des pièges courants et checklist complète

### 📋 Refactoring : Gestion de l'état des propositions

**État actuel** (2025-11-12) : ✅ PHASE 2 COMPLÈTE 🎉

#### Contexte

Le projet est en cours de migration vers un système de gestion d'état unifié basé sur le hook `useProposalEditor`, qui remplace l'ancien système dispersé (`selectedChanges`, `userModifiedChanges`, `userModifiedRaceChanges`, etc.).

#### État de la migration

| Composant | Statut | Hook utilisé | Prochaine action |
|-----------|--------|--------------|------------------|
| `GroupedProposalDetailBase` | ✅ Migré | `useProposalEditor` (mode groupé) | Nettoyage (PHASE 3) |
| `ProposalDetailBase` | ✅ Migré | `useProposalEditor` (mode simple) | Nettoyage (PHASE 3) |

#### Architecture cible : Single Source of Truth

**Avant** (ancien système - bugué) :
```typescript
// ❌ 4 sources de vérité différentes
const [selectedChanges, setSelectedChanges] = useState({})
const [userModifiedChanges, setUserModifiedChanges] = useState({})
const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState({})
const { consolidateChanges } = useProposalLogic()

// Problème : Désynchronisation entre ces états
```

**Après** (nouveau système - PHASE 2) :
```typescript
// ✅ Une seule source de vérité
const {
  workingProposal,      // Mode simple
  // OU
  workingGroup,         // Mode groupé
  updateField,
  updateRace,
  validateBlock,
  save
} = useProposalEditor(proposalId, { autosave: true })

// Avantages : Pas de désynchronisation possible
```

#### Bénéfices obtenus (GroupedProposalDetailBase)

✅ **Plus de perte de modifications** : État consolidé unique  
✅ **Sauvegarde automatique** : Autosave activé (debounced 2s)  
✅ **Payload complet** : Toutes les modifications incluses lors de la validation  
✅ **Code simplifié** : -150 lignes de logique manuelle  

#### Documentation

- **État actuel complet** : `docs/proposal-state-refactor/STATUS-2025-11-12.md`
- **Plan de migration ProposalDetailBase** : `docs/proposal-state-refactor/PHASE2-PROPOSAL-DETAIL-BASE.md`
- **Plan global** : `docs/proposal-state-refactor/PLAN-PROPOSAL-STATE-REFACTOR.md`
- **Archive migrations passées** : `docs/proposal-state-refactor/archive/`

#### Règles lors de modifications

⚠️ **Si vous modifiez `GroupedProposalDetailBase`** :
- ✅ **Single Source of Truth** : `workingGroup` est l'unique source de vérité
- ✅ Utiliser `updateField()`, `updateRace()` au lieu de `setState` manuels
- ✅ Ne PAS appeler `save()` manuellement après chaque modification (autosave actif)
- ✅ Lire les valeurs depuis `workingGroup.consolidatedChanges[i].selectedValue`
- ✅ Plus aucun état local redondant (`selectedChanges` supprimé)

⚠️ **Si vous modifiez `ProposalDetailBase`** :
- ✅ **Vue lecture seule uniquement** (édition désactivée)
- ✅ Pour éditer, rediriger vers `GroupedProposalDetailBase`
- ✅ Utiliser le bouton "✏️ Éditer cette proposition"

## Agents

Les agents sont des processus qui :
- Extraient des données depuis des sources externes
- Proposent des modifications aux données
- S'exécutent selon un calendrier défini
- Peuvent être activés/désactivés depuis l'interface d'administration

### Agent FFA

L'agent FFA scrape les compétitions depuis le site de la Fédération Française d'Athlétisme et utilise un **algorithme de matching avancé** pour les associer aux événements existants dans Miles Republic.

**Documentation complète** : `apps/agents/src/ffa/MATCHING.md`

**Points clés** :
- **2 passes SQL** : Même département + Nom, puis Nom OU Ville (tous départements)
- **Fuzzy matching** : fuse.js avec scoring pondéré (50% nom, 30% ville, 20% keywords)
- **Bonus département** : +15% si même département mais villes différentes (v2.1)
- **Proximité temporelle** : Fenêtre ±90 jours avec pénalité 70-100% selon écart de date (v2.1)
- **Gestion des villes différentes** : Trouve "Diab'olo Run" à Dijon même si la FFA dit Saint-Apollinaire
- **Événements multi-jours** : Support des événements sur plusieurs jours (v2.2)

#### Événements multi-jours (v2.2)

**Date** : 2025-11-07

Le parser FFA gère désormais **deux formats de pages** :

1. **Événement 1 jour** (format existant) :
   - Date : `30 Novembre 2025`
   - Courses : `14:00 - 1/2 Marathon`

2. **Événement multi-jours** (nouveau format) :
   - Plage de dates : `17 au 18 Janvier 2026`
   - Courses avec date : `17/01 18:30 - Bol d'air de saint-av 9 km by night`

**Nouveaux champs** :
- `FFACompetitionDetails.startDate` : Date de début (égale à `endDate` pour événements 1 jour)
- `FFACompetitionDetails.endDate` : Date de fin (égale à `startDate` pour événements 1 jour)
- `FFARace.raceDate` : Jour de la course (format: `"17/01"`, optionnel)

**Exemple concret** : [Bol d'air de Saint-Avertin](https://www.athle.fr/competitions/595846640846284843787840217846269843)

📖 **Documentation** : `docs/FFA-MULTI-DAY-EVENTS.md`
✅ **Tests** : `apps/agents/src/ffa/__tests__/parser.multi-day.test.ts`

**Comportement** :
- Événement 1 jour : `startDate = endDate = competition.date`
- Événement multi-jours : `startDate ≠ endDate`
- **Normalisation** : Gestion des accents, apostrophes, ponctuation
- **Seuil** : 0.75 (accepte les matches avec incertitude temporelle)

#### Système de confiance inversée (NEW_EVENT)

**Date** : 2025-11-07

**Problème fixé** : Les propositions NEW_EVENT avaient une confiance très basse (0-32%) alors que l'absence de match devrait indiquer une **haute confiance** de créer un nouvel événement.

**Solution** : Logique inversée pour NEW_EVENT

```typescript
// Pour NEW_EVENT : Pas de match = Confiance haute
const confidence = matchResult.type === 'NO_MATCH'
  ? calculateNewEventConfidence(baseConfidence, competition, matchResult)
  : calculateAdjustedConfidence(baseConfidence, competition, matchResult)
```

**Résultats** :

| Match Score | Confiance AVANT | Confiance APRÈS | Interprétation |
|-------------|-----------------|-----------------|----------------|
| 0.00 (aucun) | 0% ❌ | **95%** ✅ | Très confiant de créer |
| 0.36 (faible) | 32% ❌ | **74%** ✅ | Confiant de créer |
| 0.70 (fort) | 63% ⚠️ | **52%** ⚠️ | Risque doublon |

📚 **Documentation** : `docs/CONFIDENCE-NEW-EVENT.md`

**Exemples v2.1** :

1. **Diab'olo Run** (date exacte) :
   - FFA : Saint-Apollinaire (dept: 21) - 24/11/2025
   - Base : Dijon (dept: 21) - 24/11/2025
   - Résultat : Score 1.000 (bonus département +0.15, aucune pénalité temporelle)

2. **Trail des Ducs** (date éloignée) :
   - FFA : Valentigney (dept: 25) - 16/11/2025
   - Base : Montbéliard (dept: 25) - 18/02/2025
   - Résultat : Score 0.769 (bonus département +0.15, pénalité temporelle -27%)

## Gestion des Timezones et DST

### ⚠️ IMPORTANT - Conversion heures locales → UTC

**Problème historique** : Approximation DST incorrecte causait un décalage d'1h pour les événements aux dates de changement d'heure.

**Solution (2025-11-10)** : Utilisation de `date-fns-tz` pour conversion précise.

#### Backend (FFAScraperAgent)

```typescript
import { fromZonedTime, getTimezoneOffset as getTzOffset } from 'date-fns-tz'

// ❌ AVANT (bugué) - Approximation DST
const isDST = month > 2 && month < 10
const offsetHours = isDST ? 2 : 1
const utcDate = new Date(Date.UTC(year, month, day, hours - offsetHours, minutes))

// ✅ APRÈS (correct) - Conversion avec date-fns-tz
const localDateStr = `2026-03-29T09:00:00`
const utcDate = fromZonedTime(localDateStr, 'Europe/Paris')
// Résultat : 2026-03-29T07:00:00.000Z (UTC+2 DST détecté automatiquement)
```

**Fonctions modifiées** :
- `calculateRaceStartDate()` - Conversion heure course locale → UTC
- `calculateEditionStartDate()` - Conversion heure édition locale → UTC
- `getTimezoneIANA()` - Mapping ligue FFA → timezone IANA (ex: BFC → Europe/Paris, GUA → America/Guadeloupe)

**Logs ajoutés** :
```
🕐 Conversion timezone: 2026-03-29T09:00:00 Europe/Paris -> 2026-03-29T07:00:00.000Z (course: Le tacot)
```

#### Frontend (RacesToAddSection)

```typescript
import { formatDateInTimezone } from '@/utils/timezone'

// Récupérer timezone depuis proposition enrichie
const editionTimeZone = proposal?.editionTimeZone || 'Europe/Paris'

// Formatter avec timezone correct
const formatDateTime = (dateString: string): string => {
  return formatDateInTimezone(dateString, editionTimeZone, 'EEEE dd/MM/yyyy HH:mm')
}
```

**Impact** :
- ✅ DST géré automatiquement (dernier dimanche mars/octobre)
- ✅ Support DOM-TOM (Guadeloupe UTC-4, Réunion UTC+4, etc.)
- ✅ Affichage cohérent pour tous les utilisateurs

**Documentation complète** : `docs/FIX-TIMEZONE-DST.md`

## Changelog

### 2025-11-14 (partie 2) - Fix: Blocs disparaissant après validation ✅

**Problème résolu** : Les blocs (event, edition, organizer, races) disparaissaient après "Tout valider (blocs)" au lieu de rester visibles en mode désactivé.

#### Symptômes

Lorsqu'un utilisateur cliquait sur "Tout valider (blocs)" :
- ✅ Les propositions passaient au statut `APPROVED`
- ✅ Les blocs étaient marqués dans `approvedBlocks`
- ❌ **Tous les blocs disparaissaient de l'interface** au lieu de rester visibles

#### Cause

Rendu conditionnel basé **uniquement** sur la présence de changements actifs :

```tsx
// ❌ AVANT (bugué)
const hasRealEditionChanges = realStandardChanges.length > 0

{hasRealEditionChanges && (
  <CategorizedEditionChangesTable ... />
)}
```

Quand on valide un bloc, les changements sont retirés de `consolidatedChanges` → `hasRealEditionChanges` devient `false` → le bloc disparaît.

#### Solution

Ajout d'une condition pour **toujours afficher les blocs validés** :

```tsx
// ✅ APRÈS (corrigé)
const shouldShowEditionBlock = hasRealEditionChanges || isBlockValidated('edition')

{shouldShowEditionBlock && (
  <CategorizedEditionChangesTable 
    isBlockValidated={isBlockValidated('edition')}
    onUnvalidateBlock={() => unvalidateBlock('edition')}
    ... 
  />
)}
```

**Cas particulier : OrganizerSection**

Gestion du cas où `change` est `undefined` (bloc validé sans changements) :

```tsx
if (!change && isBlockValidated) {
  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ bgcolor: 'action.hover', opacity: 0.7 }}>
        <Typography variant="h6">Organisateur</Typography>
        <Chip label="Validé" color="success" size="small" />
        <BlockValidationButton ... />
      </Box>
    </Paper>
  )
}
```

#### Fichiers modifiés

1. **EditionUpdateGroupedDetail.tsx**
   - `edition` : `shouldShowEditionBlock = hasRealEditionChanges || isBlockValidated('edition')`
   - `organizer` : `(organizerChange || isBlockValidated('organizer')) && (...)`
   - `races` : `shouldShowRacesBlock = hasRaceChanges || isBlockValidated('races')`

2. **NewEventGroupedDetail.tsx**
   - `organizer` : `(organizerChange || isBlockValidated('organizer')) && (...)`

3. **OrganizerSection.tsx**
   - Gestion du cas `change === undefined` pour éviter le crash
   - Affichage d'un bloc simplifié avec bouton d'annulation

#### Impact

| Aspect | Avant | Après |
|--------|-------|-------|
| **UX** | ❌ Blocs disparaissent → confusion | ✅ Blocs restent visibles → clarté |
| **Annulation** | ❌ Impossible de voir ce qui est validé | ✅ Boutons d'annulation visibles |
| **Workflow** | ❌ Perte de contexte | ✅ Contexte préservé |

#### Ressources
- `docs/FIX-BLOCKS-DISAPPEARING-AFTER-VALIDATION.md` - Documentation complète

---

### 2025-11-14 (partie 1) - Matching hybride distance + nom pour les courses ✅

**Problème résolu** : Confusion entre courses ayant la même distance (ex: Marche 4,3km vs Course relais 4,3km).

#### Symptômes

L'ancien algorithme matchait **uniquement par distance** (tolérance 5%). Quand plusieurs courses avaient la même distance, il prenait la première trouvée.

**Conséquence** : Heure de la course relais (10:30) attribuée à la marche ❌

**Cas réel** : Proposition `cmhyq36n904mpmt23rj2gjz6e`
- FFA : "Marche 4,3 km" (08:00) + "Course relais 4,3 km" (10:30)
- DB : "Marche 4,3 km" (08:00) + "Course relais adulte 4,3 km" (10:30)
- Ancien matching : Les deux FFA matchées avec la première DB (Marche)

#### Solution : Algorithme hybride

```typescript
matchRacesByDistanceAndName(ffaRaces, dbRaces, logger):
  1. Grouper les races DB par distance (tolérance 5%)
  2. Pour chaque race FFA:
     - Si 0 candidat → Nouvelle course
     - Si 1 candidat → Match automatique (comportement actuel)
     - Si 2+ candidats → Fuzzy match sur le nom (fuse.js)
```

**Fuzzy matching** (fuse.js) :
- Normalisation : Retirer suffixes FFA, minuscules, accents
- Stopwords : Retirer "de", "la", "du", etc.
- Configuration : threshold 0.6, poids 60% nom / 40% keywords
- Seuil d'acceptation : score >= 0.5

#### Résultats

**Avant** :
- ❌ Marche 4,3km matchée avec la première course trouvée (Course relais)
- ❌ Heure incorrecte : 10:30 au lieu de 08:00
- ❌ Perte de données : course relais non créée

**Après** :
- ✅ Marche 4,3km matchée correctement avec Marche DB
- ✅ Heure correcte : 08:00
- ✅ Course relais matchée avec Course relais adulte DB
- ✅ Heure correcte : 10:30

#### Avantages

| Aspect | Avant | Après |
|--------|-------|-------|
| **Précision** | ~60% (distance seule) | **~95%** (distance + nom) |
| **Faux positifs** | Élevés (courses confondues) | Faibles (fuzzy match) |
| **Performance** | O(n) | O(n) + fuzzy match si nécessaire |
| **Rétrocompatibilité** | - | ✅ Distance unique → Match auto |

#### Fichiers modifiés

1. **`apps/agents/src/ffa/matcher.ts`**
   - Nouvelle fonction `matchRacesByDistanceAndName()`
   - Fonction helper `fuzzyMatchRaceName()`
   - Fonction `normalizeRaceName()` pour nettoyage des noms

2. **`apps/api/src/routes/proposals.ts`**
   - Endpoint `/api/proposals/:id/convert-to-edition-update`
   - Intégration de `matchRacesByDistanceAndName()` à la place de l'ancien matching

3. **Tests** : `apps/agents/src/ffa/__tests__/matcher.race-hybrid.test.ts`
   - 6 cas de test couvrant tous les scénarios

#### Ressources
- `docs/FIX-RACE-MATCHING-HYBRID.md` - Documentation complète
- Source FFA exemple : https://www.athle.fr/competitions/528846908849545849716849769837790846

---

### 2025-11-12 (partie 3) - Suppression des composants RACE_UPDATE ✅

**Résumé** : Nettoyage du code mort - suppression des composants `RaceUpdateDetail` et `RaceUpdateGroupedDetail` qui n'ont jamais été utilisés.

#### Analyse

**Type `RACE_UPDATE` non utilisé** :
- ❌ Aucun agent ne crée de propositions `RACE_UPDATE`
- ❌ Aucune proposition `RACE_UPDATE` en base de données
- ✅ Type défini dans l'enum Prisma mais jamais instancié

**Conclusion** : Dead code pouvant être supprimé sans impact.

#### Modifications

**Fichiers supprimés** :
- ❌ `apps/dashboard/src/pages/proposals/detail/race-update/RaceUpdateDetail.tsx`
- ❌ `apps/dashboard/src/pages/proposals/detail/race-update/RaceUpdateGroupedDetail.tsx`

**Dispatchers nettoyés** :
- `ProposalDetailDispatcher.tsx` : Import supprimé, message d'erreur si type rencontré
- `GroupedProposalDetailDispatcher.tsx` : Import supprimé, message d'erreur si type rencontré

#### Résultats

- ✅ **-2 fichiers** React inutilisés
- ✅ **-2 imports** dans les dispatchers
- ✅ TypeScript compile sans erreurs
- ✅ Moins de confusion pour les développeurs

#### Ressources
- `docs/proposal-state-refactor/CLEANUP-RACE-UPDATE-COMPONENTS.md` - Documentation complète

---

### 2025-11-12 (partie 2) - Phase 4 : Nettoyage complet de GroupedProposalDetailBase ✅

**Résumé** : Suppression de tout le code legacy de consolidation manuelle. **Single Source of Truth totale** atteinte avec `workingGroup`.

#### Métriques

| Métrique | Avant | Après | Gain |
|----------|-------|-------|------|
| **Lignes de code** | 1082 | **1057** | **-25 lignes** (-2.3%) |
| **États locaux** | 1 (`selectedChanges`) | **0** | **-100%** |
| **Fonctions consolidation** | 2 | **0** | **-100%** |
| **useEffect inutiles** | 1 | **0** | **-100%** |
| **Mémos redondants** | 2 | **0** | **-100%** |

#### Suppressions

1. **État local `selectedChanges`** : Remplacé par lecture directe depuis `workingGroup.consolidatedChanges[i].selectedValue`
2. **Fonctions `consolidateChanges()` / `consolidateRaceChanges()`** : Redondantes avec le hook
3. **`useEffect` auto-sélection** : Géré automatiquement par `useProposalEditor`
4. **Mémo `proposedValues`** : Construit inline dans `useBlockValidation`
5. **Propriété `isReadOnly`** : N'existe pas dans l'interface

#### Simplifications

- ✅ Mémos `consolidatedChanges` / `consolidatedRaceChanges` lisent directement `workingGroup`
- ✅ `handleSelectField` supporte `selectOption()` (Phase 1.5)
- ✅ `handleFieldModify` / `handleRaceFieldModify` utilisent uniquement le hook
- ✅ `editionTimezone` / `isEditionCanceled` extraits depuis `workingGroup`
- ✅ `handleApproveField` / `handleApproveAll` lisent `consolidatedChanges[i].selectedValue`
- ✅ Construction inline de `selectedChanges` pour `useBlockValidation`

#### Résultats

**Avant Phase 4** :
- ❌ Duplication de responsabilités (hook + composant)
- ❌ `selectedChanges` synchronisé manuellement
- ❌ Risque de désynchronisation

**Après Phase 4** :
- ✅ **Single Source of Truth totale** : `workingGroup`
- ✅ Aucune logique de consolidation manuelle
- ✅ Code simplifié et maintenable

#### Ressources
- `docs/proposal-state-refactor/PHASE4-COMPLETE-2025-11-12.md` - Documentation complète
- `docs/proposal-state-refactor/PHASE4-CLEANUP-GROUPED-VIEW.md` - Plan détaillé

---

### 2025-11-12 (partie 1) - Phase 3 : ProposalDetailBase en lecture seule ✅

**Résumé** : `ProposalDetailBase` a été converti en **vue lecture seule**. Toute édition doit maintenant passer par `GroupedProposalDetailBase` (même pour une seule proposition).

#### Modifications

**Fichier** : `apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`

**Suppressions (~200 lignes)** :
- ❌ `useProposalEditor` (hook d'édition)
- ❌ États d'édition : `selectedChanges`, `userModifiedChanges`, `userModifiedRaceChanges`
- ❌ Modales de dates : `datePropagationModal`, `editionDateUpdateModal`
- ❌ Handlers d'édition : `handleFieldModify`, `handleRaceFieldModify`

**Ajouts (~30 lignes)** :
- ✅ Bouton "✏️ Éditer cette proposition" (redirige vers vue groupée)
- ✅ Context simplifié (lecture seule)
- ✅ Validation par blocs désactivée

**Nouveau composant** : `apps/dashboard/src/pages/proposals/ProposalEditRedirect.tsx`
- Redirige `/proposals/:id/edit` vers `/proposals/group/:id`

**Route ajoutée** : `apps/dashboard/src/App.tsx`
- Route `/proposals/:proposalId/edit`

#### Résultats

**Gain net** : **-137 lignes de code** (~-25% du fichier)

**Surfaces de bugs réduites** :
- Avant : 8 surfaces (4 types × 2 vues éditables)
- Après : 4 surfaces (4 types × 1 vue éditable)
- **-50% de bugs potentiels**

**Workflow utilisateur** :
- Vue simple → Affichage lecture seule
- Bouton "Éditer" → Redirection vers vue groupée (1 proposition)
- Vue groupée → Édition complète + autosave

#### Ressources
- `docs/proposal-state-refactor/PHASE3-COMPLETE-2025-11-12.md` - Documentation complète
- `docs/proposal-state-refactor/PHASE3-READ-ONLY-SIMPLE-VIEW.md` - Plan détaillé
- `docs/proposal-state-refactor/PLAN-PROPOSAL-STATE-REFACTOR.md` - Plan global

---

### 2025-11-11 (partie 2) - Phase 1.5 : Support des propositions groupées dans useProposalEditor

**Nouveau** : Le hook `useProposalEditor` supporte désormais les propositions groupées nativement.

#### Fonctionnalités ajoutées

**Détection automatique du mode** :
- `useProposalEditor('cm123')` → Mode simple
- `useProposalEditor(['cm123', 'cm456', 'cm789'])` → Mode groupé

**Consolidation multi-agents** :
- `consolidateChangesFromProposals()` : Agrège les changements par champ
- `consolidateRacesFromProposals()` : Agrège les courses par ID
- Support de plusieurs agents proposant la même modification

**Nouveaux handlers pour mode groupé** :
- `selectOption(field, proposalId)` : Sélectionner une option parmi plusieurs agents
- `validateAllBlocks()` : Valider tous les blocs en une fois
- `isBlockValidated(blockKey)` : Vérifier si un bloc est validé

**Types exportés** :
```typescript
interface WorkingProposalGroup {
  ids: string[]
  originalProposals: Proposal[]
  consolidatedChanges: ConsolidatedChange[]
  consolidatedRaces: ConsolidatedRaceChange[]
  userModifiedChanges: Record<string, any>
  userModifiedRaceChanges: Record<string, any>
  approvedBlocks: Record<string, boolean>
  isDirty: boolean
  lastSaved: Date | null
}

interface ConsolidatedChange {
  field: string
  options: Array<{
    proposalId: string
    agentName: string
    proposedValue: any
    confidence: number
    createdAt: string
  }>
  currentValue: any
  selectedValue?: any
}
```

#### Comportement

**Sauvegarde groupée** :
- Le même diff est appliqué à toutes les propositions du groupe
- Garantit la cohérence entre propositions

**Validation par blocs** :
- Accepte une liste optionnelle de `proposalIds`
- Payload construit depuis `consolidatedChanges` + `userModifiedChanges`

#### Impact

**Avant** :
- ❌ Duplication d'état dans `GroupedProposalDetailBase`
- ❌ Logique complexe de synchronisation manuelle
- ❌ Bugs de perte de modifications

**Après** :
- ✅ Single Source of Truth dans le hook
- ✅ Consolidation automatique des changements
- ✅ Sauvegarde et validation massives
- ✅ Rétrocompatibilité avec mode simple

#### Fichiers modifiés

1. **`apps/dashboard/src/hooks/useProposalEditor.ts`**
   - Ajout des types `WorkingProposalGroup`, `ConsolidatedChange`, `ConsolidatedRaceChange`
   - Ajout de `initializeWorkingGroup()`
   - Ajout de `consolidateChangesFromProposals()`
   - Ajout de `consolidateRacesFromProposals()`
   - Modification de `updateField()`, `updateRace()`, `deleteRace()`, `addRace()` pour supporter le mode groupé
   - Modification de `save()` avec `buildGroupDiff()`
   - Modification de `validateBlock()` pour accepter `proposalIds[]`
   - Ajout de `validateAllBlocks()` et `isBlockValidated()`
   - Retour conditionnel selon le mode (simple vs groupé)

2. **`apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`**
   - Import de `useProposalEditor` ajouté
   - Commentaires TODO pour migration

#### Ressources

- `docs/PHASE1.5-GROUP-SUPPORT-COMPLETE.md` - Documentation complète avec exemples
- `docs/PLAN-PROPOSAL-STATE-REFACTOR.md` - Plan global

#### Prochaines étapes : Phase 2

Intégrer le hook dans `GroupedProposalDetailBase` pour remplacer les états locaux.

### 2025-11-11 (partie 1) - Fix: Payload complet lors de la validation par blocs

**Problème résolu** : Les valeurs proposées par les agents n'étaient pas incluses dans le payload lors de la validation par blocs.

#### Symptômes

Lorsqu'un utilisateur modifiait manuellement un champ (ex: distance d'une course) puis validait le bloc, seule la modification manuelle était envoyée au backend. Les autres valeurs proposées par l'agent (ex: `startDate`) étaient perdues.

**Résultat observé** :
```json
{
  "races": {
    "141829": {
      "distance": "12"  // ✅ Modification manuelle
      // ❌ startDate manquante (proposée par l'agent)
    }
  }
}
```

#### Cause

Dans `useBlockValidation.ts`, lors de la validation d'un bloc, seul le paramètre `block` était envoyé au backend, sans les valeurs proposées (`selectedChanges`) ni les modifications manuelles (`userModifiedChanges`).

#### Solution

**1. Ajout de props à `useBlockValidation`** :
- `selectedChanges` : Valeurs proposées par les agents
- `userModifiedChanges` : Modifications manuelles
- `userModifiedRaceChanges` : Modifications spécifiques aux courses

**2. Construction du payload complet** :
```typescript
const finalPayload: Record<string, any> = {}

// 1. Ajouter les valeurs proposées (agents)
Object.entries(selectedChanges).forEach(([field, value]) => {
  finalPayload[field] = value
})

// 2. Écraser avec les modifications manuelles
Object.entries(userModifiedChanges).forEach(([field, value]) => {
  finalPayload[field] = value
})

// 3. Ajouter les modifications de courses si bloc "races"
if (blockKey === 'races') {
  finalPayload.raceEdits = userModifiedRaceChanges
}
```

**3. Passage des props depuis les composants** :
- `GroupedProposalDetailBase.tsx`
- `ProposalDetailBase.tsx`

#### Résultat

✅ **Payload complet** :
```json
{
  "races": {
    "141826": {
      "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Proposée
    },
    "141827": {
      "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Proposée
    },
    "141828": {
      "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Proposée
    },
    "141829": {
      "distance": "12",                         // ✅ Modifiée
      "startDate": "2025-11-14T23:00:00.000Z"  // ✅ Proposée
    }
  }
}
```

#### Fichiers modifiés

1. **`apps/dashboard/src/hooks/useBlockValidation.ts`**
   - Ajout des props et construction du payload complet
   - Logs de debugging

2. **`apps/dashboard/src/pages/proposals/detail/base/GroupedProposalDetailBase.tsx`**
   - Passage des props à `useBlockValidation`

3. **`apps/dashboard/src/pages/proposals/detail/base/ProposalDetailBase.tsx`**
   - Passage des props à `useBlockValidation`

#### Ressources

- `docs/FIX-BLOCK-VALIDATION-PAYLOAD.md` - Documentation complète avec tests

### 2025-11-10 (partie 5) - Fix rate limiting HTTP (429 Too Many Requests)

**Problème résolu** : Rate limiting trop strict causant des erreurs 429 lors du chargement de la liste des propositions.

#### Symptômes

```
GET http://localhost:4001/api/proposals?limit=100&offset=0 429 (Too Many Requests)
Rate limited. Retrying in 1000ms (attempt 1/3)...
Rate limited. Retrying in 2000ms (attempt 2/3)...
```

#### Cause

1. **Rate limiting trop strict** : 100 requêtes / 15 minutes = **6.6 requêtes/minute**
2. **Requêtes multiples au chargement** :
   - GET `/api/proposals` (requête principale)
   - Enrichissement des propositions (connexions Miles Republic)
   - Retries React Query en cas d'échec
   - Refetch automatique au focus/montage

**Résultat** : Le simple chargement de la page pouvait déclencher 10-20 requêtes simultanées → 429 immédiat.

#### Solution

**Backend** (`apps/api/src/index.ts`) :
- Fenêtre plus courte : 1 minute (au lieu de 15)
- Limite haute : 500 requêtes/minute (au lieu de 100/15min = 6.6/min)
- Appliquer uniquement sur `/api`, pas sur `/health`

**Frontend** (`apps/dashboard/src/hooks/useApi.ts`) :
- `staleTime: 60000` (60s au lieu de 30s)
- `gcTime: 300000` (5 min)
- `refetchInterval: 120000` (2 min au lieu de 1)
- `refetchOnWindowFocus: false` (⚠️ était true, causait des bursts)
- `refetchOnMount: false` (⚠️ était true, causait des bursts)
- `retry: 1` (au lieu de 3 par défaut)

#### Impact

**Avant** :
- ❌ Rate limit atteint au chargement de la page
- ❌ Retry infini → 429 → 429 → 429
- ❌ Utilisateur bloqué 15 minutes

**Après** :
- ✅ Rate limit **jamais** atteint en usage normal
- ✅ Cache intelligent → moins de requêtes réseau
- ✅ Fenêtre courte → récupération rapide si burst exceptionnel
- ✅ Expérience fluide

#### Ressources
- `docs/FIX-RATE-LIMITING.md` - Documentation complète

### 2025-11-10 (partie 4) - Fix application des modifications utilisateur

**Problème résolu** : Les modifications manuelles des courses (startDate, distance, etc.) n'étaient pas appliquées lors de l'approbation des propositions.

#### Symptômes

Lorsqu'un utilisateur :
1. Éditait la `startDate` d'une édition
2. Acceptait de propager cette date aux courses
3. Approuvait la proposition

**Résultat attendu** : La nouvelle date devait être appliquée à l'édition ET aux courses  
**Résultat observé** : La date de l'édition était modifiée, mais PAS celle des courses ❌

#### Cause

**Frontend** : Les modifications étaient stockées dans deux états séparés (`userModifiedChanges` et `userModifiedRaceChanges`), mais seul le premier était envoyé au backend lors de l'approbation.

**Backend** : Le code lisait bien `userModifiedChanges.raceEdits`, mais n'appliquait pas le champ `startDate` pour les courses (nouvelles et existantes).

#### Solution

**Frontend** :
- Merger `userModifiedRaceChanges` dans `userModifiedChanges.raceEdits` avant envoi
- Fichiers : `ProposalDetailBase.tsx`, `GroupedProposalDetailBase.tsx`

**Backend** :
- Ajouter support de `editedData.startDate` pour les nouvelles courses (ligne 428)
- Ajouter support de `edits.startDate` pour les courses existantes (ligne 467)
- Fichier : `proposal-domain.service.ts`

#### Impact

**Avant** :
- ❌ Propagation de dates non fonctionnelle
- ❌ Modifications de courses ignorées
- ❌ Incohérence entre UI et base de données

**Après** :
- ✅ Propagation de dates complète
- ✅ Toutes les modifications utilisateur appliquées
- ✅ Cohérence garantie

#### Ressources
- `docs/FIX-USER-MODIFICATIONS-APPLICATION.md` - Documentation complète

### 2025-11-10 (partie 3) - Affichage et sélection des matches rejetés pour NEW_EVENT

**Fonctionnalité ajoutée** : Correction manuelle des faux négatifs de l'algorithme de matching.

#### Problème résolu

L'algorithme de matching FFA peut rejeter un événement existant (score < 0.75) pour diverses raisons :
- Variations de noms ("Trail des Loups #3" vs "Trail des loups")
- Différences de dates importantes (13 jours d'écart)
- Scores juste en-dessous du seuil (0.74 < 0.75)

**Conséquence** : Création d'une proposition NEW_EVENT alors que l'événement existe déjà.

#### Solution

**Interface utilisateur** :
- Nouvelle card `RejectedMatchesCard` affichant les 3 meilleurs matches rejetés
- Pour chaque match : scores détaillés, lien vers Miles Republic, bouton "Sélectionner"
- Confirmation et redirection automatique vers la nouvelle proposition EDITION_UPDATE

**Backend** :
- Stockage des `rejectedMatches` dans `MatchResult` (matcher.ts)
- Nouveau endpoint `POST /api/proposals/:id/convert-to-edition-update`
- Récupération des valeurs actuelles de l'édition existante
- **Matching automatique des courses par distance** (tolérance 5%)

#### Workflow utilisateur

1. Ouverture proposition NEW_EVENT → Card jaune avec top 3 matches
2. Clic sur nom de l'événement → Vérification sur Miles Republic
3. Clic "Sélectionner" → Confirmation → Conversion + Redirection
4. Nouvelle proposition EDITION_UPDATE avec :
   - Colonne "Valeur actuelle" remplie
   - Courses déjà matchées (`racesToAdd` vs `racesToUpdate`)

#### Matching des courses

Lors de la conversion, l'algorithme matche automatiquement les courses FFA avec celles de l'édition existante :

**Algorithme** (identique à FFAScraperAgent) :
1. **Matching par distance** : Tolérance 5% (ex: 21.1km ↔ 21.097km)
2. **Fallback sur le nom** : Si distance manquante
3. **Vérification des différences** : Élévation (±10m), heure de départ (±1h)

**Résultat** :
- `racesToAdd` : Courses FFA non matchées → Nouvelles courses
- `racesToUpdate` : Courses matchées avec différences → Mises à jour

#### Exemple concret

**Édition existante** :
- 10km (09:00)
- Semi-Marathon 21.1km (10:00, D+ 150m)

**Courses FFA proposées** :
- 10km (09:30)
- Semi-Marathon 21.1km (10:00, D+ 200m)
- 5km (14:00)

**Après conversion** :
- ✅ 10km → Mise à jour heure (09:00 → 09:30)
- ✅ Semi-Marathon → Mise à jour élévation (150m → 200m)
- ➕ 5km → Nouvelle course à ajouter

#### Fichiers modifiés

**Backend** :
- `apps/agents/src/ffa/matcher.ts` - Ajout `rejectedMatches` dans `MatchResult`
- `apps/agents/src/ffa/types.ts` - Nouveau type `rejectedMatches`
- `apps/agents/src/FFAScraperAgent.ts` - Stockage dans justification
- `apps/api/src/routes/proposals.ts` - Endpoint conversion + matching courses

**Frontend** :
- `apps/dashboard/src/components/proposals/new-event/RejectedMatchesCard.tsx` (nouveau)
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventDetail.tsx`
- `apps/dashboard/src/pages/proposals/detail/new-event/NewEventGroupedDetail.tsx`
- `apps/dashboard/src/hooks/useApi.ts` - Hook `useConvertToEditionUpdate()`
- `apps/dashboard/src/services/api.ts` - API `convertToEditionUpdate()`

**Documentation** :
- `docs/FEATURE-REJECTED-MATCHES.md` - Documentation complète
- `WARP.md` - Ajout section Stack technique (Material-UI)

#### Impact

**Avant** :
- ❌ Faux négatifs → Doublons dans Miles Republic
- ❌ Travail manuel pour détecter et fusionner les doublons
- ❌ Perte de données lors de la fusion

**Après** :
- ✅ Correction manuelle des faux négatifs avant création
- ✅ Pas de doublons créés
- ✅ Enrichissement de l'édition existante
- ✅ Historique de décision utilisateur pour améliorer l'algorithme

#### Ressources
- `docs/FEATURE-REJECTED-MATCHES.md` - Documentation complète avec exemples et architecture

### 2025-11-10 (partie 2) - Fix nettoyage numéros d'édition avec symboles (#, No., N°)

**Problème résolu** : L'algorithme de matching FFA ne reconnaissait pas les événements existants quand le nom FFA contenait `#3`, `No. 8`, `N° 5`, etc.

#### Cas réel : Trail des Loups #3

**Événement existant** :
- ID : 13446
- Nom : `"Trail des loups"`
- Ville : Bonnefontaine (39)
- Édition 2026 : ID 44684, date 13 avril 2026

**Scrape FFA** :
- Nom : `"Trail Des Loups #3"`
- Ville : Bonnefontaine (39)
- Date : 26 avril 2026

**Résultat avant fix** :
- Match score : **0.565** < 0.75 (seuil) → ❌ NO_MATCH
- Proposition créée : NEW_EVENT au lieu d'EDITION_UPDATE
- Cause : Le `#3` dans le nom FFA réduisait le score de fuzzy matching

#### Solution

Ajout d'un regex dans `removeEditionNumber()` pour retirer :
- `#3`, `#10`, `#125`
- `No. 8`, `No 8`, `no. 8`, `no 8`
- `N° 5`, `n° 5`, `N°5`, `n°5`

```typescript
// Supprimer "#X", "No. X", "N° X", "no X" partout dans le nom
.replace(/\s*[#№]?\s*n[o°]?\.?\s*\d+/gi, '')
```

#### Résultats

**Score après fix** : 0.88 > 0.75 → ✅ FUZZY_MATCH détecté !

**Composantes du score** :
- **Bonus département** : +15% si même département mais villes différentes
- **Pénalité temporelle** : ~3% pour 13 jours d'écart (multiplicateur 97.1%)
  - Formule : `dateMultiplier = 0.8 + (dateProximity * 0.2)` (assoupli de 70-100% à 80-100%)
  - `dateProximity = 1 - (daysDiff / 90)`

| Écart | dateProximity | Multiplicateur | Pénalité |
|-------|---------------|----------------|----------|
| 0 jours | 1.0 | 100% | 0% |
| 13 jours | 0.856 | 97.1% | -2.9% |
| 45 jours | 0.5 | 90% | -10% |
| 90 jours | 0.0 | 80% | -20% |

#### Fichiers modifiés

1. **`apps/agents/src/ffa/matcher.ts`** (ligne 414)
   - Ajout du regex pour retirer les symboles `#`, `No.`, `N°`
   
2. **`apps/agents/src/ffa/__tests__/matcher.edition-removal.test.ts`** (nouveau)
   - Tests complets pour tous les cas (#3, No. 8, N° 5, combinaisons)

#### Ressources

- `docs/FIX-EDITION-NUMBER-SYMBOLS.md` - Documentation complète avec analyse
- Proposition exemple : `cmhstf28403tjmu3ref0q3nbz`

### 2025-11-10 (partie 1) - Fix gestion timezone et DST

**Problème résolu** : Décalage d'1h entre heures FFA et dashboard pour événements aux dates de changement d'heure.

**Exemple** : Compétition 29 mars 2026 (jour DST) à 09:00 affichée 10:00.

**Cause** : Approximation `month > 2 && month < 10` ne tenait pas compte du jour exact du DST.

**Solution** :
1. Backend : Utilisation `date-fns-tz` avec `fromZonedTime()` pour conversion locale → UTC
2. Frontend : Utilisation `formatDateInTimezone()` avec timezone de l'édition
3. Logs détaillés pour debugging

**Fichiers modifiés** :
- `apps/agents/src/FFAScraperAgent.ts` - Refonte conversion timezone
- `apps/dashboard/src/components/proposals/edition-update/RacesToAddSection.tsx` - Affichage avec timezone correct
- `docs/FIX-TIMEZONE-DST.md` - Documentation complète

### 2025-11-09 - Fix parsing événements multi-mois (février-mars, décembre-janvier)

**Problème résolu :** Le parser FFA ne détectait pas correctement les événements multi-jours **chevauchant deux mois différents**.

#### Symptômes

Pour l'événement **Trail de Vulcain** (28 février au 1er mars 2026), la page FFA affiche :

```html
<p class="body-small text-dark-grey">28 au 1 Mars 2026</p>
```

Le parser extrayait incorrectement :
- `startDate = 28 mars 2026` ❌ (devrait être 28 février)
- `endDate = 1 mars 2026` ✅

#### Cause

Le regex existant supposait que `startDay` et `endDay` étaient dans le **même mois** (celui affiché). Mais pour les événements chevauchant 2 mois, le mois affiché est uniquement celui de la **date de fin**.

#### Solution

**Indicateur clé** : `startDay > endDay` signifie que l'événement chevauche 2 mois.

```typescript
if (startDay > endDay) {
  // Le mois de début est le mois précédent
  const startMonth = endMonth === 0 ? 11 : endMonth - 1
  const startYear = endMonth === 0 ? year - 1 : year
  
  details.startDate = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0))
  details.endDate = new Date(Date.UTC(year, endMonth, endDay, 0, 0, 0, 0))
}
```

**Cas gérés** :
- `"28 au 1 Mars 2026"` → 28 févr. 2026 au 1er mars 2026
- `"30 au 2 Janvier 2026"` → 30 déc. 2025 au 2 janv. 2026 (changement d'année)
- `"17 au 18 Janvier 2026"` → 17 janv. 2026 au 18 janv. 2026 (rétrocompatibilité)

#### Fichiers modifiés

1. **`apps/agents/src/ffa/parser.ts`** (lignes 112-145)
   - Détection `startDay > endDay`
   - Calcul du mois précédent avec gestion décembre-janvier

2. **`apps/agents/src/ffa/__tests__/parser.multi-day.test.ts`** (lignes 69-99)
   - Test février-mars
   - Test décembre-janvier (changement d'année)

#### Ressources
- `docs/FIX-MULTI-MONTH-EVENTS.md` - Documentation complète
- `scripts/test-parser-fix.ts` - Script de test manuel

### 2025-01-07 (partie 7) - Fix algorithme de progression pour liguesPerRun > 1

**Problème résolu :** Combinaisons (ligue, mois) sautées lors du scraping avec `liguesPerRun > 1`.

#### Symptômes

Les ligues n'étaient pas complètement scrapées : certains mois manquaient pour certaines ligues.

```
Réalisé :
  ARA : 2025-11
  BFC : 2025-11, 2025-12
  BRE : 2025-12, 2026-01      ❌ Manque 2025-11
  G-E : 2026-03               ❌ Manque 2025-11, 2025-12
```

#### Cause

L'algorithme de calcul de la prochaine position supposait implicitement `liguesPerRun = 1`. Lors du traitement de plusieurs ligues par run, il restait sur la dernière ligue traitée au lieu de revenir à la première.

```typescript
// ❌ AVANT (buggé)
if (lastMonthIndex + 1 < allMonths.length) {
  progress.currentLigue = lastProcessedLigue  // Reste sur la dernière ligue
}
```

**Exemple** : Avec `liguesPerRun = 2`, `monthsPerRun = 1`
- Run 1 traite : ARA 2025-11, BFC 2025-11
- Prochaine position calculée : **BFC 2025-12** ❌ (devrait être ARA 2025-12)
- Run 2 traite : BFC 2025-12, BRE 2025-12
- Résultat : ARA 2025-12, BFC 2026-01, etc. **jamais traités**

#### Solution

```typescript
// ✅ APRÈS (corrigé)
if (lastMonthIndex + 1 < allMonths.length) {
  progress.currentLigue = ligues[0]  // Revenir à la première ligue du run
  progress.currentMonth = allMonths[lastMonthIndex + 1]
}
```

**Résultat** : 
- Run 1 traite : ARA 2025-11, BFC 2025-11 → Prochain: **ARA 2025-12** ✅
- Run 2 traite : ARA 2025-12, BFC 2025-12 → Prochain: **ARA 2026-01** ✅
- Toutes les combinaisons (21 ligues × 6 mois = 126) sont traitées

#### Logs améliorés

```
⏭️  Prochaine position: ARA - 2025-12
{
  liguesTraitees: ['ARA', 'BFC'],
  moisTraite: '2025-11',
  prochainMois: '2025-12'
}
```

#### Ressources
- `docs/FIX-PROGRESSION-MULTI-LIGUES.md` - Documentation complète avec tests et exemples

### 2025-11-07 (partie 6) - Système de confiance inversée pour NEW_EVENT

**Problème résolu :** Les propositions NEW_EVENT avaient une confiance très basse (0-32%) alors que l'absence de match devrait indiquer une **haute confiance** de créer un nouvel événement.

#### Cause

La fonction `calculateAdjustedConfidence()` pénalisait les faibles scores de matching :

```typescript
// Avant fix
if (matchResult.confidence < 0.8) {
  confidence *= matchResult.confidence  // 0.9 * 0 = 0 !
}
```

**Incohérence logique** :
- Aucun match (score 0) → Confiance 0% → Pourtant c'est le cas idéal pour créer !
- Match faible (score 0.3) → Confiance 27% → On devrait être confiant qu'il faut créer
- Match fort (score 0.8) → Confiance 72% → Risque de doublon, on ne devrait PAS créer

#### Solution

Nouvelle fonction `calculateNewEventConfidence()` avec **logique inversée** :

```typescript
// Pour NEW_EVENT : Pas de match = Confiance haute
const confidence = matchResult.type === 'NO_MATCH'
  ? calculateNewEventConfidence(baseConfidence, competition, matchResult)
  : calculateAdjustedConfidence(baseConfidence, competition, matchResult)
```

**Formule** :

```typescript
if (matchScore === 0) {
  confidence = 0.95  // Aucun candidat = confiance max
} else {
  penalty = matchScore * 0.5
  confidence *= (1 - penalty)
  // matchScore 0.2 → confidence 0.81
  // matchScore 0.5 → confidence 0.68
  // matchScore 0.9 → confidence 0.50
}
```

#### Résultats

| Match Score | Confiance AVANT | Confiance APRÈS | Interprétation |
|-------------|-----------------|-----------------|----------------|
| 0.00 (aucun) | 0% ❌ | **95%** ✅ | Très confiant de créer |
| 0.36 (faible) | 32% ❌ | **74%** ✅ | Confiant de créer |
| 0.70 (fort) | 63% ⚠️ | **52%** ⚠️ | Risque doublon |

#### Fichiers modifiés

1. **`apps/agents/src/ffa/matcher.ts`**
   - Ajout de `calculateNewEventConfidence()` (lignes 629-688)
   - Documentation avec exemples

2. **`apps/agents/src/FFAScraperAgent.ts`**
   - Import de la nouvelle fonction (ligne 31)
   - Sélection conditionnelle de la fonction de confiance (lignes 677-679)
   - Ajout de `matchScore` dans les métadonnées (ligne 771)

#### Traçabilité

Chaque proposition NEW_EVENT inclut désormais `matchScore` dans les métadonnées pour comprendre pourquoi la confiance est haute/basse :

```json
{
  "confidence": 0.74,
  "matchScore": 0.36,  // Score du meilleur match trouvé
  "eventName": "Semi-Marathon du Grand Nancy"
}
```

#### Ressources
- `docs/CONFIDENCE-NEW-EVENT.md` - Documentation complète avec exemples et tests

### 2025-11-08 - Fix affichage date + heure + jour de la semaine pour les courses

**Problème résolu :** Les dates des courses affichaient uniquement la date (ex: "24/11/2025") sans l'heure ni le jour de la semaine dans l'interface du dashboard.

#### Symptômes

Bien que :
- Le champ `Race.startDate` soit un `DateTime` dans la base
- Le FFA Scraper calcule et propose correctement la date + heure
- Les éditions affichent déjà le format complet `lundi 24/11/2025 14:00`

Les courses affichaient : `24/11/2025` ❌

#### Cause

Deux composants utilisaient `toLocaleDateString()` qui n'affiche que la date :
1. `RacesToAddSection.tsx` (ligne 182) - Section NEW_EVENT
2. `RacesChangesTable.tsx` (ligne 76) - Section EDITION_UPDATE

#### Solution

Import de `date-fns` et utilisation du format `'EEEE dd/MM/yyyy HH:mm'` pour :
- `EEEE` : Jour de la semaine en français (lundi, mardi, etc.)
- `dd/MM/yyyy` : Date complète
- `HH:mm` : Heure au format 24h

**Exemple de rendu** :
```
lundi 24/11/2025 14:00
samedi 15/03/2025 09:30
```

#### Fichiers modifiés

1. **`RacesToAddSection.tsx`** : Ajout d'une fonction `formatDateTime()` locale
2. **`RacesChangesTable.tsx`** : Ajout de `format()` inline dans le formatter du champ `startDate`
3. Label changé de "Date" vers "Date + Heure" pour clarté

#### Cohérence

Ce format est **identique** à celui utilisé pour les éditions dans `useProposalLogic.ts`, assurant une uniformité d'affichage dans toute l'interface.

#### Ressources
- `docs/FIX-RACE-DATETIME-DISPLAY.md` - Documentation complète avec exemples

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

## Ressources
- `DEPLOY.md` - Guide complet de déploiement
- `docs/PRISMA-MULTI-SCHEMA.md` - Configuration multi-schéma

### 2025-11-07 - Corrections application de propositions

**Problème résolu :** Lors de l'application de propositions NEW_EVENT, plusieurs champs n'étaient pas correctement renseignés.

#### Corrections appliquées

1. **Event**
   - ✅ `countrySubdivisionDisplayCodeLevel1` : Maintenant calculé via `extractRegionCode()` (ex: "Grand Est" → "GES")
   - ✅ `slug` : Généré automatiquement après création (format: `{nom-slugifié}-{id}`)
   - ✅ `toUpdate` : Défini à `true` par défaut pour indexation Algolia
   - ✅ `fullAddress` : Générée automatiquement si non fournie (format: `{ville}, {département}, {pays}`)
   - ✅ `websiteUrl`, `facebookUrl` : Éditables même si non proposés initialement
   - 🚧 `latitude`, `longitude` : Préparé pour géocodage automatique (STUB)

2. **Edition**
   - ✅ `currentEditionEventId` : Défini automatiquement égal à `eventId`
   - ✅ `dataSource` : Déduit automatiquement via `inferDataSource()` selon le type d'agent
   - ⚠️ **BUG FIXÉ le 2025-11-07** : `startDate` et `endDate` n'étaient pas extraits (voir ci-dessous)

3. **Race**
   - ✅ Création systématique des races proposées
   - ✅ Logs détaillés pour chaque création
   - ✅ Fallback si `editionYear` ne correspond pas exactement
   - ⚠️ **BUG FIXÉ le 2025-11-07** : Les races n'étaient pas créées (voir ci-dessous)

#### Nouvelles méthodes (proposal-domain.service.ts)

```typescript
// Mapping régions françaises
extractRegionCode(regionName): string

// Construction adresse complète
buildFullAddress(city, dept, country): string

// Génération slug SEO-friendly
generateEventSlug(name, id): string

// Géocodage ville (STUB)
geocodeCity(city, country): Promise<{lat, lon} | null>

// Déduction source de données
inferDataSource(changes): string // FEDERATION | TIMER | OTHER
```

#### Logs améliorés

```
Slug généré pour l'événement 15178: semi-marathon-du-grand-nancy-15178
Édition créée: 52074 pour l'événement 15178
Course créée: 40098 (Semi-Marathon) pour l'édition 52074
```

#### Ressources
- `docs/FIX-PROPOSAL-APPLICATION.md` - Spécification des corrections
- `docs/CHANGELOG-PROPOSAL-FIXES.md` - Détails techniques des modifications

### 2025-11-07 (partie 2) - Fix extraction dates Edition et création des courses

**Problème résolu :** Malgré le fix précédent, les champs `startDate` et `endDate` de l'Edition ainsi que les courses (`Race`) n'étaient toujours pas créés lors de l'application d'une proposition NEW_EVENT.

#### Cause

Les fonctions `extractEditionsData()` et `extractRacesData()` cherchaient les données au **niveau racine** de `selectedChanges` :

```typescript
// ❌ INCORRECT
if (selectedChanges.year || selectedChanges.startDate || selectedChanges.endDate) {
  return [{
    startDate: this.extractDate(selectedChanges.startDate), // undefined !
  }]
}
```

Alors que le FFA Scraper utilise une **structure imbriquée** :

```json
{
  "edition": {
    "new": {
      "year": "2025",
      "startDate": "2025-03-29T09:00:00.000Z",
      "races": [
        { "name": "1/2 Marathon", "runDistance": 21.1 }
      ]
    }
  }
}
```

#### Solution

1. **`extractEditionsData()`** : Extraire depuis `selectedChanges.edition` avec `extractNewValue()`
2. **`extractRacesData()`** : Extraire depuis `editionData.races` (tableau)
3. **Nouvelle méthode `parseDate()`** : Parser les dates déjà extraites (sans passer par `extractNewValue()`)

```typescript
// ✅ CORRECT
const editionData = this.extractNewValue(selectedChanges.edition)
if (editionData && typeof editionData === 'object') {
  return [{
    year: editionData.year,
    startDate: this.parseDate(editionData.startDate), // ✅
    endDate: this.parseDate(editionData.endDate),     // ✅
  }]
}

// Fallback vers ancienne structure (rétrocompatibilité)
if (selectedChanges.year || selectedChanges.startDate) {
  // ... ancien code
}
```

#### Rétrocompatibilité

✅ **Deux structures supportées** :
- **Structure imbriquée** (FFA Scraper) : `edition.new.{year, startDate, races}`
- **Structure plate** (legacy) : `{year, startDate, race_0}`

#### Résultat

✅ **Edition** : `startDate` et `endDate` correctement renseignés  
✅ **Race** : Création systématique des courses proposées  
✅ **Logs** : `Course créée: 40098 (1/2 Marathon) pour l'édition 52074`

#### Ressources
- `docs/FIX-EDITION-FIELDS-AND-RACES.md` - Documentation complète du fix

### 2025-11-07 (partie 3) - Fix prise en compte des modifications utilisateur

**Problème résolu :** Les modifications manuelles faites par l'utilisateur sur une proposition NEW_EVENT (via `userModifiedChanges`) n'étaient pas appliquées lors de la création de l'événement.

#### Cause

Dans `applyNewEvent()`, les fonctions d'extraction utilisaient le paramètre `selectedChanges` au lieu de `changes` :

```typescript
// ❌ INCORRECT
async applyNewEvent(changes, selectedChanges, options) {
  const eventData = this.extractEventData(selectedChanges)  // Ignore userModifiedChanges !
}
```

Le paramètre `changes` contenait déjà les modifications utilisateur mergées (ligne 50-53 de `applyProposal()`), mais les fonctions d'extraction utilisaient `selectedChanges` qui ne les contient pas.

#### Solution

```typescript
// ✅ CORRECT
async applyNewEvent(changes, selectedChanges, options) {
  // Utiliser 'changes' qui contient les userModifiedChanges mergées
  const eventData = this.extractEventData(changes)        // ✅
  const editionsData = this.extractEditionsData(changes)  // ✅
  const racesData = this.extractRacesData(changes)        // ✅
}
```

#### Résultat

✅ Modifications manuelles du nom d'événement appliquées  
✅ Toutes les modifications via `userModifiedChanges` prises en compte  
✅ Flux de données cohérent avec le design prévu

#### Note sur endDate

ℹ️ La `endDate` reste `null` pour les propositions FFA car les compétitions sont généralement d'une seule journée. C'est **normal** et conforme au fonctionnement attendu.

#### Ressources
- `docs/FIX-USER-MODIFIED-CHANGES.md` - Documentation complète avec diagramme de flux

### 2025-11-07 (partie 4) - Ajout de endDate dans les propositions FFA

**Amélioration :** Le FFA Scraper propose maintenant `endDate = startDate` pour que les deux champs apparaissent dans l'interface utilisateur.

#### Avant

❌ FFA proposait uniquement `startDate`  
❌ `endDate` ajoutée par le frontend (fallback)  
❌ Modifications de `endDate` non sauvegardées dans la proposition

#### Après

✅ FFA propose `startDate` **et** `endDate` (même valeur par défaut)  
✅ Les deux champs visibles et éditables dans l'interface  
✅ Modifications de `endDate` sauvegardées et appliquées correctement

#### Cas d'usage

**Compétition d'un jour** (99% des cas) :  
`endDate = startDate` → Rien à modifier

**Compétition multi-jours** (rare) :  
L'utilisateur peut éditer `endDate` dans l'interface  
Exemple : `startDate = 14/06`, `endDate = 16/06` (3 jours)

#### Fichiers modifiés

1. **NEW_EVENT** : `apps/agents/src/FFAScraperAgent.ts` ligne 677
2. **EDITION_UPDATE** : `apps/agents/src/FFAScraperAgent.ts` lignes 266-271

#### Ressources
- `docs/FFA-ENDDATE-PROPOSAL.md` - Documentation complète

### 2025-11-07 (partie 5) - Ajout de timeZone dans les propositions FFA

**Amélioration** : Le FFA Scraper fournit automatiquement le `timeZone` correct selon la ligue (DOM-TOM vs Métropole).

#### Problème

❌ L'interface ajoutait un fallback `timeZone = 'Europe/Paris'` pour toutes les compétitions  
❌ **Incorrect pour les DOM-TOM** : Guadeloupe, Martinique, Guyane, Réunion, Mayotte, etc.  
❌ Les heures d'événements DOM-TOM étaient mal affichées

#### Solution

Nouvelle méthode `getTimezoneIANA()` qui mappe les ligues FFA vers les timezones IANA :

```typescript
private getTimezoneIANA(ligue: string): string {
  const ligueTimezones = {
    'GUA': 'America/Guadeloupe',
    'GUY': 'America/Cayenne',
    'MAR': 'America/Martinique',
    'MAY': 'Indian/Mayotte',
    'N-C': 'Pacific/Noumea',
    'P-F': 'Pacific/Tahiti',
    'REU': 'Indian/Reunion',
    'W-F': 'Pacific/Wallis'
  }
  return ligueTimezones[ligue] || 'Europe/Paris'
}
```

#### Résultat

✅ Affichage correct des heures pour toutes les compétitions DOM-TOM  
✅ Cohérence entre NEW_EVENT et EDITION_UPDATE  
✅ Correction automatique des timezones incorrectes dans la base

#### Nettoyage

🧹 Suppression des fallbacks frontend `timeZone`, `calendarStatus` et `endDate`  
🧹 Le backend fournit désormais toujours ces champs

#### Ressources
- `docs/FFA-TIMEZONE-PROPOSAL.md` - Documentation complète avec mapping des ligues

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

### 2025-11-06 - Fix: Connexions multiples à Miles Republic

**Problème résolu :** Au chargement d'une page de propositions, l'API créait 20+ connexions simultanées à Miles Republic au lieu de réutiliser une connexion unique.

#### Symptômes
```
info: Connexion créée pour: localhost
info: Connexion établie à la base de données: localhost
[... répété 20+ fois ...]
```

#### Cause
La fonction `enrichProposal()` appelée pour chaque proposition (via `Promise.all()`) initialisait `DatabaseManager` mais ne cachait pas la **connexion Prisma** elle-même. Chaque appel concurrent exécutait `getConnection()` qui, bien que retournant la même connexion depuis le cache du `DatabaseManager`, créait quand même une initialisation multiple due à la concurrence.

#### Solution
**Cacher la connexion Prisma au niveau du module** dans `apps/api/src/routes/proposals.ts` :

```typescript
// Variables de cache au niveau module
let enrichProposalDbManager: any = null
let milesRepublicConnectionId: string | null = null
let milesRepublicConnection: any = null // ✅ Cache la connexion Prisma

export async function enrichProposal(proposal: any) {
  // Initialisation lazy UNIQUE au premier appel
  if (!milesRepublicConnection) {
    // ... initialiser DatabaseManager
    milesRepublicConnection = await enrichProposalDbManager.getConnection(id)
  }
  
  // ✅ Réutiliser la connexion en cache
  const connection = milesRepublicConnection
}
```

#### Bénéfices
- **Performance** : 1 seule connexion au lieu de 20+
- **Scalabilité** : Pas d'épuisement du pool PostgreSQL
- **Logs propres** : 1 ligne au lieu de 20+
- **Coût réduit** : Moins de ressources réseau/DB

#### Documentation
- `docs/DATABASE-CONNECTION-POOLING.md` - Documentation complète du problème et de la solution

### 2025-11-06 - Fix: Déduplication propositions et progression scraper

**Problèmes résolus :**
1. 🔴 Propositions dupliquées (race condition dans déduplication)
2. 🟡 État d'avancement refaisant la dernière combinaison ligue-mois

#### Problème 1 : Propositions dupliquées

**Symptômes** : Plusieurs propositions identiques pour la même édition (ex: 3 propositions identiques pour `10172-40098`).

**Cause** : Race condition lors de la déduplication. Les propositions étaient créées en mémoire pendant le traitement de toutes les compétitions, puis sauvegardées en batch à la fin. Si plusieurs compétitions matchaient la même édition, la requête Prisma de vérification ne voyait que les propositions déjà persistées en DB, pas celles en mémoire.

**Solution** : Cache en mémoire partagé entre toutes les compétitions d'un même run.

```typescript
// Dans run() - ligne 915
const proposalsCache = new Map<string, Set<string>>()
// Map<editionId, Set<changeHash>>

// Vérification dans createProposalsForCompetition() - lignes 798-817
if (proposalsCache) {
  const changeHash = crypto.createHash('sha256')
    .update(JSON.stringify(changes))
    .digest('hex')
  const cacheKey = matchResult.edition.id.toString()
  
  if (!proposalsCache.has(cacheKey)) {
    proposalsCache.set(cacheKey, new Set())
  }
  
  if (proposalsCache.get(cacheKey)!.has(changeHash)) {
    // ✅ Déjà créée dans ce run, skip
    return proposals
  }
  
  proposalsCache.get(cacheKey)!.add(changeHash)
}
```

**Résultat** : Double protection
1. Vérification DB : propositions déjà persistées
2. Vérification cache : propositions créées dans ce run

#### Problème 2 : Progression perdue après crash

**Symptômes** : Après un crash/erreur, le scraper refait la dernière combinaison ligue-mois.

**Cause** : Sauvegarde tardive de la progression. Le mois était marqué comme complété en mémoire, mais `saveProgress()` n'était appelé qu'après le traitement de toutes les ligues/mois.

**Solution** : Sauvegarde immédiate après chaque mois complété.

```typescript
// Ligne 965-966
await this.saveProgress(progress)
context.logger.info(`💾 Progression sauvegardée: ${ligue} - ${month}`)
```

**Bénéfices** :
- ✅ Crash pendant `Février` → Janvier déjà sauvegardé → reprend à Février
- ✅ Pas de perte de progression
- ✅ Idempotence : refaire un mois n'est pas grave (déduplication en place)

#### Impact performances

- **Cache mémoire** : O(P) mémoire, mais évite P² requêtes Prisma potentielles → **gain net**
- **Sauvegarde progressive** : N×M écritures DB au lieu de 1, mais négligeable (AgentState) → **résilience prioritaire**

#### Documentation
- `docs/FIX-DEDUPLICATION-PROGRESSION.md` - Documentation complète avec diagrammes et tests
