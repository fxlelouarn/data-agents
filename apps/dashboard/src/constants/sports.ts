export const SPORT_GROUPS = {
  running_trail: { label: 'Course à pied / Trail', color: '#3b82f6' },
  triathlon: { label: 'Triathlon', color: '#f59e0b' },
  cycling: { label: 'Cyclisme', color: '#22c55e' },
  other: { label: 'Autres', color: '#8b5cf6' },
} as const

export type SportGroup = keyof typeof SPORT_GROUPS

export const SPORT_GROUP_KEYS = Object.keys(SPORT_GROUPS) as SportGroup[]
