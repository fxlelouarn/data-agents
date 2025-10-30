import React, { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Button
} from '@mui/material'
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  ExpandMore as ExpandMoreIcon,
  DirectionsRun as RaceIcon,
  Edit as EditIcon
} from '@mui/icons-material'
import FieldEditor from './FieldEditor'

interface RaceChangeField {
  field: string
  options: Array<{
    proposalId: string
    agentName: string
    proposedValue: any
    confidence: number
    createdAt: string
  }>
  currentValue: any
}

interface RaceChange {
  raceName: string
  raceIndex: number
  fields: Record<string, RaceChangeField>
  informationalData?: Record<string, any>
  proposalIds: string[]
}

interface RaceChangesSectionProps {
  raceChanges: RaceChange[]
  formatValue: (value: any, isSimple?: boolean, timezone?: string) => React.ReactNode
  onRaceApprove?: (raceData: RaceChange) => void
  onApproveAll?: () => void
  onRejectAll?: () => void
  onFieldModify?: (raceIndex: number, fieldName: string, newValue: any) => void
  userModifiedRaceChanges?: Record<string, Record<string, any>> // { [raceIndex]: { [fieldName]: value } }
  disabled?: boolean
  timezone?: string // Timezone pour afficher les dates des courses
  isEditionCanceled?: boolean // Désactiver tous les champs si l'édition est annulée
}

const RaceChangesSection: React.FC<RaceChangesSectionProps> = ({
  raceChanges,
  formatValue,
  onRaceApprove,
  onApproveAll,
  onRejectAll,
  onFieldModify,
  userModifiedRaceChanges = {},
  disabled = false,
  timezone = 'Europe/Paris',
  isEditionCanceled = false
}) => {
  const [editingField, setEditingField] = useState<string | null>(null)
  
  const handleStartEdit = (raceIndex: number, fieldName: string) => {
    // Ne pas permettre d'éditer si désactivé globalement ou si l'édition est annulée
    if (!disabled && !isEditionCanceled && onFieldModify) {
      setEditingField(`${raceIndex}-${fieldName}`)
    }
  }
  
  const handleSaveEdit = (raceIndex: number, fieldName: string, newValue: any) => {
    if (onFieldModify) {
      onFieldModify(raceIndex, fieldName, newValue)
    }
    setEditingField(null)
  }
  
  const handleCancelEdit = () => {
    setEditingField(null)
  }
  
  const getFieldType = (fieldName: string): 'text' | 'number' | 'date' | 'datetime-local' => {
    if (fieldName.includes('Date')) return 'datetime-local'
    if (fieldName.includes('Distance') || fieldName.includes('Elevation') || fieldName.includes('price')) return 'number'
    return 'text'
  }
  
  if (raceChanges.length === 0) return null

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            <RaceIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Modifications des courses
          </Typography>
        </Box>
        
        {raceChanges.map((raceData, index) => (
          <Accordion key={index} sx={{ mb: 1 }} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                {raceData.raceName}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              
              
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '25%' }}>Champ</TableCell>
                      <TableCell sx={{ width: '35%' }}>Ancienne valeur</TableCell>
                      <TableCell sx={{ width: '40%' }}>Nouvelle valeur</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(raceData.fields)
                      .filter(([fieldName]) => fieldName !== 'raceId') // Filtrer raceId
                      .map(([fieldName, fieldData]: [string, RaceChangeField]) => {
                      
                      return (
                        <TableRow 
                          key={fieldName}
                          sx={{
                            backgroundColor: isEditionCanceled ? 'action.hover' : 'inherit',
                            opacity: isEditionCanceled ? 0.6 : 1
                          }}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>
                              {fieldName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {formatValue(fieldData.currentValue, false, timezone) || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {editingField === `${raceData.raceIndex}-${fieldName}` ? (
                              <FieldEditor
                                fieldName={fieldName}
                                initialValue={userModifiedRaceChanges[raceData.raceIndex]?.[fieldName] || fieldData.options[0].proposedValue}
                                fieldType={getFieldType(fieldName)}
                                onSave={(_, newValue) => handleSaveEdit(raceData.raceIndex, fieldName, newValue)}
                                onCancel={handleCancelEdit}
                              />
                            ) : (
                              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <Typography variant="body2">
                                  {formatValue(userModifiedRaceChanges[raceData.raceIndex]?.[fieldName] || fieldData.options[0].proposedValue, false, timezone)}
                                </Typography>
                                
                                {/* Bouton modifier pour les dates */}
                                {fieldName === 'startDate' && onFieldModify && !disabled && !isEditionCanceled && (
                                  <Tooltip title="Modifier manuellement">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleStartEdit(raceData.raceIndex, fieldName)}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        ))}
      </CardContent>
    </Card>
  )
}

export default RaceChangesSection
