import React, { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
} from '@mui/material'
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material'
import { useAgent } from '@/hooks/useApi'

const LOGS_PER_PAGE = 50

const AgentLogs: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [levelFilter, setLevelFilter] = useState<string>('ALL')
  const [page, setPage] = useState(1)

  // Fetch agent with logs
  const { data: agentData, isLoading } = useAgent(id!)
  const agent = agentData?.data

  // Filter and paginate logs
  const filteredLogs = useMemo(() => {
    if (!agent?.logs) return []
    if (levelFilter === 'ALL') return agent.logs
    return agent.logs.filter((log: any) => log.level === levelFilter)
  }, [agent?.logs, levelFilter])

  const totalPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE)
  const paginatedLogs = filteredLogs.slice((page - 1) * LOGS_PER_PAGE, page * LOGS_PER_PAGE)

  const handleLogClick = (log: any) => {
    setSelectedLog(log)
  }

  const handleCloseDialog = () => {
    setSelectedLog(null)
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'error'
      case 'WARN':
        return 'warning'
      case 'INFO':
        return 'info'
      case 'DEBUG':
        return 'default'
      default:
        return 'default'
    }
  }

  if (isLoading) {
    return <LinearProgress />
  }

  if (!agent) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Agent non trouvé</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button
          component={Link}
          to={`/agents/${id}`}
          startIcon={<ArrowBackIcon />}
          variant="outlined"
        >
          Retour
        </Button>
        <Typography variant="h4">Logs de {agent.name}</Typography>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Niveau</InputLabel>
              <Select
                value={levelFilter}
                label="Niveau"
                onChange={(e) => {
                  setLevelFilter(e.target.value)
                  setPage(1)
                }}
              >
                <MenuItem value="ALL">Tous</MenuItem>
                <MenuItem value="ERROR">ERROR</MenuItem>
                <MenuItem value="WARN">WARN</MenuItem>
                <MenuItem value="INFO">INFO</MenuItem>
                <MenuItem value="DEBUG">DEBUG</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary">
              {filteredLogs.length} logs trouvés
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Logs list */}
      <Card>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <Typography color="text.secondary">Aucun log disponible</Typography>
          ) : (
            <>
              <List dense>
                {paginatedLogs.map((log: any) => (
                  <ListItem
                    key={log.id}
                    button
                    onClick={() => handleLogClick(log)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={log.level}
                            size="small"
                            color={getLevelColor(log.level) as any}
                          />
                          <Typography variant="body2" sx={{ flex: 1 }}>
                            {log.message}
                          </Typography>
                          {log.data && Object.keys(log.data).length > 0 && (
                            <Chip label="+" size="small" variant="outlined" sx={{ minWidth: 24 }} />
                          )}
                        </Box>
                      }
                      secondary={new Date(log.timestamp).toLocaleString('fr-FR')}
                    />
                  </ListItem>
                ))}
              </List>

              {/* Pagination */}
              {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                  <Pagination
                    count={totalPages}
                    page={page}
                    onChange={(_, newPage) => setPage(newPage)}
                    color="primary"
                  />
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Log detail dialog */}
      <Dialog open={!!selectedLog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={selectedLog?.level}
              size="small"
              color={getLevelColor(selectedLog?.level) as any}
            />
            <Typography>Détail du log</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="subtitle2" gutterBottom>
              Date : {selectedLog && new Date(selectedLog.timestamp).toLocaleString('fr-FR')}
            </Typography>
            <Typography variant="subtitle2" gutterBottom>
              Message :
            </Typography>
            <Typography
              variant="body2"
              sx={(theme) => ({
                backgroundColor:
                  theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
                p: 1,
                borderRadius: 1,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                mb: 2,
              })}
            >
              {selectedLog?.message}
            </Typography>
            {selectedLog?.data && (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  Données :
                </Typography>
                <Box
                  component="pre"
                  sx={(theme) => ({
                    backgroundColor:
                      theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
                    p: 1,
                    borderRadius: 1,
                    overflow: 'auto',
                    maxHeight: 400,
                    fontSize: '0.75rem',
                  })}
                >
                  {JSON.stringify(selectedLog.data, null, 2)}
                </Box>
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default AgentLogs
