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
import { OpenInNew as ExternalLinkIcon, CheckCircle as CheckIcon } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useConvertToEditionUpdate, useBulkArchiveProposals } from '@/hooks/useApi'

interface MatchCandidate {
  type: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'REJECTED'
  eventId: number
  eventName: string
  eventSlug: string
  eventCity: string
  editionId?: number
  editionYear?: string
  confidence: number
  nameScore?: number
  cityScore?: number
  departmentMatch?: boolean
  dateProximity?: number
}

interface ExistingEventAlertProps {
  proposalId: string
  match: MatchCandidate
  matches?: MatchCandidate[]
  proposalYear: number
}

export function ExistingEventAlert({ proposalId, match, matches, proposalYear }: ExistingEventAlertProps) {
  const navigate = useNavigate()
  const convertMutation = useConvertToEditionUpdate()
  const archiveMutation = useBulkArchiveProposals()

  // Use matches array if provided, otherwise single match
  const allMatches = matches && matches.length > 0 ? matches : [match]

  const handleConvert = (m: MatchCandidate) => {
    if (!m.editionId) {
      alert("L'édition n'existe pas encore dans Miles Republic. Créez-la d'abord puis revenez sur cette page.")
      return
    }

    if (confirm(`Convertir cette proposition en mise à jour de l'édition ${m.editionYear} de "${m.eventName}" ?`)) {
      convertMutation.mutate(
        {
          proposalId,
          eventId: m.eventId,
          editionId: m.editionId,
          eventName: m.eventName,
          eventSlug: m.eventSlug,
          editionYear: m.editionYear!
        },
        {
          onSuccess: (data) => {
            navigate(`/proposals/${data.data.newProposal.id}`)
          }
        }
      )
    }
  }

  const isLoading = convertMutation.isPending || archiveMutation.isPending

  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <AlertTitle>Événements similaires détectés</AlertTitle>
      <Typography variant="body2" sx={{ mb: 2 }}>
        L'algorithme de matching a trouvé ces événements existants. Si l'un d'entre eux correspond, sélectionnez-le pour convertir cette proposition.
      </Typography>

      {allMatches.map((m, idx) => (
        <Box
          key={m.eventId}
          sx={(theme) => ({
            mb: 1.5,
            p: 1.5,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'grey.50',
          })}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={`#${idx + 1}`} size="small" variant="outlined" />
              <Chip
                label={`Score: ${(m.confidence * 100).toFixed(0)}%`}
                size="small"
                color={m.type === 'EXACT_MATCH' ? 'success' : 'primary'}
              />
              {m.departmentMatch && (
                <Chip label="Même département" size="small" color="success" variant="outlined" />
              )}
            </Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<CheckIcon />}
              onClick={() => handleConvert(m)}
              disabled={!m.editionId || isLoading}
            >
              Sélectionner
            </Button>
          </Box>
          <MuiLink
            href={`https://fr.milesrepublic.com/event/${m.eventSlug}`}
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
            {m.eventName}
            <ExternalLinkIcon sx={{ fontSize: '1rem' }} />
          </MuiLink>
          <Typography variant="body2" color="text.secondary">
            {m.eventCity}
            {m.editionYear && ` • Édition ${m.editionYear}`}
          </Typography>
          {m.nameScore !== undefined && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Nom: {(m.nameScore * 100).toFixed(0)}%
              {m.cityScore !== undefined && <> &nbsp; Ville: {(m.cityScore * 100).toFixed(0)}%</>}
              {m.dateProximity !== undefined && <> &nbsp; Date: {(m.dateProximity * 100).toFixed(0)}%</>}
            </Typography>
          )}
          {!m.editionId && (
            <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
              L'édition {proposalYear} n'existe pas encore — créez-la d'abord.
            </Typography>
          )}
        </Box>
      ))}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
        <strong>Astuce :</strong> Si aucun de ces événements ne correspond, vous pouvez ignorer cette alerte et approuver la création du nouvel événement.
      </Typography>
    </Alert>
  )
}
