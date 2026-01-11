import { describe, expect, it } from 'vitest'
import { resolveRule } from '../../src/content/scanner/rules'

function createDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('test')
  doc.body.innerHTML = html
  return doc
}

describe('http(s) heuristics in generic scan', () => {
  it('filters out normal navigation links and keeps likely downloads', () => {
    const doc = createDoc(`
      <a href="https://example.com/login">Login</a>
      <a href="https://example.com/page?utm_source=x">News</a>
      <a href="https://cdn.example.com/file.mp4">Video</a>
      <a href="https://example.com/download?id=1&utm_source=foo">download</a>
      <a href="magnet:?xt=urn:btih:aaa&dn=Hello">magnet</a>
    `)

    const context = { host: 'example.com', url: 'https://example.com/' }
    const rule = resolveRule(context, [])
    const links = rule.scan(doc, context)

    const urls = links.map(link => link.url)
    expect(urls.some(url => url.includes('/login'))).toBe(false)
    expect(urls.some(url => url.includes('/page?'))).toBe(false)

    expect(urls).toContain('https://cdn.example.com/file.mp4')
    // utm is removed by normalization
    expect(urls).toContain('https://example.com/download?id=1')
    expect(urls.some(url => url.startsWith('magnet:?xt=urn:btih:aaa'))).toBe(true)
  })
})

