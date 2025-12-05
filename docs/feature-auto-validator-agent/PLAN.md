# Plan : Agent Auto-Validateur de Propositions

## Objectif

Créer un nouvel agent de type `VALIDATOR` qui valide automatiquement les propositions `PENDING` créées par l'agent FFA, sous certaines conditions strictes.

## Critères de validation automatique

Une proposition peut être validée automatiquement si **TOUTES** les conditions suivantes sont remplies :

### Conditions sur la proposition

| Critère | Valeur attendue | Justification |
|---------|-----------------|---------------|
| `type` | `EDITION_UPDATE` | Seules les mises à jour d'éditions existantes |
| `status` | `PENDING` | Propositions non encore traitées |
| `agentId` | ID de "FFA Scraper" | Seules les propositions de l'agent FFA sont éligibles |

### Conditions sur l'événement (Miles Republic)

| Critère | Valeur attendue | Justification |
|---------|-----------------|---------------|
| `Event.isFeatured` | `false` ou `null` | Les événements featured sont gérés manuellement |

### Conditions sur l'édition (Miles Republic)

| Critère | Valeur attendue | Justification |
|---------|-----------------|---------------|
| `Edition.customerType` | `null` | Éditions sans client premium associé |

### Conditions sur les courses (dans `changes`)

| Critère | Valeur attendue | Justification |
|---------|-----------------|---------------|
| Pas de nouvelles courses | `changes.races` ne contient que des `raceId` existants | L'agent ne peut pas créer de courses |

## Blocs validables

L'agent pourra valider les blocs suivants :
- `edition` - Modifications de l'édition (dates, URLs, etc.)
- `organizer` - Modifications de l'organisateur
- `races` - Modifications des courses **existantes** uniquement

> **Note :** Le bloc `event` n'est pas validable car les propositions `EDITION_UPDATE` ne modifient pas les événements.

## Architecture

### Nouveau fichier agent

```
apps/agents/src/
├── AutoValidatorAgent.ts          # Nouvel agent
├── auto-validator/
│   └── validator.ts               # Logique de validation
└── registry/
    └── auto-validator.ts          # Enregistrement
```

### Schéma de l'agent

```typescript
// AutoValidatorAgent.ts
export class AutoValidatorAgent extends BaseAgent {
  static readonly VERSION = '1.0.0'
  
  async run(context: AgentContext): Promise<AgentRunResult> {
    // 1. Récupérer les propositions PENDING de type EDITION_UPDATE
    // 2. Pour chaque proposition :
    //    a. Récupérer l'Event et l'Edition depuis Miles Republic
    //    b. Vérifier les critères (isFeatured, customerType)
    //    c. Vérifier que les courses proposées existent déjà
    //    d. Si tout OK, valider les blocs edition/organizer/races
    // 3. Retourner le résultat
  }
}
```

### Type d'agent

L'agent sera de type `VALIDATOR` (existe déjà dans l'enum `AgentType`).

## Flux de validation

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoValidatorAgent                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Récupérer propositions éligibles                         │
│     FROM proposals p                                         │
│     JOIN agents a ON p.agentId = a.id                        │
│     WHERE p.status = 'PENDING'                               │
│       AND p.type = 'EDITION_UPDATE'                          │
│       AND a.name = 'FFA Scraper'                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Pour chaque proposition                                  │
│     ┌───────────────────────────────────────────────────┐   │
│     │  a. Charger Event depuis Miles Republic           │   │
│     │     → Vérifier isFeatured = false/null            │   │
│     └───────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│     ┌───────────────────────────────────────────────────┐   │
│     │  b. Charger Edition depuis Miles Republic         │   │
│     │     → Vérifier customerType = null                │   │
│     └───────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│     ┌───────────────────────────────────────────────────┐   │
│     │  c. Analyser changes.races                        │   │
│     │     → Vérifier que tous les raceId existent       │   │
│     │     → Rejeter si création de nouvelle course      │   │
│     └───────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│     ┌───────────────────────────────────────────────────┐   │
│     │  d. Si critères OK → Valider blocs                │   │
│     │     - Marquer approvedBlocks: edition/organizer/  │   │
│     │       races                                       │   │
│     │     - Changer status → APPROVED                   │   │
│     │     - Créer ProposalApplication PENDING           │   │
│     └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Retourner résumé                                         │
│     - Nombre de propositions analysées                       │
│     - Nombre de propositions validées                        │
│     - Nombre de propositions ignorées (avec raisons)         │
└─────────────────────────────────────────────────────────────┘
```

## Détection des nouvelles courses

Pour déterminer si une proposition propose de **créer** de nouvelles courses (ce qui est interdit), on analysera la structure de `changes` :

```typescript
interface ProposalChanges {
  // Champs édition...
  races?: RaceChange[]
}

interface RaceChange {
  raceId?: number    // Si présent → mise à jour d'une course existante
  // Si raceId absent → création d'une nouvelle course (INTERDIT)
  name?: { old?: string, new: string, confidence: number }
  startDate?: { old?: string, new: string, confidence: number }
  // ...autres champs
}
```

**Règle :** Si `races[]` contient un élément sans `raceId`, la proposition est rejetée pour validation automatique.

## Configuration de l'agent

### Base de données (table `agents`)

```sql
INSERT INTO agents (id, name, type, isActive, frequency, config) VALUES (
  'auto-validator-agent',
  'Auto Validator',
  'VALIDATOR',
  true,
  '0 * * * *',  -- Toutes les heures
  '{
    "milesRepublicDatabase": "miles-republic",
    "maxProposalsPerRun": 100,
    "minConfidence": 0.7,
    "enableEditionBlock": true,
    "enableOrganizerBlock": true,
    "enableRacesBlock": true,
    "dryRun": false
  }'
);
```

### Sources de données

| Base de données | Usage |
|-----------------|-------|
| **data-agents** (implicite) | Lecture des propositions PENDING, mise à jour des statuts |
| **Miles Republic** (configurable) | Vérification de `Event.isFeatured` et `Edition.customerType` |

> **Note :** Les propositions sont lues depuis la base data-agents (base de l'application), pas besoin de la configurer. Seule la connexion à Miles Republic est nécessaire pour vérifier les critères d'éligibilité.

### Options de configuration

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `milesRepublicDatabase` | string | `"miles-republic"` | Connexion à Miles Republic pour vérifier Event/Edition |
| `maxProposalsPerRun` | number | `100` | Limite de propositions par exécution |
| `minConfidence` | number | `0.7` | Confiance minimale pour auto-valider (0.0 - 1.0) |
| `enableEditionBlock` | boolean | `true` | Activer la validation automatique du bloc `edition` |
| `enableOrganizerBlock` | boolean | `true` | Activer la validation automatique du bloc `organizer` |
| `enableRacesBlock` | boolean | `true` | Activer la validation automatique du bloc `races` |
| `dryRun` | boolean | `false` | Mode simulation (log sans valider réellement) |

### Schéma de configuration (UI Dashboard)

```typescript
// AutoValidatorAgent.configSchema.ts
export const AutoValidatorAgentConfigSchema: ConfigSchema = {
  title: "Configuration Auto Validator Agent",
  description: "Agent qui valide automatiquement les propositions FFA sous certaines conditions",
  categories: [
    {
      id: "validation",
      label: "Validation",
      description: "Critères de validation automatique"
    },
    {
      id: "blocks",
      label: "Blocs",
      description: "Blocs à valider automatiquement"
    },
    {
      id: "advanced",
      label: "Avancé",
      description: "Options avancées"
    }
  ],
  fields: [
    // Validation
    {
      name: "milesRepublicDatabase",
      label: "Base Miles Republic",
      type: "select",
      category: "validation",
      required: true,
      description: "Connexion à Miles Republic pour vérifier les critères",
      helpText: "Utilisée pour vérifier isFeatured et customerType",
      options: [], // Rempli dynamiquement avec les connexions disponibles
      validation: { required: true }
    },
    {
      name: "minConfidence",
      label: "Confiance minimale",
      type: "slider",
      category: "validation",
      required: true,
      defaultValue: 0.7,
      description: "Confiance minimale requise pour auto-valider",
      helpText: "Les propositions avec une confiance inférieure seront ignorées",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "maxProposalsPerRun",
      label: "Propositions max par run",
      type: "number",
      category: "validation",
      required: true,
      defaultValue: 100,
      description: "Nombre maximum de propositions à traiter par exécution",
      helpText: "Limite pour éviter les runs trop longs",
      validation: { required: true, min: 10, max: 500 }
    },

    // Blocs
    {
      name: "enableEditionBlock",
      label: "Valider bloc Edition",
      type: "boolean",
      category: "blocks",
      required: false,
      defaultValue: true,
      description: "Valider automatiquement les modifications d'édition",
      helpText: "Dates, URLs, infos générales de l'édition"
    },
    {
      name: "enableOrganizerBlock",
      label: "Valider bloc Organisateur",
      type: "boolean",
      category: "blocks",
      required: false,
      defaultValue: true,
      description: "Valider automatiquement les modifications d'organisateur",
      helpText: "Nom, contact, URLs de l'organisateur"
    },
    {
      name: "enableRacesBlock",
      label: "Valider bloc Courses",
      type: "boolean",
      category: "blocks",
      required: false,
      defaultValue: true,
      description: "Valider automatiquement les modifications de courses existantes",
      helpText: "⚠️ Ne crée jamais de nouvelles courses"
    },

    // Avancé
    {
      name: "dryRun",
      label: "Mode simulation",
      type: "boolean",
      category: "advanced",
      required: false,
      defaultValue: false,
      description: "Simuler sans appliquer les validations",
      helpText: "Utile pour tester la configuration avant activation"
    }
  ]
}
```

### Paramètres détaillés

#### `minConfidence` - Confiance minimale

Ce paramètre permet de filtrer les propositions selon leur score de confiance calculé par l'agent FFA :

| Valeur | Comportement |
|--------|--------------|
| `0.5` | Très permissif - valide même les matchs incertains |
| `0.7` | **Recommandé** - bon équilibre précision/couverture |
| `0.8` | Conservateur - uniquement les matchs sûrs |
| `0.9` | Très strict - quasi-certains uniquement |

#### `enableXxxBlock` - Activation par bloc

Permet de désactiver certains types de validations si besoin :

| Scénario | Edition | Organizer | Races |
|----------|---------|-----------|-------|
| **Défaut** | ✅ | ✅ | ✅ |
| Test prudent | ✅ | ❌ | ❌ |
| Sans organisateur | ✅ | ❌ | ✅ |

#### `dryRun` - Mode simulation

En mode `dryRun: true` :
- L'agent analyse toutes les propositions normalement
- Les logs indiquent ce qui **serait** validé
- Aucune modification en base de données
- Utile pour valider la configuration avant mise en production

## Sécurités et garde-fous

### Propositions ignorées (non validées)

L'agent **NE validera PAS** les propositions suivantes :

1. **Type différent de EDITION_UPDATE**
   - `NEW_EVENT` → Création d'événement = validation manuelle
   - `EVENT_UPDATE` → Modification d'événement = validation manuelle
   - `RACE_UPDATE` → Cas spécial à évaluer

2. **Événement featured**
   - `Event.isFeatured = true` → Événement mis en avant = validation manuelle

3. **Édition avec client**
   - `Edition.customerType != null` → Client payant = validation manuelle

4. **Création de nouvelles courses**
   - Proposition contient des races sans `raceId` → Validation manuelle

5. **Proposition d'un autre agent**
   - Agent source non dans `config.sourceAgents` → Ignorée

### Logging détaillé

Chaque proposition analysée génère un log avec :
- ID de la proposition
- Raison de validation ou de rejet
- Temps de traitement

## Tâches d'implémentation

### Phase 1 : Structure de base

1. [ ] Créer `apps/agents/src/AutoValidatorAgent.ts`
2. [ ] Créer `apps/agents/src/auto-validator/validator.ts`
3. [ ] Créer `apps/agents/src/registry/auto-validator.ts`
4. [ ] Ajouter la version dans `packages/types/src/agent-versions.ts`

### Phase 2 : Logique de validation

5. [ ] Implémenter la récupération des propositions éligibles
6. [ ] Implémenter la vérification `Event.isFeatured`
7. [ ] Implémenter la vérification `Edition.customerType`
8. [ ] Implémenter la détection de nouvelles courses dans `changes`
9. [ ] Implémenter la validation des blocs (edition/organizer/races)

### Phase 3 : Création des ProposalApplication

10. [ ] Créer `ProposalApplication` avec status `PENDING` pour chaque proposition validée
11. [ ] Mettre à jour le status de la proposition → `APPROVED`
12. [ ] Mettre à jour `approvedBlocks` avec les blocs validés

### Phase 4 : Tests et documentation

13. [ ] Écrire des tests unitaires pour la logique de validation
14. [ ] Écrire des tests d'intégration
15. [ ] Documenter l'agent dans le README

### Phase 5 : Déploiement

16. [ ] Ajouter l'agent dans la base de données (seed ou migration)
17. [ ] Tester en environnement de staging
18. [ ] Activer en production

## Estimation

| Phase | Complexité | Description |
|-------|------------|-------------|
| Phase 1 | Faible | Scaffolding, structure de fichiers |
| Phase 2 | Moyenne | Logique métier, requêtes DB |
| Phase 3 | Faible | Intégration avec ProposalApplicationService |
| Phase 4 | Moyenne | Tests exhaustifs |
| Phase 5 | Faible | Configuration et déploiement |

## Questions ouvertes

### 1. Faut-il aussi gérer `RACE_UPDATE` ?

Les propositions `RACE_UPDATE` concernent une seule course. On pourrait les valider automatiquement si :
- `Event.isFeatured = false`
- `Edition.customerType = null`
- La course existe déjà

**Recommandation :** Commencer par `EDITION_UPDATE` uniquement, puis étendre à `RACE_UPDATE` dans une v1.1.

### 2. Faut-il créer automatiquement les `ProposalApplication` ?

**Oui**, car une proposition `APPROVED` devrait avoir une `ProposalApplication` avec status `PENDING` prête à être appliquée.

### 3. Fréquence d'exécution

**Recommandation :** Toutes les heures (`0 * * * *`) semble un bon compromis entre réactivité et charge serveur. Configurable via `frequency` dans la config agent.

### 4. Notification des validations automatiques

Faut-il notifier l'équipe des validations automatiques ?
- Option A : Pas de notification, juste des logs
- Option B : Email récapitulatif quotidien
- Option C : Webhook/Slack pour chaque validation

**Recommandation :** Commencer par l'option A (logs uniquement), ajouter notifications plus tard si besoin.

## Risques identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Validation erronée d'une proposition | Moyen | Critères stricts, logs détaillés, rollback possible |
| Surcharge si beaucoup de propositions | Faible | `maxProposalsPerRun` limite le batch |
| Race condition avec validation manuelle | Faible | Vérifier status avant validation |

## Interface Dashboard

### Page Agent (détail)

La page de l'agent Auto Validator affichera les mêmes informations que les autres agents :

| Section | Contenu |
|---------|---------|
| **Header** | Nom, type (VALIDATOR), statut (actif/inactif), version |
| **Dernier run** | Date, durée, statut (SUCCESS/FAILED), résumé |
| **Logs** | Liste des logs du dernier run (avec niveau DEBUG/INFO/WARN/ERROR) |
| **Historique** | Liste des runs précédents avec pagination |
| **Configuration** | Paramètres de l'agent (sourceAgents, maxProposalsPerRun, etc.) |

### Sidebar (statistiques)

La sidebar affichera :

#### État du dernier run

```
┌─────────────────────────────────┐
│  Dernier run                    │
│  ─────────────────────────────  │
│  📅 04/12/2025 14:00            │
│  ⏱️  Durée: 12s                  │
│  ✅ Statut: SUCCESS             │
│                                 │
│  Résultat:                      │
│  • 45 propositions analysées    │
│  • 32 validées automatiquement  │
│  • 13 ignorées                  │
└─────────────────────────────────┘
```

#### Statistiques globales

```
┌─────────────────────────────────┐
│  Statistiques globales          │
│  ─────────────────────────────  │
│  📊 Total runs: 156             │
│  ✅ Succès: 154 (98.7%)         │
│  ❌ Échecs: 2 (1.3%)            │
│                                 │
│  📝 Propositions:               │
│  • Analysées: 4,520             │
│  • Validées: 3,180 (70.4%)      │
│  • Ignorées: 1,340 (29.6%)      │
│                                 │
│  🔍 Raisons d'exclusion:        │
│  • Featured: 245                │
│  • Client premium: 412          │
│  • Nouvelles courses: 683       │
└─────────────────────────────────┘
```

### Données à stocker

Pour alimenter ces statistiques, le `result` de chaque `AgentRun` contiendra :

```typescript
interface AutoValidatorRunResult {
  // Compteurs du run
  proposalsAnalyzed: number
  proposalsValidated: number
  proposalsIgnored: number
  
  // Détail des exclusions
  exclusionReasons: {
    featuredEvent: number
    premiumCustomer: number
    newRaces: number
    otherAgent: number  // Si on étend à d'autres agents plus tard
  }
  
  // Liste des propositions traitées (pour le log détaillé)
  processedProposals: {
    id: string
    eventName: string
    action: 'validated' | 'ignored'
    reason?: string
  }[]
}
```

### État d'avancement (AgentState)

L'agent stockera son état via `AgentState` :

```typescript
// Clé: 'stats'
interface AutoValidatorStats {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  totalProposalsAnalyzed: number
  totalProposalsValidated: number
  totalProposalsIgnored: number
  exclusionBreakdown: {
    featuredEvent: number
    premiumCustomer: number
    newRaces: number
  }
  lastRunAt: string  // ISO date
}
```

Ces stats seront mises à jour à la fin de chaque run.

## Métriques de succès

- Nombre de propositions validées automatiquement / mois
- Taux de validations automatiques vs manuelles
- Temps moyen de traitement par proposition
- Nombre d'erreurs post-validation (rollbacks)
