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
  SwapHoriz as SwapIcon,
  Info as InfoIcon
} from '@mui/icons-material'
import { useChangeTarget } from '@/hooks/useApi'

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

interface AlternativeMatchesCardProps {
  proposalId: string
  currentEventId?: string
  currentEventName?: string
  rejectedMatches: RejectedMatch[]
}

export function AlternativeMatchesCard({
  proposalId,
  currentEventId,
  currentEventName,
  rejectedMatches
}: AlternativeMatchesCardProps) {
  const changeTargetMutation = useChangeTarget()

  if (!rejectedMatches || rejectedMatches.length === 0) {
    return null
  }

  // Filtrer l'événement actuel des alternatives
  const alternatives = rejectedMatches.filter(
    match => match.eventId.toString() !== currentEventId
  )

  if (alternatives.length === 0) {
    return null
  }

  const handleSelectMatch = (match: RejectedMatch) => {
    if (!match.editionId) {
      alert("Cette édition n'existe pas encore dans Miles Republic.")
      return
    }

    if (confirm(`Changer la cible de cette proposition vers "${match.eventName}" (${match.editionYear}) ?\n\nCela réinitialisera les blocs validés.`)) {
      changeTargetMutation.mutate({
        proposalId,
        eventId: match.eventId,
        editionId: match.editionId,
        eventName: match.eventName,
        eventSlug: match.eventSlug,
        editionYear: match.editionYear!
      })
    }
  }

  return (
    <Card sx={{ mb: 2, border: 1, borderColor: 'info.light', bgcolor: 'info.lighter' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <InfoIcon sx={{ color: 'info.main' }} />
          <Typography variant="h6">
            Autres correspondances possibles
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          L'algorithme a aussi trouvé ces événements. Si la cible actuelle est incorrecte, sélectionnez une alternative.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {alternatives.map((match, index) => (
            <Box
              key={`${match.eventId}-${match.editionId || 'no-edition'}`}
              sx={{
                border: 1,
                borderColor: 'grey.300',
                borderRadius: 1,
                p: 2,
                bgcolor: 'background.paper',
                '&:hover': {
                  borderColor: 'info.main'
                },
                transition: 'border-color 0.2s'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                    <Chip
                      label={`#${index + 2}`}
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
                    {match.editionYear && ` - Édition ${match.editionYear}`}
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
                  variant={match.editionId ? 'outlined' : 'text'}
                  color="info"
                  disabled={!match.editionId || changeTargetMutation.isPending}
                  onClick={() => handleSelectMatch(match)}
                  startIcon={match.editionId ? <SwapIcon /> : undefined}
                  sx={{ flexShrink: 0 }}
                >
                  {match.editionId ? 'Changer' : 'Pas d\'édition'}
                </Button>
              </Box>
            </Box>
          ))}
        </Box>

        <Alert severity="info" sx={{ mt: 2 }} icon={false}>
          <Typography variant="caption">
            Si aucune de ces alternatives ne correspond, la cible actuelle ({currentEventName}) est probablement correcte.
          </Typography>
        </Alert>
      </CardContent>
    </Card>
  )
}
