import type { AppBskyFeedDefs } from '@atproto/api'

// A Bluesky strong reference: a record's AT-URI plus its CID.
export interface StrongRef {
  uri: string
  cid: string
}

// The root + parent refs needed to attach a reply into a thread.
export interface ReplyRefs {
  root: StrongRef
  parent: StrongRef
}

// Match a bsky.app post URL: https://bsky.app/profile/<handle-or-did>/post/<rkey>
const BSKY_POST_URL = /bsky\.app\/profile\/([^/?#]+)\/post\/([^/?#]+)/

// Parse a bsky.app post URL into its actor (handle or DID) and record key.
// Returns null for anything that isn't a post URL.
export function parseBskyPostUrl(url: string): { actor: string; rkey: string } | null {
  if (typeof url !== 'string') return null
  const match = url.match(BSKY_POST_URL)
  if (!match) return null
  const [, actor, rkey] = match
  if (!actor || !rkey) return null
  return { actor, rkey }
}

// Build the reply refs for replying to a post. The parent is the target itself;
// the root is the target's existing thread root when the target is itself a
// reply, otherwise the target (a top-level post is its own root).
export function deriveReplyRef(post: AppBskyFeedDefs.PostView): ReplyRefs {
  const parent: StrongRef = { uri: post.uri, cid: post.cid }
  const record = post.record as { reply?: { root?: StrongRef } }
  const root = record?.reply?.root ?? parent
  return { root, parent }
}

// The slice of an AtpAgent that target resolution needs. Kept minimal and
// obsidian-free so this module stays unit-testable with a mock agent; a real
// AtpAgent satisfies it structurally.
export interface ReplyResolverAgent {
  resolveHandle(params: { handle: string }): Promise<{ data: { did: string } }>
  getPosts(params: { uris: string[] }): Promise<{ data: { posts: AppBskyFeedDefs.PostView[] } }>
}

// A resolved reply target: the refs needed to post the reply, plus a small
// preview of the post being replied to for user confirmation.
export interface ReplyTarget {
  refs: ReplyRefs
  preview: {
    authorHandle: string
    authorName?: string
    text: string
  }
}

// Resolve a bsky.app post URL into reply refs and a preview. Resolves the handle
// to a DID when needed, fetches the post, and derives the thread refs. Returns
// null for a non-post URL, a post that can't be fetched, or any request error.
export async function resolveReplyTarget(
  agent: ReplyResolverAgent,
  url: string,
): Promise<ReplyTarget | null> {
  const parsed = parseBskyPostUrl(url)
  if (!parsed) return null

  try {
    let did = parsed.actor
    if (!did.startsWith('did:')) {
      const resolved = await agent.resolveHandle({ handle: parsed.actor })
      did = resolved.data.did
    }

    const atUri = `at://${did}/app.bsky.feed.post/${parsed.rkey}`
    const response = await agent.getPosts({ uris: [atUri] })
    const post = response.data.posts[0]
    if (!post) return null

    const record = post.record as { text?: string }
    return {
      refs: deriveReplyRef(post),
      preview: {
        authorHandle: post.author.handle,
        authorName: post.author.displayName,
        text: typeof record?.text === 'string' ? record.text : '',
      },
    }
  } catch {
    return null
  }
}
