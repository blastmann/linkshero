import type { LinkItem, SiteRuleDefinition } from '../../shared/types'
import { scanByRuleDefinition, type ScanContext } from './rules'

export async function scanByFollowingDetailPages(params: {
  doc: Document
  context: ScanContext
  follow: NonNullable<SiteRuleDefinition['follow']>
  fetchFn?: typeof fetch
}): Promise<LinkItem[]> {
  const { doc, context, follow } = params
  const fetchFn = params.fetchFn ?? fetch

  const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>(follow.hrefSelector))
  const urls = Array.from(
    new Set(
      anchors
        .map(anchor => anchor.href)
        .map(href => href?.trim())
        .filter(Boolean)
    )
  ).slice(0, Math.max(0, follow.limit ?? 30))

  const results: LinkItem[] = []
  const concurrency = 5

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(async url => {
        const response = await fetchFn(url, { credentials: 'include' })
        if (!response.ok) {
          throw new Error(`fetch ${url} failed: ${response.status}`)
        }
        const html = await response.text()
        const detailDoc = new DOMParser().parseFromString(html, 'text/html')
        return scanByRuleDefinition(detailDoc, { host: context.host, url }, follow.detailRule as SiteRuleDefinition)
      })
    )

    batchResults.forEach(item => {
      if (item.status === 'fulfilled') {
        results.push(...item.value)
      }
    })
  }

  // 这里不做复杂聚合：外层调用者会再走 aggregateDefault 或其它聚合器
  return results
}

