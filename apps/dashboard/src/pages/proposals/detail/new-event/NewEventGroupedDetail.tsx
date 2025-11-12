import React from 'react'
import { Box, Button } from '@mui/material'
import { CheckCircle as ApproveIcon, Cancel as RejectIcon } from '@mui/icons-material'
import GroupedProposalDetailBase from '../base/GroupedProposalDetailBase'
import CategorizedEventChangesTable from '@/components/proposals/CategorizedEventChangesTable'
import CategorizedEditionChangesTable from '@/components/proposals/CategorizedEditionChangesTable'
import RacesChangesTable from '@/components/proposals/edition-update/RacesChangesTable'
import OrganizerSection from '@/components/proposals/edition-update/OrganizerSection'
import DateSourcesSection from '@/components/proposals/DateSourcesSection'
import AgentInfoSection from '@/components/proposals/AgentInfoSection'
import EditionContextInfo from '@/components/proposals/EditionContextInfo'
import { RejectedMatchesCard } from '@/components/proposals/new-event/RejectedMatchesCard'

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
          handleEditionStartDateChange,
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
          groupProposals,
          // Validation par bloc
          validateBlock,
          unvalidateBlock,
          isBlockValidated,
          isBlockPending,
          blockProposals
        } = context
        
        // Séparer les champs Event, Edition et spéciaux
        const organizerChange = consolidatedChanges.find(c => c.field === 'organizer')
        
        // Champs Event (bloqués par EDITION_FIELDS et organizer)
        const editionFields = ['year', 'startDate', 'endDate', 'timeZone', 'calendarStatus', 'registrationOpeningDate', 'registrationClosingDate']
        const eventChanges = consolidatedChanges.filter(c => 
          !editionFields.includes(c.field) && c.field !== 'organizer'
        )
        
        // Champs Edition uniquement
        const editionChanges = consolidatedChanges.filter(c => editionFields.includes(c.field))
        
        // Ajouter les champs URL éditables même s'ils ne sont pas proposés
        const urlFields = ['websiteUrl', 'facebookUrl', 'instagramUrl']
        const eventChangesWithUrls = [...eventChanges]
        
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
            {/* Table des champs Event */}
            <CategorizedEventChangesTable
              title="Informations de l'événement"
              changes={eventChangesWithUrls}
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
              isBlockValidated={isBlockValidated('event')}
              onValidateBlock={() => validateBlock('event', blockProposals['event'] || [])}
              onUnvalidateBlock={() => unvalidateBlock('event')}
              isBlockPending={isBlockPending}
            />
            
            {/* Table des champs Edition */}
            <CategorizedEditionChangesTable
              title="Informations de l'édition"
              changes={editionChanges}
              isNewEvent={true}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldApprove={handleApproveField}
              onFieldModify={handleFieldModify}
              onEditionStartDateChange={handleEditionStartDateChange}
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
            
            {/* Section organisateur */}
            {organizerChange && (
              <OrganizerSection
                change={organizerChange}
                onApprove={() => handleApproveField('organizer')}
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
            
            {/* Section des courses */}
            <RacesChangesTable
              consolidatedRaces={consolidatedRaceChanges}
              userModifiedRaceChanges={userModifiedRaceChanges}
              onRaceFieldModify={handleRaceFieldModify}
              disabled={!allPending || isPending || isEventDead}
              isBlockValidated={isBlockValidated('races')}
              onValidateBlock={() => validateBlock('races', blockProposals['races'] || [])}
              onUnvalidateBlock={() => unvalidateBlock('races')}
              isBlockPending={isBlockPending}
              validationDisabled={isEventDead}
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
        
        // Extraire les matches rejetés depuis les justifications de la première proposition
        const rejectedMatches = firstProposal?.justification
          ?.find((j: any) => j.type === 'text')
          ?.metadata?.rejectedMatches || []
        
        return (
          <>
            <AgentInfoSection 
              proposals={groupProposals.map(p => ({ 
                ...p, 
                confidence: p.confidence || 0, 
                status: p.status 
              }))} 
            />
            
            {/* Afficher la card des matches rejetés */}
            {rejectedMatches.length > 0 && (
              <RejectedMatchesCard
                proposalId={firstProposal.id}
                rejectedMatches={rejectedMatches}
              />
            )}
            
            {/* Informations contextuelles de l'édition */}
            {firstProposal && (
              <EditionContextInfo
                currentCalendarStatus={
                  userModifiedChanges['calendarStatus'] || 
                  selectedChanges['calendarStatus'] || 
                  undefined
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
