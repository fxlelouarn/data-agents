# Agent Slack @databot - Statut d'implémentation

> Dernière mise à jour : 2025-12-12

**Tech Debt** : Voir [TECH-DEBT.md](./TECH-DEBT.md) - Tech debt Phase 3 résolue le 2025-12-12.

## Vue d'ensemble

| Phase | Description | Statut |
|-------|-------------|--------|
| Phase 1 | Infrastructure Slack | ✅ Complète |
| Phase 2 | Extraction de données | ✅ Complète |
| Phase 2.5 | Migration vers architecture Agent | ✅ Complète |
| Phase 3 | Création de Proposals | ✅ Complète |
| Phase 4 | Interactions Slack (boutons) | ⏳ Partielle |
| Phase 5 | Système de relances | ⏳ Non commencée |
| Phase 6 | Notifications retour | ⏳ Non commencée |
| Phase 7 | Tests et polish | ⏳ Non commencée |

## Décision architecturale (2025-12-12)

**Décision** : Migrer l'intégration Slack vers l'architecture Agent (`@data-agents/agent-framework`)

**Raisons** :
- Activation/désactivation via dashboard (sans redéploiement)
- Configuration modifiable à chaud (channels, comportements)
- Visibilité dans la liste des agents
- Métriques et statistiques (runs, succès, erreurs)
- Historique des exécutions (`agent_runs`)
- État persistant (`agent_states`)

**Impact** : Phase 2.5 ajoutée avant Phase 3

---

## Phase 1 : Infrastructure Slack ✅

**Complétée le** : 2025-12-11

### Fichiers créés

| Fichier | Description |
|---------|-------------|
| `apps/api/src/services/slack/SlackService.ts` | Client Slack wrapper avec toutes les méthodes |
| `apps/api/src/routes/slack.ts` | Routes API pour webhooks Slack |

### Fonctionnalités

- [x] Initialisation du client Slack Web API
- [x] Vérification de signature des requêtes Slack
- [x] Gestion des réactions (ajout/suppression)
- [x] Envoi de messages (canal et thread)
- [x] Mise à jour de messages existants
- [x] Récupération d'infos utilisateur/canal/workspace
- [x] Téléchargement de fichiers Slack (authentifié)
- [x] Génération de permalinks vers les messages
- [x] Construction de `sourceMetadata` pour les Proposals
- [x] Extraction d'URLs depuis les messages Slack
- [x] Détection de mention du bot
- [x] Création de blocs interactifs (boutons)
- [x] Route `/api/slack/events` pour les webhooks
- [x] Route `/api/slack/interactions` pour les boutons

### Variables d'environnement requises

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_CHANNEL_ID=C...
MILES_REPUBLIC_DATABASE_URL=postgresql://...
```

---

## Phase 2 : Extraction de données ✅

**Complétée le** : 2025-12-12

### Fichiers créés

| Fichier | Description |
|---------|-------------|
| `apps/api/src/services/slack/extractors/types.ts` | Types et prompts d'extraction |
| `apps/api/src/services/slack/extractors/HtmlExtractor.ts` | Extraction depuis URLs/HTML |
| `apps/api/src/services/slack/extractors/ImageExtractor.ts` | Extraction depuis images (Claude Vision) |
| `apps/api/src/services/slack/extractors/TextExtractor.ts` | Extraction depuis texte brut |
| `apps/api/src/services/slack/extractors/EventDataExtractor.ts` | Orchestrateur d'extraction |
| `apps/api/src/services/slack/extractors/index.ts` | Exports du module |

### Fonctionnalités

#### HtmlExtractor
- [x] Fetch HTML avec timeout et headers appropriés
- [x] Parsing avec Cheerio (suppression nav/footer/scripts)
- [x] Extraction de données structurées JSON-LD
- [x] Détection de pages SPA (anti-hallucination)
- [x] Extraction avec Claude Haiku
- [x] Fallback vers Claude Sonnet si échec
- [x] Gestion des erreurs API (crédits, rate limit)

#### ImageExtractor
- [x] Téléchargement d'images depuis Slack (authentifié)
- [x] Support des buffers directs
- [x] Détection automatique du MIME type (magic bytes)
- [x] Limite de taille (20MB max)
- [x] Extraction avec Claude Vision (Haiku)
- [x] Fallback vers Claude Sonnet Vision
- [x] Gestion des erreurs API

#### TextExtractor
- [x] Extraction depuis texte brut
- [x] Nettoyage du texte (mentions, URLs)
- [x] Limite min/max de longueur
- [x] Extraction avec Claude Haiku
- [x] Fallback vers Claude Sonnet

#### EventDataExtractor (Orchestrateur)
- [x] Priorité : URL > Image > Texte
- [x] Validation des données extraites
- [x] Formatage pour affichage Slack
- [x] Labels des méthodes d'extraction

### Prompts anti-hallucination

Les prompts Claude incluent des règles strictes :
- Ne jamais inventer de données
- Confidence < 0.3 si pas de date trouvée
- Détection et rejet des pages SPA sans contenu

---

## Phase 2.5 : Migration vers architecture Agent ✅

**Statut** : Complète (2025-12-12)

### Objectif

Transformer le service Slack actuel (Express) en un vrai Agent pour bénéficier de :
- Toggle activation dans le dashboard
- Configuration JSON modifiable à chaud
- Métriques et historique des runs
- État persistant

### Implémenté

- [x] Créer `apps/agents/src/SlackEventAgent.ts` (extends BaseAgent)
- [x] Ajouter version dans `packages/types/src/agent-versions.ts`
- [x] Config JSON avec credentials (pattern GoogleSearchDateAgent)
- [x] Adapter le webhook API pour vérifier l'agent actif
- [x] Script de seed `scripts/seed-slack-agent.ts`
- [x] Schéma de configuration pour le dashboard

### Structure config Agent

Pattern identique à GoogleSearchDateAgent : config JSON prioritaire, fallback sur variables d'env.

```json
{
  "slackBotToken": "xoxb-...",
  "slackSigningSecret": "...",
  "anthropicApiKey": "sk-ant-...",
  "channels": [
    {
      "id": "C123456",
      "name": "data-events",
      "autoCreateProposal": true,
      "notifyOnValidation": true
    }
  ],
  "extraction": {
    "preferredModel": "haiku",
    "fallbackToSonnet": true,
    "maxImageSizeMB": 20
  },
  "reminders": {
    "enabled": true,
    "delayHours": 24,
    "maxReminders": 2
  }
}
```

---

## Phase 3 : Création de Proposals ✅

**Complétée le** : 2025-12-12

### Objectif

Intégrer le matching d'événements et créer des Proposals en base de données avec métadonnées Slack.

### Implémenté

- [x] **Mutualisation du service de matching** dans `packages/agent-framework/src/services/event-matching/`
  - `types.ts` - Types génériques pour le matching
  - `stopwords.ts` - Mots à ignorer lors du matching
  - `departments.ts` - Mapping départements français
  - `event-matcher.ts` - Algorithme de matching (fuse.js)
  - `index.ts` - Exports du service
- [x] **Wrapper FFA** - `apps/agents/src/ffa/matcher.ts` réécrit pour utiliser le service mutualisé
- [x] **Service SlackProposalService** - `apps/api/src/services/slack/SlackProposalService.ts`
  - Connexion à Miles Republic via Prisma
  - Conversion des données extraites en input de matching
  - Création de Proposals (NEW_EVENT ou EDITION_UPDATE)
  - Stockage de `sourceMetadata` avec infos Slack
  - Calcul de confiance basé sur le matching
- [x] **Migration Prisma** - Ajout du champ `sourceMetadata` à la table `proposals`
- [x] **Intégration dans le webhook** - `apps/api/src/routes/slack.ts`
  - Appel au service de création de Proposals
  - Affichage du type de match (nouveau/mise à jour)
  - Affichage du score de confiance
  - Boutons d'action avec proposalId réel

### Fichiers créés/modifiés

| Fichier | Action |
|---------|--------|
| `packages/agent-framework/src/services/event-matching/types.ts` | Créé |
| `packages/agent-framework/src/services/event-matching/stopwords.ts` | Créé |
| `packages/agent-framework/src/services/event-matching/departments.ts` | Créé |
| `packages/agent-framework/src/services/event-matching/event-matcher.ts` | Créé |
| `packages/agent-framework/src/services/event-matching/index.ts` | Créé |
| `packages/agent-framework/src/index.ts` | Modifié (exports) |
| `apps/agents/src/ffa/matcher.ts` | Réécrit (wrapper) |
| `apps/agents/src/FFAScraperAgent.ts` | Modifié (imports) |
| `apps/api/src/services/slack/SlackProposalService.ts` | Créé |
| `apps/api/src/routes/slack.ts` | Modifié (intégration) |
| `packages/database/prisma/schema.prisma` | Modifié (+sourceMetadata) |
| `packages/database/prisma/migrations/20251212120000_add_source_metadata/` | Créé |

### Structure sourceMetadata

```typescript
interface SlackSourceMetadata {
  type: 'SLACK'
  workspaceId: string
  workspaceName: string
  channelId: string
  channelName: string
  messageTs: string
  threadTs?: string
  userId: string
  userName: string
  messageLink: string
  sourceUrl?: string
  imageUrls?: string[]
  extractedAt: string
}
```

### Logique de matching

1. **Conversion** des données extraites en `EventMatchInput`
2. **Matching** avec les événements existants dans Miles Republic
3. **Décision** basée sur le score :
   - Score < 0.75 → NEW_EVENT (nouvel événement)
   - Score >= 0.75 → EDITION_UPDATE (mise à jour d'édition existante)
4. **Calcul de confiance** :
   - NEW_EVENT : confiance inversée (moins de match = plus confiant)
   - EDITION_UPDATE : confiance ajustée selon le match
5. **Création** de la Proposal avec justifications et rejectedMatches

---

## Phase 4 : Interactions Slack ⏳

**Statut** : Partielle

### Implémenté

- [x] Boutons "Valider" et "Voir dashboard" affichés
- [x] Bouton "Voir dashboard" fonctionnel (URL avec proposalId)
- [x] Route `/api/slack/interactions` pour recevoir les clics

### À implémenter

- [ ] Rendre le bouton "Valider" fonctionnel (approuver tous les blocs)
- [ ] Mise à jour du message après validation
- [ ] Gestion des erreurs de validation

---

## Phase 5 : Système de relances ⏳

**Statut** : Non commencée

### À implémenter

- [ ] Tracker les Proposals non validées (champ ou table)
- [ ] Job schedulé à 24h
- [ ] Relance @channel dans le thread
- [ ] Maximum 2 relances puis abandon

---

## Phase 6 : Notifications retour ⏳

**Statut** : Non commencée

### À implémenter

- [ ] Hook sur validation depuis le dashboard
- [ ] Notification dans le thread Slack original
- [ ] Composant `SlackSourceCard` dans le dashboard

---

## Phase 7 : Tests et polish ⏳

**Statut** : Non commencée

### À implémenter

- [ ] Tests unitaires pour les extracteurs
- [ ] Tests d'intégration Slack
- [ ] Gestion d'erreurs robuste
- [ ] Documentation utilisateur

---

## Commits associés

| Date | Commit | Description |
|------|--------|-------------|
| 2025-12-11 | `df81216` | Infrastructure de base pour l'agent Slack @databot |
| 2025-12-11 | `4fd0636` | Phase 2 - Extraction de données depuis URLs |
| 2025-12-11 | `e318b92` | Gestion des erreurs de crédits API Anthropic |
| 2025-12-11 | `e1b17df` | Amélioration extraction - détection SPA et anti-hallucination |
| 2025-12-12 | `253c72e` | Phase 2 complète - Extraction images et texte |
| 2025-12-12 | `157f5bb` | Redimensionnement auto images + plan Phase 2.5 |
| 2025-12-12 | `e9c7e46` | Phase 2.5 complète - Migration vers architecture Agent |
| 2025-12-12 | `TBD` | Phase 3 complète - Matching mutualisé + création Proposals |

---

## Architecture des fichiers

```
packages/agent-framework/src/
└── services/
    └── event-matching/             # Service de matching mutualisé
        ├── index.ts
        ├── types.ts
        ├── stopwords.ts
        ├── departments.ts
        └── event-matcher.ts

apps/agents/src/
├── SlackEventAgent.ts              # Agent principal (extends BaseAgent)
├── SlackEventAgent.configSchema.ts # Schéma config pour dashboard
└── ffa/
    └── matcher.ts                  # Wrapper utilisant le service mutualisé

apps/api/src/
├── routes/
│   └── slack.ts                    # Routes webhooks Slack (appelle l'agent)
└── services/
    └── slack/
        ├── SlackService.ts         # Client Slack wrapper
        ├── SlackProposalService.ts # Création de Proposals avec matching
        └── extractors/
            ├── index.ts            # Exports
            ├── types.ts            # Types et prompts
            ├── HtmlExtractor.ts    # Extraction HTML/URL
            ├── ImageExtractor.ts   # Extraction images (Vision)
            ├── TextExtractor.ts    # Extraction texte brut
            └── EventDataExtractor.ts  # Orchestrateur

packages/database/prisma/
├── schema.prisma                   # +sourceMetadata sur Proposal
└── migrations/
    └── 20251212120000_add_source_metadata/

packages/types/src/
└── agent-versions.ts               # SLACK_EVENT_AGENT version

scripts/
└── seed-slack-agent.ts             # Script de seed pour créer l'agent
```
