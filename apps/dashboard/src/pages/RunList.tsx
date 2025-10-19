import React from 'react'
import { Box, Typography, Card, CardContent } from '@mui/material'

const RunList: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Exécutions
      </Typography>
      
      <Card>
        <CardContent>
          <Typography>Liste des exécutions - À implémenter</Typography>
        </CardContent>
      </Card>
    </Box>
  )
}

export default RunList