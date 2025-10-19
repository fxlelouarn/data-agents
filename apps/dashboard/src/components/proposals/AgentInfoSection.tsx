import React from 'react'
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Button
} from '@mui/material'
import { 
  Person as PersonIcon, 
  Schedule as ScheduleIcon,
  Info as InfoIcon
} from '@mui/icons-material'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Proposal {
  id: string
  agent: {
    name: string
  }
  confidence: number
  createdAt: string
  type: string
}

interface AgentInfoSectionProps {
  proposals: Proposal[]
}

const AgentInfoSection: React.FC<AgentInfoSectionProps> = ({ proposals }) => {
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

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          <InfoIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Propositions
        </Typography>
        
        {proposals.map((proposal, index) => (
          <Box key={proposal.id} sx={{ mb: 1.5, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2">
                Proposition {index + 1}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {`${Math.round((proposal.confidence || 0) * 100)}%`}
              </Typography>
            </Box>
            
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
              <PersonIcon sx={{ fontSize: '0.875rem', mr: 0.5, verticalAlign: 'middle' }} />
              {proposal.agent.name}
            </Typography>
            
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
              <ScheduleIcon sx={{ fontSize: '0.875rem', mr: 0.5, verticalAlign: 'middle' }} />
              {formatDate(proposal.createdAt)}
            </Typography>

            <Button
              size="small"
              variant="outlined"
              component={Link}
              to={`/proposals/${proposal.id}`}
              fullWidth
            >
              Voir détails
            </Button>
          </Box>
        ))}
      </CardContent>
    </Card>
  )
}

export default AgentInfoSection