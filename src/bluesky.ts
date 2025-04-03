import { Notice } from 'obsidian';
import { AtpAgent, RichText } from '@atproto/api'
import type BlueskyPlugin from '@/main'

interface ThreadPost {
  text: string
  reply?: { root: { uri: string; cid: string }, parent: { uri: string; cid: string } }
}

interface PostLike {
  uri: string;
  cid: string;
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

  async getFeedGenerators(): Promise<any> {
    try {
      await this.login()
      if (!this.agent.session?.did) {
        throw new Error('Not logged in')
      }

      // did:web:skyfeed.me -> 
      
      const response = await this.agent.api.app.bsky.feed.getFeedGenerators({
        feeds: [
          // 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot',
          // 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/tech',
          // 'at://did:plc:nubczgdb7tau5ebpgdieab76/feed/aaaonssncq7u6',
          'at://did:plc:nubczgdb7tau5ebpgdieab76/app.bsky.feed.generator/aaaonssncq7u6',

          // 'at://did:plc:nubczgdb7tau5ebpgdieab76/app.bsky.feed.generator/aloha',
          'at://did:plc:jfhpnnst6flqway4eaeqzj2a/app.bsky.feed.generator/for-science',
          // 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/with-friends',
          'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/hot-classic'
        ]
      })
      
      return response.data
    } catch (error) {
      console.error('Failed to fetch feed generators:', error)
      throw error
    }
  }

  async getFeed(feedUri: string): Promise<any> {
    try {
      const response = await this.agent.api.app.bsky.feed.getFeed({
        feed: feedUri
      })
      return response.data
    } catch (error) {
      console.error('Failed to fetch feed:', error)
      throw error
    }
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

  async createPost(text: string): Promise<boolean> {
    try {
      if (!this.agent.session?.did) {
        throw new Error('Not logged in')
      }
      
      // Append "Or so it seems..." to the post
      
      const richText = new RichText({ text })
      await richText.detectFacets(this.agent)
      await this.agent.post({
        text: richText.text,
        facets: richText.facets,
      })
      new Notice('Successfully posted to Bluesky!');
      return true
    } catch (error) {
      console.error('Failed to post:', error)
      if (error.message.includes('Failed to fetch')) {
        new Notice('Could not connect to the internet.')
      } else {
        new Notice(`Failed to post: ${error.message}`);
      }
      throw error
    }
  }

  async createThread(posts: string[]): Promise<boolean> {
    if (!posts.length) return false
    
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
    return true
  }

  async likePost(post: PostLike): Promise<void> {
    try {
      if (!this.agent.session?.did) {
        throw new Error('Not logged in')
      }

      const isLiked = await this.isPostLiked(post.uri);
      
      if (isLiked) {
        // Generate the rkey for the like - it's a hash of the post URI
        const rkey = `${post.uri.split('/').pop()}`;
        
        // Unlike using deleteRecord
        await this.agent.api.com.atproto.repo.deleteRecord({
          collection: 'app.bsky.feed.like',
          repo: this.agent.session.did,
          rkey: rkey
        });
        return;
      }
      // Like the post
      await this.agent.api.app.bsky.feed.like.create(
        { repo: this.agent.session.did },
        {
          subject: {
            uri: post.uri,
            cid: post.cid
          },
          createdAt: new Date().toISOString(),
          rkey: `${post.uri.split('/').pop()}`  // Use consistent rkey for later deletion
        }
      )
    } catch (error) {
      console.error('Failed to like/unlike post:', error)
      throw error
    }
  }

  async isPostLiked(postUri: string): Promise<boolean> {
    try {
      if (!this.agent.session?.did) return false;
      
      const existing = await this.agent.api.app.bsky.feed.getLikes({ uri: postUri });
      return existing.data.likes.some(like => like.actor.did === this.agent.session?.did);
    } catch (error) {
      console.error('Failed to check like status:', error);
      return false;
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