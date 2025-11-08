import React, { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatDateInTimezone } from '@/utils/timezone'
import { getCategoriesForEntityType } from '@/constants/fieldCategories'

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
  
  // Champs d'événement (pour EVENT_UPDATE)
  const eventFields = [
    'status', 'name', 'city', 'country', 'countrySubdivisionNameLevel1', 'countrySubdivisionNameLevel2',
    'fullAddress', 'latitude', 'longitude', 'websiteUrl', 'facebookUrl', 'instagramUrl', 'twitterUrl',
    'coverImage', 'description', 'isPrivate', 'isFeatured', 'isRecommended', 'slug'
  ]

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
    switch (type) {
      case 'NEW_EVENT': return 'Nouvel événement'
      case 'EVENT_UPDATE': return 'Mise à jour événement'
      case 'EDITION_UPDATE': return 'Mise à jour édition'
      case 'RACE_UPDATE': return 'Mise à jour course'
      default: return type
    }
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
    
    if (!firstProposal.eventId) return undefined
    
    const eventId = firstProposal.eventId
    
    // PRIORITÉ 1: Utiliser les champs enrichis directement dans la Proposal (eventName, eventCity)
    if (firstProposal.eventName) {
      const eventCity = firstProposal.eventCity
      const baseName = eventCity ? `${firstProposal.eventName} - ${eventCity}` : firstProposal.eventName
      return `${baseName} (${eventId})`
    }
    
    // PRIORITÉ 2: Essayer d'extraire depuis les métadonnées de justification
    if (firstProposal.justification && Array.isArray(firstProposal.justification)) {
      for (const justif of firstProposal.justification) {
        if (justif.metadata && justif.metadata.eventName) {
          const eventName = justif.metadata.eventName
          const eventCity = justif.metadata.eventCity
          
          // Construire le titre avec le nom, la ville et l'ID
          const baseName = eventCity ? `${eventName} - ${eventCity}` : eventName
          return `${baseName} (${eventId})`
        }
      }
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

  // Consolider les changements par champ (excluant les races)
  const consolidateChanges = (groupProposals: any[], isNewEvent: boolean): ConsolidatedChange[] => {
    if (groupProposals.length === 0) return []

    const changesByField: Record<string, any> = {}
    const isEventUpdate = groupProposals[0]?.type === 'EVENT_UPDATE'
    const isEditionUpdate = groupProposals[0]?.type === 'EDITION_UPDATE'

    groupProposals.forEach(proposal => {
      Object.entries(proposal.changes).forEach(([field, value]) => {
        // Ignorer les champs non modifiables et les races (traitées séparément)
        if (nonModifiableFields.includes(field) || field === 'races') return
        
        // Pour NEW_EVENT, décomposer le champ 'edition' en champs individuels
        if (field === 'edition' && typeof value === 'object' && value !== null) {
          // La structure est {new: {...}, confidence: 0.36}
          const editionConfidence = (value as any).confidence || proposal.confidence || 0
          const editionData = (value as any).new || value
          
          // Extraire les champs de l'édition (sauf 'races' qui est traité séparément)
          Object.entries(editionData).forEach(([editionField, editionValue]) => {
            if (editionField === 'races' || editionField === 'confidence') return
            
            if (!changesByField[editionField]) {
              changesByField[editionField] = {
                field: editionField,
                options: [],
                currentValue: null
              }
            }
            
            // Utiliser la structure {new: value, confidence: number}
            const proposedValue = typeof editionValue === 'object' && editionValue !== null && 'new' in editionValue
              ? (editionValue as any).new
              : editionValue
            
            const confidence = typeof editionValue === 'object' && editionValue !== null && 'confidence' in editionValue
              ? (editionValue as any).confidence
              : editionConfidence
            
            changesByField[editionField].options.push({
              proposalId: proposal.id,
              agentName: proposal.agent.name,
              proposedValue,
              confidence,
              createdAt: proposal.createdAt
            })
          })
          
          return // Ne pas traiter 'edition' comme un champ normal
        }
        
        // Pour EVENT_UPDATE, ne garder que les champs d'événement
        if (isEventUpdate && !eventFields.includes(field)) return
        
        // Pour EDITION_UPDATE, ne garder que les champs qui ne sont PAS des champs d'événement
        if (isEditionUpdate && eventFields.includes(field)) return
        
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
            currentValue = value.current ?? null
            proposedValue = value.proposed
            confidence = (value as any).confidence || proposal.confidence || 0
          } else if ('new' in value && 'old' in value) {
            currentValue = value.old ?? null
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

        // Assigner la valeur actuelle seulement si elle n'a pas déjà été définie
        // et éviter d'écraser avec une autre valeur null
        if (changesByField[field].currentValue === null && currentValue !== null) {
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

    // Ne plus filtrer les champs - afficher tous les champs proposés par le backend
    // même s'ils n'ont pas changé (ex: timeZone, calendarStatus, endDate)
    const filteredChanges = Object.values(changesByField)
    
    // Trier les options de chaque champ par confiance décroissante
    filteredChanges.forEach((change: any) => {
      change.options.sort((a: ChangeOption, b: ChangeOption) => {
        // Trier par confiance décroissante
        return (b.confidence || 0) - (a.confidence || 0)
      })
    })

    // Trier les champs selon l'ordre défini dans fieldCategories
    // Pour NEW_EVENT et EDITION_UPDATE, les champs doivent suivre l'ordre de leur catégorie
    if (isNewEvent || isEditionUpdate) {
      const categories = isEventUpdate 
        ? getCategoriesForEntityType('EVENT')
        : getCategoriesForEntityType('EDITION')
      const fieldOrder = categories.flatMap(cat => cat.fields)
      
      filteredChanges.sort((a: any, b: any) => {
        const indexA = fieldOrder.indexOf(a.field)
        const indexB = fieldOrder.indexOf(b.field)
        
        // Si les deux champs sont dans fieldOrder, trier selon cet ordre
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB
        }
        
        // Si seulement A est dans fieldOrder, il vient avant
        if (indexA !== -1) return -1
        
        // Si seulement B est dans fieldOrder, il vient avant
        if (indexB !== -1) return 1
        
        // Sinon, garder l'ordre actuel
        return 0
      })
    } else if (isEventUpdate) {
      // EVENT_UPDATE : trier selon les catégories EVENT
      const eventCategories = getCategoriesForEntityType('EVENT')
      const fieldOrder = eventCategories.flatMap(cat => cat.fields)
      
      filteredChanges.sort((a: any, b: any) => {
        const indexA = fieldOrder.indexOf(a.field)
        const indexB = fieldOrder.indexOf(b.field)
        
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB
        }
        if (indexA !== -1) return -1
        if (indexB !== -1) return 1
        return 0
      })
    }

    return filteredChanges
  }

  // Consolider les changements de races par course
  const consolidateRaceChanges = (groupProposals: any[]): RaceChange[] => {
    if (groupProposals.length === 0) return []

    const raceChangesByRace: Record<string, any> = {}

    groupProposals.forEach(proposal => {
      // Pour NEW_EVENT, les races peuvent être dans proposal.changes.edition.new.races
      let racesData = proposal.changes.races
      
      if (!racesData && proposal.changes.edition) {
        const editionData = proposal.changes.edition
        const editionNew = (editionData as any).new || editionData
        racesData = editionNew.races
      }
      
      if (racesData && Array.isArray(racesData)) {
        racesData.forEach((race: any, raceIndex: number) => {
          if (typeof race === 'object' && race !== null) {
            // Extraire le nom de la course (gérer les structures {old, new} ou {proposed, current})
            let raceName = race.raceName || race.name
            if (typeof raceName === 'object' && raceName !== null) {
              raceName = raceName.new || raceName.proposed || raceName.current || raceName.old
            }
            // Utiliser le nom de la course ou l'index comme clé
            const raceKey = raceName || `Course ${raceIndex + 1}`
            
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

    // Convertir les Sets en arrays et trier les options par confiance
    Object.values(raceChangesByRace).forEach((race: any) => {
      race.proposalIds = Array.from(race.proposalIds)
      
      // Trier les options de chaque champ par confiance décroissante
      Object.values(race.fields).forEach((field: any) => {
        field.options.sort((a: ChangeOption, b: ChangeOption) => {
          return (b.confidence || 0) - (a.confidence || 0)
        })
      })
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