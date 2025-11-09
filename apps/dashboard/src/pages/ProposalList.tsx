import React, { useState, useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  IconButton,
  Chip,
  Grid,
  Tooltip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Menu,
  ButtonGroup
} from '@mui/material'
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Archive as ArchiveIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  ExpandMore as ExpandMoreIcon,
  Group as GroupIcon,
  ViewList as ViewListIcon,
  Add as AddIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Event as EventIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  EditOutlined as EditOutlinedIcon,
  Update as UpdateIcon
} from '@mui/icons-material'
import { DataGridPro, GridColDef, GridToolbar, GridRowSelectionModel } from '@mui/x-data-grid-pro'
import { useProposals, useBulkApproveProposals, useBulkRejectProposals, useBulkArchiveProposals, useBulkDeleteProposals, useDeleteProposal } from '@/hooks/useApi'
import { ProposalStatus, ProposalType } from '@/types'
import CreateManualProposal from '@/components/CreateManualProposal'

const proposalStatusLabels: Record<ProposalStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  ARCHIVED: 'Archivé',
}

const proposalStatusColors: Record<ProposalStatus, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error', 
  ARCHIVED: 'default',
}

const proposalTypeLabels: Record<ProposalType, string> = {
  NEW_EVENT: 'Nouvel événement',
  EVENT_UPDATE: 'Modification événement',
  EDITION_UPDATE: 'Modification édition',
  RACE_UPDATE: 'Modification course',
}

const getProposalTypeStyle = (type: ProposalType) => {
  switch(type) {
    case 'NEW_EVENT':
      return {
        backgroundColor: '#10b981',
        color: 'white',
        borderColor: '#059669',
        '& .MuiChip-icon': {
          color: '#059669'
        }
      }
    case 'EDITION_UPDATE':
      return {
        backgroundColor: '#3b82f6',
        color: 'white',
        borderColor: '#2563eb',
        '& .MuiChip-icon': {
          color: '#1d4ed8'
        }
      }
    case 'EVENT_UPDATE':
      return {
        backgroundColor: '#8b5cf6',
        color: 'white',
        borderColor: '#7c3aed',
        '& .MuiChip-icon': {
          color: '#6d28d9'
        }
      }
    case 'RACE_UPDATE':
      return {
        backgroundColor: '#f59e0b',
        color: 'white',
        borderColor: '#d97706',
        '& .MuiChip-icon': {
          color: '#b45309'
        }
      }
    default:
      return {
        backgroundColor: '#6b7280',
        color: 'white',
        borderColor: '#4b5563',
        '& .MuiChip-icon': {
          color: '#374151'
        }
      }
  }
}

const getProposalTypeIcon = (type: ProposalType) => {
  switch(type) {
    case 'NEW_EVENT':
      return <AddCircleOutlineIcon sx={{ fontSize: 16 }} />
    case 'EDITION_UPDATE':
      return <EditOutlinedIcon sx={{ fontSize: 16 }} />
    case 'EVENT_UPDATE':
      return <UpdateIcon sx={{ fontSize: 16 }} />
    case 'RACE_UPDATE':
      return <EditIcon sx={{ fontSize: 16 }} />
    default:
      return null
  }
}

const ProposalList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'ALL'>('PENDING')
  const [typeFilter, setTypeFilter] = useState<ProposalType | 'ALL'>('ALL')
  const [agentFilter, setAgentFilter] = useState<string>('ALL')
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([])
  const [viewMode, setViewMode] = useState<'grouped' | 'table'>('grouped')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [createProposalOpen, setCreateProposalOpen] = useState(false)
  const [createMenuAnchor, setCreateMenuAnchor] = useState<null | HTMLElement>(null)
  const [creationType, setCreationType] = useState<'NEW_EVENT' | 'EDIT_EVENT'>('NEW_EVENT')
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 })
  
  // Charger l'ordre de tri depuis localStorage au montage
  const [groupSort, setGroupSort] = useState<'date-asc' | 'date-desc' | 'created-desc'>(() => {
    const saved = localStorage.getItem('proposalGroupSort')
    return (saved as 'date-asc' | 'date-desc' | 'created-desc') || 'date-asc'
  })
  
  // Sauvegarder l'ordre de tri dans localStorage quand il change
  React.useEffect(() => {
    localStorage.setItem('proposalGroupSort', groupSort)
  }, [groupSort])

  const { data: proposalsData, isLoading, refetch } = useProposals(
    { 
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
      type: typeFilter !== 'ALL' ? typeFilter : undefined,
    },
    paginationModel.pageSize,
    paginationModel.page * paginationModel.pageSize
  )
  
  // Reset pagination when filters change
  React.useEffect(() => {
    setPaginationModel(prev => ({ ...prev, page: 0 }))
  }, [statusFilter, typeFilter, agentFilter])
  
  const bulkApproveMutation = useBulkApproveProposals()
  const bulkRejectMutation = useBulkRejectProposals()
  const bulkArchiveMutation = useBulkArchiveProposals()
  const bulkDeleteMutation = useBulkDeleteProposals()
  const deleteMutation = useDeleteProposal()

  // Get unique agent names for filter
  const uniqueAgents = useMemo(() => {
    if (!proposalsData?.data) return []
    const agentNames = [...new Set(proposalsData.data.map(p => p.agent.name))]
    return agentNames.sort()
  }, [proposalsData?.data])

  // Filter proposals based on search term and agent
  const filteredProposals = useMemo(() => {
    if (!proposalsData?.data) return []
    
    return proposalsData.data.filter(proposal => {
      // Filter by agent
      if (agentFilter !== 'ALL' && proposal.agent.name !== agentFilter) {
        return false
      }
      
      const searchLower = searchTerm.toLowerCase()
      
      // Recherche dans les champs de base
      if (
        proposal.agent.name.toLowerCase().includes(searchLower) ||
        JSON.stringify(proposal.changes).toLowerCase().includes(searchLower)
      ) {
        return true
      }
      
      // Recherche dans les métadonnées d'événements
      if (proposal.justification && Array.isArray(proposal.justification)) {
        for (const justif of proposal.justification) {
          if (justif.metadata) {
            const metadata = justif.metadata
            if (
              (metadata.eventName && metadata.eventName.toLowerCase().includes(searchLower)) ||
              (metadata.eventCity && metadata.eventCity.toLowerCase().includes(searchLower)) ||
              (metadata.editionYear && metadata.editionYear.toString().includes(searchLower))
            ) {
              return true
            }
          }
        }
      }
      
      // Fallback: recherche dans les IDs (conservé pour compatibilité)
      if (
        (proposal.eventId && proposal.eventId.toString().toLowerCase().includes(searchLower)) ||
        (proposal.editionId && proposal.editionId.toString().toLowerCase().includes(searchLower))
      ) {
        return true
      }
      
      return false
    })
  }, [proposalsData?.data, searchTerm, agentFilter])

  // Group proposals by event/edition
  const groupedProposals = useMemo(() => {
    const groups: Record<string, typeof filteredProposals> = {}
    
    filteredProposals.forEach(proposal => {
      let groupKey: string
      if (proposal.type === 'NEW_EVENT') {
        groupKey = `new-event-${proposal.id}` // Chaque nouvel événement est dans son propre groupe
      } else {
        groupKey = `${proposal.eventId || 'unknown'}-${proposal.editionId || 'unknown'}`
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(proposal)
    })
    
    // Trier les propositions dans chaque groupe par confiance décroissante
    Object.keys(groups).forEach(groupKey => {
      groups[groupKey].sort((a, b) => {
        const confidenceA = a.confidence || 0
        const confidenceB = b.confidence || 0
        return confidenceB - confidenceA
      })
    })
    
    return groups
  }, [filteredProposals])
  
  // Trier les groupes selon le critère sélectionné
  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(groupedProposals)
    
    return keys.sort((keyA, keyB) => {
      const groupA = groupedProposals[keyA]
      const groupB = groupedProposals[keyB]
      
      if (groupSort === 'created-desc') {
        // Tri par date de création : plus récent en premier
        const latestA = Math.max(...groupA.map(p => new Date(p.createdAt).getTime()))
        const latestB = Math.max(...groupB.map(p => new Date(p.createdAt).getTime()))
        return latestB - latestA
      }
      
      // Tri par startDate proposée
      // Extraire la startDate minimale de chaque groupe (date la plus proche)
      const getMinStartDate = (proposals: typeof filteredProposals) => {
        const dates: number[] = []
        
        for (const proposal of proposals) {
          // Chercher startDate dans changes
          if (proposal.changes?.startDate) {
            const startDate = typeof proposal.changes.startDate === 'object' && proposal.changes.startDate.new
              ? proposal.changes.startDate.new
              : proposal.changes.startDate
            if (startDate) {
              dates.push(new Date(startDate).getTime())
            }
          }
        }
        
        // Retourner la date la plus proche (minimum)
        // Si aucune date, retourner Infinity pour mettre à la fin
        return dates.length > 0 ? Math.min(...dates) : Infinity
      }
      
      const dateA = getMinStartDate(groupA)
      const dateB = getMinStartDate(groupB)
      
      if (groupSort === 'date-asc') {
        // startDate la plus proche en premier (ordre croissant)
        return dateA - dateB
      } else {
        // startDate la plus éloignée en premier (ordre décroissant)
        return dateB - dateA
      }
    })
  }, [groupedProposals, groupSort])
  
  const handleToggleGroup = (groupKey: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setExpandedGroups(prev => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(groupKey)) {
        newExpanded.delete(groupKey)
      } else {
        newExpanded.add(groupKey)
      }
      return newExpanded
    })
  }

  const getChangesSummary = (changes: Record<string, any>) => {
    const changeKeys = Object.keys(changes)
    if (changeKeys.length === 0) return 'Aucun changement'
    if (changeKeys.length === 1) {
      const key = changeKeys[0]
      return `Changement de ${key}`
    }
    return `Changements multiples (${changeKeys.length})`
  }

  const getEventTitle = (groupKey: string, proposals: any[]) => {
    if (groupKey.startsWith('new-event-')) {
      const proposal = proposals[0]
      // Extraire .new si c'est un objet change
      const eventNameValue = proposal.changes.eventName || proposal.changes.name
      const eventName = (typeof eventNameValue === 'object' && eventNameValue?.new) ? eventNameValue.new : eventNameValue
      return eventName || 'Nouvel événement'
    }
    
    const proposal = proposals[0]
    
    // PRIORITÉ 1: Utiliser les champs enrichis par l'API (eventName, eventCity, editionYear)
    if (proposal.eventName) {
      const cityPart = proposal.eventCity ? ` - ${proposal.eventCity}` : ''
      const yearPart = proposal.editionYear ? ` ${proposal.editionYear}` : ''
      return `${proposal.eventName}${cityPart}${yearPart}`
    }
    
    // PRIORITÉ 2: Essayer d'extraire le nom depuis les métadonnées de justification
    if (proposal.justification && Array.isArray(proposal.justification)) {
      for (const justif of proposal.justification) {
        if (justif.metadata && justif.metadata.eventName) {
          const eventName = justif.metadata.eventName
          const eventCity = justif.metadata.eventCity
          const year = justif.metadata.editionYear
          
          // Construire le titre avec le nom, ville et année
          const cityPart = eventCity ? ` - ${eventCity}` : ''
          const yearPart = year ? ` ${year}` : ''
          return `${eventName}${cityPart}${yearPart}`
        }
      }
    }
    
    // Pour EDITION_UPDATE sans eventId, utiliser editionId avec les métadonnées si disponibles
    if (!proposal.eventId && proposal.editionId) {
      return `Édition ${proposal.editionId}`
    }
    
    if (!proposal.eventId) {
      return 'Événement inconnu'
    }
    
    // Fallback: extraire le nom de l'événement depuis l'ID (logique existante)
    let eventName = proposal.eventId.toString().replace('event_', '')
    
    // Nettoyer et formater le nom
    if (eventName.includes('marathon_paris')) {
      eventName = 'Marathon de Paris'
    } else if (eventName.includes('10km_boulogne')) {
      eventName = '10km de Boulogne'
    } else if (eventName.includes('semi_marathon_boulogne')) {
      eventName = 'Semi-marathon de Boulogne'
    } else {
      // Fallback: remplacer les underscores par des espaces et capitaliser
      eventName = eventName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
    }
    
    // Extraire l'année depuis l'eventId ou editionId
    const yearMatch = (proposal.eventId + (proposal.editionId || '')).match(/202\d/)
    const year = yearMatch ? yearMatch[0] : ''
    
    return year ? `${eventName} ${year}` : eventName
  }

  const handleBulkApprove = async () => {
    if (selectedRows.length === 0) return
    await bulkApproveMutation.mutateAsync({
      proposalIds: selectedRows as string[],
      reviewedBy: 'Utilisateur'
    })
    setSelectedRows([])
  }

  const handleBulkReject = async () => {
    if (selectedRows.length === 0) return
    await bulkRejectMutation.mutateAsync({
      proposalIds: selectedRows as string[],
      reviewedBy: 'Utilisateur'
    })
    setSelectedRows([])
  }

  const handleBulkArchive = async () => {
    if (selectedRows.length === 0) return
    const count = selectedRows.length
    await bulkArchiveMutation.mutateAsync({
      proposalIds: selectedRows as string[],
      reviewedBy: 'Utilisateur',
      archiveReason: 'Archivage en lot depuis la liste des propositions'
    })
    setSelectedRows([])
    // Optionnel: afficher un message personnalisé
    console.log(`${count} propositions archivées - elles n'apparaissent plus dans le filtre "En attente"`)
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return
    if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement ${selectedRows.length} proposition(s) ? Cette action est irréversible.`)) {
      return
    }
    const count = selectedRows.length
    await bulkDeleteMutation.mutateAsync({
      proposalIds: selectedRows as string[],
      reviewedBy: 'Utilisateur'
    })
    setSelectedRows([])
    console.log(`${count} propositions supprimées définitivement de la base de données`)
  }

  const handleSingleArchive = async (proposalId: string) => {
    await bulkArchiveMutation.mutateAsync({
      proposalIds: [proposalId],
      reviewedBy: 'Utilisateur',
      archiveReason: 'Archivage individuel depuis la liste des propositions'
    })
  }

  const handleSingleDelete = async (proposalId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement cette proposition ? Cette action est irréversible.')) {
      return
    }
    await deleteMutation.mutateAsync(proposalId)
  }

  const columns: GridColDef[] = [
    {
      field: 'eventInfo',
      headerName: 'Événement / Édition',
      width: 250,
      valueGetter: (params) => {
        const proposal = params.row
        // Pour les nouveaux événements
        if (proposal.type === 'NEW_EVENT') {
          // Extraire .new si c'est un objet change, sinon utiliser la valeur directement
          const nameValue = proposal.changes.name
          const eventNameValue = proposal.changes.eventName
          const name = (typeof nameValue === 'object' && nameValue?.new) ? nameValue.new : nameValue
          const eventName = (typeof eventNameValue === 'object' && eventNameValue?.new) ? eventNameValue.new : eventNameValue
          return name || eventName || 'Nouvel événement'
        }
        
        // PRIORITÉ 1: Utiliser les champs enrichis par l'API
        if (proposal.eventName) {
          const cityPart = proposal.eventCity ? ` - ${proposal.eventCity}` : ''
          const yearPart = proposal.editionYear ? ` ${proposal.editionYear}` : ''
          return `${proposal.eventName}${cityPart}${yearPart}`
        }
        
        // PRIORITÉ 2: Essayer d'extraire depuis les métadonnées de justification
        if (proposal.justification && Array.isArray(proposal.justification)) {
          for (const justif of proposal.justification) {
            if (justif.metadata?.eventName) {
              const eventName = justif.metadata.eventName
              const year = justif.metadata.editionYear
              return year ? `${eventName} - ${year}` : eventName
            }
          }
        }
        
        // Fallback sur les IDs
        if (proposal.editionId) {
          return `Édition ${proposal.editionId}`
        }
        if (proposal.eventId) {
          return `Événement ${proposal.eventId}`
        }
        return 'Inconnu'
      },
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {params.value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {proposalTypeLabels[params.row.type as ProposalType]}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'agent',
      headerName: 'Agent',
      width: 140,
      renderCell: (params) => (
        <Typography variant="body2">
          {params.value.name}
        </Typography>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 200,
      renderCell: (params) => (
        <Chip
          icon={getProposalTypeIcon(params.value as ProposalType)}
          size="small"
          label={proposalTypeLabels[params.value as ProposalType]}
          sx={getProposalTypeStyle(params.value as ProposalType)}
        />
      ),
    },
    {
      field: 'confidence',
      headerName: 'Confiance',
      width: 100,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary">
          {params.value ? `${Math.round(params.value * 100)}%` : 'N/A'}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Statut',
      width: 120,
      renderCell: (params) => (
        <Chip
          size="small"
          label={proposalStatusLabels[params.value as ProposalStatus]}
          color={proposalStatusColors[params.value as ProposalStatus]}
        />
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Date proposition',
      width: 140,
      renderCell: (params) => (
        <Typography variant="caption" color="text.secondary">
          {new Date(params.value).toLocaleString('fr-FR')}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Voir détails">
            <IconButton
              size="small"
              component={RouterLink}
              to={`/proposals/${params.row.id}`}
            >
              <ViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {params.row.status === 'PENDING' && (
            <>
              <Tooltip title="Archiver">
                <IconButton
                  size="small"
                  color="warning"
                  onClick={() => handleSingleArchive(params.row.id)}
                  disabled={bulkArchiveMutation.isPending || deleteMutation.isPending}
                >
                  <ArchiveIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Supprimer">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleSingleDelete(params.row.id)}
                  disabled={bulkArchiveMutation.isPending || deleteMutation.isPending}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      ),
    },
  ]

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Propositions
          </Typography>
          
          {/* View Mode Toggle */}
          <Box sx={{ display: 'flex', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Button
              size="small"
              startIcon={<GroupIcon />}
              onClick={() => setViewMode('grouped')}
              variant={viewMode === 'grouped' ? 'contained' : 'text'}
              sx={{ borderRadius: 0 }}
            >
              Groupé
            </Button>
            <Button
              size="small"
              startIcon={<ViewListIcon />}
              onClick={() => setViewMode('table')}
              variant={viewMode === 'table' ? 'contained' : 'text'}
              sx={{ borderRadius: 0 }}
            >
              Tableau
            </Button>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Bouton de rafraîchissement */}
          <Tooltip title="Rafraîchir">
            <IconButton
              onClick={() => refetch()}
              disabled={isLoading}
              color="primary"
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          
          {/* Créer une proposition dropdown button */}
          <ButtonGroup variant="contained" color="primary">
            <Button
              startIcon={<AddIcon />}
              onClick={() => {
                setCreateProposalOpen(true)
              }}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Créer une proposition
            </Button>
            <Button
              size="small"
              onClick={(event) => setCreateMenuAnchor(event.currentTarget)}
              sx={{ px: 1 }}
            >
              <ArrowDropDownIcon />
            </Button>
          </ButtonGroup>
          
          <Menu
            anchorEl={createMenuAnchor}
            open={Boolean(createMenuAnchor)}
            onClose={() => setCreateMenuAnchor(null)}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem 
              onClick={() => {
                setCreationType('NEW_EVENT')
                setCreateMenuAnchor(null)
                setCreateProposalOpen(true)
              }}
            >
              <EventIcon sx={{ mr: 2 }} />
              Création d'événement
            </MenuItem>
            <MenuItem 
              onClick={() => {
                setCreationType('EDIT_EVENT')
                setCreateMenuAnchor(null)
                setCreateProposalOpen(true)
              }}
            >
              <EditIcon sx={{ mr: 2 }} />
              Édition d'événement
            </MenuItem>
          </Menu>
        
          {/* Bulk Actions */}
          {selectedRows.length > 0 && viewMode === 'table' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              color="success"
              size="small"
              startIcon={<ApproveIcon />}
              onClick={handleBulkApprove}
              disabled={bulkApproveMutation.isPending || bulkRejectMutation.isPending || bulkArchiveMutation.isPending || bulkDeleteMutation.isPending}
            >
              Approuver ({selectedRows.length})
            </Button>
            <Button
              variant="contained"
              color="error"
              size="small"
              startIcon={<RejectIcon />}
              onClick={handleBulkReject}
              disabled={bulkApproveMutation.isPending || bulkRejectMutation.isPending || bulkArchiveMutation.isPending || bulkDeleteMutation.isPending}
            >
              Rejeter ({selectedRows.length})
            </Button>
            <Button
              variant="outlined"
              color="warning"
              size="small"
              startIcon={<ArchiveIcon />}
              onClick={handleBulkArchive}
              disabled={bulkApproveMutation.isPending || bulkRejectMutation.isPending || bulkArchiveMutation.isPending || bulkDeleteMutation.isPending}
            >
              Archiver ({selectedRows.length})
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<DeleteIcon />}
              onClick={handleBulkDelete}
              disabled={bulkApproveMutation.isPending || bulkRejectMutation.isPending || bulkArchiveMutation.isPending || bulkDeleteMutation.isPending}
            >
              Supprimer ({selectedRows.length})
            </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Rechercher"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Statut</InputLabel>
                <Select
                  value={statusFilter}
                  label="Statut"
                  onChange={(e) => setStatusFilter(e.target.value as ProposalStatus | 'ALL')}
                >
                  <MenuItem value="ALL">Tous les statuts</MenuItem>
                  {Object.entries(proposalStatusLabels).map(([status, label]) => (
                    <MenuItem key={status} value={status}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  value={typeFilter}
                  label="Type"
                  onChange={(e) => setTypeFilter(e.target.value as ProposalType | 'ALL')}
                >
                  <MenuItem value="ALL">Tous les types</MenuItem>
                  {Object.entries(proposalTypeLabels).map(([type, label]) => (
                    <MenuItem key={type} value={type}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Agent</InputLabel>
                <Select
                  value={agentFilter}
                  label="Agent"
                  onChange={(e) => setAgentFilter(e.target.value)}
                >
                  <MenuItem value="ALL">Tous les agents</MenuItem>
                  {uniqueAgents.map((agentName) => (
                    <MenuItem key={agentName} value={agentName}>
                      {agentName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {viewMode === 'grouped' && (
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Tri</InputLabel>
                  <Select
                    value={groupSort}
                    label="Tri"
                    onChange={(e) => setGroupSort(e.target.value as 'date-asc' | 'date-desc' | 'created-desc')}
                  >
                    <MenuItem value="date-asc">startDate proche en premier</MenuItem>
                    <MenuItem value="date-desc">startDate éloignée en premier</MenuItem>
                    <MenuItem value="created-desc">createdAt récent en premier</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Content based on view mode */}
      {viewMode === 'grouped' ? (
        /* Grouped View */
        <Box>
          {isLoading && <LinearProgress sx={{ mb: 2 }} />}
          
          {/* Pagination info for grouped view */}
          {proposalsData?.meta && (
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Affichage de {proposalsData.meta.offset + 1} à {Math.min(proposalsData.meta.offset + proposalsData.meta.limit, proposalsData.meta.total)} sur {proposalsData.meta.total} propositions
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  disabled={paginationModel.page === 0}
                  onClick={() => setPaginationModel({ ...paginationModel, page: paginationModel.page - 1 })}
                >
                  Précédent
                </Button>
                <Button
                  size="small"
                  disabled={!proposalsData.meta.hasMore}
                  onClick={() => setPaginationModel({ ...paginationModel, page: paginationModel.page + 1 })}
                >
                  Suivant
                </Button>
              </Box>
            </Box>
          )}
          
          {sortedGroupKeys.map(groupKey => {
            const proposals = groupedProposals[groupKey]
            const isExpanded = expandedGroups.has(groupKey)
            return (
            <Accordion key={groupKey} expanded={isExpanded} sx={{ mb: 2 }}>
              <AccordionSummary 
                onClick={(e) => {
                  // Empêcher l'expansion/contraction si on clique sur le contenu principal
                  const target = e.target as HTMLElement
                  const isExpandIcon = target.closest('.chevron-icon')
                  if (!isExpandIcon) {
                    e.preventDefault()
                    // Naviguer vers la vue groupée
                    window.location.href = `/proposals/group/${encodeURIComponent(groupKey)}`
                  }
                }}
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  },
                  '& .MuiAccordionSummary-expandIconWrapper': {
                    display: 'none' // Masquer l'icône par défaut
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                  <IconButton
                    className="chevron-icon"
                    size="small"
                    onClick={(e) => handleToggleGroup(groupKey, e)}
                    sx={{
                      p: 0.5,
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease-in-out',
                      '&:hover': {
                        backgroundColor: 'action.selected'
                      }
                    }}
                  >
                    <ExpandMoreIcon />
                  </IconButton>
                  <Chip 
                    size="small" 
                    label={proposals.length.toString()} 
                    color="primary" 
                    sx={{ 
                      minWidth: '32px',
                      borderRadius: '12px',
                      fontWeight: 600
                    }} 
                  />
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    {getEventTitle(groupKey, proposals)}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {/* Afficher les noms d'agents uniques */}
                    {[...new Set(proposals.map(p => p.agent.name))].map((agentName) => (
                      <Chip
                        key={agentName}
                        size="small"
                        label={agentName}
                        variant="outlined"
                        sx={{ 
                          backgroundColor: '#f3f4f6',
                          borderColor: '#9ca3af',
                          fontWeight: 500
                        }}
                      />
                    ))}
                    {/* Afficher les types uniques */}
                    {[...new Set(proposals.map(p => p.type))].map((type) => (
                      <Chip
                        key={type}
                        icon={getProposalTypeIcon(type as ProposalType)}
                        size="small"
                        label={proposalTypeLabels[type as ProposalType]}
                        sx={getProposalTypeStyle(type as ProposalType)}
                      />
                    ))}
                    {/* Afficher uniquement les statuts uniques */}
                    {[...new Set(proposals.map(p => p.status))].map((status) => {
                      const count = proposals.filter(p => p.status === status).length
                      return (
                        <Chip
                          key={status}
                          size="small"
                          label={count > 1 ? `${proposalStatusLabels[status as ProposalStatus]} (${count})` : proposalStatusLabels[status as ProposalStatus]}
                          color={proposalStatusColors[status as ProposalStatus]}
                        />
                      )
                    })}
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List>
                  {proposals.map((proposal, index) => (
                    <React.Fragment key={proposal.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Chip
                                icon={getProposalTypeIcon(proposal.type as ProposalType)}
                                size="small"
                                label={proposalTypeLabels[proposal.type as ProposalType]}
                                sx={getProposalTypeStyle(proposal.type as ProposalType)}
                              />
                              <Typography component="span" variant="body2" color="text.secondary">
                                par {proposal.agent.name}
                              </Typography>
                              <Typography component="span" variant="body2" color="text.secondary">
                                {proposal.confidence ? `${Math.round(proposal.confidence * 100)}% confiance` : ''}
                              </Typography>
                              <Typography component="span" variant="caption" color="text.secondary">
                                {new Date(proposal.createdAt).toLocaleDateString('fr-FR')}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Typography component="div" variant="body2" sx={{ display: 'block', mb: 1 }}>
                                {getChangesSummary(proposal.changes)}
                              </Typography>
                              
                              {/* Affichage des changements principaux */}
                              {Object.entries(proposal.changes).map(([key, value]: [string, any]) => {
                                if (key === 'startDate' && typeof value === 'object' && value.new) {
                                  // Affichage spécial pour les dates de début
                                  const dateValue = new Date(value.new)
                                  const confidence = value.confidence ? Math.round(value.confidence * 100) : 0
                                  return (
                                    <Chip
                                      key={key}
                                      size="small"
                                      label={`Date proposée: ${dateValue.toLocaleDateString('fr-FR')} (${confidence}% confiance)`}
                                      variant="outlined"
                                      sx={{ mr: 1, mb: 0.5, backgroundColor: 'success.light', color: 'success.dark' }}
                                    />
                                  )
                                } else if (key === 'races' && Array.isArray(value)) {
                                  return (
                                    <Box key={key} sx={{ display: 'block', mt: 1 }}>
                                      <Chip
                                        size="small"
                                        label={`${value.length} course(s) incluse(s)`}
                                        variant="outlined"
                                        color="info"
                                        sx={{ mr: 1, mb: 0.5 }}
                                      />
                                      {/* Afficher un aperçu des courses */}
                                      <Typography component="div" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                        Courses: {value.map((race: any) => race.raceName).slice(0, 3).join(', ')}
                                        {value.length > 3 && ` et ${value.length - 3} autre(s)...`}
                                      </Typography>
                                    </Box>
                                  )
                                } else if (typeof value === 'object' && value.field) {
                                  return (
                                    <Chip
                                      key={key}
                                      size="small"
                                      label={`${value.field}: ${value.current} → ${value.proposed}`}
                                      variant="outlined"
                                      sx={{ mr: 1, mb: 0.5 }}
                                    />
                                  )
                                } else if (groupKey.startsWith('new-event-')) {
                                  return (
                                    <Chip
                                      key={key}
                                      size="small"
                                      label={`${key}: ${typeof value === 'string' && value.includes('T') ? 
                                        new Date(value).toLocaleDateString('fr-FR') : 
                                        String(value)}`}
                                      variant="outlined"
                                      sx={{ mr: 1, mb: 0.5 }}
                                    />
                                  )
                                }
                                return null
                              })}
                            </Box>
                          }
                          secondaryTypographyProps={{ component: 'div' }}
                        />
                        <ListItemSecondaryAction>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="Voir détails">
                              <IconButton
                                size="small"
                                component={RouterLink}
                                to={`/proposals/${proposal.id}`}
                              >
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {proposal.status === 'PENDING' && (
                              <>
                                <Tooltip title="Approuver">
                                  <IconButton
                                    size="small"
                                    color="success"
                                  >
                                    <ApproveIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Rejeter">
                                  <IconButton
                                    size="small"
                                    color="error"
                                  >
                                    <RejectIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Box>
                        </ListItemSecondaryAction>
                      </ListItem>
                      {index < proposals.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
            )
          })}
          
          {Object.keys(groupedProposals).length === 0 && !isLoading && (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 6 }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Aucune proposition trouvée
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Modifiez vos filtres ou attendez que les agents génèrent de nouvelles propositions.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Box>
      ) : (
        /* Table View */
        <Card>
          <Box sx={{ height: 600 }}>
            {isLoading && <LinearProgress />}
            <DataGridPro
              rows={filteredProposals}
              columns={columns}
              pagination
              paginationMode="server"
              rowCount={proposalsData?.meta?.total || 0}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={[25, 50, 100]}
              slots={{
                toolbar: GridToolbar,
              }}
              slotProps={{
                toolbar: {
                  showQuickFilter: true,
                  quickFilterProps: { debounceMs: 500 },
                },
              }}
              loading={isLoading}
              checkboxSelection
              rowSelectionModel={selectedRows}
              onRowSelectionModelChange={setSelectedRows}
              sx={{
                border: 'none',
                '& .MuiDataGrid-cell:focus': {
                  outline: 'none',
                },
                '& .MuiDataGrid-row:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            />
          </Box>
        </Card>
      )}
      
      {/* Manual Proposal Creation Modal */}
      <CreateManualProposal
        open={createProposalOpen}
        onClose={() => setCreateProposalOpen(false)}
        mode={creationType}
      />
    </Box>
  )
}

export default ProposalList