import React, { useState } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Button,
  IconButton
} from '@mui/material'
import {
  Language as WebsiteIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon
} from '@mui/icons-material'

interface EventLinksEditorProps {
  websiteUrl?: string | { new?: string; proposed?: string; current?: string }
  facebookUrl?: string | { new?: string; proposed?: string; current?: string }
  instagramUrl?: string | { new?: string; proposed?: string; current?: string }
  onSave?: (links: { websiteUrl?: string; facebookUrl?: string; instagramUrl?: string }) => void
  editable?: boolean
}

const EventLinksEditor: React.FC<EventLinksEditorProps> = ({
  websiteUrl,
  facebookUrl,
  instagramUrl,
  onSave,
  editable = true
}) => {
  const [isEditing, setIsEditing] = useState(false)
  
  // Extraire les valeurs actuelles
  const extractValue = (value?: string | { new?: string; proposed?: string; current?: string }): string => {
    if (!value) return ''
    if (typeof value === 'string') return value
    return value.new || value.proposed || value.current || ''
  }
  
  const [editedWebsiteUrl, setEditedWebsiteUrl] = useState(extractValue(websiteUrl))
  const [editedFacebookUrl, setEditedFacebookUrl] = useState(extractValue(facebookUrl))
  const [editedInstagramUrl, setEditedInstagramUrl] = useState(extractValue(instagramUrl))
  
  const handleEdit = () => {
    setIsEditing(true)
  }
  
  const handleCancel = () => {
    setEditedWebsiteUrl(extractValue(websiteUrl))
    setEditedFacebookUrl(extractValue(facebookUrl))
    setEditedInstagramUrl(extractValue(instagramUrl))
    setIsEditing(false)
  }
  
  const handleSave = () => {
    if (onSave) {
      onSave({
        websiteUrl: editedWebsiteUrl || undefined,
        facebookUrl: editedFacebookUrl || undefined,
        instagramUrl: editedInstagramUrl || undefined
      })
    }
    setIsEditing(false)
  }
  
  const hasAnyLink = websiteUrl || facebookUrl || instagramUrl || isEditing
  
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WebsiteIcon color="primary" />
            Liens de l'événement
          </Typography>
          {editable && !isEditing && (
            <IconButton size="small" onClick={handleEdit} color="primary">
              <EditIcon />
            </IconButton>
          )}
        </Box>
        
        {!hasAnyLink && !isEditing ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Aucun lien disponible
          </Typography>
        ) : (
          <>
            {isEditing ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Site web"
                  value={editedWebsiteUrl}
                  onChange={(e) => setEditedWebsiteUrl(e.target.value)}
                  placeholder="https://..."
                  InputProps={{
                    startAdornment: <WebsiteIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  }}
                />
                
                <TextField
                  fullWidth
                  size="small"
                  label="Facebook"
                  value={editedFacebookUrl}
                  onChange={(e) => setEditedFacebookUrl(e.target.value)}
                  placeholder="https://facebook.com/..."
                  InputProps={{
                    startAdornment: <FacebookIcon sx={{ mr: 1, color: '#1877f2' }} />
                  }}
                />
                
                <TextField
                  fullWidth
                  size="small"
                  label="Instagram"
                  value={editedInstagramUrl}
                  onChange={(e) => setEditedInstagramUrl(e.target.value)}
                  placeholder="https://instagram.com/..."
                  InputProps={{
                    startAdornment: <InstagramIcon sx={{ mr: 1, color: '#E4405F' }} />
                  }}
                />
                
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    startIcon={<CancelIcon />}
                    onClick={handleCancel}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                  >
                    Enregistrer
                  </Button>
                </Box>
              </Box>
            ) : (
              <>
                {websiteUrl && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <WebsiteIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Site web</Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          wordBreak: 'break-all',
                          '& a': { color: 'primary.main', textDecoration: 'none' }
                        }}
                      >
                        <a 
                          href={extractValue(websiteUrl)}
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          {extractValue(websiteUrl)}
                        </a>
                      </Typography>
                    </Box>
                  </Box>
                )}
                
                {facebookUrl && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <FacebookIcon sx={{ fontSize: '1rem', color: '#1877f2' }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Facebook</Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          wordBreak: 'break-all',
                          '& a': { color: 'primary.main', textDecoration: 'none' }
                        }}
                      >
                        <a 
                          href={extractValue(facebookUrl)}
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          {extractValue(facebookUrl)}
                        </a>
                      </Typography>
                    </Box>
                  </Box>
                )}
                
                {instagramUrl && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <InstagramIcon sx={{ fontSize: '1rem', color: '#E4405F' }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Instagram</Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          wordBreak: 'break-all',
                          '& a': { color: 'primary.main', textDecoration: 'none' }
                        }}
                      >
                        <a 
                          href={extractValue(instagramUrl)}
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          {extractValue(instagramUrl)}
                        </a>
                      </Typography>
                    </Box>
                  </Box>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default EventLinksEditor
