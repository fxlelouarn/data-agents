import { WebClient } from '@slack/web-api'
import * as crypto from 'crypto'

export interface SlackMessage {
  type: string
  user: string
  text: string
  ts: string
  channel: string
  thread_ts?: string
  files?: SlackFile[]
}

export interface SlackFile {
  id: string
  name: string
  mimetype: string
  url_private: string
  url_private_download: string
}

export interface SlackSourceMetadata {
  type: 'SLACK'
  workspaceId: string
  workspaceName: string
  channelId: string
  channelName: string
  messageTs: string
  threadTs?: string
  userId: string
  userName: string
  messageLink: string
  sourceUrl?: string
  imageUrls?: string[]
  extractedAt: string
}

class SlackService {
  private client: WebClient | null = null
  private signingSecret: string | null = null
  private channelId: string | null = null
  private botUserId: string | null = null

  /**
   * Initialize the Slack service with credentials
   */
  initialize() {
    const token = process.env.SLACK_BOT_TOKEN
    const signingSecret = process.env.SLACK_SIGNING_SECRET
    const channelId = process.env.SLACK_CHANNEL_ID

    if (!token || !signingSecret || !channelId) {
      console.warn('⚠️  Slack credentials not configured. SlackService disabled.')
      return false
    }

    this.client = new WebClient(token)
    this.signingSecret = signingSecret
    this.channelId = channelId

    console.log('✅ SlackService initialized')
    return true
  }

  /**
   * Check if the service is properly initialized
   */
  isInitialized(): boolean {
    return this.client !== null && this.signingSecret !== null
  }

  /**
   * Verify Slack request signature
   * @see https://api.slack.com/authentication/verifying-requests-from-slack
   */
  verifySignature(
    signature: string,
    timestamp: string,
    body: string
  ): boolean {
    if (!this.signingSecret) {
      console.error('SlackService: Signing secret not configured')
      return false
    }

    // Check timestamp to prevent replay attacks (5 minutes tolerance)
    const currentTime = Math.floor(Date.now() / 1000)
    if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
      console.warn('SlackService: Request timestamp too old')
      return false
    }

    const sigBasestring = `v0:${timestamp}:${body}`
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', this.signingSecret)
      .update(sigBasestring)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    )
  }

  /**
   * Get the bot's user ID (cached after first call)
   */
  async getBotUserId(): Promise<string | null> {
    if (this.botUserId) return this.botUserId
    if (!this.client) return null

    try {
      const response = await this.client.auth.test()
      this.botUserId = response.user_id as string
      return this.botUserId
    } catch (error) {
      console.error('SlackService: Failed to get bot user ID:', error)
      return null
    }
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(channel: string, timestamp: string, emoji: string): Promise<boolean> {
    if (!this.client) return false

    try {
      await this.client.reactions.add({
        channel,
        timestamp,
        name: emoji
      })
      return true
    } catch (error: any) {
      // Ignore "already_reacted" errors
      if (error.data?.error === 'already_reacted') {
        return true
      }
      console.error(`SlackService: Failed to add reaction ${emoji}:`, error)
      return false
    }
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(channel: string, timestamp: string, emoji: string): Promise<boolean> {
    if (!this.client) return false

    try {
      await this.client.reactions.remove({
        channel,
        timestamp,
        name: emoji
      })
      return true
    } catch (error: any) {
      // Ignore "no_reaction" errors
      if (error.data?.error === 'no_reaction') {
        return true
      }
      console.error(`SlackService: Failed to remove reaction ${emoji}:`, error)
      return false
    }
  }

  /**
   * Post a message to a channel or thread
   */
  async postMessage(
    channel: string,
    text: string,
    options?: {
      thread_ts?: string
      blocks?: any[]
    }
  ): Promise<{ ts: string; channel: string } | null> {
    if (!this.client) return null

    try {
      const response = await this.client.chat.postMessage({
        channel,
        text,
        thread_ts: options?.thread_ts,
        blocks: options?.blocks
      })
      return {
        ts: response.ts as string,
        channel: response.channel as string
      }
    } catch (error) {
      console.error('SlackService: Failed to post message:', error)
      return null
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(
    channel: string,
    ts: string,
    text: string,
    blocks?: any[]
  ): Promise<boolean> {
    if (!this.client) return false

    try {
      await this.client.chat.update({
        channel,
        ts,
        text,
        blocks
      })
      return true
    } catch (error) {
      console.error('SlackService: Failed to update message:', error)
      return false
    }
  }

  /**
   * Get user info by ID
   */
  async getUserInfo(userId: string): Promise<{ name: string; realName: string } | null> {
    if (!this.client) return null

    try {
      const response = await this.client.users.info({ user: userId })
      const user = response.user as any
      return {
        name: user.name,
        realName: user.real_name || user.name
      }
    } catch (error) {
      console.error('SlackService: Failed to get user info:', error)
      return null
    }
  }

  /**
   * Get channel info by ID
   */
  async getChannelInfo(channelId: string): Promise<{ name: string } | null> {
    if (!this.client) return null

    try {
      const response = await this.client.conversations.info({ channel: channelId })
      const channel = response.channel as any
      return {
        name: channel.name
      }
    } catch (error) {
      console.error('SlackService: Failed to get channel info:', error)
      return null
    }
  }

  /**
   * Get workspace info
   */
  async getWorkspaceInfo(): Promise<{ id: string; name: string } | null> {
    if (!this.client) return null

    try {
      const response = await this.client.team.info()
      const team = response.team as any
      return {
        id: team.id,
        name: team.name
      }
    } catch (error) {
      console.error('SlackService: Failed to get workspace info:', error)
      return null
    }
  }

  /**
   * Download a file from Slack (requires authentication)
   */
  async downloadFile(fileUrl: string): Promise<Buffer | null> {
    if (!this.client) return null

    try {
      const token = process.env.SLACK_BOT_TOKEN
      const response = await fetch(fileUrl, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      console.error('SlackService: Failed to download file:', error)
      return null
    }
  }

  /**
   * Generate a permalink to a message
   */
  async getMessagePermalink(channel: string, messageTs: string): Promise<string | null> {
    if (!this.client) return null

    try {
      const response = await this.client.chat.getPermalink({
        channel,
        message_ts: messageTs
      })
      return response.permalink as string
    } catch (error) {
      console.error('SlackService: Failed to get permalink:', error)
      return null
    }
  }

  /**
   * Build source metadata for a Proposal
   */
  async buildSourceMetadata(
    message: SlackMessage,
    extractedSourceUrl?: string
  ): Promise<SlackSourceMetadata | null> {
    const [userInfo, channelInfo, workspaceInfo, permalink] = await Promise.all([
      this.getUserInfo(message.user),
      this.getChannelInfo(message.channel),
      this.getWorkspaceInfo(),
      this.getMessagePermalink(message.channel, message.ts)
    ])

    if (!userInfo || !channelInfo || !workspaceInfo) {
      return null
    }

    const imageUrls = message.files
      ?.filter(f => f.mimetype.startsWith('image/'))
      .map(f => f.url_private)

    return {
      type: 'SLACK',
      workspaceId: workspaceInfo.id,
      workspaceName: workspaceInfo.name,
      channelId: message.channel,
      channelName: channelInfo.name,
      messageTs: message.ts,
      threadTs: message.thread_ts,
      userId: message.user,
      userName: userInfo.realName,
      messageLink: permalink || '',
      sourceUrl: extractedSourceUrl,
      imageUrls: imageUrls?.length ? imageUrls : undefined,
      extractedAt: new Date().toISOString()
    }
  }

  /**
   * Extract URLs from message text
   */
  extractUrls(text: string): string[] {
    // Slack formats URLs as <URL|label> or just <URL>
    const slackUrlRegex = /<(https?:\/\/[^|>]+)(?:\|[^>]+)?>/g
    const urls: string[] = []
    let match

    while ((match = slackUrlRegex.exec(text)) !== null) {
      urls.push(match[1])
    }

    return urls
  }

  /**
   * Check if message mentions the bot
   */
  async isBotMentioned(text: string): Promise<boolean> {
    const botUserId = await this.getBotUserId()
    if (!botUserId) return false

    // Slack formats mentions as <@USER_ID>
    return text.includes(`<@${botUserId}>`)
  }

  /**
   * Get the configured channel ID
   */
  getChannelId(): string | null {
    return this.channelId
  }

  /**
   * Create interactive message blocks for proposal validation
   */
  createProposalBlocks(
    proposalId: string,
    summary: string,
    dashboardUrl: string,
    confidence?: number
  ): any[] {
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: summary
        }
      }
    ]

    if (confidence !== undefined) {
      const confidencePercent = Math.round(confidence * 100)
      const emoji = confidence >= 0.8 ? '🟢' : confidence >= 0.5 ? '🟡' : '🔴'
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${emoji} Confiance: ${confidencePercent}%`
          }
        ]
      })
    }

    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'actions',
        block_id: `proposal_actions_${proposalId}`,
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
            value: proposalId
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📝 Voir sur le dashboard',
              emoji: true
            },
            url: dashboardUrl,
            action_id: 'view_dashboard'
          }
        ]
      }
    )

    return blocks
  }
}

// Singleton instance
export const slackService = new SlackService()
