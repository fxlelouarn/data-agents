import React, { useState } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Link,
  Paper,
  Divider
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  Description as DocumentIcon,
  Code as CodeIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon
} from '@mui/icons-material'

interface JustificationItem {
  type: 'url' | 'image' | 'html' | 'text'
  content: string
  metadata?: {
    dateDetails?: {
      date?: string
      confidence?: number
      source?: string
      snippet?: string
      sources?: Array<{
        source: string
        snippet: string
      }>
    }
    extractedDate?: string
    raceName?: string
    agentName?: string
    sourcesCount?: number
    [key: string]: any
  }
}

interface ProposalJustificationsCardProps {
  justifications: JustificationItem[]
  confidence?: number
}

const ProposalJustificationsCard: React.FC<ProposalJustificationsCardProps> = ({ 
  justifications,
  confidence 
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | false>(0)

  const handleAccordionChange = (index: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedIndex(isExpanded ? index : false)
  }

  const getJustificationIcon = (type: string) => {
    switch (type) {
      case 'url':
        return <LinkIcon color="primary" />
      case 'image':
        return <ImageIcon color="secondary" />
      case 'html':
        return <CodeIcon color="info" />
      case 'text':
        return <DocumentIcon color="action" />
      default:
        return <InfoIcon />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'url':
        return 'Lien web'
      case 'image':
        return 'Image'
      case 'html':
        return 'HTML'
      case 'text':
        return 'Texte'
      default:
        return type
    }
  }

  const formatContent = (content: string, type: string) => {
    // Si c'est une URL, la rendre cliquable
    if (type === 'url' || (type === 'text' && content.match(/^https?:\/\//))) {
      return (
        <Link 
          href={content} 
          target="_blank" 
          rel="noopener noreferrer"
          sx={{ 
            wordBreak: 'break-all',
            fontSize: '0.875rem'
          }}
        >
          {content}
        </Link>
      )
    }

    // Si c'est une image base64 ou URL d'image
    if (type === 'image') {
      if (content.startsWith('data:') || content.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        return (
          <Box 
            component="img"
            src={content}
            alt="Justification"
            sx={{
              maxWidth: '100%',
              maxHeight: '400px',
              objectFit: 'contain',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider'
            }}
          />
        )
      }
      return (
        <Typography variant="body2" color="text.secondary">
          Image: {content.slice(0, 100)}...
        </Typography>
      )
    }

    // Si c'est du HTML
    if (type === 'html') {
      return (
        <Paper 
          sx={{ 
            p: 2, 
            bgcolor: 'grey.50',
            maxHeight: 300,
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {content}
        </Paper>
      )
    }

    // Texte par défaut
    return (
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {content}
      </Typography>
    )
  }

  const renderDateDetails = (dateDetails: any) => {
    if (!dateDetails) return null

    return (
      <Box sx={{ mt: 2, p: 2, bgcolor: 'info.lighter', borderRadius: 1, border: '1px solid', borderColor: 'info.light' }}>
        <Typography variant="subtitle2" color="info.dark" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CheckCircleIcon fontSize="small" />
          Détails de la date extraite
        </Typography>
        
        {dateDetails.date && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">Date:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {dateDetails.date}
            </Typography>
          </Box>
        )}
        
        {dateDetails.confidence !== undefined && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">Confiance:</Typography>
            <Chip 
              size="small" 
              label={`${Math.round(dateDetails.confidence * 100)}%`}
              color={dateDetails.confidence >= 0.8 ? 'success' : dateDetails.confidence >= 0.6 ? 'warning' : 'error'}
              sx={{ ml: 1, height: 20 }}
            />
          </Box>
        )}

        {/* Sources multiples (nouveau format) */}
        {dateDetails.sources && Array.isArray(dateDetails.sources) && dateDetails.sources.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Sources ({dateDetails.sources.length}):
            </Typography>
            {dateDetails.sources.map((sourceInfo: any, idx: number) => (
              <Paper key={idx} sx={{ p: 1.5, mb: 1.5, bgcolor: 'background.paper' }}>
                <Link 
                  href={sourceInfo.source} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  sx={{ fontSize: '0.75rem', display: 'block', mb: 1 }}
                >
                  {sourceInfo.source}
                </Link>
                <Paper sx={{ 
                  p: 1, 
                  bgcolor: 'grey.50', 
                  borderLeft: 2, 
                  borderColor: 'info.main',
                  fontSize: '0.75rem',
                  fontStyle: 'italic'
                }}>
                  "{sourceInfo.snippet}"
                </Paper>
              </Paper>
            ))}
          </Box>
        )}

        {/* Source unique (ancien format - backward compatibility) */}
        {!dateDetails.sources && dateDetails.source && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Source:
            </Typography>
            <Link 
              href={dateDetails.source} 
              target="_blank" 
              rel="noopener noreferrer"
              sx={{ fontSize: '0.75rem', display: 'block', mb: 1 }}
            >
              {dateDetails.source}
            </Link>
            {dateDetails.snippet && (
              <Paper sx={{ 
                p: 1, 
                bgcolor: 'grey.50', 
                borderLeft: 2, 
                borderColor: 'info.main',
                fontSize: '0.75rem',
                fontStyle: 'italic'
              }}>
                "{dateDetails.snippet}"
              </Paper>
            )}
          </Box>
        )}
      </Box>
    )
  }

  const renderMetadata = (metadata: any) => {
    if (!metadata || Object.keys(metadata).length === 0) return null

    // Filtrer les champs déjà affichés ailleurs
    const excludedKeys = ['dateDetails', 'extractedDate']
    const displayableMetadata = Object.entries(metadata)
      .filter(([key]) => !excludedKeys.includes(key))
      .filter(([_, value]) => value !== undefined && value !== null)

    if (displayableMetadata.length === 0) return null

    // Fonction pour formater une valeur (rendre les URLs cliquables)
    const formatMetadataValue = (value: any): React.ReactNode => {
      // Si c'est une string qui ressemble à une URL
      if (typeof value === 'string' && value.match(/^https?:\/\//)) {
        return (
          <Link 
            href={value} 
            target="_blank" 
            rel="noopener noreferrer"
            sx={{ wordBreak: 'break-all', fontSize: '0.75rem' }}
          >
            {value}
          </Link>
        )
      }
      
      // Si c'est un objet, le formater en JSON
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2)
      }
      
      // Sinon, afficher la valeur telle quelle
      return String(value)
    }

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Métadonnées additionnelles:
        </Typography>
        <Paper sx={{ p: 1.5, bgcolor: 'grey.50' }}>
          {displayableMetadata.map(([key, value]) => (
            <Box key={key} sx={{ mb: 0.5, display: 'flex', gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 120 }}>
                {key}:
              </Typography>
              <Box sx={{ flex: 1, wordBreak: 'break-word' }}>
                <Typography variant="caption" component="div">
                  {formatMetadataValue(value)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Paper>
      </Box>
    )
  }

  if (!justifications || justifications.length === 0) {
    return (
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <InfoIcon color="primary" />
            Justifications
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Aucune justification disponible pour cette proposition.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon color="primary" />
            Justifications
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip 
              size="small" 
              label={`${justifications.length} source${justifications.length > 1 ? 's' : ''}`}
              color="primary"
              variant="outlined"
            />
            {confidence !== undefined && (
              <Chip 
                size="small" 
                label={`Confiance: ${Math.round(confidence * 100)}%`}
                color={confidence >= 0.8 ? 'success' : confidence >= 0.6 ? 'warning' : 'error'}
              />
            )}
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Sources et raisons ayant conduit à cette proposition
        </Typography>

        {justifications.map((justification, index) => (
          <Accordion 
            key={index}
            expanded={expandedIndex === index}
            onChange={handleAccordionChange(index)}
            sx={{ 
              mb: 1,
              '&:before': { display: 'none' },
              boxShadow: 1
            }}
          >
            <AccordionSummary 
              expandIcon={<ExpandMoreIcon />}
              sx={{ 
                bgcolor: expandedIndex === index ? 'action.hover' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                {getJustificationIcon(justification.type)}
                <Box sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle2">
                      Source {index + 1}
                    </Typography>
                    {/* Lien rapide vers la source si disponible dans metadata.source */}
                    {justification.metadata?.source && (
                      <Link
                        href={justification.metadata.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()} // Éviter d'ouvrir l'accordéon
                        sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 0.5,
                          fontSize: '0.7rem',
                          ml: 1
                        }}
                      >
                        <LinkIcon sx={{ fontSize: '0.9rem' }} />
                        Voir la source
                      </Link>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip 
                      size="small" 
                      label={getTypeLabel(justification.type)}
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                    {justification.metadata?.raceName && (
                      <Chip 
                        size="small" 
                        label={justification.metadata.raceName}
                        color="info"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                    {justification.metadata?.agentName && (
                      <Chip 
                        size="small" 
                        label={justification.metadata.agentName}
                        color="secondary"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                  </Box>
                </Box>
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={{ pt: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Contenu:
                </Typography>
                <Box sx={{ mb: 2 }}>
                  {formatContent(justification.content, justification.type)}
                </Box>

                {justification.metadata?.dateDetails && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    {renderDateDetails(justification.metadata.dateDetails)}
                  </>
                )}

                {justification.metadata && Object.keys(justification.metadata).length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    {renderMetadata(justification.metadata)}
                  </>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </CardContent>
    </Card>
  )
}

export default ProposalJustificationsCard
