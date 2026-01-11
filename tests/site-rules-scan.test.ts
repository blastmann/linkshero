import { beforeAll, describe, expect, it } from 'vitest'
import type { SiteRuleDefinition } from '../src/shared/types'
import { resolveRule, scanByRuleDefinition } from '../src/content/scanner/rules'
import { scanByFollowingDetailPages } from '../src/content/scanner/scan-follow'

function createDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('test')
  doc.body.innerHTML = html
  return doc
}

function makeVisibleDom() {
  // jsdom 没有真实布局，默认 getBoundingClientRect 为 0 会导致 isElementVisible 过滤掉全部元素
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 100,
    bottom: 20,
    width: 100,
    height: 20,
    toJSON() {
      return {}
    }
  }

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect
  })
}

beforeAll(() => {
  makeVisibleDom()
})

describe('site rules scan (custom rule + row/page)', () => {
  it('resolveRule prefers enabled custom rules over defaults', () => {
    const context = { host: 'nyaa.si', url: 'https://nyaa.si/?q=abc' }
    const custom: SiteRuleDefinition[] = [
      {
        id: 'override-nyaa',
        name: 'Override',
        enabled: true,
        mode: 'page',
        match: { hostSuffix: ['nyaa.si'] },
        selectors: { link: 'a[href^="magnet:"]' }
      }
    ]

    const resolved = resolveRule(context, custom)
    expect(resolved.id).toBe('custom:override-nyaa')
  })

  it('row mode scans links and uses titleFallback (magnet dn > rowTitle > href)', () => {
    const rule: SiteRuleDefinition = {
      id: 'row-rule',
      name: 'Row Rule',
      enabled: true,
      mode: 'row',
      match: { hostSuffix: ['example.com'] },
      selectors: {
        row: '.row',
        link: 'a[href^="magnet:"]',
        title: '.title',
        seeders: '.seed',
        leechers: '.leech',
        size: '.size'
      },
      extract: {
        titleFallback: ['magnetDn', 'anchorText', 'href']
      }
    }

    const doc = createDoc(`
      <div class="row">
        <span class="title">Row Title A</span>
        <span class="seed">12</span>
        <span class="leech">3</span>
        <span class="size">1.4 GiB</span>
        <a href="magnet:?xt=urn:btih:aaa&dn=Hello%20World">magnet</a>
      </div>
      <div class="row">
        <span class="title">Row Title B</span>
        <a href="magnet:?xt=urn:btih:bbb">no dn</a>
      </div>
    `)

    const links = scanByRuleDefinition(doc, { host: 'example.com', url: 'https://example.com/' }, rule)
    expect(links).toHaveLength(2)

    const first = links.find(link => link.url.includes('btih:aaa'))!
    expect(first.title).toBe('Hello World')
    expect(first.seeders).toBe(12)
    expect(first.leechers).toBe(3)
    expect(first.size).toBe('1.4 GiB')

    const second = links.find(link => link.url.includes('btih:bbb'))!
    // magnet 没 dn 时，回退到 rowTitle
    expect(second.title).toBe('Row Title B')
  })

  it('page mode can use title selector as rowTitle for all anchors on the page', () => {
    const rule: SiteRuleDefinition = {
      id: 'page-rule',
      name: 'Page Rule',
      enabled: true,
      mode: 'page',
      match: { hostSuffix: ['yts.mx'] },
      selectors: {
        link: 'a[href^="magnet:"]',
        title: 'h1'
      }
    }

    const doc = createDoc(`
      <h1>Movie Title (2026)</h1>
      <a href="magnet:?xt=urn:btih:ccc">Download</a>
    `)

    const links = scanByRuleDefinition(doc, { host: 'yts.mx', url: 'https://yts.mx/movies/abc' }, rule)
    expect(links).toHaveLength(1)
    expect(links[0].title).toBe('Movie Title (2026)')
  })

  it('extract.titleAttr can override anchor text', () => {
    const rule: SiteRuleDefinition = {
      id: 'title-attr',
      name: 'Title Attr',
      enabled: true,
      mode: 'page',
      match: { hostSuffix: ['example.com'] },
      selectors: {
        link: 'a[href^="magnet:"]'
      },
      extract: {
        titleAttr: 'data-title',
        titleFallback: ['anchorText', 'href']
      }
    }

    const doc = createDoc(`
      <a href="magnet:?xt=urn:btih:ddd" data-title="Attr Title">Anchor Text</a>
    `)

    const links = scanByRuleDefinition(doc, { host: 'example.com', url: 'https://example.com/' }, rule)
    expect(links).toHaveLength(1)
    expect(links[0].title).toBe('Attr Title')
  })
})

describe('site rules follow (list page -> detail pages)', () => {
  it('follows detail urls and extracts magnet links', async () => {
    const listDoc = createDoc(`
      <table class="table-list">
        <tr><td><a href="/torrent/1/foo/">Foo</a></td></tr>
        <tr><td><a href="/torrent/2/bar/">Bar</a></td></tr>
      </table>
    `)

    const follow: NonNullable<SiteRuleDefinition['follow']> = {
      hrefSelector: 'table.table-list a[href^="/torrent/"]',
      limit: 10,
      detailRule: {
        mode: 'page',
        selectors: {
          link: 'a[href^="magnet:"]',
          title: 'h1'
        },
        extract: {
          titleFallback: ['magnetDn', 'anchorText', 'href']
        }
      }
    }

    const fetchFn: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/torrent/1/foo/')) {
        return new Response(
          `<h1>Foo</h1><a href="magnet:?xt=urn:btih:aaa&dn=Foo%20Magnet">m</a>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        )
      }
      if (url.endsWith('/torrent/2/bar/')) {
        return new Response(`<h1>Bar</h1><a href="magnet:?xt=urn:btih:bbb">m</a>`, {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        })
      }
      return new Response('not found', { status: 404 })
    }) as typeof fetch

    const links = await scanByFollowingDetailPages({
      doc: listDoc,
      context: { host: '1377x.to', url: 'https://1377x.to/popular-movies' },
      follow,
      fetchFn
    })

    expect(links.length).toBe(2)
    expect(links.some(link => link.url.startsWith('magnet:?xt=urn:btih:aaa'))).toBe(true)
    expect(links.some(link => link.url.startsWith('magnet:?xt=urn:btih:bbb'))).toBe(true)
    const foo = links.find(link => link.url.includes('btih:aaa'))!
    expect(foo.title).toBe('Foo Magnet')
  })
})

describe('dmhy-style table row scan', () => {
  it('extracts title from topics/view anchor and size/seeders from fixed columns', () => {
    const rule: SiteRuleDefinition = {
      id: 'dmhy',
      name: 'DMHY',
      enabled: true,
      mode: 'row',
      match: { hostSuffix: ['dmhy.org'] },
      selectors: {
        row: '#topic_list tbody tr',
        link: 'a.download-arrow.arrow-magnet[href^="magnet:"]',
        title: 'td.title > a[href^="/topics/view/"]',
        size: 'td:nth-child(5)',
        seeders: 'td:nth-child(6)'
      }
    }

    const doc = createDoc(`
      <table id="topic_list">
        <tbody>
          <tr>
            <td>今天</td>
            <td>動畫</td>
            <td class="title">
              <span class="tag"><a href="/topics/list/team_id/1">TeamName</a></span>
              <a href="/topics/view/710000_foo.html" target="_blank">Real Title</a>
            </td>
            <td align="center">
              <a class="download-arrow arrow-magnet" href="magnet:?xt=urn:btih:aaa&dn=Real%20Title">m</a>
            </td>
            <td align="center">520.4MB</td>
            <td align="center"><span class="btl_1">12</span></td>
            <td align="center"><span class="bts_1">999</span></td>
            <td align="center">-</td>
            <td>uploader</td>
          </tr>
        </tbody>
      </table>
    `)

    const links = scanByRuleDefinition(doc, { host: 'dmhy.org', url: 'https://dmhy.org/' }, rule)
    expect(links).toHaveLength(1)
    expect(links[0].title).toBe('Real Title')
    expect(links[0].size).toBe('520.4MB')
    expect(links[0].seeders).toBe(12)
  })
})
