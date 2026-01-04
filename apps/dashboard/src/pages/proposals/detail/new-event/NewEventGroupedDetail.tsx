import React, { useMemo } from 'react'
import { Box, LinearProgress } from '@mui/material'
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
import {
  TwoPaneLayout,
  SourceProposalPane,
  CollapsibleContextCards
} from '@/components/proposals/grouped'
import { useCheckExistingEvent, useProposalGroup } from '@/hooks/useApi'

interface NewEventGroupedDetailProps {
  groupKey: string
}

const NewEventGroupedDetail: React.FC<NewEventGroupedDetailProps> = ({ groupKey }) => {
  // Récupérer le groupe pour avoir accès au premier proposalId
  const { data: groupData, isLoading: isGroupLoading } = useProposalGroup(groupKey)
  const firstProposalId = groupData?.data?.[0]?.id

  // Vérifier si un événement correspondant existe maintenant dans Miles Republic
  const { data: checkExistingResult } = useCheckExistingEvent(
    firstProposalId || '',
    Boolean(firstProposalId)
  )

  if (isGroupLoading) {
    return <LinearProgress />
  }

  return (
    <GroupedProposalDetailBase
      groupKey={groupKey}
      renderMainContent={(context) => {
        // ✅ Two-Panes: Utiliser les fonctions du contexte (provenant de GroupedProposalDetailBase)
        const {
          sourceProposals,
          activeSourceIndex,
          setActiveSourceIndex,
          copyFieldFromSource,
          copyRaceFromSource,
          copyAllFromSource,
          getFieldDifferences,
          getRaceDifferences
        } = context

        // Vérifier qu'on a plusieurs sources pour le mode two-panes
        const hasMultipleSources = sourceProposals.length > 1

        // Vérifier si tous les blocs sont validés
        const isAllValidated = 
          context.isBlockValidated('event') &&
          context.isBlockValidated('edition') &&
          context.isBlockValidated('races')

        // Si une seule source, utiliser le layout simple
        if (!hasMultipleSources) {
          return (
            <MainContent
              context={context}
              checkExistingResult={checkExistingResult}
              firstProposalId={firstProposalId}
            />
          )
        }

        // Mode Two-Panes : plusieurs sources disponibles
        const fieldDifferences = getFieldDifferences()
        const raceDifferences = getRaceDifferences()

        return (
          <>
            {/* Alerte si un événement correspondant existe maintenant */}
            {checkExistingResult?.hasMatch && checkExistingResult.match && firstProposalId && (
              <ExistingEventAlert
                proposalId={firstProposalId}
                match={checkExistingResult.match}
                proposalYear={context.groupProposals[0]?.editionYear || new Date().getFullYear()}
              />
            )}

            <TwoPaneLayout
              leftTitle="Proposition de travail"
              rightTitle="Sources"
              leftPane={
                <MainContent
                  context={context}
                  checkExistingResult={null} // Déjà affiché au-dessus
                  firstProposalId={firstProposalId}
                  hideDateSources={true} // Sources dans l'accordéon du bas
                />
              }
              rightPane={
                <SourceProposalPane
                  sourceProposals={sourceProposals}
                  activeSourceIndex={activeSourceIndex}
                  onChangeSource={setActiveSourceIndex}
                  fieldDifferences={fieldDifferences}
                  raceDifferences={raceDifferences}
                  onCopyField={copyFieldFromSource}
                  onCopyRace={copyRaceFromSource}
                  onCopyAll={copyAllFromSource}
                  isValidated={isAllValidated}
                />
              }
            />

            {/* Cards contextuelles en dessous du TwoPanes */}
            <CollapsibleContextCards title="Informations contextuelles">
              {/* Passer les cards individuellement pour la disposition horizontale */}
              {context.groupProposals[0] && (
                <EditionContextInfo
                  currentCalendarStatus={
                    context.userModifiedChanges['calendarStatus'] ||
                    context.selectedChanges['calendarStatus'] ||
                    undefined
                  }
                  currentEditionYear={context.getEditionYear(context.groupProposals[0]) ? parseInt(context.getEditionYear(context.groupProposals[0])!) : undefined}
                  previousEditionYear={(context.groupProposals[0] as any).previousEditionYear}
                  previousCalendarStatus={(context.groupProposals[0] as any).previousEditionCalendarStatus}
                  previousEditionStartDate={(context.groupProposals[0] as any).previousEditionStartDate}
                  eventName={(context.groupProposals[0] as any).eventName}
                  eventSlug={(context.groupProposals[0] as any).eventSlug}
                  isFeatured={context.groupProposals[0].isFeatured}
                />
              )}
              {(() => {
                const rejectedMatches = context.groupProposals[0]?.justification
                  ?.find((j: any) => j.type === 'rejected_matches' || j.type === 'text')
                  ?.metadata?.rejectedMatches || []
                return rejectedMatches.length > 0 ? (
                  <RejectedMatchesCard
                    proposalId={context.groupProposals[0].id}
                    rejectedMatches={rejectedMatches}
                  />
                ) : null
              })()}
            </CollapsibleContextCards>
          </>
        )
      }}
      renderSidebar={(context) => {
        // En mode Two-Panes, pas de sidebar (cards affichées en dessous)
        const hasMultipleSources = context.sourceProposals.length > 1
        if (hasMultipleSources) {
          return null
        }
        return <SidebarContent context={context} />
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Composants internes extraits pour réutilisation
// ═══════════════════════════════════════════════════════════════════════════════

interface MainContentProps {
  context: any // GroupedProposalContext
  checkExistingResult: any
  firstProposalId: string | undefined
  /** En mode Two-Panes, les sources sont dans l'accordéon du bas */
  hideDateSources?: boolean
}

/**
 * Contenu principal avec les tables d'édition
 */
const MainContent: React.FC<MainContentProps> = ({
  context,
  checkExistingResult,
  firstProposalId,
  hideDateSources = false
}) => {
  const {
    consolidatedChanges,
    consolidatedRaceChanges,
    selectedChanges,
    userModifiedRaceChanges,
    handleFieldSelect,
    handleApproveField,
    handleFieldModify,
    handleEditionStartDateChange,
    handleRaceFieldModify,
    handleDeleteRace,
    handleAddRace,
    userModifiedChanges,
    formatValue,
    formatAgentsList,
    editionTimezone,
    isPending,
    isEventDead,
    isEditionCanceled,
    groupProposals,
    isAllApproved,
    validateBlock,
    unvalidateBlock,
    isBlockValidated,
    isBlockPending,
    blockProposals
  } = context

  // Extraire la date d'édition pour pré-remplir AddRaceDialog
  const editionStartDate = useMemo(() => {
    if (userModifiedChanges?.startDate) {
      return userModifiedChanges.startDate
    }

    const startDateField = consolidatedChanges?.find((c: any) => c.field === 'startDate')
    if (startDateField) {
      return startDateField.options[0]?.proposedValue
    }

    const firstProposal = groupProposals[0]
    if (firstProposal?.changes?.edition?.new?.startDate) {
      return firstProposal.changes.edition.new.startDate
    }

    if (userModifiedRaceChanges && Object.keys(userModifiedRaceChanges).length > 0) {
      const firstRaceWithDate = Object.values(userModifiedRaceChanges).find(
        (race: any) => race.startDate && !race._deleted
      )
      if (firstRaceWithDate && (firstRaceWithDate as any).startDate) {
        return (firstRaceWithDate as any).startDate
      }
    }

    if (consolidatedRaceChanges && consolidatedRaceChanges.length > 0) {
      const firstRaceWithDate = consolidatedRaceChanges.find(
        (race: any) => race.fields?.startDate || race.originalFields?.startDate
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

    const timeZoneField = consolidatedChanges?.find((c: any) => c.field === 'timeZone')
    if (timeZoneField) {
      return timeZoneField.options[0]?.proposedValue
    }

    const firstProposal = groupProposals[0]
    if (firstProposal?.changes?.edition?.new?.timeZone) {
      return firstProposal.changes.edition.new.timeZone
    }

    return 'Europe/Paris'
  }, [userModifiedChanges, consolidatedChanges, groupProposals])

  // Séparer les champs Event, Edition et spéciaux
  const organizerChange = consolidatedChanges.find((c: any) => c.field === 'organizer')

  const editionFields = ['year', 'startDate', 'endDate', 'timeZone', 'calendarStatus', 'registrationOpeningDate', 'registrationClosingDate']
  const eventChanges = consolidatedChanges.filter((c: any) =>
    !editionFields.includes(c.field) && c.field !== 'organizer'
  )

  const editionChanges = consolidatedChanges.filter((c: any) => editionFields.includes(c.field))

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
        onValidateBlock={() => validateBlock('event')}
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
        onValidateBlock={() => validateBlock('edition')}
        onUnvalidateBlock={() => unvalidateBlock('edition')}
        isBlockPending={isBlockPending}
        validationDisabled={isAllApproved}
      />

      {/* Section organisateur */}
      {(organizerChange || isBlockValidated('organizer')) && (
        <OrganizerSection
          change={organizerChange}
          onApprove={() => handleApproveField('organizer')}
          onFieldModify={handleFieldModify}
          userModifiedChanges={userModifiedChanges}
          disabled={isBlockValidated('organizer') || isEventDead || isAllApproved}
          isBlockValidated={isBlockValidated('organizer')}
          onValidateBlock={() => validateBlock('organizer')}
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
        onValidateBlock={() => validateBlock('races')}
        onUnvalidateBlock={() => unvalidateBlock('races')}
        isBlockPending={isBlockPending}
        validationDisabled={isEventDead || isAllApproved}
      />

      {/* Sources des dates extraites (masqué en mode Two-Panes car dans l'accordéon) */}
      {!hideDateSources && (
        <DateSourcesSection
          justifications={groupProposals.flatMap((p: any) => p.justification || [])}
        />
      )}
    </>
  )
}

interface SidebarContentProps {
  context: any // GroupedProposalContext
}

/**
 * Contenu de la sidebar avec les informations contextuelles
 */
const SidebarContent: React.FC<SidebarContentProps> = ({ context }) => {
  const {
    groupProposals,
    allGroupProposals,
    getEditionYear,
    selectedChanges,
    userModifiedChanges,
    handleArchiveSingleProposal,
    isArchiving
  } = context

  const firstProposal = groupProposals[0]

  // Extraire les matches rejetés depuis les justifications de la première proposition
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

      {/* AgentInfoSection gère la séparation PENDING vs historique en interne */}
      <AgentInfoSection
        proposals={allGroupProposals.map((p: any) => ({
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
}

export default NewEventGroupedDetail
