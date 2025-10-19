import React from 'react'
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
  DirectionsRun as RaceIcon
} from '@mui/icons-material'

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
  formatValue: (value: any, isSimple?: boolean) => React.ReactNode
  onRaceApprove: (raceData: RaceChange) => void
  onApproveAll?: () => void
  onRejectAll?: () => void
  disabled?: boolean
}

const RaceChangesSection: React.FC<RaceChangesSectionProps> = ({
  raceChanges,
  formatValue,
  onRaceApprove,
  onApproveAll,
  onRejectAll,
  disabled = false
}) => {
  
  if (raceChanges.length === 0) return null

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            <RaceIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Modifications des courses
          </Typography>
          {(onApproveAll || onRejectAll) && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {onApproveAll && (
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  startIcon={<ApproveIcon />}
                  onClick={onApproveAll}
                  disabled={disabled}
                >
                  Tout approuver
                </Button>
              )}
              {onRejectAll && (
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<RejectIcon />}
                  onClick={onRejectAll}
                  disabled={disabled}
                >
                  Tout rejeter
                </Button>
              )}
            </Box>
          )}
        </Box>
        
        {raceChanges.map((raceData, index) => (
          <Accordion key={index} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                  {raceData.raceName}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip 
                    size="small" 
                    label={`${Object.keys(raceData.fields).length} champ${Object.keys(raceData.fields).length > 1 ? 's' : ''}`}
                    variant="outlined"
                  />
                  <Chip 
                    size="small" 
                    label={`${raceData.proposalIds.length} proposition${raceData.proposalIds.length > 1 ? 's' : ''}`}
                    color="info"
                  />
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  startIcon={<ApproveIcon />}
                  onClick={() => onRaceApprove(raceData)}
                  disabled={disabled}
                >
                  Approuver toute la course
                </Button>
              </Box>
              
              {/* Afficher les champs informationnels */}
              {raceData.informationalData && Object.keys(raceData.informationalData).length > 0 && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Informations
                  </Typography>
                  {Object.entries(raceData.informationalData).map(([key, value]) => (
                    <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {key}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {formatValue(value)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
              
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '15%' }}>Champ</TableCell>
                      <TableCell sx={{ width: '20%' }}>Ancienne valeur</TableCell>
                      <TableCell sx={{ width: '20%' }}>Nouvelle valeur</TableCell>
                      <TableCell sx={{ width: '15%' }}>Confiance</TableCell>
                      <TableCell sx={{ width: '15%' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(raceData.fields).map(([fieldName, fieldData]: [string, RaceChangeField]) => {
                      const uniqueValues = [...new Set(fieldData.options.map(opt => JSON.stringify(opt.proposedValue)))]
                      const hasMultipleValues = uniqueValues.length > 1
                      
                      // Trier les options comme pour les champs normaux
                      const sortedOptions = (uniqueValues as string[])
                        .map((valueStr) => {
                          const value = JSON.parse(valueStr)
                          const supportingAgents = fieldData.options.filter(opt => 
                            JSON.stringify(opt.proposedValue) === valueStr
                          )
                          const maxConfidence = Math.max(...supportingAgents.map(agent => agent.confidence))
                          
                          return {
                            value,
                            supportingAgents,
                            consensusCount: supportingAgents.length,
                            maxConfidence
                          }
                        })
                        .sort((a, b) => {
                          if (a.consensusCount !== b.consensusCount) {
                            return b.consensusCount - a.consensusCount
                          }
                          return b.maxConfidence - a.maxConfidence
                        })
                      
                      const selectedOption = sortedOptions[0]
                      const confidenceDisplay = selectedOption ? 
                        `${Math.round(selectedOption.maxConfidence * 100)}%${selectedOption.consensusCount > 1 ? ` (${selectedOption.consensusCount} agents)` : ''}` : '-'
                      
                      return (
                        <TableRow key={fieldName}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>
                              {fieldName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {formatValue(fieldData.currentValue) || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {hasMultipleValues ? (
                              <FormControl size="small" sx={{ minWidth: 150 }}>
                                <Select defaultValue={JSON.stringify(sortedOptions[0].value)}>
                                  {sortedOptions.map(({ value, supportingAgents }, optIndex) => (
                                    <MenuItem key={optIndex} value={JSON.stringify(value)}>
                                      <Box>
                                        <Typography variant="body2">
                                          {formatValue(value, true)}
                                        </Typography>
                                        <Typography variant="caption" color="textSecondary">
                                          {supportingAgents.map((agent: any) => `${agent.agentName} (${Math.round(agent.confidence * 100)}%)`).join(', ')}
                                        </Typography>
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            ) : (
                              <Typography variant="body2">
                                {formatValue(fieldData.options[0].proposedValue)}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color={selectedOption?.consensusCount > 1 ? 'success.main' : 'text.primary'}>
                              {confidenceDisplay}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Tooltip title="Approuver">
                                <IconButton size="small" color="success" disabled={disabled}>
                                  <ApproveIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Rejeter">
                                <IconButton size="small" color="error" disabled={disabled}>
                                  <RejectIcon />
                                </IconButton>
                              </Tooltip>
                            </Box>
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
