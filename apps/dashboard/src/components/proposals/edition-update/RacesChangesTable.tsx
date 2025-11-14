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
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import BlockValidationButton from '../BlockValidationButton'
import { ConsolidatedRaceChange } from '@/hooks/useProposalEditor'

interface RacesChangesTableProps {
  consolidatedRaces: ConsolidatedRaceChange[]  // ✅ Depuis workingGroup
  userModifiedRaceChanges: Record<string, any> // ✅ Depuis workingGroup  
  onRaceFieldModify: (raceId: string, field: string, value: any) => void
  onDeleteRace?: (raceId: string) => void // ✅ Suppression de course
  disabled?: boolean
  isBlockValidated?: boolean
  onValidateBlock?: () => Promise<void>
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
  validationDisabled?: boolean
  // Affichage colonnes
  showCurrentValue?: boolean
  showActions?: boolean
  showDeleteAction?: boolean // Masquer la colonne Action (suppression de course)
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
  { key: 'runDistance', label: 'Distance course (km)', format: (v) => v ? `${v} km` : '-' },
  { key: 'bikeDistance', label: 'Distance vélo (km)', format: (v) => v ? `${v} km` : '-' },
  { key: 'walkDistance', label: 'Distance marche (km)', format: (v) => v ? `${v} km` : '-' },
  { key: 'runPositiveElevation', label: 'D+ (m)', format: (v) => v ? `${v} m` : '-' },
]

const RacesChangesTable: React.FC<RacesChangesTableProps> = ({
  consolidatedRaces,
  userModifiedRaceChanges,
  onRaceFieldModify,
  onDeleteRace,
  disabled = false,
  isBlockValidated = false,
  onValidateBlock,
  onUnvalidateBlock,
  isBlockPending = false,
  validationDisabled = false,
  showCurrentValue = true,
  showActions = true,
  showDeleteAction = true
}) => {
  // États locaux uniquement pour l'édition en cours
  const [editingRace, setEditingRace] = useState<{ raceId: string, field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  
  // Vérifier si une course est marquée comme supprimée
  const isRaceDeleted = (raceId: string): boolean => {
    return userModifiedRaceChanges[raceId]?._deleted === true
  }
  
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
  // Priorité: 1) Modification utilisateur, 2) Valeur proposée, 3) Valeur actuelle
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
    
    // Si c'est un objet {old, new, confidence} (format agent), extraire 'new'
    if (fieldValue && typeof fieldValue === 'object' && 'new' in fieldValue) {
      return fieldValue.new
    }
    
    // ✅ Fallback: valeur actuelle si aucune proposition
    if (fieldValue === undefined || fieldValue === null) {
      return race.originalFields[field]
    }
    
    // Sinon, retourner la valeur directement
    return fieldValue
  }
  
  
  // ✅ Vérifier si un champ a été modifié par l'utilisateur
  const isFieldModified = (raceId: string, field: string): boolean => {
    const userEdits = userModifiedRaceChanges[raceId] || {}
    return field in userEdits
  }
  
  // ✅ Vérifier si un champ a un changement proposé (par l'agent)
  const hasProposedChange = (race: ConsolidatedRaceChange, field: string): boolean => {
    const fieldValue = race.fields[field]
    const originalValue = race.originalFields[field]
    
    // ✅ Si le champ n'existe pas dans fields, c'est qu'il n'y a pas de changement proposé
    if (fieldValue === undefined) return false
    
    // Si c'est un ConsolidatedChange avec options
    if (fieldValue && typeof fieldValue === 'object' && 'options' in fieldValue && Array.isArray(fieldValue.options)) {
      // ✅ Vérifier que la valeur proposée est différente de la valeur actuelle
      if (fieldValue.options.length === 0) return false
      const proposedValue = fieldValue.options[0]?.proposedValue
      const currentValue = fieldValue.currentValue
      // ✅ Comparaison stricte sauf pour les valeurs nullish
      if (proposedValue === undefined || proposedValue === null) return false
      if (currentValue === undefined || currentValue === null) return proposedValue !== null && proposedValue !== undefined
      return proposedValue !== currentValue
    }
    
    // Si c'est un objet {old, new, confidence} (format agent)
    if (fieldValue && typeof fieldValue === 'object' && 'new' in fieldValue && 'old' in fieldValue) {
      // ✅ Vérifier que new est différent de old
      const newVal = fieldValue.new
      const oldVal = fieldValue.old
      // Pour les dates, comparer les timestamps
      if (newVal instanceof Date && oldVal instanceof Date) {
        return newVal.getTime() !== oldVal.getTime()
      }
      // Pour les strings de dates
      if (typeof newVal === 'string' && typeof oldVal === 'string' && newVal.includes('T') && oldVal.includes('T')) {
        return new Date(newVal).getTime() !== new Date(oldVal).getTime()
      }
      return newVal !== oldVal
    }
    
    // ✅ Si le champ existe dans fields ET est différent de originalValue
    if (originalValue !== undefined) {
      // Pour les dates, comparer les timestamps
      if (typeof fieldValue === 'string' && typeof originalValue === 'string' && fieldValue.includes('T') && originalValue.includes('T')) {
        return new Date(fieldValue).getTime() !== new Date(originalValue).getTime()
      }
      return fieldValue !== originalValue
    }
    
    // ✅ Si le champ existe dans fields mais pas dans originalFields, c'est un nouveau champ
    return true
  }
  
  const renderEditableCell = (
    raceId: string,
    field: string,
    value: any,
    isModified: boolean, // ✅ Badge Modifié
    hasChange: boolean,  // ✅ NOUVEAU: changement proposé par agent
    format?: (v: any) => string
  ) => {
    const isEditing = editingRace?.raceId === raceId && editingRace?.field === field
    const displayValue = format ? format(value) : value
    
    if (isEditing) {
      // Éditeur spécial pour les dates
      if (field === 'startDate') {
        return (
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={fr}>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <DateTimePicker
                value={editValue ? new Date(editValue) : null}
                onChange={(newDate) => setEditValue(newDate?.toISOString() || '')}
                format="dd/MM/yyyy HH:mm"
                ampm={false}
                views={['year', 'month', 'day', 'hours', 'minutes']}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { flexGrow: 1, minWidth: '200px' }
                  }
                }}
              />
              <IconButton size="small" onClick={saveEdit} color="primary">
                <CheckIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={cancelEdit}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </LocalizationProvider>
        )
      }
      
      // Éditeur texte par défaut pour les autres champs
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
        <Typography variant="body2">
          {displayValue || '-'}
        </Typography>
        {isModified && (
          <Chip
            icon={<EditNoteIcon />}
            label="Modifié"
            size="small"
            color="warning"
            variant="outlined"
          />
        )}
        {showActions && !disabled && !isBlockValidated && (
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
              {showCurrentValue && <TableCell sx={{ width: '30%' }}>Valeur actuelle</TableCell>}
              <TableCell sx={{ 
                width: showDeleteAction 
                  ? (showCurrentValue ? '30%' : '60%') 
                  : (showCurrentValue ? '40%' : '70%'), 
              }}>Valeur proposée</TableCell>
              {showDeleteAction && <TableCell sx={{ width: '10%' }}>Action</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Courses consolidées depuis workingGroup */}
            {consolidatedRaces.map((race) => {
              const isDeleted = isRaceDeleted(race.raceId)
              const isExistingUnchanged = (race.fields as any)._isExistingUnchanged === true // ✅ Course existante sans changement
              
              return RACE_FIELDS.map((field, fieldIdx) => {
                const displayValue = getDisplayValue(race, field.key)
                const isFirstRow = fieldIdx === 0
                const isNewRace = race.raceId.startsWith('new-')
                const isModified = isFieldModified(race.raceId, field.key) // ✅ Badge Modifié
                const hasChange = hasProposedChange(race, field.key)      // ✅ Changement proposé
                
                // ✅ Valeur actuelle = originalFields (vraie valeur de la base)
                const currentValue = isNewRace ? '-' : race.originalFields[field.key]
                
                return (
                  <TableRow
                    key={`${race.raceId}-${field.key}`}
                    sx={{
                      opacity: isDeleted ? 0.4 : (isBlockValidated ? 0.6 : 1),
                      backgroundColor: isBlockValidated ? 'action.hover' : 'inherit',
                      textDecoration: isDeleted ? 'line-through' : 'none'
                    }}
                  >
                    {isFirstRow && (
                      <TableCell rowSpan={RACE_FIELDS.length} sx={{ verticalAlign: 'top' }}>
                        <Chip
                          label={
                            isDeleted ? "À supprimer" 
                            : isExistingUnchanged ? "Info" 
                            : (isNewRace ? "Nouvelle" : "Existante")
                          }
                          size="small"
                          color={
                            isDeleted ? "error" 
                            : isExistingUnchanged ? "info" 
                            : (isNewRace ? "success" : "default")
                          }
                          variant="outlined"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        fontWeight={hasChange ? 'bold' : 'normal'}
                        sx={{ fontStyle: isExistingUnchanged ? 'italic' : 'normal' }}
                      >
                        {field.label}
                      </Typography>
                    </TableCell>
                    {showCurrentValue && (
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {field.format ? field.format(currentValue) : currentValue || '-'}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell>
                      {isExistingUnchanged ? (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                          Aucun changement
                        </Typography>
                      ) : (
                        renderEditableCell(race.raceId, field.key, displayValue, isModified, hasChange, field.format)
                      )}
                    </TableCell>
                    {showDeleteAction && isFirstRow && (
                      <TableCell rowSpan={RACE_FIELDS.length} sx={{ verticalAlign: 'top' }}>
                        <Tooltip title={
                          disabled || isBlockValidated 
                            ? "Suppression désactivée" 
                            : (isDeleted ? "Annuler la suppression" : "Supprimer la course")
                        }>
                          <span>
                            <IconButton
                              size="small"
                              disabled={disabled || isBlockValidated || !onDeleteRace}
                              onClick={() => onDeleteRace && onDeleteRace(race.raceId)}
                              color={isDeleted ? "default" : "error"}
                              sx={{ 
                                opacity: (disabled || isBlockValidated || !onDeleteRace) ? 0.3 : 0.7,
                                '&:hover': { opacity: 1 }
                              }}
                            >
                              {isDeleted ? <UndoIcon fontSize="small" /> : <DeleteIcon fontSize="small" />}
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
