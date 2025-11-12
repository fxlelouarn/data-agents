import React, { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  TextField,
  Button
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Undo as UndoIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  EditNote as EditNoteIcon
} from '@mui/icons-material'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import BlockValidationButton from '../BlockValidationButton'
import { ConsolidatedRaceChange } from '@/hooks/useProposalEditor'

interface RacesChangesTableProps {
  consolidatedRaces: ConsolidatedRaceChange[]  // ✅ Depuis workingGroup
  userModifiedRaceChanges: Record<string, any> // ✅ Depuis workingGroup  
  onRaceFieldModify: (raceId: string, field: string, value: any) => void
  disabled?: boolean
  isBlockValidated?: boolean
  onValidateBlock?: () => Promise<void>
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
  validationDisabled?: boolean
}

type RaceField = {
  key: string
  label: string
  format?: (value: any) => string
}

const RACE_FIELDS: RaceField[] = [
  { key: 'name', label: 'Nom' },
  { 
    key: 'startDate', 
    label: 'Date + Heure', 
    format: (v) => {
      if (!v) return '-'
      try {
        const date = new Date(v)
        if (isNaN(date.getTime())) return v
        return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
      } catch {
        return v
      }
    }
  },
  { key: 'categoryLevel1', label: 'Catégorie 1' },
  { key: 'categoryLevel2', label: 'Catégorie 2' },
  { key: 'distance', label: 'Distance (km)', format: (v) => v ? `${v} km` : '-' },
  { key: 'elevation', label: 'D+ (m)', format: (v) => v ? `${v} m` : '-' },
]

const RacesChangesTable: React.FC<RacesChangesTableProps> = ({
  consolidatedRaces,
  userModifiedRaceChanges,
  onRaceFieldModify,
  disabled = false,
  isBlockValidated = false,
  onValidateBlock,
  onUnvalidateBlock,
  isBlockPending = false,
  validationDisabled = false
}) => {
  // États locaux uniquement pour l'édition en cours
  const [editingRace, setEditingRace] = useState<{ raceId: string, field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  
  const startEdit = (raceId: string, field: string, currentValue: any) => {
    setEditingRace({ raceId, field })
    setEditValue(currentValue || '')
  }
  
  const cancelEdit = () => {
    setEditingRace(null)
    setEditValue('')
  }
  
  const saveEdit = () => {
    if (!editingRace) return
    
    // Appeler directement le handler depuis le context
    onRaceFieldModify(editingRace.raceId, editingRace.field, editValue)
    setEditingRace(null)
  }
  
  // Récupérer la valeur affichée d'un champ de course
  // Priorité: 1) Modification utilisateur, 2) Valeur proposée consolidée
  const getDisplayValue = (race: ConsolidatedRaceChange, field: string): any => {
    const userEdits = userModifiedRaceChanges[race.raceId] || {}
    if (field in userEdits) {
      return userEdits[field]
    }
    
    // ✅ race.fields[field] peut être un ConsolidatedChange ou une valeur primitive
    const fieldValue = race.fields[field]
    
    // Si c'est un ConsolidatedChange, extraire la première option
    if (fieldValue && typeof fieldValue === 'object' && 'options' in fieldValue && Array.isArray(fieldValue.options)) {
      return fieldValue.options[0]?.proposedValue
    }
    
    // Sinon, retourner la valeur directement
    return fieldValue
  }
  
  
  // ✅ Vérifier si un champ a été modifié par l'utilisateur
  const isFieldModified = (raceId: string, field: string): boolean => {
    const userEdits = userModifiedRaceChanges[raceId] || {}
    return field in userEdits
  }
  
  const renderEditableCell = (
    raceId: string,
    field: string,
    value: any,
    isModified: boolean, // ✅ Badge Modifié
    format?: (v: any) => string
  ) => {
    const isEditing = editingRace?.raceId === raceId && editingRace?.field === field
    const displayValue = format ? format(value) : value
    
    if (isEditing) {
      return (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <TextField
            size="small"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            autoFocus
            sx={{ flexGrow: 1 }}
          />
          <IconButton size="small" onClick={saveEdit} color="primary">
            <CheckIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={cancelEdit}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )
    }
    
    return (
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <Typography variant="body2">{displayValue || '-'}</Typography>
        {isModified && (
          <Chip
            icon={<EditNoteIcon />}
            label="Modifié"
            size="small"
            color="warning"
            variant="outlined"
          />
        )}
        {!disabled && !isBlockValidated && (
          <IconButton
            size="small"
            onClick={() => startEdit(raceId, field, value)}
            sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    )
  }
  
  const totalRaces = consolidatedRaces.length
  
  return (
    <Paper sx={{ mb: 3 }}>
      <Box 
        sx={{ 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
          ...(isBlockValidated && { bgcolor: 'action.hover', opacity: 0.7 })
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddIcon color="primary" />
          <Typography variant="h6">
            Courses ({totalRaces} total)
          </Typography>
        </Box>
        {onValidateBlock && onUnvalidateBlock && (
          <BlockValidationButton
            blockName="Courses"
            isValidated={isBlockValidated}
            onValidate={onValidateBlock}
            onUnvalidate={onUnvalidateBlock}
            disabled={validationDisabled}
            isPending={isBlockPending}
          />
        )}
      </Box>
      
      <TableContainer>
        <Table size="small">
          <TableHead sx={{ bgcolor: 'background.paper' }}>
            <TableRow>
              <TableCell sx={{ width: '10%' }}>Statut</TableCell>
              <TableCell sx={{ width: '20%' }}>Champ</TableCell>
              <TableCell sx={{ width: '30%' }}>Valeur actuelle</TableCell>
              <TableCell sx={{ width: '30%' }}>Valeur proposée</TableCell>
              <TableCell sx={{ width: '10%' }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Courses consolidées depuis workingGroup */}
            {consolidatedRaces.map((race) => {
              return RACE_FIELDS.map((field, fieldIdx) => {
                const displayValue = getDisplayValue(race, field.key)
                const isFirstRow = fieldIdx === 0
                const isNewRace = race.raceId.startsWith('new-')
                const isModified = isFieldModified(race.raceId, field.key) // ✅ Badge Modifié
                
                // ✅ Valeur actuelle = originalFields (vraie valeur de la base)
                const currentValue = isNewRace ? '-' : race.originalFields[field.key]
                
                return (
                  <TableRow
                    key={`${race.raceId}-${field.key}`}
                    sx={{
                      opacity: isBlockValidated ? 0.6 : 1,
                      backgroundColor: isBlockValidated ? 'action.hover' : 'inherit'
                    }}
                  >
                    {isFirstRow && (
                      <TableCell rowSpan={RACE_FIELDS.length} sx={{ verticalAlign: 'top' }}>
                        <Chip
                          label={isNewRace ? "Nouvelle" : "Existante"}
                          size="small"
                          color={isNewRace ? "success" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        fontWeight={500}
                      >
                        {field.label}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {field.format ? field.format(currentValue) : currentValue || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {renderEditableCell(race.raceId, field.key, displayValue, isModified, field.format)}
                    </TableCell>
                    {isFirstRow && (
                      <TableCell rowSpan={RACE_FIELDS.length} sx={{ verticalAlign: 'top' }}>
                        <Tooltip title="Action">
                          <span>
                            <IconButton
                              size="small"
                              disabled={true}
                              sx={{ opacity: 0.3 }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}

export default RacesChangesTable
