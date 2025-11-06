import React, { useState, useEffect } from 'react'
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
  Close as CloseIcon
} from '@mui/icons-material'
import BlockValidationButton from '../BlockValidationButton'
import { useProposalBlockValidation } from '@/hooks/useProposalBlockValidation'
import { useUpdateProposal } from '@/hooks/useApi'

interface ExistingRace {
  id: number
  name: string
  distance?: number
  elevation?: number
  type?: string
  startDate?: string
}

interface RaceToAdd {
  name: string
  type?: string
  distance?: number
  startDate?: string
  elevation?: number
  registrationUrl?: string
}

interface RacesChangesTableProps {
  existingRaces: ExistingRace[]
  racesToAdd: RaceToAdd[]
  proposalId?: string
  proposal?: any
  disabled?: boolean
  onValidateBlock?: () => Promise<void>
  onUnvalidateBlock?: () => Promise<void>
}

type RaceField = {
  key: string
  label: string
  format?: (value: any) => string
}

const RACE_FIELDS: RaceField[] = [
  { key: 'name', label: 'Nom' },
  { key: 'distance', label: 'Distance (km)', format: (v) => v ? `${v} km` : '-' },
  { key: 'elevation', label: 'D+ (m)', format: (v) => v ? `${v} m` : '-' },
  { key: 'type', label: 'Type', format: (v) => v ? String(v).toUpperCase() : '-' },
]

const RacesChangesTable: React.FC<RacesChangesTableProps> = ({
  existingRaces,
  racesToAdd,
  proposalId,
  proposal,
  disabled = false,
  onValidateBlock,
  onUnvalidateBlock
}) => {
  // États locaux
  const [racesToDelete, setRacesToDelete] = useState<Set<number>>(new Set())
  const [racesToAddFiltered, setRacesToAddFiltered] = useState<Set<number>>(new Set())
  const [editingRace, setEditingRace] = useState<{ type: 'existing' | 'new', index: number, field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [raceEdits, setRaceEdits] = useState<Record<string, Record<string, any>>>({})
  
  const updateProposalMutation = useUpdateProposal()
  const { isValidated, validate, cancel } = useProposalBlockValidation(proposalId, 'races')
  
  // Charger les modifications depuis userModifiedChanges
  useEffect(() => {
    if (proposal?.userModifiedChanges?.racesToDelete) {
      setRacesToDelete(new Set(proposal.userModifiedChanges.racesToDelete))
    }
    if (proposal?.userModifiedChanges?.racesToAddFiltered) {
      setRacesToAddFiltered(new Set(proposal.userModifiedChanges.racesToAddFiltered))
    }
    if (proposal?.userModifiedChanges?.raceEdits) {
      setRaceEdits(proposal.userModifiedChanges.raceEdits)
    }
  }, [proposal?.userModifiedChanges])
  
  // Synchroniser avec le backend
  const syncWithBackend = async (updates: any) => {
    if (!proposalId) return
    
    try {
      await updateProposalMutation.mutateAsync({
        id: proposalId,
        userModifiedChanges: {
          ...proposal?.userModifiedChanges,
          ...updates
        }
      })
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error)
    }
  }
  
  const handleToggleDelete = (raceId: number, isNew: boolean, index: number) => {
    if (isNew) {
      const newFiltered = new Set(racesToAddFiltered)
      if (newFiltered.has(index)) {
        newFiltered.delete(index)
      } else {
        newFiltered.add(index)
      }
      setRacesToAddFiltered(newFiltered)
      syncWithBackend({ racesToAddFiltered: Array.from(newFiltered) })
    } else {
      const newDeleted = new Set(racesToDelete)
      if (newDeleted.has(raceId)) {
        newDeleted.delete(raceId)
      } else {
        newDeleted.add(raceId)
      }
      setRacesToDelete(newDeleted)
      syncWithBackend({ racesToDelete: Array.from(newDeleted) })
    }
  }
  
  const startEdit = (type: 'existing' | 'new', index: number, field: string, currentValue: any) => {
    setEditingRace({ type, index, field })
    setEditValue(currentValue || '')
  }
  
  const cancelEdit = () => {
    setEditingRace(null)
    setEditValue('')
  }
  
  const saveEdit = () => {
    if (!editingRace) return
    
    const key = `${editingRace.type}-${editingRace.index}`
    const newEdits = {
      ...raceEdits,
      [key]: {
        ...raceEdits[key],
        [editingRace.field]: editValue
      }
    }
    
    setRaceEdits(newEdits)
    syncWithBackend({ raceEdits: newEdits })
    setEditingRace(null)
  }
  
  const getEditedValue = (type: 'existing' | 'new', index: number, field: string, originalValue: any) => {
    const key = `${type}-${index}`
    return raceEdits[key]?.[field] ?? originalValue
  }
  
  const getRaceCurrentValue = (race: ExistingRace, field: string): any => {
    switch (field) {
      case 'name': return race.name
      case 'distance': return race.distance
      case 'elevation': return race.elevation
      case 'type': return race.type
      default: return null
    }
  }
  
  const getRaceProposedValue = (race: RaceToAdd, field: string): any => {
    switch (field) {
      case 'name': return race.name
      case 'distance': return race.distance
      case 'elevation': return race.elevation
      case 'type': return race.type
      default: return null
    }
  }
  
  const renderEditableCell = (
    type: 'existing' | 'new',
    index: number,
    field: string,
    value: any,
    format?: (v: any) => string
  ) => {
    const isEditing = editingRace?.type === type && editingRace?.index === index && editingRace?.field === field
    const editedValue = getEditedValue(type, index, field, value)
    const displayValue = format ? format(editedValue) : editedValue
    
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
        {!disabled && (
          <IconButton
            size="small"
            onClick={() => startEdit(type, index, field, editedValue)}
            sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    )
  }
  
  const totalRaces = existingRaces.length + racesToAdd.length - racesToDelete.size - racesToAddFiltered.size
  
  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddIcon color="primary" />
          <Typography variant="h6">
            Courses ({totalRaces} total)
          </Typography>
        </Box>
        {proposalId && (
          <BlockValidationButton
            blockName="Courses"
            isValidated={isValidated}
            onValidate={validate}
            onUnvalidate={cancel}
            disabled={disabled}
            isPending={false}
          />
        )}
      </Box>
      
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '10%' }}>Statut</TableCell>
              <TableCell sx={{ width: '20%' }}>Champ</TableCell>
              <TableCell sx={{ width: '30%' }}>Valeur actuelle</TableCell>
              <TableCell sx={{ width: '30%' }}>Valeur proposée</TableCell>
              <TableCell sx={{ width: '10%' }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Courses existantes */}
            {existingRaces.map((race, raceIdx) => {
              const isDeleted = racesToDelete.has(race.id)
              
              return RACE_FIELDS.map((field, fieldIdx) => {
                const currentValue = getRaceCurrentValue(race, field.key)
                const isFirstRow = fieldIdx === 0
                
                return (
                  <TableRow
                    key={`existing-${race.id}-${field.key}`}
                    sx={{
                      opacity: isDeleted ? 0.4 : 1,
                      bgcolor: isDeleted ? 'error.light' : 'inherit'
                    }}
                  >
                    {isFirstRow && (
                      <TableCell rowSpan={RACE_FIELDS.length} sx={{ verticalAlign: 'top' }}>
                        <Chip
                          label={isDeleted ? "À supprimer" : "Existante"}
                          size="small"
                          color={isDeleted ? "error" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {field.label}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {field.format ? field.format(currentValue) : currentValue || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {renderEditableCell('existing', raceIdx, field.key, currentValue, field.format)}
                    </TableCell>
                    {isFirstRow && (
                      <TableCell rowSpan={RACE_FIELDS.length} sx={{ verticalAlign: 'top' }}>
                        <Tooltip title={isDeleted ? "Annuler la suppression" : "Supprimer"}>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleDelete(race.id, false, raceIdx)}
                            color={isDeleted ? "default" : "error"}
                            disabled={disabled}
                          >
                            {isDeleted ? <UndoIcon /> : <DeleteIcon />}
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            })}
            
            {/* Courses à ajouter */}
            {racesToAdd.map((race, raceIdx) => {
              const isFiltered = racesToAddFiltered.has(raceIdx)
              
              return RACE_FIELDS.map((field, fieldIdx) => {
                const proposedValue = getRaceProposedValue(race, field.key)
                const isFirstRow = fieldIdx === 0
                
                return (
                  <TableRow
                    key={`new-${raceIdx}-${field.key}`}
                    sx={{
                      opacity: isFiltered ? 0.4 : 1,
                      textDecoration: isFiltered ? 'line-through' : 'none'
                    }}
                  >
                    {isFirstRow && (
                      <TableCell rowSpan={RACE_FIELDS.length} sx={{ verticalAlign: 'top' }}>
                        <Chip
                          label={isFiltered ? "Supprimée" : "Nouvelle"}
                          size="small"
                          color={isFiltered ? "default" : "success"}
                          variant="outlined"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {field.label}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    </TableCell>
                    <TableCell>
                      {renderEditableCell('new', raceIdx, field.key, proposedValue, field.format)}
                    </TableCell>
                    {isFirstRow && (
                      <TableCell rowSpan={RACE_FIELDS.length} sx={{ verticalAlign: 'top' }}>
                        <Tooltip title={isFiltered ? "Restaurer" : "Supprimer"}>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleDelete(0, true, raceIdx)}
                            color={isFiltered ? "default" : "error"}
                            disabled={disabled}
                          >
                            {isFiltered ? <UndoIcon /> : <DeleteIcon />}
                          </IconButton>
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
