# Fix: Dépendance Circulaire database ↔ agent-framework

**Date** : 2025-11-14  
**Problème** : Erreur de build TypeScript causée par une dépendance circulaire entre `database` et `agent-framework`

## Contexte

Le projet Data Agents utilise une architecture monorepo avec plusieurs packages :
- `@data-agents/types` : Types partagés
- `@data-agents/database` : Client Prisma et services de base de données
- `@data-agents/agent-framework` : Framework pour créer des agents
- `@data-agents/sample-agents` : Implémentations d'agents (FFA, Google Search, etc.)

## Problème Rencontré

### Symptôme

```bash
npm run build
# Erreur lors du build de @data-agents/database

src/services/ConnectionService.ts:196:77 - error TS2307: 
Cannot find module '@data-agents/agent-framework' or its corresponding type declarations.
```

### Cause Racine

**Dépendance circulaire de packages** :

```
agent-framework (package.json) 
  → depends on "database"

database (ConnectionService.ts:196)
  → import('@data-agents/agent-framework')
```

**Problème TypeScript** :
- Au moment du build de `database`, `agent-framework` n'a pas encore été compilé
- TypeScript ne trouve pas les fichiers `.d.ts` de `agent-framework`
- Le build échoue même si Turbo a `dependsOn: ["^build"]` configuré

### Tentatives Infructueuses

#### 1. Ajouter `agent-framework` en devDependencies ❌

```json
// packages/database/package.json
{
  "devDependencies": {
    "@data-agents/agent-framework": "*"
  }
}
```

**Résultat** : Turbo détecte toujours le cycle et refuse de builder :
```
× Invalid package dependency graph: cyclic dependency detected:
│   @data-agents/database, @data-agents/agent-framework
```

#### 2. Utiliser TypeScript Project References ❌

```json
// packages/database/tsconfig.json
{
  "references": [
    { "path": "../agent-framework" }
  ],
  "compilerOptions": {
    "composite": true
  }
}
```

**Résultat** : 
- Turbo détecte toujours le cycle
- `composite: true` empêche la génération des fichiers `.d.ts` pour `agent-framework`
- Build échoue avec les mêmes erreurs de modules manquants

## Solution Appliquée

### 1. Import Dynamique avec @ts-ignore

**Fichier** : `packages/database/src/services/ConnectionService.ts` (ligne 196)

```typescript
try {
  console.log(`[ConnectionService] Importing DatabaseManager...`)
  // Import dynamique pour éviter les dépendances circulaires
  // @ts-ignore - Lazy loading au runtime pour éviter cycle database <-> agent-framework
  const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
  const logger = createConsoleLogger('ConnectionService', 'test-connection')
  const dbManager = DatabaseManager.getInstance(logger)
  // ... utiliser dbManager
} catch (testError) {
  error = testError instanceof Error ? testError.message : 'Connection failed'
}
```

**Pourquoi ça marche** :
- `@ts-ignore` dit à TypeScript d'ignorer cette ligne lors de la compilation
- L'import dynamique est résolu au **runtime** (Node.js), pas au compile-time (TypeScript)
- À l'exécution, `agent-framework` a déjà été compilé et ses `.d.ts` sont disponibles

### 2. Pas de Dépendance dans package.json

**Ne PAS ajouter** `agent-framework` dans `database/package.json` :

```json
{
  "dependencies": {
    "@data-agents/types": "*",
    // ❌ NE PAS AJOUTER: "@data-agents/agent-framework": "*"
  }
}
```

**Raison** : Turbo utilise les `package.json` pour construire le graphe de dépendances. Si on ajoute la dépendance, le cycle est détecté et le build échoue.

### 3. Retirer composite: true des tsconfig

**Avant** :
```json
// packages/agent-framework/tsconfig.json
{
  "compilerOptions": {
    "composite": true,  // ❌ Empêche génération .d.ts
    "outDir": "dist"
  }
}
```

**Après** :
```json
// packages/agent-framework/tsconfig.json
{
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,      // ✅ Génère .d.ts
    "declarationMap": true    // ✅ Génère .d.ts.map
  }
}
```

**Résultat** : Les fichiers `.d.ts` sont correctement générés dans `dist/`

### 4. Ordre de Build Garanti par Turbo

**Fichier** : `turbo.json`

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],  // ✅ Build les dépendances en premier
      "outputs": ["dist/**"]
    }
  }
}
```

**Fonctionnement** :
1. Turbo analyse les `package.json` pour construire le graphe
2. `agent-framework` dépend de `database` (déclaré dans son `package.json`)
3. Turbo build `database` en premier
4. `database` appelle l'import dynamique qui est ignoré par TypeScript
5. Turbo build ensuite `agent-framework`
6. Au runtime, tout fonctionne car les deux packages sont compilés

## Vérification de la Solution

### Commandes de Test

```bash
# Nettoyer complètement
npm run clean
rm -rf packages/*/dist

# Rebuilder
npm run build

# Vérifier que les .d.ts sont générés
ls -la packages/agent-framework/dist/types.d.ts
# Doit afficher le fichier, pas d'erreur "No such file"

# Vérifier que database compile
ls -la packages/database/dist/services/ConnectionService.d.ts
# Doit afficher le fichier

# Lancer les tests
npm run tsc
# Doit passer sans erreurs
```

### Fichiers à Vérifier

Après un build réussi, ces fichiers doivent exister :

```bash
packages/agent-framework/dist/
  ├── index.d.ts
  ├── types.d.ts          # ✅ CRITIQUE
  ├── base-agent.d.ts
  └── database-manager.d.ts

packages/database/dist/
  ├── index.d.ts
  └── services/
      └── ConnectionService.d.ts
```

## Règles à Respecter

### ✅ À FAIRE

1. **Import dynamique avec @ts-ignore** pour éviter les cycles au compile-time
2. **Pas de dépendance** de `database` vers `agent-framework` dans `package.json`
3. **Turbo gère l'ordre** via `dependsOn: ["^build"]`
4. **Toujours vérifier** que les `.d.ts` sont générés après un build

### ❌ À NE PAS FAIRE

1. **JAMAIS** ajouter `agent-framework` dans les dependencies/devDependencies de `database`
2. **JAMAIS** utiliser `composite: true` dans les tsconfig (casse la génération des `.d.ts`)
3. **JAMAIS** utiliser TypeScript Project References entre `database` et `agent-framework`
4. **JAMAIS** importer `agent-framework` au niveau module dans `database` (seulement dans les fonctions)

## Architecture Recommandée

```
@data-agents/types (aucune dépendance)
    ↓
@data-agents/database
    ↓ (déclarée dans package.json)
@data-agents/agent-framework
    ↑ (import dynamique runtime uniquement)
@data-agents/database (ConnectionService)
```

**Clé** : La dépendance `database → agent-framework` existe uniquement au **runtime**, pas au **build-time**.

## Ressources

- Issue similaire : https://github.com/microsoft/TypeScript/issues/42873
- Turbo docs : https://turbo.build/repo/docs/core-concepts/monorepos/filtering#dependencies
- TypeScript dynamic imports : https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-4.html#dynamic-import-expressions

## Historique

- **2025-11-14** : Fix initial avec `@ts-ignore` et retrait de `composite: true`
- **2025-11-14** : Documentation complète du problème et de la solution
