# Gestion des connexions aux bases de données

## Problème résolu : Connexions multiples au démarrage

### Symptômes

Au chargement d'une page de propositions dans le dashboard, l'API créait **20+ connexions** simultanées à la base de données Miles Republic :

```
info: Connexion créée pour: localhost
info: Connexion établie à la base de données: localhost
[... répété 20+ fois ...]
```

### Cause racine

La fonction `enrichProposal()` dans `apps/api/src/routes/proposals.ts` était appelée pour chaque proposition individuellement :

```typescript
// ❌ AVANT - Créait une nouvelle connexion pour chaque proposition
const enrichedProposals = await Promise.all(
  proposals.map(p => enrichProposal(p))
)
```

À l'intérieur de `enrichProposal()`, le code créait une connexion à chaque appel :

```typescript
// ❌ Code problématique
if (!enrichProposalDbManager) {
  const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
  const logger = createConsoleLogger('API', 'proposals-api')
  enrichProposalDbManager = DatabaseManager.getInstance(logger)
}

const connection = await enrichProposalDbManager.getConnection(milesRepublicConnectionId)
```

Le problème : `getConnection()` **retournait bien la même connexion** depuis le cache de `DatabaseManager`, mais le cache était **au niveau de l'instance de `DatabaseManager`**, pas au niveau du module. Chaque `Promise.all()` créait des appels concurrents qui déclenchaient tous la même initialisation.

### Solution

**Cacher la connexion Prisma au niveau du module** plutôt que de la récupérer à chaque fois :

```typescript
// ✅ APRÈS - Variables de cache au niveau module
let enrichProposalDbManager: any = null
let milesRepublicConnectionId: string | null = null
let milesRepublicConnection: any = null // Cache de la connexion Prisma

export async function enrichProposal(proposal: any) {
  if (proposal.type === 'EVENT_UPDATE' && proposal.eventId) {
    try {
      // Initialisation lazy UNIQUE au premier appel
      if (!milesRepublicConnection) {
        const milesRepublicConn = await db.prisma.databaseConnection.findFirst({
          where: { type: 'MILES_REPUBLIC', isActive: true }
        })
        if (!milesRepublicConn) return proposal
        milesRepublicConnectionId = milesRepublicConn.id

        const { DatabaseManager, createConsoleLogger } = await import('@data-agents/agent-framework')
        const logger = createConsoleLogger('API', 'proposals-api')
        enrichProposalDbManager = DatabaseManager.getInstance(logger)
        
        // ✅ Obtenir et cacher la connexion UNE SEULE FOIS
        milesRepublicConnection = await enrichProposalDbManager.getConnection(milesRepublicConnectionId)
      }

      // ✅ Réutiliser la connexion en cache
      const connection = milesRepublicConnection
```

### Bénéfices

1. **Performance** : Une seule connexion établie au lieu de 20+
2. **Scalabilité** : Pas d'épuisement du pool de connexions PostgreSQL
3. **Logs propres** : Une seule ligne de log au lieu de 20+
4. **Coût réduit** : Moins de connexions = moins de ressources

### Architecture

```
Requête API
    ↓
GET /api/proposals?status=PENDING
    ↓
proposals.map(enrichProposal)  [20 appels parallèles]
    ↓
enrichProposal() vérifie : milesRepublicConnection ?
    ↓
    ├── Première fois : Initialiser + Cacher connexion
    │   ↓
    │   DatabaseManager.getInstance()
    │   ↓
    │   dbManager.getConnection(id)
    │   ↓
    │   [Connexion Prisma créée et cachée]
    │
    └── Appels suivants : Réutiliser milesRepublicConnection
```

### Points d'attention

1. **Singleton DatabaseManager** : `DatabaseManager.getInstance()` est déjà un singleton, mais on cache en plus la connexion Prisma pour éviter même l'appel à `getConnection()`

2. **Lazy loading** : La connexion n'est créée que si nécessaire (quand une proposition a besoin d'enrichissement)

3. **Hot reload** : En mode dev, si le code change, Node.js recharge le module et réinitialise les variables de cache (comportement souhaité)

4. **Mémoire** : La connexion reste en mémoire pendant toute la durée de vie du processus API (comportement optimal pour un pool de connexions)

### Tests

Pour vérifier que le fix fonctionne :

```bash
# Démarrer l'API
npm run dev:api

# Charger une page de propositions dans le dashboard
# Observer les logs : une seule ligne "Connexion créée" au lieu de 20+
```

### Voir aussi

- `packages/agent-framework/src/database-manager.ts` - Système de cache des connexions
- `packages/agent-framework/src/connection-manager.ts` - Création des connexions Prisma
- `docs/PRISMA-MULTI-SCHEMA.md` - Configuration multi-schéma Prisma
