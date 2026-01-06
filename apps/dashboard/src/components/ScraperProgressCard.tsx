import React from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Grid,
  Alert,
  Divider
} from '@mui/material'
import {
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material'
import { useAgentState } from '@/hooks/useApi'

interface ScraperProgressCardProps {
  agentId: string
  agentName: string
  cooldownDays?: number  // rescanDelayDays depuis la config de l'agent
}

interface FFAProgress {
  currentLigue: string
  currentMonth: string
  currentPage: number
  completedLigues: string[]
  completedMonths: Record<string, string[]>
  lastCompletedAt?: string
  totalCompetitionsScraped: number
}

const FFA_LIGUES = [
  'ARA', 'BFC', 'BRE', 'CEN', 'COR', 'G-E', 'GUA', 'GUY', 'H-F', 'I-F',
  'MAR', 'MAY', 'N-A', 'N-C', 'NOR', 'OCC', 'PCA', 'P-F', 'P-L', 'REU', 'W-F'
]

const ScraperProgressCard: React.FC<ScraperProgressCardProps> = ({ agentId, agentName, cooldownDays: propCooldownDays }) => {
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

  const progress = stateData?.data?.progress as FFAProgress | undefined

  if (!progress) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">
            Aucune progression enregistrée. L'agent démarrera au prochain run.
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Calculer la progression globale (ne compter que les ligues valides de FFA_LIGUES)
  const totalLigues = FFA_LIGUES.length
  const completedLiguesCount = FFA_LIGUES.filter(ligue => {
    const monthsForLigue = progress.completedMonths?.[ligue]
    return monthsForLigue && monthsForLigue.length > 0
  }).length
  const progressPercent = (completedLiguesCount / totalLigues) * 100

  // Vérifier si toutes les ligues sont complètement terminées
  // Pour être en cooldown, TOUTES les ligues doivent avoir été scrapées
  const allLiguesCompleted = FFA_LIGUES.every(ligue => {
    const monthsForLigue = progress.completedMonths?.[ligue]
    return monthsForLigue && monthsForLigue.length > 0
  })

  // Calculer le temps écoulé depuis le dernier cycle complet
  const cooldownDays = propCooldownDays || 30 // Utilise la config de l'agent ou 30j par défaut
  let daysSinceLastComplete = null
  let remainingDays = null
  let isInCooldown = false

  // Le cooldown ne s'applique que si TOUTES les ligues sont complétées
  if (allLiguesCompleted && progress.lastCompletedAt) {
    const lastCompleted = new Date(progress.lastCompletedAt)
    const now = new Date()
    daysSinceLastComplete = Math.floor((now.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24))
    remainingDays = Math.max(0, cooldownDays - daysSinceLastComplete)
    isInCooldown = remainingDays > 0
  }

  // Déterminer la prochaine cible (ligue + mois)
  const nextLigue = progress.currentLigue
  const nextMonth = progress.currentMonth

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RefreshIcon />
            Progression du scraping
          </Typography>
          {isInCooldown && (
            <Chip
              icon={<ScheduleIcon />}
              label={`Cooldown: ${remainingDays}j`}
              color="warning"
              size="small"
            />
          )}
        </Box>

        {/* Barre de progression */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Progression du cycle
            </Typography>
            <Typography variant="body2" color="text.secondary" fontWeight="medium">
              {completedLiguesCount} / {totalLigues} ligues
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>

        {/* Prochain (afficher seulement si on a une cible) */}
        {(nextLigue || nextMonth) && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom fontWeight="medium">
              Prochain :
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, ml: 1, alignItems: 'center' }}>
              {nextLigue && <Chip label={nextLigue} size="small" color="primary" />}
              {nextMonth && <Chip label={nextMonth} size="small" variant="outlined" />}
            </Box>
          </Box>
        )}

        {/* Réalisé */}
        {Object.keys(progress.completedMonths || {}).length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom fontWeight="medium">
              Réalisé :
            </Typography>
            <Box sx={{ ml: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {Object.entries(progress.completedMonths)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([ligue, months]) => (
                  <Box
                    key={ligue}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: 0.5,
                      alignItems: 'start'
                    }}
                  >
                    <Chip label={ligue} size="small" color="default" />
                    <Box sx={{
                      display: 'flex',
                      gap: 0.5,
                      flexWrap: 'wrap'
                    }}>
                      {months
                        .sort((a, b) => a.localeCompare(b))
                        .map(month => (
                          <Chip
                            key={month}
                            label={month}
                            size="small"
                            variant="outlined"
                          />
                        ))
                      }
                    </Box>
                  </Box>
                ))
              }
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Statistiques compactes */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Compétitions scrapées
            </Typography>
            <Typography variant="h5" color="primary" fontWeight="medium">
              {progress.totalCompetitionsScraped.toLocaleString()}
            </Typography>
          </Box>

          {allLiguesCompleted && progress.lastCompletedAt && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" color="text.secondary">
                Dernier cycle complet
              </Typography>
              <Typography variant="body2">
                {new Date(progress.lastCompletedAt).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Typography>
            </Box>
          )}
        </Box>

        {isInCooldown && remainingDays !== null && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Cycle complet terminé. Reprise dans {remainingDays} jour{remainingDays > 1 ? 's' : ''}.
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

export default ScraperProgressCard
