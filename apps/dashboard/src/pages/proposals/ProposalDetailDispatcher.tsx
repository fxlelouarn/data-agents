import React from 'react'
import { useParams } from 'react-router-dom'
import { LinearProgress, Alert, Card, CardContent } from '@mui/material'
import { useProposal } from '@/hooks/useApi'
import EditionUpdateDetail from './detail/edition-update/EditionUpdateDetail'
import EventUpdateDetail from './detail/event-update/EventUpdateDetail'
import NewEventDetail from './detail/new-event/NewEventDetail'

const ProposalDetailDispatcher: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { data: proposalData, isLoading } = useProposal(id!)
  
  if (isLoading) return <LinearProgress />
  
  if (!proposalData?.data) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Proposition introuvable</Alert>
        </CardContent>
      </Card>
    )
  }
  
  // Déterminer le type de la proposition
  const proposalType = proposalData.data.type
  
  // Dispatcher selon le type
  switch (proposalType) {
    case 'EDITION_UPDATE':
      return <EditionUpdateDetail proposalId={id!} />
    
    case 'EVENT_UPDATE':
      return <EventUpdateDetail proposalId={id!} />
    
    case 'NEW_EVENT':
      return <NewEventDetail proposalId={id!} />
    
    case 'RACE_UPDATE':
      return (
        <Card>
          <CardContent>
            <Alert severity="error">
              Type RACE_UPDATE non supporté. Ce type n'est plus utilisé.
            </Alert>
          </CardContent>
        </Card>
      )
    
    default:
      return (
        <Card>
          <CardContent>
            <Alert severity="warning">Type de proposition non supporté: {proposalType}</Alert>
          </CardContent>
        </Card>
      )
  }
}

export default ProposalDetailDispatcher
