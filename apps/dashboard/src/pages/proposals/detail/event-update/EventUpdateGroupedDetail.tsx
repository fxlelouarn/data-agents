import React from 'react'
import { Box, Button } from '@mui/material'
import { CheckCircle as ApproveIcon, Cancel as RejectIcon, DangerousOutlined as SkullIcon } from '@mui/icons-material'
import GroupedProposalDetailBase from '../base/GroupedProposalDetailBase'
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentInfoSection from '@/components/proposals/AgentInfoSection'
import EventLinksEditor from '@/components/proposals/EventLinksEditor'

interface EventUpdateGroupedDetailProps {
  groupKey: string
}

const EventUpdateGroupedDetail: React.FC<EventUpdateGroupedDetailProps> = ({ groupKey }) => {
  return (
    <GroupedProposalDetailBase
      groupKey={groupKey}
      renderMainContent={(context) => {
        const {
          consolidatedChanges,
          selectedChanges,
          handleFieldSelect,
          handleApproveField,
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
          groupProposals,
          isNewEvent
        } = context
        
        const firstProposal = groupProposals[0]
        const eventId = firstProposal?.eventId
        
        return (
          <>
            {/* Table des champs Event */}
            <CategorizedEventChangesTable
              title="Modification de l'événement"
              changes={consolidatedChanges}
              isNewEvent={false}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldApprove={handleApproveField}
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
          allPending,
          handleFieldModify
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
            
            {/* URLs de l'événement */}
            {firstProposal && (
              <Box sx={{ mt: 3 }}>
                <EventLinksEditor
                  websiteUrl={firstProposal.changes.websiteUrl}
                  facebookUrl={firstProposal.changes.facebookUrl}
                  instagramUrl={firstProposal.changes.instagramUrl}
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

export default EventUpdateGroupedDetail
