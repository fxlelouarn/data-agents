import { ProposalStatus, ProposalType } from '@/types'

// Labels des statuts de propositions
export const proposalStatusLabels: Record<ProposalStatus, string> = {
  PENDING: 'En attente',
  PARTIALLY_APPROVED: 'Partiellement approuvé',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  ARCHIVED: 'Archivé',
}

// Couleurs des statuts de propositions
export const proposalStatusColors: Record<ProposalStatus, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  PENDING: 'warning',
  PARTIALLY_APPROVED: 'info',
  APPROVED: 'success',
  REJECTED: 'error', 
  ARCHIVED: 'default',
}

// Labels des types de propositions
export const proposalTypeLabels: Record<ProposalType, string> = {
  NEW_EVENT: 'Nouvel événement',
  EVENT_UPDATE: 'Modification événement',
  EDITION_UPDATE: 'Modification édition',
  RACE_UPDATE: 'Modification course',
}

// Couleurs des types de propositions (pour graphiques)
export const proposalTypeColors: Record<ProposalType, string> = {
  NEW_EVENT: '#8884d8',
  EVENT_UPDATE: '#82ca9d',
  EDITION_UPDATE: '#ffc658',
  RACE_UPDATE: '#ff8042',
}

// Styles complets des types de propositions (pour chips)
export const proposalTypeStyles: Record<ProposalType, any> = {
  NEW_EVENT: {
    backgroundColor: '#10b981',
    color: 'white',
    borderColor: '#059669',
    '& .MuiChip-icon': {
      color: '#059669'
    }
  },
  EVENT_UPDATE: {
    backgroundColor: '#8b5cf6',
    color: 'white',
    borderColor: '#7c3aed',
    '& .MuiChip-icon': {
      color: '#6d28d9'
    }
  },
  EDITION_UPDATE: {
    backgroundColor: '#3b82f6',
    color: 'white',
    borderColor: '#2563eb',
    '& .MuiChip-icon': {
      color: '#1d4ed8'
    }
  },
  RACE_UPDATE: {
    backgroundColor: '#f59e0b',
    color: 'white',
    borderColor: '#d97706',
    '& .MuiChip-icon': {
      color: '#b45309'
    }
  },
}
