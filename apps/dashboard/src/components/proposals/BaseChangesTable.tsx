import React from 'react'
import GenericChangesTable from './GenericChangesTable'
import type { ConsolidatedChange } from '@/hooks/useChangesTable'

// Re-export types from hook for backward compatibility
export type { ChangeOption, ConsolidatedChange } from '@/hooks/useChangesTable'

export interface BaseChangesTableProps {
  title: string
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
}

/**
 * BaseChangesTable - Composant pour afficher les changements (refactorisé)
 * 
 * Maintenant un simple wrapper autour de GenericChangesTable.
 * Conserve 100% de rétrocompatibilité avec l'ancienne API.
 * 
 * @deprecated Utilisez GenericChangesTable directement pour plus de flexibilité.
 */
const BaseChangesTable: React.FC<BaseChangesTableProps> = (props) => {
  return <GenericChangesTable {...props} variant="base" />
}

export default BaseChangesTable
