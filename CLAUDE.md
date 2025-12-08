# Règles Claude Code pour Data Agents

Ce document contient les règles et bonnes pratiques spécifiques au projet Data Agents pour l'assistant Claude Code.

## Changelog

### 2025-12-08 - Fix: Application races non créée lors de validation groupée ✅

**Problème résolu** : Lors de la validation du bloc `races` pour une proposition groupée, si une autre proposition du groupe avait déjà une `ProposalApplication` de type `races` avec statut `APPLIED`, le système mettait à jour cette application existante au lieu d'en créer une nouvelle.

#### Symptômes

1. Utilisateur valide le bloc `races` pour la proposition A
2. L'application `races` est créée et appliquée (`APPLIED`)
3. Utilisateur valide le bloc `races` pour la proposition B (même groupe)
4. Le système trouve l'application `APPLIED` de la proposition A
5. Il **met à jour** cette application au lieu d'en créer une nouvelle
6. Résultat : les courses de la proposition B ne sont jamais appliquées

#### Cause

La requête de détection d'application existante incluait `status: { in: ['PENDING', 'APPLIED'] }` au lieu de seulement `status: 'PENDING'`.

#### Solution

```typescript
// AVANT (bug)
const existingAppForBlock = await db.prisma.proposalApplication.findFirst({
  where: {
    proposalId: { in: proposalIds },
    blockType: block,
    status: { in: ['PENDING', 'APPLIED'] }  // ❌ Trouve les APPLIED
  }
})

// APRÈS (fix)
const existingPendingApp = await db.prisma.proposalApplication.findFirst({
  where: {
    proposalId: { in: proposalIds },
    blockType: block,
    status: 'PENDING'  // ✅ Seulement PENDING
  }
})
```

#### Fichiers modifiés

- Backend : `apps/api/src/routes/proposals.ts` (endpoint `validate-block-group`)

---

### 2025-12-04 - Application automatique des mises à jour PENDING ✅

**Fonctionnalité ajoutée** : Nouvelle option dans le panneau d'Administration permettant d'appliquer automatiquement et périodiquement les `ProposalApplication` en statut `PENDING`.

#### Fonctionnalités

- **Switch d'activation** : Active/désactive le scheduler automatique
- **Intervalle configurable** : Entre 5 minutes et 24 heures
- **Statut en temps réel** : Scheduler actif/inactif, prochaine exécution, dernière exécution avec résultats
- **Bouton "Exécuter maintenant"** : Lance une exécution manuelle immédiate
- **Tri topologique** : Les applications sont triées par dépendances (event → edition → organizer → races)

#### Nouveaux endpoints API

| Endpoint | Description |
|----------|-------------|
| `GET /api/settings/auto-apply-status` | Statut du scheduler et résultats |
| `POST /api/settings/run-auto-apply` | Exécution manuelle immédiate |

#### Fichiers créés/modifiés

- `packages/database/prisma/schema.prisma` : +5 champs Settings
- `apps/api/src/services/update-auto-apply-scheduler.ts` : **Nouveau** service scheduler
- `apps/api/src/config/settings.ts` : Interface + méthodes auto-apply
- `apps/api/src/routes/settings.ts` : Nouveaux endpoints
- `apps/api/src/index.ts` : Intégration scheduler au démarrage
- `apps/dashboard/src/pages/Settings.tsx` : Nouvelle section UI

#### Ressources

- Documentation complète : `docs/feature-auto-apply-pending-updates/IMPLEMENTATION.md`
- Plan initial : `docs/feature-auto-apply-pending-updates/PLAN.md`

---

### 2025-12-03 - Tri topologique dans UpdateGroupDetail (Phase 4) ✅

**Problème résolu** : Dans la page `/updates/:groupId`, les boutons "Appliquer tous les blocs" et "Rejouer tous les blocs" appliquaient les `ProposalApplication` dans l'ordre de création au lieu de respecter les dépendances entre blocs.

#### Symptômes

Pour une proposition **NEW_EVENT** avec validation dans le désordre :
1. Utilisateur valide `races` (14:30)
2. Utilisateur valide `event` (14:35)
3. Utilisateur valide `edition` (14:40)
4. Clic "Appliquer tous les blocs" → ❌ **Erreurs FK** (races appliquée avant edition)

#### Solution

Réutilisation du module `block-execution-order` (Phase 1) :

```typescript
import { sortBlocksByDependencies, explainExecutionOrder } from '@data-agents/database'

const sortedApps = sortBlocksByDependencies(pendingApps)
console.log('📋 ' + explainExecutionOrder(sortedApps))
// 📋 Ordre d'exécution: event → edition → races

for (const app of sortedApps) {
  await applyUpdateMutation.mutateAsync(app.id)
}
```

#### Résultats

| Aspect | Avant | Après |
|--------|-------|-------|
| **Ordre** | ❌ Ordre de création (races → event → edition) | ✅ Ordre dépendances (event → edition → races) |
| **Erreurs FK** | ⚠️ Fréquentes | ✅ Impossibles |
| **Cohérence** | ❌ Backend OK, Frontend bugé | ✅ Backend + Frontend |

#### Fichiers modifiés

- Frontend : `apps/dashboard/src/pages/UpdateGroupDetail.tsx`
  - `handleApplyAllBlocks()` : Tri topologique ajouté
  - `handleReplayAllBlocks()` : Tri topologique ajouté

#### Ressources

- Documentation complète : `docs/BLOCK-EXECUTION-ORDER-PHASE4.md`
- Summary : `docs/BLOCK-EXECUTION-ORDER-SUMMARY.md`
- Module partagé : `packages/database/src/services/block-execution-order.ts`

---

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

#### Fichiers modifiés

- Backend : `apps/api/src/routes/proposals.ts` (endpoint `validate-block-group`)

#### Ressources

- Documentation complète : `docs/FIX-DUPLICATE-BLOCK-VALIDATION-UPDATES.md`
- Problème lié : `DUPLICATE_UPDATES_FIX.md` (fix similaire pour autres endpoints)

---

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

Claude Code ne doit pas relancer de serveur puisqu'il est déjà lancé en mode dev. Les serveurs reprennent automatiquement et immédiatement tous les changements réalisés dans le code grâce au hot reload.

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

## Gestion des Timezones et DST

### ⚠️ IMPORTANT - Conversion heures locales → UTC

**Problème historique** : Approximation DST incorrecte causait un décalage d'1h pour les événements aux dates de changement d'heure.

**Solution (2025-11-10)** : Utilisation de `date-fns-tz` pour conversion précise.

**TOUJOURS utiliser `zonedTimeToUtc` pour convertir les heures locales en UTC** :

```typescript
import { zonedTimeToUtc } from 'date-fns-tz'

// ✅ CORRECT - Conversion précise avec gestion DST
const localDateStr = '2025-03-30 14:00:00' // Date en heure locale française
const utcDate = zonedTimeToUtc(localDateStr, 'Europe/Paris')

// ❌ INCORRECT - Approximation manuelle DST
const utcDate = new Date(localDateStr + 'Z') // Suppose UTC+0
```

**Fichiers concernés :**
- `apps/agents/src/FFAScraperAgent.ts` - Conversion dates FFA
- `apps/agents/src/GoogleSearchDateAgent.ts` - Conversion dates recherche Google
- Tout code manipulant des dates d'événements

## Git et Commits

### Workflow Git

**Avant de committer** :
1. Vérifier les modifications avec `git status` et `git diff`
2. S'assurer que tous les tests passent
3. Vérifier que le build passe : `npm run build`
4. Vérifier les types TypeScript : `npm run tsc`

**Messages de commit** :
- Utiliser le format conventionnel : `type(scope): description`
- Types : `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Exemple : `feat(dashboard): Ajout validation par blocs pour propositions groupées`

**Branches** :
- `main` : Branche principale stable
- Créer une branche feature pour chaque nouvelle fonctionnalité
- Nom de branche : `feature/description-courte` ou `fix/description-bug`

## Tests et Qualité du Code

### Tests unitaires

**Framework** : Jest 30 + React Testing Library

**Lancer les tests** :
```bash
npm run test              # Tous les tests (mode watch)
npm run test:run          # Tous les tests (une seule fois)
npm run test:coverage     # Avec coverage

# Lancer un test spécifique (Jest 30 syntax)
npx jest --testPathPatterns="nomDuFichier"

# Dans le dashboard uniquement
cd apps/dashboard && npx jest --testPathPatterns="useProposalEditor"
```

**Structure des tests** :
```
apps/dashboard/src/
├── hooks/__tests__/           # Tests des hooks React
│   ├── useChangesTable.test.ts
│   └── useProposalEditor.addRace.test.ts
├── components/updates/__tests__/  # Tests des composants
└── test/
    └── setup.ts               # Configuration Jest (mocks globaux)
```

**Écrire des tests** :
- Utiliser Jest + React Testing Library pour le frontend
- Utiliser Jest pour le backend
- Couvrir les cas limites et les erreurs
- Mocker les appels API et base de données

**Pattern pour tester les hooks React** :
```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'

// Créer un wrapper avec les providers nécessaires
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>{children}</SnackbarProvider>
    </QueryClientProvider>
  )
}

// Tester le hook
const { result } = renderHook(() => useMyHook(), { wrapper: createWrapper() })

await waitFor(() => {
  expect(result.current.isLoading).toBe(false)
}, { timeout: 5000 })

act(() => {
  result.current.someAction()
})
```

**⚠️ Attention Jest 30** :
- L'option `--testPathPattern` est remplacée par `--testPathPatterns`
- Utiliser `jest.fn()` (pas `vi.fn()` qui est Vitest)

### Linting et Formatting

**Avant de committer** :
```bash
npm run lint              # Vérifier le linting
npm run lint:fix          # Corriger automatiquement
npm run format            # Formatter avec Prettier
```

## Déploiement

### Render.com

**Variables d'environnement** :
- Configurer toutes les variables d'environnement dans le dashboard Render
- Ne JAMAIS committer les fichiers `.env` dans le repo
- Utiliser `.env.example` comme template

**Build et démarrage** :
- Build command : `npm run build:prod`
- Start command : Défini dans le service Render

**Logs** :
- Consulter les logs dans le dashboard Render
- Les logs sont disponibles en temps réel
- Utiliser les logs pour debugger les erreurs de production

## Ressources et Documentation

### Documentation principale
- `WARP.md` - Règles pour l'assistant Warp (référence)
- `CLAUDE.md` - Ce fichier, règles pour Claude Code
- `README.md` - Documentation générale du projet

### Documentation technique
- `docs/` - Dossier contenant toute la documentation détaillée
- `apps/agents/src/ffa/MATCHING.md` - Algorithme de matching FFA
- `packages/*/README.md` - Documentation des packages individuels

### Liens utiles
- [Prisma Documentation](https://www.prisma.io/docs)
- [Material-UI Documentation](https://mui.com/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Miles Republic Schema](https://app.warp.dev/drive/notebook/Next-ke4tc02CYq8nPyEgErILtF)
