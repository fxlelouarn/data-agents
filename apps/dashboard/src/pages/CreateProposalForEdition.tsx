import React, { useState, useEffect, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material'
import { useSnackbar } from 'notistack'
import { useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

interface Edition {
  id: string
  year: number
  startDate: string
  calendarStatus: string
  eventId: string
  event: {
    name: string
    city: string
  }
  _count: {
    races: number
  }
}

export default function CreateProposalForEdition() {
  const { editionId } = useParams<{ editionId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { enqueueSnackbar } = useSnackbar()
  const queryClient = useQueryClient()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [proposalId, setProposalId] = useState<string | null>(null)
  const [edition, setEdition] = useState<Edition | null>(location.state?.edition || null)
  const hasCreated = useRef(false)

  useEffect(() => {
    // Éviter le double appel en mode dev (React StrictMode)
    if (!hasCreated.current) {
      hasCreated.current = true
      createProposalForEdition()
    }
  }, [editionId])

  const createProposalForEdition = async () => {
    if (!editionId) {
      setError('ID d\'édition manquant')
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      // 1. Si l'édition n'est pas déjà chargée, la charger
      let editionData = edition
      if (!editionData) {
        const editionsResponse = await api.get('/events/editions', {
          params: { eventId: undefined, limit: 100 }
        })
        
        editionData = editionsResponse.data.data.find((ed: Edition) => ed.id === editionId)
        
        if (!editionData) {
          throw new Error('Édition non trouvée')
        }
        setEdition(editionData)
      }

      // 2. Charger toutes les données de l'édition depuis Miles Republic
      const editionDetailsResponse = await api.get('/events/editions', {
        params: { eventId: editionData.eventId, limit: 100 }
      })
      
      const fullEdition = editionDetailsResponse.data.data.find((ed: any) => ed.id === editionData.id)
      
      if (!fullEdition) {
        throw new Error('Édition complète non trouvée')
      }

      // 3. ✅ Utiliser le nouvel endpoint pour créer UNE proposition complète
      const response = await api.post('/proposals/edition-update-complete', {
        editionId: editionData.id,
        userModifiedChanges: {}, // Aucune modification initiale
        userModifiedRaceChanges: {}, // Aucune modification de course initiale
        justification: `Modification manuelle de ${editionData.event.name} ${editionData.year}`,
        autoValidate: false
      })

      if (response.data.success && response.data.data.proposal) {
        const proposalData = response.data.data.proposal
        
        enqueueSnackbar(
          `Proposition EDITION_UPDATE créée avec succès`,
          { variant: 'success' }
        )
        
        // ✅ Rediriger vers la vue groupée (meilleure expérience utilisateur)
        const groupKey = `${proposalData.eventId}-${proposalData.editionId}`
        window.location.href = `/proposals/group/${groupKey}`
      } else {
        throw new Error('Échec de création de la proposition')
      }

    } catch (err: any) {
      console.error('Erreur création proposition:', err)
      setError(err.response?.data?.message || err.message || 'Erreur lors de la création de la proposition')
      enqueueSnackbar('Erreur lors de la création de la proposition', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/proposals/create-existing')}
        >
          Retour
        </Button>
      </Box>
    )
  }

  // Ne devrait jamais arriver ici car on redirige après création
  return null
}
