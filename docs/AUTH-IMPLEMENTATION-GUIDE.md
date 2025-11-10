# Guide d'implémentation du système d'authentification

## État actuel (2025-11-10)

### ✅ Backend completé

- ✅ Modèle `User` ajouté au schéma Prisma
- ✅ Migration exécutée et seed créé (admin@data-agents.local / admin123)
- ✅ `AuthService` implémenté avec lazy loading du client Prisma
- ✅ Routes API auth créées (`/api/auth/*`)
- ✅ Middleware auth (`requireAuth`, `requireRole`, `optionalAuth`)
- ✅ Endpoints testés et fonctionnels

### ✅ Frontend - Composants de base créés

- ✅ `src/services/auth.api.ts` - Service API d'authentification
- ✅ `src/context/AuthContext.tsx` - Contexte React pour l'auth
- ✅ `src/pages/Login.tsx` - Page de connexion
- ✅ `src/components/ProtectedRoute.tsx` - Composant de protection des routes

### ⏳ Frontend - Tâches restantes

## Étape 1 : Intégrer AuthProvider dans App.tsx

**Fichier** : `apps/dashboard/src/App.tsx`

```tsx
import { AuthProvider } from './context/AuthContext'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Route publique */}
            <Route path="/login" element={<Login />} />
            
            {/* Routes protégées */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              {/* Routes existantes */}
              <Route path="/" element={<Home />} />
              
              {/* Propositions - VALIDATOR, EXECUTOR, ADMIN */}
              <Route
                path="/proposals"
                element={
                  <ProtectedRoute requiredRoles={['VALIDATOR', 'EXECUTOR', 'ADMIN']}>
                    <Proposals />
                  </ProtectedRoute>
                }
              />
              
              {/* Agents - ADMIN only */}
              <Route
                path="/agents"
                element={
                  <ProtectedRoute requiredRoles={['ADMIN']}>
                    <Agents />
                  </ProtectedRoute>
                }
              />
              
              {/* Updates - EXECUTOR, ADMIN */}
              <Route
                path="/updates"
                element={
                  <ProtectedRoute requiredRoles={['EXECUTOR', 'ADMIN']}>
                    <Updates />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}
```

## Étape 2 : Ajouter le bouton de déconnexion dans le Layout

**Fichier** : `apps/dashboard/src/components/Layout.tsx` (ou équivalent)

```tsx
import { useAuth } from '../context/AuthContext'
import { Button, Avatar, Menu, MenuItem, Typography } from '@mui/material'
import { Logout as LogoutIcon, Person as PersonIcon } from '@mui/icons-material'

function DashboardLayout() {
  const { user, logout } = useAuth()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = () => {
    handleMenuClose()
    logout()
  }

  return (
    <Box>
      {/* Navbar avec user menu */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Data Agents
          </Typography>
          
          <Button
            onClick={handleMenuOpen}
            startIcon={<Avatar sx={{ width: 32, height: 32 }}><PersonIcon /></Avatar>}
            color="inherit"
          >
            {user?.firstName} {user?.lastName}
          </Button>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                {user?.email}
              </Typography>
            </MenuItem>
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                Rôle: {user?.role}
              </Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1 }} fontSize="small" />
              Déconnexion
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      
      {/* Contenu du dashboard */}
      <Outlet />
    </Box>
  )
}
```

## Étape 3 : Masquer/Afficher les onglets selon le rôle

**Fichier** : `apps/dashboard/src/components/Navigation.tsx` (ou équivalent)

```tsx
import { useAuth } from '../context/AuthContext'
import { List, ListItem, ListItemIcon, ListItemText } from '@mui/material'
import {
  Dashboard as DashboardIcon,
  Assignment as ProposalsIcon,
  SmartToy as AgentsIcon,
  Update as UpdatesIcon,
  People as PeopleIcon
} from '@mui/icons-material'

function Navigation() {
  const { hasRole } = useAuth()

  return (
    <List>
      {/* Accueil - Tous */}
      <ListItem button component={Link} to="/">
        <ListItemIcon><DashboardIcon /></ListItemIcon>
        <ListItemText primary="Accueil" />
      </ListItem>
      
      {/* Propositions - VALIDATOR, EXECUTOR, ADMIN */}
      {hasRole('VALIDATOR', 'EXECUTOR', 'ADMIN') && (
        <ListItem button component={Link} to="/proposals">
          <ListItemIcon><ProposalsIcon /></ListItemIcon>
          <ListItemText primary="Propositions" />
        </ListItem>
      )}
      
      {/* Mises à jour - EXECUTOR, ADMIN */}
      {hasRole('EXECUTOR', 'ADMIN') && (
        <ListItem button component={Link} to="/updates">
          <ListItemIcon><UpdatesIcon /></ListItemIcon>
          <ListItemText primary="Mises à jour" />
        </ListItem>
      )}
      
      {/* Agents - ADMIN only */}
      {hasRole('ADMIN') && (
        <ListItem button component={Link} to="/agents">
          <ListItemIcon><AgentsIcon /></ListItemIcon>
          <ListItemText primary="Agents" />
        </ListItem>
      )}
      
      {/* Utilisateurs - ADMIN only */}
      {hasRole('ADMIN') && (
        <ListItem button component={Link} to="/users">
          <ListItemIcon><PeopleIcon /></ListItemIcon>
          <ListItemText primary="Utilisateurs" />
        </ListItem>
      )}
    </List>
  )
}
```

## Étape 4 : Ajouter le token aux requêtes API existantes

**Fichier** : `apps/dashboard/src/services/api.ts`

Modifier l'instance axios pour inclure automatiquement le token :

```tsx
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001'

const apiClient = axios.create({
  baseURL: API_URL
})

// Interceptor pour ajouter le token automatiquement
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('data-agents-token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Interceptor pour gérer les erreurs 401 (token expiré)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expiré ou invalide, rediriger vers login
      localStorage.removeItem('data-agents-token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
```

Puis remplacer tous les `axios.get/post/put/delete` par `apiClient.get/post/put/delete`.

## Étape 5 : Créer la page de gestion des utilisateurs (ADMIN)

**Fichier** : `apps/dashboard/src/pages/Users.tsx`

```tsx
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { authApi, User } from '../services/auth.api'
import {
  Box,
  Button,
  Card,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material'
import { Add as AddIcon, Edit as EditIcon, LockReset as ResetIcon } from '@mui/icons-material'

export default function Users() {
  const { token } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  // État du formulaire
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'VALIDATOR' as 'ADMIN' | 'VALIDATOR' | 'EXECUTOR'
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const data = await authApi.listUsers(token!)
      setUsers(data)
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await authApi.createUser(token!, formData)
      setDialogOpen(false)
      loadUsers()
    } catch (error) {
      console.error('Erreur création utilisateur:', error)
    }
  }

  const handleUpdate = async () => {
    if (!editingUser) return
    try {
      await authApi.updateUser(token!, editingUser.id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role
      })
      setDialogOpen(false)
      setEditingUser(null)
      loadUsers()
    } catch (error) {
      console.error('Erreur mise à jour utilisateur:', error)
    }
  }

  const getRoleLabel = (role: string) => {
    const labels = {
      ADMIN: 'Administrateur',
      VALIDATOR: 'Validateur',
      EXECUTOR: 'Exécuteur'
    }
    return labels[role as keyof typeof labels] || role
  }

  const getRoleColor = (role: string) => {
    const colors = {
      ADMIN: 'error',
      VALIDATOR: 'primary',
      EXECUTOR: 'success'
    }
    return colors[role as keyof typeof colors] || 'default'
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Utilisateurs</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setEditingUser(null)
            setFormData({
              email: '',
              password: '',
              firstName: '',
              lastName: '',
              role: 'VALIDATOR'
            })
            setDialogOpen(true)
          }}
        >
          Nouvel utilisateur
        </Button>
      </Box>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nom</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Rôle</TableCell>
              <TableCell>Statut</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.firstName} {user.lastName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Chip
                    label={getRoleLabel(user.role)}
                    color={getRoleColor(user.role) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={user.isActive ? 'Actif' : 'Désactivé'}
                    color={user.isActive ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setEditingUser(user)
                      setFormData({
                        email: user.email,
                        password: '',
                        firstName: user.firstName,
                        lastName: user.lastName,
                        role: user.role
                      })
                      setDialogOpen(true)
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small">
                    <ResetIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog de création/édition */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingUser ? 'Modifier utilisateur' : 'Nouvel utilisateur'}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Prénom"
            fullWidth
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
          />
          <TextField
            label="Nom"
            fullWidth
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Email"
            type="email"
            fullWidth
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={!!editingUser}
            sx={{ mb: 2 }}
          />
          {!editingUser && (
            <TextField
              label="Mot de passe"
              type="password"
              fullWidth
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              sx={{ mb: 2 }}
            />
          )}
          <FormControl fullWidth>
            <InputLabel>Rôle</InputLabel>
            <Select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
            >
              <MenuItem value="ADMIN">Administrateur</MenuItem>
              <MenuItem value="VALIDATOR">Validateur</MenuItem>
              <MenuItem value="EXECUTOR">Exécuteur</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={editingUser ? handleUpdate : handleCreate}
          >
            {editingUser ? 'Mettre à jour' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
```

## Étape 6 : Mettre à jour les propositions pour enregistrer reviewedBy/appliedBy

**Fichier** : `apps/api/src/routes/proposals.ts`

Modifier les endpoints d'approbation/rejet pour enregistrer l'utilisateur :

```typescript
import { requireAuth } from '../middleware/auth.middleware'

// Approuver une proposition
router.patch('/:id/approve', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.userId // Utilisateur connecté

  await db.updateProposal(id, {
    status: 'APPROVED',
    reviewedAt: new Date(),
    reviewedBy: userId  // ✅ Enregistrer qui a validé
  })

  // ... reste du code
}))

// Appliquer une proposition
router.post('/:id/apply', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.userId

  // Enregistrer appliedBy dans ProposalApplication
  await db.prisma.proposalApplication.create({
    data: {
      proposalId: id,
      status: 'PENDING',
      appliedBy: userId,  // ✅ Enregistrer qui a appliqué
      scheduledAt: new Date()
    }
  })

  // ... reste du code
}))
```

## Étape 7 : Tests

### Test de connexion

```bash
# 1. Ouvrir http://localhost:4000/login
# 2. Se connecter avec admin@data-agents.local / admin123
# 3. Vérifier la redirection vers le dashboard
# 4. Vérifier que le nom de l'utilisateur apparaît en haut à droite
```

### Test des rôles

```bash
# 1. Créer un utilisateur VALIDATOR
# 2. Se déconnecter et se reconnecter avec le VALIDATOR
# 3. Vérifier que l'onglet "Agents" n'apparaît pas
# 4. Vérifier que l'onglet "Propositions" apparaît
# 5. Vérifier l'accès refusé si tentative d'accès direct à /agents
```

### Test de déconnexion

```bash
# 1. Cliquer sur le bouton utilisateur en haut à droite
# 2. Cliquer sur "Déconnexion"
# 3. Vérifier la redirection vers /login
# 4. Vérifier que le token est supprimé (localStorage vide)
```

## Permissions par rôle

| Fonctionnalité | ADMIN | VALIDATOR | EXECUTOR |
|----------------|-------|-----------|----------|
| **Voir** propositions | ✅ | ✅ | ✅ |
| **Valider/Rejeter** propositions | ✅ | ✅ | ❌ |
| **Appliquer** propositions | ✅ | ❌ | ✅ |
| **Gérer** agents | ✅ | ❌ | ❌ |
| **Gérer** utilisateurs | ✅ | ❌ | ❌ |
| **Voir** mises à jour | ✅ | ❌ | ✅ |

## Fichiers modifiés/créés

### Backend ✅ (Complété)

- ✅ `packages/database/prisma/schema.prisma` - Ajout modèle User
- ✅ `packages/database/prisma/seed.ts` - Seed admin par défaut
- ✅ `apps/api/src/services/auth.service.ts` - Service d'authentification
- ✅ `apps/api/src/routes/auth.ts` - Routes API auth
- ✅ `apps/api/src/middleware/auth.middleware.ts` - Middlewares auth
- ✅ `apps/api/src/index.ts` - Enregistrement routes auth

### Frontend 🔄 (En cours)

- ✅ `apps/dashboard/src/services/auth.api.ts` - API client
- ✅ `apps/dashboard/src/context/AuthContext.tsx` - Contexte auth
- ✅ `apps/dashboard/src/pages/Login.tsx` - Page de connexion
- ✅ `apps/dashboard/src/components/ProtectedRoute.tsx` - Protection routes
- ⏳ `apps/dashboard/src/App.tsx` - Intégration AuthProvider + routes
- ⏳ `apps/dashboard/src/components/Layout.tsx` - Ajout menu utilisateur
- ⏳ `apps/dashboard/src/components/Navigation.tsx` - Masquage onglets
- ⏳ `apps/dashboard/src/services/api.ts` - Ajout interceptor token
- ⏳ `apps/dashboard/src/pages/Users.tsx` - Gestion utilisateurs (ADMIN)

## Variables d'environnement

**Backend** (`apps/api/.env`) :

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
```

**Frontend** (`apps/dashboard/.env`) :

```env
VITE_API_URL=http://localhost:4001
```

## Troubleshooting

### Problème : "Cannot read properties of undefined (reading 'findUnique')"

**Cause** : Le client Prisma n'a pas été régénéré après l'ajout du modèle User.

**Solution** :
```bash
npm run db:generate
npm run build:database --force
# Redémarrer le serveur API (Ctrl+C puis npm run dev)
```

### Problème : Token expiré

**Solution** : Se déconnecter et se reconnecter. Le token JWT expire après 7 jours par défaut.

### Problème : CORS lors des requêtes auth

**Vérifier** : Le CORS est configuré dans `apps/api/src/index.ts` pour accepter `http://localhost:4000`.

## Prochaines améliorations possibles

- [ ] Refresh token pour renouveler automatiquement le token
- [ ] Gestion des permissions granulaires (ex: certains agents visibles uniquement par certains users)
- [ ] Historique des actions utilisateur (audit log)
- [ ] Double authentification (2FA)
- [ ] Réinitialisation de mot de passe par email
- [ ] Invitation d'utilisateurs par email
