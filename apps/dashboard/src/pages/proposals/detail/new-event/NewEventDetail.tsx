import React from 'react'
import { Box, Button } from '@mui/material'
import { CheckCircle as ApproveIcon, Cancel as RejectIcon } from '@mui/icons-material'
import ProposalDetailBase from '../base/ProposalDetailBase'
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import CategorizedEditionChangesTable from '@/components/proposals/CategorizedEditionChangesTable'
import RaceChangesSection from '@/components/proposals/RaceChangesSection'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentCard from '@/components/proposals/AgentCard'
import EditionContextInfo from '@/components/proposals/EditionContextInfo'

interface NewEventDetailProps {
  proposalId: string
}

const NewEventDetail: React.FC<NewEventDetailProps> = ({ proposalId }) => {
  return (
    <ProposalDetailBase
      proposalId={proposalId}
      renderMainContent={(context) => {
        const {
          consolidatedChanges,
          consolidatedRaceChanges,
          selectedChanges,
          userModifiedRaceChanges,
          handleFieldSelect,
          handleFieldModify,
          handleApproveAll,
          handleRejectAll,
          handleRaceFieldModify,
          userModifiedChanges,
          formatValue,
          formatAgentsList,
          editionTimezone,
          allPending,
          isPending,
          isEventDead,
          isEditionCanceled,
          proposal
        } = context
        
        return (
          <>
            <CategorizedEventChangesTable
              title="Informations de l'événement"
              changes={consolidatedChanges}
              isNewEvent={true}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              disabled={!allPending || isPending || isEventDead}
            />
            
            <CategorizedEditionChangesTable
              title="Informations de l'édition"
              changes={consolidatedChanges}
              isNewEvent={true}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              disabled={!allPending || isPending || isEventDead}
              isEditionCanceled={isEditionCanceled || isEventDead}
              actions={allPending ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<ApproveIcon />}
                    onClick={handleApproveAll}
                    disabled={isPending || isEventDead}
                  >
                    Tout approuver
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<RejectIcon />}
                    onClick={handleRejectAll}
                    disabled={isPending || isEventDead}
                  >
                    Tout rejeter
                  </Button>
                </Box>
              ) : undefined}
            />
            
            <RaceChangesSection
              raceChanges={consolidatedRaceChanges}
              formatValue={formatValue}
              timezone={editionTimezone}
              onRaceApprove={() => {/* Single proposal - handled by approve all */}}
              onFieldModify={handleRaceFieldModify}
              userModifiedRaceChanges={userModifiedRaceChanges}
              disabled={!allPending || isPending || isEventDead}
              isEditionCanceled={isEditionCanceled || isEventDead}
            />
            
            <DateSourcesSection 
              justifications={proposal.justification || []} 
            />
          </>
        )
      }}
      renderSidebar={(context) => {
        const { 
          proposal, 
          getEditionYear, 
          selectedChanges, 
          userModifiedChanges
        } = context
        
        return (
          <>
            <AgentCard
              agent={{
                id: proposal.agent.id,
                name: proposal.agent.name,
                type: proposal.agent.type
              }}
              createdAt={proposal.createdAt}
            />
            
            {proposal && (
              <EditionContextInfo
                currentCalendarStatus={
                  userModifiedChanges['calendarStatus'] || 
                  selectedChanges['calendarStatus'] || 
                  (typeof proposal.changes.calendarStatus === 'string' 
                    ? proposal.changes.calendarStatus 
                    : (proposal.changes.calendarStatus as any)?.current || (proposal.changes.calendarStatus as any)?.proposed)
                }
                currentEditionYear={getEditionYear(proposal) ? parseInt(getEditionYear(proposal)!) : undefined}
                previousEditionYear={(proposal as any).previousEditionYear}
                previousCalendarStatus={(proposal as any).previousEditionCalendarStatus}
                previousEditionStartDate={(proposal as any).previousEditionStartDate}
              />
            )}
          </>
        )
      }}
    />
  )
}

export default NewEventDetail
