import React, { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatDateInTimezone } from '@/utils/timezone'
import { proposalTypeLabels } from '@/constants/proposals'
import { getBlockForField } from '@/utils/blockFieldMapping'

export interface ChangeOption {
  proposalId: string
  agentName: string
  proposedValue: any
  confidence: number
  createdAt: string
}

export interface ConsolidatedChange {
  field: string
  options: ChangeOption[]
  currentValue: any
}

export interface RaceChangeField {
  field: string
  options: ChangeOption[]
  currentValue: any
}

export interface RaceChange {
  raceName: string
  raceId: string  // ✅ Changed from raceIndex: number
  fields: Record<string, RaceChangeField>
  proposalIds: string[]
}

export const useProposalLogic = () => {
  // ⚠️ PHASE 4: Nettoyage du code mort
  // - consolidateChanges() → déplacé dans useProposalEditor
  // - consolidateRaceChanges() → déplacé dans useProposalEditor
  // - handleApproveField() → plus utilisé
  // - selectedChanges/setSelectedChanges → plus utilisé

  // Fonction pour formatter une valeur selon son type
  const formatValue = (value: any, isSimple: boolean = false, timezone?: string): React.ReactNode => {
    if (value === null || value === undefined) return '-'

    // Si c'est une URL
    if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('www.'))) {
      if (isSimple) return value
      return React.createElement('a', {
        href: value.startsWith('www.') ? `https://${value}` : value,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: { color: '#1976d2', textDecoration: 'none' }
      }, value)
    }

    // Si c'est une date ISO (format: YYYY-MM-DDTHH:mm:ss ou similaire)
    if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      return formatDateTime(value, timezone)
    }

    // Si c'est un tableau
    if (Array.isArray(value)) {
      if (value.length === 0) return 'Aucun élément'
      if (isSimple) return `${value.length} élément${value.length > 1 ? 's' : ''}`
      // Pour l'affichage complet, retourner une représentation simplifiée
      return `${value.length} élément${value.length > 1 ? 's' : ''}`
    }

    // Si c'est un objet (mais pas un tableau)
    if (typeof value === 'object' && value !== null) {
      // Gérer la structure {new: value, confidence: number} du GoogleSearchDateAgent
      if ('new' in value && 'confidence' in value && Object.keys(value).length === 2) {
        return formatValue(value.new, isSimple, timezone)
      }

      if (isSimple) {
        // Pour les dropdowns, essayer de trouver un champ meaningful
        if ('new' in value && 'old' in value) {
          return formatValue(value.new, true, timezone)
        }
        if ('proposed' in value) {
          return formatValue(value.proposed, true, timezone)
        }
        if ('current' in value) {
          return formatValue(value.current, true, timezone)
        }
        const keys = Object.keys(value)
        if (keys.length === 1) {
          return formatValue(value[keys[0]], true, timezone)
        }
        return `Objet (${keys.length} propriétés)`
      }
      // Pour l'affichage complet, retourner une représentation simplifiée
      return `Objet (${Object.keys(value).length} propriétés)`
    }

    // Valeur primitive (string, number, boolean)
    return String(value)
  }

  const formatDateTime = (dateString: string, timezone?: string) => {
    try {
      if (timezone) {
        // Utiliser la timezone spécifiée
        return formatDateInTimezone(dateString, timezone, 'EEEE dd/MM/yyyy HH:mm')
      }
      // Fallback: afficher en heure locale du navigateur
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }
      return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
    } catch (error) {
      return dateString
    }
  }

  const getTypeLabel = (type: string) => {
    return proposalTypeLabels[type as keyof typeof proposalTypeLabels] || type
  }

  const getEventTitle = (firstProposal: any, isNewEvent: boolean) => {
    if (!firstProposal) return undefined

    if (isNewEvent) {
      // Pour NEW_EVENT, chercher dans changes.eventName
      const eventName = firstProposal.changes?.eventName
      if (typeof eventName === 'string') return eventName
      if (typeof eventName === 'object' && eventName?.new) return eventName.new
      if (typeof eventName === 'object' && eventName?.proposed) return eventName.proposed
      return undefined // Pas de nom pour nouveau événement
    }

    const eventId = firstProposal.eventId

    // PRIORITÉ 1: Utiliser les champs enrichis directement dans la Proposal (eventName, eventCity)
    if (firstProposal.eventName) {
      const eventCity = firstProposal.eventCity
      const baseName = eventCity ? `${firstProposal.eventName} - ${eventCity}` : firstProposal.eventName
      return eventId ? `${baseName} (${eventId})` : baseName
    }

    // PRIORITÉ 2: Essayer d'extraire depuis les métadonnées de justification
    // Support eventName (standard) ou ffaName (FFA Results Agent)
    if (firstProposal.justification && Array.isArray(firstProposal.justification)) {
      for (const justif of firstProposal.justification) {
        const eventName = justif.metadata?.eventName || justif.metadata?.ffaName
        if (eventName) {
          const eventCity = justif.metadata?.eventCity || justif.metadata?.ffaCity

          // Construire le titre avec le nom et la ville
          const baseName = eventCity ? `${eventName} - ${eventCity}` : eventName
          // Ajouter l'ID seulement s'il existe
          return eventId ? `${baseName} (${eventId})` : `${baseName} (source FFA)`
        }
      }
    }

    // PRIORITÉ 3: Si pas d'eventId, retourner un message approprié
    if (!eventId) {
      return 'Événement à identifier'
    }

    // Fallback: retourner undefined pour ne pas afficher d'info incorrecte
    // Le ProposalHeader ne l'affichera pas si undefined
    console.warn('[getEventTitle] Aucun nom d\'événement trouvé pour:', {
      eventId,
      type: firstProposal.type,
      hasEventName: !!firstProposal.eventName,
      hasJustification: !!firstProposal.justification,
      justificationLength: firstProposal.justification?.length || 0
    })

    return undefined
  }

  // ⚠️ PHASE 4: consolidateChanges() et consolidateRaceChanges() SUPPRIMÉS
  // Ces fonctions sont maintenant dans useProposalEditor :
  // - consolidateChangesFromProposals()
  // - consolidateRacesFromProposals()

  // Fonction pour formater l'affichage des agents (condensé)
  const formatAgentsList = (agents: Array<{ agentName: string, confidence: number }>) => {
    // Regrouper les agents identiques
    const agentGroups: Record<string, { count: number, confidences: number[] }> = {}
    agents.forEach((agent) => {
      if (!agentGroups[agent.agentName]) {
        agentGroups[agent.agentName] = { count: 0, confidences: [] }
      }
      agentGroups[agent.agentName].count++
      agentGroups[agent.agentName].confidences.push(agent.confidence * 100)
    })

    return Object.entries(agentGroups).map(([agentName, { count, confidences }]) => {
      const avgConfidence = Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      // Pour plusieurs agents du même type, on affiche juste la confiance (le chip indique le nombre)
      return count > 1
        ? `${avgConfidence}% moy.`
        : `${agentName} (${Math.round(confidences[0])}%)`
    }).join(', ')
  }

  // Fonction pour extraire l'année de l'édition depuis les métadonnées
  const getEditionYear = (proposal: any) => {
    // PRIORITÉ 1: Utiliser le champ enrichi directement dans la Proposal (editionYear)
    if (proposal?.editionYear !== null && proposal?.editionYear !== undefined) {
      return proposal.editionYear.toString()
    }

    // PRIORITÉ 2: Essayer d'extraire depuis les métadonnées de justification
    if (proposal?.justification && Array.isArray(proposal.justification)) {
      for (const justif of proposal.justification) {
        if (justif.metadata && justif.metadata.editionYear) {
          return justif.metadata.editionYear.toString()
        }
      }
    }

    // PRIORITÉ 3: Essayer depuis les changes si c'est un NEW_EVENT ou EDITION_UPDATE
    if (proposal?.changes) {
      // Pour NEW_EVENT avec structure edition
      if (proposal.changes.edition && typeof proposal.changes.edition === 'object') {
        const editionData = proposal.changes.edition.new || proposal.changes.edition
        if (editionData.year) {
          return editionData.year.toString()
        }
      }
      // Pour EDITION_UPDATE avec year direct
      if (proposal.changes.year) {
        const yearValue = typeof proposal.changes.year === 'object'
          ? (proposal.changes.year.proposed || proposal.changes.year.new || proposal.changes.year.current)
          : proposal.changes.year
        if (yearValue) return yearValue.toString()
      }
    }

    // PRIORITÉ 4: Fallback: extraire depuis l'editionId (si format reconnaissable)
    if (proposal?.editionId) {
      const yearMatch = proposal.editionId.toString().match(/20\d{2}/)
      if (yearMatch) {
        return yearMatch[0]
      }
    }

    console.warn('[getEditionYear] Aucune année trouvée pour:', {
      editionId: proposal?.editionId,
      type: proposal?.type,
      hasEditionYear: !!proposal?.editionYear,
      hasJustification: !!proposal?.justification
    })

    return undefined
  }


  return {
    // ✅ Fonctions d'affichage (conservées)
    formatValue,
    formatDateTime,
    getTypeLabel,
    getEventTitle,
    getEditionYear,
    formatAgentsList
  }
}
