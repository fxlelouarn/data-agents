# Agent Slack @databot - Statut d'implémentation

> Dernière mise à jour : 2025-12-12

## Vue d'ensemble

| Phase | Description | Statut |
|-------|-------------|--------|
| Phase 1 | Infrastructure Slack | ✅ Complète |
| Phase 2 | Extraction de données | ✅ Complète |
| Phase 2.5 | Migration vers architecture Agent | ⏳ Non commencée |
| Phase 3 | Création de Proposals | ⏳ Non commencée |
| Phase 4 | Interactions Slack (boutons) | ⏳ Non commencée |
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

## Phase 2.5 : Migration vers architecture Agent ⏳

**Statut** : Non commencée

### Objectif

Transformer le service Slack actuel (Express) en un vrai Agent pour bénéficier de :
- Toggle activation dans le dashboard
- Configuration JSON modifiable à chaud
- Métriques et historique des runs
- État persistant

### À implémenter

- [ ] Créer `apps/agents/src/SlackEventAgent.ts` (extends BaseAgent)
- [ ] Définir le type d'agent `SLACK_EVENT` 
- [ ] Déplacer la config des variables d'env vers la config JSON de l'agent
- [ ] Adapter le webhook API pour appeler l'agent au lieu du service
- [ ] Ajouter les métriques (messages traités, proposals créées, erreurs)
- [ ] Migrer les extractors vers `apps/agents/` ou les garder partagés

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

**Avantage** : Permet le multi-workspace Slack (un agent par workspace avec ses propres credentials).

### Services partagés à créer

Avant Phase 3, mutualiser les services de matching :

| Service | Source actuelle | Destination |
|---------|-----------------|-------------|
| EventMatchingService | `apps/agents/src/ffa/matcher.ts` | `packages/agent-framework/src/services/` |
| RaceMatchingService | `packages/agent-framework/src/matching-utils.ts` | (déjà partagé) |

Cela permettra à SlackEventAgent de réutiliser l'algorithme de matching FFA.

### Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `apps/agents/src/SlackEventAgent.ts` | Créer |
| `apps/agents/src/slack/extractors/*` | Déplacer ou importer depuis API |
| `apps/api/src/routes/slack.ts` | Modifier (appeler l'agent) |
| `packages/database/prisma/schema.prisma` | Ajouter type agent |
| `packages/agent-framework/src/services/EventMatchingService.ts` | Créer (mutualiser depuis ffa/matcher.ts) |

---

## Phase 3 : Création de Proposals ⏳

**Statut** : Non commencée

### À implémenter

- [ ] Intégrer l'algorithme de matching existant (`apps/agents/src/ffa/matcher.ts`)
- [ ] Créer les Proposals en base avec `sourceMetadata`
- [ ] Gérer les types : NEW_EVENT, EDITION_UPDATE
- [ ] Calculer la confiance basée sur le matching

---

## Phase 4 : Interactions Slack ⏳

**Statut** : Non commencée

### À implémenter

- [ ] Rendre le bouton "Valider" fonctionnel (approuver tous les blocs)
- [ ] Lier le clic au vrai proposalId créé en Phase 3
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

---

## Architecture des fichiers

```
apps/api/src/
├── routes/
│   └── slack.ts                    # Routes webhooks Slack
└── services/
    └── slack/
        ├── SlackService.ts         # Client Slack wrapper
        └── extractors/
            ├── index.ts            # Exports
            ├── types.ts            # Types et prompts
            ├── HtmlExtractor.ts    # Extraction HTML/URL
            ├── ImageExtractor.ts   # Extraction images (Vision)
            ├── TextExtractor.ts    # Extraction texte brut
            └── EventDataExtractor.ts  # Orchestrateur
```
