/**
 * Utilitaires de déduplication pour l'agent FFA Scraper
 * 
 * Ce module gère :
 * - Détection de propositions identiques en attente
 * - Comparaison profonde des changements proposés
 * - Hash et comparaison de données FFA
 */

import { ProposalType, ProposalStatus } from '@data-agents/database'
import * as crypto from 'crypto'

/**
 * Interface pour une proposition en attente depuis la DB
 * Utilise les types Prisma pour correspondre exactement aux données retournées
 */
interface PendingProposal {
  id: string
  type: ProposalType
  eventId: string | null
  editionId: string | null
  raceId: string | null
  changes: any
  status: ProposalStatus
  createdAt: Date
}

/**
 * Vérifie si une proposition identique existe déjà en attente
 * 
 * @param newChanges - Les changements de la nouvelle proposition
 * @param pendingProposals - Les propositions en attente pour la même cible
 * @returns true si une proposition identique existe déjà
 */
export function hasIdenticalPendingProposal(
  newChanges: any,
  pendingProposals: PendingProposal[]
): boolean {
  if (pendingProposals.length === 0) {
    return false
  }

  // Calculer le hash des nouveaux changements
  const newHash = hashChanges(newChanges)

  // Vérifier si un hash identique existe déjà
  for (const pending of pendingProposals) {
    const existingHash = hashChanges(pending.changes)
    
    if (newHash === existingHash) {
      return true
    }
  }

  return false
}

/**
 * Calcule un hash SHA256 des changements proposés
 * Utilisé pour détecter des propositions identiques
 * 
 * @param changes - Les changements à hasher
 * @returns Hash SHA256 en hexadécimal
 */
export function hashChanges(changes: any): string {
  // Normaliser l'objet pour un hashing stable
  const normalized = normalizeForHashing(changes)
  const jsonString = JSON.stringify(normalized)
  
  return crypto
    .createHash('sha256')
    .update(jsonString)
    .digest('hex')
}

/**
 * Normalise un objet pour le hashing
 * - Trie les clés récursivement
 * - Normalise les dates en ISO strings
 * - Supprime les champs volatiles (confidence, timestamps)
 */
function normalizeForHashing(obj: any): any {
  if (obj === null || obj === undefined) {
    return null
  }

  // Dates -> ISO string
  if (obj instanceof Date) {
    return obj.toISOString()
  }

  // Arrays
  if (Array.isArray(obj)) {
    return obj.map(normalizeForHashing)
  }

  // Objects
  if (typeof obj === 'object') {
    const normalized: any = {}
    
    // Trier les clés et filtrer les champs volatiles
    const keys = Object.keys(obj)
      .filter(key => !['confidence', 'timestamp', 'createdAt', 'updatedAt'].includes(key))
      .sort()
    
    for (const key of keys) {
      normalized[key] = normalizeForHashing(obj[key])
    }
    
    return normalized
  }

  // Primitives
  return obj
}

/**
 * Vérifie si les changements proposés apportent de nouvelles informations
 * par rapport aux données actuelles de la BD et aux propositions en attente
 * 
 * @param changes - Les changements proposés
 * @param currentData - Les données actuelles dans la BD
 * @param pendingProposals - Les propositions en attente
 * @returns true si les changements apportent de nouvelles informations
 */
export function hasNewInformation(
  changes: any,
  currentData: any,
  pendingProposals: PendingProposal[]
): boolean {
  // Si aucun changement, pas de nouvelle info
  if (!changes || Object.keys(changes).length === 0) {
    return false
  }

  // Vérifier chaque changement proposé
  for (const [field, changeData] of Object.entries(changes)) {
    const { old: oldValue, new: newValue } = changeData as any

    // 1. Vérifier si c'est différent de la valeur actuelle en BD
    const currentValue = getNestedValue(currentData, field)
    
    if (!areValuesEqual(currentValue, newValue)) {
      // Cette valeur est différente de la BD actuelle
      
      // 2. Vérifier si une proposition en attente propose déjà cette valeur
      const alreadyProposed = pendingProposals.some(proposal => {
        const proposedChange = proposal.changes[field]
        if (!proposedChange) return false
        
        return areValuesEqual(proposedChange.new, newValue)
      })
      
      // Si pas déjà proposé, c'est une nouvelle info
      if (!alreadyProposed) {
        return true
      }
    }
  }

  // Tous les changements sont soit identiques à la BD, soit déjà proposés
  return false
}

/**
 * Compare deux valeurs de manière profonde
 */
function areValuesEqual(value1: any, value2: any): boolean {
  // Cas simples
  if (value1 === value2) return true
  if (value1 === null || value1 === undefined) return value2 === null || value2 === undefined
  if (value2 === null || value2 === undefined) return false

  // Dates
  if (value1 instanceof Date && value2 instanceof Date) {
    return value1.getTime() === value2.getTime()
  }

  // Arrays
  if (Array.isArray(value1) && Array.isArray(value2)) {
    if (value1.length !== value2.length) return false
    return value1.every((item, index) => areValuesEqual(item, value2[index]))
  }

  // Objects
  if (typeof value1 === 'object' && typeof value2 === 'object') {
    const keys1 = Object.keys(value1).sort()
    const keys2 = Object.keys(value2).sort()
    
    if (keys1.length !== keys2.length) return false
    if (!areValuesEqual(keys1, keys2)) return false
    
    return keys1.every(key => areValuesEqual(value1[key], value2[key]))
  }

  return false
}

/**
 * Récupère une valeur nested dans un objet (ex: "organization.name")
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj) return undefined
  
  const parts = path.split('.')
  let current = obj
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  
  return current
}

/**
 * Filtre les changements pour ne garder que ceux qui apportent de nouvelles informations
 * 
 * @param changes - Tous les changements détectés
 * @param currentData - Les données actuelles dans la BD
 * @param pendingProposals - Les propositions en attente
 * @returns Les changements filtrés (seulement les nouvelles informations)
 */
export function filterNewChanges(
  changes: any,
  currentData: any,
  pendingProposals: PendingProposal[]
): any {
  const filteredChanges: any = {}

  for (const [field, changeData] of Object.entries(changes)) {
    const { new: newValue } = changeData as any

    // Vérifier si c'est une nouvelle information
    const currentValue = getNestedValue(currentData, field)
    const isDifferentFromCurrent = !areValuesEqual(currentValue, newValue)

    if (isDifferentFromCurrent) {
      // Vérifier si pas déjà proposé
      const alreadyProposed = pendingProposals.some(proposal => {
        const proposedChange = proposal.changes[field]
        if (!proposedChange) return false
        return areValuesEqual(proposedChange.new, newValue)
      })

      if (!alreadyProposed) {
        filteredChanges[field] = changeData
      }
    }
  }

  return filteredChanges
}
