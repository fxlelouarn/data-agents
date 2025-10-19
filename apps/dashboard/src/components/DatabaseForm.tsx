import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Grid,
  Typography,
  Alert,
  Divider
} from '@mui/material'
import { DatabaseConfig } from '@/contexts/DatabaseContext'

interface DatabaseFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (config: Omit<DatabaseConfig, 'id'>) => void
  editingDatabase?: DatabaseConfig | null
  validateDatabase: (config: Partial<DatabaseConfig>) => string | null
}

const DatabaseForm: React.FC<DatabaseFormProps> = ({ 
  open, 
  onClose, 
  onSubmit, 
  editingDatabase,
  validateDatabase 
}) => {
  const [formData, setFormData] = useState<Omit<DatabaseConfig, 'id'>>({
    name: '',
    type: 'POSTGRESQL',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    sslMode: 'prefer',
    isDefault: false,
    isActive: true,
    description: '',
    connectionUrl: ''
  })

  const [useConnectionString, setUseConnectionString] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Effet pour synchroniser le formulaire avec les données d'édition
  useEffect(() => {
    if (editingDatabase) {
      setFormData({
        name: editingDatabase.name || '',
        type: editingDatabase.type || 'POSTGRESQL',
        host: editingDatabase.host || '',
        port: editingDatabase.port || 5432,
        database: editingDatabase.database || '',
        username: editingDatabase.username || '',
        password: editingDatabase.password || '',
        sslMode: editingDatabase.sslMode || 'prefer',
        isDefault: editingDatabase.isDefault || false,
        isActive: editingDatabase.isActive ?? true,
        description: editingDatabase.description || '',
        connectionUrl: editingDatabase.connectionUrl || ''
      })
      setUseConnectionString(!!editingDatabase.connectionUrl)
    } else {
      // Réinitialiser pour un nouveau formulaire
      setFormData({
        name: '',
        type: 'POSTGRESQL',
        host: '',
        port: 5432,
        database: '',
        username: '',
        password: '',
        sslMode: 'prefer',
        isDefault: false,
        isActive: true,
        description: '',
        connectionUrl: ''
      })
      setUseConnectionString(false)
    }
    setError(null)
  }, [editingDatabase])

  const handleChange = (field: keyof typeof formData) => (event: any) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = () => {
    const validation = validateDatabase(formData)
    if (validation) {
      setError(validation)
      return
    }

    // Si on utilise une connection URL, vider les champs individuels
    const finalData = useConnectionString 
      ? { ...formData, host: '', port: 5432, database: '', username: '', password: '' }
      : { ...formData, connectionUrl: '' }

    onSubmit(finalData)
    handleClose()
  }

  const handleClose = () => {
    setError(null)
    onClose()
  }

  const handleTypeChange = (event: any) => {
    const type = event.target.value
    setFormData(prev => ({
      ...prev,
      type,
      port: type === 'MYSQL' ? 3306 : 5432
    }))
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {editingDatabase ? 'Modifier la base de données' : 'Ajouter une base de données'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Informations générales */}
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mb: 2 }}>Informations générales</Typography>
          </Grid>
          
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              label="Nom"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="Ex: Miles Republic Production"
              required
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={formData.type}
                label="Type"
                onChange={handleTypeChange}
              >
                <MenuItem value="POSTGRESQL">PostgreSQL</MenuItem>
                <MenuItem value="MYSQL">MySQL</MenuItem>
                <MenuItem value="MILES_REPUBLIC">Medusa</MenuItem>
                <MenuItem value="MONGODB">MongoDB</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description (optionnelle)"
              value={formData.description}
              onChange={handleChange('description')}
              placeholder="Description de cette base de données"
              multiline
              rows={2}
            />
          </Grid>

          <Divider sx={{ width: '100%', my: 2 }} />

          {/* Configuration de connexion */}
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={useConnectionString}
                  onChange={(e) => setUseConnectionString(e.target.checked)}
                />
              }
              label="Utiliser une URL de connexion complète"
            />
          </Grid>

          {useConnectionString ? (
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="URL de connexion"
                value={formData.connectionUrl}
                onChange={handleChange('connectionUrl')}
                placeholder="postgresql://username:password@host:port/database"
                required={useConnectionString}
                helperText="Format: protocol://username:password@host:port/database"
              />
            </Grid>
          ) : (
            <>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Hôte"
                  value={formData.host}
                  onChange={handleChange('host')}
                  placeholder="localhost"
                  required
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Port"
                  value={formData.port}
                  onChange={handleChange('port')}
                  required
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nom de la base de données"
                  value={formData.database}
                  onChange={handleChange('database')}
                  placeholder="medusa_prod"
                  required
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Nom d'utilisateur"
                  value={formData.username}
                  onChange={handleChange('username')}
                  placeholder="postgres"
                  required
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="password"
                  label="Mot de passe"
                  value={formData.password}
                  onChange={handleChange('password')}
                  placeholder="Mot de passe"
                />
              </Grid>
            </>
          )}

          <Divider sx={{ width: '100%', my: 2 }} />

          {/* Options */}
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mb: 1 }}>Options</Typography>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.sslMode === 'require'}
                  onChange={(e) => {
                    const value = e.target.checked ? 'require' : 'prefer'
                    setFormData(prev => ({ ...prev, sslMode: value }))
                  }}
                />
              }
              label="Connexion SSL"
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isDefault}
                  onChange={handleChange('isDefault')}
                />
              }
              label="Base par défaut"
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isActive}
                  onChange={handleChange('isActive')}
                />
              }
              label="Active"
            />
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose}>
          Annuler
        </Button>
        <Button variant="contained" onClick={handleSubmit}>
          {editingDatabase ? 'Modifier' : 'Ajouter'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DatabaseForm