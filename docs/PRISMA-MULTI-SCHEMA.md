# Configuration des Schémas Prisma Multiples

## Vue d'ensemble

Le projet `data-agents` supporte l'utilisation de plusieurs schémas Prisma pour se connecter à différentes bases de données avec des structures différentes :

1. **Schéma principal** (`packages/database/prisma/schema.prisma`) : Pour la base data-agents (agents, runs, logs, proposals, etc.)
2. **Schéma Miles Republic** (`apps/agents/prisma/miles-republic.prisma`) : Pour la base Miles Republic (events, editions, races, attendees, etc.)

## Principes de conception

### ❌ Ancien système (à éviter)
- Fichiers `.env` dispersés dans la codebase
- Variables d'environnement non centralisées
- Configuration manuelle dans chaque répertoire

### ✅ Nouveau système (recommandé)
- Configuration centralisée dans `test-environment/configs/test-env.local.json`
- Le DatabaseManager gère automatiquement les clients Prisma appropriés
- Pas de fichiers `.env` dispersés

## Configuration

### 1. Créer le fichier de configuration local

```bash
cd test-environment/configs
cp test-env.local.json.template test-env.local.json
```

### 2. Configurer les bases de données

Éditer `test-env.local.json` :

```json
{
  "frameworkDatabase": {
    "url": "postgresql://user:password@localhost:5432/data_agents",
    "description": "Base de données du framework data-agents"
  },
  
  "databases": {
    "milesRepublic": {
      "url": "postgresql://user:password@host/database",
      "id": "db-miles-republic",
      "name": "Miles Republic",
      "type": "miles-republic",
      "prismaSchema": "apps/agents/prisma/miles-republic.prisma"
    },
    
    "milesRepublicStaging": {
      "url": "postgresql://user:password@staging-host/database",
      "id": "db-miles-republic-staging",
      "name": "Miles Republic Staging",
      "type": "miles-republic",
      "prismaSchema": "apps/agents/prisma/miles-republic.prisma"
    }
  }
}
```

### 3. Générer les clients Prisma

```bash
# Client principal (data-agents)
npx prisma generate --schema=packages/database/prisma/schema.prisma

# Client Miles Republic
cd apps/agents
npx prisma generate --schema=prisma/miles-republic.prisma
```

## Utilisation dans le code

### Obtenir une connexion via le DatabaseManager

```typescript
import { DatabaseManager } from '@agent-framework'

// Le DatabaseManager détecte automatiquement le bon schéma
const milesClient = await dbManager.getConnection('db-miles-republic')

// Utiliser le client avec le bon typage
const events = await milesClient.event.findMany({
  where: { status: 'LIVE' }
})
```

### Dans les agents

```typescript
export class MyAgent extends BaseAgent {
  async execute(params: MyAgentParams, context: AgentContext): Promise<any> {
    // Connexion à Miles Republic
    const milesDb = await context.dbManager.getConnection('db-miles-republic')
    
    // Requêtes typées avec le schéma Miles Republic
    const editions = await milesDb.edition.findMany({
      where: { status: 'LIVE' },
      include: { event: true, races: true }
    })
    
    return { editions }
  }
}
```

## Fonctionnement interne

### 1. Chargement de la configuration

Le `DatabaseManager` lit `test-env.local.json` et détecte :
- L'URL de connexion pour chaque base
- Le type de base (`miles-republic`, `postgresql`, etc.)
- Le chemin vers le schéma Prisma à utiliser

### 2. Génération dynamique du client

Quand vous appelez `getConnection('db-miles-republic')` :

1. Le DatabaseManager vérifie si `prismaSchema` est spécifié
2. Si oui, il génère (si nécessaire) le client Prisma depuis ce schéma
3. Il charge le client généré depuis `node_modules/.prisma/client`
4. Il configure la connexion avec l'URL appropriée

### 3. Chemins de recherche

Le système essaie plusieurs chemins pour trouver le client généré :
- `apps/agents/node_modules/.prisma/client` (prioritaire)
- `node_modules/.prisma/client` (monorepo)
- Autres chemins relatifs au schéma

## Structure des fichiers

```
data-agents/
├── packages/
│   └── database/
│       └── prisma/
│           └── schema.prisma          # Schéma principal
│
├── apps/
│   └── agents/
│       └── prisma/
│           ├── miles-republic.prisma  # Schéma Miles Republic
│           └── .env.miles            # ❌ DEPRECATED - ne plus utiliser
│
└── test-environment/
    └── configs/
        ├── test-env.json                      # Config par défaut (versionné)
        ├── test-env.local.json.template       # Template
        └── test-env.local.json                # Votre config (non versionné)
```

## Migration depuis l'ancien système

Si vous utilisez encore des fichiers `.env` dispersés :

### 1. Supprimer les anciens `.env`

```bash
rm apps/agents/prisma/.env.miles
```

### 2. Migrer les URLs vers test-env.local.json

Copier les URLs de connexion depuis les anciens `.env` vers `test-env.local.json`

### 3. Vérifier la génération

```bash
# Le client devrait déjà être généré, sinon :
cd apps/agents
npx prisma generate --schema=prisma/miles-republic.prisma
```

## Troubleshooting

### Erreur "Schema Prisma introuvable"

Le chemin `prismaSchema` dans la config doit être relatif à la racine du projet :

```json
{
  "prismaSchema": "apps/agents/prisma/miles-republic.prisma"  // ✅ Correct
  // PAS: "./apps/agents/prisma/miles-republic.prisma"      // ❌ Incorrect
  // PAS: "prisma/miles-republic.prisma"                    // ❌ Incorrect
}
```

### Erreur "Client Prisma introuvable après génération"

Générer manuellement le client :

```bash
cd apps/agents
npx prisma generate --schema=prisma/miles-republic.prisma
```

Vérifier que le client existe :

```bash
ls -la apps/agents/node_modules/.prisma/client/
```

### Types Prisma non reconnus dans l'IDE

Redémarrer TypeScript dans VSCode :
- `Cmd+Shift+P` → "TypeScript: Restart TS Server"

## Avantages de ce système

1. **Centralisation** : Une seule source de vérité pour toutes les configurations
2. **Flexibilité** : Support de plusieurs bases avec des schémas différents
3. **Sécurité** : Les credentials ne sont pas versionnés (test-env.local.json dans .gitignore)
4. **Maintenabilité** : Plus de fichiers .env dispersés à gérer
5. **Typage** : Chaque base utilise son propre schéma avec le bon typage TypeScript
