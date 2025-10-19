import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  LinearProgress, 
  Button,
  List,
  ListItem,
  ListItemText,
  Chip,
  Alert,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import { 
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material'
import { useAgent, useLogs } from '@/hooks/useApi'

const AgentLogs: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [levelFilter, setLevelFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [logDetailDialogOpen, setLogDetailDialogOpen] = useState(false)
  
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const { data: agentData, isLoading: agentLoading } = useAgent(id!)
  const { data: logsData, isLoading: logsLoading } = useLogs(
    { 
      agentId: id,
      level: levelFilter ? levelFilter as any : undefined,
      search: searchFilter || undefined
    }, 
    pageSize, 
    offset
  )

  const handleBackToAgent = () => {
    navigate(`/agents/${id}`)
  }

  const handleLogClick = (log: any) => {
    setSelectedLog(log)
    setLogDetailDialogOpen(true)
  }

  const handleLogDetailClose = () => {
    setLogDetailDialogOpen(false)
    setSelectedLog(null)
  }

  const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => {
    setPage(value)
  }

  const handleLevelFilterChange = (event: any) => {
    setLevelFilter(event.target.value)
    setPage(1) // Reset to first page when filtering
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchFilter(event.target.value)
    setPage(1) // Reset to first page when searching
  }

  if (agentLoading) return <LinearProgress />

  if (!agentData?.data) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Agent non trouvé</Alert>
        </CardContent>
      </Card>
    )
  }

  const agent = agentData.data
  const logs = logsData?.data || []
  const totalLogs = logsData?.meta?.total || 0
  const totalPages = Math.ceil(totalLogs / pageSize)

  return (
    <Box>
      {/* En-tête avec navigation */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={handleBackToAgent}
          >
            Retour à l'agent
          </Button>
        </Box>
        
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Logs - {agent.name}
        </Typography>
      </Box>

      {/* Filtres */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Niveau</InputLabel>
              <Select
                value={levelFilter}
                label="Niveau"
                onChange={handleLevelFilterChange}
              >
                <MenuItem value="">Tous</MenuItem>
                <MenuItem value="DEBUG">DEBUG</MenuItem>
                <MenuItem value="INFO">INFO</MenuItem>
                <MenuItem value="WARN">WARN</MenuItem>
                <MenuItem value="ERROR">ERROR</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              size="small"
              label="Rechercher dans les messages"
              variant="outlined"
              value={searchFilter}
              onChange={handleSearchChange}
              sx={{ flexGrow: 1, maxWidth: 400 }}
            />
            
            <Typography variant="body2" color="text.secondary">
              {totalLogs} log{totalLogs > 1 ? 's' : ''} au total
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {/* Liste des logs */}
      <Card>
        <CardContent>
          {logsLoading ? (
            <LinearProgress />
          ) : logs.length === 0 ? (
            <Alert severity="info">
              Aucun log trouvé {levelFilter || searchFilter ? 'avec ces critères' : 'pour cet agent'}
            </Alert>
          ) : (
            <>
              <List>
                {logs.map((log: any, index: number) => (
                  <ListItem 
                    key={log.id} 
                    component="div"
                    onClick={() => handleLogClick(log)}
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                      borderBottom: index < logs.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider'
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Chip
                            size="small" 
                            label={log.level}
                            color={log.level === 'ERROR' ? 'error' : 
                                   log.level === 'WARN' ? 'warning' : 
                                   log.level === 'DEBUG' ? 'default' : 'info'}
                          />
                          <Typography variant="body2" color="text.secondary">
                            {new Date(log.timestamp).toLocaleString('fr-FR')}
                          </Typography>
                          {log.runId && (
                            <Chip
                              size="small"
                              label={`Run: ${log.runId.substring(0, 8)}...`}
                              variant="outlined"
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {log.message.length > 120 ? `${log.message.substring(0, 120)}...` : log.message}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>

              {/* Pagination */}
              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                  <Pagination 
                    count={totalPages}
                    page={page}
                    onChange={handlePageChange}
                    color="primary"
                  />
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog des détails du log */}
      <Dialog
        open={logDetailDialogOpen}
        onClose={handleLogDetailClose}
        maxWidth="md"
        fullWidth
        aria-labelledby="log-detail-dialog-title"
      >
        <DialogTitle id="log-detail-dialog-title">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            Détails du log
            {selectedLog && (
              <Chip
                size="small" 
                label={selectedLog.level}
                color={selectedLog.level === 'ERROR' ? 'error' : 
                       selectedLog.level === 'WARN' ? 'warning' : 'info'}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedLog && (
            <Box sx={{ mt: 1 }}>
              {/* Informations générales */}
              <Typography variant="h6" gutterBottom>Informations générales</Typography>
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Horodatage" 
                    secondary={new Date(selectedLog.timestamp).toLocaleString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Niveau" secondary={selectedLog.level} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Run ID" secondary={selectedLog.runId || 'Non spécifié'} />
                </ListItem>
              </List>
              
              {/* Message */}
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Message</Typography>
              <Box
                sx={{
                  backgroundColor: '#f5f5f5',
                  padding: 2,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {selectedLog.message}
              </Box>
              
              {/* Données additionnelles */}
              {selectedLog.data && Object.keys(selectedLog.data).length > 0 && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Données additionnelles</Typography>
                  <Box
                    sx={{
                      backgroundColor: '#f5f5f5',
                      padding: 2,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}
                  >
                    <pre>{JSON.stringify(selectedLog.data, null, 2)}</pre>
                  </Box>
                </>
              )}
              
              {/* Métadonnées */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Métadonnées</Typography>
                  <Box
                    sx={{
                      backgroundColor: '#f5f5f5',
                      padding: 2,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}
                  >
                    <pre>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleLogDetailClose}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default AgentLogs