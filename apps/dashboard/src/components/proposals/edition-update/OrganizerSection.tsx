import React, { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Link,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material'
import {
  CheckCircle as ApproveIcon,
  Business as BusinessIcon,
  Edit as EditIcon,
  EditNote as EditNoteIcon
} from '@mui/icons-material'
import type { ConsolidatedChange } from '@/pages/proposals/detail/base/GroupedProposalDetailBase'
import FieldEditor from '@/components/proposals/FieldEditor'
import BlockValidationButton from '@/components/proposals/BlockValidationButton'

interface OrganizerSectionProps {
  change?: ConsolidatedChange
  onApprove: () => void
  onFieldModify?: (fieldName: string, newValue: any) => void
  userModifiedChanges?: Record<string, any>
  disabled: boolean
  // Props de validation par bloc
  isBlockValidated?: boolean
  isBlockApplied?: boolean  // ✅ Nouveau : true si le bloc a déjà été appliqué en base (non annulable)
  onValidateBlock?: () => Promise<void>
  onValidateBlockWithDependencies?: (blockKey: string) => Promise<void>  // ✅ Nouveau
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
  validationDisabled?: boolean
  // Affichage colonnes
  showCurrentValue?: boolean
  showConfidence?: boolean
  showActions?: boolean
}

interface OrganizerField {
  key: string
  label: string
  currentValue: any
  proposedValue: any
}

const OrganizerSection: React.FC<OrganizerSectionProps> = ({
  change,
  onApprove,
  onFieldModify,
  userModifiedChanges = {},
  disabled,
  isBlockValidated = false,
  isBlockApplied = false,  // ✅ Nouveau
  onValidateBlock,
  onValidateBlockWithDependencies,  // ✅ Nouveau
  onUnvalidateBlock,
  isBlockPending = false,
  validationDisabled = false,
  showCurrentValue = true,
  showConfidence = true,
  showActions = true
}) => {
  const [editingField, setEditingField] = useState<string | null>(null)

  // Si change est undefined ET que le bloc est validé, afficher juste le bouton d'annulation
  if (!change && isBlockValidated) {
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
            bgcolor: 'action.hover',
            opacity: 0.7
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BusinessIcon color="action" />
            <Typography variant="h6">Organisateur</Typography>
            <Chip label="Validé" color="success" size="small" />
          </Box>
          {onValidateBlock && onUnvalidateBlock && (
            <BlockValidationButton
              blockKey="organizer"
              blockName="Organisateur"
              isValidated={isBlockValidated}
              isApplied={isBlockApplied}  // ✅ Nouveau : désactive l'annulation si appliqué
              onValidate={onValidateBlock}
              onValidateWithDependencies={onValidateBlockWithDependencies}  // ✅ Nouveau
              onUnvalidate={onUnvalidateBlock}
              disabled={validationDisabled}
              isPending={isBlockPending}
              useCascadeValidation={true}  // ✅ Activé par défaut
            />
          )}
        </Box>
      </Paper>
    )
  }

  if (!change) return null

  const organizer = change.options[0]?.proposedValue
  const currentOrganizer = change.currentValue
  const confidence = change.options[0]?.confidence || 0
  const hasConsensus = change.options.length > 1

  if (!organizer) return null

  // Construire les lignes du tableau
  const fields: OrganizerField[] = [
    { key: 'name', label: 'Nom', currentValue: currentOrganizer?.name, proposedValue: organizer?.name },
    { key: 'email', label: 'Email', currentValue: currentOrganizer?.email, proposedValue: organizer?.email },
    { key: 'phone', label: 'Téléphone', currentValue: currentOrganizer?.phone, proposedValue: organizer?.phone },
    { key: 'websiteUrl', label: 'Site web', currentValue: currentOrganizer?.websiteUrl, proposedValue: organizer?.websiteUrl },
    { key: 'facebookUrl', label: 'Facebook', currentValue: currentOrganizer?.facebookUrl, proposedValue: organizer?.facebookUrl },
    { key: 'instagramUrl', label: 'Instagram', currentValue: currentOrganizer?.instagramUrl, proposedValue: organizer?.instagramUrl }
  ].filter(f => f.proposedValue || f.currentValue) // Afficher seulement les champs qui ont une valeur

  // Détermine si un champ va réellement être modifié
  // Un champ est modifié seulement si la proposition a une valeur ET elle est différente de l'actuelle
  const willBeChanged = (field: OrganizerField): boolean => {
    // Si pas de valeur proposée (undefined ou null), pas de changement
    if (field.proposedValue === undefined || field.proposedValue === null) {
      return false
    }
    // Si valeur proposée différente de l'actuelle, c'est un changement
    return field.proposedValue !== field.currentValue
  }

  const handleStartEdit = (fieldKey: string) => {
    if (!disabled && !isBlockValidated && onFieldModify) {
      setEditingField(fieldKey)
    }
  }

  const handleSaveEdit = (fieldKey: string, newValue: any) => {
    if (onFieldModify) {
      // Pour les champs d'organisateur, on doit mettre à jour le champ 'organizer.fieldKey'
      const fullFieldName = `organizer.${fieldKey}`
      onFieldModify(fullFieldName, newValue)
    }
    setEditingField(null)
  }

  const handleCancelEdit = () => {
    setEditingField(null)
  }

  const getFieldValue = (fieldKey: string) => {
    // Vérifier si l'utilisateur a modifié cette valeur
    const modifiedKey = `organizer.${fieldKey}`
    if (userModifiedChanges[modifiedKey] !== undefined) {
      return userModifiedChanges[modifiedKey]
    }
    return organizer?.[fieldKey]
  }

  const formatFieldValue = (value: any, key: string, fieldKey: string) => {
    if (!value) return <Typography color="textSecondary">-</Typography>

    const isModified = userModifiedChanges[`organizer.${fieldKey}`] !== undefined

    // Champs URL : websiteUrl, facebookUrl, instagramUrl
    const isUrlField = ['websiteUrl', 'facebookUrl', 'instagramUrl'].includes(key)

    if (isUrlField) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Link href={value} target="_blank" rel="noopener">
            <Typography variant="body2">{value}</Typography>
          </Link>
          {isModified && (
            <Chip
              icon={<EditNoteIcon />}
              label="Modifié"
              size="small"
              color="warning"
              variant="outlined"
            />
          )}
        </Box>
      )
    }

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2">{value}</Typography>
        {isModified && (
          <Chip
            icon={<EditNoteIcon />}
            label="Modifié"
            size="small"
            color="warning"
            variant="outlined"
          />
        )}
      </Box>
    )
  }

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
          <BusinessIcon color="action" />
          <Typography variant="h6">Organisateur</Typography>
        </Box>
        {onValidateBlock && onUnvalidateBlock && (
          <BlockValidationButton
            blockKey="organizer"
            blockName="Organisateur"
            isValidated={isBlockValidated}
            isApplied={isBlockApplied}  // ✅ Nouveau : désactive l'annulation si appliqué
            onValidate={onValidateBlock}
            onValidateWithDependencies={onValidateBlockWithDependencies}  // ✅ Nouveau
            onUnvalidate={onUnvalidateBlock}
            disabled={validationDisabled}
            isPending={isBlockPending}
            useCascadeValidation={true}  // ✅ Activé par défaut
          />
        )}
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead sx={{ bgcolor: 'background.paper' }}>
            <TableRow>
              <TableCell sx={{ width: '20%', minWidth: 120 }}>Champ</TableCell>
              {showCurrentValue && <TableCell sx={{ width: '35%', minWidth: 150 }}>Valeur actuelle</TableCell>}
              <TableCell sx={{
                width: showConfidence
                  ? (showCurrentValue ? '35%' : '60%')
                  : (showCurrentValue ? '70%' : '80%'),
                minWidth: 150
              }}>Valeur proposée</TableCell>
              {showConfidence && <TableCell sx={{ width: '10%', minWidth: 80 }}>Confiance</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow
                key={field.key}
                sx={{
                  backgroundColor: isBlockValidated ? 'action.hover' : 'inherit',
                  opacity: isBlockValidated ? 0.6 : 1
                }}
              >
                <TableCell>
                  <Typography
                    variant="body2"
                    fontWeight={willBeChanged(field) ? 'bold' : 500}
                  >
                    {field.label}
                  </Typography>
                </TableCell>
                {showCurrentValue && (
                  <TableCell>
                    {formatFieldValue(field.currentValue, field.key, field.key)}
                  </TableCell>
                )}
                <TableCell>
                  {editingField === field.key ? (
                    <FieldEditor
                      fieldName={field.key}
                      initialValue={getFieldValue(field.key)}
                      fieldType="text"
                      onSave={handleSaveEdit}
                      onCancel={handleCancelEdit}
                    />
                  ) : (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: '100%' }}>
                      {formatFieldValue(getFieldValue(field.key), field.key, field.key)}
                      {showActions && onFieldModify && !disabled && !isBlockValidated && (
                        <Tooltip title="Modifier manuellement">
                          <IconButton
                            size="small"
                            onClick={() => handleStartEdit(field.key)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  )}
                </TableCell>
                {showConfidence && (
                  <TableCell>
                    <Typography variant="body2" color={hasConsensus ? 'success.main' : 'text.primary'}>
                      {Math.round(confidence * 100)}%{hasConsensus ? ` (${change.options.length} agents)` : ''}
                    </Typography>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}

export default OrganizerSection
