import { Notice, requestUrl } from 'obsidian';
import { AtpAgent, RichText, AppBskyEmbedExternal, BlobRef } from '@atproto/api'
import type BlueskyPlugin from '@/main'

interface ThreadPost {
  text: string
  reply?: { root: { uri: string; cid: string }, parent: { uri: string; cid: string } }
}

interface LinkMetadata {
  url: string
  title: string
  description?: string
  image?: string
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

  async fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
    try {
      // Use Obsidian's requestUrl to avoid CORS issues
      const response = await requestUrl({
        url: url,
        method: 'GET',
        throw: false // Don't throw on HTTP errors
      })
      
      // Check if request was successful
      if (!response || response.status >= 400) {
        console.warn(`Failed to fetch ${url}: Status ${response?.status || 'unknown'}`);
        return null;
      }
      
      const html = response.text
      
      const getMetaContent = (property: string): string | undefined => {
        const regex = new RegExp(`<meta\\s+(?:property|name)=["'](?:og:)?${property}["']\\s+content=["']([^"']+)["']`, 'i')
        const match = html.match(regex)
        return match?.[1]
      }

      const title = getMetaContent('title') || html.match(/<title>([^<]+)<\/title>/i)?.[1] || url
      const description = getMetaContent('description')
      const image = getMetaContent('image')

      return {
        url,
        title: title.substring(0, 100),
        description: description?.substring(0, 300),
        image
      }
    } catch (error: any) {
      // Handle specific error types
      if (error.message?.includes('ERR_CERT_') || error.message?.includes('certificate')) {
        console.warn('Certificate error for URL:', url);
      } else if (error.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        console.warn('DNS error for URL:', url);
      } else {
        console.error('Failed to fetch link metadata:', error);
      }
      return null
    }
  }

  async uploadImage(imageUrl: string): Promise<BlobRef | null> {
    try {
      const response = await requestUrl({
        url: imageUrl,
        method: 'GET'
      })
      
      const uint8Array = new Uint8Array(response.arrayBuffer)
      
      // Try to determine content type from headers or default to jpeg
      const contentType = response.headers['content-type'] || 'image/jpeg'
      
      const uploaded = await this.agent.uploadBlob(uint8Array, {
        encoding: contentType
      })
      
      return uploaded.data.blob
    } catch (error) {
      console.error('Failed to upload image:', error)
      return null
    }
  }

  extractFirstUrl(text: string): string | null {
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
    const match = text.match(urlRegex)
    return match ? match[0] : null
  }

  async createPost(text: string, linkMetadata?: LinkMetadata, linkRanges?: Array<{start: number, end: number, url: string, text: string}>): Promise<boolean> {
    try {
      if (!this.agent.session?.did) {
        throw new Error('Not logged in')
      }
      
      const richText = new RichText({ text })
      await richText.detectFacets(this.agent)
      
      // Add manual link facets for selected text
      if (linkRanges && linkRanges.length > 0) {
        for (const range of linkRanges) {
          // Calculate byte positions (Bluesky uses UTF-8 byte positions)
          const encoder = new TextEncoder()
          const textBefore = text.substring(0, range.start)
          const linkText = text.substring(range.start, range.end)
          
          const byteStart = encoder.encode(textBefore).length
          const byteEnd = byteStart + encoder.encode(linkText).length
          
          // Add link facet
          richText.facets = richText.facets || []
          richText.facets.push({
            index: {
              byteStart: byteStart,
              byteEnd: byteEnd
            },
            features: [{
              $type: 'app.bsky.richtext.facet#link',
              uri: range.url
            }]
          })
        }
      }
      
      let embed: AppBskyEmbedExternal.Main | undefined
      
      if (linkMetadata) {
        let thumb: BlobRef | undefined
        
        if (linkMetadata.image) {
          const uploadedThumb = await this.uploadImage(linkMetadata.image)
          if (uploadedThumb) {
            thumb = uploadedThumb
          }
        }
        
        embed = {
          $type: 'app.bsky.embed.external',
          external: {
            uri: linkMetadata.url,
            title: linkMetadata.title,
            description: linkMetadata.description || '',
            thumb
          }
        }
      }
      
      await this.agent.post({
        text: richText.text,
        facets: richText.facets,
        embed
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