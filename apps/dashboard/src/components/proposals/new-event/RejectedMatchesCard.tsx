import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  Link as MuiLink,
  Alert
} from '@mui/material'
import {
  OpenInNew as ExternalLinkIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon
} from '@mui/icons-material'
import { useConvertToEditionUpdate } from '@/hooks/useApi'
import { useNavigate } from 'react-router-dom'

interface RejectedMatch {
  eventId: number
  eventName: string
  eventSlug: string
  eventCity: string
  eventDepartment: string
  editionId?: number
  editionYear?: string
  matchScore: number
  nameScore: number
  cityScore: number
  departmentMatch: boolean
  dateProximity: number
}

interface RejectedMatchesCardProps {
  proposalId: string
  rejectedMatches: RejectedMatch[]
}

export function RejectedMatchesCard({ proposalId, rejectedMatches }: RejectedMatchesCardProps) {
  const navigate = useNavigate()
  const convertMutation = useConvertToEditionUpdate()

  if (!rejectedMatches || rejectedMatches.length === 0) {
    return null
  }

  const handleSelectMatch = (match: RejectedMatch) => {
    if (!match.editionId) {
      alert("Cette édition n'existe pas encore dans Miles Republic. Impossible de créer une proposition EDITION_UPDATE.")
      return
    }

    if (confirm(`Êtes-vous sûr de vouloir convertir cette proposition NEW_EVENT en EDITION_UPDATE pour "${match.eventName}" (${match.editionYear}) ?`)) {
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
            // Rediriger vers la nouvelle proposition EDITION_UPDATE
            navigate(`/proposals/${data.data.newProposal.id}`)
          }
        }
      )
    }
  }

  return (
    <Card sx={{ mb: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.lighter' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <WarningIcon sx={{ color: 'warning.main' }} />
          <Typography variant="h6">
            Événements similaires détectés
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          L'algorithme de matching a trouvé ces événements existants. Si l'un d'entre eux correspond, sélectionnez-le pour convertir cette proposition.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rejectedMatches.map((match, index) => (
            <Box
              key={`${match.eventId}-${match.editionId || 'no-edition'}`}
              sx={{
                border: 1,
                borderColor: 'grey.300',
                borderRadius: 1,
                p: 2,
                bgcolor: 'background.paper',
                '&:hover': {
                  borderColor: 'warning.main'
                },
                transition: 'border-color 0.2s'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                    <Chip
                      label={`#${index + 1}`}
                      size="small"
                      variant="outlined"
                    />
                    <Chip
                      label={`Score: ${(match.matchScore * 100).toFixed(0)}%`}
                      size="small"
                      color={match.matchScore >= 0.75 ? 'primary' : 'default'}
                    />
                    {match.departmentMatch && (
                      <Chip
                        label="Même département"
                        size="small"
                        variant="outlined"
                        color="success"
                      />
                    )}
                  </Box>

                  <MuiLink
                    href={`https://fr.milesrepublic.com/event/${match.eventSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      textDecoration: 'none',
                      '&:hover': {
                        textDecoration: 'underline'
                      }
                    }}
                  >
                    {match.eventName}
                    <ExternalLinkIcon sx={{ fontSize: '1rem' }} />
                  </MuiLink>

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {match.eventCity} ({match.eventDepartment})
                    {match.editionYear && ` • Édition ${match.editionYear}`}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Nom: {(match.nameScore * 100).toFixed(0)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ville: {(match.cityScore * 100).toFixed(0)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Date: {(match.dateProximity * 100).toFixed(0)}%
                    </Typography>
                  </Box>
                </Box>

                <Button
                  size="small"
                  variant={match.editionId ? 'contained' : 'outlined'}
                  disabled={!match.editionId || convertMutation.isPending}
                  onClick={() => handleSelectMatch(match)}
                  startIcon={match.editionId ? <CheckCircleIcon /> : undefined}
                  sx={{ flexShrink: 0 }}
                >
                  {match.editionId ? 'Sélectionner' : 'Pas d\'édition'}
                </Button>
              </Box>
            </Box>
          ))}
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="caption">
            <strong>Astuce :</strong> Si aucun de ces événements ne correspond, vous pouvez ignorer cette alerte et approuver la création du nouvel événement.
          </Typography>
        </Alert>
      </CardContent>
    </Card>
  )
}
