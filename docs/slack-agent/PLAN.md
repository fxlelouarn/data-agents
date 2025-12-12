# Agent Slack @databot - Plan d'implémentation

## Vue d'ensemble

Agent qui surveille le canal Slack `#data-events`, lit les messages mentionnant `@databot`, extrait les informations d'événements (depuis des liens ou images), et crée des Proposals dans notre système.

## Spécifications fonctionnelles

### Déclenchement
- L'agent réagit uniquement quand il est mentionné : `@databot`
- Les réponses sont postées en **thread** sous le message original

### Sources supportées
| Type | Description | Traitement |
|------|-------------|------------|
| **Lien URL** | Lien vers un site d'organisateur | HTML parsing → fallback screenshot si illisible |
| **Image** | Affiche/flyer d'événement | OCR + analyse IA |
| **Texte brut** | Infos copiées-collées | Parsing IA |

### Workflow de validation

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Message Slack avec @databot                       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Extraction des données (HTML/Image/Texte)               │
│                     via Claude 3 Haiku → Sonnet                      │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
            ┌───────────────┐             ┌───────────────┐
            │ Échec         │             │ Succès        │
            │ extraction    │             │ extraction    │
            └───────────────┘             └───────────────┘
                    │                             │
                    ▼                             ▼
            ┌───────────────┐             ┌───────────────┐
            │ Message Slack │             │ Matching avec │
            │ "Impossible   │             │ base existante│
            │ d'extraire"   │             └───────────────┘
            └───────────────┘                     │
                                   ┌─────────────┼─────────────┐
                                   │             │             │
                                   ▼             ▼             ▼
                           ┌───────────┐ ┌───────────┐ ┌───────────┐
                           │ Match     │ │ Match     │ │ Pas de    │
                           │ confiance │ │ confiance │ │ match     │
                           │ haute     │ │ basse     │ │           │
                           │ (>80%)    │ │ (<80%)    │ │           │
                           └───────────┘ └───────────┘ └───────────┘
                                   │             │             │
                                   ▼             ▼             ▼
                           ┌───────────┐ ┌───────────┐ ┌───────────┐
                           │EDITION_   │ │ Redirect  │ │ NEW_EVENT │
                           │UPDATE     │ │ dashboard │ │ Proposal  │
                           │Proposal   │ │ pour      │ │           │
                           │           │ │ vérifier  │ │           │
                           └───────────┘ └───────────┘ └───────────┘
                                   │             │             │
                                   └─────────────┴─────────────┘
                                                 │
                                                 ▼
                           ┌─────────────────────────────────────┐
                           │     Message Slack avec boutons      │
                           │  [✅ Valider] [📝 Voir dashboard]   │
                           └─────────────────────────────────────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          │                      │                      │
                          ▼                      ▼                      ▼
                   ┌────────────┐         ┌────────────┐         ┌────────────┐
                   │ Clic       │         │ Clic       │         │ Pas de     │
                   │ Valider    │         │ Dashboard  │         │ réponse    │
                   └────────────┘         └────────────┘         └────────────┘
                          │                      │                      │
                          ▼                      ▼                      ▼
                   ┌────────────┐         ┌────────────┐         ┌────────────┐
                   │ Approuve   │         │ Redirige   │         │ Relance    │
                   │ tous les   │         │ vers URL   │         │ @channel   │
                   │ blocs      │         │ proposal   │         │ à 24h      │
                   └────────────┘         └────────────┘         └────────────┘
                          │                                             │
                          ▼                                             ▼
                   ┌────────────┐                               ┌────────────┐
                   │ Notif      │                               │ 2 relances │
                   │ "Validé ✅"│                               │ max puis   │
                   │ dans thread│                               │ abandon    │
                   └────────────┘                               └────────────┘
```

### Timeout et relances
- **Délai** : 24h après création de la Proposal
- **Qui taguer** : `@channel`
- **Nombre de relances** : 2 maximum
- **Après 2 relances** : La Proposal reste PENDING, plus de notification

### Notifications
- Quand une Proposal est validée depuis le dashboard → notification dans le thread Slack original

---

## Architecture technique

### Décision : Architecture Agent (2025-12-12)

L'intégration Slack utilise l'architecture Agent (`@data-agents/agent-framework`) plutôt qu'un simple service Express.

**Avantages** :
| Aspect | Service Express | Agent Framework |
|--------|-----------------|-----------------|
| Activation/Désactivation | Redéploiement | ✅ Toggle dashboard |
| Configuration | Variables d'env | ✅ JSON modifiable à chaud |
| Visibilité | Logs serveur | ✅ Liste agents dashboard |
| Métriques | Aucune | ✅ Stats (runs, succès, erreurs) |
| État | Aucun | ✅ `agent_states` persistant |
| Historique | Aucun | ✅ `agent_runs` |
| Multi-channel | Hardcodé | ✅ Config par channel |

### Structure des fichiers

```
apps/agents/src/
├── SlackEventAgent.ts           # Agent principal (extends BaseAgent)
└── slack/
    └── extractors/              # Réutilise ceux de l'API ou duplique
        ├── HtmlExtractor.ts
        ├── ImageExtractor.ts
        ├── TextExtractor.ts
        └── EventDataExtractor.ts

apps/api/src/
├── routes/slack.ts              # Webhook → appelle l'agent
└── services/slack/
    ├── SlackService.ts          # Client Slack (conservé)
    └── extractors/              # Extracteurs existants (Phase 2)
```

### Configuration Agent (JSON)

Pattern identique à GoogleSearchDateAgent : **config JSON prioritaire, fallback sur variables d'env**.

```typescript
// Dans SlackEventAgent.ts
const config = {
  slackBotToken: agentConfig.slackBotToken || process.env.SLACK_BOT_TOKEN,
  slackSigningSecret: agentConfig.slackSigningSecret || process.env.SLACK_SIGNING_SECRET,
  anthropicApiKey: agentConfig.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
  // ...
}
```

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

**Avantages** :
- Multi-workspace Slack possible (un agent par workspace)
- Modification à chaud via dashboard
- Pas besoin de redéployer pour changer de channel

### Dépendances
```json
{
  "@slack/web-api": "^6.x",
  "sharp": "^0.33.x"
}
```

### Variables d'environnement (fallback uniquement)
```bash
# Utilisées si non définies dans la config JSON de l'agent
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
ANTHROPIC_API_KEY=...
```

---

### Services partagés à mutualiser

Actuellement, le matching d'événements est dans `apps/agents/src/ffa/matcher.ts` et ne peut pas être réutilisé par d'autres agents.

**Avant Phase 3**, créer un service partagé :

```
packages/agent-framework/src/services/
├── EventMatchingService.ts    # Depuis ffa/matcher.ts
├── RaceMatchingService.ts     # Renommer matching-utils.ts
└── index.ts
```

| Service | Fonctionnalité |
|---------|----------------|
| `EventMatchingService` | Matching événements par nom/ville/date (fuse.js) |
| `RaceMatchingService` | Matching courses par distance + nom |

Cela permettra :
- SlackEventAgent d'utiliser le même algorithme que FFA
- GoogleSearchDateAgent de bénéficier du matching (si besoin)
- Maintenance centralisée de l'algorithme

---

## Modifications de la base de données

### Migration Prisma

```prisma
model Proposal {
  // ... champs existants ...

  // NOUVEAU: Métadonnées de source Slack
  sourceMetadata      Json?    // Structure ci-dessous
}
```

### Structure `sourceMetadata`
```typescript
interface SlackSourceMetadata {
  type: 'SLACK'
  workspaceId: string
  workspaceName: string
  channelId: string
  channelName: string
  messageTs: string           // Timestamp du message original
  threadTs?: string           // Si dans un thread
  userId: string              // Qui a posté
  userName: string
  messageLink: string         // Lien direct vers le message
  sourceUrl?: string          // URL extraite du message (si lien fourni)
  imageUrls?: string[]        // URLs des images attachées
  extractedAt: string         // ISO date
}
```

---

## Modifications du Dashboard

### 1. Types (`apps/dashboard/src/types/index.ts`)

```typescript
export interface SlackSourceMetadata {
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

export interface Proposal {
  // ... existant ...
  sourceMetadata?: SlackSourceMetadata | Record<string, any>
}
```

### 2. Nouveau composant `SlackSourceCard`

```
apps/dashboard/src/components/proposals/SlackSourceCard.tsx
```

Affichera :
- Logo Slack + "Source: Slack #data-events"
- Auteur du message (@userName)
- Date du message
- Bouton "Voir sur Slack" (lien direct)
- URL source si fournie
- Aperçu des images si présentes

### 3. Intégration dans les vues de détail

Ajouter `SlackSourceCard` dans :
- `ProposalJustificationsCard.tsx` - En haut de la section justifications
- `AgentInfoSection.tsx` - Alternative dans la sidebar

---

## Modifications de l'API

### Nouveaux endpoints

```typescript
// POST /api/slack/events
// Webhook Slack pour recevoir les événements (messages, interactions)

// POST /api/slack/interactions
// Webhook pour les interactions (boutons cliqués)

// POST /api/proposals/:id/notify-slack
// Notifie Slack quand une Proposal est validée depuis le dashboard
```

### Modification endpoint validation

Dans `PUT /api/proposals/:id` et `POST /api/proposals/bulk-approve` :
- Si `sourceMetadata.type === 'SLACK'`, envoyer notification dans le thread

---

## Phases d'implémentation

### Phase 1 : Infrastructure Slack ✅
1. ~~Créer l'app Slack dans le workspace~~
2. ~~Configurer les permissions (scopes)~~
3. ~~Implémenter `SlackService.ts` avec @slack/web-api~~
4. ~~Routes webhooks `/api/slack/events` et `/api/slack/interactions`~~
5. ~~Tester la connexion et la réception de messages~~

### Phase 2 : Extraction de données ✅
1. ~~Implémenter `HtmlExtractor.ts`~~
   - ~~Fetch HTML de la page~~
   - ~~Parse avec Cheerio pour structure~~
   - ~~Détection pages SPA (anti-hallucination)~~
   - ~~Envoyer à Claude Haiku pour extraction~~
   - ~~Fallback Sonnet si échec~~
2. ~~Implémenter `ImageExtractor.ts`~~
   - ~~Recevoir image depuis Slack (authentifié)~~
   - ~~Redimensionnement auto avec sharp (> 5MB)~~
   - ~~Envoyer à Claude Vision pour analyse~~
   - ~~Fallback Sonnet si échec~~
3. ~~Implémenter `TextExtractor.ts`~~
   - ~~Parser le texte brut avec Claude~~
   - ~~Nettoyage mentions/URLs Slack~~

### Phase 2.5 : Migration vers architecture Agent ✅
1. ~~Créer `SlackEventAgent.ts` (extends BaseAgent)~~
2. ~~Ajouter version dans `packages/types/src/agent-versions.ts`~~
3. ~~Déplacer la config vers JSON (channels, extraction, reminders)~~
4. ~~Adapter le webhook pour vérifier l'agent actif~~
5. ~~Script de seed `scripts/seed-slack-agent.ts`~~
6. ~~Schéma de configuration pour le dashboard~~

### Phase 3 : Création de Proposals ✅
1. ~~Mutualiser le service de matching dans `packages/agent-framework/src/services/event-matching/`~~
2. ~~Créer `SlackProposalService.ts` avec connexion Miles Republic~~
3. ~~Créer les Proposals avec `sourceMetadata`~~
4. ~~Gérer les types : NEW_EVENT, EDITION_UPDATE~~
5. ~~Calculer la confiance basée sur le matching~~
6. ~~Ajouter migration Prisma pour `sourceMetadata`~~

### Phase 4 : Interactions Slack ⏳
1. ~~Boutons "Valider" et "Voir dashboard" affichés~~
2. ~~Bouton "Voir dashboard" fonctionnel~~
3. Implémenter le clic "Valider" → approuve tous les blocs
4. Mise à jour du message après validation

### Phase 5 : Système de relances ⏳
1. Tracker les Proposals non validées (champ dans agent_states)
2. Job schedulé pour vérifier les Proposals à relancer
3. Envoyer relance @channel à 24h
4. Maximum 2 relances puis abandon

### Phase 6 : Notifications retour ⏳
1. Hook sur validation depuis dashboard
2. Poster message dans thread Slack original
3. Affichage `SlackSourceCard` dans le dashboard

### Phase 7 : Tests et polish ⏳
1. Tests unitaires extracteurs
2. Tests d'intégration Slack
3. Gestion des erreurs robuste
4. Documentation utilisateur

---

## Configuration Slack App

### Scopes OAuth requis (Bot Token)
```
channels:history      # Lire les messages du canal
channels:read         # Info sur les canaux
chat:write            # Poster des messages
files:read            # Lire les fichiers/images
reactions:read        # Lire les réactions existantes
reactions:write       # Ajouter des réactions (feedback visuel)
users:read            # Info sur les utilisateurs
```

### Convention réactions (Miles Republic)

| Réaction | Signification | Quand |
|----------|---------------|-------|
| 👀 `:eyes:` | En cours de traitement | Dès réception du message |
| ✅ `:white_check_mark:` | Traité avec succès | Proposal créée |
| ❌ `:x:` | Échec | Impossible d'extraire les données |

**Workflow réactions** :
1. Message reçu → ajouter 👀
2. Traitement terminé → supprimer 👀
3. Succès → ajouter ✅
4. Échec → ajouter ❌ + message explicatif dans thread

### Event Subscriptions
```
app_mention           # Quand @databot est mentionné
message.channels      # Messages dans les canaux publics
```

### Interactivity
- Request URL : `https://api.data-agents.com/api/slack/interactions`

---

## Estimation de complexité

| Phase | Complexité | Statut | Dépendances |
|-------|------------|--------|-------------|
| Phase 1 | Moyenne | ✅ | Création app Slack |
| Phase 2 | Haute | ✅ | API Anthropic, sharp |
| Phase 2.5 | Moyenne | ✅ | agent-framework |
| Phase 3 | Moyenne | ⏳ | Matching existant |
| Phase 4 | Moyenne | ⏳ | @slack/web-api |
| Phase 5 | Faible | ⏳ | Scheduler existant |
| Phase 6 | Faible | ⏳ | API existante |
| Phase 7 | Moyenne | ⏳ | - |

---

## Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| HTML illisible | Moyen | Fallback screenshot |
| OCR imprécis | Moyen | Double passe Haiku → Sonnet |
| Rate limit Anthropic | Faible | Queue avec retry |
| Slack API changes | Faible | Bolt SDK maintenu |
| Coût API élevé | Moyen | Haiku par défaut, monitoring |

---

## Questions ouvertes

1. **Hébergement Slack webhook** : Render supporte les webhooks persistants ?
2. **Socket Mode vs HTTP** : Socket Mode plus simple en dev, HTTP en prod ?
3. **Multi-workspace** : Un seul workspace pour l'instant ?
4. **Historique** : Faut-il traiter les messages passés ou seulement les nouveaux ?

---

## Prochaines étapes

1. [x] ~~Créer l'app Slack dans le workspace~~
2. [x] ~~Obtenir les tokens et configurer les variables d'environnement~~
3. [x] ~~Phase 1 : Infrastructure Slack~~
4. [x] ~~Phase 2 : Extraction de données~~
5. [x] ~~Phase 2.5 : Migration vers architecture Agent~~
6. [x] ~~Phase 3 : Création de Proposals~~
   - ~~Mutualiser EventMatchingService~~
   - ~~Intégrer matching dans SlackEventAgent~~
   - ~~Créer Proposals avec sourceMetadata~~
7. [ ] **Phase 4 : Interactions Slack** ← PROCHAINE ÉTAPE
   - Rendre le bouton "Valider" fonctionnel
   - Mise à jour du message après validation
