import React from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Link,
  Paper
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  Description as DocumentIcon,
  AccessTime as TimeIcon
} from '@mui/icons-material'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface JustificationSource {
  type: string
  url?: string
  title?: string
  extractedText?: string
  screenshot?: string
  timestamp?: string
  sender?: string
}

interface JustificationSectionProps {
  justification: {
    sources?: JustificationSource[]
  }
}

const JustificationSection: React.FC<JustificationSectionProps> = ({ justification }) => {
  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return format(date, 'dd/MM/yyyy HH:mm', { locale: fr })
    } catch (error) {
      return timestamp
    }
  }

  const getSourceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'webpage':
      case 'website':
        return <LinkIcon fontSize="small" />
      case 'social':
      case 'facebook':
      case 'twitter':
      case 'instagram':
        return <LinkIcon fontSize="small" color="primary" />
      case 'email':
        return <DocumentIcon fontSize="small" />
      case 'image':
      case 'screenshot':
        return <ImageIcon fontSize="small" />
      default:
        return <DocumentIcon fontSize="small" />
    }
  }

  const getSourceTypeLabel = (type: string) => {
    switch (type.toLowerCase()) {
      case 'webpage': return 'Page web'
      case 'social': return 'Réseau social'
      case 'email': return 'Email'
      case 'image': return 'Image'
      case 'screenshot': return 'Capture d\'écran'
      default: return type
    }
  }

  if (!justification.sources || justification.sources.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Sources et justifications
          </Typography>
          <Typography color="textSecondary">
            Aucune source disponible
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Sources et justifications ({justification.sources.length})
        </Typography>
        
        {justification.sources.map((source, index) => (
          <Accordion key={index} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                {getSourceIcon(source.type)}
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle2">
                    {source.title || `Source ${index + 1}`}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                    <Chip 
                      size="small" 
                      label={getSourceTypeLabel(source.type)}
                      variant="outlined"
                    />
                    {source.timestamp && (
                      <Chip 
                        size="small" 
                        icon={<TimeIcon />}
                        label={formatTimestamp(source.timestamp)}
                        variant="outlined"
                        color="info"
                      />
                    )}
                  </Box>
                </Box>
              </Box>
            </AccordionSummary>
            
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* URL cliquable */}
                {source.url && (
                  <Box>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                      Lien source :
                    </Typography>
                    <Link 
                      href={source.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      sx={{ wordBreak: 'break-all' }}
                    >
                      {source.url}
                    </Link>
                  </Box>
                )}

                {/* Sender pour les emails */}
                {source.sender && (
                  <Box>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                      Expéditeur :
                    </Typography>
                    <Typography variant="body2">
                      {source.sender}
                    </Typography>
                  </Box>
                )}

                {/* Texte extrait */}
                {source.extractedText && (
                  <Box>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                      Texte extrait :
                    </Typography>
                    <Paper sx={{ p: 2, backgroundColor: 'grey.50', borderLeft: 3, borderColor: 'primary.main' }}>
                      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                        "{source.extractedText}"
                      </Typography>
                    </Paper>
                  </Box>
                )}

                {/* Screenshot ou image */}
                {source.screenshot && (
                  <Box>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
                      Capture d'écran :
                    </Typography>
                    <Paper sx={{ p: 1, textAlign: 'center', backgroundColor: 'grey.50' }}>
                      {source.screenshot.startsWith('data:') ? (
                        <img 
                          src={source.screenshot} 
                          alt="Screenshot" 
                          style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
                        />
                      ) : (
                        <Typography color="textSecondary">
                          Image disponible ({source.screenshot.slice(0, 50)}...)
                        </Typography>
                      )}
                    </Paper>
                  </Box>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </CardContent>
    </Card>
  )
}

export default JustificationSection