import React, { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Alert,
  Grid,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material'
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Info as InfoIcon,
  Person as PersonIcon,
  Schedule as ScheduleIcon,
  Search as SearchIcon,
  Language as WebsiteIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
} from '@mui/icons-material'
import { useProposal, useUpdateProposal, useProposals, useUnapproveProposal, useKillEvent, useReviveEvent } from '@/hooks/useApi'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useProposalLogic } from '@/hooks/useProposalLogic'
import EventChangesTable from '@/components/proposals/EventChangesTable'
import EditionChangesTable from '@/components/proposals/EditionChangesTable'
import RaceChangesSection from '@/components/proposals/RaceChangesSection'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import ProposalHeader from '@/components/proposals/ProposalHeader'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'
import EventLinksEditor from '@/components/proposals/EventLinksEditor'
import EditionContextInfo from '@/components/proposals/EditionContextInfo'

const ProposalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: proposalData, isLoading } = useProposal(id!)
  const { data: proposalsData } = useProposals({}, 100)
  const updateProposalMutation = useUpdateProposal()
  const unapproveProposalMutation = useUnapproveProposal()
  
  // Hooks MUST be called before any conditional returns
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [killDialogOpen, setKillDialogOpen] = useState(false)
  const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
  const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<number, Record<string, any>>>({})
  
  const killEventMutation = useKillEvent()
  const reviveEventMutation = useReviveEvent()
  
  // Use the proposal logic hook
  const {
    formatValue,
    // formatDateTime, // Unused for now
    getTypeLabel,
    getEventTitle,
    consolidateChanges,
    consolidateRaceChanges,
    formatAgentsList,
    getEditionYear,
    selectedChanges,
    setSelectedChanges
  } = useProposalLogic()
  
  // Extraire la timezone de l'édition (prend en compte les modifications utilisateur)
  const editionTimezone = useMemo(() => {
    // Si l'utilisateur a modifié la timezone, l'utiliser
    if (selectedChanges.timeZone) {
      return selectedChanges.timeZone
    }
    
    if (!proposalData?.data?.changes) return 'Europe/Paris'
    const changes = proposalData.data.changes as any
    // Chercher le timeZone dans les changements
    if (changes.timeZone) {
      if (typeof changes.timeZone === 'string') return changes.timeZone
      if (typeof changes.timeZone === 'object' && 'proposed' in changes.timeZone) return changes.timeZone.proposed
      if (typeof changes.timeZone === 'object' && 'new' in changes.timeZone) return changes.timeZone.new
      if (typeof changes.timeZone === 'object' && 'current' in changes.timeZone) return changes.timeZone.current
    }
    return 'Europe/Paris'
  }, [proposalData, selectedChanges.timeZone])
  
  // Consolidate changes using the hook - always call hooks, handle null gracefully
  const consolidatedChanges = useMemo(() => {
    if (!proposalData?.data) return []
    const changes = consolidateChanges([proposalData.data], proposalData.data.type === 'NEW_EVENT')
    const isEventUpdate = proposalData.data.type === 'EVENT_UPDATE'
    
    // Ne PAS ajouter calendarStatus et timeZone pour les EVENT_UPDATE (ce sont des champs d'Edition)
    if (!isEventUpdate) {
      // Ajouter le champ timeZone comme premier champ pour visibilité
      const hasTimezone = changes.some(c => c.field === 'timeZone')
      if (!hasTimezone) {
        changes.unshift({
          field: 'timeZone',
          options: [{
            proposalId: proposalData.data.id,
            agentName: proposalData.data.agent.name,
            proposedValue: editionTimezone,
            confidence: 1,
            createdAt: proposalData.data.createdAt
          }],
          currentValue: editionTimezone
        })
      }
      
      // Ajouter le champ calendarStatus avec CONFIRMED par défaut
      const hasCalendarStatus = changes.some(c => c.field === 'calendarStatus')
      if (!hasCalendarStatus) {
        // Récupérer la valeur actuelle de la base ou TO_BE_CONFIRMED par défaut
        const calendarStatusChange = (proposalData.data.changes as any)?.calendarStatus
        const currentCalendarStatus = calendarStatusChange?.current || 'TO_BE_CONFIRMED'
        changes.unshift({
          field: 'calendarStatus',
          options: [
            {
              proposalId: proposalData.data.id,
              agentName: 'Système',
              proposedValue: 'CONFIRMED',
              confidence: 1,
              createdAt: proposalData.data.createdAt
            }
          ],
          currentValue: currentCalendarStatus
        })
      }
      
      // Ajouter le champ endDate avec la même valeur que startDate si elle existe
      const hasEndDate = changes.some(c => c.field === 'endDate')
      const startDateChange = changes.find(c => c.field === 'startDate')
      if (!hasEndDate && startDateChange) {
        const proposedStartDate = startDateChange.options[0]?.proposedValue
        const currentEndDate = proposalData.data.changes?.endDate
        
        changes.push({
          field: 'endDate',
          options: [{
            proposalId: proposalData.data.id,
            agentName: proposalData.data.agent.name,
            proposedValue: proposedStartDate,
            confidence: 1,
            createdAt: proposalData.data.createdAt
          }],
          currentValue: currentEndDate || null
        })
      }
    }
    
    // Filtrer calendarStatus et timeZone pour les EVENT_UPDATE
    return isEventUpdate 
      ? changes.filter(c => c.field !== 'calendarStatus' && c.field !== 'timeZone')
      : changes
  }, [proposalData, consolidateChanges, editionTimezone])
  
  // Déterminer si les champs doivent être disabled (si calendarStatus === CANCELED)
  const isEditionCanceled = useMemo(() => {
    // Chercher la valeur de calendarStatus dans l'ordre de priorité :
    // 1. Modifications utilisateur
    // 2. Changements sélectionnés
    // 3. Valeur par défaut proposée
    const calendarStatus = userModifiedChanges['calendarStatus'] || 
                          selectedChanges['calendarStatus'] || 
                          consolidatedChanges.find(c => c.field === 'calendarStatus')?.options[0]?.proposedValue
    return calendarStatus === 'CANCELED'
  }, [selectedChanges, userModifiedChanges, consolidatedChanges])
  
  const consolidatedRaceChanges = useMemo(() => {
    if (!proposalData?.data) return []
    return consolidateRaceChanges([proposalData.data])
  }, [proposalData, consolidateRaceChanges])
  
  // Cascade startDate changes to races
  const consolidatedRaceChangesWithCascade = useMemo(() => {
    // Utiliser la startDate de l'édition (modifiée ou proposée)
    const startDateChange = consolidatedChanges.find(c => c.field === 'startDate')
    const editionStartDate = selectedChanges['startDate'] || startDateChange?.options[0]?.proposedValue
    
    if (!editionStartDate) return consolidatedRaceChanges
    
    return consolidatedRaceChanges.map(raceChange => ({
      ...raceChange,
      fields: Object.entries(raceChange.fields).reduce((acc, [fieldName, fieldData]) => {
        if (fieldName === 'startDate') {
          return {
            ...acc,
            [fieldName]: {
              ...fieldData,
              options: [{
                ...fieldData.options[0],
                proposedValue: editionStartDate
              }]
            }
          }
        }
        return { ...acc, [fieldName]: fieldData }
      }, {})
    }))
  }, [consolidatedRaceChanges, consolidatedChanges, selectedChanges])
  
  // Format date for UI display
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

  // Define callback hooks BEFORE any conditional returns
  const handleApproveRace = React.useCallback(async (raceData: any) => {
    try {
      // Approuver cette course spécifique
      const races = ((proposalData?.data?.changes?.races || []) as unknown) as any[]
      const raceInProposal = races[raceData.raceIndex]
      
      if (raceInProposal) {
        await updateProposalMutation.mutateAsync({
          id: proposalData!.data!.id,
          status: 'APPROVED',
          reviewedBy: 'Utilisateur',
          appliedChanges: { [`races[${raceData.raceIndex}]`]: raceInProposal }
        })
      }
    } catch (error) {
      console.error('Error approving race changes:', error)
    }
  }, [proposalData, updateProposalMutation])

  const handleApproveAllRaces = React.useCallback(async () => {
    try {
      for (const raceChange of consolidatedRaceChanges) {
        await handleApproveRace(raceChange)
      }
    } catch (error) {
      console.error('Error approving all races:', error)
    }
  }, [consolidatedRaceChanges, handleApproveRace])

  const handleRejectAllRaces = React.useCallback(async () => {
    try {
      await updateProposalMutation.mutateAsync({
        id: proposalData!.data!.id,
        status: 'REJECTED',
        reviewedBy: 'Utilisateur'
      })
    } catch (error) {
      console.error('Error rejecting all races:', error)
    }
  }, [proposalData, updateProposalMutation])

  const handleFieldModify = (fieldName: string, newValue: any, reason?: string) => {
    setUserModifiedChanges(prev => ({
      ...prev,
      [fieldName]: newValue
    }))
    
    // Aussi mettre à jour dans selectedChanges
    setSelectedChanges(prev => ({
      ...prev,
      [fieldName]: newValue
    }))
  }
  
  const handleRaceFieldModify = (raceIndex: number, fieldName: string, newValue: any) => {
    setUserModifiedRaceChanges(prev => ({
      ...prev,
      [raceIndex]: {
        ...prev[raceIndex],
        [fieldName]: newValue
      }
    }))
  }
  
  // Ref pour éviter les boucles infinies
  const lastComputedDatesRef = React.useRef<{startDate?: string, endDate?: string}>({})
  
  // Ajuster automatiquement startDate et endDate si des courses sont modifiées
  React.useEffect(() => {
    // Vérifier si l'utilisateur a modifié manuellement les dates de l'édition
    const hasManualStartDate = userModifiedChanges['startDate'] !== undefined
    const hasManualEndDate = userModifiedChanges['endDate'] !== undefined
    
    // Si l'utilisateur a modifié manuellement les deux dates, ne rien faire
    if (hasManualStartDate && hasManualEndDate) {
      return
    }
    
    // Récupérer toutes les startDate des courses (y compris celles modifiées)
    const raceStartDates: Date[] = []
    
    consolidatedRaceChangesWithCascade.forEach(raceChange => {
      const startDateField = raceChange.fields['startDate']
      if (startDateField) {
        const modifiedDate = userModifiedRaceChanges[raceChange.raceIndex]?.['startDate']
        const dateValue = modifiedDate || startDateField.options[0]?.proposedValue
        if (dateValue) {
          raceStartDates.push(new Date(dateValue))
        }
      }
    })
    
    if (raceStartDates.length > 0) {
      // Trouver la date min et max des courses
      const minRaceDate = new Date(Math.min(...raceStartDates.map(d => d.getTime())))
      const maxRaceDate = new Date(Math.max(...raceStartDates.map(d => d.getTime())))
      
      const updates: Record<string, string> = {}
      
      // Ajuster startDate si pas modifiée manuellement
      if (!hasManualStartDate) {
        const newStartDate = minRaceDate.toISOString()
        if (newStartDate !== lastComputedDatesRef.current.startDate) {
          updates.startDate = newStartDate
        }
      }
      
      // Ajuster endDate si pas modifiée manuellement
      if (!hasManualEndDate) {
        const newEndDate = maxRaceDate.toISOString()
        if (newEndDate !== lastComputedDatesRef.current.endDate) {
          updates.endDate = newEndDate
        }
      }
      
      if (Object.keys(updates).length > 0) {
        lastComputedDatesRef.current = { ...lastComputedDatesRef.current, ...updates }
        setSelectedChanges(prev => ({
          ...prev,
          ...updates
        }))
      }
    }
  }, [consolidatedRaceChangesWithCascade, userModifiedRaceChanges, userModifiedChanges])
  
  const handleApproveAll = React.useCallback(async () => {
    try {
      // Construire les changements appliqués en mergant les changements avec les valeurs sélectionnées
      const changesToApprove = { ...proposalData!.data!.changes }
      Object.entries(selectedChanges).forEach(([field, selectedValue]) => {
        if (changesToApprove[field]) {
          changesToApprove[field] = selectedValue
        }
      })
      
      await updateProposalMutation.mutateAsync({
        id: proposalData!.data!.id,
        status: 'APPROVED',
        reviewedBy: 'Utilisateur',
        appliedChanges: changesToApprove,
        userModifiedChanges: Object.keys(userModifiedChanges).length > 0 ? userModifiedChanges : undefined,
        modificationReason: 'Modifications manuelles appliquées',
        modifiedBy: 'Utilisateur'
      })
    } catch (error) {
      console.error('Error approving proposal:', error)
    }
  }, [proposalData, selectedChanges, userModifiedChanges, updateProposalMutation])

  const handleRejectAll = React.useCallback(async () => {
    try {
      await updateProposalMutation.mutateAsync({
        id: proposalData!.data!.id,
        status: 'REJECTED',
        reviewedBy: 'Utilisateur'
      })
    } catch (error) {
      console.error('Error rejecting proposal:', error)
    }
  }, [proposalData, updateProposalMutation])

  const handleArchive = React.useCallback(async () => {
    try {
      await updateProposalMutation.mutateAsync({
        id: proposalData!.data!.id,
        status: 'ARCHIVED',
        reviewedBy: 'Utilisateur'
      })
      setArchiveDialogOpen(false)
    } catch (error) {
      console.error('Error archiving proposal:', error)
    }
  }, [proposalData, updateProposalMutation])

  const handleUnapprove = React.useCallback(async () => {
    try {
      await unapproveProposalMutation.mutateAsync(proposalData!.data!.id)
    } catch (error) {
      console.error('Error unapproving proposal:', error)
    }
  }, [proposalData, unapproveProposalMutation])

  const handleKillEvent = React.useCallback(async () => {
    try {
      const eventId = proposalData?.data?.eventId
      if (!eventId) {
        console.error('No eventId found')
        return
      }
      await killEventMutation.mutateAsync(eventId)
      setKillDialogOpen(false)
    } catch (error) {
      console.error('Error killing event:', error)
    }
  }, [proposalData, killEventMutation])

  const handleReviveEvent = React.useCallback(async () => {
    try {
      const eventId = proposalData?.data?.eventId
      if (!eventId) {
        console.error('No eventId found')
        return
      }
      await reviveEventMutation.mutateAsync(eventId)
    } catch (error) {
      console.error('Error reviving event:', error)
    }
  }, [proposalData, reviveEventMutation])

  if (isLoading) return <LinearProgress />

  if (!proposalData?.data) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Proposition non trouvée</Alert>
        </CardContent>
      </Card>
    )
  }
  
  // At this point, proposal is guaranteed to exist
  const safeProposal = proposalData.data as any
  const proposal = safeProposal
  const isNewEvent = proposal.type === 'NEW_EVENT'
  const isEventUpdate = proposal.type === 'EVENT_UPDATE'
  
  // Extraire eventId et eventStatus
  const eventId = proposal?.eventId
  const eventStatus = proposal?.eventStatus
  const isEventDead = eventStatus === 'DEAD'
  
  // Navigation logic
  const allProposals = proposalsData?.data || []
  const currentIndex = allProposals.findIndex(p => p.id === id)
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < allProposals.length - 1
  const previousId = hasPrevious ? allProposals[currentIndex - 1]?.id : null
  const nextId = hasNext ? allProposals[currentIndex + 1]?.id : null
  
  const handlePrevious = () => {
    if (previousId) navigate(`/proposals/${previousId}`)
  }
  
  const handleNext = () => {
    if (nextId) navigate(`/proposals/${nextId}`)
  }
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'warning'
      case 'APPROVED': return 'success'
      case 'REJECTED': return 'error'
      case 'ARCHIVED': return 'default'
      default: return 'default'
    }
  }



  // TODO: Helper functions commented out due to missing icon dependencies
  /*
  const formatFieldName = (fieldName: string): string => {
    const fieldTranslations: Record<string, string> = {
      // Distances
      swimDistance: 'Distance natation (km)',
      walkDistance: 'Distance marche (km)',
      bikeDistance: 'Distance vélo (km)',
      runDistance: 'Distance course (km)',
      runDistance2: 'Distance course 2 (km)',
      swimRunDistance: 'Distance swim&run (km)',
      bikeRunDistance: 'Distance bike&run (km)',
      
      // Elevations
      runPositiveElevation: 'Dénivelé + course (m)',
      runNegativeElevation: 'Dénivelé - course (m)',
      bikePositiveElevation: 'Dénivelé + vélo (m)',
      bikeNegativeElevation: 'Dénivelé - vélo (m)',
      walkPositiveElevation: 'Dénivelé + marche (m)',
      walkNegativeElevation: 'Dénivelé - marche (m)',
      
      // Classification
      distanceCategory: 'Catégorie',
      
      // Pricing
      price: 'Prix (€)',
      priceType: 'Type de prix',
      paymentCollectionType: 'Type de paiement',
      
      // Dates
      startDate: 'Date de début',
      endDate: 'Date de fin',
      registrationOpeningDate: 'Ouverture inscriptions',
      registrationClosingDate: 'Fermeture inscriptions',
      
      // Team
      maxTeamSize: 'Taille max équipe',
      minTeamSize: 'Taille min équipe',
      
      // Form requirements (handled by Form system - not displayed)
      
      // License
      licenseNumberType: 'Type de licence',
      adultJustificativeOptions: 'Justificatifs adultes',
      minorJustificativeOptions: 'Justificatifs mineurs',
      
      // Stock (handled by Form system - not displayed)
      
      // Status
      isActive: 'Actif',
      isArchived: 'Archivé',
      resaleEnabled: 'Revente autorisée',
      
      // External
      externalFunnelURL: 'URL tunnel externe',
      medusaProductId: 'ID produit Medusa',
      raceVariantStoreId: 'ID variant boutique',
      
      // Categories
      categoryLevel1: 'Catégorie niveau 1',
      categoryLevel2: 'Catégorie niveau 2',
      
      // Event fields
      country: 'Pays',
      countrySubdivisionNameLevel1: 'Région',
      countrySubdivisionNameLevel2: 'Département',
      fullAddress: 'Adresse complète',
      websiteUrl: 'Site web',
      facebookUrl: 'Facebook',
      twitterUrl: 'Twitter',
      instagramUrl: 'Instagram',
      coverImage: 'Image de couverture',
      isPrivate: 'Privé',
      isFeatured: 'Mis en avant',
      isRecommended: 'Recommandé',
      
      // Edition fields
      calendarStatus: 'Statut calendrier',
      clientStatus: 'Statut client',
      currency: 'Devise',
      customerType: 'Type client',
      medusaVersion: 'Version Medusa',
      
      // Others
      federationId: 'ID fédération',
      dataSource: 'Source des données',
      timeZone: 'Fuseau horaire'
    }
    
    return fieldTranslations[fieldName] || fieldName
  }
  
  // Helper function to get appropriate icon for field
  const getFieldIcon = (fieldName: string) => {
    if (fieldName.includes('Distance') || fieldName === 'distance') return <DistanceIcon fontSize="small" />
    if (fieldName.includes('Elevation')) return <ElevationIcon fontSize="small" />
    if (fieldName.includes('Price') || fieldName === 'price') return <PriceIcon fontSize="small" />
    if (fieldName.includes('Date')) return <ScheduleIcon fontSize="small" />
    if (fieldName.includes('Team')) return <GroupsIcon fontSize="small" />
    if (fieldName.includes('registration')) return <EventIcon fontSize="small" />
    return <InfoIcon fontSize="small" />
  }
  
  // Helper function to format field values
  const formatFieldValue = (value: any, fieldName: string): string => {
    if (value === null || value === undefined) return '-'
    
    // Handle booleans
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
    
    // Handle dates
    if (typeof value === 'string' && value.includes('T')) {
      return formatDateTime(value)
    }
    
    // Handle distances (convert to readable format)
    if (fieldName.includes('Distance') && typeof value === 'number') {
      return value === 0 ? '-' : `${value} km`
    }
    
    // Handle elevations
    if (fieldName.includes('Elevation') && typeof value === 'number') {
      return `${value} m`
    }
    
    // Handle prices
    if ((fieldName.includes('price') || fieldName === 'price') && typeof value === 'number') {
      return `${value}€`
    }
    
    return String(value)
  }
  */

  // TODO: Functions removed to fix build errors:
  // - renderFieldComparison: for rendering individual field comparisons
  // - handleApproveSubProposal/handleRejectSubProposal: for sub-proposal actions  
  // - renderJustificationSource: for rendering justification sources

  return (
    <Box>
      {/* Navigation et actions */}
      <ProposalNavigation
        navigation={{
          hasPrevious,
          hasNext,
          onPrevious: handlePrevious,
          onNext: handleNext
        }}
        showArchiveButton={safeProposal.status === 'PENDING'}
        onArchive={() => setArchiveDialogOpen(true)}
        showUnapproveButton={safeProposal.status === 'APPROVED'}
        onUnapprove={handleUnapprove}
        disabled={updateProposalMutation.isPending || unapproveProposalMutation.isPending}
      />
      
      {/* En-tête */}
      <ProposalHeader
        title={isNewEvent ? 'Nouvel événement proposé' : 'Proposition de modification'}
        eventTitle={!isNewEvent ? getEventTitle(safeProposal, isNewEvent) : undefined}
        editionYear={!isNewEvent && !isEventUpdate ? getEditionYear(safeProposal) : undefined}
        chips={[
          {
            label: getTypeLabel(safeProposal.type),
            variant: 'outlined'
          },
          {
            label: safeProposal.status === 'PENDING' ? 'En attente' : 
                   safeProposal.status === 'APPROVED' ? 'Approuvée' : 
                   safeProposal.status === 'REJECTED' ? 'Rejetée' : 'Archivée',
            color: getStatusColor(safeProposal.status)
          },
          {
            label: `${Math.round((safeProposal.confidence || 0) * 100)}% confiance`,
            color: (safeProposal.confidence || 0) > 0.8 ? 'success' : (safeProposal.confidence || 0) > 0.6 ? 'warning' : 'error'
          }
        ]}
      />

      <Grid container spacing={3}>
        {/* Comparaison des données - colonne principale */}
        <Grid item xs={12} md={8}>
          {isNewEvent && (
            <Alert 
              severity="info" 
              sx={{ mb: 2 }}
              action={
                <Button size="small" onClick={() => setSearchDialogOpen(true)}>
                  Rechercher
                </Button>
              }
            >
              Cet événement n'existe pas dans la base. Vous pouvez rechercher un événement similaire ou créer ce nouvel événement.
            </Alert>
          )}
          
          {isEventUpdate ? (
            <EventChangesTable
              title="Modification de l'événement"
              changes={consolidatedChanges}
              isNewEvent={false}
              selectedChanges={selectedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              onFieldApprove={(fieldName: string, value: any) => {
                setSelectedChanges({ ...selectedChanges, [fieldName]: value })
              }}
              onFieldReject={(fieldName: string) => {
                const newSelected = { ...selectedChanges }
                delete newSelected[fieldName]
                setSelectedChanges(newSelected)
              }}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              disabled={safeProposal.status !== 'PENDING' || isEventDead}
              actions={safeProposal.status === 'PENDING' ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<ApproveIcon />}
                    onClick={handleApproveAll}
                    disabled={updateProposalMutation.isPending || isEventDead}
                  >
                    Tout approuver
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<RejectIcon />}
                    onClick={handleRejectAll}
                    disabled={updateProposalMutation.isPending || isEventDead}
                  >
                    Tout rejeter
                  </Button>
                  {!isNewEvent && eventId && (
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      onClick={() => setKillDialogOpen(true)}
                      disabled={killEventMutation.isPending || isEventDead}
                    >
                      Tuer l'événement
                    </Button>
                  )}
                </Box>
              ) : isEventDead && !isNewEvent && eventId ? (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    onClick={handleReviveEvent}
                    disabled={reviveEventMutation.isPending}
                  >
                    Ressusciter l'événement
                  </Button>
                </Box>
              ) : undefined}
            />
          ) : (
            <EditionChangesTable
              title={isNewEvent ? 'Données du nouvel événement' : 'Modification de l\'édition'}
              changes={consolidatedChanges}
              isNewEvent={isNewEvent}
              selectedChanges={selectedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              onFieldApprove={(fieldName: string, value: any) => {
                setSelectedChanges({ ...selectedChanges, [fieldName]: value })
              }}
              onFieldReject={(fieldName: string) => {
                const newSelected = { ...selectedChanges }
                delete newSelected[fieldName]
                setSelectedChanges(newSelected)
              }}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              disabled={safeProposal.status !== 'PENDING' || isEventDead}
              isEditionCanceled={isEditionCanceled || isEventDead}
              actions={safeProposal.status === 'PENDING' ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<ApproveIcon />}
                    onClick={handleApproveAll}
                    disabled={updateProposalMutation.isPending || isEventDead}
                  >
                    Tout approuver
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<RejectIcon />}
                    onClick={handleRejectAll}
                    disabled={updateProposalMutation.isPending || isEventDead}
                  >
                    Tout rejeter
                  </Button>
                  {!isNewEvent && eventId && (
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      onClick={() => setKillDialogOpen(true)}
                      disabled={killEventMutation.isPending || isEventDead}
                    >
                      Tuer l'événement
                    </Button>
                  )}
                </Box>
              ) : isEventDead && !isNewEvent && eventId ? (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    onClick={handleReviveEvent}
                    disabled={reviveEventMutation.isPending}
                  >
                    Ressusciter l'événement
                  </Button>
                </Box>
              ) : undefined}
            />
          )}
          
          <RaceChangesSection
            raceChanges={consolidatedRaceChangesWithCascade}
            formatValue={formatValue}
            timezone={editionTimezone}
            onRaceApprove={handleApproveRace}
            onApproveAll={safeProposal.status === 'PENDING' ? handleApproveAllRaces : undefined}
            onRejectAll={safeProposal.status === 'PENDING' ? handleRejectAllRaces : undefined}
            onFieldModify={handleRaceFieldModify}
            userModifiedRaceChanges={userModifiedRaceChanges}
            disabled={safeProposal.status !== 'PENDING' || updateProposalMutation.isPending || isEventDead}
            isEditionCanceled={isEditionCanceled || isEventDead}
          />
          
          {/* Sources des dates extraites */}
          <DateSourcesSection justifications={safeProposal.justification || []} />
        </Grid>

        {/* Informations */}
        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <InfoIcon color="primary" />
                Informations
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <PersonIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">Agent responsable</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{safeProposal.agent.name}</Typography>
                </Box>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ScheduleIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">Date de création</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatDate(safeProposal.createdAt)}</Typography>
                </Box>
              </Box>
              
              {safeProposal.reviewedAt && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ApproveIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">Révisé le</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatDate(safeProposal.reviewedAt)} par {safeProposal.reviewedBy || 'Inconnu'}</Typography>
                  </Box>
                </Box>
              )}
              
              {(safeProposal.eventId || safeProposal.editionId) && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  <InfoIcon sx={{ fontSize: '1rem', color: 'text.secondary', mt: 0.25 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">Événement concerné</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {getEventTitle(safeProposal, false)}
                      {getEditionYear(safeProposal) && ` - Édition ${getEditionYear(safeProposal)}`}
                    </Typography>
                  </Box>
                </Box>
              )}
              
              {safeProposal.relatedProposals && safeProposal.relatedProposals.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Propositions liées ({safeProposal.relatedProposals.length})</Typography>
                  {safeProposal.relatedProposals.slice(0, 3).map((rp: any) => (
                    <Chip 
                      key={rp.id}
                      label={rp.agent.name}
                      size="small"
                      sx={{ mr: 0.5, mb: 0.5 }}
                      clickable
                      component={Link}
                      to={`/proposals/${rp.id}`}
                    />
                  ))}
                  {safeProposal.relatedProposals.length > 3 && (
                    <Chip 
                      label={`+${safeProposal.relatedProposals.length - 3} autres`}
                      size="small"
                      variant="outlined"
                      sx={{ mr: 0.5, mb: 0.5 }}
                      clickable
                      onClick={() => navigate('/proposals')}
                    />
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
          
          {/* URLs de l'événement */}
          <EventLinksEditor
            websiteUrl={safeProposal.changes.websiteUrl}
            facebookUrl={safeProposal.changes.facebookUrl}
            instagramUrl={safeProposal.changes.instagramUrl}
            onSave={(links) => {
              handleFieldModify('websiteUrl', links.websiteUrl)
              handleFieldModify('facebookUrl', links.facebookUrl)
              handleFieldModify('instagramUrl', links.instagramUrl)
            }}
            editable={safeProposal.status === 'PENDING'}
          />
          
          {/* Informations contextuelles de l'édition */}
          <EditionContextInfo
            currentCalendarStatus={
              userModifiedChanges['calendarStatus'] || 
              selectedChanges['calendarStatus'] || 
              (typeof safeProposal.changes.calendarStatus === 'string' 
                ? safeProposal.changes.calendarStatus 
                : (safeProposal.changes.calendarStatus as any)?.current || (safeProposal.changes.calendarStatus as any)?.proposed)
            }
            currentEditionYear={getEditionYear(safeProposal) ? parseInt(getEditionYear(safeProposal)!) : undefined}
            previousEditionYear={safeProposal.previousEditionYear}
            previousCalendarStatus={safeProposal.previousEditionCalendarStatus}
            previousEditionStartDate={safeProposal.previousEditionStartDate}
          />
        </Grid>
      </Grid>

      {/* Dialog de recherche pour nouveaux événements */}
      <Dialog 
        open={searchDialogOpen} 
        onClose={() => setSearchDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Rechercher un événement similaire
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Rechercher un événement"
            placeholder="Nom de l'événement, ville..."
            sx={{ mt: 1, mb: 2 }}
            InputProps={{
              endAdornment: (
                <Box sx={{ p: 1 }}>
                  <SearchIcon />
                </Box>
              )
            }}
          />
          <Typography variant="body2" color="textSecondary">
            Recherchez dans la base de données pour vérifier qu'un événement similaire n'existe pas déjà.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchDialogOpen(false)}>
            Annuler
          </Button>
          <Button variant="contained">
            Créer nouvel événement
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog d'archivage */}
      <Dialog
        open={archiveDialogOpen}
        onClose={() => setArchiveDialogOpen(false)}
      >
        <DialogTitle>Archiver la proposition</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir archiver cette proposition ? Elle ne sera plus visible dans les propositions actives.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveDialogOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleArchive} color="warning">
            Archiver
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de confirmation pour tuer l'événement */}
      <Dialog open={killDialogOpen} onClose={() => setKillDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tuer l'événement</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 2 }}>
            Êtes-vous sûr de vouloir tuer cet événement ? Cette action :
          </Typography>
          <Typography component="ul" sx={{ mt: 2, pl: 2 }}>
            <li>Marque l'événement comme DEAD dans la base de données</li>
            <li>Rend tous les tableaux non éditables</li>
            <li>Empêche toute approbation de proposition</li>
            <li>Peut être annulée avec le bouton "Ressusciter l'événement"</li>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKillDialogOpen(false)}>Annuler</Button>
          <Button
            onClick={handleKillEvent}
            color="error"
            variant="contained"
            disabled={killEventMutation.isPending}
          >
            Tuer l'événement
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default ProposalDetail
