import React, { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

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
  raceIndex: number
  fields: Record<string, RaceChangeField>
  proposalIds: string[]
}

export const useProposalLogic = () => {
  const [selectedChanges, setSelectedChanges] = useState<Record<string, any>>({})

  // Champs à ignorer car non modifiables
  const nonModifiableFields = ['priceType', 'raceId', 'raceName']
  // Champs informationnels uniquement (non modifiables, affichés séparément)
  const informationalFields = ['raceId', 'raceName']

  // Fonction pour formatter une valeur selon son type
  const formatValue = (value: any, isSimple: boolean = false): React.ReactNode => {
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
    
    // Si c'est une date ISO
    if (typeof value === 'string' && value.includes('T')) {
      return formatDateTime(value)
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
        return formatValue(value.new, isSimple)
      }
      
      if (isSimple) {
        // Pour les dropdowns, essayer de trouver un champ meaningful
        if ('new' in value && 'old' in value) {
          return formatValue(value.new, true)
        }
        if ('proposed' in value) {
          return formatValue(value.proposed, true)
        }
        if ('current' in value) {
          return formatValue(value.current, true)
        }
        const keys = Object.keys(value)
        if (keys.length === 1) {
          return formatValue(value[keys[0]], true)
        }
        return `Objet (${keys.length} propriétés)`
      }
      // Pour l'affichage complet, retourner une représentation simplifiée
      return `Objet (${Object.keys(value).length} propriétés)`
    }
    
    // Valeur primitive (string, number, boolean)
    return String(value)
  }

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }
      // Inclure le jour de la semaine dans le format
      return format(date, 'EEEE dd/MM/yyyy HH:mm', { locale: fr })
    } catch (error) {
      return dateString
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'NEW_EVENT': return 'Nouvel événement'
      case 'EVENT_UPDATE': return 'Mise à jour événement'
      case 'EDITION_UPDATE': return 'Mise à jour édition'
      case 'RACE_UPDATE': return 'Mise à jour course'
      default: return type
    }
  }

  const getEventTitle = (firstProposal: any, isNewEvent: boolean) => {
    if (!firstProposal) return 'Groupe inconnu'
    
    if (isNewEvent) {
      const eventName = firstProposal.changes.eventName
      return typeof eventName === 'string' ? eventName : 'Nouvel événement'
    }
    
    if (!firstProposal.eventId) return 'Événement inconnu'
    
    // Essayer d'extraire le nom depuis les métadonnées de justification
    if (firstProposal.justification && Array.isArray(firstProposal.justification)) {
      for (const justif of firstProposal.justification) {
        if (justif.metadata && justif.metadata.eventName) {
          const eventName = justif.metadata.eventName
          const eventCity = justif.metadata.eventCity
          
          // Construire le titre avec le nom et la ville (sans l'année ici)
          return eventCity ? `${eventName} - ${eventCity}` : eventName
        }
      }
    }
    
    // Fallback: logique existante
    let eventName = firstProposal.eventId.toString().replace('event_', '')
    
    if (eventName.includes('marathon_paris')) {
      eventName = 'Marathon de Paris'
    } else if (eventName.includes('10km_boulogne')) {
      eventName = '10km de Boulogne'
    } else if (eventName.includes('semi_marathon_boulogne')) {
      eventName = 'Semi-marathon de Boulogne'
    } else {
      eventName = eventName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
    }
    
    return eventName
  }

  // Consolider les changements par champ (excluant les races)
  const consolidateChanges = (groupProposals: any[], isNewEvent: boolean): ConsolidatedChange[] => {
    if (groupProposals.length === 0) return []

    const changesByField: Record<string, any> = {}

    groupProposals.forEach(proposal => {
      Object.entries(proposal.changes).forEach(([field, value]) => {
        // Ignorer les champs non modifiables et les races (traitées séparément)
        if (nonModifiableFields.includes(field) || field === 'races') return
        
        if (!changesByField[field]) {
          changesByField[field] = {
            field,
            options: [],
            currentValue: null
          }
        }

        // Extraire la valeur actuelle et proposée
        let currentValue, proposedValue, confidence
        if (typeof value === 'object' && value !== null) {
          if ('proposed' in value && 'current' in value) {
            currentValue = value.current || null
            proposedValue = value.proposed
            confidence = (value as any).confidence || proposal.confidence || 0
          } else if ('new' in value && 'old' in value) {
            currentValue = value.old || null
            proposedValue = value.new
            confidence = (value as any).confidence || proposal.confidence || 0
          } else if ('new' in value && 'confidence' in value && Object.keys(value).length === 2) {
            // Structure du GoogleSearchDateAgent: {new: valeur, confidence: nombre}
            currentValue = null // Pas de valeur actuelle pour cette structure
            proposedValue = value.new
            confidence = value.confidence
          } else {
            currentValue = null
            proposedValue = value
            confidence = proposal.confidence
          }
        } else {
          currentValue = null
          proposedValue = value
          confidence = proposal.confidence
        }

        if (changesByField[field].currentValue === null) {
          changesByField[field].currentValue = currentValue
        }

        changesByField[field].options.push({
          proposalId: proposal.id,
          agentName: proposal.agent.name,
          proposedValue,
          confidence: confidence || proposal.confidence,
          createdAt: proposal.createdAt
        })
      })
    })

    // Filtrer les champs qui n'ont pas de changement réel
    const filteredChanges = Object.values(changesByField).filter((change: any) => {
      // Pour les nouveaux événements, afficher tous les champs
      if (isNewEvent) return true
      
      // Vérifier s'il y a au moins une proposition avec une valeur différente de la valeur actuelle
      const hasActualChange = change.options.some((option: any) => {
        const currentStr = JSON.stringify(change.currentValue)
        const proposedStr = JSON.stringify(option.proposedValue)
        return currentStr !== proposedStr
      })
      
      return hasActualChange
    })

    return filteredChanges
  }

  // Consolider les changements de races par course
  const consolidateRaceChanges = (groupProposals: any[]): RaceChange[] => {
    if (groupProposals.length === 0) return []

    const raceChangesByRace: Record<string, any> = {}

    groupProposals.forEach(proposal => {
      const racesData = proposal.changes.races
      if (racesData && Array.isArray(racesData)) {
        racesData.forEach((race: any, raceIndex: number) => {
          if (typeof race === 'object' && race !== null) {
            // Utiliser le nom de la course ou l'index comme clé
            const raceKey = race.name || `Course ${raceIndex + 1}`
            
            if (!raceChangesByRace[raceKey]) {
              raceChangesByRace[raceKey] = {
                raceName: raceKey,
                raceIndex,
                fields: {},
                informationalData: {}, // Stocker les champs informationnels
                proposalIds: new Set()
              }
            }
            
            raceChangesByRace[raceKey].proposalIds.add(proposal.id)
            
            // Ajouter chaque champ de la course
            Object.entries(race).forEach(([raceField, raceValue]) => {
              // Traiter les champs informationnels séparément
              if (informationalFields.includes(raceField)) {
                if (!raceChangesByRace[raceKey].informationalData[raceField]) {
                  raceChangesByRace[raceKey].informationalData[raceField] = raceValue
                }
                return
              }
              
              if (nonModifiableFields.includes(raceField)) return
              
              if (!raceChangesByRace[raceKey].fields[raceField]) {
                raceChangesByRace[raceKey].fields[raceField] = {
                  field: raceField,
                  options: [],
                  currentValue: null
                }
              }
              
              // Extraire la valeur courante et proposée
              let currentValue, proposedValue, confidence
              if (typeof raceValue === 'object' && raceValue !== null) {
                if ('proposed' in raceValue && 'current' in raceValue) {
                  currentValue = raceValue.current || null
                  proposedValue = raceValue.proposed
                  confidence = (raceValue as any).confidence || proposal.confidence || 0
                } else if ('new' in raceValue && 'old' in raceValue) {
                  currentValue = raceValue.old || null
                  proposedValue = raceValue.new
                  confidence = (raceValue as any).confidence || proposal.confidence || 0
                } else {
                  currentValue = null
                  proposedValue = raceValue
                  confidence = proposal.confidence
                }
              } else {
                currentValue = null
                proposedValue = raceValue
                confidence = proposal.confidence
              }
              
              if (raceChangesByRace[raceKey].fields[raceField].currentValue === null) {
                raceChangesByRace[raceKey].fields[raceField].currentValue = currentValue
              }
              
              raceChangesByRace[raceKey].fields[raceField].options.push({
                proposalId: proposal.id,
                agentName: proposal.agent.name,
                proposedValue,
                confidence: confidence || proposal.confidence,
                createdAt: proposal.createdAt
              })
            })
          }
        })
      }
    })

    // Convertir les Sets en arrays
    Object.values(raceChangesByRace).forEach((race: any) => {
      race.proposalIds = Array.from(race.proposalIds)
    })

    return Object.values(raceChangesByRace)
  }

  const handleApproveField = (fieldName: string, value: any) => {
    setSelectedChanges(prev => ({ ...prev, [fieldName]: value }))
  }

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
    // Essayer d'extraire depuis les métadonnées de justification
    if (proposal.justification && Array.isArray(proposal.justification)) {
      for (const justif of proposal.justification) {
        if (justif.metadata && justif.metadata.editionYear) {
          return justif.metadata.editionYear
        }
      }
    }
    
    // Fallback: extraire depuis l'editionId (si format reconnaissable)
    if (proposal.editionId) {
      const yearMatch = proposal.editionId.toString().match(/202\d/)
      if (yearMatch) {
        return yearMatch[0]
      }
      // Essayer de nettoyer l'editionId
      const cleaned = proposal.editionId.replace('edition_', '').replace(/_/g, ' ')
      return cleaned
    }
    
    return null
  }

  return {
    selectedChanges,
    setSelectedChanges,
    formatValue,
    formatDateTime,
    getTypeLabel,
    getEventTitle,
    consolidateChanges,
    consolidateRaceChanges,
    handleApproveField,
    formatAgentsList,
    getEditionYear,
    nonModifiableFields,
    informationalFields
  }
}