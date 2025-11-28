import React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
} from '@mui/material'

interface BlockChangesTableProps {
  blockType: string
  changes: any
  userModifiedChanges?: any
}

// Mapping des champs par type de bloc
const BLOCK_FIELDS: Record<string, string[]> = {
  event: ['name', 'city', 'country', 'websiteUrl', 'facebookUrl', 'instagramUrl', 'countrySubdivisionNameLevel1'],
  edition: ['year', 'startDate', 'endDate', 'timeZone', 'calendarStatus', 'registrationOpeningDate', 'registrationClosingDate'],
  organizer: ['name', 'legalName', 'email', 'phone', 'address', 'city', 'zipCode', 'country', 'websiteUrl'],
  races: ['races', 'racesToUpdate', 'racesToAdd', 'racesToDelete'],
}

// Labels français pour les champs
const FIELD_LABELS: Record<string, string> = {
  name: 'Nom',
  city: 'Ville',
  country: 'Pays',
  websiteUrl: 'Site web',
  facebookUrl: 'Facebook',
  instagramUrl: 'Instagram',
  year: 'Année',
  startDate: 'Date de début',
  endDate: 'Date de fin',
  timeZone: 'Fuseau horaire',
  calendarStatus: 'Statut calendrier',
  registrationOpeningDate: 'Ouverture inscriptions',
  registrationClosingDate: 'Fermeture inscriptions',
  legalName: 'Raison sociale',
  email: 'Email',
  phone: 'Téléphone',
  address: 'Adresse',
  zipCode: 'Code postal',
  races: 'Courses',
  racesToUpdate: 'Courses à modifier',
  racesToAdd: 'Courses à ajouter',
  racesToDelete: 'Courses à supprimer',
  countrySubdivisionNameLevel1: 'Région',
}

const BlockChangesTable: React.FC<BlockChangesTableProps> = ({
  blockType,
  changes,
  userModifiedChanges = {},
}) => {
  const fields = BLOCK_FIELDS[blockType] || []

  // Extraire la valeur proposée pour un champ
  const getProposedValue = (fieldName: string) => {
    // Priorité aux modifications utilisateur
    if (userModifiedChanges[fieldName] !== undefined) {
      return userModifiedChanges[fieldName]
    }

    // Sinon, valeur proposée par l'agent
    const change = changes[fieldName]
    if (!change) return null

    // Structure nouvelle (avec old/new)
    if (change.new !== undefined) {
      return change.new
    }

    // Structure ancienne (valeur directe)
    return change
  }

  // Extraire la valeur actuelle pour un champ
  const getCurrentValue = (fieldName: string) => {
    const change = changes[fieldName]
    if (!change) return null

    // Structure nouvelle (avec old/new)
    if (change.old !== undefined) {
      return change.old
    }

    return null
  }

  // Formatter une valeur pour affichage
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-'
    
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return `${value.length} éléments`
      }
      return JSON.stringify(value, null, 2)
    }

    if (typeof value === 'boolean') {
      return value ? 'Oui' : 'Non'
    }

    // Formater les dates
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
      try {
        return new Date(value).toLocaleString('fr-FR')
      } catch {
        return value
      }
    }

    return String(value)
  }

  // Filtrer les champs qui ont réellement des changements
  const fieldsWithChanges = fields.filter(field => {
    const proposedValue = getProposedValue(field)
    return proposedValue !== null && proposedValue !== undefined
  })

  if (fieldsWithChanges.length === 0) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Aucun changement détaillé disponible pour ce bloc
        </Typography>
      </Box>
    )
  }

  return (
    <TableContainer component={Paper} elevation={0}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>Champ</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Valeur actuelle</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Valeur proposée</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {fieldsWithChanges.map((fieldName) => {
            const currentValue = getCurrentValue(fieldName)
            const proposedValue = getProposedValue(fieldName)

            return (
              <TableRow key={fieldName} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {FIELD_LABELS[fieldName] || fieldName}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      fontFamily: 'monospace',
                      fontSize: 12,
                    }}
                  >
                    {formatValue(currentValue)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'primary.main',
                      fontWeight: 500,
                      fontFamily: 'monospace',
                      fontSize: 12,
                    }}
                  >
                    {formatValue(proposedValue)}
                  </Typography>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default BlockChangesTable
