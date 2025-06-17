import { Notice, requestUrl } from 'obsidian';
import { AtpAgent, RichText, AppBskyEmbedExternal, BlobRef } from '@atproto/api'
import type BlueskyPlugin from '@/main'
import { logger } from '@/utils/logger'

// Utility function to decode HTML entities
const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

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
      logger.error('Failed to login:', error)
      throw error
    }
  }

  async fetchBlueskyProfileMetadata(url: string): Promise<LinkMetadata | null> {
    try {
      // Extract handle from URL like https://bsky.app/profile/10xdeveloper.bsky.social
      const handleMatch = url.match(/bsky\.app\/profile\/([^\/\?]+)/);
      if (!handleMatch) return null;
      
      const handle = handleMatch[1];
      
      // Ensure we're logged in to access profile data
      if (!this.agent.session?.did) {
        await this.login();
      }
      
      // Use the AT Protocol to get profile info
      const response = await this.agent.getProfile({ actor: handle });
      const profile = response.data;
      
      // Format follower/following counts
      const followersText = profile.followersCount ? `${profile.followersCount.toLocaleString()} followers` : '';
      const followingText = profile.followsCount ? `${profile.followsCount.toLocaleString()} following` : '';
      const postsText = profile.postsCount ? `${profile.postsCount.toLocaleString()} posts` : '';
      
      const stats = [followersText, followingText, postsText].filter(Boolean).join(' • ');
      const description = profile.description ? `${profile.description}\n\n${stats}` : stats;
      
      // Decode HTML entities
      
      return {
        url,
        title: profile.displayName ? `${decodeHtmlEntities(profile.displayName)} (@${profile.handle})` : `@${profile.handle}`,
        description: description ? decodeHtmlEntities(description) : undefined,
        image: profile.avatar
      };
    } catch (error) {
      logger.warn('Failed to fetch Bluesky profile, falling back to regular metadata:', error);
      // Fall back to regular metadata fetching if profile fetch fails
      return null;
    }
  }

  async fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
    try {
      // Handle Bluesky profile URLs specially
      if (url.includes('bsky.app/profile/')) {
        return await this.fetchBlueskyProfileMetadata(url);
      }
      
      // Use Obsidian's requestUrl to avoid CORS issues
      // For Reddit posts, try to get the JSON API version which has better metadata
      let requestUrl_final = url;
      if (url.includes('reddit.com/r/') && !url.includes('.json')) {
        requestUrl_final = url.endsWith('/') ? url + '.json' : url + '.json';
      }
      
      const response = await requestUrl({
        url: requestUrl_final,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ObsidianBluesky/1.0)'
        },
        throw: false // Don't throw on HTTP errors
      })
      
      // Check if request was successful
      if (!response || response.status >= 400) {
        logger.warn(`Failed to fetch ${requestUrl_final}: Status ${response?.status || 'unknown'}`);
        return null;
      }
      
      // Handle Reddit JSON API response
      if (requestUrl_final.includes('.json')) {
        try {
          const jsonData = JSON.parse(response.text);
          const post = jsonData?.[0]?.data?.children?.[0]?.data;
          
          if (post) {
            // Get the best available image
            let image = undefined;
            if (post.preview?.images?.[0]?.source?.url) {
              // Use high-quality preview image
              image = post.preview.images[0].source.url.replace(/&amp;/g, '&');
            } else if (post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default') {
              // Fallback to thumbnail
              image = post.thumbnail;
            }
            
            return {
              url: url, // Use original URL, not JSON URL
              title: decodeHtmlEntities(post.title || 'Reddit Post'),
              description: decodeHtmlEntities(post.selftext || post.url_overridden_by_dest || 'Reddit discussion'),
              image: image
            };
          }
        } catch (e) {
          logger.warn('Failed to parse Reddit JSON, falling back to HTML');
        }
      }
      
      const html = response.text
      
      const getMetaContent = (property: string): string | undefined => {
        // Try Open Graph first, then standard meta tags
        const ogRegex = new RegExp(`<meta\\s+property=["']og:${property}["']\\s+content=["']([^"']+)["']`, 'i')
        const metaRegex = new RegExp(`<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`, 'i')
        
        const ogMatch = html.match(ogRegex)
        if (ogMatch) return ogMatch[1]
        
        const metaMatch = html.match(metaRegex)
        return metaMatch?.[1]
      }

      // Try multiple sources for title
      const title = getMetaContent('title') || 
                   html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
                   html.match(/<title>([^<]+)<\/title>/i)?.[1] || 
                   url
                   
      // Try multiple sources for description  
      const description = getMetaContent('description') ||
                         html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1]
                         
      // Try multiple sources for image
      const image = getMetaContent('image') ||
                   html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1]

      // Fallback: if no description found, try to extract from content
      let finalDescription = description;
      if (!finalDescription) {
        // Try to find some descriptive text from the page
        const bodyMatch = html.match(/<body[^>]*>(.*?)<\/body>/is);
        if (bodyMatch) {
          const bodyText = bodyMatch[1]
            .replace(/<script[^>]*>.*?<\/script>/gis, '')
            .replace(/<style[^>]*>.*?<\/style>/gis, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (bodyText.length > 50) {
            finalDescription = bodyText.substring(0, 300) + '...';
          }
        }
      }

      return {
        url,
        title: decodeHtmlEntities(title).substring(0, 200), // Allow longer titles
        description: finalDescription ? decodeHtmlEntities(finalDescription).substring(0, 500) : undefined, // Allow longer descriptions
        image
      };
    } catch (error) {
      // Handle specific error types
      if (error.message?.includes('ERR_CERT_') || error.message?.includes('certificate')) {
        logger.warn('Certificate error for URL:', url);
      } else if (error.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        logger.warn('DNS error for URL:', url);
      } else {
        logger.error('Failed to fetch link metadata:', error);
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
      logger.error('Failed to upload image:', error)
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
      logger.error('Failed to post:', error)
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
    logger.error('Error posting to Bluesky:', error)
    throw error
  }
}