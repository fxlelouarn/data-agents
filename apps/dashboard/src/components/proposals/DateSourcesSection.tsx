import React from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Link,
  Chip
} from '@mui/material'
import {
  CalendarToday as DateIcon,
  Link as LinkIcon,
  Info as InfoIcon
} from '@mui/icons-material'

interface DateSourcesSectionProps {
  justifications: any[]
}

const DateSourcesSection: React.FC<DateSourcesSectionProps> = ({ justifications }) => {
  // Extraire les justifications avec métadonnées de date extraction
  const dateExtractions = justifications
    .filter((justif: any) => justif.metadata?.dateDetails || justif.metadata?.extractedDate)
    .flatMap((justif: any) => {
      const metadata = justif.metadata || {}
      const dateDetails = metadata.dateDetails || {}
      
      // Nouveau format consolidé avec sources multiples
      if (dateDetails.sources && Array.isArray(dateDetails.sources)) {
        return dateDetails.sources.map((sourceInfo: any) => ({
          date: dateDetails.date,
          confidence: dateDetails.confidence,
          source: sourceInfo.source,
          snippet: sourceInfo.snippet,
          sourcesCount: metadata.sourcesCount || dateDetails.sources.length,
          agentName: metadata.agentName,
          raceName: metadata.raceName
        }))
      }
      // Ancien format avec une seule source (backward compatibility)
      else if (dateDetails.date) {
        return [{
          date: dateDetails.date,
          confidence: dateDetails.confidence,
          source: dateDetails.source,
          snippet: dateDetails.snippet,
          raceName: metadata.raceName, // pour les courses
          sourcesCount: 1,
          agentName: metadata.agentName
        }]
      }
      return []
    })

  if (dateExtractions.length === 0) {
    return null
  }

  // Grouper par date et collecter toutes les sources uniques avec les agents
  const groupedByDate: Record<string, {
    sources: Array<{source: string, snippet: string, confidence: number, agents: Set<string>}>,
    totalPropositions: number,
    racesInfo: Set<string>
  }> = dateExtractions.reduce((acc, extraction) => {
    if (!acc[extraction.date]) {
      acc[extraction.date] = {
        sources: [],
        totalPropositions: 0,
        racesInfo: new Set()
      }
    }
    
    // Ajouter la source si elle n'existe pas déjà
    let sourceEntry = acc[extraction.date].sources.find((s: any) => 
      s.source === extraction.source && s.snippet === extraction.snippet
    )
    if (!sourceEntry) {
      sourceEntry = {
        source: extraction.source,
        snippet: extraction.snippet,
        confidence: extraction.confidence,
        agents: new Set()
      }
      acc[extraction.date].sources.push(sourceEntry)
    }
    
    // Ajouter l'agent s'il existe
    if (extraction.agentName) {
      sourceEntry.agents.add(extraction.agentName)
    }
    
    // Compter toutes les propositions
    acc[extraction.date].totalPropositions++
    
    // Collecter les noms des courses
    if (extraction.raceName) {
      acc[extraction.date].racesInfo.add(extraction.raceName)
    }
    
    return acc
  }, {} as Record<string, {
    sources: Array<{source: string, snippet: string, confidence: number, agents: Set<string>}>,
    totalPropositions: number,
    racesInfo: Set<string>
  }>)

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoIcon color="primary" />
          Sources
        </Typography>

        {Object.entries(groupedByDate).map(([date, dateInfo]) => {
          // Calculer la confiance moyenne des sources pour cette date (multiplier par 100 pour convertir de 0-1 à 0-100)
          const avgConfidence = dateInfo.sources.length > 0 ? Math.round(
            (dateInfo.sources.reduce((sum: number, s: {source: string, snippet: string, confidence: number}) => sum + (s.confidence || 0), 0) / dateInfo.sources.length) * 100
          ) : 0
          
          const racesList = Array.from(dateInfo.racesInfo)
          
          return (
            <Paper key={date} sx={{ mb: 3, p: 2, bgcolor: '#f8f9fa', border: '1px solid #e9ecef' }}>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  <DateIcon color="primary" />
                  <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                    {date}
                  </Typography>
                  <Chip 
                    size="small" 
                    label={`${avgConfidence}% confiance`}
                    color={avgConfidence >= 80 ? 'success' : avgConfidence >= 60 ? 'warning' : 'error'}
                  />
                  <Chip 
                    size="small" 
                    label={`${dateInfo.sources.length} source${dateInfo.sources.length > 1 ? 's' : ''}`}
                    color="info"
                    variant="outlined"
                  />
                  <Chip 
                    size="small" 
                    label={`${dateInfo.totalPropositions} propositions`}
                    variant="outlined"
                  />
                </Box>
                
                {racesList.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                    Courses concernées: {racesList.join(', ')}
                  </Typography>
                )}
              </Box>

              {/* Afficher chaque source distincte */}
              {dateInfo.sources.map((sourceInfo, idx) => (
                <Box key={idx} sx={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: 2, 
                  mb: 3,
                  pl: 2,
                  borderLeft: idx < dateInfo.sources.length - 1 ? '2px solid #e0e0e0' : 'none'
                }}>
                  <LinkIcon fontSize="small" color="primary" sx={{ mt: 0.5 }} />
                  <Box sx={{ flexGrow: 1 }}>
                    <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                      <Typography variant="subtitle2" color="text.primary" sx={{ fontWeight: 'medium' }}>
                        • Source {idx + 1}:
                      </Typography>
                      {sourceInfo.agents.size > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Proposée par: {Array.from(sourceInfo.agents).join(', ')}
                        </Typography>
                      )}
                    </Box>
                    <Link 
                      href={sourceInfo.source} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      sx={{ 
                        fontSize: '0.875rem',
                        display: 'block',
                        mb: 2,
                        wordBreak: 'break-all',
                        fontWeight: 'medium'
                      }}
                    >
                      {sourceInfo.source}
                    </Link>
                    
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Snippet:
                    </Typography>
                    <Paper sx={{ 
                      p: 2, 
                      backgroundColor: 'background.paper',
                      borderLeft: '3px solid',
                      borderLeftColor: 'info.main',
                      fontStyle: 'italic',
                      border: '1px solid #e0e0e0'
                    }}>
                      <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                        "{sourceInfo.snippet}"
                      </Typography>
                    </Paper>
                  </Box>
                </Box>
              ))}
            </Paper>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default DateSourcesSection