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
  EVENT_MERGE: 'Fusion événements',
}

// Couleurs des types de propositions (pour graphiques)
export const proposalTypeColors: Record<ProposalType, string> = {
  NEW_EVENT: '#8884d8',
  EVENT_UPDATE: '#82ca9d',
  EDITION_UPDATE: '#ffc658',
  RACE_UPDATE: '#ff8042',
  EVENT_MERGE: '#f97316',
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
  EVENT_MERGE: {
    backgroundColor: '#f97316',
    color: 'white',
    borderColor: '#ea580c',
    '& .MuiChip-icon': {
      color: '#c2410c'
    }
  },
}

// Catégories de niveau 1 (type principal de course)
export const categoryLevel1Labels: Record<string, string> = {
  RUNNING: 'Course à pied',
  TRAIL: 'Trail',
  WALK: 'Marche',
  CYCLING: 'Cyclisme',
  TRIATHLON: 'Triathlon',
  FUN: 'Fun / Obstacles',
  OTHER: 'Autre',
}

// Catégories de niveau 2 (sous-catégorie) groupées par niveau 1
export const categoryLevel2Labels: Record<string, string> = {
  // RUNNING
  MARATHON: 'Marathon',
  HALF_MARATHON: 'Semi-marathon',
  KM10: '10 km',
  KM5: '5 km',
  LESS_THAN_5_KM: 'Moins de 5 km',
  ULTRA_RUNNING: 'Ultra (> 42 km)',
  CROSS: 'Cross-country',
  VERTICAL_KILOMETER: 'Kilomètre vertical',
  EKIDEN: 'Ekiden',
  // TRAIL
  ULTRA_TRAIL: 'Ultra trail',
  LONG_TRAIL: 'Trail long (20-42 km)',
  SHORT_TRAIL: 'Trail court (< 20 km)',
  DISCOVERY_TRAIL: 'Trail découverte',
  // WALK
  NORDIC_WALK: 'Marche nordique',
  HIKING: 'Randonnée',
  // CYCLING
  XC_MOUNTAIN_BIKE: 'VTT cross-country',
  ENDURO_MOUNTAIN_BIKE: 'VTT enduro',
  GRAVEL_RACE: 'Gravel',
  ROAD_CYCLING_TOUR: 'Route',
  TIME_TRIAL: 'Contre-la-montre',
  GRAN_FONDO: 'Gran Fondo',
  ULTRA_CYCLING: 'Ultra cyclisme',
}

// Mapping categoryLevel1 -> categoryLevel2 disponibles
export const categoryLevel2ByLevel1: Record<string, string[]> = {
  RUNNING: ['MARATHON', 'HALF_MARATHON', 'KM10', 'KM5', 'LESS_THAN_5_KM', 'ULTRA_RUNNING', 'CROSS', 'VERTICAL_KILOMETER', 'EKIDEN'],
  TRAIL: ['ULTRA_TRAIL', 'LONG_TRAIL', 'SHORT_TRAIL', 'DISCOVERY_TRAIL', 'VERTICAL_KILOMETER'],
  WALK: ['NORDIC_WALK', 'HIKING'],
  CYCLING: ['XC_MOUNTAIN_BIKE', 'ENDURO_MOUNTAIN_BIKE', 'GRAVEL_RACE', 'ROAD_CYCLING_TOUR', 'TIME_TRIAL', 'GRAN_FONDO', 'ULTRA_CYCLING'],
  TRIATHLON: [],
  FUN: [],
  OTHER: [],
}
