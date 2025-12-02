import React from 'react'
import GenericChangesTable from './GenericChangesTable'
import type { ConsolidatedChange } from '@/hooks/useChangesTable'

interface CategorizedChangesTableProps {
  title: string
  entityType: 'EVENT' | 'EDITION' | 'RACE'
  changes: ConsolidatedChange[]
  isNewEvent: boolean
  selectedChanges: Record<string, any>
  onFieldSelect?: (fieldName: string, value: any) => void
  onFieldApprove?: (fieldName: string, value: any) => void
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
  // Validation par bloc
  isBlockValidated?: boolean
  onValidateBlock?: () => Promise<void>
  onUnvalidateBlock?: () => Promise<void>
  isBlockPending?: boolean
  validationDisabled?: boolean
  // ✅ Note: isFeaturedEvent retiré temporairement (non utilisé dans le code)
  // Peut être ré-ajouté plus tard pour affichage warning si Event.isFeatured = true
  // Affichage colonnes
  showCurrentValue?: boolean
  showConfidence?: boolean
  showActions?: boolean
}

/**
 * CategorizedChangesTable - Composant pour afficher les changements catégorisés (refactorisé)
 * 
 * Maintenant un simple wrapper autour de GenericChangesTable.
 * Filtre automatiquement les champs selon entityType.
 * Conserve 100% de rétrocompatibilité avec l'ancienne API.
 * 
 * @deprecated Utilisez GenericChangesTable directement avec variant="categorized".
 */
const CategorizedChangesTable: React.FC<CategorizedChangesTableProps> = (props) => {
  return <GenericChangesTable {...props} variant="categorized" />
}

export default CategorizedChangesTable
