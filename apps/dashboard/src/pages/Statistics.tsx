import React, { useState, useMemo } from 'react'
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Avatar,
  useTheme
} from '@mui/material'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList
} from 'recharts'
import {
  TrendingUp as TrendingUpIcon,
  EmojiEvents as TrophyIcon
} from '@mui/icons-material'
import { useCalendarConfirmations, usePendingConfirmations, useProposalsCreated, useUserLeaderboard } from '@/hooks/useApi'
import { format, subDays, subMonths } from 'date-fns'
import { proposalTypeLabels, proposalTypeColors } from '@/constants/proposals'

type TimeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

const Statistics: React.FC = () => {
  const theme = useTheme()

  // Filtres pour confirmations calendrier
  const [confirmationsGranularity, setConfirmationsGranularity] = useState<TimeGranularity>('month')
  const [confirmationsStartDate, setConfirmationsStartDate] = useState(
    format(subMonths(new Date(), 3), 'yyyy-MM-dd')
  )
  const [confirmationsEndDate, setConfirmationsEndDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  )

  // Filtres pour éditions TO_BE_CONFIRMED (événements futurs)
  const [pendingGranularity, setPendingGranularity] = useState<TimeGranularity>('month')
  const [pendingStartDate, setPendingStartDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  )
  const [pendingEndDate, setPendingEndDate] = useState(
    format(subMonths(new Date(), -6), 'yyyy-MM-dd') // 6 mois dans le futur
  )

  // Filtres pour propositions créées
  const [proposalsGranularity, setProposalsGranularity] = useState<TimeGranularity>('month')
  const [proposalsStartDate, setProposalsStartDate] = useState(
    format(subMonths(new Date(), 3), 'yyyy-MM-dd')
  )
  const [proposalsEndDate, setProposalsEndDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  )

  // Filtres pour leaderboard
  const [leaderboardStartDate, setLeaderboardStartDate] = useState(
    format(subDays(new Date(), 30), 'yyyy-MM-dd')
  )
  const [leaderboardEndDate, setLeaderboardEndDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  )

  // Récupérer les données
  const { data: confirmationsData, isLoading: confirmationsLoading } = useCalendarConfirmations({
    startDate: confirmationsStartDate,
    endDate: confirmationsEndDate,
    granularity: confirmationsGranularity
  })

  const { data: pendingData, isLoading: pendingLoading } = usePendingConfirmations({
    startDate: pendingStartDate,
    endDate: pendingEndDate,
    granularity: pendingGranularity
  })

  const { data: proposalsData, isLoading: proposalsLoading } = useProposalsCreated({
    startDate: proposalsStartDate,
    endDate: proposalsEndDate,
    granularity: proposalsGranularity
  })

  const { data: leaderboardData, isLoading: leaderboardLoading } = useUserLeaderboard({
    startDate: leaderboardStartDate,
    endDate: leaderboardEndDate
  })

  // Formater les données pour les graphiques
  const confirmationsChartData = useMemo(() => {
    if (!confirmationsData?.data?.results) return []
    return confirmationsData.data.results.map(item => ({
      date: item.date,
      Confirmations: item.count
    }))
  }, [confirmationsData])

  const pendingChartData = useMemo(() => {
    if (!pendingData?.data?.results) return []
    return pendingData.data.results.map(item => ({
      date: item.date,
      'Confirmées': item.confirmed || 0,
      'À confirmer': item.toBeConfirmed || 0,
      'Total': item.total || 0
    }))
  }, [pendingData])

  const proposalsChartData = useMemo(() => {
    if (!proposalsData?.data?.results) return []
    return proposalsData.data.results.map(item => ({
      date: item.date,
      'NEW_EVENT': item.NEW_EVENT,
      'EVENT_UPDATE': item.EVENT_UPDATE,
      'EDITION_UPDATE': item.EDITION_UPDATE,
      'RACE_UPDATE': item.RACE_UPDATE,
      'Total': item.total
    }))
  }, [proposalsData])

  const leaderboard = useMemo(() => {
    if (!leaderboardData?.data?.leaderboard) return []
    return leaderboardData.data.leaderboard
  }, [leaderboardData])

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
        Statistiques
      </Typography>

      {/* Confirmations calendrier */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <TrendingUpIcon sx={{ mr: 1 }} />
              Évolution des confirmations calendrier
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Début"
                type="date"
                value={confirmationsStartDate}
                onChange={(e) => setConfirmationsStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <TextField
                label="Fin"
                type="date"
                value={confirmationsEndDate}
                onChange={(e) => setConfirmationsEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Granularité</InputLabel>
                <Select
                  value={confirmationsGranularity}
                  label="Granularité"
                  onChange={(e) => setConfirmationsGranularity(e.target.value as TimeGranularity)}
                >
                  <MenuItem value="day">Jour</MenuItem>
                  <MenuItem value="week">Semaine</MenuItem>
                  <MenuItem value="month">Mois</MenuItem>
                  <MenuItem value="quarter">Trimestre</MenuItem>
                  <MenuItem value="year">Année</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {confirmationsLoading ? (
            <LinearProgress />
          ) : confirmationsChartData.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Aucune donnée disponible pour cette période
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={confirmationsChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Confirmations"
                  stroke="#8884d8"
                  strokeWidth={2}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Éditions futures (confirmées et à confirmer) */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <TrendingUpIcon sx={{ mr: 1 }} />
              Éditions futures par statut
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Début"
                type="date"
                value={pendingStartDate}
                onChange={(e) => setPendingStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <TextField
                label="Fin"
                type="date"
                value={pendingEndDate}
                onChange={(e) => setPendingEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Granularité</InputLabel>
                <Select
                  value={pendingGranularity}
                  label="Granularité"
                  onChange={(e) => setPendingGranularity(e.target.value as TimeGranularity)}
                >
                  <MenuItem value="day">Jour</MenuItem>
                  <MenuItem value="week">Semaine</MenuItem>
                  <MenuItem value="month">Mois</MenuItem>
                  <MenuItem value="quarter">Trimestre</MenuItem>
                  <MenuItem value="year">Année</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {pendingLoading ? (
            <LinearProgress />
          ) : pendingChartData.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Aucune donnée disponible pour cette période
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pendingChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="Confirmées"
                  stackId="a"
                  fill="#22c55e"
                  name="Confirmées"
                />
                <Bar
                  dataKey="À confirmer"
                  stackId="a"
                  fill="#f59e0b"
                  name="À confirmer"
                >
                  <LabelList
                    dataKey="Total"
                    position="top"
                    style={{ fill: theme.palette.text.primary, fontWeight: 'bold', fontSize: 12 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Propositions créées */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <TrendingUpIcon sx={{ mr: 1 }} />
              Évolution des propositions créées par type
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Début"
                type="date"
                value={proposalsStartDate}
                onChange={(e) => setProposalsStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <TextField
                label="Fin"
                type="date"
                value={proposalsEndDate}
                onChange={(e) => setProposalsEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Granularité</InputLabel>
                <Select
                  value={proposalsGranularity}
                  label="Granularité"
                  onChange={(e) => setProposalsGranularity(e.target.value as TimeGranularity)}
                >
                  <MenuItem value="day">Jour</MenuItem>
                  <MenuItem value="week">Semaine</MenuItem>
                  <MenuItem value="month">Mois</MenuItem>
                  <MenuItem value="quarter">Trimestre</MenuItem>
                  <MenuItem value="year">Année</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {proposalsLoading ? (
            <LinearProgress />
          ) : proposalsChartData.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Aucune donnée disponible pour cette période
            </Typography>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={proposalsChartData} margin={{ top: 30, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  formatter={(value, name) => [value, proposalTypeLabels[name as keyof typeof proposalTypeLabels] || name]}
                />
                <Legend
                  formatter={(value) => proposalTypeLabels[value as keyof typeof proposalTypeLabels] || value}
                />
                <Bar dataKey="NEW_EVENT" stackId="a" fill={proposalTypeColors.NEW_EVENT} name="NEW_EVENT" />
                <Bar dataKey="EVENT_UPDATE" stackId="a" fill={proposalTypeColors.EVENT_UPDATE} name="EVENT_UPDATE" />
                <Bar dataKey="EDITION_UPDATE" stackId="a" fill={proposalTypeColors.EDITION_UPDATE} name="EDITION_UPDATE" />
                <Bar dataKey="RACE_UPDATE" stackId="a" fill={proposalTypeColors.RACE_UPDATE} name="RACE_UPDATE">
                  <LabelList
                    dataKey="Total"
                    position="top"
                    style={{ fill: theme.palette.text.primary, fontWeight: 'bold', fontSize: 12 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Leaderboard utilisateurs */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <TrophyIcon sx={{ mr: 1 }} />
              Classement des validateurs
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Début"
                type="date"
                value={leaderboardStartDate}
                onChange={(e) => setLeaderboardStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
              <TextField
                label="Fin"
                type="date"
                value={leaderboardEndDate}
                onChange={(e) => setLeaderboardEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
              />
            </Box>
          </Box>

          {leaderboardLoading ? (
            <LinearProgress />
          ) : leaderboard.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              Aucune donnée disponible pour cette période
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Rang</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Utilisateur</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Approuvées</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Rejetées</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Archivées</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leaderboard.map((user, index) => (
                    <TableRow key={user.userId} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {index === 0 && (
                            <TrophyIcon sx={{ color: 'gold', mr: 1 }} />
                          )}
                          {index === 1 && (
                            <TrophyIcon sx={{ color: 'silver', mr: 1 }} />
                          )}
                          {index === 2 && (
                            <TrophyIcon sx={{ color: '#CD7F32', mr: 1 }} />
                          )}
                          <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            {index + 1}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                            {user.firstName[0]}{user.lastName[0]}
                          </Avatar>
                          <Box>
                            <Typography variant="body1" sx={{ fontWeight: 500 }}>
                              {user.firstName} {user.lastName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {user.email}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={user.approved}
                          color="success"
                          size="small"
                          sx={{ minWidth: 60 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={user.rejected}
                          color="error"
                          size="small"
                          sx={{ minWidth: 60 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={user.archived}
                          color="default"
                          size="small"
                          sx={{ minWidth: 60 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={user.total}
                          color="primary"
                          size="small"
                          sx={{ minWidth: 60, fontWeight: 600 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}

export default Statistics
