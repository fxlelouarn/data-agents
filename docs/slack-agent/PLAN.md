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

### Nouveau fichier agent
```
apps/agents/src/
├── SlackDataBot.ts              # Agent principal
├── slack/
│   ├── SlackClient.ts           # Wrapper Bolt SDK
│   ├── MessageParser.ts         # Parse les messages Slack
│   └── InteractiveHandler.ts    # Gère les boutons/interactions
├── extractors/
│   ├── HtmlExtractor.ts         # Extraction depuis HTML
│   ├── ImageExtractor.ts        # OCR + analyse image
│   └── TextExtractor.ts         # Parsing texte brut
└── services/
    └── EventDataExtractor.ts    # Orchestre l'extraction
```

### Dépendances à ajouter
```json
{
  "@slack/bolt": "^3.x",
  "@slack/web-api": "^6.x"
}
```

### Variables d'environnement
```bash
# Slack App
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...  # Pour Socket Mode (dev)

# Canal cible
SLACK_CHANNEL_ID=C...     # ID de #data-events

# API IA pour extraction
ANTHROPIC_API_KEY=...     # Déjà existant
```

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

### Phase 1 : Infrastructure Slack
1. Créer l'app Slack dans le workspace
2. Configurer les permissions (scopes)
3. Implémenter `SlackClient.ts` avec Bolt SDK
4. Tester la connexion et la réception de messages

### Phase 2 : Extraction de données
1. Implémenter `HtmlExtractor.ts`
   - Fetch HTML de la page
   - Parse avec Cheerio pour structure
   - Si trop complexe → screenshot avec Puppeteer
   - Envoyer à Claude Haiku pour extraction
2. Implémenter `ImageExtractor.ts`
   - Recevoir image depuis Slack
   - Envoyer à Claude Haiku pour OCR + analyse
   - Fallback Sonnet si échec
3. Implémenter `TextExtractor.ts`
   - Parser le texte brut avec Claude

### Phase 3 : Création de Proposals
1. Intégrer l'algorithme de matching existant
2. Créer les Proposals avec `sourceMetadata`
3. Stocker le lien message Slack ↔ Proposal

### Phase 4 : Interactions Slack
1. Implémenter les boutons interactifs
2. Gérer le clic "Valider" → approuve tous les blocs
3. Gérer le clic "Voir dashboard" → lien direct

### Phase 5 : Système de relances
1. Créer une table ou champ pour tracker les relances
2. Job schedulé pour vérifier les Proposals non validées
3. Envoyer relance @channel à 24h
4. Marquer après 2 relances

### Phase 6 : Notifications retour
1. Hook sur validation depuis dashboard
2. Poster message dans thread Slack original
3. Affichage `SlackSourceCard` dans le dashboard

### Phase 7 : Tests et polish
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

| Phase | Complexité | Dépendances |
|-------|------------|-------------|
| Phase 1 | Moyenne | Création app Slack |
| Phase 2 | Haute | API Anthropic, Puppeteer |
| Phase 3 | Moyenne | Matching existant |
| Phase 4 | Moyenne | Bolt SDK |
| Phase 5 | Faible | Scheduler existant |
| Phase 6 | Faible | API existante |
| Phase 7 | Moyenne | - |

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

1. [ ] Créer l'app Slack dans le workspace
2. [ ] Obtenir les tokens et configurer les variables d'environnement
3. [ ] Commencer Phase 1 : Infrastructure Slack
