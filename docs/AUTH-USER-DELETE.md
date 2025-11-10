# Suppression d'utilisateur

**Date** : 2025-11-10

## 🎯 Fonctionnalité

Ajout de la possibilité pour les administrateurs de supprimer des utilisateurs, avec protection pour garantir qu'il reste toujours au moins un administrateur actif.

---

## ✅ Implémentation

### Backend

#### 1. Service AuthService

**Fichier** : `apps/api/src/services/auth.service.ts`

**Nouvelle méthode** : `deleteUser(userId: string)`

```typescript
/**
 * Supprime un utilisateur (admin only)
 * Vérifie qu'il reste au moins un admin actif
 */
async deleteUser(userId: string) {
  const user = await this.client.user.findUnique({
    where: { id: userId }
  })

  if (!user) {
    throw new Error('User not found')
  }

  // Si l'utilisateur est admin, vérifier qu'il reste au moins un autre admin actif
  if (user.role === 'ADMIN') {
    const activeAdmins = await this.client.user.count({
      where: {
        role: 'ADMIN',
        isActive: true,
        id: { not: userId }
      }
    })

    if (activeAdmins === 0) {
      throw new Error('Cannot delete the last active admin')
    }
  }

  await this.client.user.delete({
    where: { id: userId }
  })
}
```

**Logique de protection** :

1. ✅ Vérifier qu'on ne tente pas de se supprimer soi-même (auto-suppression)
2. ✅ Vérifier que l'utilisateur existe
3. ✅ Si l'utilisateur est ADMIN, compter les autres admins actifs
4. ❌ Bloquer la suppression si c'est le dernier admin actif
5. ✅ Supprimer l'utilisateur si les conditions sont remplies

#### 2. Route API

**Fichier** : `apps/api/src/routes/auth.ts`

**Endpoint** : `DELETE /api/auth/users/:id`

```typescript
router.delete('/users/:id', [
  requireAuth,
  requireRole('ADMIN'),
  param('id').isString().notEmpty(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const authService = getAuthService()
    await authService.deleteUser(id)

    res.json({
      success: true,
      message: 'User deleted successfully'
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'Cannot delete the last active admin') {
      throw createError(400, message, 'LAST_ADMIN')
    }
    if (message === 'User not found') {
      throw createError(404, message, 'USER_NOT_FOUND')
    }
    throw error
  }
}))
```

**Codes d'erreur** :

- `400 SELF_DELETE` - Impossible de supprimer son propre compte
- `400 LAST_ADMIN` - Impossible de supprimer le dernier admin actif
- `404 USER_NOT_FOUND` - Utilisateur introuvable
- `401` - Non authentifié
- `403` - Pas les permissions (non ADMIN)

### Frontend

#### 1. API Client

**Fichier** : `apps/dashboard/src/services/auth.api.ts`

**Nouvelle méthode** : `deleteUser(token: string, userId: string)`

```typescript
/**
 * Supprime un utilisateur (ADMIN only)
 */
async deleteUser(token: string, userId: string): Promise<void> {
  await axios.delete(`${API_URL}/auth/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
}
```

#### 2. Interface utilisateur

**Fichier** : `apps/dashboard/src/pages/Users.tsx`

**Nouveaux éléments** :

1. **Bouton de suppression** :
   - Icône 🗑️ (DeleteIcon) en rouge
   - Visible dans la colonne "Actions"
   - **Désactivé** pour l'utilisateur connecté (protection anti-auto-suppression)
   - Au clic, ouvre un dialog de confirmation

2. **Dialog de confirmation** :
   - Titre : "Supprimer l'utilisateur"
   - Alert rouge : "⚠️ Attention : Cette action est irréversible !"
   - Affiche le nom, email et rôle de l'utilisateur
   - Alert warning supplémentaire si l'utilisateur est ADMIN
   - Boutons : "Annuler" (gris) / "Supprimer" (rouge)

3. **Gestion des erreurs** :
   - Si dernier admin actif : Message spécifique "Impossible de supprimer le dernier administrateur actif"
   - Autres erreurs : Message générique avec détails

**Code de suppression** :

```typescript
const handleDelete = async () => {
  if (!deleteConfirmUser) return

  try {
    setSubmitting(true)
    await authApi.deleteUser(token!, deleteConfirmUser.id)
    enqueueSnackbar('Utilisateur supprimé avec succès', { variant: 'success' })
    setDeleteConfirmUser(null)
    loadUsers()
  } catch (error: any) {
    console.error('Erreur suppression utilisateur:', error)
    const message = error.response?.data?.message
    if (message === 'Cannot delete the last active admin') {
      enqueueSnackbar(
        'Impossible de supprimer le dernier administrateur actif',
        { variant: 'error' }
      )
    } else {
      enqueueSnackbar(
        message || 'Erreur lors de la suppression de l\'utilisateur',
        { variant: 'error' }
      )
    }
  } finally {
    setSubmitting(false)
  }
}
```

---

## 🛡️ Protections et sécurité

### 1. Protection contre l'auto-suppression

**Règle** : Un utilisateur ne peut **jamais** supprimer son propre compte, quel que soit son rôle.

**Implémentation backend** :
```typescript
if (userId === currentUserId) {
  throw new Error('Cannot delete your own account')
}
```

**Implémentation frontend** :
```typescript
// Le bouton de suppression est désactivé pour l'utilisateur connecté
disabled={user.email === currentUser?.email}
```

**Raisons** :
- Évite les erreurs de manipulation
- Prévient les verrouillages accidentels
- Force une séparation des responsabilités (un autre admin doit supprimer)

### 2. Protection contre la suppression du dernier admin

**Scénario** : Il y a 2 admins (A et B), A est actif, B est désactivé

- ❌ Impossible de supprimer A (dernier admin **actif**)
- ✅ Possible de supprimer B (pas le dernier actif)

**Scénario** : Il y a 2 admins actifs (A et B)

- ✅ Possible de supprimer A (il reste B actif)
- ✅ Possible de supprimer B (il reste A actif)
- ❌ Impossible de supprimer les deux

**Requête SQL de vérification** :

```sql
SELECT COUNT(*) 
FROM users 
WHERE role = 'ADMIN' 
  AND "isActive" = true 
  AND id != '<userId_a_supprimer>'
```

Si le count = 0 → Blocage de la suppression

### 3. Permissions

- **Endpoint protégé** : Middleware `requireAuth` + `requireRole('ADMIN')`
- **Frontend** : Seuls les ADMIN voient le bouton
- **Backend** : Double vérification (middleware + logique métier)

### 4. Confirmation utilisateur

- Dialog de confirmation obligatoire
- Bouton rouge pour signaler le danger
- Alert warning supplémentaire pour les admins
- Texte explicite "Cette action est irréversible"

---

## 🧪 Tests

### Test 0 : Tentative d'auto-suppression

```bash
# 1. Se connecter en tant qu'admin
# 2. Essayer de cliquer sur le bouton 🗑️ de son propre compte
# 3. Vérifier que le bouton est désactivé (grisé)
# 4. Survoler le bouton et vérifier le tooltip
```

**Résultat attendu** : 
- ❌ Bouton désactivé
- ℹ️ Tooltip : "Vous ne pouvez pas supprimer votre propre compte"

### Test 1 : Suppression d'un utilisateur standard

```bash
# 1. Créer un utilisateur VALIDATOR
# 2. Cliquer sur l'icône 🗑️ à côté de l'utilisateur
# 3. Vérifier que le dialog s'ouvre
# 4. Cliquer sur "Supprimer"
# 5. Vérifier la notification de succès
# 6. Vérifier que l'utilisateur disparaît de la liste
```

**Résultat attendu** : ✅ Utilisateur supprimé avec succès

### Test 2 : Tentative de suppression du dernier admin actif

```bash
# Pré-requis : Il ne reste qu'un seul admin actif

# 1. Essayer de supprimer cet admin
# 2. Cliquer sur "Supprimer" dans le dialog
# 3. Vérifier le message d'erreur
```

**Résultat attendu** : 
- ❌ Erreur affichée : "Impossible de supprimer le dernier administrateur actif"
- ✅ L'utilisateur reste dans la liste

### Test 3 : Suppression d'un admin quand il y en a plusieurs

```bash
# Pré-requis : Il y a 2+ admins actifs

# 1. Créer un deuxième admin
# 2. Supprimer le premier admin
# 3. Vérifier que la suppression fonctionne
```

**Résultat attendu** : ✅ Admin supprimé car il reste au moins un autre admin actif

### Test 4 : Suppression d'un admin désactivé

```bash
# Pré-requis : Admin A (actif), Admin B (désactivé)

# 1. Désactiver Admin B
# 2. Supprimer Admin B
# 3. Vérifier que la suppression fonctionne
```

**Résultat attendu** : ✅ Admin B supprimé (pas le dernier **actif**)

### Test 5 : Vérification en base de données

```bash
# Avant suppression
psql "$DATABASE_URL" -c "SELECT id, email, role FROM users WHERE email = 'user@example.com';"

# Supprimer l'utilisateur via l'interface

# Après suppression
psql "$DATABASE_URL" -c "SELECT id, email, role FROM users WHERE email = 'user@example.com';"
```

**Résultat attendu** : 
- Avant : 1 ligne retournée
- Après : 0 ligne (utilisateur supprimé de la DB)

---

## 📊 Cas d'usage

| Situation | Admin A | Admin B | Validator C | Action | Résultat |
|-----------|---------|---------|-------------|--------|----------|
| 0 | Actif (connecté) | - | - | A supprime A | ❌ Auto-suppression |
| 1 | Actif | - | Actif | Supprimer C | ✅ Succès |
| 2 | Actif | Actif | - | Supprimer A | ✅ Succès |
| 3 | Actif | - | - | Supprimer A | ❌ Dernier admin actif |
| 4 | Actif | Désactivé | - | Supprimer A | ❌ Dernier admin actif |
| 5 | Actif | Désactivé | - | Supprimer B | ✅ Succès |
| 6 | Actif | Actif | - | Supprimer B puis A | ✅ puis ❌ |

---

## 🔄 Impact sur les propositions

⚠️ **Attention** : Actuellement, la suppression d'un utilisateur ne gère pas les propositions liées (`reviewedBy`, `appliedBy`).

### Recommandations futures

1. **Option 1 - Soft delete** :
   - Ne pas supprimer réellement l'utilisateur
   - Ajouter un flag `isDeleted`
   - Garder l'historique intact

2. **Option 2 - Cascade** :
   - Supprimer aussi les propositions créées par cet utilisateur
   - Requiert une migration Prisma

3. **Option 3 - Nullify** :
   - Mettre `reviewedBy` et `appliedBy` à `null`
   - Requiert une migration Prisma

**Pour l'instant** : Les IDs restent dans les propositions mais l'utilisateur n'existe plus.

---

## ✅ Checklist d'implémentation

- [x] Backend - Méthode `deleteUser()` dans AuthService
- [x] Backend - Endpoint `DELETE /api/auth/users/:id`
- [x] Backend - Protection dernier admin actif
- [x] Frontend - Méthode `deleteUser()` dans auth.api.ts
- [x] Frontend - Bouton de suppression avec icône
- [x] Frontend - Dialog de confirmation
- [x] Frontend - Gestion des erreurs
- [x] Frontend - Alert warning pour les admins
- [ ] Tests E2E automatisés
- [ ] Gestion des propositions orphelines (optionnel)

---

## 📚 Documentation connexe

- `docs/AUTH-IMPLEMENTATION-GUIDE.md` - Guide complet d'authentification
- `docs/AUTH-STEPS-5-6-COMPLETED.md` - Page de gestion des utilisateurs
- `docs/AUTH-SUMMARY.md` - Résumé du système d'auth
