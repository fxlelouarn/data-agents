import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Grid,
  Alert,
  Divider,
  LinearProgress
} from '@mui/material'
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Schedule as ScheduleIcon,
  Analytics as AnalyticsIcon,
  Block as BlockIcon
} from '@mui/icons-material'
import { useAgentState } from '@/hooks/useApi'

interface ValidatorStatsCardProps {
  agentId: string
  agentName: string
}

interface AutoValidatorStats {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  totalProposalsAnalyzed: number
  totalProposalsValidated: number
  totalProposalsIgnored: number
  exclusionBreakdown: {
    featuredEvent: number
    premiumCustomer: number
    newRaces: number
    lowConfidence: number
    otherAgent: number
  }
  lastRunAt?: string
}

const ValidatorStatsCard: React.FC<ValidatorStatsCardProps> = ({ agentId, agentName }) => {
  const { data: stateData, isLoading } = useAgentState(agentId)

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <LinearProgress />
        </CardContent>
      </Card>
    )
  }

  const stats = stateData?.data?.stats as AutoValidatorStats | undefined

  if (!stats) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AnalyticsIcon />
            Statistiques
          </Typography>
          <Alert severity="info">
            Aucune statistique enregistrée. L'agent n'a pas encore été exécuté.
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Calcul du taux de succès des runs
  const runSuccessRate = stats.totalRuns > 0
    ? Math.round((stats.successfulRuns / stats.totalRuns) * 100)
    : 0

  // Calcul du taux de validation des propositions
  const validationRate = stats.totalProposalsAnalyzed > 0
    ? Math.round((stats.totalProposalsValidated / stats.totalProposalsAnalyzed) * 100)
    : 0

  // Total des exclusions
  const totalExclusions = Object.values(stats.exclusionBreakdown).reduce((a, b) => a + b, 0)

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AnalyticsIcon />
            Statistiques
          </Typography>
          {stats.lastRunAt && (
            <Chip
              icon={<ScheduleIcon />}
              label={`Dernier run: ${new Date(stats.lastRunAt).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}`}
              size="small"
              variant="outlined"
            />
          )}
        </Box>

        {/* Statistiques des runs */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={4}>
            <Box sx={{ textAlign: 'center', p: 1.5, backgroundColor: 'grey.100', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight="bold" color="text.primary">
                {stats.totalRuns}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Exécutions
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={4}>
            <Box sx={{ textAlign: 'center', p: 1.5, backgroundColor: 'success.light', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight="bold" color="success.contrastText">
                {stats.successfulRuns}
              </Typography>
              <Typography variant="caption" color="success.contrastText">
                Succès
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={4}>
            <Box sx={{ textAlign: 'center', p: 1.5, backgroundColor: stats.failedRuns > 0 ? 'error.light' : 'grey.100', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight="bold" color={stats.failedRuns > 0 ? 'error.contrastText' : 'text.primary'}>
                {stats.failedRuns}
              </Typography>
              <Typography variant="caption" color={stats.failedRuns > 0 ? 'error.contrastText' : 'text.secondary'}>
                Échecs
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Statistiques des propositions */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Propositions traitées
        </Typography>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={4}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" fontWeight="bold" color="text.primary">
                {stats.totalProposalsAnalyzed.toLocaleString()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Analysées
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={4}>
            <Box sx={{ textAlign: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                <CheckCircleIcon color="success" fontSize="small" />
                <Typography variant="h5" fontWeight="bold" color="success.main">
                  {stats.totalProposalsValidated.toLocaleString()}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Validées
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={4}>
            <Box sx={{ textAlign: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                <CancelIcon color="warning" fontSize="small" />
                <Typography variant="h5" fontWeight="bold" color="warning.main">
                  {stats.totalProposalsIgnored.toLocaleString()}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Ignorées
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Barre de progression du taux de validation */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Taux de validation
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight="medium">
              {validationRate}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={validationRate}
            color="success"
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        {/* Raisons d'exclusion */}
        {totalExclusions > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BlockIcon fontSize="small" />
              Raisons d'exclusion ({totalExclusions})
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {stats.exclusionBreakdown.featuredEvent > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Événement featured
                  </Typography>
                  <Chip label={stats.exclusionBreakdown.featuredEvent} size="small" />
                </Box>
              )}
              {stats.exclusionBreakdown.premiumCustomer > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Client premium
                  </Typography>
                  <Chip label={stats.exclusionBreakdown.premiumCustomer} size="small" />
                </Box>
              )}
              {stats.exclusionBreakdown.newRaces > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Nouvelles courses
                  </Typography>
                  <Chip label={stats.exclusionBreakdown.newRaces} size="small" />
                </Box>
              )}
              {stats.exclusionBreakdown.lowConfidence > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Confiance faible
                  </Typography>
                  <Chip label={stats.exclusionBreakdown.lowConfidence} size="small" />
                </Box>
              )}
              {stats.exclusionBreakdown.otherAgent > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Autre agent
                  </Typography>
                  <Chip label={stats.exclusionBreakdown.otherAgent} size="small" />
                </Box>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default ValidatorStatsCard
