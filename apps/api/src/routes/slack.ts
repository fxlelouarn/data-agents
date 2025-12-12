import { Router, Request, Response } from 'express'
import { slackService, SlackMessage } from '../services/slack/SlackService'
import { eventDataExtractor, ExtractedEventData, ApiCreditError, ApiRateLimitError } from '../services/slack/extractors'
import { createProposalFromSlack, SlackSourceMetadata } from '../services/slack/SlackProposalService'
import { prisma } from '@data-agents/database'

const router = Router()

/**
 * Récupère l'agent Slack depuis la base de données
 * L'agent est chargé dynamiquement pour permettre la configuration à chaud
 */
async function getSlackAgent() {
  const agent = await prisma.agent.findFirst({
    where: {
      name: 'Slack Event Agent',
      isActive: true
    }
  })
  return agent
}

/**
 * Middleware to verify Slack request signature
 * IMPORTANT: This must be called BEFORE express.json() parses the body
 */
export const verifySlackRequest = (req: Request, res: Response, next: Function) => {
  const signature = req.headers['x-slack-signature'] as string
  const timestamp = req.headers['x-slack-request-timestamp'] as string
  const rawBody = (req as any).rawBody as string

  if (!signature || !timestamp || !rawBody) {
    console.warn('Slack: Missing signature headers or raw body')
    return res.status(400).json({ error: 'Missing signature' })
  }

  if (!slackService.verifySignature(signature, timestamp, rawBody)) {
    console.warn('Slack: Invalid signature')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  next()
}

/**
 * POST /api/slack/events
 * Handles Slack Events API webhooks
 *
 * Event types:
 * - url_verification: Slack challenge for initial setup
 * - event_callback: Actual events (messages, mentions, etc.)
 */
router.post('/events', verifySlackRequest, async (req: Request, res: Response) => {
  const { type, challenge, event } = req.body

  // URL verification challenge (initial setup)
  if (type === 'url_verification') {
    console.log('✅ Slack URL verification successful')
    return res.json({ challenge })
  }

  // Event callback
  if (type === 'event_callback') {
    // Respond immediately to avoid timeout (Slack expects response within 3s)
    res.status(200).json({ ok: true })

    // Process event asynchronously
    processSlackEvent(event).catch(error => {
      console.error('Error processing Slack event:', error)
    })

    return
  }

  res.status(400).json({ error: 'Unknown event type' })
})

/**
 * POST /api/slack/interactions
 * Handles Slack interactive components (buttons, modals, etc.)
 */
router.post('/interactions', verifySlackRequest, async (req: Request, res: Response) => {
  // Slack sends interactions as form-urlencoded with a "payload" field
  const payload = JSON.parse(req.body.payload || '{}')

  const { type, actions, user, channel, message } = payload

  // Respond immediately
  res.status(200).json({ ok: true })

  // Process interaction asynchronously
  if (type === 'block_actions' && actions?.length > 0) {
    const action = actions[0]

    if (action.action_id === 'approve_proposal') {
      await handleApproveProposal(action.value, user, channel, message)
    }
    // 'view_dashboard' action is handled by Slack (opens URL)
  }
})

/**
 * Process incoming Slack events
 */
async function processSlackEvent(event: any) {
  const { type, subtype, channel, user, text, ts, thread_ts, files } = event

  // Ignore bot messages to prevent loops
  if (subtype === 'bot_message' || event.bot_id) {
    return
  }

  // Check if this is the configured channel
  const configuredChannel = slackService.getChannelId()
  if (configuredChannel && channel !== configuredChannel) {
    return
  }

  // Handle app_mention event
  if (type === 'app_mention') {
    await handleBotMention({
      type: 'message',
      user,
      text,
      ts,
      channel,
      thread_ts,
      files
    })
    return
  }

  // Note: On ne traite PAS les événements 'message' avec mention ici
  // car Slack envoie déjà un événement 'app_mention' séparé.
  // Traiter les deux causerait un double traitement du même message.
}

/**
 * Handle when the bot is mentioned
 */
async function handleBotMention(message: SlackMessage) {
  console.log(`📨 Bot mentioned by user ${message.user} in channel ${message.channel}`)

  // Vérifier si l'agent Slack est actif
  const slackAgent = await getSlackAgent()
  if (!slackAgent) {
    console.warn('⚠️ Slack Event Agent not found or not active - processing anyway with defaults')
    // On continue quand même pour rétro-compatibilité
  } else {
    console.log(`🤖 Using Slack Event Agent: ${slackAgent.name} (v${(slackAgent.config as any)?.version || 'unknown'})`)

    // Vérifier si le channel est configuré dans l'agent
    const agentConfig = slackAgent.config as any
    const channels = agentConfig?.channels || []
    const channelConfig = channels.find((ch: any) => ch.id === message.channel)

    if (channels.length > 0 && !channelConfig) {
      console.log(`⏭️ Channel ${message.channel} not in agent config, skipping`)
      return
    }
  }

  // Add "eyes" reaction to indicate processing
  await slackService.addReaction(message.channel, message.ts, 'eyes')

  try {
    // Extract URLs from message
    const urls = slackService.extractUrls(message.text)
    const hasImages = message.files && message.files.some(f => f.mimetype.startsWith('image/'))

    if (urls.length === 0 && !hasImages) {
      // No URL or image provided
      await slackService.removeReaction(message.channel, message.ts, 'eyes')
      await slackService.addReaction(message.channel, message.ts, 'question')

      await slackService.postMessage(
        message.channel,
        "Je n'ai pas trouvé de lien ou d'image dans ton message. Peux-tu me donner un lien vers la page de l'événement ou une image avec les informations ?",
        { thread_ts: message.ts }
      )
      return
    }

    // Build source metadata
    const sourceUrl = urls.length > 0 ? urls[0] : undefined
    const sourceMetadata = await slackService.buildSourceMetadata(message, sourceUrl)

    // Phase 2: Extract event data from URL or image
    const extractionResult = await eventDataExtractor.extractFromMessage({
      message,
      urls,
      hasImages: !!hasImages
    })

    await slackService.removeReaction(message.channel, message.ts, 'eyes')

    if (!extractionResult.success || !extractionResult.data) {
      // Extraction failed
      await slackService.addReaction(message.channel, message.ts, 'warning')

      let errorMessage = "⚠️ Je n'ai pas réussi à extraire les informations de l'événement.\n\n"
      if (extractionResult.error) {
        errorMessage += `Raison: ${extractionResult.error}\n\n`
      }
      errorMessage += "Tu peux:\n"
      errorMessage += "• Vérifier que le lien est correct et accessible\n"
      errorMessage += "• Essayer avec un autre lien vers la page de l'événement\n"
      errorMessage += "• Partager une image claire avec les informations"

      await slackService.postMessage(
        message.channel,
        errorMessage,
        { thread_ts: message.ts }
      )
      return
    }

    // Extraction successful!
    const extractedData = extractionResult.data
    console.log(`✅ Extraction successful: ${extractedData.eventName}`)

    // Validate extracted data
    const validation = eventDataExtractor.validateExtractedData(extractedData)
    if (!validation.valid) {
      console.warn(`⚠️ Extracted data missing fields: ${validation.missing.join(', ')}`)
    }

    // Format and send response
    const formattedText = eventDataExtractor.formatForSlack(extractedData)
    const dashboardUrl = process.env.FRONTEND_URL || 'https://data-agents-dashboard.onrender.com'

    // Phase 3: Create Proposal with matching
    console.log('🔍 Starting matching and proposal creation...')
    const proposalResult = await createProposalFromSlack(
      extractedData,
      sourceMetadata as SlackSourceMetadata
    )

    await slackService.removeReaction(message.channel, message.ts, 'eyes')

    if (!proposalResult.success) {
      // Proposal creation failed
      await slackService.addReaction(message.channel, message.ts, 'warning')

      await slackService.postMessage(
        message.channel,
        `${formattedText}\n\n⚠️ *Impossible de créer la proposition*\n${proposalResult.error || 'Erreur inconnue'}`,
        { thread_ts: message.ts }
      )
      return
    }

    // Proposal created successfully!
    await slackService.addReaction(message.channel, message.ts, 'white_check_mark')

    // Build response message based on proposal type
    let matchInfo = ''
    if (proposalResult.proposalType === 'NEW_EVENT') {
      matchInfo = '🆕 *Nouvel événement* - Aucun événement existant correspondant trouvé'
    } else if (proposalResult.matchedEvent) {
      matchInfo = `🔄 *Mise à jour* de "${proposalResult.matchedEvent.name}" (${proposalResult.matchedEvent.city})`
      if (proposalResult.matchedEdition) {
        matchInfo += ` - Édition ${proposalResult.matchedEdition.year}`
      }
    }

    const proposalUrl = `${dashboardUrl}/proposals/${proposalResult.proposalId}`
    const confidencePercent = Math.round(proposalResult.confidence * 100)

    // Post message with action buttons
    await slackService.postMessage(
      message.channel,
      `${formattedText}\n\n${matchInfo}\n📊 Confiance: ${confidencePercent}%`,
      {
        thread_ts: message.ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: formattedText
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${matchInfo}\n📊 *Confiance:* ${confidencePercent}%`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ Valider',
                  emoji: true
                },
                style: 'primary',
                action_id: 'approve_proposal',
                value: proposalResult.proposalId
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📝 Voir sur le dashboard',
                  emoji: true
                },
                url: proposalUrl,
                action_id: 'view_dashboard'
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `📍 Source: ${extractedData.sourceUrl || 'Message Slack'} | 🔧 Méthode: ${extractedData.extractionMethod} | 🆔 ${proposalResult.proposalId}`
              }
            ]
          }
        ]
      }
    )

    console.log('📋 Proposal created:', proposalResult.proposalId)
    console.log('📋 Source metadata:', JSON.stringify(sourceMetadata, null, 2))

  } catch (error) {
    console.error('Error handling bot mention:', error)

    await slackService.removeReaction(message.channel, message.ts, 'eyes')
    await slackService.addReaction(message.channel, message.ts, 'x')

    // Customize error message based on error type
    let errorMessage = "❌ Une erreur est survenue lors du traitement de ta demande."

    if (error instanceof ApiCreditError) {
      errorMessage = "💳 *Erreur de crédits API*\n\n" +
        "Le service d'extraction n'est pas disponible car les crédits API Anthropic sont insuffisants.\n\n" +
        "👉 Un administrateur doit recharger les crédits sur https://console.anthropic.com/"
      console.error('API CREDIT ERROR: Anthropic credits exhausted')
    } else if (error instanceof ApiRateLimitError) {
      errorMessage = "⏱️ *Limite de requêtes atteinte*\n\n" +
        "Trop de requêtes ont été envoyées à l'API d'extraction.\n\n" +
        "👉 Réessaie dans quelques minutes."
    } else {
      errorMessage += " Réessaie plus tard ou contacte un admin."
    }

    await slackService.postMessage(
      message.channel,
      errorMessage,
      { thread_ts: message.ts }
    )
  }
}

/**
 * Handle "Approve" button click from Slack
 */
async function handleApproveProposal(
  proposalId: string,
  user: any,
  channel: any,
  message: any
) {
  console.log(`✅ User ${user.id} approved proposal ${proposalId}`)

  // TODO: Phase 4 - Actually approve the proposal via API
  // For now, just update the message

  try {
    // Update the message to show it's been approved
    const updatedText = `✅ *Proposition validée* par <@${user.id}>`

    await slackService.updateMessage(
      channel.id,
      message.ts,
      updatedText,
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: updatedText
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Validée le ${new Date().toLocaleString('fr-FR')}`
            }
          ]
        }
      ]
    )

    // Add checkmark to original message
    // Note: We'd need to track the original message ts somewhere

  } catch (error) {
    console.error('Error approving proposal:', error)
  }
}

export { router as slackRouter }
