import type { LinkItem, SiteRuleDefinition } from '../../shared/types'
import { isPirateBayHost } from '../piratebay-helpers'
import { aggregateDefault, aggregatePirateBay, type LinkAggregator } from './aggregators'
import {
  GENERIC_LINK_SELECTORS,
  LINK_SELECTORS,
  buildLinkItem,
  extractPirateBayStatsFromRow,
  extractPirateDisplayTitle,
  extractTitleFromAnchor,
  isElementVisible,
  isLikelyValidHttpDownload,
  normalizeHttpUrl
} from './extractors'
import { collectLinksFromDocument, collectLinksFromRows } from './scan-core'

export interface ScanContext {
  host: string
  url: string
}

export interface ScanRule {
  id: string
  name: string
  match: (context: ScanContext) => boolean
  scan: (doc: Document, context: ScanContext) => LinkItem[]
  aggregate?: LinkAggregator
  sourceDefinition?: SiteRuleDefinition
}

function matchDefinition(match: SiteRuleDefinition['match'], context: ScanContext): boolean {
  const hostMatched =
    !match.hostSuffix?.length || match.hostSuffix.some(suffix => context.host.endsWith(suffix))
  const path = (() => {
    try {
      return context.url ? new URL(context.url).pathname : ''
    } catch {
      return ''
    }
  })()
  const pathMatched = match.pathRegex ? new RegExp(match.pathRegex).test(path) : true
  return hostMatched && pathMatched
}

const scanAnchors = (
  doc: Document,
  selector: string,
  extractor: (anchor: HTMLAnchorElement) => LinkItem | null
): LinkItem[] => {
  const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>(selector))
  const dedupe = new Map<string, LinkItem>()

  anchors.forEach(anchor => {
    if (!isElementVisible(anchor)) {
      return
    }

    const link = extractor(anchor)
    if (!link) {
      return
    }

    if (!link.url || dedupe.has(link.url)) {
      return
    }
    dedupe.set(link.url, link)
  })

  return Array.from(dedupe.values())
}

const pirateBayRule: ScanRule = {
  id: 'piratebay',
  name: 'PirateBay',
  match: ({ host }) => isPirateBayHost(host),
  aggregate: aggregatePirateBay,
  scan: (doc, context) =>
    scanAnchors(doc, LINK_SELECTORS, anchor => {
      const title =
        extractTitleFromAnchor(anchor, {
          rowTitle: extractPirateDisplayTitle(anchor)
        }) ?? anchor.href
      const row = anchor.closest('tr, li.list-entry')
      const stats = extractPirateBayStatsFromRow(row)
      return buildLinkItem(anchor.href, title, context.host, stats)
    })
}

const genericRule: ScanRule = {
  id: 'generic',
  name: 'Generic',
  match: () => true,
  aggregate: aggregateDefault,
  scan: (doc, context) =>
    scanAnchors(doc, GENERIC_LINK_SELECTORS, anchor => {
      let href = anchor.href
      if (!href) {
        return null
      }
      if (/^https?:/i.test(href)) {
        if (!isLikelyValidHttpDownload(anchor)) {
          return null
        }
        href = normalizeHttpUrl(href)
      }
      const title = extractTitleFromAnchor(anchor)
      return buildLinkItem(href, title, context.host)
    })
}

export const defaultRules: ScanRule[] = [pirateBayRule, genericRule]

export function scanByRuleDefinition(
  doc: Document,
  context: ScanContext,
  rule: SiteRuleDefinition
): LinkItem[] {
  if (rule.mode === 'row') {
    if (!rule.selectors.row) {
      return []
    }

    const rows = Array.from(doc.querySelectorAll<HTMLElement>(rule.selectors.row))
    return collectLinksFromRows({
      rows,
      sourceHost: context.host,
      linkSelector: rule.selectors.link,
      titleSelector: rule.selectors.title,
      extract: rule.extract,
      rowStatsSelectors: rule.selectors
    }).links
  }

  return collectLinksFromDocument({
    doc,
    sourceHost: context.host,
    linkSelector: rule.selectors.link,
    titleSelector: rule.selectors.title,
    extract: rule.extract
  })
}

export function resolveRule(
  context: ScanContext,
  customRules: SiteRuleDefinition[] = [],
  rules = defaultRules
): ScanRule {
  const enabledCustom = customRules.filter(rule => rule.enabled)
  for (const rule of enabledCustom) {
    if (matchDefinition(rule.match, context)) {
      return {
        id: `custom:${rule.id}`,
        name: rule.name,
        match: () => true,
        aggregate: aggregateDefault,
        scan: (doc, ctx) => scanByRuleDefinition(doc, ctx, rule),
        sourceDefinition: rule
      }
    }
  }

  return rules.find(rule => rule.match(context)) ?? genericRule
}
