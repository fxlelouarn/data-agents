import React, { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Container
} from '@mui/material'
import DynamicConfigForm from '@/components/DynamicConfigForm'

// Schema de test pour le GoogleSearchDateAgent
const testConfigSchema = {
  batchSize: {
    type: 'number' as const,
    label: 'Taille du batch',
    description: 'Nombre d\'événements à traiter par exécution',
    min: 1,
    max: 100,
    default: 10,
    category: 'Paramètres principaux'
  },
  googleResultsCount: {
    type: 'number' as const,
    label: 'Nombre de résultats Google',
    description: 'Nombre de résultats Google à analyser par recherche',
    min: 1,
    max: 10,
    default: 5,
    category: 'Paramètres principaux'
  },
  googleApiKey: {
    type: 'password' as const,
    label: 'Clé API Google',
    description: 'Clé API Google Custom Search (optionnel, utilise la variable d\'environnement)',
    required: false,
    category: 'API Google'
  },
  googleSearchEngineId: {
    type: 'text' as const,
    label: 'ID Moteur de recherche',
    description: 'ID du moteur de recherche personnalisé Google',
    required: false,
    category: 'API Google'
  },
  dateConfidenceThreshold: {
    type: 'number' as const,
    label: 'Seuil de confiance minimum',
    description: 'Seuil de confiance minimum pour accepter une date extraite (0.0 à 1.0)',
    min: 0.0,
    max: 1.0,
    step: 0.1,
    default: 0.6,
    category: 'Extraction de dates'
  },
  maxDatesPerEvent: {
    type: 'number' as const,
    label: 'Dates maximum par événement',
    description: 'Nombre maximum de dates à extraire par événement',
    min: 1,
    max: 20,
    default: 5,
    category: 'Extraction de dates'
  },
  searchTimeoutMs: {
    type: 'number' as const,
    label: 'Timeout recherche (ms)',
    description: 'Délai d\'attente maximum pour les requêtes Google en millisecondes',
    min: 1000,
    max: 30000,
    step: 1000,
    default: 10000,
    category: 'Paramètres avancés'
  },
  enableMockMode: {
    type: 'boolean' as const,
    label: 'Mode simulation',
    description: 'Activer le mode simulation sans appel API réel (utile pour les tests)',
    default: false,
    category: 'Paramètres avancés'
  },
  onlyFrenchEvents: {
    type: 'boolean' as const,
    label: 'Événements français uniquement',
    description: 'Limiter la recherche aux événements français',
    default: true,
    category: 'Filtres'
  },
  excludeWeekends: {
    type: 'boolean' as const,
    label: 'Exclure les weekends',
    description: 'Exclure les dates tombant le weekend des propositions',
    default: false,
    category: 'Filtres'
  }
}

const TestDynamicForm: React.FC = () => {
  const [values, setValues] = useState({
    batchSize: 10,
    googleResultsCount: 5,
    googleApiKey: '',
    googleSearchEngineId: '',
    dateConfidenceThreshold: 0.6,
    maxDatesPerEvent: 5,
    searchTimeoutMs: 10000,
    enableMockMode: false,
    onlyFrenchEvents: true,
    excludeWeekends: false
  })

  const handleChange = (field: string, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    console.log('Configuration sauvegardée:', values)
    alert('Configuration sauvegardée ! Voir la console pour les détails.')
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          Test - Formulaire Dynamique de Configuration
        </Typography>
        
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Démonstration du générateur de formulaires dynamique basé sur le schema de configuration JSON.
          Cet exemple utilise la configuration du GoogleSearchDateAgent.
        </Typography>

        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 3 }}>
              Google Search Date Agent - Configuration
            </Typography>

            <DynamicConfigForm
              configSchema={testConfigSchema}
              values={values}
              onChange={handleChange}
            />

            <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
              <Button 
                variant="contained" 
                onClick={handleSave}
                size="large"
              >
                Sauvegarder la configuration
              </Button>
              
              <Button 
                variant="outlined" 
                onClick={() => console.log('Valeurs actuelles:', values)}
                size="large"
              >
                Voir les valeurs (console)
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ mt: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              JSON généré
            </Typography>
            <Box 
              component="pre" 
              sx={{ 
                backgroundColor: 'grey.100',
                p: 2,
                borderRadius: 1,
                overflow: 'auto',
                fontSize: '0.875rem',
                fontFamily: 'monospace'
              }}
            >
              {JSON.stringify(values, null, 2)}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  )
}

export default TestDynamicForm