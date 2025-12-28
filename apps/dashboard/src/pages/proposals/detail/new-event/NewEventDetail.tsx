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
import { RejectedMatchesCard } from '@/components/proposals/new-event/RejectedMatchesCard'
import { ExistingEventAlert } from '@/components/proposals/new-event/ExistingEventAlert'
import { useCheckExistingEvent } from '@/hooks/useApi'

interface NewEventDetailProps {
  proposalId: string
}

const NewEventDetail: React.FC<NewEventDetailProps> = ({ proposalId }) => {
  // Vérifier si un événement correspondant existe maintenant dans Miles Republic
  // Le hook gère le cas où la proposition n'est pas NEW_EVENT ou PENDING (erreur 400 ignorée)
  const { data: checkExistingResult } = useCheckExistingEvent(proposalId, true)

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
          isReadOnly, // ⚠️ PHASE 3: Flag lecture seule
          proposal,
          // Validation par blocs
          validateBlock,
          unvalidateBlock,
          isBlockValidated,
          isBlockPending,
          blockProposals
        } = context

        // Extraire l'année de l'édition pour l'alerte
        const editionYear = proposal.changes?.edition?.new?.year
          ? parseInt(proposal.changes.edition.new.year)
          : proposal.editionYear || new Date().getFullYear()

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
            {/* Alerte si un événement correspondant existe maintenant */}
            {checkExistingResult?.hasMatch && checkExistingResult.match && (
              <ExistingEventAlert
                proposalId={proposal.id}
                match={checkExistingResult.match}
                proposalYear={editionYear}
              />
            )}

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
              disabled={isReadOnly || !allPending || isPending || isEventDead}
              isBlockValidated={isBlockValidated('event')}
              onValidateBlock={isReadOnly ? undefined : () => validateBlock('event')}
              onUnvalidateBlock={isReadOnly ? undefined : () => unvalidateBlock('event')}
              isBlockPending={isBlockPending}
              showCurrentValue={false}
              showConfidence={false}
              showActions={false}
            />

            <CategorizedEditionChangesTable
              title="Informations de l'édition"
              changes={editionChanges}
              isNewEvent={true}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldModify={handleFieldModify}
              onEditionStartDateChange={handleEditionStartDateChange}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              timezone={editionTimezone}
              disabled={isReadOnly || !allPending || isPending || isEventDead}
              isEditionCanceled={isEditionCanceled || isEventDead}
              isBlockValidated={isBlockValidated('edition')}
              onValidateBlock={isReadOnly ? undefined : () => validateBlock('edition')}
              onUnvalidateBlock={isReadOnly ? undefined : () => unvalidateBlock('edition')}
              isBlockPending={isBlockPending}
              showCurrentValue={false}
              showConfidence={false}
              showActions={false}
              // actions - ❌ OBSOLETE : Boutons "Tout approuver" / "Tout rejeter" remplacés par validation par blocs
            />

            {organizerChange && (
              <OrganizerSection
                change={organizerChange}
                onApprove={() => {/* Single proposal - no field-specific approve */}}
                onFieldModify={handleFieldModify}
                userModifiedChanges={userModifiedChanges}
                disabled={isReadOnly || isBlockValidated('organizer') || isEventDead}
                isBlockValidated={isBlockValidated('organizer')}
                onValidateBlock={isReadOnly ? undefined : () => validateBlock('organizer')}
                onUnvalidateBlock={isReadOnly ? undefined : () => unvalidateBlock('organizer')}
                isBlockPending={isBlockPending}
                validationDisabled={isReadOnly || isEventDead}
                showCurrentValue={false}
                showConfidence={false}
                showActions={false}
              />
            )}

            <RacesChangesTable
              consolidatedRaces={consolidatedRaceChanges}
              userModifiedRaceChanges={userModifiedRaceChanges}
              onRaceFieldModify={handleRaceFieldModify}
              disabled={isReadOnly || !allPending || isPending || isEventDead}
              isBlockValidated={isBlockValidated('races')}
              onValidateBlock={isReadOnly ? undefined : () => validateBlock('races')}
              onUnvalidateBlock={isReadOnly ? undefined : () => unvalidateBlock('races')}
              isBlockPending={isBlockPending}
              validationDisabled={isReadOnly || isEventDead}
              showCurrentValue={false}
              showActions={false}
              showDeleteAction={false}
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

        // Extraire les matches rejetés depuis les justifications
        // Contrat: type === 'rejected_matches' (obligatoire)
        // Fallback: type === 'text' pour rétro-compatibilité avec anciennes propositions
        const rejectedMatches = proposal.justification
          ?.find((j: any) => j.type === 'rejected_matches' || j.type === 'text')
          ?.metadata?.rejectedMatches || []

        return (
          <>
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
                eventName={(proposal as any).eventName}
                eventSlug={(proposal as any).eventSlug}
              />
            )}

            <AgentCard
              agent={{
                name: proposal.agent.name,
                type: proposal.agent.type
              }}
              createdAt={proposal.createdAt}
            />

            {/* Afficher la card des matches rejetés */}
            {rejectedMatches.length > 0 && (
              <RejectedMatchesCard
                proposalId={proposal.id}
                rejectedMatches={rejectedMatches}
              />
            )}
          </>
        )
      }}
    />
  )
}

export default NewEventDetail
