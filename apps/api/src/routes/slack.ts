import { Router, Request, Response } from 'express'
import { slackService, SlackMessage } from '../services/slack/SlackService'

const router = Router()

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

  // Handle direct messages in channel (if we want to process all messages)
  if (type === 'message' && !subtype) {
    // Check if bot is mentioned
    const isMentioned = await slackService.isBotMentioned(text || '')
    if (isMentioned) {
      await handleBotMention({
        type: 'message',
        user,
        text,
        ts,
        channel,
        thread_ts,
        files
      })
    }
  }
}

/**
 * Handle when the bot is mentioned
 */
async function handleBotMention(message: SlackMessage) {
  console.log(`📨 Bot mentioned by user ${message.user} in channel ${message.channel}`)

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

    // TODO: Phase 2 - Extract event data from URL or image
    // For now, just acknowledge receipt

    await slackService.removeReaction(message.channel, message.ts, 'eyes')

    // Temporary response until extraction is implemented
    let responseText = "🔍 J'ai bien reçu ta demande.\n\n"

    if (urls.length > 0) {
      responseText += `📎 Lien détecté: ${urls[0]}\n`
    }

    if (hasImages) {
      const imageCount = message.files!.filter(f => f.mimetype.startsWith('image/')).length
      responseText += `🖼️ ${imageCount} image(s) détectée(s)\n`
    }

    responseText += "\n⏳ L'extraction automatique n'est pas encore implémentée. Restez connectés !"

    await slackService.postMessage(
      message.channel,
      responseText,
      { thread_ts: message.ts }
    )

    // For now, add a placeholder reaction
    await slackService.addReaction(message.channel, message.ts, 'hourglass_flowing_sand')

    console.log('📋 Source metadata built:', JSON.stringify(sourceMetadata, null, 2))

  } catch (error) {
    console.error('Error handling bot mention:', error)

    await slackService.removeReaction(message.channel, message.ts, 'eyes')
    await slackService.addReaction(message.channel, message.ts, 'x')

    await slackService.postMessage(
      message.channel,
      "❌ Une erreur est survenue lors du traitement de ta demande. Réessaie plus tard ou contacte un admin.",
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
