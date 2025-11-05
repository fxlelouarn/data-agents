import React from 'react'
import { useParams } from 'react-router-dom'
import { LinearProgress, Alert, Card, CardContent } from '@mui/material'
import { useProposalGroup } from '@/hooks/useApi'
import EditionUpdateGroupedDetail from './detail/edition-update/EditionUpdateGroupedDetail'
import EventUpdateGroupedDetail from './detail/event-update/EventUpdateGroupedDetail'
import NewEventGroupedDetail from './detail/new-event/NewEventGroupedDetail'
import RaceUpdateGroupedDetail from './detail/race-update/RaceUpdateGroupedDetail'

const GroupedProposalDetailDispatcher: React.FC = () => {
  const { groupKey } = useParams<{ groupKey: string }>()
  const { data: groupProposalsData, isLoading } = useProposalGroup(groupKey || '')
  
  if (isLoading) return <LinearProgress />
  
  if (!groupProposalsData?.data || groupProposalsData.data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Groupe de propositions introuvable</Alert>
        </CardContent>
      </Card>
    )
  }
  
  // Déterminer le type à partir de la première proposition
  const proposalType = groupProposalsData.data[0].type
  
  // Dispatcher selon le type
  switch (proposalType) {
    case 'EDITION_UPDATE':
      return <EditionUpdateGroupedDetail groupKey={groupKey!} />
    
    case 'EVENT_UPDATE':
      return <EventUpdateGroupedDetail groupKey={groupKey!} />
    
    case 'NEW_EVENT':
      return <NewEventGroupedDetail groupKey={groupKey!} />
    
    case 'RACE_UPDATE':
      return <RaceUpdateGroupedDetail groupKey={groupKey!} />
    
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

export default GroupedProposalDetailDispatcher
