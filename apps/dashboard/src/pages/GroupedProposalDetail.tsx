import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  LinearProgress,
  Alert,
  Card,
  CardContent,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography
} from '@mui/material'
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Language as WebsiteIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon
} from '@mui/icons-material'
import ProposalHeader from '@/components/proposals/ProposalHeader'
import ChangesTable from '@/components/proposals/ChangesTable'
import RaceChangesSection from '@/components/proposals/RaceChangesSection'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentInfoSection from '@/components/proposals/AgentInfoSection'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'
import { useProposalLogic } from '@/hooks/useProposalLogic'
import { useProposals, useUpdateProposal, useBulkArchiveProposals } from '@/hooks/useApi'

const GroupedProposalDetail: React.FC = () => {
  const { groupKey } = useParams<{ groupKey: string }>()
  const navigate = useNavigate()
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  
  const { data: proposalsData, isLoading } = useProposals({})
  const updateProposalMutation = useUpdateProposal()
  const bulkArchiveMutation = useBulkArchiveProposals()
  
  const {
    selectedChanges,
    setSelectedChanges,
    formatValue,
    formatAgentsList,
    getEventTitle,
    getEditionYear,
    consolidateChanges,
    consolidateRaceChanges
  } = useProposalLogic()
  
  // Gérer la sélection d'une valeur dans le dropdown (pas d'approbation)
  const handleSelectField = (fieldName: string, selectedValue: any) => {
    setSelectedChanges(prev => ({ ...prev, [fieldName]: selectedValue }))
  }
  
  // Gérer l'approbation du champ (bouton "Approuver")
  const handleApproveField = async (fieldName: string) => {
    const selectedValue = selectedChanges[fieldName]
    if (selectedValue === undefined) return
    
    // Trouver le changement correspondant
    const change = consolidatedChanges.find(c => c.field === fieldName)
    if (!change) return
    
    try {
      // Pour chaque option de ce champ
      for (const option of change.options) {
        const optionValueStr = JSON.stringify(option.proposedValue)
        const selectedValueStr = JSON.stringify(selectedValue)
        
        // Approuver les propositions qui correspondent à la valeur sélectionnée
        if (optionValueStr === selectedValueStr) {
          await updateProposalMutation.mutateAsync({
            id: option.proposalId,
            status: 'APPROVED',
            reviewedBy: 'Utilisateur',
            appliedChanges: { [fieldName]: selectedValue }
          })
        } else {
          // Rejeter les autres propositions du même champ
          await updateProposalMutation.mutateAsync({
            id: option.proposalId,
            status: 'REJECTED',
            reviewedBy: 'Utilisateur'
          })
        }
      }
    } catch (error) {
      console.error('Error approving/rejecting field:', error)
    }
  }

  // Déterminer si c'est un nouvel événement
  const isNewEvent = Boolean(groupKey?.startsWith('new-event-'))

  // Navigation logic
  const allGroupKeys = useMemo(() => {
    if (!proposalsData?.data) return []
    const keys = new Set<string>()
    proposalsData.data.forEach(proposal => {
      if (proposal.type === 'NEW_EVENT') {
        keys.add(`new-event-${proposal.id}`)
      } else {
        keys.add(`${proposal.eventId || 'unknown'}-${proposal.editionId || 'unknown'}`)
      }
    })
    return Array.from(keys)
  }, [proposalsData?.data])

  const currentIndex = allGroupKeys.indexOf(groupKey || '')
  const canGoToPrev = currentIndex > 0
  const canGoToNext = currentIndex >= 0 && currentIndex < allGroupKeys.length - 1

  const navigateToGroup = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex >= 0 && newIndex < allGroupKeys.length) {
      navigate(`/proposals/group/${allGroupKeys[newIndex]}`)
    }
  }

  // Récupérer les propositions du groupe
  const groupProposals = useMemo(() => {
    if (!proposalsData?.data || !groupKey) return []
    
    return proposalsData.data.filter(proposal => {
      if (groupKey.startsWith('new-event-')) {
        return groupKey === `new-event-${proposal.id}`
      } else {
        const proposalGroupKey = `${proposal.eventId || 'unknown'}-${proposal.editionId || 'unknown'}`
        return proposalGroupKey === groupKey
      }
    })
  }, [proposalsData?.data, groupKey])

  // Consolider les changements en utilisant le hook
  const consolidatedChanges = useMemo(() => 
    consolidateChanges(groupProposals, isNewEvent),
    [groupProposals, isNewEvent, consolidateChanges]
  )
  
  const consolidatedRaceChanges = useMemo(() => 
    consolidateRaceChanges(groupProposals),
    [groupProposals, consolidateRaceChanges]
  )
  
  // Cascade startDate changes to races
  // Si l'utilisateur change la date de l'édition (startDate), les races doivent être mises à jour aussi
  const consolidatedRaceChangesWithCascade = useMemo(() => {
    if (!selectedChanges['startDate']) return consolidatedRaceChanges
    
    // Vérifier si la date de l'édition a changé
    const newStartDate = selectedChanges['startDate']
    
    return consolidatedRaceChanges.map(raceChange => ({
      ...raceChange,
      fields: Object.entries(raceChange.fields).reduce((acc, [fieldName, fieldData]) => {
        if (fieldName === 'startDate') {
          // Mettre à jour le startDate de la course avec la nouvelle date de l'édition
          return {
            ...acc,
            [fieldName]: {
              ...fieldData,
              options: [{
                ...fieldData.options[0],
                proposedValue: newStartDate
              }]
            }
          }
        }
        return { ...acc, [fieldName]: fieldData }
      }, {})
    }))
  }, [consolidatedRaceChanges, selectedChanges])

  // Auto-sélection des meilleures valeurs au chargement
  useEffect(() => {
    const newSelections: Record<string, any> = {}
    
    consolidatedChanges.forEach(change => {
      if (!selectedChanges[change.field] && change.options.length > 0) {
        // Prendre la première option (déjà triée par consensus/confiance dans le hook)
        newSelections[change.field] = change.options[0].proposedValue
      }
    })
    
    if (Object.keys(newSelections).length > 0) {
      setSelectedChanges(prev => ({ ...prev, ...newSelections }))
    }
  }, [consolidatedChanges, selectedChanges, setSelectedChanges])

  const firstProposal = groupProposals[0]

  const handleApproveRace = async (raceData: any) => {
    try {
      // Récupérer toutes les propositions concernées par cette course
      const raceProposalIds = raceData.proposalIds
      const concernedProposals = groupProposals.filter(p => raceProposalIds.includes(p.id))
      
      for (const proposal of concernedProposals) {
        // Trouver les changements de cette course dans la proposition
        const racesData = proposal.changes.races
        if (racesData && Array.isArray(racesData)) {
          const raceInProposal = racesData.find((race: any) => 
            (race.name || `Course ${racesData.indexOf(race) + 1}`) === raceData.raceName
          )
          
          if (raceInProposal) {
            await updateProposalMutation.mutateAsync({
              id: proposal.id,
              status: 'APPROVED',
              reviewedBy: 'Utilisateur',
              appliedChanges: { [`races[${raceData.raceIndex}]`]: raceInProposal }
            })
          }
        }
      }
    } catch (error) {
      console.error('Error approving race changes:', error)
    }
  }

  const handleApproveAllRaces = async () => {
    try {
      for (const raceChange of consolidatedRaceChanges) {
        await handleApproveRace(raceChange)
      }
    } catch (error) {
      console.error('Error approving all races:', error)
    }
  }

  const handleRejectAllRaces = async () => {
    try {
      // Rejeter toutes les propositions qui ont des changements de courses
      const raceProposalIds = consolidatedRaceChanges.flatMap(race => race.proposalIds)
      const uniqueProposalIds = Array.from(new Set(raceProposalIds))
      const concernedProposals = groupProposals.filter(p => uniqueProposalIds.includes(p.id))
      
      for (const proposal of concernedProposals) {
        await updateProposalMutation.mutateAsync({
          id: proposal.id,
          status: 'REJECTED',
          reviewedBy: 'Utilisateur'
        })
      }
    } catch (error) {
      console.error('Error rejecting all races:', error)
    }
  }

  const handleApproveAll = async () => {
    try {
      // Pour chaque champ avec une valeur sélectionnée, approuver/rejeter les propositions correspondantes
      for (const change of consolidatedChanges) {
        const fieldName = change.field
        const selectedValue = selectedChanges[fieldName]
        
        if (selectedValue === undefined) continue
        
        // Pour chaque option de ce champ
        for (const option of change.options) {
          const optionValueStr = JSON.stringify(option.proposedValue)
          const selectedValueStr = JSON.stringify(selectedValue)
          
          // Approuver les propositions qui correspondent à la valeur sélectionnée
          if (optionValueStr === selectedValueStr) {
            await updateProposalMutation.mutateAsync({
              id: option.proposalId,
              status: 'APPROVED',
              reviewedBy: 'Utilisateur',
              appliedChanges: { [fieldName]: selectedValue }
            })
          } else {
            // Rejeter les autres propositions du même champ
            await updateProposalMutation.mutateAsync({
              id: option.proposalId,
              status: 'REJECTED',
              reviewedBy: 'Utilisateur'
            })
          }
        }
      }
    } catch (error) {
      console.error('Error approving proposals:', error)
    }
  }

  const handleRejectAll = async () => {
    try {
      for (const proposal of groupProposals) {
        await updateProposalMutation.mutateAsync({
          id: proposal.id,
          status: 'REJECTED',
          reviewedBy: 'Utilisateur'
        })
      }
    } catch (error) {
      console.error('Error rejecting proposals:', error)
    }
  }

  const handleArchive = async () => {
    try {
      const proposalIds = groupProposals.map(p => p.id)
      await bulkArchiveMutation.mutateAsync({
        proposalIds,
        reviewedBy: 'Utilisateur',
        archiveReason: archiveReason.trim() || undefined
      })
      setArchiveDialogOpen(false)
      setArchiveReason('')
    } catch (error) {
      console.error('Error archiving proposals:', error)
    }
  }



  // Calculs pour l'interface
  // Calculer la confiance moyenne en ignorant les propositions sans confiance définie
  const proposalsWithValidConfidence = groupProposals.filter(p => p.confidence !== undefined && p.confidence !== null && p.confidence > 0)
  const averageConfidence = proposalsWithValidConfidence.length > 0
    ? proposalsWithValidConfidence.reduce((sum, p) => sum + p.confidence!, 0) / proposalsWithValidConfidence.length
    : 0
  const allPending = groupProposals.every(p => p.status === 'PENDING')

  if (isLoading) return <LinearProgress />

  if (groupProposals.length === 0) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Groupe de propositions introuvable</Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Box>
      <ProposalNavigation
        navigation={{
          hasPrevious: canGoToPrev,
          hasNext: canGoToNext,
          onPrevious: () => navigateToGroup('prev'),
          onNext: () => navigateToGroup('next')
        }}
        showArchiveButton={allPending}
        onArchive={() => setArchiveDialogOpen(true)}
        disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending}
        showBackButton={true}
      />
      
      <ProposalHeader
        title={isNewEvent ? 'Nouvel événement proposé' : 'Proposition de modification'}
        eventTitle={!isNewEvent ? getEventTitle(firstProposal, isNewEvent) : undefined}
        editionYear={!isNewEvent && firstProposal ? getEditionYear(firstProposal) : undefined}
        chips={[
          {
            label: `${groupProposals.length} propositions groupées`,
            variant: 'outlined',
            show: groupProposals.length > 1
          },
          {
            label: allPending ? 'En attente' : 'Traité',
            color: allPending ? 'warning' : 'default'
          },
          {
            label: `${Math.round((averageConfidence || 0) * 100)}% confiance`,
            color: (averageConfidence || 0) > 0.8 ? 'success' : (averageConfidence || 0) > 0.6 ? 'warning' : 'error'
          }
        ]}
      />

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <ChangesTable
            title={isNewEvent ? 'Données du nouvel événement' : 'Modification de l\'édition'}
            changes={consolidatedChanges}
            isNewEvent={isNewEvent}
            selectedChanges={selectedChanges}
            onFieldSelect={handleSelectField}
            onFieldApprove={handleApproveField}
            formatValue={formatValue}
            formatAgentsList={formatAgentsList}
            disabled={!allPending || updateProposalMutation.isPending || bulkArchiveMutation.isPending}
            actions={allPending ? (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  startIcon={<ApproveIcon />}
                  onClick={handleApproveAll}
                  disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending}
                >
                  Tout approuver
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<RejectIcon />}
                  onClick={handleRejectAll}
                  disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending}
                >
                  Tout rejeter
                </Button>
              </Box>
            ) : undefined}
          />
          
          <RaceChangesSection
            raceChanges={consolidatedRaceChangesWithCascade}
            formatValue={formatValue}
            onRaceApprove={handleApproveRace}
            onApproveAll={allPending ? handleApproveAllRaces : undefined}
            onRejectAll={allPending ? handleRejectAllRaces : undefined}
            disabled={!allPending || updateProposalMutation.isPending}
          />
          
          {/* Sources des dates extraites */}
          <DateSourcesSection justifications={groupProposals.flatMap(p => p.justification || [])} />
        </Grid>
        
        <Grid item xs={12} md={4}>
          <AgentInfoSection proposals={groupProposals.map(p => ({ ...p, confidence: p.confidence || 0 }))} />
          
          {/* URLs de l'événement */}
          {firstProposal && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WebsiteIcon color="primary" />
                  Liens de l'événement
                </Typography>
                
                {!firstProposal.changes.websiteUrl && !firstProposal.changes.facebookUrl && !firstProposal.changes.instagramUrl ? (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    Aucun lien disponible
                  </Typography>
                ) : (
                  <>
                    {firstProposal.changes.websiteUrl && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <WebsiteIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Site web</Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          wordBreak: 'break-all',
                          '& a': { color: 'primary.main', textDecoration: 'none' }
                        }}
                      >
                        <a 
                          href={typeof firstProposal.changes.websiteUrl === 'string' 
                            ? firstProposal.changes.websiteUrl 
                            : (firstProposal.changes.websiteUrl as any)?.new || (firstProposal.changes.websiteUrl as any)?.proposed}
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          {typeof firstProposal.changes.websiteUrl === 'string' 
                            ? firstProposal.changes.websiteUrl 
                            : (firstProposal.changes.websiteUrl as any)?.new || (firstProposal.changes.websiteUrl as any)?.proposed}
                        </a>
                      </Typography>
                    </Box>
                  </Box>
                )}
                
                {firstProposal.changes.facebookUrl && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <FacebookIcon sx={{ fontSize: '1rem', color: '#1877f2' }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Facebook</Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          wordBreak: 'break-all',
                          '& a': { color: 'primary.main', textDecoration: 'none' }
                        }}
                      >
                        <a 
                          href={typeof firstProposal.changes.facebookUrl === 'string' 
                            ? firstProposal.changes.facebookUrl 
                            : (firstProposal.changes.facebookUrl as any)?.new || (firstProposal.changes.facebookUrl as any)?.proposed}
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          {typeof firstProposal.changes.facebookUrl === 'string' 
                            ? firstProposal.changes.facebookUrl 
                            : (firstProposal.changes.facebookUrl as any)?.new || (firstProposal.changes.facebookUrl as any)?.proposed}
                        </a>
                      </Typography>
                    </Box>
                  </Box>
                )}
                
                {firstProposal.changes.instagramUrl && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <InstagramIcon sx={{ fontSize: '1rem', color: '#E4405F' }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Instagram</Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          wordBreak: 'break-all',
                          '& a': { color: 'primary.main', textDecoration: 'none' }
                        }}
                      >
                        <a 
                          href={typeof firstProposal.changes.instagramUrl === 'string' 
                            ? firstProposal.changes.instagramUrl 
                            : (firstProposal.changes.instagramUrl as any)?.new || (firstProposal.changes.instagramUrl as any)?.proposed}
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          {typeof firstProposal.changes.instagramUrl === 'string' 
                            ? firstProposal.changes.instagramUrl 
                            : (firstProposal.changes.instagramUrl as any)?.new || (firstProposal.changes.instagramUrl as any)?.proposed}
                        </a>
                      </Typography>
                    </Box>
                  </Box>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Dialog d'archivage */}
      <Dialog open={archiveDialogOpen} onClose={() => setArchiveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Archiver le groupe de propositions</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Raison de l'archivage"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveDialogOpen(false)}>Annuler</Button>
          <Button
            onClick={handleArchive}
            color="warning"
            variant="contained"
            disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || !archiveReason.trim()}
          >
            Archiver
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default GroupedProposalDetail
