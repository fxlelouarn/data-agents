import React from 'react'
import { Tabs, Tab, Box, Chip, Typography, Tooltip } from '@mui/material'
import {
  Source as SourceIcon,
  Star as StarIcon
} from '@mui/icons-material'
import { Proposal } from '@/types'

interface SourceTabsProps {
  /** Liste des propositions sources triées par priorité */
  sourceProposals: Proposal[]
  /** Index de la source active */
  activeIndex: number
  /** Callback quand on change de source */
  onChangeSource: (index: number) => void
}

/**
 * Retourne le label court pour un type d'agent
 */
function getAgentLabel(agentName: string | undefined): string {
  if (!agentName) return 'Agent'
  
  const name = agentName.toLowerCase()
  if (name.includes('ffa')) return 'FFA'
  if (name.includes('slack')) return 'Slack'
  if (name.includes('google')) return 'Google'
  
  // Prendre les 10 premiers caractères si le nom est long
  return agentName.length > 10 ? agentName.substring(0, 10) + '...' : agentName
}

/**
 * Retourne la couleur du chip selon le type d'agent
 */
function getAgentColor(agentName: string | undefined): 'primary' | 'secondary' | 'default' | 'success' | 'warning' {
  if (!agentName) return 'default'
  
  const name = agentName.toLowerCase()
  if (name.includes('ffa')) return 'primary'
  if (name.includes('slack')) return 'secondary'
  if (name.includes('google')) return 'warning'
  
  return 'default'
}

/**
 * SourceTabs - Onglets pour sélectionner la source à afficher
 * 
 * Affiche un onglet par proposition source, avec :
 * - Le nom de l'agent
 * - Une étoile pour la source prioritaire (première)
 * - Le score de confiance
 */
const SourceTabs: React.FC<SourceTabsProps> = ({
  sourceProposals,
  activeIndex,
  onChangeSource
}) => {
  if (sourceProposals.length === 0) {
    return null
  }

  // Si une seule source, afficher un simple header
  if (sourceProposals.length === 1) {
    const proposal = sourceProposals[0]
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper'
        }}
      >
        <SourceIcon color="action" fontSize="small" />
        <Typography variant="subtitle2">
          Source unique
        </Typography>
        <Chip
          label={getAgentLabel(proposal.agent?.name)}
          size="small"
          color={getAgentColor(proposal.agent?.name)}
          variant="outlined"
        />
        {proposal.confidence && (
          <Chip
            label={`${Math.round(proposal.confidence * 100)}%`}
            size="small"
            variant="outlined"
          />
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Tabs
        value={activeIndex}
        onChange={(_, newValue) => onChangeSource(newValue)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 48,
          '& .MuiTab-root': {
            minHeight: 48,
            textTransform: 'none'
          }
        }}
      >
        {sourceProposals.map((proposal, index) => {
          const isPriority = index === 0
          const agentLabel = getAgentLabel(proposal.agent?.name)
          const confidence = proposal.confidence 
            ? `${Math.round(proposal.confidence * 100)}%` 
            : null

          return (
            <Tab
              key={proposal.id}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {isPriority && (
                    <Tooltip title="Source prioritaire (données les plus fiables)">
                      <StarIcon 
                        fontSize="small" 
                        sx={{ color: 'warning.main', mr: 0.5 }} 
                      />
                    </Tooltip>
                  )}
                  <Chip
                    label={agentLabel}
                    size="small"
                    color={getAgentColor(proposal.agent?.name)}
                    variant={activeIndex === index ? 'filled' : 'outlined'}
                  />
                  {confidence && (
                    <Typography 
                      variant="caption" 
                      color="text.secondary"
                      sx={{ ml: 0.5 }}
                    >
                      {confidence}
                    </Typography>
                  )}
                </Box>
              }
            />
          )
        })}
      </Tabs>
    </Box>
  )
}

export default SourceTabs
