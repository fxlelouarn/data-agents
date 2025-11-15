# TODO : Remettre TypeScript strict mode pour l'API

## Contexte

Pour permettre le déploiement rapide sur Render, le mode `strict: false` a été activé dans `apps/api/tsconfig.json` (commit `7fbe6d4`).

Ceci désactive toutes les vérifications strictes de TypeScript :
- `noImplicitAny`
- `strictNullChecks`
- `strictFunctionTypes`
- `strictBindCallApply`
- `strictPropertyInitialization`
- `alwaysStrict`

**Objectif** : Corriger tous les typages pour pouvoir remettre `strict: true`.

---

## Erreurs à corriger

### 1. `src/routes/proposals.ts`

#### Ligne 522 : Paramètres `p` et `idx` non typés
```typescript
// ❌ AVANT
enrichedProposals.sort((p, idx) => ...)

// ✅ APRÈS
enrichedProposals.sort((p: EnrichedProposal, idx: number) => ...)
```

#### Ligne 731, 822, 831, 844, 888, 940, 1096, 1102, 1109, 1475, 1507, 1512, 1748 : Paramètre `app` non typé
```typescript
// ❌ AVANT
applications.filter((app) => ...)

// ✅ APRÈS
import { ProposalApplication } from '@data-agents/database'
applications.filter((app: ProposalApplication) => ...)
```

#### Ligne 770 : `createdApplication` possiblement null
```typescript
// ❌ AVANT
applicationId: createdApplication.id

// ✅ APRÈS
applicationId: createdApplication?.id ?? ''
// OU vérifier avant
if (!createdApplication) {
  throw new Error('Failed to create application')
}
applicationId: createdApplication.id
```

#### Ligne 1104, 1504, 1677 : Paramètre `tx` non typé
```typescript
// ❌ AVANT
await prisma.$transaction(async (tx) => {
  ...
})

// ✅ APRÈS
await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
  ...
})
```

#### Ligne 1706 : Paramètre `p` non typé dans reduce
```typescript
// ❌ AVANT
proposals.reduce((acc, p) => ...)

// ✅ APRÈS
proposals.reduce((acc: SomeType, p: Proposal) => ...)
```

#### Ligne 1761 : Type `never[]` pour `applicationsToCreate`
```typescript
// ❌ AVANT
const applicationsToCreate = []
applicationsToCreate.push({
  proposalId: proposal.id,
  status: 'PENDING' as const
})

// ✅ APRÈS
type ApplicationToCreate = {
  proposalId: string
  status: 'PENDING'
}
const applicationsToCreate: ApplicationToCreate[] = []
applicationsToCreate.push({
  proposalId: proposal.id,
  status: 'PENDING' as const
})
```

---

### 2. `src/routes/agents.ts`

#### Ligne 285 : Paramètres `acc` et `s` non typés
```typescript
// ❌ AVANT
states.reduce((acc, s) => ...)

// ✅ APRÈS
import { AgentState } from '@data-agents/database'
states.reduce((acc: Record<string, any>, s: AgentState) => ...)
```

---

### 3. `src/services/agent-failure-monitor.ts`

#### Lignes 58 et 233 : Type `never[]` pour `failedRuns`
```typescript
// ❌ AVANT
const failedRuns = []
failedRuns.push({
  id: run.id,
  status: run.status,
  startedAt: run.startedAt,
  error: run.error || undefined
})

// ✅ APRÈS
import { AgentRun } from '@data-agents/database'
type FailedRunInfo = {
  id: string
  status: AgentRun['status']
  startedAt: Date
  error: string | undefined
}
const failedRuns: FailedRunInfo[] = []
failedRuns.push({
  id: run.id,
  status: run.status,
  startedAt: run.startedAt,
  error: run.error || undefined
})
```

---

### 4. `src/services/scheduler.ts`

#### Ligne 110 : Type `never[]` pour `stoppedJobs`
```typescript
// ❌ AVANT
const stoppedJobs = []
stoppedJobs.push(agentId)

// ✅ APRÈS
const stoppedJobs: string[] = []
stoppedJobs.push(agentId)
```

---

## Plan d'action

### Étape 1 : Activer `noImplicitAny` uniquement
```json
{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": true
  }
}
```

Corriger toutes les erreurs `implicitly has an 'any' type`.

### Étape 2 : Activer `strictNullChecks`
```json
{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

Corriger toutes les erreurs `possibly 'null'` ou `possibly 'undefined'`.

### Étape 3 : Activer `strict: true`
```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Corriger les erreurs restantes.

---

## Estimation

- **Nombre d'erreurs** : ~25 erreurs TypeScript
- **Temps estimé** : 1-2 heures
- **Priorité** : Moyenne (le code fonctionne, mais la sécurité des types est compromise)

---

## Bénéfices

✅ Détection précoce des bugs  
✅ Meilleure autocomplétion IDE  
✅ Refactoring plus sûr  
✅ Documentation du code via les types  
✅ Moins de bugs en production  

---

## Notes

- Les erreurs sont principalement des tableaux non typés (`never[]`)
- Beaucoup de callbacks avec paramètres `any`
- Quelques nullable checks manquants
- Aucune erreur de logique métier, juste du typage manquant
