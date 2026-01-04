import React from 'react'
import { Box, useMediaQuery, useTheme, Tabs, Tab, Paper } from '@mui/material'

interface TwoPaneLayoutProps {
  /** Contenu du pane gauche (Working Proposal - éditable) */
  leftPane: React.ReactNode
  /** Contenu du pane droit (Source Proposal - lecture seule) */
  rightPane: React.ReactNode
  /** Titre du pane gauche (affiché en mode mobile) */
  leftTitle?: string
  /** Titre du pane droit (affiché en mode mobile) */
  rightTitle?: string
}

/**
 * TwoPaneLayout - Layout à deux colonnes pour l'édition de propositions groupées
 * 
 * Comportement responsive :
 * - Desktop (≥1024px) : Deux colonnes côte à côte (50/50)
 * - Mobile (<1024px) : Onglets pour basculer entre les deux vues
 */
const TwoPaneLayout: React.FC<TwoPaneLayoutProps> = ({
  leftPane,
  rightPane,
  leftTitle = 'Proposition de travail',
  rightTitle = 'Sources'
}) => {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'))
  const [activeTab, setActiveTab] = React.useState(0)

  // Mode Desktop : deux colonnes côte à côte
  if (isDesktop) {
    return (
      <Box
        sx={{
          display: 'flex',
          gap: 3,
          alignItems: 'flex-start'
        }}
      >
        {/* Pane gauche - Working Proposal */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0, // Permet au contenu de shrink
            position: 'sticky',
            top: 16,
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto'
          }}
        >
          {leftPane}
        </Box>

        {/* Pane droit - Source Proposal */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            position: 'sticky',
            top: 16,
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto'
          }}
        >
          {rightPane}
        </Box>
      </Box>
    )
  }

  // Mode Mobile : onglets
  return (
    <Box>
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="fullWidth"
        >
          <Tab label={leftTitle} />
          <Tab label={rightTitle} />
        </Tabs>
      </Paper>

      {activeTab === 0 && leftPane}
      {activeTab === 1 && rightPane}
    </Box>
  )
}

export default TwoPaneLayout
