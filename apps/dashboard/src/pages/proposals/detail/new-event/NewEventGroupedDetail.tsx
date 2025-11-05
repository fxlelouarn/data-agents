import React from 'react'
import { Box, Button } from '@mui/material'
import { CheckCircle as ApproveIcon, Cancel as RejectIcon } from '@mui/icons-material'
import GroupedProposalDetailBase from '../base/GroupedProposalDetailBase'
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import CategorizedEditionChangesTable from '@/components/proposals/CategorizedEditionChangesTable'
import RaceChangesSection from '@/components/proposals/RaceChangesSection'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentInfoSection from '@/components/proposals/AgentInfoSection'
import EditionContextInfo from '@/components/proposals/EditionContextInfo'

interface NewEventGroupedDetailProps {
  groupKey: string
}

const NewEventGroupedDetail: React.FC<NewEventGroupedDetailProps> = ({ groupKey }) => {
  return (
    <GroupedProposalDetailBase
      groupKey={groupKey}
      renderMainContent={(context) => {
        const {
          consolidatedChanges,
          consolidatedRaceChanges,
          selectedChanges,
          userModifiedRaceChanges,
          handleFieldSelect,
          handleApproveField,
          handleFieldModify,
          handleApproveAll,
          handleRejectAll,
          handleApproveAllRaces,
          handleRejectAllRaces,
          handleRaceFieldModify,
          userModifiedChanges,
          formatValue,
          formatAgentsList,
          editionTimezone,
          allPending,
          isPending,
          isEventDead,
          isEditionCanceled,
          groupProposals
        } = context
        
        return (
          <>
            {/* Table des champs Event */}
            <CategorizedEventChangesTable
              title="Informations de l'événement"
              changes={consolidatedChanges}
              isNewEvent={true}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldApprove={handleApproveField}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              disabled={!allPending || isPending || isEventDead}
            />
            
            {/* Table des champs Edition */}
            <CategorizedEditionChangesTable
              title="Informations de l'édition"
              changes={consolidatedChanges}
              isNewEvent={true}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldApprove={handleApproveField}
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
            
            {/* Section des courses */}
            <RaceChangesSection
              raceChanges={consolidatedRaceChanges}
              formatValue={formatValue}
              timezone={editionTimezone}
              onRaceApprove={(raceData) => context.handleApproveRace(raceData)}
              onApproveAll={allPending ? handleApproveAllRaces : undefined}
              onRejectAll={allPending ? handleRejectAllRaces : undefined}
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

export default NewEventGroupedDetail
