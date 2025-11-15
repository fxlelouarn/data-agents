# Déploiement du Dashboard sur Render

Ce guide explique comment déployer le dashboard React (interface de gestion) sur Render.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Render Project                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐│
│  │  data-agents-api     │  │ data-agents-dashboard││
│  │  (Web Service)       │◄─┤  (Static Site)       ││
│  │  Node.js Express     │  │  React + Vite        ││
│  │  Port: 4001          │  │  SPA                 ││
│  └──────────┬───────────┘  └──────────────────────┘│
│             │                                        │
│             ▼                                        │
│  ┌──────────────────────┐                          │
│  │  data-agents-db      │                          │
│  │  (PostgreSQL)        │                          │
│  │  Free Tier           │                          │
│  └──────────────────────┘                          │
└─────────────────────────────────────────────────────┘
```

## Configuration

### 1. Configuration automatique via render.yaml

Le fichier `render.yaml` à la racine contient la configuration complète :

```yaml
services:
  # API Backend
  - type: web
    name: data-agents-api
    env: node
    plan: starter
    region: frankfurt
    buildCommand: |
      npm ci && \
      npm run prisma:generate:all && \
      npm run db:migrate:deploy && \
      turbo build
    startCommand: node apps/api/dist/index.js
    envVars:
      - key: FRONTEND_URL
        value: https://data-agents-dashboard.onrender.com
      - key: CORS_ORIGIN
        value: https://data-agents-dashboard.onrender.com
    healthCheckPath: /api/health

  # Dashboard Frontend
  - type: web
    name: data-agents-dashboard
    env: static
    plan: starter
    region: frankfurt
    buildCommand: |
      npm ci && \
      cd apps/dashboard && \
      npm run build
    staticPublishPath: ./apps/dashboard/dist
    envVars:
      - key: VITE_API_URL
        value: https://data-agents-api.onrender.com
    routes:
      - type: rewrite
        source: /*
        destination: /index.html

databases:
  - name: data-agents-db
    region: frankfurt
    databaseName: data_agents
    user: data_agents_user
    plan: free
```

### 2. Variables d'environnement

#### Dashboard (Frontend)

| Variable | Valeur Production | Description |
|----------|-------------------|-------------|
| `VITE_API_URL` | `https://data-agents-api.onrender.com` | URL de l'API backend |
| `VITE_MUI_LICENSE_KEY` | (optionnel) | Licence MUI X pour DataGrid Pro |

#### API (Backend)

| Variable | Valeur Production | Description |
|----------|-------------------|-------------|
| `FRONTEND_URL` | `https://data-agents-dashboard.onrender.com` | URL du dashboard (pour CORS) |
| `CORS_ORIGIN` | `https://data-agents-dashboard.onrender.com` | Origine autorisée pour CORS |

## Déploiement

### Première fois (Blueprint)

1. **Connecter le repository GitHub** à Render

2. **Créer un nouveau Blueprint** :
   - Aller sur [Render Dashboard](https://dashboard.render.com)
   - Cliquer sur "New +" → "Blueprint"
   - Sélectionner le repository `data-agents`
   - Render détectera automatiquement `render.yaml`

3. **Configurer les secrets** :
   - `MILES_REPUBLIC_DATABASE_URL` : URL de connexion Miles Republic
   - `MILES_REPUBLIC_DATABASE_DIRECT_URL` : URL directe Miles Republic

4. **Déployer** :
   - Render créera automatiquement :
     - La base de données `data-agents-db`
     - Le service API `data-agents-api`
     - Le site static `data-agents-dashboard`

### Mises à jour

**Déploiement automatique** :
- Chaque push sur `main` déclenche un redéploiement automatique
- API : rebuild + redémarrage (~3-5 min)
- Dashboard : rebuild + publication CDN (~2-3 min)

**Déploiement manuel** :
- Dashboard Render → Sélectionner le service → "Manual Deploy"

## Ordre de déploiement

1. **Base de données** (créée en premier, automatiquement)
2. **API** (attend que la DB soit prête)
3. **Dashboard** (peut être déployé en parallèle de l'API)

## Vérifications post-déploiement

### 1. API

```bash
# Health check
curl https://data-agents-api.onrender.com/api/health

# Devrait retourner
{
  "status": "ok",
  "timestamp": "2025-11-15T15:00:00.000Z",
  "database": "connected"
}
```

### 2. Dashboard

```bash
# Vérifier que le site charge
curl -I https://data-agents-dashboard.onrender.com

# Devrait retourner HTTP 200
```

### 3. Connexion API ↔ Dashboard

- Ouvrir `https://data-agents-dashboard.onrender.com`
- Vérifier la connexion à l'API dans la console du navigateur
- Tester une action (ex: liste des agents)

## Troubleshooting

### Dashboard affiche une page blanche

**Causes possibles** :
1. Build Vite échoué → Vérifier les logs de build Render
2. Variable `VITE_API_URL` incorrecte → Vérifier dans les settings
3. Fichiers non trouvés → Vérifier `staticPublishPath: ./apps/dashboard/dist`

**Solution** :
```bash
# Tester le build localement
cd apps/dashboard
npm run build
ls -la dist/  # Doit contenir index.html
```

### CORS Errors

**Symptôme** : Console browser affiche `CORS policy: No 'Access-Control-Allow-Origin' header`

**Causes** :
1. `FRONTEND_URL` non définie dans l'API
2. `FRONTEND_URL` ne correspond pas à l'URL du dashboard

**Solution** :
- Vérifier que `FRONTEND_URL=https://data-agents-dashboard.onrender.com` dans l'API
- Redémarrer le service API après modification

### Routes React ne fonctionnent pas (404)

**Symptôme** : `https://data-agents-dashboard.onrender.com/proposals` → 404

**Cause** : Le serveur HTTP ne redirige pas vers `index.html` pour les routes SPA

**Solution** : Déjà configuré dans `render.yaml` :
```yaml
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

### Build timeout

**Symptôme** : Build échoue après 15 minutes

**Causes** :
1. `npm ci` trop long (dépendances lourdes)
2. `npm run build` trop long

**Solution** :
```yaml
# Optimiser le build
buildCommand: |-
  npm ci --prefer-offline && \
  cd apps/dashboard && \
  npm run build
```

## Monitoring

### Logs Dashboard

```bash
# Logs de build
render logs --service data-agents-dashboard --tail 100

# Logs de publication
render logs --service data-agents-dashboard --deployment latest
```

### Métriques

- **Build time** : ~2-3 minutes (normal)
- **Deploy time** : ~30 secondes (CDN propagation)
- **Bundle size** : ~1-2 MB (gzippé)

## Rollback

### Rollback Dashboard

1. Render Dashboard → `data-agents-dashboard` → "Deploys"
2. Sélectionner un déploiement précédent
3. Cliquer "Redeploy"

### Rollback API + Dashboard

Si un changement casse la compatibilité API ↔ Dashboard :

1. Rollback API d'abord
2. Puis rollback Dashboard
3. Ou déployer un hotfix sur une branche

## Sécurité

### Headers HTTP

Le dashboard est configuré avec des headers de sécurité :

```yaml
headers:
  - path: /*
    name: X-Frame-Options
    value: DENY
  - path: /*
    name: X-Content-Type-Options
    value: nosniff
  - path: /*
    name: Referrer-Policy
    value: strict-origin-when-cross-origin
```

### Authentication

- Le dashboard utilise JWT tokens stockés dans `localStorage`
- Tokens envoyés via header `Authorization: Bearer <token>`
- Expiration gérée côté API (vérifier `JWT_EXPIRES_IN`)

## Performance

### CDN

- Render sert le dashboard via son CDN global
- Cache agressif des assets statiques (JS, CSS, images)
- Invalidation automatique à chaque déploiement

### Optimisations Vite

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,  // Pour debugging en prod
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'mui': ['@mui/material', '@mui/icons-material']
        }
      }
    }
  }
})
```

## Coûts

| Service | Plan | Coût Mensuel |
|---------|------|--------------|
| `data-agents-db` | Free | $0 |
| `data-agents-api` | Starter | $7 |
| `data-agents-dashboard` | Starter | $7 |
| **Total** | | **$14/mois** |

**Note** : Le dashboard static peut être sur le plan **Free** si :
- Build time < 90s
- < 100 GB bandwidth/mois

## Next Steps

1. **Custom Domain** : Configurer `dashboard.data-agents.com`
2. **SSL** : Automatique avec Render (Let's Encrypt)
3. **CI/CD** : Ajouter tests dans GitHub Actions avant déploiement
4. **Monitoring** : Intégrer Sentry pour erreurs frontend

## Ressources

- [Render Static Sites Docs](https://render.com/docs/static-sites)
- [Vite Production Build](https://vitejs.dev/guide/build.html)
- [React Router with Static Hosting](https://reactrouter.com/en/main/guides/static-hosting)
