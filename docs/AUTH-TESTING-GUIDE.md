# Guide de test - Système d'authentification

**Date** : 2025-11-10

## 🚀 Démarrage rapide

### 1. Démarrer les services

```bash
# Terminal 1 - API
cd apps/api
npm run dev

# Terminal 2 - Dashboard
cd apps/dashboard
npm run dev
```

### 2. URLs

- **Dashboard** : http://localhost:4000
- **API** : http://localhost:4001

### 3. Compte administrateur par défaut

```
Email: admin@data-agents.local
Password: admin123
```

---

## ✅ Checklist de tests

### Test 1 : Connexion et navigation

- [ ] Ouvrir http://localhost:4000
- [ ] Vérifier redirection vers `/login`
- [ ] Se connecter avec le compte admin
- [ ] Vérifier redirection vers `/proposals`
- [ ] Vérifier que le nom "Admin System" apparaît en haut à droite
- [ ] Vérifier que tous les onglets sont visibles (Propositions, Agents, Mises à jour, Paramètres, Utilisateurs)

### Test 2 : Menu utilisateur

- [ ] Cliquer sur le nom d'utilisateur en haut à droite
- [ ] Vérifier que le menu s'ouvre avec :
  - Email : admin@data-agents.local
  - Rôle : ADMIN
  - Bouton "Déconnexion"
- [ ] Cliquer sur "Déconnexion"
- [ ] Vérifier redirection vers `/login`
- [ ] Vérifier que le token est supprimé (localStorage vide)

### Test 3 : Page de gestion des utilisateurs

- [ ] Se reconnecter en tant qu'admin
- [ ] Cliquer sur l'onglet "Utilisateurs"
- [ ] Vérifier que la page affiche le tableau des utilisateurs
- [ ] Vérifier que l'admin existe dans la liste

#### Créer un VALIDATOR

- [ ] Cliquer sur "Nouvel utilisateur"
- [ ] Remplir le formulaire :
  - Prénom : Jean
  - Nom : Dupont
  - Email : jean.dupont@example.com
  - Password : password123
  - Rôle : Validateur
- [ ] Cliquer sur "Créer"
- [ ] Vérifier la notification de succès
- [ ] Vérifier que Jean Dupont apparaît dans la liste avec un chip bleu "Validateur"

#### Créer un EXECUTOR

- [ ] Cliquer sur "Nouvel utilisateur"
- [ ] Remplir le formulaire :
  - Prénom : Marie
  - Nom : Martin
  - Email : marie.martin@example.com
  - Password : password123
  - Rôle : Exécuteur
- [ ] Cliquer sur "Créer"
- [ ] Vérifier la notification de succès
- [ ] Vérifier que Marie Martin apparaît avec un chip vert "Exécuteur"

#### Modifier un utilisateur

- [ ] Cliquer sur l'icône ✏️ à côté de Jean Dupont
- [ ] Changer le rôle en "Exécuteur"
- [ ] Cliquer sur "Mettre à jour"
- [ ] Vérifier que le chip de Jean passe au vert

#### Désactiver/réactiver un utilisateur

- [ ] Cliquer sur le chip "Actif" de Marie Martin
- [ ] Vérifier qu'il devient "Désactivé" (gris)
- [ ] Cliquer à nouveau sur le chip
- [ ] Vérifier qu'il redevient "Actif" (vert)

#### Réinitialiser un mot de passe

- [ ] Cliquer sur l'icône 🔒 à côté de Jean Dupont
- [ ] Saisir un nouveau mot de passe : newpassword123
- [ ] Cliquer sur "Réinitialiser"
- [ ] Vérifier la notification de succès

### Test 4 : Permissions VALIDATOR

- [ ] Se déconnecter
- [ ] Se connecter avec jean.dupont@example.com / newpassword123
- [ ] Vérifier que le nom "Jean Dupont" apparaît en haut à droite
- [ ] Vérifier que le rôle "EXECUTOR" apparaît dans le menu (car on l'a modifié)
- [ ] Vérifier que l'onglet "Utilisateurs" n'apparaît PAS
- [ ] Vérifier que l'onglet "Agents" n'apparaît PAS
- [ ] Vérifier que l'onglet "Propositions" apparaît
- [ ] Aller sur une proposition PENDING
- [ ] Vérifier qu'on peut appliquer (car EXECUTOR maintenant)

### Test 5 : Permissions EXECUTOR

- [ ] Se déconnecter
- [ ] Se connecter avec marie.martin@example.com / password123
- [ ] Vérifier que le nom "Marie Martin" apparaît
- [ ] Vérifier que le rôle "EXECUTOR" apparaît
- [ ] Vérifier que l'onglet "Utilisateurs" n'apparaît PAS
- [ ] Vérifier que l'onglet "Agents" n'apparaît PAS
- [ ] Vérifier que l'onglet "Mises à jour" apparaît
- [ ] Aller sur une proposition APPROVED
- [ ] Vérifier qu'on PEUT appliquer la proposition

### Test 6 : Traçage reviewedBy

- [ ] Se reconnecter en tant qu'admin
- [ ] Aller sur une proposition PENDING
- [ ] Approuver la proposition
- [ ] Ouvrir un terminal et exécuter :

```bash
# Remplacer <proposal_id> par l'ID de la proposition
psql "$DATABASE_URL" -c "SELECT id, status, \"reviewedBy\", \"reviewedAt\" FROM proposals WHERE id = '<proposal_id>';"
```

- [ ] Vérifier que `reviewedBy` contient l'ID de l'admin
- [ ] Vérifier que `reviewedAt` est rempli

### Test 7 : Traçage appliedBy

- [ ] Rester connecté en tant qu'admin (ou se connecter en EXECUTOR)
- [ ] Aller sur la proposition APPROVED du test précédent
- [ ] Appliquer la proposition
- [ ] Ouvrir un terminal et exécuter :

```bash
psql "$DATABASE_URL" -c "SELECT id, status, \"appliedBy\" FROM proposals WHERE id = '<proposal_id>';"
```

- [ ] Vérifier que `appliedBy` contient l'ID de l'utilisateur connecté

### Test 8 : Protection des routes

- [ ] Se déconnecter
- [ ] Dans l'URL, essayer d'accéder directement à http://localhost:4000/agents
- [ ] Vérifier redirection vers `/login`
- [ ] Se connecter en tant que Jean Dupont (EXECUTOR)
- [ ] Essayer d'accéder à http://localhost:4000/agents
- [ ] Vérifier qu'on reste sur la page actuelle ou redirection (protection par rôle)

### Test 9 : Interceptor token expiré

⚠️ Ce test nécessite de modifier temporairement `JWT_EXPIRES_IN` dans `.env` à `10s` pour tester rapidement.

- [ ] Se connecter
- [ ] Attendre 11 secondes
- [ ] Faire une requête (ex: rafraîchir la page des propositions)
- [ ] Vérifier redirection automatique vers `/login`
- [ ] Vérifier notification "Token expiré" ou équivalent

---

## 🐛 Problèmes courants et solutions

### Erreur : "Cannot read properties of undefined (reading 'findUnique')"

**Cause** : Le client Prisma n'a pas été régénéré.

**Solution** :
```bash
npm run db:generate
npm run build:database --force
# Redémarrer le serveur API
```

### Erreur : Token invalide immédiatement après connexion

**Cause** : JWT_SECRET différent entre backend et frontend, ou pas configuré.

**Solution** :
```bash
# Vérifier apps/api/.env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
```

### Erreur : CORS lors des requêtes auth

**Vérifier** : Le CORS est configuré dans `apps/api/src/index.ts` :
```typescript
app.use(cors({
  origin: 'http://localhost:4000',
  credentials: true
}))
```

### Page blanche après connexion

**Cause** : Erreur de rendu ou route mal configurée.

**Solution** :
1. Ouvrir la console du navigateur (F12)
2. Vérifier les erreurs JavaScript
3. Vérifier que toutes les routes sont bien importées dans `App.tsx`

---

## 📊 Résultats attendus

Après tous les tests ✅ :

| Fonctionnalité | Résultat |
|----------------|----------|
| Connexion | ✅ Fonctionne |
| Déconnexion | ✅ Redirige vers login |
| Menu utilisateur | ✅ Affiche nom, email, rôle |
| Page Users | ✅ CRUD complet |
| Protection routes | ✅ Redirige si non authentifié |
| Permissions ADMIN | ✅ Accès complet |
| Permissions VALIDATOR | ✅ Accès limité |
| Permissions EXECUTOR | ✅ Accès limité |
| Traçage reviewedBy | ✅ Enregistré en DB |
| Traçage appliedBy | ✅ Enregistré en DB |

---

## 📚 Documentation complémentaire

- `docs/AUTH-IMPLEMENTATION-GUIDE.md` - Guide complet d'implémentation
- `docs/AUTH-FRONTEND-STATUS.md` - État détaillé du frontend
- `docs/AUTH-STEPS-5-6-COMPLETED.md` - Détails étapes 5 et 6
- `packages/database/prisma/schema.prisma` - Schéma de base de données

---

## 🎯 Prochaines étapes (optionnelles)

- [ ] Ajouter refresh token pour renouveler automatiquement
- [ ] Implémenter double authentification (2FA)
- [ ] Ajouter réinitialisation de mot de passe par email
- [ ] Créer un système d'invitation d'utilisateurs
- [ ] Afficher historique des actions (audit log) dans l'interface
- [ ] Statistiques par utilisateur (nb approbations, temps moyen, etc.)
