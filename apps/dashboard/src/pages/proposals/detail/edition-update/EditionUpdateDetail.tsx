import React from 'react'
import ProposalDetailBase from '../base/ProposalDetailBase'
import CategorizedEditionChangesTable from '@/components/proposals/CategorizedEditionChangesTable'
import ProposalJustificationsCard from '@/components/proposals/ProposalJustificationsCard'
import AgentCard from '@/components/proposals/AgentCard'
import EditionContextInfo from '@/components/proposals/EditionContextInfo'
import OrganizerSection from '@/components/proposals/edition-update/OrganizerSection'
import RacesChangesTable from '@/components/proposals/edition-update/RacesChangesTable'

interface EditionUpdateDetailProps {
  proposalId: string
}

const EditionUpdateDetail: React.FC<EditionUpdateDetailProps> = ({ proposalId }) => {
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
          handleEditionStartDateChange,
          handleRaceFieldModify,
          userModifiedChanges,
          formatValue,
          formatAgentsList,
          editionTimezone,
          allPending,
          isPending,
          isEventDead,
          isEditionCanceled,
          proposal,
          // Validation par blocs
          validateBlock,
          unvalidateBlock,
          isBlockValidated,
          isBlockPending,
          blockProposals
        } = context
        
        // Séparer les champs standards des champs spéciaux
        const standardChanges = consolidatedChanges.filter(c => 
          !['organizer', 'racesToAdd'].includes(c.field)
        )
        const organizerChange = consolidatedChanges.find(c => c.field === 'organizer')
        const racesToAddChange = consolidatedChanges.find(c => c.field === 'racesToAdd')
        
        const hasRealEditionChanges = standardChanges.length > 0
        const hasRaceChanges = consolidatedRaceChanges.length > 0
        
        return (
          <>
            {hasRealEditionChanges && (
              <CategorizedEditionChangesTable
                title="Édition"
                changes={standardChanges}
                isNewEvent={false}
                selectedChanges={selectedChanges}
                onFieldSelect={handleFieldSelect}
                onFieldModify={handleFieldModify}
                onEditionStartDateChange={handleEditionStartDateChange}
                userModifiedChanges={userModifiedChanges}
                formatValue={formatValue}
                formatAgentsList={formatAgentsList}
                timezone={editionTimezone}
                disabled={isBlockValidated('edition') || isEventDead}
                isEditionCanceled={isEditionCanceled || isEventDead}
                isBlockValidated={isBlockValidated('edition')}
                onValidateBlock={() => validateBlock('edition', blockProposals['edition'] || [])}
                onUnvalidateBlock={() => unvalidateBlock('edition')}
                isBlockPending={isBlockPending}
                validationDisabled={isEventDead}
              />
            )}
            
            {organizerChange && (
              <OrganizerSection
                change={organizerChange}
                onApprove={() => {/* Single proposal - no field-specific approve */}}
                onFieldModify={handleFieldModify}
                userModifiedChanges={userModifiedChanges}
                disabled={isBlockValidated('organizer') || isEventDead}
                isBlockValidated={isBlockValidated('organizer')}
                onValidateBlock={() => validateBlock('organizer', blockProposals['organizer'] || [])}
                onUnvalidateBlock={() => unvalidateBlock('organizer')}
                isBlockPending={isBlockPending}
                validationDisabled={isEventDead}
              />
            )}
            
            {((racesToAddChange && racesToAddChange.options[0]?.proposedValue?.length > 0) || (proposal?.existingRaces && proposal.existingRaces.length > 0)) && (
              <RacesChangesTable
                existingRaces={proposal?.existingRaces || []}
                racesToAdd={racesToAddChange?.options[0]?.proposedValue || []}
                proposalId={proposalId}
                proposal={proposal}
                disabled={!allPending || isPending || isEventDead}
                isBlockValidated={isBlockValidated('races')}
                onValidateBlock={() => validateBlock('races', blockProposals['races'] || [])}
                onUnvalidateBlock={() => unvalidateBlock('races')}
                isBlockPending={isBlockPending}
                validationDisabled={isEventDead}
              />
            )}
            
            <ProposalJustificationsCard
              justifications={proposal.justification || []}
              confidence={proposal.confidence}
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

export default EditionUpdateDetail
