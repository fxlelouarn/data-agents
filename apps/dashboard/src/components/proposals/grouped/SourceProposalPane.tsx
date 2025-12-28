import React from 'react'
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Divider
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
  Event as EventIcon,
  CalendarMonth as CalendarIcon,
  DirectionsRun as RaceIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  HelpOutline as AbsentIcon
} from '@mui/icons-material'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Proposal } from '@/types'
import { FieldDiff, RaceDiff } from '@/hooks/useProposalEditor'
import SourceTabs from './SourceTabs'
import CopyFieldButton from './CopyFieldButton'
import CopyRaceButton, { CopyAllRacesButton } from './CopyRaceButton'

// Labels lisibles pour les champs
const FIELD_LABELS: Record<string, string> = {
  // Event
  name: 'Nom',
  city: 'Ville',
  department: 'Département',
  country: 'Pays',
  description: 'Description',
  // Edition
  startDate: 'Date de début',
  endDate: 'Date de fin',
  year: 'Année',
  website: 'Site web',
  registrationUrl: 'Inscription',
  calendarStatus: 'Statut calendrier',
  timeZone: 'Fuseau horaire',
  // Race
  runDistance: 'Distance course (km)',
  bikeDistance: 'Distance vélo (km)',
  swimDistance: 'Distance natation (m)',
  walkDistance: 'Distance marche (km)',
  runPositiveElevation: 'D+ (m)',
  price: 'Prix',
  categoryLevel1: 'Catégorie 1',
  categoryLevel2: 'Catégorie 2'
}

interface SourceProposalPaneProps {
  /** Liste des propositions sources triées par priorité */
  sourceProposals: Proposal[]
  /** Index de la source active */
  activeSourceIndex: number
  /** Callback pour changer de source */
  onChangeSource: (index: number) => void
  /** Différences de champs entre working et source */
  fieldDifferences: FieldDiff[]
  /** Différences de courses entre working et source */
  raceDifferences: RaceDiff[]
  /** Callback pour copier un champ */
  onCopyField: (field: string) => void
  /** Callback pour copier une course */
  onCopyRace: (sourceRaceId: string, targetRaceId?: string) => void
  /** Callback pour copier toute la proposition */
  onCopyAll: () => void
  /** Les blocs sont-ils validés (désactive les copies) */
  isValidated?: boolean
}

/**
 * Formatte une valeur pour l'affichage
 */
function formatValue(field: string, value: any): string {
  if (value === null || value === undefined) return '-'

  // Dates
  if (field === 'startDate' || field === 'endDate') {
    try {
      const date = new Date(value)
      if (!isNaN(date.getTime())) {
        return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
      }
    } catch {
      // Fallback
    }
    return String(value)
  }

  // Distances avec unité
  if (field === 'runDistance' || field === 'bikeDistance' || field === 'walkDistance') {
    return `${value} km`
  }
  if (field === 'swimDistance' || field === 'runPositiveElevation') {
    return `${value} m`
  }
  if (field === 'price') {
    return `${value} €`
  }

  return String(value)
}

/**
 * SourceProposalPane - Pane droit affichant les données sources en lecture seule
 * 
 * Affiche :
 * - Onglets pour sélectionner la source
 * - Bouton pour copier toute la proposition
 * - Tables des champs Event, Edition et Courses avec boutons [←] de copie
 * - Indicateurs visuels des différences (⚠️ différent, ✓ identique, 💭 absent)
 */
const SourceProposalPane: React.FC<SourceProposalPaneProps> = ({
  sourceProposals,
  activeSourceIndex,
  onChangeSource,
  fieldDifferences,
  raceDifferences,
  onCopyField,
  onCopyRace,
  onCopyAll,
  isValidated = false
}) => {
  if (sourceProposals.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography color="text.secondary">
          Aucune source disponible
        </Typography>
      </Paper>
    )
  }

  const activeSource = sourceProposals[activeSourceIndex]

  // Séparer les différences par bloc
  const eventDiffs = fieldDifferences.filter(d => 
    ['name', 'city', 'department', 'country', 'description'].includes(d.field)
  )
  const editionDiffs = fieldDifferences.filter(d => 
    ['startDate', 'endDate', 'year', 'website', 'registrationUrl', 'calendarStatus', 'timeZone'].includes(d.field)
  )

  // Compter les courses dans la source
  const sourcesRacesCount = raceDifferences.filter(r => r.existsInSource).length

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      {/* Onglets de sélection de source */}
      <SourceTabs
        sourceProposals={sourceProposals}
        activeIndex={activeSourceIndex}
        onChangeSource={onChangeSource}
      />

      {/* Bouton copier toute la proposition */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={onCopyAll}
          disabled={isValidated}
          fullWidth
        >
          Copier toute la proposition
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Remplace tous les champs de la proposition de travail par cette source
        </Typography>
      </Box>

      {/* Section Événement */}
      {eventDiffs.length > 0 && (
        <Box>
          <Box
            sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'action.hover'
            }}
          >
            <EventIcon color="primary" fontSize="small" />
            <Typography variant="subtitle2">Événement</Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '30%' }}>Champ</TableCell>
                  <TableCell sx={{ width: '55%' }}>Valeur</TableCell>
                  <TableCell sx={{ width: '15%' }} align="right">Copier</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {eventDiffs.map(diff => (
                  <FieldDiffRow
                    key={diff.field}
                    diff={diff}
                    onCopy={onCopyField}
                    disabled={isValidated}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Section Édition */}
      {editionDiffs.length > 0 && (
        <Box>
          <Box
            sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'action.hover',
              borderTop: 1,
              borderColor: 'divider'
            }}
          >
            <CalendarIcon color="primary" fontSize="small" />
            <Typography variant="subtitle2">Édition</Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '30%' }}>Champ</TableCell>
                  <TableCell sx={{ width: '55%' }}>Valeur</TableCell>
                  <TableCell sx={{ width: '15%' }} align="right">Copier</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {editionDiffs.map(diff => (
                  <FieldDiffRow
                    key={diff.field}
                    diff={diff}
                    onCopy={onCopyField}
                    disabled={isValidated}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Section Courses */}
      {raceDifferences.length > 0 && (
        <Box>
          <Box
            sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              bgcolor: 'action.hover',
              borderTop: 1,
              borderColor: 'divider'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RaceIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2">
                Courses ({sourcesRacesCount})
              </Typography>
            </Box>
            <CopyAllRacesButton
              onCopyAll={onCopyAll}
              disabled={isValidated}
              racesCount={sourcesRacesCount}
            />
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Course</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {raceDifferences
                  .filter(race => race.existsInSource)
                  .map(race => (
                    <RaceDiffRow
                      key={race.raceId}
                      race={race}
                      onCopy={onCopyRace}
                      disabled={isValidated}
                    />
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Paper>
  )
}

/**
 * Ligne affichant un champ avec son statut de différence
 */
interface FieldDiffRowProps {
  diff: FieldDiff
  onCopy: (field: string) => void
  disabled: boolean
}

const FieldDiffRow: React.FC<FieldDiffRowProps> = ({ diff, onCopy, disabled }) => {
  const label = FIELD_LABELS[diff.field] || diff.field

  // Déterminer l'indicateur de statut
  let statusIcon: React.ReactNode = null
  let statusColor: 'warning' | 'success' | 'default' = 'default'

  if (diff.isAbsentInSource) {
    statusIcon = <AbsentIcon fontSize="small" />
    statusColor = 'default'
  } else if (diff.isDifferent) {
    statusIcon = <WarningIcon fontSize="small" />
    statusColor = 'warning'
  } else {
    statusIcon = <CheckIcon fontSize="small" />
    statusColor = 'success'
  }

  return (
    <TableRow
      sx={(theme) => ({
        bgcolor: diff.isDifferent && !diff.isAbsentInSource
          ? (theme.palette.mode === 'dark' 
              ? 'rgba(237, 108, 2, 0.08)' 
              : 'rgba(237, 108, 2, 0.04)')
          : 'inherit'
      })}
    >
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            icon={statusIcon}
            label={label}
            size="small"
            color={statusColor}
            variant="outlined"
            sx={{ fontWeight: diff.isDifferent ? 'bold' : 'normal' }}
          />
        </Box>
      </TableCell>
      <TableCell>
        <Typography
          variant="body2"
          color={diff.isAbsentInSource ? 'text.disabled' : 'text.primary'}
          sx={{ fontStyle: diff.isAbsentInSource ? 'italic' : 'normal' }}
        >
          {diff.isAbsentInSource ? 'Absent dans cette source' : formatValue(diff.field, diff.sourceValue)}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <CopyFieldButton
          fieldName={diff.field}
          fieldLabel={label}
          onCopy={onCopy}
          isDifferent={diff.isDifferent && !diff.isAbsentInSource}
          disabled={disabled}
        />
      </TableCell>
    </TableRow>
  )
}

/**
 * Ligne affichant une course avec son statut
 */
interface RaceDiffRowProps {
  race: RaceDiff
  onCopy: (sourceRaceId: string, targetRaceId?: string) => void
  disabled: boolean
}

const RaceDiffRow: React.FC<RaceDiffRowProps> = ({ race, onCopy, disabled }) => {
  // Déterminer le statut
  const hasDifferences = race.fieldDiffs.some(d => d.isDifferent)
  const isNew = !race.existsInWorking

  let statusLabel: string
  let statusColor: 'success' | 'warning' | 'info' = 'info'

  if (isNew) {
    statusLabel = 'Nouvelle'
    statusColor = 'success'
  } else if (hasDifferences) {
    statusLabel = `${race.fieldDiffs.filter(d => d.isDifferent).length} différence(s)`
    statusColor = 'warning'
  } else {
    statusLabel = 'Identique'
    statusColor = 'info'
  }

  return (
    <TableRow
      sx={(theme) => ({
        bgcolor: isNew
          ? (theme.palette.mode === 'dark' 
              ? 'rgba(46, 125, 50, 0.08)' 
              : 'rgba(46, 125, 50, 0.04)')
          : hasDifferences
            ? (theme.palette.mode === 'dark' 
                ? 'rgba(237, 108, 2, 0.08)' 
                : 'rgba(237, 108, 2, 0.04)')
            : 'inherit'
      })}
    >
      <TableCell>
        <Typography variant="body2" fontWeight="medium">
          {race.raceName}
        </Typography>
      </TableCell>
      <TableCell>
        <Chip
          label={statusLabel}
          size="small"
          color={statusColor}
          variant="outlined"
        />
      </TableCell>
      <TableCell align="right">
        {(isNew || hasDifferences) && (
          <CopyRaceButton
            sourceRaceId={race.sourceRaceId || race.raceId}
            raceName={race.raceName}
            existsInWorking={race.existsInWorking}
            targetRaceId={race.workingRaceId}
            onCopy={onCopy}
            disabled={disabled}
          />
        )}
      </TableCell>
    </TableRow>
  )
}

export default SourceProposalPane
