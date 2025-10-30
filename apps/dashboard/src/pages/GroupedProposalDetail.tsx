import React, { useState, useMemo, useEffect, useRef } from 'react'
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
import EventChangesTable from '@/components/proposals/EventChangesTable'
import EditionChangesTable from '@/components/proposals/EditionChangesTable'
import RaceChangesSection from '@/components/proposals/RaceChangesSection'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentInfoSection from '@/components/proposals/AgentInfoSection'
import ProposalNavigation from '@/components/proposals/ProposalNavigation'
import EventLinksEditor from '@/components/proposals/EventLinksEditor'
import EditionContextInfo from '@/components/proposals/EditionContextInfo'
import { useProposalLogic } from '@/hooks/useProposalLogic'
import { useProposals, useUpdateProposal, useBulkArchiveProposals, useUnapproveProposal, useKillEvent, useReviveEvent } from '@/hooks/useApi'

const GroupedProposalDetail: React.FC = () => {
  const { groupKey } = useParams<{ groupKey: string }>()
  const navigate = useNavigate()
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [killDialogOpen, setKillDialogOpen] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [userModifiedChanges, setUserModifiedChanges] = useState<Record<string, any>>({})
  const [userModifiedRaceChanges, setUserModifiedRaceChanges] = useState<Record<number, Record<string, any>>>({})
  
  const { data: proposalsData, isLoading } = useProposals({})
  const updateProposalMutation = useUpdateProposal()
  const bulkArchiveMutation = useBulkArchiveProposals()
  const unapproveProposalMutation = useUnapproveProposal()
  const killEventMutation = useKillEvent()
  const reviveEventMutation = useReviveEvent()
  
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
  
  // Gérer les modifications manuelles
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

  // Récupérer les propositions du groupe et les trier par confiance décroissante
  const groupProposals = useMemo(() => {
    if (!proposalsData?.data || !groupKey) return []
    
    const filtered = proposalsData.data.filter(proposal => {
      if (groupKey.startsWith('new-event-')) {
        return groupKey === `new-event-${proposal.id}`
      } else {
        const proposalGroupKey = `${proposal.eventId || 'unknown'}-${proposal.editionId || 'unknown'}`
        return proposalGroupKey === groupKey
      }
    })
    
    // Trier par confiance décroissante
    return filtered.sort((a, b) => {
      const confidenceA = a.confidence || 0
      const confidenceB = b.confidence || 0
      return confidenceB - confidenceA
    })
  }, [proposalsData?.data, groupKey])
  
  // Extraire la timezone de l'édition (prend en compte les modifications utilisateur)
  const editionTimezone = useMemo(() => {
    // Si l'utilisateur a modifié la timezone, l'utiliser
    if (selectedChanges.timeZone) {
      return selectedChanges.timeZone
    }
    
    if (groupProposals.length === 0) return 'Europe/Paris'
    const firstProposal = groupProposals[0]
    if (!firstProposal?.changes) return 'Europe/Paris'
    const changes = firstProposal.changes as any
    // Chercher le timeZone dans les changements
    if (changes.timeZone) {
      if (typeof changes.timeZone === 'string') return changes.timeZone
      if (typeof changes.timeZone === 'object' && 'proposed' in changes.timeZone) return changes.timeZone.proposed
      if (typeof changes.timeZone === 'object' && 'new' in changes.timeZone) return changes.timeZone.new
      if (typeof changes.timeZone === 'object' && 'current' in changes.timeZone) return changes.timeZone.current
    }
    return 'Europe/Paris'
  }, [groupProposals, selectedChanges.timeZone])

  // Consolider les changements en utilisant le hook
  const consolidatedChanges = useMemo(() => {
    const changes = consolidateChanges(groupProposals, isNewEvent)
    const isEventUpdateDisplay = groupProposals.length > 0 && groupProposals[0]?.type === 'EVENT_UPDATE'
    
    // Ne PAS ajouter calendarStatus et timeZone pour les EVENT_UPDATE (ce sont des champs d'Edition)
    if (!isEventUpdateDisplay) {
      // Ajouter le champ timeZone comme premier champ pour visibilité
      const hasTimezone = changes.some(c => c.field === 'timeZone')
      if (!hasTimezone && groupProposals.length > 0) {
        const firstProposal = groupProposals[0]
        changes.unshift({
          field: 'timeZone',
          options: [{
            proposalId: firstProposal.id,
            agentName: firstProposal.agent.name,
            proposedValue: editionTimezone,
            confidence: 1,
            createdAt: firstProposal.createdAt
          }],
          currentValue: editionTimezone
        })
      }
      
      // Ajouter le champ calendarStatus avec CONFIRMED par défaut
      const hasCalendarStatus = changes.some(c => c.field === 'calendarStatus')
      if (!hasCalendarStatus && groupProposals.length > 0) {
        const firstProposal = groupProposals[0]
        // Récupérer la valeur actuelle de la base ou TO_BE_CONFIRMED par défaut
        const currentCalendarStatus = (firstProposal.changes as any)?.calendarStatus?.current || 'TO_BE_CONFIRMED'
        changes.unshift({
          field: 'calendarStatus',
          options: [{
            proposalId: firstProposal.id,
            agentName: 'Système',
            proposedValue: 'CONFIRMED',
            confidence: 1,
            createdAt: firstProposal.createdAt
          }],
          currentValue: currentCalendarStatus
        })
      }
      
      // Ajouter le champ endDate avec la même valeur que startDate si elle existe
      const hasEndDate = changes.some(c => c.field === 'endDate')
      const startDateChange = changes.find(c => c.field === 'startDate')
      if (!hasEndDate && startDateChange && groupProposals.length > 0) {
        const firstProposal = groupProposals[0]
        const proposedStartDate = startDateChange.options[0]?.proposedValue
        const currentEndDate = (firstProposal.changes as any)?.endDate
        
        changes.push({
          field: 'endDate',
          options: [{
            proposalId: firstProposal.id,
            agentName: firstProposal.agent.name,
            proposedValue: proposedStartDate,
            confidence: 1,
            createdAt: firstProposal.createdAt
          }],
          currentValue: currentEndDate || null
        })
      }
    }
    
    // Filtrer calendarStatus et timeZone pour les EVENT_UPDATE
    return isEventUpdateDisplay
      ? changes.filter(c => c.field !== 'calendarStatus' && c.field !== 'timeZone')
      : changes
  }, [groupProposals, isNewEvent, consolidateChanges, editionTimezone])
  
  // Déterminer si c'est une modification d'événement (pour affichage)
  const isEventUpdateDisplay = groupProposals.length > 0 && groupProposals[0]?.type === 'EVENT_UPDATE'
  
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
  
  const consolidatedRaceChanges = useMemo(() => 
    consolidateRaceChanges(groupProposals),
    [groupProposals, consolidateRaceChanges]
  )
  
  // Cascade startDate changes to races
  // Si l'utilisateur change la date de l'édition (startDate), les races doivent être mises à jour aussi
  const consolidatedRaceChangesWithCascade = useMemo(() => {
    // Utiliser la startDate de l'édition (modifiée ou proposée)
    const startDateChange = consolidatedChanges.find(c => c.field === 'startDate')
    const editionStartDate = selectedChanges['startDate'] || startDateChange?.options[0]?.proposedValue
    
    if (!editionStartDate) return consolidatedRaceChanges
    
    return consolidatedRaceChanges.map(raceChange => ({
      ...raceChange,
      fields: Object.entries(raceChange.fields).reduce((acc, [fieldName, fieldData]) => {
        if (fieldName === 'startDate') {
          // Mettre à jour le startDate de la course avec la date de l'édition
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
  
  // Ref pour éviter les boucles infinies
  const lastComputedDatesRef = useRef<{startDate?: string, endDate?: string}>({})
  
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

  // Première proposition pour les actions et l'affichage
  const firstProposal = groupProposals[0]
  const firstProposalForActions = firstProposal

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
              appliedChanges: { [fieldName]: selectedValue },
              userModifiedChanges: Object.keys(userModifiedChanges).length > 0 ? userModifiedChanges : undefined,
              modificationReason: 'Modifications manuelles appliquées',
              modifiedBy: 'Utilisateur'
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

  const handleUnapproveAll = async () => {
    try {
      // Annuler l'approbation pour toutes les propositions APPROVED du groupe
      const approvedProposals = groupProposals.filter(p => p.status === 'APPROVED')
      for (const proposal of approvedProposals) {
        await unapproveProposalMutation.mutateAsync(proposal.id)
      }
    } catch (error) {
      console.error('Error unapproving proposals:', error)
    }
  }

  const handleKillEvent = async () => {
    try {
      const eventId = firstProposalForActions?.eventId
      if (!eventId) {
        console.error('No eventId found')
        return
      }
      await killEventMutation.mutateAsync(eventId)
      setKillDialogOpen(false)
    } catch (error) {
      console.error('Error killing event:', error)
    }
  }

  const handleReviveEvent = async () => {
    try {
      const eventId = firstProposalForActions?.eventId
      if (!eventId) {
        console.error('No eventId found')
        return
      }
      await reviveEventMutation.mutateAsync(eventId)
    } catch (error) {
      console.error('Error reviving event:', error)
    }
  }



  // Extraire eventId et eventStatus de la première proposition
  const eventId = firstProposalForActions?.eventId
  const eventStatus = firstProposalForActions?.eventStatus
  const isEventDead = eventStatus === 'DEAD'

  // Calculs pour l'interface
  // Calculer la confiance moyenne en ignorant les propositions sans confiance définie
  const proposalsWithValidConfidence = groupProposals.filter(p => p.confidence !== undefined && p.confidence !== null && p.confidence > 0)
  const averageConfidence = proposalsWithValidConfidence.length > 0
    ? proposalsWithValidConfidence.reduce((sum, p) => sum + p.confidence!, 0) / proposalsWithValidConfidence.length
    : 0
  const allPending = groupProposals.every(p => p.status === 'PENDING')
  const hasApproved = groupProposals.some(p => p.status === 'APPROVED')
  const allApproved = groupProposals.every(p => p.status === 'APPROVED')

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
        showUnapproveButton={hasApproved}
        onUnapprove={handleUnapproveAll}
        disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || unapproveProposalMutation.isPending}
        showBackButton={true}
      />
      
      <ProposalHeader
        title={isNewEvent ? 'Nouvel événement proposé' : 'Proposition de modification'}
        eventTitle={!isNewEvent ? getEventTitle(firstProposalForActions, isNewEvent) : undefined}
        editionYear={!isNewEvent && !isEventUpdateDisplay && firstProposalForActions ? getEditionYear(firstProposalForActions) : undefined}
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
          {isEventUpdateDisplay ? (
            <EventChangesTable
              title="Modification de l'événement"
              changes={consolidatedChanges}
              isNewEvent={false}
              selectedChanges={selectedChanges}
              onFieldSelect={handleSelectField}
              onFieldApprove={handleApproveField}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              disabled={!allPending || updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
              actions={allPending ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<ApproveIcon />}
                    onClick={handleApproveAll}
                    disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
                  >
                    Tout approuver
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<RejectIcon />}
                    onClick={handleRejectAll}
                    disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
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
              onFieldSelect={handleSelectField}
              onFieldApprove={handleApproveField}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              disabled={!allPending || updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
              isEditionCanceled={isEditionCanceled || isEventDead}
              actions={allPending ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<ApproveIcon />}
                    onClick={handleApproveAll}
                    disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
                  >
                    Tout approuver
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<RejectIcon />}
                    onClick={handleRejectAll}
                    disabled={updateProposalMutation.isPending || bulkArchiveMutation.isPending || isEventDead}
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
            onApproveAll={allPending ? handleApproveAllRaces : undefined}
            onRejectAll={allPending ? handleRejectAllRaces : undefined}
            onFieldModify={handleRaceFieldModify}
            userModifiedRaceChanges={userModifiedRaceChanges}
            disabled={!allPending || updateProposalMutation.isPending || isEventDead}
            isEditionCanceled={isEditionCanceled || isEventDead}
          />
          
          {/* Sources des dates extraites */}
          <DateSourcesSection justifications={groupProposals.flatMap(p => p.justification || [])} />
        </Grid>
        
        <Grid item xs={12} md={4}>
          <AgentInfoSection proposals={groupProposals.map(p => ({ ...p, confidence: p.confidence || 0, status: p.status }))} />
          
          {/* URLs de l'événement */}
          {firstProposal && (
            <Box sx={{ mt: 3 }}>
              <EventLinksEditor
                websiteUrl={firstProposal.changes.websiteUrl}
                facebookUrl={firstProposal.changes.facebookUrl}
                instagramUrl={firstProposal.changes.instagramUrl}
                onSave={(links) => {
                  handleFieldModify('websiteUrl', links.websiteUrl)
                  handleFieldModify('facebookUrl', links.facebookUrl)
                  handleFieldModify('instagramUrl', links.instagramUrl)
                }}
                editable={allPending}
              />
            </Box>
          )}
          
          {/* Informations contextuelles de l'édition */}
          {firstProposal && (
            <EditionContextInfo
              currentCalendarStatus={
                userModifiedChanges['calendarStatus'] || 
                selectedChanges['calendarStatus'] || 
                (typeof firstProposal.changes.calendarStatus === 'string' 
                  ? firstProposal.changes.calendarStatus 
                  : (firstProposal.changes.calendarStatus as any)?.current || (firstProposal.changes.calendarStatus as any)?.proposed)
              }
              currentEditionYear={getEditionYear(firstProposal) ? parseInt(getEditionYear(firstProposal)!) : undefined}
              previousEditionYear={(firstProposal as any).previousEditionYear}
              previousCalendarStatus={(firstProposal as any).previousEditionCalendarStatus}
              previousEditionStartDate={(firstProposal as any).previousEditionStartDate}
            />
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

export default GroupedProposalDetail
