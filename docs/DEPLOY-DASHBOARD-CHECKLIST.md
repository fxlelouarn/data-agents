# Checklist Déploiement Dashboard

## Pre-Deployment

- [ ] Tester le build localement
  ```bash
  cd apps/dashboard
  npm run build
  ls -la dist/  # Vérifier index.html présent
  ```

- [ ] Vérifier les variables d'environnement dans `render.yaml`
  - [ ] `VITE_API_URL` pointe vers l'API Render
  - [ ] `FRONTEND_URL` dans l'API pointe vers le dashboard

- [ ] Commit et push vers `main`
  ```bash
  git add render.yaml apps/dashboard/.env.example docs/DEPLOY-DASHBOARD.md
  git commit -m "feat: Add dashboard deployment config"
  git push origin main
  ```

## Deployment sur Render

- [ ] Aller sur [Render Dashboard](https://dashboard.render.com)

- [ ] Si premier déploiement (Blueprint) :
  - [ ] New + → Blueprint
  - [ ] Sélectionner repo `data-agents`
  - [ ] Vérifier que `render.yaml` est détecté
  - [ ] Configurer les secrets :
    - [ ] `MILES_REPUBLIC_DATABASE_URL`
    - [ ] `MILES_REPUBLIC_DATABASE_DIRECT_URL`
  - [ ] Cliquer "Apply"

- [ ] Si mise à jour :
  - [ ] Le déploiement se lance automatiquement sur push
  - [ ] Ou : Sélectionner `data-agents-dashboard` → "Manual Deploy"

## Post-Deployment Checks

- [ ] **Dashboard accessible**
  ```bash
  curl -I https://data-agents-dashboard.onrender.com
  # Status: 200 OK
  ```

- [ ] **API accessible**
  ```bash
  curl https://data-agents-api.onrender.com/api/health
  # {"status":"ok","database":"connected"}
  ```

- [ ] **CORS configuré**
  - [ ] Ouvrir la console browser sur le dashboard
  - [ ] Aucune erreur CORS dans la console
  - [ ] Requêtes API passent (Network tab)

- [ ] **Routes React fonctionnent**
  - [ ] Ouvrir `https://data-agents-dashboard.onrender.com/proposals`
  - [ ] Page charge correctement (pas de 404)

- [ ] **Authentication fonctionne**
  - [ ] Login réussit
  - [ ] Token stocké dans localStorage
  - [ ] Redirection après login

## Troubleshooting

Si le dashboard ne charge pas :

1. **Vérifier logs de build**
   ```bash
   # Via Render Dashboard → data-agents-dashboard → Logs
   ```

2. **Vérifier les variables d'environnement**
   - Settings → Environment → `VITE_API_URL` est correct

3. **Vérifier staticPublishPath**
   - Doit être `./apps/dashboard/dist`
   - Pas `/apps/dashboard/dist` (slash au début)

4. **Vérifier routes rewrite**
   - Dans `render.yaml` : `source: /*` → `destination: /index.html`

Si CORS errors :

1. **Vérifier FRONTEND_URL dans l'API**
   ```bash
   # Via Render Dashboard → data-agents-api → Environment
   # FRONTEND_URL = https://data-agents-dashboard.onrender.com
   ```

2. **Redémarrer l'API**
   - Render Dashboard → data-agents-api → Manual Deploy → Clear build cache & deploy

## Rollback

Si problème critique :

1. **Via Render Dashboard**
   - data-agents-dashboard → Deploys
   - Sélectionner un déploiement précédent
   - Cliquer "Redeploy"

2. **Via Git**
   ```bash
   git revert HEAD
   git push origin main
   # Le déploiement automatique se lance
   ```

## Performance Checks

- [ ] **Bundle size acceptable**
  - Vérifier dans les logs de build : `dist/assets/*.js`
  - Vendor bundle < 500 KB (gzipped)
  - Main bundle < 200 KB (gzipped)

- [ ] **Temps de chargement**
  - Ouvrir le dashboard
  - Network tab → Disable cache → Reload
  - First Contentful Paint < 2s
  - Time to Interactive < 3s

- [ ] **CDN fonctionne**
  - Headers de réponse incluent `x-render-origin: cache`
  - Assets statiques servis depuis le CDN

## Security Checks

- [ ] **Headers HTTP présents**
  ```bash
  curl -I https://data-agents-dashboard.onrender.com
  
  # Vérifier présence de :
  # X-Frame-Options: DENY
  # X-Content-Type-Options: nosniff
  # Referrer-Policy: strict-origin-when-cross-origin
  ```

- [ ] **HTTPS actif**
  - URL commence par `https://`
  - Certificat valide (Let's Encrypt)

- [ ] **Pas de secrets exposés**
  - Inspecter le code source (View Source)
  - Aucun token, password, ou API key en clair

## Success Criteria

✅ Dashboard accessible sans erreurs  
✅ Connexion à l'API fonctionne  
✅ Authentication fonctionne  
✅ Toutes les routes React chargent  
✅ Pas d'erreurs CORS  
✅ Logs propres (pas d'erreurs)  
✅ Performance acceptable (< 3s load time)  

## Next Steps

Après un déploiement réussi :

1. **Tester les fonctionnalités critiques**
   - [ ] Créer un agent
   - [ ] Lancer un agent
   - [ ] Voir les propositions
   - [ ] Approuver une proposition

2. **Monitoring**
   - [ ] Configurer alertes Render (uptime, erreurs)
   - [ ] Ajouter Sentry pour erreurs frontend (optionnel)

3. **Documentation**
   - [ ] Mettre à jour README avec URLs de production
   - [ ] Documenter toute configuration spécifique
