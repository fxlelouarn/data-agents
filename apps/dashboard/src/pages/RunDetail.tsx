import React from 'react'
import { useParams } from 'react-router-dom'
import { Box, Typography, Card, CardContent } from '@mui/material'

const RunDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Détails de l'exécution
      </Typography>
      
      <Card>
        <CardContent>
          <Typography>Détails de l'exécution {id} - À implémenter</Typography>
        </CardContent>
      </Card>
    </Box>
  )
}

export default RunDetail