# Implementation : Agent Auto-Validateur de Propositions

## Statut : Phase 1 Complete

Date : 2025-12-05

## Fichiers Créés

### Structure de l'agent

```
apps/agents/src/
├── AutoValidatorAgent.ts              # Agent principal
├── AutoValidatorAgent.configSchema.ts # Schéma de configuration UI
├── auto-validator/
│   ├── types.ts                       # Types TypeScript
│   └── validator.ts                   # Logique de validation
└── registry/
    └── auto-validator.ts              # Enregistrement dans le registry
```

### Modifications de fichiers existants

| Fichier | Modification |
|---------|--------------|
| `packages/types/src/agent-versions.ts` | Ajout de `AUTO_VALIDATOR_AGENT: '1.0.0'` |
| `apps/agents/src/index.ts` | Export et enregistrement de l'AutoValidatorAgent |

## Architecture

### AutoValidatorAgent.ts

Agent de type `VALIDATOR` qui hérite de `BaseAgent`. Il implémente :

- `run(context)` : Méthode principale d'exécution
- `validate()` : Validation de la configuration
- `initializeSourceConnection()` : Connexion à Miles Republic
- `getEligibleProposals()` : Récupération des propositions PENDING
- `validateAndApproveProposal()` : Validation et création des ProposalApplication

### auto-validator/validator.ts

Module contenant la logique de validation avec les critères :

1. **Confiance minimale** : `proposal.confidence >= config.minConfidence`
2. **Event non featured** : `Event.isFeatured = false/null`
3. **Edition sans client premium** : `Edition.customerType = null`
4. **Pas de nouvelles courses** : Tous les `raceId` doivent exister

### auto-validator/types.ts

Types TypeScript :

- `AutoValidatorConfig` : Configuration de l'agent
- `ValidationResult` : Résultat de validation d'une proposition
- `AutoValidatorRunResult` : Résultat d'un run complet
- `AutoValidatorStats` : Statistiques globales (AgentState)
- `ExclusionReason` : Raisons d'exclusion possibles
- `RaceChange` : Structure des changements de courses

## Configuration

### Paramètres disponibles

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `milesRepublicDatabase` | string | - | Connexion à Miles Republic (requis) |
| `maxProposalsPerRun` | number | 100 | Limite de propositions par exécution |
| `minConfidence` | number | 0.7 | Confiance minimale (0.5 - 1.0) |
| `enableEditionBlock` | boolean | true | Valider le bloc edition |
| `enableOrganizerBlock` | boolean | true | Valider le bloc organizer |
| `enableRacesBlock` | boolean | true | Valider le bloc races |
| `dryRun` | boolean | false | Mode simulation |

### Fréquence par défaut

`0 * * * *` - Toutes les heures

## Flux de Validation

```
1. Récupérer les propositions éligibles
   - status = PENDING
   - type = EDITION_UPDATE
   - agentId = FFA Scraper

2. Pour chaque proposition :
   a. Vérifier confiance >= minConfidence
   b. Charger Event depuis Miles Republic
      → Vérifier isFeatured = false/null
   c. Charger Edition depuis Miles Republic
      → Vérifier customerType = null
   d. Analyser changes.races
      → Rejeter si création de nouvelles courses

3. Si tous les critères OK :
   a. Déterminer les blocs à valider (edition/organizer/races)
   b. Créer une ProposalApplication PENDING par bloc
   c. Mettre à jour proposal.approvedBlocks
   d. Mettre à jour proposal.status (APPROVED ou PARTIALLY_APPROVED)

4. Mettre à jour les statistiques globales (AgentState)
```

## Statistiques

L'agent maintient des statistiques via `AgentState` (clé: `stats`) :

```typescript
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
    lowConfidence: number
    otherAgent: number
  }
  lastRunAt: string
}
```

## Sécurités

### Propositions NON validées automatiquement

- Type différent de `EDITION_UPDATE`
- Événement featured (`isFeatured = true`)
- Édition avec client premium (`customerType != null`)
- Création de nouvelles courses (races sans `raceId`)
- Confiance inférieure au seuil configuré

### Mode Dry Run

Avec `dryRun: true` :
- Analyse normale des propositions
- Logs détaillés de ce qui serait validé
- Aucune modification en base de données

## Tests

### Tests unitaires (`validator.test.ts`)

19 tests couvrant :
- Confiance minimale (3 tests)
- Event.isFeatured (3 tests)
- Edition.customerType (2 tests)
- Nouvelles courses (3 tests)
- Gestion des erreurs (2 tests)
- getValidatableBlocks (6 tests)

### Tests d'intégration (`integration.test.ts`)

7 tests utilisant les bases de données de test :
- Validation avec vraies données Miles Republic (3 tests)
- Workflow complet de validation (2 tests)
- Détection des nouvelles courses (1 test)
- Confiance minimale configurable (1 test)

### Lancer les tests

```bash
# Tests unitaires
npm run test -- --testPathPatterns="auto-validator/validator.test"

# Tests d'intégration
npm run test -- --testPathPatterns="auto-validator/integration.test"

# Tous les tests auto-validator
npm run test -- --testPathPatterns="auto-validator"
```

## Prochaines Étapes

### Phase 2 : Déploiement

- [ ] Créer l'agent en base de données (seed ou admin UI)
- [ ] Configurer la connexion Miles Republic
- [ ] Tester en mode dry run
- [ ] Activer en production

## Utilisation

### Création de l'agent via API

```bash
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto Validator",
    "type": "VALIDATOR",
    "frequency": "0 * * * *",
    "isActive": true,
    "config": {
      "milesRepublicDatabase": "miles-republic",
      "maxProposalsPerRun": 100,
      "minConfidence": 0.7,
      "enableEditionBlock": true,
      "enableOrganizerBlock": true,
      "enableRacesBlock": true,
      "dryRun": false
    }
  }'
```

### Exécution manuelle

```bash
curl -X POST http://localhost:3001/api/agents/{agentId}/run
```

## Ressources

- Plan initial : `docs/feature-auto-validator-agent/PLAN.md`
- Agent FFA Scraper : `apps/agents/src/FFAScraperAgent.ts`
- Documentation matching FFA : `apps/agents/src/ffa/MATCHING.md`
