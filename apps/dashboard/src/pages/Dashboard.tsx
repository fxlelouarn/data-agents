import React from 'react'
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  Alert,
} from '@mui/material'
import {
  SmartToy as AgentIcon,
  Assignment as ProposalIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'
import { useAgents, useProposals, useRuns, useHealth } from '@/hooks/useApi'

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactElement
  color?: 'primary' | 'success' | 'error' | 'warning' | 'info'
  loading?: boolean
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  icon, 
  color = 'primary',
  loading = false 
}) => {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box 
            sx={{ 
              p: 1, 
              borderRadius: 2, 
              bgcolor: `${color}.light`, 
              color: `${color}.contrastText`,
              mr: 2,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {icon}
          </Box>
          <Typography variant="h6" color="text.secondary">
            {title}
          </Typography>
        </Box>
        {loading ? (
          <LinearProgress sx={{ my: 1 }} />
        ) : (
          <Typography variant="h4" sx={{ fontWeight: 600 }}>
            {value}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

const Dashboard: React.FC = () => {
  const { data: agentsData, isLoading: agentsLoading } = useAgents()
  const { data: proposalsData, isLoading: proposalsLoading } = useProposals()
  const { data: runsData, isLoading: runsLoading } = useRuns({}, 10, 0)
  const { data: healthData, isLoading: healthLoading } = useHealth()

  const activeAgents = agentsData?.data?.filter(agent => agent.isActive).length || 0
  const totalAgents = agentsData?.data?.length || 0
  const pendingProposals = proposalsData?.data?.filter(p => p.status === 'PENDING').length || 0
  const recentRuns = runsData?.data || []
  const successfulRuns = recentRuns.filter(run => run.status === 'SUCCESS').length
  const failedRuns = recentRuns.filter(run => run.status === 'FAILED').length

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
        Tableau de bord
      </Typography>


      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Agents actifs"
            value={`${activeAgents} / ${totalAgents}`}
            icon={<AgentIcon />}
            color="primary"
            loading={agentsLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Propositions en attente"
            value={pendingProposals}
            icon={<ProposalIcon />}
            color="warning"
            loading={proposalsLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Exécutions réussies"
            value={successfulRuns}
            icon={<SuccessIcon />}
            color="success"
            loading={runsLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Exécutions échouées"
            value={failedRuns}
            icon={<ErrorIcon />}
            color="error"
            loading={runsLoading}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Recent Runs */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Exécutions récentes
              </Typography>
              {runsLoading ? (
                <LinearProgress />
              ) : recentRuns.length === 0 ? (
                <Typography color="text.secondary">
                  Aucune exécution récente
                </Typography>
              ) : (
                <Box>
                  {recentRuns.slice(0, 5).map((run) => (
                    <Box
                      key={run.id}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:last-child': { borderBottom: 'none' },
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {run.agent.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(run.startedAt).toLocaleString('fr-FR')}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {run.duration && (
                          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                            {Math.round(run.duration / 1000)}s
                          </Typography>
                        )}
                        <Chip
                          size="small"
                          label={run.status}
                          color={
                            run.status === 'SUCCESS' ? 'success' :
                            run.status === 'FAILED' ? 'error' :
                            run.status === 'RUNNING' ? 'info' : 'default'
                          }
                        />
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* System Info */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                État du système
              </Typography>
              {healthLoading ? (
                <LinearProgress />
              ) : healthData?.data ? (
                <Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Base de données
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                      <Chip
                        size="small"
                        icon={healthData.data.database.connected ? <SuccessIcon /> : <ErrorIcon />}
                        label={healthData.data.database.connected ? 'Connectée' : 'Déconnectée'}
                        color={healthData.data.database.connected ? 'success' : 'error'}
                      />
                      {healthData.data.database.connected && (
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          {healthData.data.database.latency}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Uptime
                    </Typography>
                    <Typography variant="body1">
                      {Math.round(healthData.data.uptime / 60)} minutes
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Tâches en cours
                    </Typography>
                    <Typography variant="body1">
                      {healthData.data.stats.runningJobs}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Version
                    </Typography>
                    <Typography variant="body1">
                      {healthData.data.version}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Alert severity="error">
                  Impossible de récupérer l'état du système
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard