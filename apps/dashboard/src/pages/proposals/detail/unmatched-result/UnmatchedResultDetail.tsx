import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Divider,
  CircularProgress,
  Chip,
  Link
} from '@mui/material'
import {
  Search as SearchIcon,
  Archive as ArchiveIcon,
  OpenInNew as OpenInNewIcon,
  Link as LinkIcon
} from '@mui/icons-material'
import { useProposal, useUpdateProposal } from '@/hooks/useApi'
import { useLinkProposalToEdition } from '@/hooks/useApi'
import MeilisearchEventSelector from '@/components/MeilisearchEventSelector'
import EditionSelector from '@/components/EditionSelector'
import ProposalJustificationsCard from '@/components/proposals/ProposalJustificationsCard'
import AgentCard from '@/components/proposals/AgentCard'

interface UnmatchedResultDetailProps {
  proposalId: string
}

interface RejectedMatch {
  eventId: number
  eventName: string
  eventCity?: string
  eventSlug?: string
  editionId: number
  editionYear: string
  startDate?: string
  matchScore: number
  nameScore?: number
  cityScore?: number
  dateProximity?: number
}

const UnmatchedResultDetail: React.FC<UnmatchedResultDetailProps> = ({ proposalId }) => {
  const navigate = useNavigate()
  const { data: proposalData, isLoading } = useProposal(proposalId)
  const linkMutation = useLinkProposalToEdition()
  const updateProposalMutation = useUpdateProposal()

  const [selectedEvent, setSelectedEvent] = useState<{ id: number; name: string; city?: string; slug?: string } | null>(null)
  const [selectedEdition, setSelectedEdition] = useState<{ id: number; year: string } | null>(null)

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  const proposal = proposalData?.data
  if (!proposal) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Proposition introuvable</Alert>
        </CardContent>
      </Card>
    )
  }

  // Extraire les infos FFA depuis la justification
  const ffaSource = proposal.justification?.find(
    (j: any) => j.metadata?.justificationType === 'ffa_source'
  )
  const ffaData = ffaSource?.metadata || {}
  const registrantsNumber = proposal.changes?.registrantsNumber?.new

  // Extraire les candidats rejetés (si présents)
  const rejectedMatchesJustif = proposal.justification?.find(
    (j: any) => j.metadata?.justificationType === 'rejected_matches'
  )
  const rejectedMatches: RejectedMatch[] = rejectedMatchesJustif?.metadata?.rejectedMatches || []

  const handleSelectRejectedMatch = (match: RejectedMatch) => {
    setSelectedEvent({ id: match.eventId, name: match.eventName, city: match.eventCity, slug: match.eventSlug })
    setSelectedEdition({ id: match.editionId, year: match.editionYear })
  }

  const handleEventSelect = (eventId: string, eventData: any) => {
    setSelectedEvent({
      id: parseInt(eventId),
      name: eventData.name || eventData.eventName || 'Événement',
      city: eventData.city || eventData.eventCity,
      slug: eventData.slug || eventData.eventSlug
    })
    setSelectedEdition(null)
  }

  const handleEditionSelect = (edition: { id: number; year: string }) => {
    setSelectedEdition(edition)
  }

  const handleLinkEdition = async () => {
    if (!selectedEvent || !selectedEdition) return

    try {
      await linkMutation.mutateAsync({
        proposalId,
        eventId: selectedEvent.id,
        editionId: selectedEdition.id
      })
      // Rediriger vers la page normale après liaison
      navigate(`/proposals/${proposalId}`)
    } catch (error) {
      console.error('Erreur lors de la liaison:', error)
    }
  }

  const handleArchive = async () => {
    try {
      await updateProposalMutation.mutateAsync({
        id: proposalId,
        status: 'ARCHIVED'
      })
      navigate('/proposals')
    } catch (error) {
      console.error('Erreur lors de l\'archivage:', error)
    }
  }

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* En-tête */}
      <Typography variant="h5" gutterBottom>
        Résultat FFA - Recherche d'édition correspondante
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Cette compétition FFA n'a pas été automatiquement associée à une édition Miles Republic.
        Sélectionnez l'édition correspondante via les candidats suggérés ou recherchez manuellement.
      </Alert>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {/* Colonne principale */}
        <Box sx={{ flex: '1 1 600px', minWidth: 0 }}>
          {/* Infos FFA */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Compétition FFA
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Nom</Typography>
                  <Typography variant="body1" fontWeight="bold">{ffaData.ffaName || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Ville</Typography>
                  <Typography variant="body1">{ffaData.ffaCity || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Date</Typography>
                  <Typography variant="body1">{formatDate(ffaData.ffaDate)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Participants</Typography>
                  <Typography variant="body1" fontWeight="bold" color="primary.main">
                    {registrantsNumber ?? '-'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Ligue</Typography>
                  <Typography variant="body1">{ffaData.ffaLigue || '-'}</Typography>
                </Box>
              </Box>
              {ffaData.resultsUrl && (
                <Button
                  href={ffaData.resultsUrl}
                  target="_blank"
                  size="small"
                  startIcon={<OpenInNewIcon />}
                  sx={{ mt: 2 }}
                >
                  Voir les résultats FFA
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Candidats rejetés (si présents) */}
          {rejectedMatches.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Candidats potentiels (score &lt; 90%)
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Ces événements ont été trouvés mais leur score de correspondance était trop bas pour un match automatique.
                  Cliquez pour sélectionner.
                </Typography>
                {rejectedMatches.map((match, i) => (
                  <Box
                    key={i}
                    sx={{
                      p: 2,
                      mb: 1,
                      border: '1px solid',
                      borderColor: selectedEvent?.id === match.eventId && selectedEdition?.id === match.editionId
                        ? 'primary.main'
                        : 'divider',
                      borderRadius: 1,
                      cursor: 'pointer',
                      bgcolor: selectedEvent?.id === match.eventId && selectedEdition?.id === match.editionId
                        ? 'action.selected'
                        : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                      transition: 'all 0.2s'
                    }}
                    onClick={() => handleSelectRejectedMatch(match)}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          {match.eventName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {match.eventCity} - Édition {match.editionYear}
                          {match.startDate && ` (${formatDate(match.startDate)})`}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={`${(match.matchScore * 100).toFixed(0)}%`}
                        color={match.matchScore >= 0.7 ? 'warning' : 'default'}
                        variant="outlined"
                      />
                    </Box>
                    {(match.nameScore !== undefined || match.cityScore !== undefined) && (
                      <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                        {match.nameScore !== undefined && (
                          <Chip
                            size="small"
                            label={`Nom: ${(match.nameScore * 100).toFixed(0)}%`}
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: '20px' }}
                          />
                        )}
                        {match.cityScore !== undefined && (
                          <Chip
                            size="small"
                            label={`Ville: ${(match.cityScore * 100).toFixed(0)}%`}
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: '20px' }}
                          />
                        )}
                        {match.dateProximity !== undefined && (
                          <Chip
                            size="small"
                            label={`Date: ${(match.dateProximity * 100).toFixed(0)}%`}
                            variant="outlined"
                            sx={{ fontSize: '0.7rem', height: '20px' }}
                          />
                        )}
                      </Box>
                    )}
                    <Link
                      href={match.eventSlug
                        ? `https://fr.milesrepublic.com/event/${match.eventSlug}-${match.eventId}`
                        : `https://fr.milesrepublic.com/event/${match.eventId}`
                      }
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      sx={{ fontSize: '0.75rem', mt: 1, display: 'inline-block' }}
                    >
                      Voir sur Miles Republic
                    </Link>
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recherche Meilisearch */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SearchIcon />
                Rechercher une édition manuellement
              </Typography>

              {/* Étape 1: Rechercher événement */}
              <MeilisearchEventSelector
                onEventSelect={handleEventSelect}
                placeholder="Rechercher un événement Miles Republic..."
                helperText="Tapez le nom de l'événement ou de la ville"
              />

              {/* Étape 2: Sélectionner édition */}
              {selectedEvent && (
                <Box sx={{ mt: 3 }}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Événement sélectionné: <strong>{selectedEvent.name}</strong>
                    {selectedEvent.city && ` (${selectedEvent.city})`}
                  </Alert>
                  <EditionSelector
                    eventId={selectedEvent.id}
                    onSelect={handleEditionSelect}
                    selectedEditionId={selectedEdition?.id}
                    label="Sélectionner l'édition correspondante"
                  />
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Justifications */}
          <ProposalJustificationsCard
            justifications={proposal.justification || []}
            confidence={proposal.confidence}
          />
        </Box>

        {/* Sidebar */}
        <Box sx={{ flex: '0 0 300px', minWidth: 280 }}>
          {/* Résumé sélection */}
          {(selectedEvent || selectedEdition) && (
            <Card sx={{ mb: 2, bgcolor: 'background.paper' }}>
              <CardContent>
                <Typography variant="subtitle2" gutterBottom color="primary">
                  Sélection actuelle
                </Typography>
                {selectedEvent && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">Événement</Typography>
                    <Typography variant="body2" fontWeight="medium">{selectedEvent.name}</Typography>
                    {selectedEvent.city && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {selectedEvent.city}
                      </Typography>
                    )}
                  </Box>
                )}
                {selectedEdition && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">Édition</Typography>
                    <Typography variant="body2" fontWeight="medium">{selectedEdition.year}</Typography>
                  </Box>
                )}
                {selectedEvent && (
                  <Button
                    href={selectedEvent.slug
                      ? `https://fr.milesrepublic.com/event/${selectedEvent.slug}-${selectedEvent.id}`
                      : `https://fr.milesrepublic.com/event/${selectedEvent.id}`
                    }
                    target="_blank"
                    size="small"
                    startIcon={<OpenInNewIcon />}
                    sx={{ mt: 1 }}
                    fullWidth
                    variant="outlined"
                  >
                    Voir sur Miles Republic
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Agent info */}
          <AgentCard
            agent={{
              name: proposal.agent?.name || 'Agent inconnu',
              type: proposal.agent?.type || 'EXTRACTOR'
            }}
            createdAt={proposal.createdAt}
          />

          {/* Actions */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Actions
              </Typography>
              <Divider sx={{ my: 1 }} />

              <Button
                fullWidth
                variant="contained"
                color="primary"
                startIcon={<LinkIcon />}
                disabled={!selectedEvent || !selectedEdition || linkMutation.isPending}
                onClick={handleLinkEdition}
                sx={{ mb: 1 }}
              >
                {linkMutation.isPending ? 'Liaison...' : 'Lier à cette édition'}
              </Button>

              <Button
                fullWidth
                variant="outlined"
                color="warning"
                startIcon={<ArchiveIcon />}
                onClick={handleArchive}
                disabled={updateProposalMutation.isPending}
              >
                {updateProposalMutation.isPending ? 'Archivage...' : 'Archiver'}
              </Button>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  )
}

export default UnmatchedResultDetail
