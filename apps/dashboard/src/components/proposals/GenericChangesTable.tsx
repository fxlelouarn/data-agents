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
  Groups as GroupsIcon,
  Edit as EditIcon,
  EditNote as EditNoteIcon
} from '@mui/icons-material'
import { useChangesTable, ConsolidatedChange } from '@/hooks/useChangesTable'
import FieldEditor from './FieldEditor'
import BlockValidationButton from './BlockValidationButton'

/**
 * Props du composant GenericChangesTable
 */
export interface GenericChangesTableProps {
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
  renderCustomEditor?: (
    fieldName: string, 
    selectedValue: any, 
    onSave: (fieldName: string, newValue: any) => void, 
    onCancel: () => void
  ) => React.ReactNode | null
  entityType?: 'EVENT' | 'EDITION' | 'RACE'
  variant?: 'base' | 'categorized'
  // Validation par bloc
  isBlockValidated?: boolean
  onValidateBlock?: () => Promise<void>
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
  validationDisabled?: boolean
}

/**
 * GenericChangesTable - Composant générique pour afficher les changements
 * 
 * Remplace BaseChangesTable et CategorizedChangesTable en unifiant la logique.
 * Utilise le hook useChangesTable pour toute la logique métier.
 * 
 * @example
 * ```tsx
 * // Variante base (comme BaseChangesTable)
 * <GenericChangesTable
 *   variant="base"
 *   title="Modifications"
 *   changes={changes}
 *   // ...
 * />
 * 
 * // Variante catégorisée (comme CategorizedChangesTable)
 * <GenericChangesTable
 *   variant="categorized"
 *   entityType="EDITION"
 *   title="Modifications édition"
 *   changes={changes}
 *   // ...
 * />
 * ```
 */
const GenericChangesTable: React.FC<GenericChangesTableProps> = ({
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
  renderCustomEditor,
  entityType,
  variant = 'base',
  isBlockValidated = false,
  onValidateBlock,
  onUnvalidateBlock,
  isBlockPending = false,
  validationDisabled = false
}) => {
  // ─────────────────────────────────────────────────────────────
  // HOOK - Toute la logique est externalisée
  // ─────────────────────────────────────────────────────────────
  const table = useChangesTable({
    changes,
    selectedChanges,
    userModifiedChanges,
    disabled,
    isFieldDisabledFn,
    onFieldSelect,
    onFieldModify,
    entityType
  })

  // ─────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Rendu d'une cellule de valeur proposée en mode édition
   */
  const renderEditMode = (fieldName: string, selectedValue: any) => {
    // Custom editor si fourni
    const customEditor = renderCustomEditor?.(
      fieldName, 
      selectedValue, 
      table.handleSaveEdit, 
      table.handleCancelEdit
    )
    
    if (customEditor) {
      return customEditor
    }
    
    // Editeur par défaut
    return (
      <FieldEditor
        fieldName={fieldName}
        initialValue={selectedValue}
        fieldType={table.getFieldType(fieldName)}
        timezone={timezone}
        onSave={table.handleSaveEdit}
        onCancel={table.handleCancelEdit}
      />
    )
  }

  /**
   * Rendu d'une cellule de valeur proposée en mode lecture
   */
  const renderReadMode = (change: ConsolidatedChange) => {
    const { field: fieldName } = change
    const sortedOptions = table.getSortedOptions(change)
    const selectedValue = table.getSelectedValue(change)
    const isMultiple = table.hasMultipleValues(change)
    const fieldDisabled = table.isFieldDisabled(fieldName)

    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        {isMultiple ? (
          <FormControl size="small" sx={{ minWidth: 200, maxWidth: '100%', width: '100%' }}>
            <Select
              value={selectedChanges[fieldName] !== undefined 
                ? JSON.stringify(selectedChanges[fieldName]) 
                : JSON.stringify(sortedOptions[0]?.value ?? '')}
              onChange={(e) => table.handleFieldSelect(fieldName, e.target.value as string)}
              disabled={fieldDisabled}
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
        
        {onFieldModify && !fieldDisabled && (
          <Tooltip title="Modifier manuellement">
            <IconButton
              size="small"
              onClick={() => table.handleStartEdit(fieldName)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    )
  }

  /**
   * Rendu d'une ligne de comparaison (row)
   */
  const renderFieldComparison = (change: ConsolidatedChange) => {
    const { field: fieldName } = change
    const selectedValue = table.getSelectedValue(change)
    const confidenceDisplay = table.getConfidenceDisplay(change, selectedValue)
    const isMultiple = table.hasMultipleValues(change)
    const fieldDisabled = table.isFieldDisabled(fieldName)
    const isEditing = table.editingField === fieldName

    return (
      <TableRow 
        key={fieldName}
        sx={{
          backgroundColor: fieldDisabled ? 'action.hover' : 'inherit',
          opacity: fieldDisabled ? 0.6 : 1
        }}
      >
        {/* Colonne: Champ */}
        <TableCell sx={{ width: '15%', minWidth: 120 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {table.getFieldIcon(fieldName)}
            <Typography variant="body2" fontWeight={500} noWrap>
              {fieldName}
            </Typography>
            {isMultiple && (
              <Tooltip title="Plusieurs valeurs proposées">
                <GroupsIcon fontSize="small" color="info" />
              </Tooltip>
            )}
          </Box>
        </TableCell>
        
        {/* Colonne: Valeur actuelle (si pas nouveau) */}
        {!isNewEvent && (
          <TableCell sx={{ width: '20%', minWidth: 120 }}>
            {change.currentValue ? formatValue(change.currentValue, false, timezone) : (
              <Typography color="textSecondary">-</Typography>
            )}
          </TableCell>
        )}
        
        {/* Colonne: Valeur proposée */}
        <TableCell sx={{ width: isNewEvent ? '50%' : '45%', minWidth: 200 }}>
          {isEditing ? renderEditMode(fieldName, selectedValue) : renderReadMode(change)}
        </TableCell>
        
        {/* Colonne: Confiance */}
        <TableCell sx={{ width: isNewEvent ? '20%' : '15%', minWidth: 100 }}>
          <Typography 
            variant="body2" 
            color={table.getSortedOptions(change).find(opt => 
              JSON.stringify(opt.value) === JSON.stringify(selectedValue)
            )?.hasConsensus ? 'success.main' : 'text.primary'}
          >
            {confidenceDisplay}
          </Typography>
        </TableCell>
      </TableRow>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  const displayedChanges = table.filteredChanges
  
  // Aucun changement à afficher
  if (displayedChanges.length === 0) return null

  return (
    <Paper sx={{ mb: variant === 'categorized' ? 3 : 0 }}>
      {/* Header */}
      <Box 
        sx={{ 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          ...(variant === 'categorized' && { borderBottom: 1, borderColor: 'divider' }),
          ...(isBlockValidated && { bgcolor: 'action.disabledBackground', opacity: 0.7 })
        }}
      >
        <Typography variant="h6">
          {variant === 'base' && <EditIcon sx={{ mr: 1, verticalAlign: 'middle' }} />}
          {title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {onValidateBlock && onUnvalidateBlock && (
            <BlockValidationButton
              blockName={entityType === 'EDITION' ? 'Édition' : entityType === 'EVENT' ? 'Event' : entityType === 'RACE' ? 'Courses' : title}
              isValidated={isBlockValidated}
              onValidate={onValidateBlock}
              onUnvalidate={onUnvalidateBlock}
              disabled={validationDisabled}
              isPending={isBlockPending}
            />
          )}
          {actions}
        </Box>
      </Box>
      
      {/* Table */}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table 
          sx={{ minWidth: 650 }} 
          size={variant === 'categorized' ? 'small' : 'medium'}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '15%', minWidth: 120 }}>Champ</TableCell>
              {!isNewEvent && <TableCell sx={{ width: '20%', minWidth: 120 }}>Valeur actuelle</TableCell>}
              <TableCell sx={{ width: isNewEvent ? '50%' : '45%', minWidth: 200 }}>Valeur proposée</TableCell>
              <TableCell sx={{ width: isNewEvent ? '20%' : '15%', minWidth: 100 }}>Confiance</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedChanges.map(renderFieldComparison)}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}

export default GenericChangesTable
