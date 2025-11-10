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
  InputLabel,
  Typography,
  Alert,
  CircularProgress
} from '@mui/material'
import { 
  Add as AddIcon, 
  Edit as EditIcon, 
  LockReset as ResetIcon,
  Delete as DeleteIcon 
} from '@mui/icons-material'
import { useSnackbar } from 'notistack'

export default function Users() {
  const { token, user: currentUser } = useAuth()
  const { enqueueSnackbar } = useSnackbar()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      setLoading(true)
      const data = await authApi.listUsers(token!)
      setUsers(data)
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error)
      enqueueSnackbar('Erreur lors du chargement des utilisateurs', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName) {
      enqueueSnackbar('Veuillez remplir tous les champs obligatoires', { variant: 'warning' })
      return
    }

    try {
      setSubmitting(true)
      await authApi.createUser(token!, formData)
      enqueueSnackbar('Utilisateur créé avec succès', { variant: 'success' })
      setDialogOpen(false)
      loadUsers()
    } catch (error: any) {
      console.error('Erreur création utilisateur:', error)
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors de la création de l\'utilisateur',
        { variant: 'error' }
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingUser) return

    try {
      setSubmitting(true)
      await authApi.updateUser(token!, editingUser.id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        isActive: editingUser.isActive
      })
      enqueueSnackbar('Utilisateur mis à jour avec succès', { variant: 'success' })
      setDialogOpen(false)
      setEditingUser(null)
      loadUsers()
    } catch (error: any) {
      console.error('Erreur mise à jour utilisateur:', error)
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors de la mise à jour de l\'utilisateur',
        { variant: 'error' }
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetPasswordUser || !newPassword) {
      enqueueSnackbar('Veuillez saisir un nouveau mot de passe', { variant: 'warning' })
      return
    }

    if (newPassword.length < 6) {
      enqueueSnackbar('Le mot de passe doit contenir au moins 6 caractères', { variant: 'warning' })
      return
    }

    try {
      setSubmitting(true)
      await authApi.resetPassword(token!, resetPasswordUser.id, newPassword)
      enqueueSnackbar('Mot de passe réinitialisé avec succès', { variant: 'success' })
      setResetPasswordDialogOpen(false)
      setResetPasswordUser(null)
      setNewPassword('')
    } catch (error: any) {
      console.error('Erreur réinitialisation mot de passe:', error)
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors de la réinitialisation du mot de passe',
        { variant: 'error' }
      )
    } finally {
      setSubmitting(false)
    }
  }

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
      if (message === 'Cannot delete your own account') {
        enqueueSnackbar(
          'Vous ne pouvez pas supprimer votre propre compte',
          { variant: 'error' }
        )
      } else if (message === 'Cannot delete the last active admin') {
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

  const toggleUserStatus = async (user: User) => {
    try {
      await authApi.updateUser(token!, user.id, {
        isActive: !user.isActive
      })
      enqueueSnackbar(
        `Utilisateur ${!user.isActive ? 'activé' : 'désactivé'} avec succès`,
        { variant: 'success' }
      )
      loadUsers()
    } catch (error: any) {
      console.error('Erreur changement de statut:', error)
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors du changement de statut',
        { variant: 'error' }
      )
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    )
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

      <Alert severity="info" sx={{ mb: 3 }}>
        Gérez les utilisateurs de la plateforme Data Agents. Les administrateurs ont accès complet,
        les validateurs peuvent approuver/rejeter les propositions, et les exécuteurs peuvent appliquer les mises à jour.
      </Alert>

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
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary">Aucun utilisateur trouvé</Typography>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Typography variant="body2">
                      {user.firstName} {user.lastName}
                    </Typography>
                  </TableCell>
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
                      onClick={() => toggleUserStatus(user)}
                      sx={{ cursor: 'pointer' }}
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
                      title="Modifier l'utilisateur"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setResetPasswordUser(user)
                        setNewPassword('')
                        setResetPasswordDialogOpen(true)
                      }}
                      title="Réinitialiser le mot de passe"
                    >
                      <ResetIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => setDeleteConfirmUser(user)}
                      title={user.email === currentUser?.email ? "Vous ne pouvez pas supprimer votre propre compte" : "Supprimer l'utilisateur"}
                      color="error"
                      disabled={user.email === currentUser?.email}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
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
            required
          />
          <TextField
            label="Nom"
            fullWidth
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            label="Email"
            type="email"
            fullWidth
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={!!editingUser}
            sx={{ mb: 2 }}
            required
          />
          {!editingUser && (
            <TextField
              label="Mot de passe"
              type="password"
              fullWidth
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              sx={{ mb: 2 }}
              required
              helperText="Minimum 6 caractères"
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
          <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={editingUser ? handleUpdate : handleCreate}
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={24} /> : (editingUser ? 'Mettre à jour' : 'Créer')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de réinitialisation du mot de passe */}
      <Dialog
        open={resetPasswordDialogOpen}
        onClose={() => setResetPasswordDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
            Vous allez réinitialiser le mot de passe de{' '}
            <strong>
              {resetPasswordUser?.firstName} {resetPasswordUser?.lastName}
            </strong>
          </Alert>
          <TextField
            label="Nouveau mot de passe"
            type="password"
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="Minimum 6 caractères"
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetPasswordDialogOpen(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleResetPassword}
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={24} /> : 'Réinitialiser'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de confirmation de suppression */}
      <Dialog
        open={!!deleteConfirmUser}
        onClose={() => setDeleteConfirmUser(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Supprimer l'utilisateur</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
            ⚠️ <strong>Attention :</strong> Cette action est irréversible !
          </Alert>
          <Typography>
            Vous êtes sur le point de supprimer l'utilisateur :
          </Typography>
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
            {deleteConfirmUser?.firstName} {deleteConfirmUser?.lastName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Email : {deleteConfirmUser?.email}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Rôle : {getRoleLabel(deleteConfirmUser?.role || '')}
          </Typography>
          {deleteConfirmUser?.role === 'ADMIN' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Cet utilisateur est un administrateur. Assurez-vous qu'il reste au moins un autre administrateur actif.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmUser(null)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={submitting}
            startIcon={<DeleteIcon />}
          >
            {submitting ? <CircularProgress size={24} /> : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
