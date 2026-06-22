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
