import React from 'react'
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
  Link
} from '@mui/material'
import {
  CheckCircle as ApproveIcon,
  Add as AddIcon
} from '@mui/icons-material'
import type { ConsolidatedChange } from '@/pages/proposals/detail/base/GroupedProposalDetailBase'

interface RacesToAddSectionProps {
  change: ConsolidatedChange
  onApprove: () => void
  disabled: boolean
}

interface RaceToAdd {
  name: string
  type?: string
  distance?: number
  startDate?: string
  registrationUrl?: string
}

const RacesToAddSection: React.FC<RacesToAddSectionProps> = ({ change, onApprove, disabled }) => {
  const races = change.options[0]?.proposedValue as RaceToAdd[] | undefined
  const confidence = change.options[0]?.confidence || 0
  const hasConsensus = change.options.length > 1
  
  if (!races || races.length === 0) return null
  
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
      return <Chip size="small" label={value} variant="outlined" />
    }
    
    return <Typography variant="body2">{value}</Typography>
  }
  
  return (
    <Paper sx={{ mb: 3 }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddIcon color="primary" />
          <Typography variant="h6">Courses à ajouter ({races.length})</Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={<ApproveIcon />}
          onClick={onApprove}
          disabled={disabled}
        >
          Approuver tout
        </Button>
      </Box>
      
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '25%', minWidth: 120 }}>Course</TableCell>
              <TableCell sx={{ width: '15%', minWidth: 100 }}>Champ</TableCell>
              <TableCell sx={{ width: '25%', minWidth: 120 }}>Valeur actuelle</TableCell>
              <TableCell sx={{ width: '25%', minWidth: 120 }}>Valeur proposée</TableCell>
              <TableCell sx={{ width: '10%', minWidth: 80 }}>Confiance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {row.isFirstRow && (
                  <TableCell rowSpan={row.rowSpan} sx={{ verticalAlign: 'top', pt: 2, fontWeight: 500 }}>
                    <Typography variant="body2" fontWeight={500}>
                      {row.raceName}
                    </Typography>
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
                <TableCell>
                  <Typography variant="body2" color={hasConsensus ? 'success.main' : 'text.primary'}>
                    {Math.round(confidence * 100)}%{hasConsensus ? ` (${change.options.length} agents)` : ''}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}

export default RacesToAddSection
