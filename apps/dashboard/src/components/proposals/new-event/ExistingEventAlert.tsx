import React from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Typography,
  Link as MuiLink
} from '@mui/material'
import { OpenInNew as ExternalLinkIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useConvertToEditionUpdate, useBulkArchiveProposals } from '@/hooks/useApi'

interface ExistingEventAlertProps {
  proposalId: string
  match: {
    type: 'EXACT_MATCH' | 'FUZZY_MATCH'
    eventId: number
    eventName: string
    eventSlug: string
    eventCity: string
    editionId?: number
    editionYear?: string
    confidence: number
  }
  proposalYear: number
}

export function ExistingEventAlert({ proposalId, match, proposalYear }: ExistingEventAlertProps) {
  const navigate = useNavigate()
  const convertMutation = useConvertToEditionUpdate()
  const archiveMutation = useBulkArchiveProposals()

  const handleConvert = () => {
    if (!match.editionId) {
      alert("L'édition n'existe pas encore dans Miles Republic. Créez-la d'abord puis revenez sur cette page.")
      return
    }

    if (confirm(`Convertir cette proposition en mise à jour de l'édition ${match.editionYear} de "${match.eventName}" ?`)) {
      convertMutation.mutate(
        {
          proposalId,
          eventId: match.eventId,
          editionId: match.editionId,
          eventName: match.eventName,
          eventSlug: match.eventSlug,
          editionYear: match.editionYear!
        },
        {
          onSuccess: (data) => {
            navigate(`/proposals/${data.data.newProposal.id}`)
          }
        }
      )
    }
  }

  const handleArchive = () => {
    if (confirm('Archiver cette proposition ? Elle ne sera plus visible dans la liste des propositions en attente.')) {
      archiveMutation.mutate(
        {
          proposalIds: [proposalId],
          archiveReason: `Événement déjà créé dans Miles Republic: ${match.eventName} (ID ${match.eventId})`
        },
        {
          onSuccess: () => {
            navigate('/proposals')
          }
        }
      )
    }
  }

  const isLoading = convertMutation.isPending || archiveMutation.isPending

  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <AlertTitle>Un événement correspondant existe maintenant</AlertTitle>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <MuiLink
            href={`https://fr.milesrepublic.com/event/${match.eventSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              fontWeight: 600,
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' }
            }}
          >
            {match.eventName}
            <ExternalLinkIcon sx={{ fontSize: '1rem' }} />
          </MuiLink>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {match.eventCity}
          {match.editionYear && ` • Édition ${match.editionYear}`}
        </Typography>
        <Chip
          label={`Score: ${(match.confidence * 100).toFixed(0)}%`}
          size="small"
          color={match.type === 'EXACT_MATCH' ? 'success' : 'primary'}
          sx={{ mt: 1 }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="small"
          onClick={handleConvert}
          disabled={!match.editionId || isLoading}
        >
          Convertir en mise à jour
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={handleArchive}
          disabled={isLoading}
        >
          Archiver
        </Button>
      </Box>

      {!match.editionId && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          L'édition {proposalYear} n'existe pas encore dans Miles Republic. Créez-la d'abord pour pouvoir convertir.
        </Typography>
      )}
    </Alert>
  )
}
