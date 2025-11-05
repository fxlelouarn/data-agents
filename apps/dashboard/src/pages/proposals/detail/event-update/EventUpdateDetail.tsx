import React from 'react'
import { Box, Button } from '@mui/material'
import { CheckCircle as ApproveIcon, Cancel as RejectIcon, DangerousOutlined as SkullIcon } from '@mui/icons-material'
import ProposalDetailBase from '../base/ProposalDetailBase'
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentCard from '@/components/proposals/AgentCard'
import EventLinksEditor from '@/components/proposals/EventLinksEditor'

interface EventUpdateDetailProps {
  proposalId: string
}

const EventUpdateDetail: React.FC<EventUpdateDetailProps> = ({ proposalId }) => {
  return (
    <ProposalDetailBase
      proposalId={proposalId}
      renderMainContent={(context) => {
        const {
          consolidatedChanges,
          selectedChanges,
          handleFieldSelect,
          handleFieldModify,
          handleApproveAll,
          handleRejectAll,
          userModifiedChanges,
          formatValue,
          formatAgentsList,
          editionTimezone,
          allPending,
          isPending,
          isEventDead,
          setKillDialogOpen,
          handleReviveEvent,
          proposal,
          isNewEvent
        } = context
        
        const eventId = proposal?.eventId
        
        return (
          <>
            <CategorizedEventChangesTable
              title="Modification de l'événement"
              changes={consolidatedChanges}
              isNewEvent={false}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              disabled={!allPending || isPending || isEventDead}
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
                  {!isNewEvent && eventId && (
                    <Button
                      variant="outlined"
                      color="warning"
                      size="small"
                      startIcon={<SkullIcon />}
                      onClick={() => setKillDialogOpen(true)}
                      disabled={isEventDead}
                    >
                      Tuer l'événement
                    </Button>
                  )}
                </Box>
              ) : isEventDead && !isNewEvent && eventId ? (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    onClick={handleReviveEvent}
                  >
                    Ressusciter l'événement
                  </Button>
                </Box>
              ) : undefined}
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
          allPending,
          handleFieldModify
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
              <Box sx={{ mt: 3 }}>
                <EventLinksEditor
                  websiteUrl={proposal.changes.websiteUrl}
                  facebookUrl={proposal.changes.facebookUrl}
                  instagramUrl={proposal.changes.instagramUrl}
                  onSave={(links) => {
                    handleFieldModify('websiteUrl', links.websiteUrl)
                    handleFieldModify('facebookUrl', links.facebookUrl)
                    handleFieldModify('instagramUrl', links.instagramUrl)
                  }}
                  editable={allPending}
                />
              </Box>
            )}
          </>
        )
      }}
    />
  )
}

export default EventUpdateDetail
