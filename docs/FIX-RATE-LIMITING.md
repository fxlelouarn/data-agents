# Fix Rate Limiting HTTP (429 Too Many Requests)

**Date** : 2025-11-10  
**Problème** : Rate limiting trop strict causant des erreurs 429 lors du chargement de la liste des propositions

## Symptômes

```
GET http://localhost:4001/api/proposals?limit=100&offset=0 429 (Too Many Requests)
Rate limited. Retrying in 1000ms (attempt 1/3)...
Rate limited. Retrying in 2000ms (attempt 2/3)...
Rate limited. Retrying in 4000ms (attempt 3/3)...
```

## Cause

1. **Rate limiting trop strict** : 100 requêtes / 15 minutes = **6.6 requêtes/minute**
2. **Requêtes multiples au chargement** :
   - GET `/api/proposals` (requête principale)
   - Enrichissement des propositions (connexions Miles Republic)
   - Retries React Query en cas d'échec
   - Refetch automatique au focus/montage

**Résultat** : Le simple chargement de la page pouvait déclencher 10-20 requêtes simultanées → 429 immédiat.

## Solution

### 1. Assouplir le rate limiting (Backend)

**Fichier** : `apps/api/src/index.ts`

```typescript
// ❌ AVANT (trop strict)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes / 15min = 6.6/min
})

// ✅ APRÈS (plus permissif)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (fenêtre plus courte)
  max: 500, // 500 requêtes/minute (largement suffisant)
  standardHeaders: true, // Headers RateLimit-*
  legacyHeaders: false,
})
app.use('/api', limiter) // Appliquer uniquement sur /api
```

**Bénéfices** :
- ✅ Fenêtre plus courte (1 min vs 15 min) → récupération rapide après burst
- ✅ Limite haute (500/min) → couvre tous les cas d'usage normaux
- ✅ Pas de rate limit sur `/health` → monitoring OK

### 2. Optimiser le cache React Query (Frontend)

**Fichier** : `apps/dashboard/src/hooks/useApi.ts`

```typescript
// ❌ AVANT (refetch excessif)
export const useProposals = (filters, limit, offset) => {
  return useQuery({
    queryKey: ['proposals', filters, limit, offset],
    queryFn: () => proposalsApi.getAll(filters, limit, offset),
    staleTime: 30000, // 30s
    refetchInterval: 60000, // 60s
    refetchOnWindowFocus: true, // ⚠️ Refetch à chaque retour sur l'onglet
    refetchOnMount: true, // ⚠️ Refetch à chaque montage
    retry: 3, // ⚠️ 3 retries par défaut
  })
}

// ✅ APRÈS (cache optimisé)
export const useProposals = (filters, limit, offset) => {
  return useQuery({
    queryKey: ['proposals', filters, limit, offset],
    queryFn: () => proposalsApi.getAll(filters, limit, offset),
    staleTime: 60000, // 60s (cache plus long)
    gcTime: 300000, // 5 min (garde le cache)
    refetchInterval: 120000, // 2 min (moins fréquent)
    refetchOnWindowFocus: false, // ✅ Pas de refetch au focus
    refetchOnMount: false, // ✅ Utilise le cache au montage
    retry: 1, // ✅ Un seul retry
  })
}
```

**Bénéfices** :
- ✅ Moins de requêtes réseau (cache utilisé)
- ✅ Pas de burst au chargement/focus
- ✅ Expérience utilisateur plus fluide

### 3. Backoff exponentiel (déjà en place)

**Fichier** : `apps/dashboard/src/services/api.ts`

```typescript
// Interceptor avec retry automatique
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 429) {
      config._retryCount = config._retryCount || 0
      
      if (config._retryCount < 3) {
        config._retryCount += 1
        const delayMs = Math.pow(2, config._retryCount - 1) * 1000
        // 1s, 2s, 4s
        await delay(delayMs)
        return api.request(config)
      }
    }
    return Promise.reject(error)
  }
)
```

**Déjà OK** : En cas de 429, retry avec backoff exponentiel.

## Impact

### Avant

- ❌ Rate limit atteint au chargement de la page
- ❌ Retry infini → 429 → 429 → 429
- ❌ Utilisateur bloqué 15 minutes
- ❌ Expérience dégradée

### Après

- ✅ Rate limit **jamais** atteint en usage normal
- ✅ Cache intelligent → moins de requêtes réseau
- ✅ Fenêtre courte → récupération rapide si burst exceptionnel
- ✅ Expérience fluide

## Surveillance

Pour vérifier le nombre de requêtes en production :

```bash
# Logs backend
grep "Rate limited" apps/api/logs/*.log | wc -l

# Headers HTTP (si activés)
curl -I http://localhost:4001/api/proposals
# RateLimit-Limit: 500
# RateLimit-Remaining: 498
# RateLimit-Reset: 1699876543
```

## Alternative : Pool de connexions PostgreSQL

**Note** : Ce fix ne concerne **pas** les connexions PostgreSQL (déjà optimisées via `ConnectionManager` et cache module-level). Voir `docs/DATABASE-CONNECTION-POOLING.md`.

Le problème ici était bien le **rate limiting HTTP**, pas le pool DB.

## Ressources

- [express-rate-limit docs](https://github.com/express-rate-limit/express-rate-limit)
- [TanStack Query - Caching](https://tanstack.com/query/latest/docs/framework/react/guides/caching)
- `docs/DATABASE-CONNECTION-POOLING.md` - Connexions DB
