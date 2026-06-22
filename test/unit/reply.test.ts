import assert from 'node:assert/strict'
import type { AppBskyFeedDefs } from '@atproto/api'
import {
  parseBskyPostUrl,
  deriveReplyRef,
  resolveReplyTarget,
  type ReplyResolverAgent,
} from '../../src/utils/reply'

type PostView = AppBskyFeedDefs.PostView

const makePost = (
  uri: string,
  cid: string,
  record: Record<string, unknown>,
  author: { handle: string; displayName?: string } = { handle: 'author.bsky.social', displayName: 'Author' },
): PostView => ({ uri, cid, record, author } as unknown as PostView)

interface MockAgent extends ReplyResolverAgent {
  calls: { resolveHandle: string[]; getPosts: string[][] }
}

const mockAgent = (opts: { did?: string; posts?: PostView[]; getPostsThrows?: boolean }): MockAgent => {
  const calls = { resolveHandle: [] as string[], getPosts: [] as string[][] }
  return {
    calls,
    async resolveHandle({ handle }) {
      calls.resolveHandle.push(handle)
      return { data: { did: opts.did ?? 'did:plc:resolved' } }
    },
    async getPosts({ uris }) {
      calls.getPosts.push(uris)
      if (opts.getPostsThrows) throw new Error('boom')
      return { data: { posts: opts.posts ?? [] } }
    },
  }
}

describe('parseBskyPostUrl', () => {
  it('parses a standard post URL with a handle', () => {
    const r = parseBskyPostUrl('https://bsky.app/profile/evanharris.bsky.social/post/3lctfdfa4vk2a')
    assert.deepEqual(r, { actor: 'evanharris.bsky.social', rkey: '3lctfdfa4vk2a' })
  })

  it('parses a post URL with a DID actor segment', () => {
    const r = parseBskyPostUrl('https://bsky.app/profile/did:plc:abc123/post/3lctfdfa4vk2a')
    assert.deepEqual(r, { actor: 'did:plc:abc123', rkey: '3lctfdfa4vk2a' })
  })

  it('tolerates a trailing slash and query string', () => {
    const r = parseBskyPostUrl('https://bsky.app/profile/foo.bsky.social/post/abc123/?ref=x')
    assert.deepEqual(r, { actor: 'foo.bsky.social', rkey: 'abc123' })
  })

  it('returns null for a profile URL with no post segment', () => {
    assert.equal(parseBskyPostUrl('https://bsky.app/profile/foo.bsky.social'), null)
  })

  it('returns null for non-bsky URLs and empty input', () => {
    assert.equal(parseBskyPostUrl('https://example.com/post/123'), null)
    assert.equal(parseBskyPostUrl(''), null)
  })
})

describe('deriveReplyRef', () => {
  const target = { uri: 'at://did:plc:author/app.bsky.feed.post/rkey1', cid: 'cidTARGET' }

  it('uses the target as its own root for a top-level post', () => {
    const refs = deriveReplyRef(makePost(target.uri, target.cid, { text: 'hi' }))
    assert.deepEqual(refs.parent, target)
    assert.deepEqual(refs.root, target)
  })

  it('uses the existing thread root when the target is itself a reply', () => {
    const root = { uri: 'at://did:plc:op/app.bsky.feed.post/root1', cid: 'cidROOT' }
    const refs = deriveReplyRef(makePost(target.uri, target.cid, { text: 'hi', reply: { root } }))
    assert.deepEqual(refs.parent, target)
    assert.deepEqual(refs.root, root)
  })
})

describe('resolveReplyTarget', () => {
  const url = 'https://bsky.app/profile/author.bsky.social/post/rkey1'

  it('resolves a handle URL to refs and a preview', async () => {
    const post = makePost('at://did:plc:author/app.bsky.feed.post/rkey1', 'cidTARGET', { text: 'hello world' })
    const agent = mockAgent({ did: 'did:plc:author', posts: [post] })

    const result = await resolveReplyTarget(agent, url)

    assert.ok(result)
    assert.equal(agent.calls.resolveHandle[0], 'author.bsky.social')
    assert.deepEqual(agent.calls.getPosts[0], ['at://did:plc:author/app.bsky.feed.post/rkey1'])
    assert.deepEqual(result.refs.parent, { uri: post.uri, cid: 'cidTARGET' })
    assert.deepEqual(result.refs.root, { uri: post.uri, cid: 'cidTARGET' })
    assert.deepEqual(result.preview, { authorHandle: 'author.bsky.social', authorName: 'Author', text: 'hello world' })
  })

  it('skips handle resolution when the actor is already a DID', async () => {
    const didUrl = 'https://bsky.app/profile/did:plc:author/post/rkey1'
    const post = makePost('at://did:plc:author/app.bsky.feed.post/rkey1', 'cidTARGET', { text: 'hi' })
    const agent = mockAgent({ posts: [post] })

    const result = await resolveReplyTarget(agent, didUrl)

    assert.ok(result)
    assert.equal(agent.calls.resolveHandle.length, 0)
    assert.deepEqual(agent.calls.getPosts[0], ['at://did:plc:author/app.bsky.feed.post/rkey1'])
  })

  it('returns the external thread root when the target is itself a reply', async () => {
    const root = { uri: 'at://did:plc:op/app.bsky.feed.post/root1', cid: 'cidROOT' }
    const post = makePost('at://did:plc:author/app.bsky.feed.post/rkey1', 'cidTARGET', { text: 'reply', reply: { root } })
    const agent = mockAgent({ did: 'did:plc:author', posts: [post] })

    const result = await resolveReplyTarget(agent, url)

    assert.ok(result)
    assert.deepEqual(result.refs.root, root)
    assert.deepEqual(result.refs.parent, { uri: post.uri, cid: 'cidTARGET' })
  })

  it('returns null when the post is not found', async () => {
    const agent = mockAgent({ did: 'did:plc:author', posts: [] })
    assert.equal(await resolveReplyTarget(agent, url), null)
  })

  it('returns null when a request throws', async () => {
    const agent = mockAgent({ did: 'did:plc:author', getPostsThrows: true })
    assert.equal(await resolveReplyTarget(agent, url), null)
  })

  it('returns null for a malformed URL without calling the agent', async () => {
    const agent = mockAgent({})
    assert.equal(await resolveReplyTarget(agent, 'https://example.com/not-a-post'), null)
    assert.equal(agent.calls.resolveHandle.length, 0)
    assert.equal(agent.calls.getPosts.length, 0)
  })
})
