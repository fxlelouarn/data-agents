import React, { useState } from 'react'
import {
  Box,
  Typography,
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
  Tooltip
} from '@mui/material'
import {
  Schedule as ScheduleIcon,
  LocationOn as LocationIcon,
  Euro as PriceIcon,
  Speed as DistanceIcon,
  Info as InfoIcon,
  Groups as GroupsIcon,
  Edit as EditIcon,
  EditNote as EditNoteIcon
} from '@mui/icons-material'
import FieldEditor from './FieldEditor'

export interface ChangeOption {
  proposalId: string
  agentName: string
  proposedValue: any
  confidence: number
  createdAt: string
}

export interface ConsolidatedChange {
  field: string
  options: ChangeOption[]
  currentValue: any
}

export interface BaseChangesTableProps {
  title: string
  changes: ConsolidatedChange[]
  isNewEvent: boolean
  selectedChanges: Record<string, any>
  onFieldSelect?: (fieldName: string, value: any) => void
  onFieldApprove: (fieldName: string, value: any) => void
  onFieldReject?: (fieldName: string) => void
  onFieldModify?: (fieldName: string, newValue: any, reason?: string) => void
  userModifiedChanges?: Record<string, any>
  formatValue: (value: any, isSimple?: boolean, timezone?: string) => React.ReactNode
  formatAgentsList: (agents: Array<{ agentName: string, confidence: number }>) => string
  disabled?: boolean
  actions?: React.ReactNode
  timezone?: string
  isFieldDisabledFn?: (fieldName: string) => boolean
  renderCustomEditor?: (fieldName: string, selectedValue: any, onSave: (fieldName: string, newValue: any) => void, onCancel: () => void) => React.ReactNode | null
}

const BaseChangesTable: React.FC<BaseChangesTableProps> = ({
  title,
  changes,
  isNewEvent,
  selectedChanges,
  onFieldSelect,
  onFieldApprove,
  onFieldReject,
  onFieldModify,
  userModifiedChanges = {},
  formatValue,
  formatAgentsList,
  disabled = false,
  actions,
  timezone = 'Europe/Paris',
  isFieldDisabledFn,
  renderCustomEditor
}) => {
  const [editingField, setEditingField] = useState<string | null>(null)
  
  const handleStartEdit = (fieldName: string) => {
    const isFieldDisabled = disabled || (isFieldDisabledFn && isFieldDisabledFn(fieldName))
    if (!isFieldDisabled && onFieldModify) {
      setEditingField(fieldName)
    }
  }
  
  const handleSaveEdit = (fieldName: string, newValue: any) => {
    if (onFieldModify) {
      onFieldModify(fieldName, newValue, 'Modifié manuellement')
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
  
  const getFieldIcon = (fieldName: string) => {
    if (fieldName.includes('Date')) return <ScheduleIcon fontSize="small" />
    if (fieldName === 'location') return <LocationIcon fontSize="small" />
    if (fieldName === 'price') return <PriceIcon fontSize="small" />
    if (fieldName === 'distance') return <DistanceIcon fontSize="small" />
    return <InfoIcon fontSize="small" />
  }

  const renderFieldComparison = (change: ConsolidatedChange) => {
    const { field: fieldName } = change
    const uniqueValues = [...new Set(change.options.map(opt => JSON.stringify(opt.proposedValue)))]
    
    const manualValue = userModifiedChanges[fieldName]
    const manualValueStr = manualValue !== undefined ? JSON.stringify(manualValue) : null
    const hasManualValue = manualValueStr && !uniqueValues.includes(manualValueStr)
    
    if (hasManualValue) {
      uniqueValues.unshift(manualValueStr!)
    }
    
    const hasMultipleValues = uniqueValues.length > 1
    const isFieldDisabled = disabled || (isFieldDisabledFn && isFieldDisabledFn(fieldName))
    
    const sortedOptions = (uniqueValues as string[])
      .map((valueStr) => {
        const value = JSON.parse(valueStr)
        const isManual = valueStr === manualValueStr
        const supportingAgents = isManual ? [] : change.options.filter(opt => 
          JSON.stringify(opt.proposedValue) === valueStr
        )
        const hasConsensus = supportingAgents.length > 1
        const maxConfidence = isManual ? 1 : Math.max(...supportingAgents.map(agent => agent.confidence))
        
        return {
          valueStr,
          value,
          supportingAgents,
          hasConsensus,
          consensusCount: supportingAgents.length,
          maxConfidence,
          isManual
        }
      })
      .sort((a, b) => {
        if (a.isManual && !b.isManual) return -1
        if (!a.isManual && b.isManual) return 1
        
        if (a.maxConfidence !== b.maxConfidence) {
          return b.maxConfidence - a.maxConfidence
        }
        return b.consensusCount - a.consensusCount
      })

    const selectedValue = selectedChanges[fieldName] || (sortedOptions.length > 0 ? sortedOptions[0].value : null)
    const selectedOption = sortedOptions.find(opt => JSON.stringify(opt.value) === JSON.stringify(selectedValue))
    const confidenceDisplay = selectedOption ? 
      `${Math.round(selectedOption.maxConfidence * 100)}%${selectedOption.hasConsensus ? ` (${selectedOption.consensusCount} agents)` : ''}` : '-'

    return (
      <TableRow 
        key={fieldName}
        sx={{
          backgroundColor: isFieldDisabled ? 'action.hover' : 'inherit',
          opacity: isFieldDisabled ? 0.6 : 1
        }}
      >
        <TableCell sx={{ width: '15%', minWidth: 120 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {getFieldIcon(fieldName)}
            <Typography variant="body2" fontWeight={500} noWrap>
              {fieldName}
            </Typography>
            {hasMultipleValues && (
              <Tooltip title="Plusieurs valeurs proposées">
                <GroupsIcon fontSize="small" color="info" />
              </Tooltip>
            )}
          </Box>
        </TableCell>
        {!isNewEvent && (
          <TableCell sx={{ width: '20%', minWidth: 120 }}>
            {change.currentValue ? formatValue(change.currentValue, false, timezone) : (
              <Typography color="textSecondary">-</Typography>
            )}
          </TableCell>
        )}
        <TableCell sx={{ width: isNewEvent ? '50%' : '45%', minWidth: 200 }}>
          {editingField === fieldName ? (
            renderCustomEditor && renderCustomEditor(fieldName, selectedValue, handleSaveEdit, handleCancelEdit) ? (
              renderCustomEditor(fieldName, selectedValue, handleSaveEdit, handleCancelEdit)
            ) : (
              <FieldEditor
                fieldName={fieldName}
                initialValue={selectedValue}
                fieldType={getFieldType(fieldName)}
                timezone={timezone}
                onSave={handleSaveEdit}
                onCancel={handleCancelEdit}
              />
            )
          ) : (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {hasMultipleValues ? (
                <FormControl size="small" sx={{ minWidth: 200, maxWidth: '100%', width: '100%' }}>
                  <Select
                    value={selectedChanges[fieldName] !== undefined ? JSON.stringify(selectedChanges[fieldName]) : (sortedOptions.length > 0 ? JSON.stringify(sortedOptions[0].value) : '')}
                    onChange={(e) => {
                      try {
                        const parsedValue = JSON.parse(e.target.value as string)
                        if (onFieldSelect) {
                          onFieldSelect(fieldName, parsedValue)
                        }
                      } catch (error) {
                        console.error('Error parsing selected value:', error)
                      }
                    }}
                    disabled={isFieldDisabled}
                  >
                    {sortedOptions.map(({ value, supportingAgents, hasConsensus, isManual }, index) => (
                      <MenuItem key={index} value={JSON.stringify(value)}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: hasConsensus ? 'bold' : 'normal' }}>
                              {formatValue(value, true, timezone)}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {isManual ? 'Valeur manuelle' : formatAgentsList(supportingAgents)}
                            </Typography>
                          </Box>
                          {!isManual && hasConsensus && (
                            <Chip
                              size="small"
                              label={`${supportingAgents.length} agents`}
                              color="success"
                              variant="filled"
                              sx={{ ml: 1, fontSize: '0.75rem', height: '20px' }}
                            />
                          )}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <Box
                  sx={{ 
                    color: selectedValue !== change.currentValue ? 'primary.main' : 'text.secondary',
                    fontWeight: selectedValue !== change.currentValue ? 500 : 400,
                    maxWidth: '100%'
                  }}
                >
                  {formatValue(selectedValue, false, timezone)}
                </Box>
              )}
              
              {userModifiedChanges[fieldName] && (
                <Chip
                  icon={<EditNoteIcon />}
                  label="Modifié"
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              )}
              
              {onFieldModify && !isFieldDisabled && (
                <Tooltip title="Modifier manuellement">
                  <IconButton
                    size="small"
                    onClick={() => handleStartEdit(fieldName)}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
        </TableCell>
        <TableCell sx={{ width: isNewEvent ? '20%' : '15%', minWidth: 100 }}>
          <Typography variant="body2" color={selectedOption?.hasConsensus ? 'success.main' : 'text.primary'}>
            {confidenceDisplay}
          </Typography>
        </TableCell>
      </TableRow>
    )
  }

  if (changes.length === 0) return null

  return (
    <Paper>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">
          <EditIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          {title}
        </Typography>
        {actions}
      </Box>
      
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '15%', minWidth: 120 }}>Champ</TableCell>
              {!isNewEvent && <TableCell sx={{ width: '20%', minWidth: 120 }}>Valeur actuelle</TableCell>}
              <TableCell sx={{ width: isNewEvent ? '50%' : '45%', minWidth: 200 }}>Valeur proposée</TableCell>
              <TableCell sx={{ width: isNewEvent ? '20%' : '15%', minWidth: 100 }}>Confiance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {changes.map(renderFieldComparison)}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}

export default BaseChangesTable
