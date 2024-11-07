import { AtpAgent } from '@atproto/api'
import type MyPlugin from '@/main'

export class BlueskyBot {
  private agent: AtpAgent
  private plugin: MyPlugin

  constructor(plugin: MyPlugin) {
    this.plugin = plugin
    this.agent = new AtpAgent({
      service: 'https://bsky.social',
    })
  }

  // TODO do not login each time
  async login(): Promise<void> {
    try {
      const { blueskyIdentifier, blueskyAppPassword } = this.plugin.settings
      console.log("woo")
      if (!blueskyIdentifier || !blueskyAppPassword) {
        throw new Error('Missing Bluesky credentials - please configure them in settings')
      }
      await this.agent.login({
        identifier: blueskyIdentifier,
        password: blueskyAppPassword
      })
      console.log('Successfully logged in to Bluesky')
    } catch (error) {
      console.error('Failed to login:', error)
      throw error
    }
  }

  async createPost(text: string): Promise<void> {
    try {
      await this.agent.api.app.bsky.feed.post.create(
        { repo: this.agent.session?.did },
        {
          text,
          createdAt: new Date().toISOString(),
        }
      )
      console.log('Successfully posted to Bluesky')
    } catch (error) {
      console.error('Failed to post:', error)
      throw error
    }
  }
}

export async function createBlueskyPost(plugin: MyPlugin, text: string): Promise<void> {
  const bot = new BlueskyBot(plugin)
  try {
    await bot.login()
    await bot.createPost(text)
  } catch (error) {
    console.error('Error posting to Bluesky:', error)
    throw error
  }
}