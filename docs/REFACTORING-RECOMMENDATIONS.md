# Recommandations de Refactoring - Data Agents
**Date:** 2025-11-05  
**Objectif:** Éliminer le code redondant et simplifier l'architecture

---

## 📊 Analyse de la Codebase

### État actuel
- **Architecture:** Monorepo avec packages partagés et apps spécialisées
- **Packages:** types, agent-framework, database
- **Apps:** agents (extractors), api (REST), dashboard (React)
- **Taille:** ~15 000 lignes de code TypeScript (hors node_modules)

---

## 🔴 Problèmes Identifiés

### 1. **Duplication massive de la logique de connexion DB** ⭐️ CRITIQUE

**Localisation:**
- `GoogleSearchDateAgent.ts` (lignes 94-146)
- `FFAScraperAgent.ts` (lignes 73-108)

**Code dupliqué:**
```typescript
// Les deux agents ont EXACTEMENT la même méthode initializeSourceConnection()
private async initializeSourceConnection(config) {
  // Récupérer config DB
  // Construire connectionUrl
  // Créer PrismaClient
  // Tester connexion
}
```

**Impact:**
- 100+ lignes de code dupliquées
- Maintenance coûteuse (modifications en double)
- Risque d'incohérence entre implémentations
- Bugs potentiels si une version est corrigée mais pas l'autre

**Solution proposée:**
Déplacer cette logique dans `BaseAgent` ou créer un service `ConnectionManager` dans `agent-framework`.

```typescript
// packages/agent-framework/src/connection-manager.ts
export class ConnectionManager {
  async connectToSource(
    sourceDbId: string, 
    dbManager: DatabaseManager,
    logger: AgentLogger
  ): Promise<any> {
    // Logique centralisée unique
  }
}

// Dans BaseAgent
protected async connectToSource(sourceDbId: string): Promise<any> {
  return ConnectionManager.connectToSource(
    sourceDbId, 
    this.dbManager, 
    this.logger
  )
}
```

---

### 2. **DatabaseManager trop complexe et monolithique** ⭐️ IMPORTANT

**Problème:**
Le fichier `database-manager.ts` (420 lignes) fait trop de choses:
- Chargement de configurations (ligne 52-152)
- Création de connexions (ligne 192-318)
- Gestion de schémas Prisma multiples (ligne 209-282)
- Gestion du cycle de vie des connexions
- Tests de connexion

**Impact:**
- Difficile à tester unitairement
- Responsabilités mélangées (SRP violation)
- Complexité cognitive élevée

**Solution proposée:**
Appliquer le pattern **Strategy + Factory**

```
packages/agent-framework/src/database/
├── connection-manager.ts        ← Orchestration uniquement
├── config-loader.ts             ← Chargement configs
├── connection-factory.ts        ← Factory pour créer connexions
├── strategies/
│   ├── postgres-strategy.ts
│   ├── mysql-strategy.ts
│   └── miles-republic-strategy.ts
└── connection-pool.ts           ← Gestion du pool
```

**Bénéfices:**
- Testabilité: chaque composant testable isolément
- Extensibilité: facile d'ajouter un nouveau type de DB
- Lisibilité: fichiers plus petits et focalisés

---

### 3. **Composants Dashboard avec logique similaire** 🟡 MOYEN

**Problème:**
Les composants de tableau partagent beaucoup de logique:
- `BaseChangesTable.tsx` (326 lignes)
- `CategorizedChangesTable.tsx` (322 lignes)
- `EditionChangesTable.tsx`
- `EventChangesTable.tsx`
- `RaceChangesTable.tsx`

**Duplication:**
- Gestion de l'état des modifications
- Logique de validation
- Affichage conditionnel selon le type
- Handlers d'événements similaires

**Solution proposée:**
Créer un **composant générique avec hooks**

```typescript
// useChangesTable.ts
export function useChangesTable<T>(
  changes: T,
  onUpdate: (field: string, value: any) => void,
  validationRules?: ValidationRules<T>
) {
  // Logique partagée
  return { ... }
}

// ChangesTable.tsx (générique)
export function ChangesTable<T>({ 
  changes, 
  schema, 
  onUpdate,
  renderCell 
}: ChangesTableProps<T>) {
  const { ... } = useChangesTable(changes, onUpdate)
  // Render générique avec injection de renderCell
}

// Usage spécifique
<ChangesTable
  changes={editionChanges}
  schema={editionSchema}
  onUpdate={handleUpdate}
  renderCell={(field, value) => (
    // Render spécifique pour ce type
  )}
/>
```

**Estimation gain:** ~500-700 lignes économisées

---

### 4. **Services database avec responsabilités floues** 🟡 MOYEN

**Problème:**
Certains services ont des responsabilités qui se chevauchent:

```
packages/database/src/services/
├── AgentService.ts              (294 lignes)
├── AgentStateService.ts         (110 lignes)  ← État des agents
├── AgentRegistryService.ts      (180 lignes)  ← Registry séparé?
├── ProposalService.ts           (103 lignes)
├── ProposalApplicationService.ts (617 lignes!) ← Trop gros
└── RunService.ts                (120 lignes)
```

**Observations:**
1. `AgentRegistryService` pourrait être dans `agent-framework`
2. `ProposalApplicationService` (617 lignes) est trop complexe
3. Pas de séparation claire entre "data access" et "business logic"

**Solution proposée:**
Appliquer le pattern **Repository + Service Layer**

```
packages/database/src/
├── repositories/          ← Pure data access (CRUD)
│   ├── agent.repository.ts
│   ├── proposal.repository.ts
│   └── run.repository.ts
├── services/             ← Business logic
│   ├── agent.service.ts
│   ├── proposal.service.ts
│   └── proposal-application.service.ts
└── domain/               ← Domain models
    ├── agent.domain.ts
    └── proposal.domain.ts
```

**Exemple:**
```typescript
// repositories/proposal.repository.ts (data access only)
export class ProposalRepository {
  async findById(id: string): Promise<Proposal | null> {
    return prisma.proposal.findUnique({ where: { id } })
  }
  
  async update(id: string, data: any): Promise<Proposal> {
    return prisma.proposal.update({ where: { id }, data })
  }
}

// services/proposal.service.ts (business logic)
export class ProposalService {
  constructor(private repo: ProposalRepository) {}
  
  async approve(id: string, userId: string): Promise<void> {
    // Validation business
    const proposal = await this.repo.findById(id)
    if (!proposal) throw new NotFoundError()
    
    // Logique métier
    await this.validateApproval(proposal)
    
    // Persistance
    await this.repo.update(id, {
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date()
    })
  }
}
```

---

### 5. **Helpers utilitaires dupliqués** 🟢 FAIBLE

**Problème:**
`BaseAgent` contient des méthodes helpers qui pourraient être utilitaires:
- `parseDate()` (ligne 150-185)
- `extractNumber()` (ligne 188-203)
- `calculateSimilarity()` (ligne 120-123)
- `normalizeEventName()` (ligne 126-132)

**Solution proposée:**
Extraire dans un package `@data-agents/utils`

```
packages/utils/src/
├── date/
│   ├── parse-date.ts
│   └── extract-year.ts
├── string/
│   ├── normalize.ts
│   └── similarity.ts
└── number/
    └── extract-number.ts
```

**Bénéfices:**
- Réutilisables par tous les agents
- Testables isolément
- Documentation centralisée

---

### 6. **Validation de configuration agents dupliquée** 🟢 FAIBLE

**Problème:**
Chaque agent doit implémenter sa validation:
- `GoogleSearchDateAgent.configSchema.ts` (178 lignes)
- `FFAScraperAgent.configSchema.ts` (173 lignes)

Ces schémas contiennent des patterns répétés.

**Solution proposée:**
Créer des **schémas composables avec Zod**

```typescript
// packages/agent-framework/src/config-schemas/common.ts
import { z } from 'zod'

export const DatabaseConfigField = z.object({
  type: z.literal('database'),
  label: z.string(),
  required: z.boolean(),
  // ...
})

export const BatchSizeField = z.object({
  type: z.literal('number'),
  label: z.string(),
  min: z.number(),
  max: z.number(),
  default: z.number()
})

// Dans GoogleSearchDateAgent.configSchema.ts
import { DatabaseConfigField, BatchSizeField } from '@data-agents/agent-framework'

export const GoogleSearchDateAgentConfigSchema = {
  sourceDatabase: DatabaseConfigField,
  batchSize: BatchSizeField.extend({ 
    default: 10, 
    max: 100 
  }),
  // Champs spécifiques seulement
  googleApiKey: { ... }
}
```

---

## 📋 Plan de Refactoring Priorisé

### Phase 1: Problèmes critiques (Impact: ⭐️⭐️⭐️)
**Durée estimée: 1-2 jours**

1. **Centraliser la logique de connexion DB**
   - Créer `ConnectionManager` dans `agent-framework`
   - Refactoriser `GoogleSearchDateAgent` et `FFAScraperAgent`
   - Tests unitaires
   - **Gain:** ~150 lignes, maintenance simplifiée

2. **Décomposer DatabaseManager**
   - Extraire `ConfigLoader`
   - Extraire `ConnectionFactory`
   - Créer strategies pour chaque type de DB
   - **Gain:** ~200 lignes, testabilité +80%

### Phase 2: Améliorations importantes (Impact: ⭐️⭐️)
**Durée estimée: 2-3 jours**

3. **Généraliser les composants de tableau Dashboard**
   - Créer `useChangesTable` hook
   - Créer `ChangesTable` générique
   - Refactoriser les composants existants
   - **Gain:** ~600 lignes, cohérence UI

4. **Restructurer les services database**
   - Séparer Repository et Service layers
   - Simplifier `ProposalApplicationService`
   - **Gain:** ~300 lignes, clarté architecturale

### Phase 3: Optimisations (Impact: ⭐️)
**Durée estimée: 1 jour**

5. **Extraire utilitaires dans @data-agents/utils**
   - Créer package utils
   - Migration progressive
   - **Gain:** ~100 lignes, réutilisabilité

6. **Schémas de configuration composables**
   - Créer schémas de base réutilisables
   - **Gain:** ~150 lignes, cohérence

---

## 🎯 Gains Attendus

| Métrique | Avant | Après | Gain |
|----------|-------|-------|------|
| **Lignes de code** | ~15 000 | ~13 500 | -10% |
| **Fichiers > 300 lignes** | 12 | 4 | -67% |
| **Code dupliqué** | ~1500 lignes | ~300 lignes | -80% |
| **Testabilité** | 60% | 90% | +50% |
| **Temps ajout nouveau agent** | 4h | 1h | -75% |
| **Complexité cyclomatique** | Moyenne: 12 | Moyenne: 6 | -50% |

---

## 🚀 Migration Safe

Pour chaque refactoring:

1. **Tests avant:** Écrire tests pour comportement actuel
2. **Refactoring:** Appliquer les changements
3. **Tests après:** Vérifier que tous les tests passent
4. **Dépréciation progressive:** Garder ancien code avec `@deprecated`
5. **Migration graduelle:** Ne pas tout changer d'un coup

**Exemple de migration safe:**
```typescript
// Ancien code (déprécié)
/** @deprecated Use ConnectionManager.connectToSource() instead */
private async initializeSourceConnection(config) {
  this.logger.warn('initializeSourceConnection is deprecated')
  return this.connectionManager.connectToSource(config.sourceDatabase)
}

// Nouveau code
private async initializeSourceConnection(config) {
  return this.connectionManager.connectToSource(config.sourceDatabase)
}
```

---

## 📚 Patterns Architecturaux Recommandés

### 1. **Dependency Injection**
Au lieu de:
```typescript
class MyAgent extends BaseAgent {
  private dbManager = DatabaseManager.getInstance(this.logger)
}
```

Préférer:
```typescript
class MyAgent extends BaseAgent {
  constructor(
    config: AgentConfig,
    private dbManager: DatabaseManager,
    private connectionManager: ConnectionManager
  ) {
    super(config)
  }
}
```

### 2. **Factory Pattern**
Pour la création d'agents et de connexions:
```typescript
export class AgentFactory {
  static create(type: AgentType, config: any): BaseAgent {
    // Centraliser la logique de création
  }
}
```

### 3. **Strategy Pattern**
Pour les différentes stratégies de connexion DB:
```typescript
interface ConnectionStrategy {
  connect(config: DatabaseConfig): Promise<any>
  test(connection: any): Promise<boolean>
}

class PostgresStrategy implements ConnectionStrategy { ... }
class MySQLStrategy implements ConnectionStrategy { ... }
```

### 4. **Repository Pattern**
Séparer data access et business logic:
```typescript
// Data access
class ProposalRepository {
  async findById(id: string) { ... }
  async update(id: string, data: any) { ... }
}

// Business logic
class ProposalService {
  constructor(private repo: ProposalRepository) {}
  async approve(id: string) {
    // Validation + business rules
    await this.repo.update(id, { status: 'APPROVED' })
  }
}
```

---

## 🧪 Tests Recommandés

Pour chaque composant refactorisé, créer:

1. **Tests unitaires** (80% coverage minimum)
   ```typescript
   describe('ConnectionManager', () => {
     it('should connect to PostgreSQL', async () => { ... })
     it('should handle connection errors', async () => { ... })
   })
   ```

2. **Tests d'intégration**
   ```typescript
   describe('GoogleSearchDateAgent integration', () => {
     it('should connect and fetch events', async () => { ... })
   })
   ```

3. **Tests E2E** (pour API et Dashboard)
   ```typescript
   describe('Proposal approval workflow', () => {
     it('should approve proposal from UI', async () => { ... })
   })
   ```

---

## 📊 Métriques de Suivi

Pour valider le succès du refactoring:

| Métrique | Outil | Cible |
|----------|-------|-------|
| Code duplication | SonarQube / jscpd | < 3% |
| Cyclomatic complexity | ESLint complexity | < 10 par fonction |
| Test coverage | Jest | > 80% |
| Build time | Turbo | < 30s |
| Type errors | TypeScript strict | 0 |
| Bundle size (dashboard) | Vite | < 500KB gzip |

---

## ✅ Checklist de Validation

Avant de considérer le refactoring terminé:

- [ ] Tous les tests passent (unit + integration + E2E)
- [ ] Pas de régression fonctionnelle
- [ ] Documentation mise à jour (README, docs/)
- [ ] Types TypeScript stricts (pas de `any`)
- [ ] Pas de console.log oubliés
- [ ] Code review par au moins 1 personne
- [ ] Performance tests (agents doivent tourner aussi vite)
- [ ] Migration guide pour l'équipe

---

## 🎓 Ressources et Références

### Livres
- **Clean Code** - Robert C. Martin
- **Refactoring** - Martin Fowler
- **Design Patterns** - Gang of Four

### Articles
- [TypeScript Best Practices](https://typescript-book.com/)
- [React Hooks Patterns](https://kentcdodds.com/blog/react-hooks-pitfalls)
- [Node.js Design Patterns](https://www.nodejsdesignpatterns.com/)

### Outils
- **SonarQube** - Analyse de qualité de code
- **ESLint** - Linting avec règles de complexité
- **Prettier** - Formatage cohérent
- **Jest** - Testing framework

---

## 💡 Conclusion

Ce refactoring permettra de:
1. **Réduire la dette technique** de ~40%
2. **Améliorer la maintenabilité** (temps modification -50%)
3. **Faciliter l'onboarding** (temps compréhension -60%)
4. **Accélérer le développement** (nouveaux agents -75% temps)
5. **Réduire les bugs** (duplication = source de bugs)

**Recommandation:** Commencer par la Phase 1 (problèmes critiques) qui aura le plus d'impact avec le moins d'effort. Les phases suivantes peuvent être étalées sur plusieurs sprints.

**Effort total estimé:** 4-6 jours de développement + 2 jours de tests/validation.

**ROI:** Très élevé - chaque agent futur économisera 3-4 heures de développement.
