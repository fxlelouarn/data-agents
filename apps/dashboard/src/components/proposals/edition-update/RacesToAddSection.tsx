import React, { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Link,
  IconButton,
  Tooltip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import {
  CheckCircle as ApproveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Undo as UndoIcon,
  Edit as EditIcon
} from '@mui/icons-material'
import type { ConsolidatedChange } from '@/pages/proposals/detail/base/GroupedProposalDetailBase'
import BlockValidationButton from '@/components/proposals/BlockValidationButton'
import { useProposalBlockValidation } from '@/hooks/useProposalBlockValidation'
import { useUpdateProposal } from '@/hooks/useApi'

interface RacesToAddSectionProps {
  change: ConsolidatedChange
  onApprove: () => void
  disabled: boolean
  proposalId?: string
  proposal?: any // Full proposal object with existingRaces
}

interface RaceToAdd {
  name: string
  type?: string
  distance?: number
  startDate?: string
  registrationUrl?: string
}

interface ExistingRace {
  id: number
  name: string
  distance?: number
  elevation?: number
  type?: string
  startDate?: string
}

const RacesToAddSection: React.FC<RacesToAddSectionProps> = ({ change, onApprove, disabled, proposalId, proposal }) => {
  const races = change.options[0]?.proposedValue as RaceToAdd[] | undefined
  const confidence = change.options[0]?.confidence || 0
  const hasConsensus = change.options.length > 1
  const existingRaces: ExistingRace[] = proposal?.existingRaces || []
  
  // Suivre les courses à supprimer et les courses nouvelles supprimées
  const [racesToDelete, setRacesToDelete] = useState<Set<number>>(new Set())
  const [racesToAddFiltered, setRacesToAddFiltered] = useState<Set<number>>(new Set()) // Indices des courses à ne pas ajouter
  const [racesToAddEdited, setRacesToAddEdited] = useState<Record<number, Partial<RaceToAdd>>>({}) // Éditions des courses
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRaceIndex, setEditingRaceIndex] = useState<number | null>(null)
  const [editingRaceName, setEditingRaceName] = useState('')
  
  const updateProposalMutation = useUpdateProposal()
  
  // Charger les modifications depuis userModifiedChanges
  useEffect(() => {
    if (proposal?.userModifiedChanges?.racesToDelete) {
      setRacesToDelete(new Set(proposal.userModifiedChanges.racesToDelete))
    }
    if (proposal?.userModifiedChanges?.racesToAddFiltered) {
      setRacesToAddFiltered(new Set(proposal.userModifiedChanges.racesToAddFiltered))
    }
    if (proposal?.userModifiedChanges?.racesToAddEdited) {
      setRacesToAddEdited(proposal.userModifiedChanges.racesToAddEdited)
    }
  }, [proposal?.userModifiedChanges])
  
  // Synchroniser avec le backend
  const syncWithBackend = async (updates: Partial<{
    racesToDelete: number[]
    racesToAddFiltered: number[]
    racesToAddEdited: Record<number, Partial<RaceToAdd>>
  }>) => {
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
  
  const handleToggleDelete = (raceId: number) => {
    const newRacesToDelete = new Set(racesToDelete)
    if (newRacesToDelete.has(raceId)) {
      newRacesToDelete.delete(raceId)
    } else {
      newRacesToDelete.add(raceId)
    }
    setRacesToDelete(newRacesToDelete)
    syncWithBackend({ racesToDelete: Array.from(newRacesToDelete) })
  }
  
  const handleToggleNewRaceFilter = (raceIndex: number) => {
    const newFiltered = new Set(racesToAddFiltered)
    if (newFiltered.has(raceIndex)) {
      newFiltered.delete(raceIndex)
    } else {
      newFiltered.add(raceIndex)
    }
    setRacesToAddFiltered(newFiltered)
    syncWithBackend({ racesToAddFiltered: Array.from(newFiltered) })
  }
  
  const handleEditRace = (raceIndex: number, currentName: string) => {
    setEditingRaceIndex(raceIndex)
    setEditingRaceName(currentName)
    setEditDialogOpen(true)
  }
  
  const handleSaveEdit = () => {
    if (editingRaceIndex === null) return
    
    const newEdited = {
      ...racesToAddEdited,
      [editingRaceIndex]: {
        ...racesToAddEdited[editingRaceIndex],
        name: editingRaceName
      }
    }
    setRacesToAddEdited(newEdited)
    syncWithBackend({ racesToAddEdited: newEdited })
    setEditDialogOpen(false)
    setEditingRaceIndex(null)
  }
  
  const { isValidated, validate, cancel } = useProposalBlockValidation(
    proposalId,
    'races_to_add'
  )
  
  if (!races || races.length === 0) {
    // Si pas de courses à ajouter mais des courses existantes, afficher quand même
    if (existingRaces.length === 0) return null
  }
  
  // Construire les lignes du tableau - une ligne par champ de chaque course
  const rows: Array<{
    raceName: string
    fieldLabel: string
    currentValue: any
    proposedValue: any
    isFirstRow: boolean
    rowSpan: number
  }> = []
  
  races.forEach((race, raceIndex) => {
    const raceFields = [
      { label: 'Nom', currentValue: null, proposedValue: race.name },
      { label: 'Type', currentValue: null, proposedValue: race.type },
      { label: 'Distance (km)', currentValue: null, proposedValue: race.distance },
      { label: 'Date', currentValue: null, proposedValue: race.startDate ? new Date(race.startDate).toLocaleDateString('fr-FR') : null },
      { label: 'URL inscription', currentValue: null, proposedValue: race.registrationUrl }
    ].filter(f => f.proposedValue) // Ne garder que les champs qui ont une valeur
    
    raceFields.forEach((field, fieldIndex) => {
      rows.push({
        raceName: race.name,
        fieldLabel: field.label,
        currentValue: field.currentValue,
        proposedValue: field.proposedValue,
        isFirstRow: fieldIndex === 0,
        rowSpan: raceFields.length
      })
    })
  })
  
  const formatValue = (value: any, fieldLabel: string) => {
    if (!value) return <Typography color="textSecondary">-</Typography>
    
    if (fieldLabel === 'URL inscription') {
      return (
        <Link href={value} target="_blank" rel="noopener">
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{value}</Typography>
        </Link>
      )
    }
    
    if (fieldLabel === 'Type') {
      // Afficher en majuscule
      return <Chip size="small" label={String(value).toUpperCase()} variant="outlined" />
    }
    
    return <Typography variant="body2">{value}</Typography>
  }
  
  // Filtrer les courses à ajouter
  const filteredRacesToAdd = races?.filter((_, index) => !racesToAddFiltered.has(index)) || []
  
  const totalRaces = filteredRacesToAdd.length + existingRaces.length
  const racesToAddCount = filteredRacesToAdd.length
  const racesToDeleteCount = racesToDelete.size
  const removedNewRacesCount = racesToAddFiltered.size
  
  return (
    <Paper sx={{ mb: 3 }}>
      {/* Header avec bouton de validation */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddIcon color="primary" />
          <Typography variant="h6">
            Courses ({totalRaces} total
            {racesToAddCount > 0 && `, ${racesToAddCount} à ajouter`}
            {racesToDeleteCount > 0 && `, ${racesToDeleteCount} à supprimer`}
            {removedNewRacesCount > 0 && `, ${removedNewRacesCount} proposition(s) supprimée(s)`})
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
              <TableCell sx={{ width: '5%', minWidth: 60 }}>Statut</TableCell>
              <TableCell sx={{ width: '25%', minWidth: 120 }}>Course</TableCell>
              <TableCell sx={{ width: '15%', minWidth: 100 }}>Champ</TableCell>
              <TableCell sx={{ width: '25%', minWidth: 120 }}>Valeur actuelle</TableCell>
              <TableCell sx={{ width: '20%', minWidth: 120 }}>Valeur proposée</TableCell>
              <TableCell sx={{ width: '10%', minWidth: 60 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* Courses existantes */}
            {existingRaces.map((race, index) => {
              const isMarkedForDeletion = racesToDelete.has(race.id)
              return (
                <TableRow key={`existing-${race.id}`} sx={{ bgcolor: isMarkedForDeletion ? 'error.light' : 'inherit', opacity: isMarkedForDeletion ? 0.6 : 1 }}>
                  <TableCell>
                    <Chip 
                      label="Existante" 
                      size="small" 
                      color={isMarkedForDeletion ? "error" : "default"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500} sx={{ textDecoration: isMarkedForDeletion ? 'line-through' : 'none' }}>
                      {race.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {race.distance ? `${race.distance} km` : ''}
                      {race.elevation ? ` / D+ ${race.elevation}m` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>
                    <Tooltip title={isMarkedForDeletion ? "Annuler la suppression" : "Marquer pour suppression"}>
                      <IconButton 
                        size="small" 
                        onClick={() => handleToggleDelete(race.id)}
                        color={isMarkedForDeletion ? "default" : "error"}
                        disabled={disabled}
                      >
                        {isMarkedForDeletion ? <UndoIcon /> : <DeleteIcon />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              )
            })}
            
            {/* Courses à ajouter */}
            {rows.map((row, index) => {
              const raceIndex = races?.findIndex(r => r.name === row.raceName) ?? -1
              const isFiltered = racesToAddFiltered.has(raceIndex)
              const editedRace = racesToAddEdited[raceIndex]
              const displayName = editedRace?.name || row.raceName
              
              return (
                <TableRow key={`new-${index}`} sx={{ opacity: isFiltered ? 0.4 : 1, textDecoration: isFiltered ? 'line-through' : 'none' }}>
                  {row.isFirstRow && (
                    <TableCell rowSpan={row.rowSpan} sx={{ verticalAlign: 'top', pt: 2 }}>
                      <Chip 
                        label={isFiltered ? "Supprimée" : "Nouvelle"} 
                        size="small" 
                        color={isFiltered ? "default" : "success"} 
                        variant="outlined" 
                      />
                    </TableCell>
                  )}
                  {row.isFirstRow && (
                    <TableCell rowSpan={row.rowSpan} sx={{ verticalAlign: 'top', pt: 2, fontWeight: 500 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={500}>
                          {displayName}
                        </Typography>
                        {!isFiltered && (
                          <Tooltip title="Éditer le nom">
                            <IconButton 
                              size="small" 
                              onClick={() => handleEditRace(raceIndex, displayName)}
                              disabled={disabled}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  )}
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {row.fieldLabel}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {formatValue(row.currentValue, row.fieldLabel)}
                  </TableCell>
                  <TableCell>
                    {formatValue(row.proposedValue, row.fieldLabel)}
                  </TableCell>
                  {row.isFirstRow && (
                    <TableCell rowSpan={row.rowSpan} sx={{ verticalAlign: 'top', pt: 2 }}>
                      <Tooltip title={isFiltered ? "Restaurer la proposition" : "Supprimer la proposition"}>
                        <IconButton 
                          size="small" 
                          onClick={() => handleToggleNewRaceFilter(raceIndex)}
                          color={isFiltered ? "default" : "error"}
                          disabled={disabled}
                        >
                          {isFiltered ? <UndoIcon fontSize="small" /> : <DeleteIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Dialog d'édition du nom de course */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogTitle>Éditer le nom de la course</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nom de la course"
            fullWidth
            value={editingRaceName}
            onChange={(e) => setEditingRaceName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Annuler</Button>
          <Button onClick={handleSaveEdit} variant="contained">Enregistrer</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

export default RacesToAddSection
