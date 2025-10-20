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
} from '@mui/material'
import {
  Visibility as ViewIcon,
  PlayArrow as ApplyIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { useUpdates, useApplyUpdate, useDeleteUpdate } from '@/hooks/useApi'
import { DataUpdate, UpdateStatus } from '@/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const UpdateList: React.FC = () => {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [statusFilter, setStatusFilter] = useState<UpdateStatus | ''>("")
  const [searchQuery, setSearchQuery] = useState('')

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

      {/* Tableau des mises à jour */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Proposition</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>Programmée le</TableCell>
                  <TableCell>Appliquée le</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {updates.map((update: DataUpdate) => (
                  <TableRow key={update.id} hover>
                    <TableCell>
                      <Typography variant="body2" component={Link} to={`/proposals/${update.proposalId}`} sx={{ textDecoration: 'none', color: 'primary.main' }}>
                        {update.proposalId.slice(-8)}
                      </Typography>
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
                ))}
                {updates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
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
    </Box>
  )
}

export default UpdateList
