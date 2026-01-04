import React, { useState } from 'react'
import {
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Chip,
  Grid
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
  People as PeopleIcon,
  Warning as WarningIcon
} from '@mui/icons-material'

interface CollapsibleContextCardsProps {
  children: React.ReactNode
  /** Titre de la section (par défaut: "Informations contextuelles") */
  title?: string
  /** Expanded par défaut */
  defaultExpanded?: boolean
}

/**
 * CollapsibleContextCards - Conteneur accordéon pour les cards contextuelles
 * 
 * Utilisé en mode Two-Panes pour afficher les cards en dessous du layout
 * principal au lieu de dans une sidebar latérale.
 */
const CollapsibleContextCards: React.FC<CollapsibleContextCardsProps> = ({
  children,
  title = 'Informations contextuelles',
  defaultExpanded = false
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <Box sx={{ mt: 3 }}>
      <Accordion 
        expanded={expanded} 
        onChange={(_, isExpanded) => setExpanded(isExpanded)}
        sx={{
          '&:before': { display: 'none' }, // Retirer la ligne de séparation
          boxShadow: 1
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            bgcolor: 'action.hover',
            '&:hover': { bgcolor: 'action.selected' }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" fontWeight="medium">
              {title}
            </Typography>
            {!expanded && (
              <Chip 
                label="Cliquer pour afficher" 
                size="small" 
                variant="outlined"
                sx={{ ml: 1 }}
              />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 2 }}>
          <Grid container spacing={2}>
            {React.Children.map(children, (child, index) => (
              child ? (
                <Grid item xs={12} md={6} lg={4} key={index}>
                  {child}
                </Grid>
              ) : null
            ))}
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Box>
  )
}

export default CollapsibleContextCards
