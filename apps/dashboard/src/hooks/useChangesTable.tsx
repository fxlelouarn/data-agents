import React, { useState, useMemo, useCallback } from 'react'
import {
  Schedule as ScheduleIcon,
  LocationOn as LocationIcon,
  Euro as PriceIcon,
  Speed as DistanceIcon,
  Info as InfoIcon
} from '@mui/icons-material'
import { isFieldOfEntityType } from '@/constants/fieldCategories'

/**
 * Option de changement provenant d'un agent
 */
export interface ChangeOption {
  proposalId: string
  agentName: string
  agentType?: string
  proposedValue: any
  confidence: number
  createdAt: string
}

/**
 * Changement consolidé avec plusieurs options
 */
export interface ConsolidatedChange {
  field: string
  options: ChangeOption[]
  currentValue: any
}

/**
 * Option triée avec métadonnées calculées
 */
export interface SortedOption {
  valueStr: string
  value: any
  supportingAgents: ChangeOption[]
  hasConsensus: boolean
  consensusCount: number
  maxConfidence: number
  isManual: boolean
  hasFFAScraperSupport: boolean
}

/**
 * Paramètres du hook useChangesTable
 */
export interface UseChangesTableParams {
  changes: ConsolidatedChange[]
  selectedChanges: Record<string, any>
  userModifiedChanges?: Record<string, any>
  disabled?: boolean
  isFieldDisabledFn?: (fieldName: string) => boolean
  onFieldSelect?: (fieldName: string, value: any) => void
  onFieldModify?: (fieldName: string, newValue: any, reason?: string) => void
  entityType?: 'EVENT' | 'EDITION' | 'RACE'
}

/**
 * Résultat du hook useChangesTable
 */
export interface UseChangesTableResult {
  // State
  editingField: string | null
  filteredChanges: ConsolidatedChange[]

  // Handlers
  handleStartEdit: (fieldName: string) => void
  handleSaveEdit: (fieldName: string, newValue: any) => void
  handleCancelEdit: () => void
  handleFieldSelect: (fieldName: string, valueStr: string) => void

  // Utilities
  getFieldType: (fieldName: string) => 'text' | 'number' | 'date' | 'datetime-local'
  getFieldIcon: (fieldName: string) => React.ReactElement
  getSortedOptions: (change: ConsolidatedChange) => SortedOption[]
  getSelectedValue: (change: ConsolidatedChange) => any
  getConfidenceDisplay: (change: ConsolidatedChange, selectedValue: any) => string
  isFieldDisabled: (fieldName: string) => boolean
  hasMultipleValues: (change: ConsolidatedChange) => boolean
}

/**
 * Hook réutilisable pour la logique des tables de changements
 *
 * Centralise :
 * - State management (editingField)
 * - Handlers (edit, save, cancel, select)
 * - Field utilities (type, icon)
 * - Options sorting et filtering
 *
 * @example
 * ```tsx
 * const table = useChangesTable({
 *   changes: myChanges,
 *   selectedChanges,
 *   onFieldSelect: handleSelect,
 *   onFieldModify: handleModify
 * })
 *
 * // Use in component
 * <button onClick={() => table.handleStartEdit('fieldName')}>Edit</button>
 * ```
 */
export function useChangesTable({
  changes,
  selectedChanges,
  userModifiedChanges = {},
  disabled = false,
  isFieldDisabledFn,
  onFieldSelect,
  onFieldModify,
  entityType
}: UseChangesTableParams): UseChangesTableResult {
  // ─────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────
  const [editingField, setEditingField] = useState<string | null>(null)

  // ─────────────────────────────────────────────────────────────
  // FILTERED CHANGES (pour CategorizedChangesTable)
  // ─────────────────────────────────────────────────────────────
  const filteredChanges = useMemo(() => {
    if (!entityType) return changes

    // Filtrer les champs selon l'entityType
    return changes.filter(change => isFieldOfEntityType(change.field, entityType))
  }, [changes, entityType])

  // ─────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────

  /**
   * Commence l'édition d'un champ
   */
  const handleStartEdit = useCallback((fieldName: string) => {
    const fieldDisabled = disabled || (isFieldDisabledFn && isFieldDisabledFn(fieldName))
    if (!fieldDisabled && onFieldModify) {
      setEditingField(fieldName)
    }
  }, [disabled, isFieldDisabledFn, onFieldModify])

  /**
   * Sauvegarde la valeur éditée
   */
  const handleSaveEdit = useCallback((fieldName: string, newValue: any) => {
    if (onFieldModify) {
      onFieldModify(fieldName, newValue, 'Modifié manuellement')
    }
    setEditingField(null)
  }, [onFieldModify])

  /**
   * Annule l'édition en cours
   */
  const handleCancelEdit = useCallback(() => {
    setEditingField(null)
  }, [])

  /**
   * Gère la sélection d'une valeur dans le Select
   */
  const handleFieldSelect = useCallback((fieldName: string, valueStr: string) => {
    try {
      const parsedValue = JSON.parse(valueStr)
      if (onFieldSelect) {
        onFieldSelect(fieldName, parsedValue)
      }
    } catch (error) {
      console.error('Error parsing selected value:', error)
    }
  }, [onFieldSelect])

  // ─────────────────────────────────────────────────────────────
  // FIELD UTILITIES
  // ─────────────────────────────────────────────────────────────

  /**
   * Détermine le type d'input pour un champ
   */
  const getFieldType = useCallback((fieldName: string): 'text' | 'number' | 'date' | 'datetime-local' => {
    const lowerFieldName = fieldName.toLowerCase()
    if (lowerFieldName.includes('date')) return 'datetime-local'
    if (lowerFieldName.includes('distance') || lowerFieldName.includes('elevation') || lowerFieldName.includes('price')) return 'number'
    return 'text'
  }, [])

  /**
   * Retourne l'icône appropriée pour un champ
   */
  const getFieldIcon = useCallback((fieldName: string): React.ReactElement => {
    if (fieldName.includes('Date')) return <ScheduleIcon fontSize="small" />
    if (fieldName === 'location') return <LocationIcon fontSize="small" />
    if (fieldName === 'price') return <PriceIcon fontSize="small" />
    if (fieldName === 'distance') return <DistanceIcon fontSize="small" />
    return <InfoIcon fontSize="small" />
  }, [])

  /**
   * Vérifie si un champ est désactivé
   */
  const isFieldDisabled = useCallback((fieldName: string): boolean => {
    return disabled || (isFieldDisabledFn ? isFieldDisabledFn(fieldName) : false)
  }, [disabled, isFieldDisabledFn])

  // ─────────────────────────────────────────────────────────────
  // OPTIONS SORTING
  // ─────────────────────────────────────────────────────────────

  /**
   * Retourne les options triées pour un changement
   * Tri par: manual > FFA Scraper > confidence > consensus
   *
   * Note: Les valeurs proposées par le FFA Scraper sont prioritaires car
   * elles proviennent directement de la source officielle (FFA)
   */
  const getSortedOptions = useCallback((change: ConsolidatedChange): SortedOption[] => {
    const { field: fieldName } = change
    const uniqueValues = [...new Set(change.options.map(opt => JSON.stringify(opt.proposedValue)))]

    // Ajouter la valeur manuelle si elle existe
    const manualValue = userModifiedChanges[fieldName]
    const manualValueStr = manualValue !== undefined ? JSON.stringify(manualValue) : null
    const hasManualValue = manualValueStr && !uniqueValues.includes(manualValueStr)

    if (hasManualValue) {
      uniqueValues.unshift(manualValueStr!)
    }

    // Calculer métadonnées pour chaque option
    const sortedOptions = (uniqueValues as string[])
      .map((valueStr) => {
        const value = JSON.parse(valueStr)
        const isManual = valueStr === manualValueStr
        const supportingAgents = isManual ? [] : change.options.filter(opt =>
          JSON.stringify(opt.proposedValue) === valueStr
        )
        const hasConsensus = supportingAgents.length > 1
        const maxConfidence = isManual ? 1 : Math.max(...supportingAgents.map(agent => agent.confidence))

        // Vérifie si au moins un agent FFA Scraper supporte cette valeur
        // Utilise agentType (identifiant technique unique) pour une détection fiable
        const hasFFAScraperSupport = supportingAgents.some(agent =>
          agent.agentType === 'FFA_SCRAPER'
        )

        return {
          valueStr,
          value,
          supportingAgents,
          hasConsensus,
          consensusCount: supportingAgents.length,
          maxConfidence,
          isManual,
          hasFFAScraperSupport
        }
      })
      .sort((a, b) => {
        // Manuel d'abord
        if (a.isManual && !b.isManual) return -1
        if (!a.isManual && b.isManual) return 1

        // FFA Scraper prioritaire (source officielle)
        if (a.hasFFAScraperSupport && !b.hasFFAScraperSupport) return -1
        if (!a.hasFFAScraperSupport && b.hasFFAScraperSupport) return 1

        // Puis par confidence
        if (a.maxConfidence !== b.maxConfidence) {
          return b.maxConfidence - a.maxConfidence
        }

        // Enfin par consensus
        return b.consensusCount - a.consensusCount
      })

    return sortedOptions
  }, [userModifiedChanges])

  /**
   * Retourne la valeur sélectionnée pour un changement
   */
  const getSelectedValue = useCallback((change: ConsolidatedChange): any => {
    const sortedOptions = getSortedOptions(change)
    return selectedChanges[change.field] || (sortedOptions.length > 0 ? sortedOptions[0].value : null)
  }, [selectedChanges, getSortedOptions])

  /**
   * Retourne l'affichage de la confiance pour une valeur
   */
  const getConfidenceDisplay = useCallback((change: ConsolidatedChange, selectedValue: any): string => {
    const sortedOptions = getSortedOptions(change)
    const selectedOption = sortedOptions.find(opt =>
      JSON.stringify(opt.value) === JSON.stringify(selectedValue)
    )

    if (!selectedOption) return '-'

    const confidencePercent = Math.round(selectedOption.maxConfidence * 100)
    const consensusInfo = selectedOption.hasConsensus
      ? ` (${selectedOption.consensusCount} agents)`
      : ''

    return `${confidencePercent}%${consensusInfo}`
  }, [getSortedOptions])

  /**
   * Vérifie si un changement a plusieurs valeurs proposées
   */
  const hasMultipleValues = useCallback((change: ConsolidatedChange): boolean => {
    const sortedOptions = getSortedOptions(change)
    return sortedOptions.length > 1
  }, [getSortedOptions])

  // ─────────────────────────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────────────────────────
  return {
    // State
    editingField,
    filteredChanges,

    // Handlers
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleFieldSelect,

    // Utilities
    getFieldType,
    getFieldIcon,
    getSortedOptions,
    getSelectedValue,
    getConfidenceDisplay,
    isFieldDisabled,
    hasMultipleValues
  }
}
