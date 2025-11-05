import React from 'react'
import ProposalDetailBase from '../base/ProposalDetailBase'
import RaceChangesSection from '@/components/proposals/RaceChangesSection'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentCard from '@/components/proposals/AgentCard'
import EditionContextInfo from '@/components/proposals/EditionContextInfo'

interface RaceUpdateDetailProps {
  proposalId: string
}

const RaceUpdateDetail: React.FC<RaceUpdateDetailProps> = ({ proposalId }) => {
  return (
    <ProposalDetailBase
      proposalId={proposalId}
      renderMainContent={(context) => {
        const {
          consolidatedRaceChanges,
          userModifiedRaceChanges,
          handleRaceFieldModify,
          formatValue,
          editionTimezone,
          allPending,
          isPending,
          isEventDead,
          isEditionCanceled,
          proposal
        } = context
        
        return (
          <>
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

export default RaceUpdateDetail
