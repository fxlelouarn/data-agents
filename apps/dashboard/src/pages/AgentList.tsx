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
  Switch,
  FormControlLabel,
  IconButton,
  Chip,
  Grid,
  Avatar,
  Tooltip,
  LinearProgress,
} from '@mui/material'
import {
  Search as SearchIcon,
  PlayArrow as RunIcon,
  Settings as SettingsIcon,
  SmartToy as AgentIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Block as BlockIcon,
} from '@mui/icons-material'
import { DataGridPro, GridColDef } from '@mui/x-data-grid-pro'
import { useAgents, useToggleAgent, useRunAgent, useFailureReport, useLogs } from '@/hooks/useApi'
import { AgentType } from '@/types'

const agentTypeLabels: Record<AgentType, string> = {
  EXTRACTOR: 'Extracteur',
  COMPARATOR: 'Comparateur', 
  VALIDATOR: 'Validateur',
  CLEANER: 'Nettoyeur',
  DUPLICATOR: 'Duplicateur',
  SPECIFIC_FIELD: 'Champ spécifique',
}

const agentTypeColors: Record<AgentType, 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  EXTRACTOR: 'primary',
  COMPARATOR: 'secondary',
  VALIDATOR: 'success', 
  CLEANER: 'warning',
  DUPLICATOR: 'info',
  SPECIFIC_FIELD: 'error',
}

const AgentList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<AgentType | 'ALL'>('ALL')
  const [showInactive, setShowInactive] = useState(true)

  const { data: agentsData, isLoading } = useAgents({ 
    includeInactive: showInactive,
    type: typeFilter !== 'ALL' ? typeFilter : undefined,
  })
  const { data: failureReportData } = useFailureReport()
  const { data: logsData } = useLogs({
    level: 'WARN',
    // On cherche les logs des 24 dernières heures
  }, 50, 0)
  const toggleMutation = useToggleAgent()
  const runMutation = useRunAgent()
  
  // Create a map of agents that were auto-disabled
  const autoDisabledAgents = useMemo(() => {
    const map = new Set<string>()
    
    // Agents actuellement à risque ou qui devraient être désactivés
    if (failureReportData?.data?.agents) {
      failureReportData.data.agents.forEach(agent => {
        if (agent.shouldDisable) {
          map.add(agent.agentId)
        }
      })
    }
    
    // Agents désactivés automatiquement (via les logs)
    if (logsData?.data) {
      logsData.data.forEach(log => {
        if (log.message && log.message.includes('🚨 Agent automatiquement désactivé')) {
          map.add(log.agentId)
        }
      })
    }
    
    return map
  }, [failureReportData, logsData])

  // Filter agents based on search term
  const filteredAgents = useMemo(() => {
    if (!agentsData?.data) return []
    
    return agentsData.data.filter(agent => 
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [agentsData?.data, searchTerm])
  
  // Statistics for display
  const agentStats = useMemo(() => {
    if (!agentsData?.data) return { total: 0, active: 0, autoDisabled: 0, atRisk: 0 }
    
    const total = agentsData.data.length
    const active = agentsData.data.filter(agent => agent.isActive).length
    const autoDisabled = agentsData.data.filter(agent => 
      !agent.isActive && autoDisabledAgents.has(agent.id)
    ).length
    const atRisk = agentsData.data.filter(agent => 
      agent.isActive && autoDisabledAgents.has(agent.id)
    ).length
    
    return { total, active, autoDisabled, atRisk }
  }, [agentsData?.data, autoDisabledAgents])

  const handleToggleAgent = async (agentId: string) => {
    await toggleMutation.mutateAsync(agentId)
  }

  const handleRunAgent = async (agentId: string) => {
    await runMutation.mutateAsync(agentId)
  }

  const columns: GridColDef[] = [
    {
      field: 'icon',
      headerName: '',
      width: 60,
      sortable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <Avatar 
          sx={{ 
            width: 32, 
            height: 32,
            bgcolor: agentTypeColors[params.row.type as AgentType] + '.light',
            color: agentTypeColors[params.row.type as AgentType] + '.contrastText'
          }}
        >
          <AgentIcon sx={{ fontSize: 18 }} />
        </Avatar>
      ),
    },
    {
      field: 'name',
      headerName: 'Nom',
      width: 180,
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ fontWeight: 500, cursor: 'pointer' }}
          component={RouterLink}
          to={`/agents/${params.row.id}`}
          color="primary"
        >
          {params.row.name}
        </Typography>
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary">
          {params.value || 'Aucune description'}
        </Typography>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 120,
      renderCell: (params) => (
        <Chip
          size="small"
          label={agentTypeLabels[params.value as AgentType]}
          color={agentTypeColors[params.value as AgentType]}
          variant="outlined"
        />
      ),
    },
    {
      field: 'frequency',
      headerName: 'Fréquence',
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary">
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'isActive',
      headerName: 'État',
      width: 200,
      renderCell: (params) => {
        const hasErrors = params.row.configurationErrors && params.row.configurationErrors.length > 0;
        const hasOnlyWarnings = hasErrors && params.row.configurationErrors.every((error: any) => error.severity === 'warning');
        const hasCriticalErrors = hasErrors && params.row.configurationErrors.some((error: any) => error.severity === 'error');
        const isAutoDisabled = !params.value && autoDisabledAgents.has(params.row.id);
        const isAtRisk = autoDisabledAgents.has(params.row.id) && params.value;

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Switch
              checked={params.value}
              onChange={() => handleToggleAgent(params.row.id)}
              disabled={toggleMutation.isPending || hasCriticalErrors}
              size="small"
              sx={{
                // Style spécial pour les agents à risque
                ...(isAtRisk && {
                  '& .MuiSwitch-track': {
                    backgroundColor: 'warning.light'
                  }
                })
              }}
            />
            
            {/* Agent à risque (actif mais avec échecs) */}
            {isAtRisk && (
              <Tooltip title={
                <div>
                  <strong>⚠️ Agent à risque</strong><br/>
                  Cet agent accumule des échecs consécutifs.<br/>
                  Il sera désactivé automatiquement si les échecs continuent.
                </div>
              }>
                <Chip 
                  icon={<WarningIcon />}
                  label="À risque"
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ fontSize: 11, height: 20 }}
                />
              </Tooltip>
            )}
            
            {/* Agent désactivé automatiquement */}
            {isAutoDisabled && (
              <Tooltip title={
                <div>
                  <strong>🚨 Désactivé automatiquement</strong><br/>
                  Cet agent a été désactivé automatiquement<br/>
                  après plusieurs échecs consécutifs.<br/>
                  Vérifiez la configuration et réactivez-le manuellement.
                </div>
              }>
                <Chip 
                  icon={<BlockIcon />}
                  label="Auto-désactivé"
                  size="small"
                  color="error"
                  variant="filled"
                  sx={{ fontSize: 11, height: 20 }}
                />
              </Tooltip>
            )}
            
            {/* Erreurs de configuration */}
            {hasCriticalErrors && (
              <Tooltip title={`Erreurs de configuration : ${params.row.configurationErrors.filter((e: any) => e.severity === 'error').map((e: any) => e.message).join(', ')}`}>
                <ErrorIcon sx={{ color: 'error.main', fontSize: 16 }} />
              </Tooltip>
            )}
            
            {/* Avertissements (seulement si pas d'erreurs critiques et pas d'état spécial) */}
            {hasOnlyWarnings && !isAutoDisabled && !isAtRisk && (
              <Tooltip title={`Avertissements : ${params.row.configurationErrors.filter((e: any) => e.severity === 'warning').map((e: any) => e.message).join(', ')}`}>
                <WarningIcon sx={{ color: 'warning.main', fontSize: 16 }} />
              </Tooltip>
            )}
          </Box>
        )
      },
    },
    {
      field: '_count',
      headerName: 'Statistiques',
      width: 140,
      renderCell: (params) => (
        <Box>
          <Typography variant="caption" color="text.secondary">
            {params.value.runs} exécutions
          </Typography>
          <br />
          <Typography variant="caption" color="text.secondary">
            {params.value.proposals} propositions
          </Typography>
        </Box>
      ),
    },
    {
      field: 'updatedAt',
      headerName: 'Dernière MAJ',
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
      width: 120,
      sortable: false,
      renderCell: (params) => {
        const hasErrors = params.row.configurationErrors && params.row.configurationErrors.length > 0;
        const hasCriticalErrors = hasErrors && params.row.configurationErrors.some((error: any) => error.severity === 'error');
        const isAutoDisabled = !params.row.isActive && autoDisabledAgents.has(params.row.id);
        
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={
              hasCriticalErrors 
                ? "Impossible d'exécuter : erreurs de configuration critiques" 
                : params.row.isActive 
                ? "Exécuter maintenant" 
                : isAutoDisabled
                ? "Exécuter maintenant (agent auto-désactivé)"
                : "Exécuter maintenant (agent inactif)"
            }>
              <IconButton
                size="small"
                onClick={() => handleRunAgent(params.row.id)}
                disabled={hasCriticalErrors || runMutation.isPending}
                color={params.row.isActive ? "primary" : "warning"}
                sx={{
                  // Style spécial pour les agents inactifs
                  ...(!params.row.isActive && !hasCriticalErrors && {
                    '&:hover': {
                      backgroundColor: 'warning.light'
                    }
                  })
                }}
              >
                <RunIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Détails">
              <IconButton
                size="small"
                component={RouterLink}
                to={`/agents/${params.row.id}`}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )
      },
    },
  ]

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            Agents
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
            <Chip 
              label={`${agentStats.total} total`} 
              size="small" 
              variant="outlined" 
            />
            <Chip 
              label={`${agentStats.active} actifs`} 
              size="small" 
              color="success" 
              variant="outlined" 
            />
            {agentStats.atRisk > 0 && (
              <Chip 
                label={`${agentStats.atRisk} à risque`} 
                size="small" 
                color="warning" 
                variant="filled" 
              />
            )}
            {agentStats.autoDisabled > 0 && (
              <Chip 
                label={`${agentStats.autoDisabled} auto-désactivés`} 
                size="small" 
                color="error" 
                variant="filled" 
              />
            )}
          </Box>
        </Box>
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
                <InputLabel>Type d'agent</InputLabel>
                <Select
                  value={typeFilter}
                  label="Type d'agent"
                  onChange={(e) => setTypeFilter(e.target.value as AgentType | 'ALL')}
                >
                  <MenuItem value="ALL">Tous les types</MenuItem>
                  {Object.entries(agentTypeLabels).map(([type, label]) => (
                    <MenuItem key={type} value={type}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                  />
                }
                label="Inclure inactifs"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Agents Table */}
      <Card>
        <Box sx={{ height: 600 }}>
          {isLoading && <LinearProgress />}
          <DataGridPro
            rows={filteredAgents}
            columns={columns}
            pagination
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
              sorting: { sortModel: [{ field: 'updatedAt', sort: 'desc' }] },
            }}
            loading={isLoading}
            disableRowSelectionOnClick
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
    </Box>
  )
}

export default AgentList