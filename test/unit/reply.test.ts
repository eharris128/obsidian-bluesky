import assert from 'node:assert/strict'
import type { AppBskyFeedDefs } from '@atproto/api'
import { parseBskyPostUrl, deriveReplyRef } from '../../src/utils/reply'

type PostView = AppBskyFeedDefs.PostView

const makePost = (uri: string, cid: string, record: Record<string, unknown>): PostView =>
  ({ uri, cid, record } as unknown as PostView)

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
