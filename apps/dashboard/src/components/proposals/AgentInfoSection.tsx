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
  Archive as ArchiveIcon,
  Link as LinkIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * Format SourceMetadata générique (contrat)
 * Supporte tous les types de sources: URL, IMAGE, TEXT, SLACK, FFA, GOOGLE
 */
interface SourceMetadata {
  type: 'URL' | 'IMAGE' | 'TEXT' | 'SLACK' | 'FFA' | 'GOOGLE'
  url?: string
  imageUrls?: string[]
  rawText?: string
  extractedAt: string
  extra?: {
    workspaceId?: string
    channelId?: string
    messageLink?: string
    userId?: string
    userName?: string
    ffaId?: string
    ligue?: string
    searchQuery?: string
    resultRank?: number
  }
}

interface Proposal {
  id: string
  agent: {
    name: string
    type?: string
  }
  confidence: number
  createdAt: string
  type: string
  status: 'PENDING' | 'PARTIALLY_APPROVED' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  // Champs enrichis pour affichage
  eventName?: string
  eventCity?: string
  editionYear?: number
  eventId?: string
  editionId?: string
  // SourceMetadata générique (contrat)
  sourceMetadata?: SourceMetadata | null
  // Justifications pour extraire les sources (fallback)
  justification?: Array<{
    type: string
    content: string
    metadata?: {
      source?: string
      url?: string
      [key: string]: any
    }
  }>
}

interface AgentInfoSectionProps {
  proposals: Proposal[]
}

const AgentInfoSection: React.FC<AgentInfoSectionProps> = ({ proposals }) => {
  // ✅ Séparer les propositions en cours (PENDING ou PARTIALLY_APPROVED) des propositions finalisées
  const pendingProposals = proposals.filter(p => p.status === 'PENDING' || p.status === 'PARTIALLY_APPROVED')
  const historicalProposals = proposals.filter(p => p.status !== 'PENDING' && p.status !== 'PARTIALLY_APPROVED')

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
      case 'PARTIALLY_APPROVED':
        return <CheckIcon sx={{ fontSize: '1rem', color: 'info.main' }} />
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
      case 'PARTIALLY_APPROVED': return 'Partiellement approuvée'
      case 'REJECTED': return 'Rejetée'
      case 'ARCHIVED': return 'Archivée'
      case 'PENDING': return 'En attente'
      default: return status
    }
  }

  // Extraire la première source disponible d'une proposition
  // Ordre de priorité:
  // 1. sourceMetadata.url (format générique - contrat)
  // 2. sourceMetadata.extra.messageLink (pour Slack)
  // 3. justification avec type 'url_source' (nouveau contrat)
  // 4. justification avec metadata.source ou metadata.url (fallback)
  const getSourceUrl = (proposal: Proposal): string | null => {
    // Priorité 1: sourceMetadata.url (contrat générique)
    if (proposal.sourceMetadata?.url) {
      return proposal.sourceMetadata.url
    }

    // Priorité 2: messageLink pour sources Slack
    if (proposal.sourceMetadata?.extra?.messageLink) {
      return proposal.sourceMetadata.extra.messageLink
    }

    // Priorité 3+: Fallback sur justifications
    if (!proposal.justification || proposal.justification.length === 0) {
      return null
    }

    for (const justif of proposal.justification) {
      // Priorité 3: type 'url_source' (nouveau contrat)
      if (justif.type === 'url_source' && justif.metadata?.url) {
        return justif.metadata.url
      }

      // Priorité 4: metadata.source ou metadata.url
      if (justif.metadata?.source) {
        return justif.metadata.source
      }
      if (justif.metadata?.url) {
        return justif.metadata.url
      }

      // Priorité 5: content de type url
      if (justif.type === 'url' && justif.content) {
        return justif.content
      }

      // Priorité 6: content qui ressemble à une URL
      if (justif.content && typeof justif.content === 'string' && justif.content.match(/^https?:\/\//)) {
        return justif.content
      }
    }

    return null
  }

  const renderProposal = (proposal: Proposal, index: number, isPending: boolean) => (
    <Box
      key={proposal.id}
      sx={{
        mb: 1.5,
        p: 1.5,
        bgcolor: isPending ? 'action.hover' : 'background.paper',
        borderRadius: 1,
        border: isPending ? 'none' : 1,
        borderColor: 'divider'
      }}
    >
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
          <Typography component="span" variant="caption" sx={{ ml: 1, px: 0.5, py: 0.25, bgcolor: 'primary.main', borderRadius: 0.5, color: 'primary.contrastText', fontSize: '0.65rem' }}>
            {proposal.agent.type}
          </Typography>
        )}
      </Typography>

      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
        <ScheduleIcon sx={{ fontSize: '0.875rem', mr: 0.5, verticalAlign: 'middle' }} />
        {formatDate(proposal.createdAt)}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          component={Link}
          to={`/proposals/${proposal.id}`}
          sx={{ flex: 1 }}
        >
          Voir détails
        </Button>

        {getSourceUrl(proposal) && (
          <Button
            size="small"
            variant="outlined"
            color="primary"
            startIcon={<OpenInNewIcon sx={{ fontSize: '1rem' }} />}
            onClick={() => window.open(getSourceUrl(proposal)!, '_blank', 'noopener,noreferrer')}
            sx={{ flex: 1 }}
          >
            Voir source
          </Button>
        )}
      </Box>
    </Box>
  )

  return (
    <>
      {/* ✅ Section Propositions PENDING */}
      {pendingProposals.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <InfoIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Propositions en attente
            </Typography>

            {pendingProposals.map((proposal, index) => renderProposal(proposal, index, true))}
          </CardContent>
        </Card>
      )}

      {/* ✅ Section Historique (propositions déjà traitées) */}
      {historicalProposals.length > 0 && (
        <Card sx={{ mb: 2, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: 'text.secondary' }}>
              <ArchiveIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Historique
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic', fontSize: '0.8rem' }}>
              Ces propositions ont déjà été traitées et n'influencent pas la proposition actuelle.
            </Typography>

            {historicalProposals.map((proposal, index) => renderProposal(proposal, index, false))}
          </CardContent>
        </Card>
      )}
    </>
  )
}

export default AgentInfoSection
