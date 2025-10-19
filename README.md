# Data Agents - Sports Event Data Extraction Platform

Un système d'agents intelligent pour l'extraction, la gestion et la validation automatique des données d'événements sportifs, avec interface de supervision complète et gestion des bases de données.

## 🏗️ Architecture

Le projet est organisé en monorepo avec les composants suivants :

- **packages/database** - Couche de données avec Prisma ORM, services de base de données et validation
- **packages/agent-framework** - Framework de base pour les agents avec classes abstraites
- **apps/api** - API REST complète pour la gestion des agents, propositions, bases de données et logs
- **apps/agents** - Implémentations d'agents (Google Search Date Agent, etc.)
- **apps/dashboard** - Interface web React/MUI Pro complète avec gestion avancée

## 🚀 Quick Start

### Prérequis
- Node.js 18+
- PostgreSQL 15+
- Docker (optionnel, pour les services locaux)

### Installation

1. **Cloner le projet**
```bash
git clone <repository-url>
cd data-agents
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer l'environnement**
```bash
cp .env.template .env
# Éditer .env avec vos configurations
```

4. **Démarrer les services locaux (optionnel)**
```bash
docker-compose up -d
```

5. **Configurer la base de données**
```bash
# Générer le client Prisma
npm run db:generate

# Appliquer les migrations
npm run db:migrate
```

6. **Build et démarrer**
```bash
# Build tous les packages
npm run build

# Démarrer l'API et le dashboard
npm run dev

# Ou démarrer séparément :
npm run dev:api      # API sur port 4001
npm run dev:dashboard # Dashboard sur port 4000
```

- **API** sera accessible sur `http://localhost:4001`
- **Dashboard** sera accessible sur `http://localhost:4000`

## ✨ Fonctionnalités Clés

### 🤖 Gestion Intelligente des Agents
- **Validation automatique de configuration** : Vérification en temps réel des paramètres d'agents
- **Désactivation automatique** : Les agents mal configurés sont automatiquement désactivés
- **Configuration dynamique** : Interface de configuration adaptative selon le type d'agent
- **Expressions cron avancées** : Support complet des expressions cron (intervalles, plages, listes)
- **Exécution programmée** : Scheduler intégré avec gestion des erreurs

### 📊 Interface de Supervision
- **Dashboard complet** : Vue d'ensemble en temps réel du système
- **Liste des agents** : Filtrage, recherche, tri, gestion des statuts
- **Gestion des erreurs** : Affichage visuel des erreurs de configuration avec tooltips
- **Exécution manuelle** : Déclenchement instantané des agents depuis l'interface
- **Historique détaillé** : Logs, runs et métriques avec pagination

### 🗄 Gestion des Bases de Données
- **Configuration centralisée** : Gestionnaire de connexions de bases de données
- **Test de connexion** : Vérification de santé en temps réel
- **Multi-types supportés** : PostgreSQL, MySQL, MongoDB, Medusa, API externes
- **Sécurité** : Gestion sécurisée des mots de passe et clés d'API
- **Validation d'usage** : Empêche la suppression de bases utilisées par des agents

### 📈 Propositions et Validation
- **Gestion avancée** : Interface complète pour valider/rejeter les propositions
- **Comparaison visuelle** : Diff avant/après avec mise en surbrillance
- **Validation en bloc** : Approbation/rejet groupé avec filtres
- **Justifications** : Support des liens, images et contenus HTML
- **Groupement intelligent** : Regroupement automatique des propositions liées

## 📦 Packages

### Database (`packages/database`)
Gère la couche de données avec :
- **Schéma Prisma complet** : Agents, runs, logs, propositions, connexions DB
- **Services DatabaseService** : Méthodes CRUD, validation, tests de connexion
- **Validation d'agents** : Vérification automatique de la configuration
- **Gestion des connexions** : Support multi-types de bases de données
- **Cache intelligent** : Optimisation des requêtes avec cache automatique

### Agent Framework (`packages/agent-framework`)
Framework de base pour créer des agents avec :
- Classes de base `BaseAgent` et `WebScraperAgent`
- Système de logging centralisé
- Gestion des contextes d'exécution
- Utilitaires pour extraction de données

### API (`apps/api`)
API REST complète avec endpoints pour :
- **`/api/agents`** - CRUD agents, validation, exécution, toggle
- **`/api/databases`** - Gestion connexions DB, tests, CRUD
- **`/api/proposals`** - Gestion propositions, validation en bloc
- **`/api/runs`** - Historique des exécutions avec détails
- **`/api/logs`** - Logs centralisés avec filtrage avancé
- **`/api/health`** - Health check avec métriques système

**Fonctionnalités avancées** :
- Validation automatique des agents avant activation
- Support complet des expressions cron (intervalles `*/2`, plages, listes)
- Gestion sécurisée des mots de passe (chiffrement)
- Middleware de validation avec messages d'erreur détaillés
- Scheduler intégré avec gestion des erreurs et retry



### Agents (`apps/agents`)
Implémentations d'agents opérationnels :

#### **Google Search Date Agent** 🔍
- **Type** : EXTRACTOR
- **Fonction** : Recherche automatique des dates d'événements sportifs via Google Search API
- **Configuration** : API Google, batch size, timeout, filtres géographiques
- **Fréquence** : Configurable (ex: `0 */6 * * *` - toutes les 6h)
- **Fonctionnalités** :
  - Mode simulation pour tests
  - Filtrage des weekends
  - Extraction multiple de dates par événement
  - Seuil de confiance ajustable
  - Événements français uniquement (optionnel)

- **Plus d'agents à venir** : FFA Scraper, Comparateur événements, etc.

### Dashboard (`apps/dashboard`)
Interface web React/MUI Pro complète :

#### **Pages Principales**
- **🏠 Dashboard** - Vue d'ensemble avec métriques en temps réel
- **🤖 Agents** - Liste, détails, édition, logs avec filtrage avancé
- **📈 Propositions** - Validation, comparaison, gestion en bloc
- **🗓 Runs** - Historique détaillé des exécutions
- **📜 Logs** - Centralisation avec filtres par niveau/agent
- **⚙️ Administration** - Gestion des bases de données et paramètres

#### **Fonctionnalités Interface**
- **Navigation responsive** avec sidebar collapsible
- **Thème Material-UI** optimisé avec composants personnalisés
- **Gestion d'état React Query** avec cache et synchronisation
- **Formulaires dynamiques** adaptés au type d'agent
- **Validation temps réel** avec messages d'erreur contextuels
- **Notifications toast** pour toutes les actions utilisateur

## 🤖 Types d'agents

### 1. Agents d'extraction
Extraient des informations d'événements depuis des sources web :
- Nom, lieu, dates de l'événement
- Détails des courses (distance, prix, dénivelé)
- Utilisation de Playwright pour scraping

### 2. Agents de comparaison  
Comparent les données extraites avec la base Miles Republic :
- Détection des événements existants
- Génération de propositions de modifications
- Calcul de score de confiance

### 3. Agents validateurs
Validation automatique de certains types de propositions :
- Agents spécialisés par source (ex: FFA)
- Validation de formats de dates, distances, etc.

### 4. Agents de nettoyage
Maintenance des données :
- Détection et suppression des doublons
- Correction des catégories mal renseignées

### 5. Agents de duplication
Reconduction automatique des éditions :
- Duplication des événements passés
- Passage en statut "À confirmer"

## 📊 Interface de supervision

L'interface permettra de :
- Visualiser les agents actifs/inactifs
- Filtrer et rechercher les agents
- Voir l'historique et logs des exécutions
- Activer/désactiver des agents
- Déclencher des exécutions manuelles

### Gestion des propositions
- Liste des propositions par événement/édition
- Filtrage par statut (À confirmer, etc.)
- Interface de comparaison avant/après
- Validation individuelle ou en bloc
- Justificatifs (liens, images, HTML)

## 📝 Logging Structuré

Le projet utilise un système de logging structuré complet pour une meilleure observabilité et traçabilité.

### Caractéristiques
- **Logging structuré** : Tous les logs sont formatés en JSON avec métadonnées contextuelles
- **Niveaux hiérarchisés** : DEBUG, INFO, WARN, ERROR avec filtrage configurable
- **Contexte automatique** : Service, composant, opération, agentId, runId
- **Persistance base de données** : Logs des agents automatiquement sauvegardés
- **Opérations traçées** : Démarrage, completion et échec avec durées
- **Console développement** : Affichage coloré et lisible en mode dev

### Utilisation

```typescript
import { createApiLogger, createAgentLogger } from '@data-agents/database'

// Logger pour l'API
const logger = createApiLogger('req-123').child({ component: 'user-service' })
logger.info('Utilisateur connecté', { userId: '123', email: 'user@example.com' })

// Logger pour un agent
const agentLogger = createAgentLogger('agent-456', 'run-789')
const operationLogger = agentLogger.startOperation('scrape-data')
operationLogger.info('Début du scraping', { url: 'https://example.com' })
// ... opérations ...
operationLogger.completeOperation('Scraping terminé', { itemsExtracted: 42 })
```

### Configuration

Variable d'environnement `LOG_LEVEL` pour contrôler la verbosité :
- `DEBUG` : Tous les logs (développement)
- `INFO` : Informations et erreurs (par défaut)
- `WARN` : Avertissements et erreurs seulement
- `ERROR` : Erreurs uniquement (production)

## 🔧 Développement

### Ajouter un nouvel agent

1. **Créer la classe d'agent**
```typescript
import { WebScraperAgent } from '@data-agents/agent-framework'

export class MonNouvelAgent extends WebScraperAgent {
  async scrapeData(page: Page, context: AgentContext) {
    // Logique d'extraction
  }
}
```

2. **L'enregistrer**
```typescript
import { agentRegistry } from '@data-agents/agent-framework'
agentRegistry.register('MON_AGENT', MonNouvelAgent)
```


### Commandes utiles

```bash
# Développement
npm run dev              # Démarrer en mode développement
npm run build           # Build tous les packages
npm run lint            # Linting
npm run test            # Tests

# Base de données  
npm run db:generate     # Générer client Prisma
npm run db:migrate      # Appliquer migrations
npm run db:studio       # Interface Prisma Studio
npm run db:push         # Push schema sans migration

# Docker
docker-compose up -d    # Services locaux
docker-compose down     # Arrêter les services
```

## 🚀 Déploiement

### Render
Le projet est configuré pour Render avec :
- `render.yaml` - Configuration du service
- `Dockerfile` - Image de production
- Variables d'environnement automatiques

### Variables d'environnement requises
- `DATABASE_URL` - Connexion PostgreSQL  
- `MILES_REPUBLIC_DATABASE_URL` - Base Miles Republic (lecture)
- `PORT` - Port du serveur (4001)
- `NODE_ENV` - Environnement (production)

## 📝 API Documentation

### Agents
- `GET /api/agents` - Liste des agents (avec `?includeInactive=true`, `?type=EXTRACTOR`)
- `POST /api/agents` - Créer un agent avec validation cron avancée
- `GET /api/agents/:id` - Détails d'un agent avec runs et logs
- `PUT /api/agents/:id` - Modifier un agent avec validation automatique
- `POST /api/agents/:id/toggle` - Activer/désactiver avec vérification de config
- `POST /api/agents/:id/run` - Exécution manuelle immédiate
- `GET /api/agents/:id/validate` - **Nouveau** : Validation de configuration
- `DELETE /api/agents/:id` - Supprimer un agent

### Bases de Données 🆕
- `GET /api/databases` - Liste des connexions DB (avec `?includeInactive=true`)
- `POST /api/databases` - Créer une connexion avec validation
- `GET /api/databases/:id` - Détails d'une connexion
- `PUT /api/databases/:id` - Modifier une connexion
- `POST /api/databases/:id/toggle` - Activer/désactiver
- `POST /api/databases/:id/test` - **Test de connexion en temps réel**
- `DELETE /api/databases/:id` - Supprimer (avec vérification d'usage)

### Propositions
- `GET /api/proposals` - Liste avec filtrage avancé (`?status=PENDING`, `?type=UPDATE`)
- `GET /api/proposals/:id` - Détails avec propositions liées
- `PUT /api/proposals/:id` - Approuver/rejeter avec justification
- `POST /api/proposals/:id/compare` - Comparaison intelligente
- `POST /api/proposals/bulk-approve` - Validation en bloc optimisée
- `POST /api/proposals/bulk-reject` - Rejet en bloc
- `POST /api/proposals/bulk-archive` - Archivage en bloc

### Runs & Logs
- `GET /api/runs` - Historique avec pagination (`?limit=20`, `?offset=0`)
- `GET /api/runs/:id` - Détails avec logs associés
- `GET /api/logs` - **Logs structurés centralisés** avec filtres (`?level=ERROR`, `?agentId=xxx`, `?service=api`)
  - Inclut contexte complet : service, composant, opération, durée
  - Support des logs d'opérations traçées avec métriques

### System
- `GET /api/health` - Health check avec métriques détaillées
- `GET /api/settings` - Configuration système actuelle
- `PUT /api/settings` - Modifier la configuration système
- `GET /api/settings/failure-report` - Rapport détaillé sur les échecs consécutifs
- `POST /api/settings/check-failures` - Vérification manuelle des agents à désactiver
- `GET /api/settings/agent/:id/failures` - Détails des échecs d'un agent spécifique

## 🛑 Gestion Automatique des Échecs

Le système intègre une gestion intelligente des échecs d'agents :

### Fonctionnement
- **Surveillance continue** : Monitoring des exécutions en temps réel
- **Désactivation automatique** : Agents désactivés après X échecs consécutifs
- **Paramétrable** : Seuil et intervalle configurable (défaut: 3 échecs)
- **Notification** : Logs détaillés et alertes automatiques
- **Monitoring périodique** : Vérification toutes les 5 minutes (configurable)

### Configuration
```bash
# Variables d'environnement dans .env
MAX_CONSECUTIVE_FAILURES=3        # Seuil d'échecs avant désactivation
ENABLE_AUTO_DISABLING=true        # Activer/désactiver la fonctionnalité
CHECK_INTERVAL_MINUTES=5          # Intervalle de vérification périodique
```

### Workflows Automatiques
1. **Détection immédiate** : Après chaque échec d'exécution
2. **Vérification périodique** : Scan de tous les agents actifs
3. **Désactivation sécurisée** : Désenregistrement du scheduler
4. **Logging détaillé** : Historique et raisons de désactivation

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/amazing-agent`)
3. Commit les changements (`git commit -m 'Add amazing agent'`)
4. Push vers la branche (`git push origin feature/amazing-agent`)
5. Ouvrir une Pull Request

## 📄 License

MIT License - voir le fichier [LICENSE](LICENSE) pour plus de détails.

## 🆘 Support

Pour toute question ou problème :
- Ouvrir une issue GitHub
- Consulter la documentation dans `/docs`
- Vérifier les logs avec `npm run db:studio`
