import React from 'react'
import { Box, Paper, Typography, Button } from '@mui/material'
import {
  CheckCircle as ValidateIcon,
  Edit as EditIcon
} from '@mui/icons-material'
import { format, isValid, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import CategorizedEventChangesTable from '../CategorizedEventChangesTable'
import CategorizedEditionChangesTable from '../CategorizedEditionChangesTable'
import RacesChangesTable from '../edition-update/RacesChangesTable'
import { 
  WorkingProposalGroup, 
  ConsolidatedChange, 
  ConsolidatedRaceChange 
} from '@/hooks/useProposalEditor'
import { RaceData } from '@/types'

/**
 * Formate une valeur pour l'affichage dans les tables
 */
function formatValue(value: any, isSimple = false, timezone?: string): React.ReactNode {
  if (value === null || value === undefined) return '-'

  // Booléens
  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non'
  }

  // Dates (format ISO string)
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
    try {
      const date = parseISO(value)
      if (isValid(date)) {
        return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
      }
    } catch {
      // Fallback to string
    }
  }

  // Arrays
  if (Array.isArray(value)) {
    return value.join(', ')
  }

  // Objects
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Formate la liste des agents pour l'affichage
 */
function formatAgentsList(agents: Array<{ agentName: string; confidence: number }>): string {
  if (!agents || agents.length === 0) return '-'
  return agents.map(a => `${a.agentName} (${Math.round(a.confidence * 100)}%)`).join(', ')
}

interface WorkingProposalPaneProps {
  /** État du groupe de propositions */
  workingGroup: WorkingProposalGroup
  
  // Données consolidées pour les tables
  /** Changements Event consolidés */
  eventChanges: ConsolidatedChange[]
  /** Changements Edition consolidés */
  editionChanges: ConsolidatedChange[]
  /** Courses consolidées */
  consolidatedRaces: ConsolidatedRaceChange[]
  /** Valeurs sélectionnées pour chaque champ */
  selectedChanges: Record<string, any>
  
  // Callbacks d'édition
  /** Modifier un champ */
  onFieldModify: (field: string, value: any) => void
  /** Modifier un champ de course */
  onRaceFieldModify: (raceId: string, field: string, value: any) => void
  /** Supprimer une course */
  onDeleteRace: (raceId: string) => void
  /** Ajouter une course */
  onAddRace: (race: RaceData) => void
  
  // Validation par bloc
  /** Valider un bloc */
  onValidateBlock: (blockKey: string) => Promise<void>
  /** Annuler la validation d'un bloc */
  onUnvalidateBlock: (blockKey: string) => Promise<void>
  /** Valider tous les blocs */
  onValidateAllBlocks: () => Promise<void>
  /** Vérifier si un bloc est validé */
  isBlockValidated: (blockKey: string) => boolean
  
  // État
  /** Un bloc est en cours de validation */
  isBlockPending?: boolean
  /** L'édition est-elle annulée */
  isEditionCanceled?: boolean
  /** Date de début de l'édition (pour pré-remplir nouvelles courses) */
  editionStartDate?: string
  /** Fuseau horaire de l'édition */
  editionTimeZone?: string
  /** Est-ce un nouvel événement */
  isNewEvent?: boolean
  
  // Callbacks spéciaux
  /** Handler pour changement de date d'édition (avec cascade) */
  onEditionStartDateChange?: (field: string, value: any) => void
}

/**
 * WorkingProposalPane - Pane gauche éditable de la proposition de travail
 * 
 * Affiche les tables d'édition pour :
 * - Événement (CategorizedEventChangesTable)
 * - Édition (CategorizedEditionChangesTable)
 * - Courses (RacesChangesTable)
 * 
 * Avec boutons de validation par bloc et validation globale.
 */
const WorkingProposalPane: React.FC<WorkingProposalPaneProps> = ({
  workingGroup,
  eventChanges,
  editionChanges,
  consolidatedRaces,
  selectedChanges,
  onFieldModify,
  onRaceFieldModify,
  onDeleteRace,
  onAddRace,
  onValidateBlock,
  onUnvalidateBlock,
  onValidateAllBlocks,
  isBlockValidated,
  isBlockPending = false,
  isEditionCanceled = false,
  editionStartDate,
  editionTimeZone,
  isNewEvent = false,
  onEditionStartDateChange
}) => {
  const allBlocksValidated = 
    isBlockValidated('event') && 
    isBlockValidated('edition') && 
    isBlockValidated('races')

  // Compter les blocs non validés (seulement ceux qui ont du contenu)
  const pendingBlocksCount = [
    eventChanges.length > 0 && !isBlockValidated('event'),
    editionChanges.length > 0 && !isBlockValidated('edition'),
    consolidatedRaces.length > 0 && !isBlockValidated('races')
  ].filter(Boolean).length

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EditIcon color="primary" />
          <Typography variant="h6">Proposition de travail</Typography>
        </Box>
        
        {pendingBlocksCount > 0 && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<ValidateIcon />}
            onClick={onValidateAllBlocks}
            disabled={isBlockPending}
          >
            Valider tous les blocs ({pendingBlocksCount})
          </Button>
        )}
        
        {pendingBlocksCount === 0 && (eventChanges.length > 0 || editionChanges.length > 0 || consolidatedRaces.length > 0) && (
          <Typography color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ValidateIcon fontSize="small" />
            Tous les blocs validés
          </Typography>
        )}
      </Box>

      {/* Section Événement */}
      {eventChanges.length > 0 && (
        <Box sx={{ p: 2, pb: 0 }}>
          <CategorizedEventChangesTable
            title="Événement"
            changes={eventChanges}
            isNewEvent={isNewEvent}
            selectedChanges={selectedChanges}
            userModifiedChanges={workingGroup.userModifiedChanges}
            onFieldModify={onFieldModify}
            formatValue={formatValue}
            formatAgentsList={formatAgentsList}
            disabled={isBlockValidated('event')}
            isBlockValidated={isBlockValidated('event')}
            onValidateBlock={() => onValidateBlock('event')}
            onUnvalidateBlock={() => onUnvalidateBlock('event')}
            isBlockPending={isBlockPending}
            showCurrentValue={true}
            showConfidence={false}
            showActions={true}
          />
        </Box>
      )}

      {/* Section Édition */}
      {editionChanges.length > 0 && (
        <Box sx={{ p: 2, pb: 0 }}>
          <CategorizedEditionChangesTable
            title="Édition"
            changes={editionChanges}
            isNewEvent={isNewEvent}
            selectedChanges={selectedChanges}
            userModifiedChanges={workingGroup.userModifiedChanges}
            onFieldModify={onFieldModify}
            formatValue={formatValue}
            formatAgentsList={formatAgentsList}
            disabled={isBlockValidated('edition')}
            isEditionCanceled={isEditionCanceled}
            isBlockValidated={isBlockValidated('edition')}
            onValidateBlock={() => onValidateBlock('edition')}
            onUnvalidateBlock={() => onUnvalidateBlock('edition')}
            isBlockPending={isBlockPending}
            onEditionStartDateChange={onEditionStartDateChange}
            showCurrentValue={true}
            showConfidence={false}
            showActions={true}
          />
        </Box>
      )}

      {/* Section Courses */}
      {consolidatedRaces.length > 0 && (
        <Box sx={{ p: 2 }}>
          <RacesChangesTable
            consolidatedRaces={consolidatedRaces}
            userModifiedRaceChanges={workingGroup.userModifiedRaceChanges}
            onRaceFieldModify={onRaceFieldModify}
            onDeleteRace={onDeleteRace}
            onAddRace={onAddRace}
            editionStartDate={editionStartDate}
            editionTimeZone={editionTimeZone}
            disabled={isBlockValidated('races')}
            isBlockValidated={isBlockValidated('races')}
            onValidateBlock={() => onValidateBlock('races')}
            onUnvalidateBlock={() => onUnvalidateBlock('races')}
            isBlockPending={isBlockPending}
            showCurrentValue={true}
            showActions={true}
            showDeleteAction={true}
          />
        </Box>
      )}

      {/* Message si aucun changement */}
      {eventChanges.length === 0 && editionChanges.length === 0 && consolidatedRaces.length === 0 && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Aucun changement à afficher
          </Typography>
        </Box>
      )}
    </Paper>
  )
}

export default WorkingProposalPane
