import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress
} from '@mui/material'
import {
  Analytics as AnalyticsIcon
} from '@mui/icons-material'
import { useAgentState, useEligibleProposalsCount } from '@/hooks/useApi'

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
  lastRunAt?: string
}

const ValidatorStatsCard: React.FC<ValidatorStatsCardProps> = ({ agentId, agentName }) => {
  const { data: stateData, isLoading: isLoadingState } = useAgentState(agentId)
  const { data: eligibleData, isLoading: isLoadingEligible } = useEligibleProposalsCount()

  if (isLoadingState || isLoadingEligible) {
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
    return null
  }

  // Nombre actuel de propositions éligibles (temps réel depuis l'API)
  const totalEligible = eligibleData?.data?.count ?? 0
  const totalProcessed = stats.totalProposalsValidated

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AnalyticsIcon />
          Statistiques
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Dernier run */}
          {stats.lastRunAt && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                Dernier run
              </Typography>
              <Typography variant="body2" fontWeight="medium">
                {new Date(stats.lastRunAt).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })} {new Date(stats.lastRunAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Typography>
            </Box>
          )}

          {/* Exécutions réussies */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Exécutions réussies
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {stats.successfulRuns} / {stats.totalRuns}
            </Typography>
          </Box>

          {/* Propositions traitées */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Propositions traitées
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {totalProcessed} / {totalEligible}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export default ValidatorStatsCard
