import { Notice } from 'obsidian';
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

  async login(): Promise<void> {
    try {
      const { blueskyIdentifier, blueskyAppPassword } = this.plugin.settings
      if (!blueskyIdentifier || !blueskyAppPassword) {
        new Notice('Not logged in. Go to the Bluesky plugin settings to login.');
        throw new Error('Missing Bluesky credentials - please configure them in settings')
      }
      await this.agent.login({
        identifier: blueskyIdentifier,
        password: blueskyAppPassword
      })
    } catch (error) {
      console.error('Failed to login:', error)
      throw error
    }
  }

  async createPost(text: string): Promise<void> {
    try {
      if (!this.agent.session?.did) {
        throw new Error('Not logged in')
      }
      
      await this.agent.com.atproto.repo.createRecord({
        repo: this.agent.session.did,
        collection: 'app.bsky.feed.post',
        record: {
          text,
          createdAt: new Date().toISOString(),
        }
      })
      new Notice('Successfully posted to Bluesky!');

    } catch (error) {
      console.error('Failed to post:', error)
      new Notice(`Failed to post: ${error.message}`);
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
    
      const result: {uri: string; cid: string} = await this.agent.post({
        text: post.text,
        reply: post.reply,
        facets: rt.facets,
      })
      
      if (!rootPost) {
        rootPost = { uri: result.uri, cid: result.cid }
      }
      lastPost = { uri: result.uri, cid: result.cid }
    }
    new Notice('Successfully posted to Bluesky!');
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