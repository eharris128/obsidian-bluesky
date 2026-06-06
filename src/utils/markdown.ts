import { RichText, AppBskyRichtextFacet } from '@atproto/api'

export interface MarkdownLink {
  start: number
  end: number
  url: string
  text: string
}

export interface ParsedMarkdown {
  text: string
  links: MarkdownLink[]
}

// Matches [text](target) and ![alt](target), with an optional markdown
// title: [text](https://example.com "title"). Whether the target is a web
// link is decided by resolveMarkdownUrl.
const MARKDOWN_LINK_REGEX = /!?\[([^[\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

// Decide whether a markdown link target is a web link, returning its full URL.
// Scheme-less targets like example.com are validated with the same link
// detection Bluesky itself uses, so vault paths (folder/note, report.pdf)
// are left alone. Returns null for anything that isn't a web link.
function resolveMarkdownUrl(target: string): string | null {
  if (/^https?:\/\//i.test(target)) return target

  // .md is a valid TLD (Moldova), but in a vault it's almost always a note link
  if (/\.md$/i.test(target)) return null

  const probe = new RichText({ text: target })
  probe.detectFacetsWithoutResolution()

  const facet = probe.facets?.[0]
  const feature = facet?.features[0]
  const coversWholeTarget = facet &&
    facet.index.byteStart === 0 &&
    facet.index.byteEnd === new TextEncoder().encode(target).length

  if (probe.facets?.length === 1 && coversWholeTarget && AppBskyRichtextFacet.isLink(feature)) {
    return feature.uri
  }
  return null
}

// Find bare web links (https://..., example.com) in plain text, the same way
// detectFacets will at post time, returning character-offset ranges.
export function detectBareLinks(text: string): MarkdownLink[] {
  const probe = new RichText({ text })
  probe.detectFacetsWithoutResolution()
  if (!probe.facets) return []

  // Facets use UTF-8 byte offsets - map them back to character offsets
  const encoder = new TextEncoder()
  const byteToChar: Record<number, number> = {}
  let byte = 0
  let char = 0
  for (const ch of text) {
    byteToChar[byte] = char
    byte += encoder.encode(ch).length
    char += ch.length
  }
  byteToChar[byte] = char

  const links: MarkdownLink[] = []
  for (const facet of probe.facets) {
    const feature = facet.features[0]
    if (!AppBskyRichtextFacet.isLink(feature)) continue

    const start = byteToChar[facet.index.byteStart]
    const end = byteToChar[facet.index.byteEnd]
    if (start === undefined || end === undefined) continue

    links.push({ start, end, url: feature.uri, text: text.slice(start, end) })
  }
  return links
}

// Find the first markdown web link in the text, returning its position in the
// source text (markdown syntax included) along with its display text and URL.
export function findFirstMarkdownLink(input: string): MarkdownLink | null {
  MARKDOWN_LINK_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MARKDOWN_LINK_REGEX.exec(input))) {
    const url = resolveMarkdownUrl(match[2])
    if (!url) continue

    return {
      start: match.index,
      end: match.index + match[0].length,
      url,
      text: match[1].trim() || url
    }
  }
  return null
}

// Replace markdown link syntax with its display text and record the
// character ranges so they can be turned into Bluesky link facets.
export function parseMarkdownLinks(input: string): ParsedMarkdown {
  const links: MarkdownLink[] = []
  let text = ''
  let lastIndex = 0

  for (const match of input.matchAll(MARKDOWN_LINK_REGEX)) {
    const [full, label] = match
    const url = resolveMarkdownUrl(match[2])
    if (!url) continue // not a web link - leave the markdown as-is

    const linkText = label.trim() || url

    text += input.slice(lastIndex, match.index)
    links.push({
      start: text.length,
      end: text.length + linkText.length,
      url,
      text: linkText
    })
    text += linkText
    lastIndex = match.index + full.length
  }
  text += input.slice(lastIndex)

  return { text, links }
}
