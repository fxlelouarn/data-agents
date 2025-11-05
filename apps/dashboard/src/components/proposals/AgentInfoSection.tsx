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
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  HourglassEmpty as PendingIcon,
  Archive as ArchiveIcon
} from '@mui/icons-material'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Proposal {
  id: string
  agent: {
    name: string
    type?: string
  }
  confidence: number
  createdAt: string
  type: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  // Champs enrichis pour affichage
  eventName?: string
  eventCity?: string
  editionYear?: number
  eventId?: string
  editionId?: string
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckIcon sx={{ fontSize: '1rem', color: 'success.main' }} />
      case 'REJECTED':
        return <CancelIcon sx={{ fontSize: '1rem', color: 'error.main' }} />
      case 'ARCHIVED':
        return <ArchiveIcon sx={{ fontSize: '1rem', color: 'text.disabled' }} />
      case 'PENDING':
      default:
        return <PendingIcon sx={{ fontSize: '1rem', color: 'warning.main' }} />
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'Approuvée'
      case 'REJECTED': return 'Rejetée'
      case 'ARCHIVED': return 'Archivée'
      case 'PENDING': return 'En attente'
      default: return status
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
            {/* Nom de l'événement et année de l'édition */}
            {(proposal.eventName || proposal.editionYear) && (
              <Box sx={{ mb: 1, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                {proposal.eventName && (
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {proposal.eventName}
                    {proposal.eventCity && ` - ${proposal.eventCity}`}
                  </Typography>
                )}
                {proposal.editionYear && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                    Édition : {proposal.editionYear}
                  </Typography>
                )}
              </Box>
            )}
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {getStatusIcon(proposal.status)}
                <Typography variant="subtitle2">
                  Proposition {index + 1}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {`${Math.round((proposal.confidence || 0) * 100)}%`}
              </Typography>
            </Box>
            
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5, ml: 3 }}>
              Statut : {getStatusLabel(proposal.status)}
            </Typography>
            
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
              <PersonIcon sx={{ fontSize: '0.875rem', mr: 0.5, verticalAlign: 'middle' }} />
              {proposal.agent.name}
              {proposal.agent.type && (
                <Typography component="span" variant="caption" sx={{ ml: 1, px: 0.5, py: 0.25, bgcolor: 'primary.light', borderRadius: 0.5, color: 'primary.contrastText', fontSize: '0.65rem' }}>
                  {proposal.agent.type}
                </Typography>
              )}
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