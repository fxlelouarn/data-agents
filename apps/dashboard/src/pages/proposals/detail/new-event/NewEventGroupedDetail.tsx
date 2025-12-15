import React, { useMemo } from 'react'
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
import { ExistingEventAlert } from '@/components/proposals/new-event/ExistingEventAlert'
import { useCheckExistingEvent, useProposalGroup } from '@/hooks/useApi'

interface NewEventGroupedDetailProps {
  groupKey: string
}

const NewEventGroupedDetail: React.FC<NewEventGroupedDetailProps> = ({ groupKey }) => {
  // Récupérer le groupe pour avoir accès au premier proposalId
  const { data: groupData } = useProposalGroup(groupKey)
  const firstProposalId = groupData?.data?.[0]?.id

  // Vérifier si un événement correspondant existe maintenant dans Miles Republic
  const { data: checkExistingResult } = useCheckExistingEvent(
    firstProposalId || '',
    Boolean(firstProposalId)
  )

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
          handleDeleteRace,
          handleAddRace,
          userModifiedChanges,
          formatValue,
          formatAgentsList,
          editionTimezone,
          allPending,
          isPending,
          isEventDead,
          isEditionCanceled,
          groupProposals,
          isAllApproved, // ✅ Mode lecture seule (toutes APPROVED)
          // Validation par bloc
          validateBlock,
          unvalidateBlock,
          isBlockValidated,
          isBlockPending,
          blockProposals
        } = context

        // Extraire la date d'édition pour pré-remplir AddRaceDialog
        const editionStartDate = useMemo(() => {
          // Pour NEW_EVENT, priorité:
          // 1) userModifiedChanges (modifications manuelles)
          // 2) consolidatedChanges (propositions agents)
          // 3) edition.new.startDate (structure imbriquée)
          // 4) courses déjà ajoutées manuellement
          // 5) édition existante (si disponible)

          if (userModifiedChanges?.startDate) {
            return userModifiedChanges.startDate
          }

          const startDateField = consolidatedChanges?.find(c => c.field === 'startDate')
          if (startDateField) {
            return startDateField.options[0]?.proposedValue
          }

          // Fallback: chercher dans edition.new pour NEW_EVENT
          const firstProposal = groupProposals[0]
          if (firstProposal?.changes?.edition?.new?.startDate) {
            return firstProposal.changes.edition.new.startDate
          }

          // Fallback: chercher dans les courses déjà ajoutées manuellement
          if (userModifiedRaceChanges && Object.keys(userModifiedRaceChanges).length > 0) {
            const firstRaceWithDate = Object.values(userModifiedRaceChanges).find(
              (race: any) => race.startDate && !race._deleted
            )
            if (firstRaceWithDate && (firstRaceWithDate as any).startDate) {
              return (firstRaceWithDate as any).startDate
            }
          }

          // Fallback: chercher dans les courses consolidées existantes
          if (consolidatedRaceChanges && consolidatedRaceChanges.length > 0) {
            const firstRaceWithDate = consolidatedRaceChanges.find(
              race => race.fields?.startDate || race.originalFields?.startDate
            )
            if (firstRaceWithDate) {
              return firstRaceWithDate.fields?.startDate || firstRaceWithDate.originalFields?.startDate
            }
          }

          return undefined
        }, [userModifiedChanges, consolidatedChanges, groupProposals, userModifiedRaceChanges, consolidatedRaceChanges])

        const editionTimeZone = useMemo(() => {
          if (userModifiedChanges?.timeZone) {
            return userModifiedChanges.timeZone
          }

          const timeZoneField = consolidatedChanges?.find(c => c.field === 'timeZone')
          if (timeZoneField) {
            return timeZoneField.options[0]?.proposedValue
          }

          // Fallback: chercher dans edition.new pour NEW_EVENT
          const firstProposal = groupProposals[0]
          if (firstProposal?.changes?.edition?.new?.timeZone) {
            return firstProposal.changes.edition.new.timeZone
          }

          return 'Europe/Paris'
        }, [userModifiedChanges, consolidatedChanges, groupProposals])

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

        // Extraire l'année de l'édition pour l'alerte
        const editionYear = groupProposals[0]?.changes?.edition?.new?.year
          ? parseInt(groupProposals[0].changes.edition.new.year)
          : groupProposals[0]?.editionYear || new Date().getFullYear()

        return (
          <>
            {/* Alerte si un événement correspondant existe maintenant */}
            {checkExistingResult?.hasMatch && checkExistingResult.match && firstProposalId && (
              <ExistingEventAlert
                proposalId={firstProposalId}
                match={checkExistingResult.match}
                proposalYear={editionYear}
              />
            )}

            {/* Table des champs Event */}
            <CategorizedEventChangesTable
              title="Informations de l'événement"
              changes={eventChanges}
              isNewEvent={true}
              selectedChanges={selectedChanges}
              onFieldSelect={handleFieldSelect}
              onFieldApprove={handleApproveField}
              onFieldModify={handleFieldModify}
              userModifiedChanges={userModifiedChanges}
              formatValue={formatValue}
              formatAgentsList={formatAgentsList}
              disabled={isBlockValidated('event') || isPending || isEventDead || isAllApproved}
              isBlockValidated={isBlockValidated('event')}
              onValidateBlock={() => validateBlock('event', blockProposals['event'] || [])}
              onUnvalidateBlock={() => unvalidateBlock('event')}
              isBlockPending={isBlockPending}
              validationDisabled={isAllApproved}
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
              disabled={isBlockValidated('edition') || isPending || isEventDead || isAllApproved}
              isEditionCanceled={isEditionCanceled || isEventDead}
              isBlockValidated={isBlockValidated('edition')}
              onValidateBlock={() => validateBlock('edition', blockProposals['edition'] || [])}
              onUnvalidateBlock={() => unvalidateBlock('edition')}
              isBlockPending={isBlockPending}
              validationDisabled={isAllApproved}
              // actions - ❌ OBSOLETE : Boutons "Tout approuver" / "Tout rejeter" remplacés par validation par blocs
            />

            {/* Section organisateur - afficher s'il y a un changement OU si le bloc est validé */}
            {(organizerChange || isBlockValidated('organizer')) && (
              <OrganizerSection
                change={organizerChange}
                onApprove={() => handleApproveField('organizer')}
                onFieldModify={handleFieldModify}
                userModifiedChanges={userModifiedChanges}
                disabled={isBlockValidated('organizer') || isEventDead || isAllApproved}
                isBlockValidated={isBlockValidated('organizer')}
                onValidateBlock={() => validateBlock('organizer', blockProposals['organizer'] || [])}
                onUnvalidateBlock={() => unvalidateBlock('organizer')}
                isBlockPending={isBlockPending}
                validationDisabled={isEventDead || isAllApproved}
              />
            )}

            {/* Section des courses */}
            <RacesChangesTable
              consolidatedRaces={consolidatedRaceChanges}
              userModifiedRaceChanges={userModifiedRaceChanges}
              onRaceFieldModify={handleRaceFieldModify}
              onDeleteRace={handleDeleteRace}
              onAddRace={handleAddRace}
              editionStartDate={editionStartDate}
              editionTimeZone={editionTimeZone}
              disabled={isBlockValidated('races') || isPending || isEventDead || isAllApproved}
              isBlockValidated={isBlockValidated('races')}
              onValidateBlock={() => validateBlock('races', blockProposals['races'] || [])}
              onUnvalidateBlock={() => unvalidateBlock('races')}
              isBlockPending={isBlockPending}
              validationDisabled={isEventDead || isAllApproved}
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
          groupProposals, // ✅ PENDING uniquement
          allGroupProposals, // ✅ Toutes les propositions (PENDING + historiques)
          getEditionYear,
          selectedChanges,
          userModifiedChanges,
          handleArchiveSingleProposal,
          isArchiving
        } = context

        const firstProposal = groupProposals[0]

        // Extraire les matches rejetés depuis les justifications de la première proposition
        // Contrat: type === 'rejected_matches' (obligatoire)
        // Fallback: type === 'text' pour rétro-compatibilité avec anciennes propositions
        const rejectedMatches = firstProposal?.justification
          ?.find((j: any) => j.type === 'rejected_matches' || j.type === 'text')
          ?.metadata?.rejectedMatches || []

        return (
          <>
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
                eventName={(firstProposal as any).eventName}
                eventSlug={(firstProposal as any).eventSlug}
                isFeatured={firstProposal.isFeatured}
              />
            )}

            {/* ✅ AgentInfoSection gère la séparation PENDING vs historique en interne */}
            <AgentInfoSection
              proposals={allGroupProposals.map(p => ({
                ...p,
                confidence: p.confidence || 0,
                status: p.status
              }))}
              onArchive={handleArchiveSingleProposal}
              isArchiving={isArchiving}
            />

            {/* Afficher la card des matches rejetés */}
            {rejectedMatches.length > 0 && (
              <RejectedMatchesCard
                proposalId={firstProposal.id}
                rejectedMatches={rejectedMatches}
              />
            )}
          </>
        )
      }}
    />
  )
}

export default NewEventGroupedDetail
