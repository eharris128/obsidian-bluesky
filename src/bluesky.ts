import { AtpAgent, RichText } from '@atproto/api'
import type BlueskyPlugin from '@/main'

interface ThreadPost {
  text: string
  reply?: { root: { uri: string; cid: string }, parent: { uri: string; cid: string } }
}

export class BlueskyBot {
  private agent: AtpAgent
  private plugin: BlueskyPlugin

  constructor(plugin: BlueskyPlugin) {
    this.plugin = plugin
    this.agent = new AtpAgent({
      service: 'https://bsky.social',
    })
  }

  // TODO do not login each time
  async login(): Promise<void> {
    try {
      const { blueskyIdentifier, blueskyAppPassword } = this.plugin.settings
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
      // TODO - fix
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

  async createThread(posts: string[]): Promise<void> {
    if (!posts.length) return
    
    let lastPost: { uri: string; cid: string } | null = null
    let rootPost: { uri: string; cid: string } | null = null

    for (const text of posts) {
      const rt = new RichText({ text })
      await rt.detectFacets(this.agent) 
      
      const post: ThreadPost = { text: rt.text }
      
      if (lastPost) {
        post.reply = {
          root: rootPost!,
          parent: lastPost
        }
      }
    
      const result: any = await this.agent.post({
        text: post.text,
        reply: post.reply,
        facets: rt.facets,
      })
      
      if (!rootPost) {
        rootPost = { uri: result.uri, cid: result.cid }
      }
      lastPost = { uri: result.uri, cid: result.cid }
    }
  }
}

export async function createBlueskyPost(plugin: BlueskyPlugin, text: string): Promise<void> {
  const bot = new BlueskyBot(plugin)
  try {
    await bot.login()
    await bot.createPost(text)
  } catch (error) {
    console.error('Error posting to Bluesky:', error)
    throw error
  }
}