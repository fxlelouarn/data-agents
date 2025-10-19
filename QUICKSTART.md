# 🚀 Guide de Démarrage Rapide - Data Agents

Ce guide vous permet de lancer rapidement l'application Data Agents complète.

## ⚡ Installation Express

```bash
# 1. Cloner et installer
git clone <repository-url>
cd data-agents
npm run setup

# 2. Configurer l'environnement
cp .env.template .env
# Éditer .env avec votre configuration PostgreSQL

# 3. Démarrer les services locaux (optionnel)
docker-compose up -d

# 4. Configurer la base de données
npm run db:migrate

# 5. Lancer l'application complète
npm run dev
```

## 🎯 Accès aux Applications

Une fois démarré, vous aurez accès à :

- **🌐 Dashboard** : http://localhost:4000
  - Interface de supervision des agents
  - Gestion des propositions 
  - Monitoring en temps réel

- **🔧 API** : http://localhost:4001
  - API REST pour backend
  - Documentation : http://localhost:4001/api/health

- **💾 Base de données** : http://localhost:5555
  - Interface Prisma Studio : `npm run db:studio`

## 📋 Fonctionnalités Principales

### 1. Supervision des Agents
- **Voir les agents** : `/agents`
- **Activer/Désactiver** : Switch dans la liste
- **Exécuter manuellement** : Bouton ▶️ 
- **Voir les détails** : Cliquer sur le nom

### 2. Gestion des Propositions  
- **Propositions en attente** : `/proposals` (filtre par défaut)
- **Validation en masse** : Sélection multiple + boutons
- **Détails d'une proposition** : Cliquer sur une ligne
- **Filtrer par statut** : Menu déroulant "À confirmer"

### 3. Monitoring
- **Vue d'ensemble** : `/dashboard` 
- **État système** : Indicateur en haut à droite
- **Exécutions récentes** : Panel principal
- **Métriques** : Cartes de statistiques

## 🤖 Agents Disponibles

### Agent FFA (Exemple)
- **Type** : Extracteur
- **Source** : Calendrier FFA (Fédération Française d'Athlétisme)
- **Fréquence** : Configurable via cron
- **Données extraites** : Événements, éditions, courses

Pour ajouter un nouvel agent :
1. Hériter de `BaseAgent` ou `WebScraperAgent`
2. Implémenter la méthode `run()`
3. Enregistrer dans le registre : `agentRegistry.register()`

## 📊 Types de Propositions

| Type | Description | Action |
|------|-------------|--------|
| **NEW_EVENT** | Nouvel événement détecté | Créer ou lier à existant |
| **EVENT_UPDATE** | Modification d'événement | Comparer et valider |
| **EDITION_UPDATE** | Modification d'édition | Dates, statut, inscriptions |
| **RACE_UPDATE** | Modification de course | Distance, prix, dénivelé |

## ⚙️ Configuration Avancée

### Variables d'Environnement
```bash
# Base de données principale
DATABASE_URL="postgresql://user:pass@localhost:5432/data_agents"

# Base Miles Republic (lecture seule)
MILES_REPUBLIC_DATABASE_URL="postgresql://user:pass@localhost:5432/miles_republic"

# API
PORT=4001
NODE_ENV=development

# Dashboard  
VITE_API_URL=http://localhost:4001/api
```

### Ajout d'un Agent Personnalisé

```typescript
// 1. Créer l'agent
export class MonAgent extends WebScraperAgent {
  async scrapeData(page: Page, context: AgentContext) {
    // Logique d'extraction
    return { events: [], editions: [], races: [], confidence: 0.8, source: 'url' }
  }
}

// 2. L'enregistrer
agentRegistry.register('MON_AGENT', MonAgent)

// 3. Le créer via l'API ou interface
```

### Personnalisation du Dashboard

Le dashboard utilise Material-UI Pro avec thème personnalisé similaire à Miles Republic. Pour modifier :

```typescript
// apps/dashboard/src/App.tsx
const theme = createTheme({
  palette: {
    primary: { main: '#votrecouleur' },
    // ...
  }
})
```

## 🐛 Dépannage

### Problème : Base de données inaccessible
```bash
# Vérifier la connexion
npm run db:studio

# Recréer la base
npm run db:push
```

### Problème : Port déjà utilisé
```bash
# Changer le port dans .env
PORT=4002  # pour l'API
VITE_PORT=4001  # pour le dashboard
```

### Problème : Agents ne s'exécutent pas
1. Vérifier qu'ils sont **actifs** (switch ON)
2. Vérifier la **fréquence cron** (format valide)
3. Consulter les **logs** dans la section correspondante

## 📚 Ressources Utiles

- **Architecture** : Voir `README.md` pour détails complets
- **API Endpoints** : `/api/health` pour la documentation
- **Base de données** : `packages/database/prisma/schema.prisma`
- **Types** : `apps/dashboard/src/types/index.ts`

## 🆘 Support

En cas de problème :
1. Consulter les logs : `npm run db:studio` → table `agent_logs`
2. Vérifier la santé : http://localhost:4001/api/health
3. Redémarrer : `Ctrl+C` puis `npm run dev`

---

**🎉 Félicitations !** Vous avez maintenant une plateforme d'agents fonctionnelle pour l'extraction et la gestion de données d'événements sportifs.