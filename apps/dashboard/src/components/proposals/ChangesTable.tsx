import React from 'react'
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
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Schedule as ScheduleIcon,
  LocationOn as LocationIcon,
  Euro as PriceIcon,
  Speed as DistanceIcon,
  Info as InfoIcon,
  Groups as GroupsIcon,
  Edit as EditIcon
} from '@mui/icons-material'

interface ChangeOption {
  proposalId: string
  agentName: string
  proposedValue: any
  confidence: number
  createdAt: string
}

interface ConsolidatedChange {
  field: string
  options: ChangeOption[]
  currentValue: any
}

interface ChangesTableProps {
  title: string
  changes: ConsolidatedChange[]
  isNewEvent: boolean
  selectedChanges: Record<string, any>
  onFieldApprove: (fieldName: string, value: any) => void
  onFieldReject?: (fieldName: string) => void
  formatValue: (value: any, isSimple?: boolean) => React.ReactNode
  formatAgentsList: (agents: Array<{ agentName: string, confidence: number }>) => string
  disabled?: boolean
  actions?: React.ReactNode
}

const ChangesTable: React.FC<ChangesTableProps> = ({
  title,
  changes,
  isNewEvent,
  selectedChanges,
  onFieldApprove,
  onFieldReject,
  formatValue,
  formatAgentsList,
  disabled = false,
  actions
}) => {
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
    const hasMultipleValues = uniqueValues.length > 1
    
    // Trier les valeurs selon notre logique (consensus puis confiance)
    const sortedOptions = (uniqueValues as string[])
      .map((valueStr) => {
        const value = JSON.parse(valueStr)
        const supportingAgents = change.options.filter(opt => 
          JSON.stringify(opt.proposedValue) === valueStr
        )
        const hasConsensus = supportingAgents.length > 1
        const maxConfidence = Math.max(...supportingAgents.map(agent => agent.confidence))
        
        return {
          valueStr,
          value,
          supportingAgents,
          hasConsensus,
          consensusCount: supportingAgents.length,
          maxConfidence
        }
      })
      .sort((a, b) => {
        // 1. Priorité au consensus (plus d'agents = mieux)
        if (a.consensusCount !== b.consensusCount) {
          return b.consensusCount - a.consensusCount
        }
        // 2. Si égalité, priorité à la confiance la plus élevée
        return b.maxConfidence - a.maxConfidence
      })

    // Calculer la confiance pour la valeur sélectionnée
    const selectedValue = selectedChanges[fieldName] || (sortedOptions.length > 0 ? sortedOptions[0].value : null)
    const selectedOption = sortedOptions.find(opt => JSON.stringify(opt.value) === JSON.stringify(selectedValue))
    const confidenceDisplay = selectedOption ? 
      `${Math.round(selectedOption.maxConfidence * 100)}%${selectedOption.hasConsensus ? ` (${selectedOption.consensusCount} agents)` : ''}` : '-'

    return (
      <TableRow key={fieldName}>
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
            {change.currentValue ? formatValue(change.currentValue) : (
              <Typography color="textSecondary">-</Typography>
            )}
          </TableCell>
        )}
        <TableCell sx={{ width: isNewEvent ? '40%' : '35%', minWidth: 200 }}>
          {hasMultipleValues ? (
            <FormControl size="small" sx={{ minWidth: 200, maxWidth: '100%', width: '100%' }}>
              <Select
                value={selectedChanges[fieldName] !== undefined ? JSON.stringify(selectedChanges[fieldName]) : (sortedOptions.length > 0 ? JSON.stringify(sortedOptions[0].value) : '')}
                onChange={(e) => {
                  try {
                    const parsedValue = JSON.parse(e.target.value as string)
                    onFieldApprove(fieldName, parsedValue)
                  } catch (error) {
                    console.error('Error parsing selected value:', error)
                  }
                }}
              >
                {sortedOptions.map(({ value, supportingAgents, hasConsensus }, index) => (
                  <MenuItem key={index} value={JSON.stringify(value)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: hasConsensus ? 'bold' : 'normal' }}>
                          {formatValue(value, true)}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {formatAgentsList(supportingAgents)}
                        </Typography>
                      </Box>
                      {hasConsensus && (
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
                color: change.options[0].proposedValue !== change.currentValue ? 'primary.main' : 'text.secondary',
                fontWeight: change.options[0].proposedValue !== change.currentValue ? 500 : 400,
                maxWidth: '100%'
              }}
            >
              {formatValue(change.options[0].proposedValue)}
            </Box>
          )
        }</TableCell>
        <TableCell sx={{ width: '15%', minWidth: 100 }}>
          <Typography variant="body2" color={selectedOption?.hasConsensus ? 'success.main' : 'text.primary'}>
            {confidenceDisplay}
          </Typography>
        </TableCell>
        <TableCell sx={{ width: isNewEvent ? '15%' : '10%', minWidth: 120 }}>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-start' }}>
            <Tooltip title="Approuver cette valeur">
              <IconButton 
                size="small" 
                color="success"
                onClick={() => {
                  const valueToApprove = hasMultipleValues ? 
                    (selectedChanges[fieldName] || (sortedOptions.length > 0 ? sortedOptions[0].value : null)) : 
                    change.options[0].proposedValue
                  onFieldApprove(fieldName, valueToApprove)
                }}
                disabled={disabled}
              >
                <ApproveIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Rejeter cette valeur">
              <IconButton 
                size="small" 
                color="error"
                onClick={() => onFieldReject?.(fieldName)}
                disabled={disabled}
              >
                <RejectIcon />
              </IconButton>
            </Tooltip>
          </Box>
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
              <TableCell sx={{ width: isNewEvent ? '40%' : '35%', minWidth: 200 }}>Valeur proposée</TableCell>
              <TableCell sx={{ width: '15%', minWidth: 100 }}>Confiance</TableCell>
              <TableCell sx={{ width: isNewEvent ? '15%' : '10%', minWidth: 120 }}>Actions</TableCell>
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

export default ChangesTable