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
- **Pénalité temporelle** : ~4% pour 13 jours d'écart (multiplicateur 95.7%)
  - Formule : `dateMultiplier = 0.7 + (dateProximity * 0.3)`
  - `dateProximity = 1 - (daysDiff / 90)`

| Écart | dateProximity | Multiplicateur | Pénalité |
|-------|---------------|----------------|----------|
| 0 jours | 1.0 | 100% | 0% |
| 13 jours | 0.856 | 95.7% | -4.3% |
| 45 jours | 0.5 | 85% | -15% |
| 90 jours | 0.0 | 70% | -30% |

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
