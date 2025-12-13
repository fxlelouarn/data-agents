/**
 * Service de notification Slack pour les propositions
 *
 * Envoie des notifications dans le thread Slack original
 * quand une proposition est validée depuis le dashboard.
 */

import { slackService } from './SlackService'
import { prisma } from '@data-agents/database'

interface SourceMetadata {
  type: string
  extra?: {
    channelId?: string
    messageTs?: string
    messageLink?: string
  }
}

interface ProposalForNotification {
  id: string
  sourceMetadata?: SourceMetadata | null
  eventName?: string | null
  confidence?: number | null
  approvedBlocks?: Record<string, boolean> | null
}

/**
 * Notifie dans le thread Slack qu'une proposition a été validée
 *
 * @param proposal - La proposition validée
 * @param validatedBlocks - Les blocs qui ont été validés (ex: ['event', 'edition'])
 * @param userName - Nom de l'utilisateur qui a validé (optionnel)
 * @returns true si la notification a été envoyée, false sinon
 */
export async function notifyProposalValidated(
  proposal: ProposalForNotification,
  validatedBlocks: string[],
  userName?: string
): Promise<boolean> {
  // Vérifier que le service Slack est initialisé
  if (!slackService.isInitialized()) {
    console.log('📵 SlackNotificationService: Slack non configuré, notification ignorée')
    return false
  }

  // Vérifier que la proposition provient de Slack
  const sourceMetadata = proposal.sourceMetadata as SourceMetadata | null
  if (!sourceMetadata || sourceMetadata.type !== 'SLACK') {
    // Pas une proposition Slack, rien à notifier
    return false
  }

  const channelId = sourceMetadata.extra?.channelId
  const messageTs = sourceMetadata.extra?.messageTs

  if (!channelId || !messageTs) {
    console.warn('⚠️ SlackNotificationService: channelId ou messageTs manquant dans sourceMetadata')
    return false
  }

  try {
    // Construire le message de notification
    const blocksText = validatedBlocks.length > 0
      ? validatedBlocks.join(', ')
      : 'tous les blocs'

    const userText = userName ? ` par *${userName}*` : ''
    const confidenceText = proposal.confidence
      ? `\n📊 Confiance : ${Math.round(proposal.confidence * 100)}%`
      : ''

    const message = `✅ *Proposition validée*${userText}\n\n` +
      `Blocs validés : ${blocksText}${confidenceText}\n\n` +
      `→ La mise à jour sera appliquée prochainement.`

    // Poster dans le thread original
    await slackService.postMessage(channelId, message, {
      thread_ts: messageTs
    })

    console.log(`📨 SlackNotificationService: Notification envoyée pour proposition ${proposal.id}`)
    return true

  } catch (error) {
    console.error('❌ SlackNotificationService: Erreur lors de l\'envoi de la notification:', error)
    return false
  }
}

/**
 * Notifie pour une proposition par son ID
 * Récupère les infos de la proposition depuis la base de données
 */
export async function notifyProposalValidatedById(
  proposalId: string,
  validatedBlocks: string[],
  userName?: string
): Promise<boolean> {
  try {
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        sourceMetadata: true,
        eventName: true,
        confidence: true,
        approvedBlocks: true
      }
    })

    if (!proposal) {
      console.warn(`⚠️ SlackNotificationService: Proposition ${proposalId} non trouvée`)
      return false
    }

    return notifyProposalValidated(
      proposal as ProposalForNotification,
      validatedBlocks,
      userName
    )
  } catch (error) {
    console.error('❌ SlackNotificationService: Erreur lors de la récupération de la proposition:', error)
    return false
  }
}
