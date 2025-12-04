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
import { CheckCircle as CheckCircleIcon } from '@mui/icons-material'

interface BlockChangesTableProps {
  blockType: string
  
  // ✅ NOUVEAU: Payload complet depuis l'application
  appliedChanges?: any
  
  // ✅ Indicateur si les changements sont déjà appliqués
  isApplied?: boolean
  
  // ⚠️ LEGACY: Fallback si appliedChanges vide
  changes?: any
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
  runDistance: 'Distance',
  bikeDistance: 'Distance vélo',
  walkDistance: 'Distance marche',
  swimDistance: 'Distance natation',
  runPositiveElevation: 'Dénivelé positif',
  categoryLevel1: 'Catégorie',
  categoryLevel2: 'Sous-catégorie',
}

const BlockChangesTable: React.FC<BlockChangesTableProps> = ({
  blockType,
  appliedChanges,
  isApplied = false,
  changes,
  userModifiedChanges = {},
}) => {
  // ✅ Prioriser appliedChanges (nouveau système)
  const effectiveChanges = appliedChanges || changes
  const needsManualMerge = !appliedChanges && userModifiedChanges
  
  console.log('🛠️ [BlockChangesTable] Source:', {
    blockType,
    hasAppliedChanges: !!appliedChanges,
    needsManualMerge,
    racesToDelete: effectiveChanges?.racesToDelete?.length || 0
  })
  
  const fields = BLOCK_FIELDS[blockType] || []

  // ✅ Pour le bloc organizer, les données sont imbriquées dans changes.organizer
  const getOrganizerData = () => {
    if (blockType !== 'organizer') return null
    
    const organizerChange = effectiveChanges.organizer
    if (!organizerChange) return null
    
    // Structure nouvelle (avec old/new)
    if (organizerChange.new) {
      return {
        current: organizerChange.old || {},
        proposed: organizerChange.new
      }
    }
    
    // Structure ancienne (objet direct)
    return {
      current: {},
      proposed: organizerChange
    }
  }

  const organizerData = getOrganizerData()

  // ✅ NOUVEAU: Extraire données Edition depuis structure imbriquée (NEW_EVENT)
  const getEditionData = () => {
    if (blockType !== 'edition') return null
    
    const editionChange = effectiveChanges.edition
    if (!editionChange) return null
    
    // Structure imbriquée (NEW_EVENT) : edition.new
    if (editionChange.new) {
      return {
        current: editionChange.old || {},
        proposed: editionChange.new
      }
    }
    
    // Structure plate (EDITION_UPDATE) : champs au niveau racine
    return null
  }

  const editionData = getEditionData()

  // Extraire la valeur proposée pour un champ
  const getProposedValue = (fieldName: string) => {
    // ✅ Cas spécial organizer
    if (blockType === 'organizer' && organizerData) {
      if (userModifiedChanges.organizer?.[fieldName] !== undefined) {
        return userModifiedChanges.organizer[fieldName]
      }
      return organizerData.proposed?.[fieldName]
    }

    // ✅ NOUVEAU: Cas spécial edition
    if (blockType === 'edition' && editionData) {
      if (userModifiedChanges[fieldName] !== undefined) {
        return userModifiedChanges[fieldName]
      }
      return editionData.proposed?.[fieldName]
    }

    // ✅ NOUVEAU: Cas spécial races pour NEW_EVENT
    // Les courses sont dans edition.new.races, pas dans racesToAdd au niveau racine
    if (blockType === 'races' && fieldName === 'racesToAdd') {
      // Priorité 1: racesToAdd au niveau racine (EDITION_UPDATE)
      if (effectiveChanges.racesToAdd) {
        return effectiveChanges.racesToAdd
      }
      
      // Priorité 2: edition.new.races (NEW_EVENT)
      if (effectiveChanges.edition?.new?.races) {
        return effectiveChanges.edition.new.races
      }
      
      return null
    }

    // ✅ Si appliedChanges existe, utiliser directement
    if (appliedChanges && fieldName === 'racesToDelete') {
      return appliedChanges.racesToDelete || []
    }
    
    // ⚠️ LEGACY: Extraction manuelle depuis userModifiedChanges
    if (needsManualMerge && fieldName === 'racesToDelete' && userModifiedChanges.raceEdits) {
      const deletedRaces: any[] = []
      Object.entries(userModifiedChanges.raceEdits).forEach(([key, mods]: [string, any]) => {
        if (mods._deleted === true) {
          console.log('🛠️ [BlockChangesTable] Course supprimée détectée (legacy):', { key, mods })
          deletedRaces.push({
            raceId: key,
            raceName: `Course ${key}`
          })
        }
      })
      console.log('🛠️ [BlockChangesTable] racesToDelete extrait (legacy):', deletedRaces)
      if (deletedRaces.length > 0) return deletedRaces
    }

    // Priorité aux modifications utilisateur (mode legacy uniquement)
    if (needsManualMerge && userModifiedChanges[fieldName] !== undefined) {
      return userModifiedChanges[fieldName]
    }

    // Sinon, valeur proposée depuis effectiveChanges
    const change = effectiveChanges[fieldName]
    if (!change) return null

    // ✅ Cas spécial courses : Extraire depuis change.new
    if (fieldName === 'racesToUpdate') {
      const racesArray = change.new || change
      if (Array.isArray(racesArray)) {
        return racesArray.filter((race: any) => race.updates && Object.keys(race.updates).length > 0)
      }
    }

    // Structure nouvelle (avec old/new)
    if (change.new !== undefined) {
      return change.new
    }

    // Structure ancienne (valeur directe)
    return change
  }

  // Extraire la valeur actuelle pour un champ
  const getCurrentValue = (fieldName: string) => {
    // ✅ Cas spécial organizer
    if (blockType === 'organizer' && organizerData) {
      return organizerData.current?.[fieldName]
    }

    // ✅ NOUVEAU: Cas spécial edition
    if (blockType === 'edition' && editionData) {
      return editionData.current?.[fieldName]
    }

    const change = effectiveChanges[fieldName]
    if (!change) return null

    // ✅ Cas spécial courses : Extraire depuis change.new (structure backend)
    if (fieldName === 'racesToUpdate') {
      // Structure backend : { new: [...], old: null }
      const racesArray = change.new || change
      if (Array.isArray(racesArray)) {
        // Retourner array pour formatValue
        return racesArray.filter((race: any) => race.updates && Object.keys(race.updates).length > 0)
      }
    }

    // Structure nouvelle (avec old/new)
    if (change.old !== undefined) {
      return change.old
    }

    return null
  }

  // Helper pour formatter une seule valeur (sans fieldName)
  const formatSingleValue = (val: any): string => {
    if (val === null || val === undefined) return '-'
    
    if (typeof val === 'boolean') return val ? 'Oui' : 'Non'
    
    // Dates
    if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
      try {
        return new Date(val).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
      } catch {
        return val
      }
    }
    
    if (typeof val === 'number') return val.toString()
    
    return String(val)
  }

  // Formatter une valeur pour affichage (avec séparation current/proposed)
  const formatValue = (value: any, fieldName?: string, isCurrentColumn?: boolean): string => {
    if (value === null || value === undefined) return '-'
    
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        // ✅ Cas spécial courses : afficher le détail
        if (fieldName && ['racesToUpdate', 'racesToAdd', 'racesToDelete', 'races'].includes(fieldName)) {
          if (value.length === 0) return 'Aucune'
          
          // Afficher nom + détail des changements pour chaque course
          return value.map((race: any, index: number) => {
            const raceName = race.raceName || race.name || `Course ${index + 1}`
            
            // Nouvelles courses : afficher tous les champs
            if (fieldName === 'racesToAdd') {
              const details: string[] = []
              if (race.runDistance) details.push(`${race.runDistance}km`)
              if (race.categoryLevel1) details.push(race.categoryLevel1)
              if (race.startDate) {
                try {
                  const date = new Date(race.startDate)
                  details.push(date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))
                } catch {
                  // ignore
                }
              }
              return `• ${raceName}${details.length > 0 ? ` (${details.join(', ')})` : ''}`
            }
            
            // Courses à modifier : séparer colonne actuelle / proposée
            if (fieldName === 'racesToUpdate' && race.updates) {
              const raceId = race.raceId || race.id
              const raceTitle = raceId ? `${raceName} (ID: ${raceId})` : raceName
              
              const changes = Object.entries(race.updates).map(([field, update]: [string, any]) => {
                const label = FIELD_LABELS[field] || field
                const val = isCurrentColumn ? update.old : update.new
                return `  ${label}: ${formatSingleValue(val)}`
              })
              
              if (changes.length === 0) return `• ${raceTitle}`
              return `• ${raceTitle}\n${changes.join('\n')}`
            }
            
            // Courses à supprimer
            if (fieldName === 'racesToDelete') {
              const raceId = race.raceId || race.id
              return raceId ? `• ${raceName} (ID: ${raceId})` : `• ${raceName}`
            }
            
            return `• ${raceName}`
          }).join('\n\n')
        }
        
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

  // ✅ TOUJOURS afficher TOUS les champs (avant, pendant et après application)
  // Filtrer uniquement les champs vides sans intérêt
  const fieldsWithChanges = fields.filter(field => {
    const proposedValue = getProposedValue(field)
    
    // ✅ Filtrer racesToDelete si vide (aucune suppression)
    if (field === 'racesToDelete') {
      return Array.isArray(proposedValue) && proposedValue.length > 0
    }
    
    // ✅ Garder tous les autres champs avec des valeurs
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
      {/* ✅ Bandeau indicateur si appliqué */}
      {isApplied && (
        <Box sx={{ bgcolor: 'success.light', px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon fontSize="small" sx={{ color: 'success.dark' }} />
          <Typography variant="body2" sx={{ color: 'success.dark', fontWeight: 600 }}>
            Changements appliqués avec succès
          </Typography>
        </Box>
      )}
      
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 600 }}>Champ</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Valeur actuelle</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>
              {isApplied ? 'Valeur appliquée' : 'Valeur proposée'}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {fieldsWithChanges.map((fieldName) => {
            const currentValue = getCurrentValue(fieldName)
            const proposedValue = getProposedValue(fieldName)

            return (
              <TableRow 
                key={fieldName} 
                hover
                sx={{
                  // ✅ Grisé si appliqué
                  bgcolor: isApplied ? 'action.hover' : 'transparent',
                  opacity: isApplied ? 0.8 : 1
                }}
              >
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
                      whiteSpace: 'pre-line',
                      textDecoration: isApplied ? 'line-through' : 'none'
                    }}
                  >
                    {formatValue(currentValue, fieldName, true)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{
                      color: isApplied ? 'success.dark' : 'primary.main',
                      fontWeight: isApplied ? 600 : 500,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {formatValue(proposedValue, fieldName, false)}
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
