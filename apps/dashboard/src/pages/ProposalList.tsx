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
  Divider
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
  ViewList as ViewListIcon
} from '@mui/icons-material'
import { DataGridPro, GridColDef, GridToolbar, GridRowSelectionModel } from '@mui/x-data-grid-pro'
import { useProposals, useBulkApproveProposals, useBulkRejectProposals, useBulkArchiveProposals, useBulkDeleteProposals, useDeleteProposal } from '@/hooks/useApi'
import { ProposalStatus, ProposalType } from '@/types'

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

const ProposalList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'ALL'>('PENDING')
  const [typeFilter, setTypeFilter] = useState<ProposalType | 'ALL'>('ALL')
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([])
  const [viewMode, setViewMode] = useState<'grouped' | 'table'>('grouped')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const { data: proposalsData, isLoading } = useProposals({ 
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    type: typeFilter !== 'ALL' ? typeFilter : undefined,
  })
  
  const bulkApproveMutation = useBulkApproveProposals()
  const bulkRejectMutation = useBulkRejectProposals()
  const bulkArchiveMutation = useBulkArchiveProposals()
  const bulkDeleteMutation = useBulkDeleteProposals()
  const deleteMutation = useDeleteProposal()

  // Filter proposals based on search term
  const filteredProposals = useMemo(() => {
    if (!proposalsData?.data) return []
    
    return proposalsData.data.filter(proposal => {
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
  }, [proposalsData?.data, searchTerm])

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
    
    return groups
  }, [filteredProposals])
  
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
      return proposal.changes.eventName || 'Nouvel événement'
    }
    
    const proposal = proposals[0]
    if (!proposal.eventId) {
      return 'Événement inconnu'
    }
    
    // Essayer d'extraire le nom depuis les métadonnées de justification
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
      field: 'type',
      headerName: 'Type',
      width: 160,
      renderCell: (params) => (
        <Chip
          size="small"
          label={proposalTypeLabels[params.value as ProposalType]}
          color="primary"
          variant="outlined"
        />
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
      field: 'changes',
      headerName: 'Modifications proposées',
      flex: 1,
      minWidth: 250,
      renderCell: (params) => {
        const summary = getChangesSummary(params.value)
        const changeKeys = Object.keys(params.value)
        
        return (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2">
              {summary}
            </Typography>
            {changeKeys.length > 1 && (
              <Tooltip title={`Champs modifiés: ${changeKeys.join(', ')}`}>
                <InfoIcon sx={{ ml: 1, fontSize: 16, color: 'text.secondary' }} />
              </Tooltip>
            )}
          </Box>
        )
      },
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

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
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
            <Grid item xs={12} md={3}>
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
            <Grid item xs={12} md={3}>
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
          </Grid>
        </CardContent>
      </Card>

      {/* Content based on view mode */}
      {viewMode === 'grouped' ? (
        /* Grouped View */
        <Box>
          {isLoading && <LinearProgress sx={{ mb: 2 }} />}
          {Object.entries(groupedProposals).map(([groupKey, proposals]) => {
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
                  <Box sx={{ display: 'flex', gap: 1 }}>
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
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <Chip
                                size="small"
                                label={proposalTypeLabels[proposal.type as ProposalType]}
                                color="primary"
                                variant="outlined"
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
                            </span>
                          }
                          secondary={
                            <span>
                              <Typography component="span" variant="body2" sx={{ display: 'block', mb: 1 }}>
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
                                    <span key={key} style={{ display: 'block', marginTop: '8px' }}>
                                      <Chip
                                        size="small"
                                        label={`${value.length} course(s) incluse(s)`}
                                        variant="outlined"
                                        color="info"
                                        sx={{ mr: 1, mb: 0.5 }}
                                      />
                                      {/* Afficher un aperçu des courses */}
                                      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                        Courses: {value.map((race: any) => race.raceName).slice(0, 3).join(', ')}
                                        {value.length > 3 && ` et ${value.length - 3} autre(s)...`}
                                      </Typography>
                                    </span>
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
                            </span>
                          }
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
              pageSizeOptions={[10, 25, 50]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
                sorting: { sortModel: [{ field: 'createdAt', sort: 'desc' }] },
              }}
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
    </Box>
  )
}

export default ProposalList