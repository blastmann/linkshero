import type { LinkItem } from '../../shared/types'
import { dedupePirateBayLinks } from '../piratebay-helpers'

export type LinkAggregator = (links: LinkItem[]) => LinkItem[]

export const aggregateDefault: LinkAggregator = links => {
  const dedupe = new Map<string, LinkItem>()
  links.forEach(link => {
    if (!dedupe.has(link.url)) {
      dedupe.set(link.url, link)
    }
  })
  return Array.from(dedupe.values())
}

export const aggregatePirateBay: LinkAggregator = links => dedupePirateBayLinks(links)
