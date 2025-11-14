# Performance : Optimisation pLimit pour l'Enrichissement des Propositions

**Date** : 2025-11-14  
**Fichier concerné** : `apps/api/src/routes/proposals.ts`

## Problème

Lors du chargement de la liste des propositions dans le dashboard, l'API enrichit chaque proposition avec des données contextuelles provenant de Miles Republic :
- Nom de l'événement (`eventName`)
- Ville (`eventCity`)
- Année de l'édition (`editionYear`)
- Statut de l'événement (`eventStatus`)
- Courses existantes pour les éditions

**Processus d'enrichissement** :
1. L'API récupère N propositions depuis la base data-agents
2. Pour chaque proposition, elle fait 1-3 requêtes SQL sur Miles Republic
3. Les données sont agrégées et retournées au frontend

**Goulot d'étranglement** : Les requêtes à Miles Republic sont séquentielles par défaut, causant des temps de réponse longs.

## Symptômes de Lenteur

### Avant Optimisation (pLimit 5)
- **20 propositions** : ~4 secondes (4 batches de 5)
- **100 propositions** : ~20 secondes (20 batches de 5)
- **Connexions DB** : 5 connexions max simultanées

### Impact Utilisateur
- ⏳ Chargement de page long
- 😞 Mauvaise expérience utilisateur
- 🔴 Dashboard perçu comme "lent"

## Solution Appliquée

### Code Optimisé

**Fichier** : `apps/api/src/routes/proposals.ts` (ligne 162-164)

```typescript
// Limiter la concurrence des requêtes DB pour éviter "too many clients"
// Dev local : 20 | Production : 10 (selon config PostgreSQL max_connections)
const enrichLimit = pLimit(process.env.NODE_ENV === 'production' ? 10 : 20)
```

**Utilisation** :
```typescript
// GET /api/proposals - List proposals (ligne 412-414)
const enrichedProposals = await Promise.all(
  proposals.map(p => enrichLimit(() => enrichProposal(p)))
)

// GET /api/proposals/group/:groupKey - Group proposals (ligne 474-476)
const enrichedProposals = await Promise.all(
  proposals.map(p => enrichLimit(() => enrichProposal(p)))
)
```

### Résultats

#### Après Optimisation (pLimit 20 en dev)
- **20 propositions** : ~1 seconde (1 batch de 20) → **4x plus rapide** 🚀
- **100 propositions** : ~5 secondes (5 batches de 20) → **4x plus rapide** 🚀
- **Connexions DB** : 20 connexions max simultanées

#### Après Optimisation (pLimit 10 en prod)
- **20 propositions** : ~2 secondes (2 batches de 10) → **2x plus rapide**
- **100 propositions** : ~10 secondes (10 batches de 10) → **2x plus rapide**
- **Sécurité** : Évite de saturer le pool PostgreSQL en production

## Configuration PostgreSQL

### Vérifier max_connections

```bash
# Connexion à PostgreSQL
psql "$MILES_REPUBLIC_DATABASE_URL"

# Vérifier la configuration actuelle
SHOW max_connections;
```

**Valeurs typiques** :
- **Dev local (Postgres.app)** : 100-200 connexions
- **Production (Render/AWS RDS)** : 20-100 connexions selon le tier
- **Shared hosting** : 10-20 connexions

### Adapter pLimit selon max_connections

**Règle générale** : `pLimit = max_connections / 3`

**Exemples** :
| Environnement | max_connections | pLimit recommandé |
|---------------|-----------------|-------------------|
| Dev local | 100 | 30-50 |
| Production (petit) | 20 | 5-7 |
| Production (moyen) | 50 | 15-20 |
| Production (large) | 100 | 30-40 |

**Pourquoi diviser par 3** :
- Le pool est partagé entre API, agents, et autres services
- Évite d'épuiser toutes les connexions simultanément
- Laisse de la marge pour les pics de trafic

## Ajustement Manuel

### Augmenter la Limite (Dev Local)

Si 20 est encore trop lent et que vous avez assez de connexions disponibles :

```typescript
// apps/api/src/routes/proposals.ts (ligne 164)
const enrichLimit = pLimit(process.env.NODE_ENV === 'production' ? 10 : 50)
//                                                                        ^^^ Augmenté
```

**Test** :
1. Modifier le code
2. Redémarrer l'API : `npm run dev:api`
3. Charger la liste des propositions dans le dashboard
4. Vérifier les temps de réponse dans Network DevTools

### Variable d'Environnement (Optionnel)

Pour rendre la configuration plus flexible :

```typescript
// apps/api/src/routes/proposals.ts
const enrichLimit = pLimit(
  parseInt(process.env.ENRICH_LIMIT || '0') || 
  (process.env.NODE_ENV === 'production' ? 10 : 20)
)
```

Puis dans `.env` :
```bash
# Dev rapide
ENRICH_LIMIT=50

# Production conservatrice
ENRICH_LIMIT=5
```

## Surveillance

### Logs de Performance

Ajouter des logs pour mesurer l'impact :

```typescript
export async function enrichProposal(proposal: any) {
  const startTime = Date.now()
  
  // ... enrichissement ...
  
  const duration = Date.now() - startTime
  if (duration > 100) {
    console.warn(`[PERF] Enrichment took ${duration}ms for proposal ${proposal.id}`)
  }
  
  return enrichedProposal
}
```

### Métriques à Surveiller

- **Temps de réponse API** : `GET /api/proposals` < 2s pour 20 propositions
- **Erreurs "too many clients"** : 0 en production
- **CPU PostgreSQL** : < 50% en moyenne
- **Pool connections** : Pas de saturation (`active_connections / max_connections < 0.8`)

## Amélioration Future : Cache en Base

**Problème actuel** : L'enrichissement est refait à chaque requête, même si les données ne changent pas souvent.

**Solution long terme** : Cacher les données enrichies dans la table `Proposal`

### Migration Prisma Proposée

```prisma
model Proposal {
  id            String   @id @default(cuid())
  
  // ... champs existants ...
  
  // Cache des données enrichies (nouveau)
  eventName     String?
  eventCity     String?
  eventStatus   String?
  eventSlug     String?
  editionYear   Int?
  
  // Timestamp de cache pour invalidation
  enrichedAt    DateTime?
}
```

### Logique de Cache

```typescript
export async function enrichProposal(proposal: any) {
  // Si déjà enrichi et récent (< 1h), retourner directement
  if (proposal.enrichedAt && 
      Date.now() - proposal.enrichedAt.getTime() < 3600000) {
    return proposal
  }
  
  // Sinon, enrichir et sauvegarder
  const enriched = await fetchFromMilesRepublic(proposal)
  
  await db.prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      eventName: enriched.eventName,
      eventCity: enriched.eventCity,
      enrichedAt: new Date()
    }
  })
  
  return enriched
}
```

**Bénéfices** :
- ✅ Requêtes API instantanées (0 requête à Miles Republic)
- ✅ Moins de charge sur PostgreSQL
- ✅ Scalabilité améliorée
- ⚠️ Nécessite invalidation du cache si données Miles Republic changent

**Inconvénients** :
- ❌ Migration Prisma nécessaire
- ❌ Logique d'invalidation à implémenter
- ❌ Données potentiellement stale (délai de mise à jour)

## Ressources

- Documentation pLimit : https://github.com/sindresorhus/p-limit
- PostgreSQL max_connections : https://www.postgresql.org/docs/current/runtime-config-connection.html
- Connection pooling best practices : https://node-postgres.com/features/pooling

## Historique

- **2025-11-14** : Optimisation de `pLimit(5)` vers `pLimit(20)` en dev, `pLimit(10)` en prod
- **2025-11-14** : Documentation complète de l'optimisation
