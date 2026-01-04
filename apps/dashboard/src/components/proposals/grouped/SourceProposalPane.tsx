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
  HelpOutline as AbsentIcon,
  Link as LinkIcon,
  Schedule as ScheduleIcon,
  OpenInNew as OpenInNewIcon,
  SmartToy as AgentIcon
} from '@mui/icons-material'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { Proposal } from '@/types'
import { FieldDiff, RaceDiff } from '@/hooks/useProposalEditor'
import { getCategoriesForEntityType } from '@/constants/fieldCategories'
import SourceTabs from './SourceTabs'
import CopyFieldButton from './CopyFieldButton'
import CopyRaceButton, { CopyAllRacesButton } from './CopyRaceButton'

// ═══════════════════════════════════════════════════════════════════════════════
// Extraction des sources depuis les justifications d'une proposition
// ═══════════════════════════════════════════════════════════════════════════════

interface SourceInfo {
  url: string
  snippet?: string
  date?: string
  confidence?: number
}

/**
 * Extrait les informations de source d'une proposition
 * Cherche dans justifications et sourceMetadata
 */
function extractSourceInfo(proposal: Proposal): SourceInfo | null {
  // Cast pour accéder aux champs optionnels non typés
  const p = proposal as any

  // Priorité 1: sourceMetadata.url
  if (p.sourceMetadata?.url) {
    return {
      url: p.sourceMetadata.url,
      snippet: p.sourceMetadata.extra?.snippet
    }
  }

  // Priorité 2: sourceMetadata.extra.messageLink (Slack)
  if (p.sourceMetadata?.extra?.messageLink) {
    return {
      url: p.sourceMetadata.extra.messageLink,
      snippet: p.sourceMetadata.extra?.text
    }
  }

  // Priorité 3: Chercher dans les justifications
  if (!proposal.justification || proposal.justification.length === 0) {
    return null
  }

  for (const justif of proposal.justification as any[]) {
    // Format dateDetails avec sources multiples
    if (justif.metadata?.dateDetails?.sources?.length > 0) {
      const firstSource = justif.metadata.dateDetails.sources[0]
      return {
        url: firstSource.source,
        snippet: firstSource.snippet,
        date: justif.metadata.dateDetails.date,
        confidence: justif.metadata.dateDetails.confidence
      }
    }

    // Format dateDetails simple
    if (justif.metadata?.dateDetails?.source) {
      return {
        url: justif.metadata.dateDetails.source,
        snippet: justif.metadata.dateDetails.snippet,
        date: justif.metadata.dateDetails.date,
        confidence: justif.metadata.dateDetails.confidence
      }
    }

    // type 'url_source'
    if (justif.type === 'url_source' && justif.metadata?.url) {
      return {
        url: justif.metadata.url,
        snippet: justif.metadata.snippet
      }
    }

    // metadata.source ou metadata.url
    if (justif.metadata?.source) {
      return {
        url: justif.metadata.source,
        snippet: justif.metadata.snippet
      }
    }
    if (justif.metadata?.url) {
      return {
        url: justif.metadata.url,
        snippet: justif.metadata.snippet
      }
    }
  }

  return null
}

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

// Ordre des champs pour les courses (même ordre que RacesChangesTable)
const RACE_FIELDS_ORDER = [
  'name',
  'startDate',
  'categoryLevel1',
  'categoryLevel2',
  'runDistance',
  'bikeDistance',
  'swimDistance',
  'walkDistance',
  'runPositiveElevation',
  'price'
]

/**
 * Trie les différences de champs selon l'ordre défini dans fieldCategories.ts
 * Les champs non définis sont placés à la fin dans leur ordre original
 */
function sortFieldDiffs(diffs: FieldDiff[], entityType: 'EVENT' | 'EDITION' | 'RACE'): FieldDiff[] {
  const categories = getCategoriesForEntityType(entityType)
  // Créer un tableau plat de tous les champs dans l'ordre
  const fieldsOrder = categories.flatMap(cat => cat.fields)
  
  return [...diffs].sort((a, b) => {
    const indexA = fieldsOrder.indexOf(a.field)
    const indexB = fieldsOrder.indexOf(b.field)
    // Si un champ n'est pas dans l'ordre, le mettre à la fin
    const orderA = indexA === -1 ? 999 : indexA
    const orderB = indexB === -1 ? 999 : indexB
    return orderA - orderB
  })
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

  // Séparer les différences par bloc et trier selon l'ordre défini dans fieldCategories.ts
  const eventCategories = getCategoriesForEntityType('EVENT')
  const eventFields = eventCategories.flatMap(cat => cat.fields)
  const eventDiffsUnsorted = fieldDifferences.filter(d => eventFields.includes(d.field))
  const eventDiffs = sortFieldDiffs(eventDiffsUnsorted, 'EVENT')
  
  const editionCategories = getCategoriesForEntityType('EDITION')
  const editionFields = editionCategories.flatMap(cat => cat.fields)
  const editionDiffsUnsorted = fieldDifferences.filter(d => editionFields.includes(d.field))
  const editionDiffs = sortFieldDiffs(editionDiffsUnsorted, 'EDITION')

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
                  <TableCell sx={{ width: '30%' }}>Champ</TableCell>
                  <TableCell sx={{ width: '55%' }}>Valeur</TableCell>
                  <TableCell sx={{ width: '15%' }} align="right">Copier</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {raceDifferences
                  .filter(race => race.existsInSource)
                  .map(race => (
                    <RaceDiffRows
                      key={race.raceId}
                      race={race}
                      onCopyRace={onCopyRace}
                      disabled={isValidated}
                    />
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Section Source - URL et snippet de la proposition active */}
      <SourceInfoSection proposal={activeSource} />
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
  const isDifferent = diff.isDifferent && !diff.isAbsentInSource

  return (
    <TableRow
      sx={(theme) => ({
        bgcolor: isDifferent
          ? (theme.palette.mode === 'dark' 
              ? 'rgba(237, 108, 2, 0.08)' 
              : 'rgba(237, 108, 2, 0.04)')
          : 'inherit'
      })}
    >
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {diff.isAbsentInSource ? (
            <AbsentIcon fontSize="small" color="disabled" />
          ) : isDifferent ? (
            <WarningIcon fontSize="small" color="warning" />
          ) : (
            <CheckIcon fontSize="small" color="success" />
          )}
          <Typography
            variant="body2"
            fontWeight={isDifferent ? 'bold' : 500}
          >
            {label}
          </Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Typography
          variant="body2"
          color={diff.isAbsentInSource ? 'text.disabled' : (isDifferent ? 'primary.main' : 'text.primary')}
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
          isDifferent={isDifferent}
          disabled={disabled}
        />
      </TableCell>
    </TableRow>
  )
}

/**
 * Lignes affichant une course avec le même format que l'Édition
 * - Ligne séparateur avec nom de la course + badge différences + bouton copier tout
 * - Lignes de champs (Champ / Valeur / Copier) pour chaque différence
 */
interface RaceDiffRowsProps {
  race: RaceDiff
  onCopyRace: (sourceRaceId: string, targetRaceId?: string) => void
  disabled: boolean
}

const RaceDiffRows: React.FC<RaceDiffRowsProps> = ({ race, onCopyRace, disabled }) => {
  const hasDifferences = race.fieldDiffs.some(d => d.isDifferent)
  const isNew = !race.existsInWorking
  const differentFields = race.fieldDiffs.filter(d => d.isDifferent)
  
  // Pour une nouvelle course, afficher tous les champs avec valeur
  const fieldsToShowUnsorted = isNew 
    ? race.fieldDiffs.filter(d => d.sourceValue !== undefined && d.sourceValue !== null)
    : differentFields
  
  // Trier les champs selon l'ordre défini (même ordre que RacesChangesTable)
  const fieldsToShow = [...fieldsToShowUnsorted].sort((a, b) => {
    const indexA = RACE_FIELDS_ORDER.indexOf(a.field)
    const indexB = RACE_FIELDS_ORDER.indexOf(b.field)
    // Si un champ n'est pas dans l'ordre, le mettre à la fin
    const orderA = indexA === -1 ? 999 : indexA
    const orderB = indexB === -1 ? 999 : indexB
    return orderA - orderB
  })

  let statusLabel: string
  let statusColor: 'success' | 'warning' | 'info' = 'info'

  if (isNew) {
    statusLabel = 'Nouvelle'
    statusColor = 'success'
  } else if (hasDifferences) {
    statusLabel = `${differentFields.length} diff.`
    statusColor = 'warning'
  } else {
    statusLabel = 'Identique'
    statusColor = 'info'
  }

  return (
    <>
      {/* Ligne séparateur avec nom de la course */}
      <TableRow
        sx={(theme) => ({
          bgcolor: theme.palette.mode === 'dark' 
            ? 'rgba(255, 255, 255, 0.05)' 
            : 'rgba(0, 0, 0, 0.04)'
        })}
      >
        <TableCell colSpan={2}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight="bold">
              {race.raceName}
            </Typography>
            <Chip
              label={statusLabel}
              size="small"
              color={statusColor}
              variant="outlined"
              sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' } }}
            />
          </Box>
        </TableCell>
        <TableCell align="right">
          {(isNew || hasDifferences) && (
            <CopyRaceButton
              sourceRaceId={race.sourceRaceId || race.raceId}
              raceName={race.raceName}
              existsInWorking={race.existsInWorking}
              targetRaceId={race.workingRaceId}
              onCopy={onCopyRace}
              disabled={disabled}
            />
          )}
        </TableCell>
      </TableRow>

      {/* Lignes de champs - même format que l'Édition */}
      {fieldsToShow.map(diff => {
        const label = FIELD_LABELS[diff.field] || diff.field
        const isDifferent = diff.isDifferent && !diff.isAbsentInSource

        return (
          <TableRow
            key={diff.field}
            sx={(theme) => ({
              bgcolor: isDifferent
                ? (theme.palette.mode === 'dark' 
                    ? 'rgba(237, 108, 2, 0.08)' 
                    : 'rgba(237, 108, 2, 0.04)')
                : 'inherit'
            })}
          >
            <TableCell>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {isDifferent ? (
                  <WarningIcon fontSize="small" color="warning" />
                ) : (
                  <CheckIcon fontSize="small" color={isNew ? 'success' : 'disabled'} />
                )}
                <Typography
                  variant="body2"
                  fontWeight={isDifferent ? 'bold' : 500}
                >
                  {label}
                </Typography>
              </Box>
            </TableCell>
            <TableCell>
              <Typography
                variant="body2"
                color={isDifferent ? 'primary.main' : 'text.primary'}
              >
                {formatValue(diff.field, diff.sourceValue)}
              </Typography>
            </TableCell>
            <TableCell align="right">
              {/* Pas de bouton copier individuel pour les champs de course */}
            </TableCell>
          </TableRow>
        )
      })}

      {/* Message si aucune différence */}
      {!isNew && !hasDifferences && (
        <TableRow>
          <TableCell colSpan={3}>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1 }}>
              Aucune différence
            </Typography>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

/**
 * Section affichant les informations de la proposition source :
 * - URL source et snippet
 * - Agent, date de création, lien vers la proposition
 */
interface SourceInfoSectionProps {
  proposal: Proposal
}

const SourceInfoSection: React.FC<SourceInfoSectionProps> = ({ proposal }) => {
  const sourceInfo = extractSourceInfo(proposal)
  const p = proposal as any

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }
      return format(date, 'dd MMM yyyy à HH:mm', { locale: fr })
    } catch {
      return dateString
    }
  }

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: 'divider'
      }}
    >
      {/* Section Source URL + Snippet */}
      {sourceInfo && (
        <>
          <Box
            sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'action.hover'
            }}
          >
            <LinkIcon color="primary" fontSize="small" />
            <Typography variant="subtitle2">Source</Typography>
          </Box>

          <Box sx={{ p: 2 }}>
            {/* URL */}
            <Typography
              component="a"
              href={sourceInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: 'primary.main',
                textDecoration: 'none',
                fontSize: '0.875rem',
                wordBreak: 'break-all',
                display: 'block',
                mb: sourceInfo.snippet ? 2 : 0,
                '&:hover': {
                  textDecoration: 'underline'
                }
              }}
            >
              {sourceInfo.url}
            </Typography>

            {/* Snippet */}
            {sourceInfo.snippet && (
              <Box
                sx={(theme) => ({
                  p: 1.5,
                  bgcolor: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'rgba(0, 0, 0, 0.02)',
                  borderLeft: 3,
                  borderColor: 'info.main',
                  borderRadius: 1
                })}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontStyle: 'italic', lineHeight: 1.5 }}
                >
                  "{sourceInfo.snippet}"
                </Typography>
              </Box>
            )}
          </Box>
        </>
      )}

      {/* Section Métadonnées de la proposition */}
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'action.hover',
          borderTop: sourceInfo ? 1 : 0,
          borderColor: 'divider'
        }}
      >
        <AgentIcon color="primary" fontSize="small" />
        <Typography variant="subtitle2">Proposition</Typography>
      </Box>

      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        {/* Agent */}
        {p.agent?.name && (
          <Chip
            label={p.agent.name}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 22 }}
          />
        )}

        {/* Date de création */}
        {p.createdAt && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ScheduleIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              {formatDate(p.createdAt)}
            </Typography>
          </Box>
        )}

        {/* Lien vers la proposition */}
        <Button
          component={Link}
          to={`/proposals/${proposal.id}`}
          size="small"
          variant="text"
          endIcon={<OpenInNewIcon sx={{ fontSize: '0.875rem' }} />}
          sx={{ ml: 'auto', textTransform: 'none' }}
        >
          Voir détails
        </Button>
      </Box>
    </Box>
  )
}

export default SourceProposalPane
