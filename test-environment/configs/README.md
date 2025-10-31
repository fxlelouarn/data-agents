# Configuration de l'environnement de test

Ce répertoire contient les configurations pour l'environnement de test des agents.

## Fichiers

### `test-env.json`
Configuration par défaut versionnée dans Git. Contient les configurations communes à tous les développeurs.

**⚠️ Ne pas mettre de credentials sensibles dans ce fichier !**

### `test-env.local.json`
Configuration locale non versionnée (ignorée par Git). Ce fichier permet à chaque développeur d'avoir sa propre configuration avec ses credentials.

**Ce fichier a la priorité sur `test-env.json`**

### Fichiers de configuration des agents
- `ffa-scraper.json` - Configuration pour FFAScraperAgent
- `google-search-date.json` - Configuration pour GoogleSearchDateAgent
- etc.

## Configuration rapide

### 1. Créer votre configuration locale

Copiez le template et éditez-le :

```bash
cp test-env.local.json.template test-env.local.json
# Ou créez le fichier depuis le template existant
```

### 2. Configurer les bases de données

#### a) Base de données du framework (optionnel)

La base de données du framework stocke les agents, runs, logs et states. Par défaut, elle utilise `DATABASE_URL`.

Pour utiliser une base spécifique en test :

```json
{
  "frameworkDatabase": {
    "url": "postgresql://user:password@localhost:5432/data_agents_test"
  }
}
```

#### b) Bases de données des agents

Dans votre `test-env.local.json`, ajoutez les URLs des bases de données que les agents vont interroger :

```json
{
  "databases": {
    "milesRepublic": {
      "url": "postgresql://user:password@host:port/database?sslmode=require",
      "id": "db-miles-republic",
      "name": "Miles Republic Local",
      "type": "miles-republic"
    }
  }
}
```

#### Types de bases de données supportés

- **`postgresql`** - PostgreSQL standard (base générique)
- **`mysql`** - MySQL/MariaDB
- **`mongodb`** - MongoDB (NoSQL)
- **`miles-republic`** - Base de données Miles Republic avec schéma spécifique
  - ⚠️ Nécessite que le client Prisma de Miles Republic soit généré : `cd apps/agents && npx prisma generate`
  - Utilise le schéma Prisma spécifique de Miles Republic (pas le schéma Medusa générique)

#### Obtenir l'URL de la base de données Miles Republic

Depuis le projet `milesrepublic` :

```bash
# Dans le répertoire milesrepublic
cat apps/web/.env.local | grep DATABASE_URL
```

Copiez la valeur de `DATABASE_URL` dans votre `test-env.local.json`.

### 3. Configurer les API keys (optionnel)

Si vous testez des agents qui utilisent des APIs externes :

```json
{
  "apiKeys": {
    "googleSearch": {
      "apiKey": "votre-cle-api-google",
      "searchEngineId": "votre-search-engine-id"
    }
  }
}
```

## Structure de `test-env.json`

```json
{
  "description": "Configuration de l'environnement de test",
  
  "frameworkDatabase": {
    "url": "postgresql://user:password@localhost:5432/data_agents",
    "description": "Base de données du framework (agents, runs, logs, states). Optionnel"
  },
  
  "databases": {
    "milesRepublic": {
      "url": "postgresql://...",
      "id": "db-miles-republic",
      "name": "Miles Republic Production",
      "type": "miles-republic"
    },
    "milesRepublicStaging": {
      "url": null,
      "id": "db-miles-republic-staging",
      "name": "Miles Republic Staging",
      "type": "miles-republic"
    }
  },
  
  "testSettings": {
    "defaultTimeout": 30000,
    "defaultBatchSize": 10,
    "logLevel": "INFO",
    "mockMode": true
  },
  
  "apiKeys": {
    "googleSearch": {
      "apiKey": null,
      "searchEngineId": null
    }
  },
  
  "scraping": {
    "userAgent": "Mozilla/5.0 (compatible; DataAgentsBot/1.0)",
    "humanDelayMs": 2000,
    "maxRetries": 3,
    "timeout": 10000
  }
}
```

## Utilisation

Les configurations sont chargées automatiquement lors de l'exécution des tests :

```bash
# L'agent chargera automatiquement les configs depuis test-env.local.json (ou test-env.json)
node test-environment/console-tester.js FFAScraperAgent \
  --config test-environment/configs/ffa-scraper.json \
  --dry-run --verbose
```

### Ordre de priorité

1. **test-env.local.json** (si présent)
2. **test-env.json** (fallback)
3. **Variables d'environnement** (pour les configs non définies dans les fichiers)

### Variables d'environnement supportées

Si aucun fichier de config n'est trouvé, le système détecte automatiquement :

- `DATABASE_URL` → `db-default`
- `MILES_REPUBLIC_URL` → `db-miles-republic`
- `MILES_REPUBLIC_DATABASE_URL` → `db-miles-republic`
- `NEXT_STAGING_DATABASE_URL` → `db-miles-republic-staging`

## Exemples

### Configuration minimale locale

```json
{
  "databases": {
    "milesRepublic": {
      "url": "postgresql://miles-app_owner:xxxxx@ep-bold-shape-xxx.neon.tech/miles-app?sslmode=require",
      "id": "db-miles-republic",
      "name": "Miles Republic",
      "type": "miles-republic"
    }
  }
}
```

### Configuration complète locale

```json
{
  "description": "Ma config locale de développement",
  "databases": {
    "milesRepublic": {
      "url": "postgresql://...",
      "id": "db-miles-republic",
      "name": "Miles Republic Dev",
      "type": "miles-republic"
    },
    "milesRepublicStaging": {
      "url": "postgresql://...",
      "id": "db-miles-republic-staging",
      "name": "Miles Republic Staging",
      "type": "miles-republic"
    }
  },
  "testSettings": {
    "defaultTimeout": 60000,
    "logLevel": "DEBUG",
    "mockMode": false
  },
  "apiKeys": {
    "googleSearch": {
      "apiKey": "AIzaSy...",
      "searchEngineId": "..."
    }
  }
}
```

## Dépannage

### "No database configurations detected"

Créez un fichier `test-env.local.json` avec au moins une configuration de base de données.

### "Configuration de base de données non trouvée: db-miles-republic"

Vérifiez que :
1. `test-env.local.json` ou `test-env.json` existe
2. La clé `databases.milesRepublic` est définie
3. L'URL de la base de données est valide

### "Database does not exist"

L'URL de connexion est correcte mais la base de données n'existe pas. Vérifiez :
- Le nom de la base de données dans l'URL
- Que vous avez les permissions d'accès

## Sécurité

- ❌ Ne jamais committer `test-env.local.json`
- ❌ Ne jamais mettre de credentials dans `test-env.json`
- ✅ Utiliser des tokens de développement/staging uniquement
- ✅ Partager les noms d'IDs de configs, pas les URLs
