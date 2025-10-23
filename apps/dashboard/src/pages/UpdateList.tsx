import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  TablePagination,
  TextField,
  MenuItem,
  Grid,
  LinearProgress,
  Alert,
  Checkbox,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material'
import {
  Visibility as ViewIcon,
  PlayArrow as ApplyIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { useUpdates, useApplyUpdate, useDeleteUpdate, useBulkDeleteUpdates, useBulkApplyUpdates } from '@/hooks/useApi'
import { DataUpdate, UpdateStatus } from '@/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const UpdateList: React.FC = () => {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [statusFilter, setStatusFilter] = useState<UpdateStatus | ''>("")
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    action: 'delete' | 'apply' | null
    count: number
  }>({ open: false, action: null, count: 0 })

  const { data: updatesData, isLoading, error } = useUpdates(
    {
      status: statusFilter || undefined,
      search: searchQuery || undefined,
    },
    rowsPerPage,
    page * rowsPerPage
  )

  const applyUpdateMutation = useApplyUpdate()
  const deleteUpdateMutation = useDeleteUpdate()
  const bulkDeleteMutation = useBulkDeleteUpdates()
  const bulkApplyMutation = useBulkApplyUpdates()

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const handleApplyUpdate = async (updateId: string) => {
    try {
      await applyUpdateMutation.mutateAsync(updateId)
    } catch (error) {
      console.error('Error applying update:', error)
    }
  }

  const handleDeleteUpdate = async (updateId: string) => {
    try {
      await deleteUpdateMutation.mutateAsync(updateId)
    } catch (error) {
      console.error('Error deleting update:', error)
    }
  }

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const allIds = updates.map((update: DataUpdate) => update.id)
      setSelectedIds(allIds)
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    )
  }

  const handleBulkDelete = () => {
    setConfirmDialog({ open: true, action: 'delete', count: selectedIds.length })
  }

  const handleBulkApply = () => {
    setConfirmDialog({ open: true, action: 'apply', count: selectedIds.length })
  }

  const confirmBulkAction = async () => {
    try {
      if (confirmDialog.action === 'delete') {
        await bulkDeleteMutation.mutateAsync(selectedIds)
      } else if (confirmDialog.action === 'apply') {
        await bulkApplyMutation.mutateAsync(selectedIds)
      }
      setSelectedIds([])
    } catch (error) {
      console.error('Error performing bulk action:', error)
    } finally {
      setConfirmDialog({ open: false, action: null, count: 0 })
    }
  }

  const cancelBulkAction = () => {
    setConfirmDialog({ open: false, action: null, count: 0 })
  }

  const getStatusColor = (status: UpdateStatus) => {
    switch (status) {
      case 'PENDING':
        return 'warning'
      case 'APPLIED':
        return 'success'
      case 'FAILED':
        return 'error'
      default:
        return 'default'
    }
  }

  const getStatusLabel = (status: UpdateStatus) => {
    switch (status) {
      case 'PENDING':
        return 'En attente'
      case 'APPLIED':
        return 'Appliquée'
      case 'FAILED':
        return 'Échec'
      default:
        return status
    }
  }

  const getProposalTypeLabel = (type: string) => {
    switch (type) {
      case 'NEW_EVENT':
        return 'Nouvel événement'
      case 'EVENT_UPDATE':
        return 'Mise à jour événement'
      case 'EDITION_UPDATE':
        return 'Mise à jour édition'
      case 'RACE_UPDATE':
        return 'Mise à jour course'
      default:
        return type
    }
  }

  const getUpdatePrimaryText = (update: DataUpdate) => {
    const { context } = update
    
    if (!context?.eventName) {
      return 'Mise à jour'
    }

    const parts = [context.eventName]
    
    if (context.editionYear) {
      parts.push(context.editionYear)
    }

    return parts.join(' - ')
  }

  const getUpdateSecondaryText = (update: DataUpdate) => {
    return getProposalTypeLabel(update.proposal.type)
  }

  if (isLoading) return <LinearProgress />

  if (error) {
    const isNotFound = (error as any)?.response?.status === 404
    return (
      <Card>
        <CardContent>
          {isNotFound ? (
            <Alert severity="info">
              <Typography variant="h6" gutterBottom>Fonctionnalité en cours de développement</Typography>
              <Typography variant="body2">
                L'API des mises à jour n'est pas encore implémentée dans le backend. 
                Cette fonctionnalité sera disponible prochainement.
              </Typography>
            </Alert>
          ) : (
            <Alert severity="error">Erreur lors du chargement des mises à jour</Alert>
          )}
        </CardContent>
      </Card>
    )
  }

  const updates = updatesData?.data || []
  const totalCount = updatesData?.meta?.total || 0
  const numSelected = selectedIds.length
  const numPendingSelected = selectedIds.filter(id => {
    const update = updates.find((u: DataUpdate) => u.id === id)
    return update?.status === 'PENDING'
  }).length

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Mises à jour
      </Typography>
      
      {/* Filtres */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Rechercher"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ID proposition, agent..."
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                select
                label="Statut"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as UpdateStatus | '')}
                size="small"
              >
                <MenuItem value="">Tous les statuts</MenuItem>
                <MenuItem value="PENDING">En attente</MenuItem>
                <MenuItem value="APPLIED">Appliquées</MenuItem>
                <MenuItem value="FAILED">Échecs</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Actions bulk */}
      {numSelected > 0 && (
        <Card sx={{ mb: 2, bgcolor: 'primary.50', borderColor: 'primary.main', borderWidth: 1, borderStyle: 'solid' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {numSelected} mise(s) à jour sélectionnée(s)
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {numPendingSelected > 0 && (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<ApplyIcon />}
                    onClick={handleBulkApply}
                    disabled={bulkApplyMutation.isPending || bulkDeleteMutation.isPending}
                  >
                    Appliquer ({numPendingSelected})
                  </Button>
                )}
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleBulkDelete}
                  disabled={bulkApplyMutation.isPending || bulkDeleteMutation.isPending}
                >
                  Supprimer ({numSelected})
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Tableau des mises à jour */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={numSelected > 0 && numSelected < updates.length}
                      checked={updates.length > 0 && numSelected === updates.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Mise à jour</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>Programmée le</TableCell>
                  <TableCell>Appliquée le</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {updates.map((update: DataUpdate) => {
                  const isSelected = selectedIds.includes(update.id)
                  return (
                  <TableRow key={update.id} hover selected={isSelected}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleSelectOne(update.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Box component={Link} to={`/proposals/${update.proposalId}`} sx={{ textDecoration: 'none', display: 'block' }}>
                        <Typography 
                          variant="body1" 
                          sx={{ color: 'primary.main', fontWeight: 600, mb: 0.5 }}
                        >
                          {getUpdatePrimaryText(update)}
                        </Typography>
                        <Typography 
                          variant="caption" 
                          sx={{ color: 'text.secondary' }}
                        >
                          {getUpdateSecondaryText(update)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{update.proposal.agent.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {getProposalTypeLabel(update.proposal.type)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getStatusLabel(update.status)}
                        color={getStatusColor(update.status) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {update.scheduledAt
                          ? format(new Date(update.scheduledAt), 'dd/MM/yyyy HH:mm', { locale: fr })
                          : '-'
                        }
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {update.appliedAt
                          ? format(new Date(update.appliedAt), 'dd/MM/yyyy HH:mm', { locale: fr })
                          : '-'
                        }
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Tooltip title="Voir les détails">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/updates/${update.id}`)}
                          >
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        
                        {update.status === 'PENDING' && (
                          <Tooltip title="Appliquer maintenant">
                            <span>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleApplyUpdate(update.id)}
                                disabled={applyUpdateMutation.isPending}
                              >
                                <ApplyIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        
                        {update.status === 'APPLIED' && (
                          <Tooltip title="Supprimer">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteUpdate(update.id)}
                                disabled={deleteUpdateMutation.isPending}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                  )
                })}
                {updates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                        Aucune mise à jour trouvée
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          
          <TablePagination
            rowsPerPageOptions={[10, 20, 50]}
            component="div"
            count={totalCount}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="Lignes par page:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} sur ${count}`}
          />
        </CardContent>
      </Card>

      {/* Dialog de confirmation */}
      <Dialog open={confirmDialog.open} onClose={cancelBulkAction}>
        <DialogTitle>
          {confirmDialog.action === 'delete' ? 'Confirmer la suppression' : 'Confirmer l\'application'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDialog.action === 'delete' 
              ? `Êtes-vous sûr de vouloir supprimer ${confirmDialog.count} mise(s) à jour ? Cette action est irréversible.`
              : `Êtes-vous sûr de vouloir appliquer ${numPendingSelected} mise(s) à jour en attente ?`
            }
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelBulkAction}>Annuler</Button>
          <Button 
            onClick={confirmBulkAction} 
            color={confirmDialog.action === 'delete' ? 'error' : 'primary'}
            variant="contained"
            disabled={bulkApplyMutation.isPending || bulkDeleteMutation.isPending}
          >
            Confirmer
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default UpdateList
