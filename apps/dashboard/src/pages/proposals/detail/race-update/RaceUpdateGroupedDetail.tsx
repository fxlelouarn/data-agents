import React from 'react'
import GroupedProposalDetailBase from '../base/GroupedProposalDetailBase'
import RaceChangesSection from '@/components/proposals/RaceChangesSection'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentInfoSection from '@/components/proposals/AgentInfoSection'
import EditionContextInfo from '@/components/proposals/EditionContextInfo'
import ValidateBlockButton from '@/components/proposals/ValidateBlockButton'
import { useProposalBlockValidation } from '@/hooks/useProposalBlockValidation'

interface RaceUpdateGroupedDetailProps {
  groupKey: string
}

const RaceUpdateGroupedDetail: React.FC<RaceUpdateGroupedDetailProps> = ({ groupKey }) => {
  return (
    <GroupedProposalDetailBase
      groupKey={groupKey}
      renderMainContent={(context) => {
        const {
          consolidatedRaceChanges,
          userModifiedRaceChanges,
          handleApproveAllRaces,
          handleRejectAllRaces,
          handleRaceFieldModify,
          formatValue,
          editionTimezone,
          allPending,
          isPending,
          isEventDead,
          isEditionCanceled,
          groupProposals
        } = context

        const firstProposalId = groupProposals[0]?.id
        const { isValidated, validate, cancel } = useProposalBlockValidation(
          firstProposalId,
          'races'
        )
        
        return (
          <>
            {/* Bouton de validation en haut */}
            {firstProposalId && (
              <ValidateBlockButton
                isValidated={isValidated}
                onValidate={validate}
                onCancel={cancel}
                disabled={!allPending || isPending || isEventDead}
                blockName="Courses"
              />
            )}

            {/* Section des courses */}
            <RaceChangesSection
              raceChanges={consolidatedRaceChanges}
              formatValue={formatValue}
              timezone={editionTimezone}
              onRaceApprove={(raceData) => context.handleApproveRace(raceData)}
              // onApproveAll={allPending ? handleApproveAllRaces : undefined}  // ❌ OBSOLETE
              // onRejectAll={allPending ? handleRejectAllRaces : undefined}    // ❌ OBSOLETE
              onFieldModify={handleRaceFieldModify}
              userModifiedRaceChanges={userModifiedRaceChanges}
              disabled={!allPending || isPending || isEventDead}
              isEditionCanceled={isEditionCanceled || isEventDead}
            />
            
            {/* Sources des dates extraites */}
            <DateSourcesSection 
              justifications={groupProposals.flatMap(p => p.justification || [])} 
            />
          </>
        )
      }}
      renderSidebar={(context) => {
        const { 
          groupProposals, 
          getEditionYear, 
          selectedChanges, 
          userModifiedChanges
        } = context
        
        const firstProposal = groupProposals[0]
        
        return (
          <>
            <AgentInfoSection 
              proposals={groupProposals.map(p => ({ 
                ...p, 
                confidence: p.confidence || 0, 
                status: p.status 
              }))} 
            />
            
            {/* Informations contextuelles de l'édition */}
            {firstProposal && (
              <EditionContextInfo
                currentCalendarStatus={
                  userModifiedChanges['calendarStatus'] || 
                  selectedChanges['calendarStatus'] || 
                  (typeof firstProposal.changes.calendarStatus === 'string' 
                    ? firstProposal.changes.calendarStatus 
                    : (firstProposal.changes.calendarStatus as any)?.current || (firstProposal.changes.calendarStatus as any)?.proposed)
                }
                currentEditionYear={getEditionYear(firstProposal) ? parseInt(getEditionYear(firstProposal)!) : undefined}
                previousEditionYear={(firstProposal as any).previousEditionYear}
                previousCalendarStatus={(firstProposal as any).previousEditionCalendarStatus}
                previousEditionStartDate={(firstProposal as any).previousEditionStartDate}
              />
            )}
          </>
        )
      }}
    />
  )
}

export default RaceUpdateGroupedDetail
