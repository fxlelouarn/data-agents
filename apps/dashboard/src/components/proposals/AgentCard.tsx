import React from 'react'
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Button,
  Chip
} from '@mui/material'
import { 
  Person as PersonIcon, 
  Schedule as ScheduleIcon,
  SmartToy as BotIcon,
  Visibility as ViewIcon
} from '@mui/icons-material'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Agent {
  id?: string
  name: string
  type?: string
}

interface AgentCardProps {
  agent: Agent
  createdAt: string
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, createdAt }) => {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }
      return format(date, 'dd MMMM yyyy à HH:mm', { locale: fr })
    } catch (error) {
      return dateString
    }
  }

  const getAgentTypeLabel = (type?: string) => {
    if (!type) return null
    
    const labels: Record<string, string> = {
      'EXTRACTOR': 'Extracteur',
      'COMPARATOR': 'Comparateur',
      'VALIDATOR': 'Validateur',
      'CLEANER': 'Nettoyeur',
      'DUPLICATOR': 'Duplicateur',
      'SPECIFIC_FIELD': 'Champ spécifique'
    }
    
    return labels[type] || type
  }

  const getAgentTypeColor = (type?: string): 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' => {
    if (!type) return 'default'
    
    const colors: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'info'> = {
      'EXTRACTOR': 'primary',
      'COMPARATOR': 'info',
      'VALIDATOR': 'success',
      'CLEANER': 'warning',
      'DUPLICATOR': 'secondary',
      'SPECIFIC_FIELD': 'default'
    }
    
    return colors[type] || 'default'
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <BotIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6">
            Agent
          </Typography>
        </Box>
        
        {/* Nom de l'agent */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            <PersonIcon sx={{ fontSize: '0.875rem', mr: 0.5, verticalAlign: 'middle' }} />
            Nom
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {agent.name}
          </Typography>
        </Box>
        
        {/* Type de l'agent */}
        {agent.type && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Type
            </Typography>
            <Chip
              label={getAgentTypeLabel(agent.type)}
              color={getAgentTypeColor(agent.type)}
              size="small"
              sx={{ fontWeight: 600 }}
            />
          </Box>
        )}
        
        {/* Date de création */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            <ScheduleIcon sx={{ fontSize: '0.875rem', mr: 0.5, verticalAlign: 'middle' }} />
            Date de création
          </Typography>
          <Typography variant="body2">
            {formatDate(createdAt)}
          </Typography>
        </Box>

        {/* Lien vers la page de détail de l'agent */}
        {agent.id && (
          <Button
            size="small"
            variant="outlined"
            component={Link}
            to={`/agents/${agent.id}`}
            startIcon={<ViewIcon />}
            fullWidth
          >
            Voir l'agent
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default AgentCard
