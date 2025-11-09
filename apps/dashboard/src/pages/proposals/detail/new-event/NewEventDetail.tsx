import React from 'react'
import { Box, Button } from '@mui/material'
import { CheckCircle as ApproveIcon, Cancel as RejectIcon } from '@mui/icons-material'
import ProposalDetailBase from '../base/ProposalDetailBase'
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import CategorizedEditionChangesTable from '@/components/proposals/CategorizedEditionChangesTable'
import RacesChangesTable from '@/components/proposals/edition-update/RacesChangesTable'
import OrganizerSection from '@/components/proposals/edition-update/OrganizerSection'
import ProposalJustificationsCard from '@/components/proposals/ProposalJustificationsCard'
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
          proposal,
          // Validation par blocs
          validateBlock,
          unvalidateBlock,
          isBlockValidated,
          isBlockPending,
          blockProposals
        } = context
        
        // Séparer les champs standards des champs spéciaux
        const organizerChange = consolidatedChanges.find(c => c.field === 'organizer')
        
        // Ajouter les champs URL éditables même s'ils ne sont pas proposés
        const urlFields = ['websiteUrl', 'facebookUrl', 'instagramUrl']
        const eventChangesWithUrls = [...consolidatedChanges.filter(c => c.field !== 'organizer')]
        
        urlFields.forEach(urlField => {
          if (!eventChangesWithUrls.some(c => c.field === urlField)) {
            // Ajouter un champ vide éditable
            eventChangesWithUrls.push({
              field: urlField,
              options: [],
              currentValue: null
            })
          }
        })
        
        return (
          <>
            <CategorizedEventChangesTable
              title="Informations de l'événement"
              changes={eventChangesWithUrls}
              isNewEvent={true}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              disabled={!allPending || isPending || isEventDead}
              isBlockValidated={isBlockValidated('event')}
              onValidateBlock={() => validateBlock('event', blockProposals['event'] || [])}
              onUnvalidateBlock={() => unvalidateBlock('event')}
              isBlockPending={isBlockPending}
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
              isBlockValidated={isBlockValidated('edition')}
              onValidateBlock={() => validateBlock('edition', blockProposals['edition'] || [])}
              onUnvalidateBlock={() => unvalidateBlock('edition')}
              isBlockPending={isBlockPending}
              // actions - ❌ OBSOLETE : Boutons "Tout approuver" / "Tout rejeter" remplacés par validation par blocs
            />
            
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
            
            <RacesChangesTable
              existingRaces={[]}
              racesToAdd={proposal?.changes?.edition?.new?.races || []}
              proposalId={proposal?.id}
              proposal={proposal}
              disabled={!allPending || isPending || isEventDead}
              isBlockValidated={isBlockValidated('races')}
              onValidateBlock={() => validateBlock('races', blockProposals['races'] || [])}
              onUnvalidateBlock={() => unvalidateBlock('races')}
              isBlockPending={isBlockPending}
              validationDisabled={isEventDead}
            />
            
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

export default NewEventDetail
