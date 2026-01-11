import type { LinkItem, SiteRuleDefinition } from '../../shared/types'
import { buildLinkItem, getMagnetDisplayName, isElementVisible } from './extractors'

export type TitleFallbackStep = 'magnetDn' | 'anchorText' | 'rowText' | 'href'

function normalizeText(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

function pickTitleFromFallback(
  anchor: HTMLAnchorElement,
  rowTitle: string | null,
  extract?: SiteRuleDefinition['extract']
): string {
  const titleAttrValue = extract?.titleAttr ? normalizeText(anchor.getAttribute(extract.titleAttr)) : null
  if (titleAttrValue) {
    return titleAttrValue
  }

  const fallback: TitleFallbackStep[] =
    extract?.titleFallback?.length
      ? extract.titleFallback
      : (['magnetDn', 'anchorText', 'rowText', 'href'] satisfies TitleFallbackStep[])

  for (const step of fallback) {
    if (step === 'magnetDn') {
      const magnetName = getMagnetDisplayName(anchor.href)
      if (magnetName) {
        return magnetName
      }
    } else if (step === 'anchorText') {
      if (rowTitle) {
        return rowTitle
      }
      const text = normalizeText(anchor.textContent)
      if (text) {
        return text
      }
    } else if (step === 'rowText') {
      const parentText = normalizeText(anchor.closest('tr, li, div')?.textContent)
      if (parentText) {
        return parentText.replace(/\s+/g, ' ')
      }
    } else if (step === 'href') {
      return anchor.href
    }
  }

  return anchor.href
}

function parseNumber(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined
  }
  const parsed = parseInt(value.trim(), 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseSizeText(value: string | null | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

function extractRowStats(row: HTMLElement, selectors: SiteRuleDefinition['selectors']): Partial<LinkItem> {
  const seeders = selectors.seeders
    ? parseNumber(row.querySelector<HTMLElement>(selectors.seeders)?.textContent)
    : undefined
  const leechers = selectors.leechers
    ? parseNumber(row.querySelector<HTMLElement>(selectors.leechers)?.textContent)
    : undefined
  const size = selectors.size ? parseSizeText(row.querySelector<HTMLElement>(selectors.size)?.textContent) : undefined

  return { seeders, leechers, size }
}

export type RowLinkGroup = {
  element: HTMLElement
  index: number
  links: LinkItem[]
}

export function collectLinksFromRows(params: {
  rows: HTMLElement[]
  sourceHost: string
  linkSelector: string
  titleSelector?: string
  extract?: SiteRuleDefinition['extract']
  rowStatsSelectors?: SiteRuleDefinition['selectors']
}): { links: LinkItem[]; groups: RowLinkGroup[] } {
  const { rows, sourceHost, linkSelector, titleSelector, extract, rowStatsSelectors } = params

  const dedupe = new Map<string, LinkItem>()
  const groups: RowLinkGroup[] = []

  rows.forEach((row, index) => {
    if (!isElementVisible(row)) {
      return
    }

    const anchors = Array.from(row.querySelectorAll<HTMLAnchorElement>(linkSelector))
    if (!anchors.length) {
      return
    }

    const rowTitle = titleSelector
      ? normalizeText(row.querySelector<HTMLElement>(titleSelector)?.textContent)
      : null
    const rowExtra = rowStatsSelectors ? extractRowStats(row, rowStatsSelectors) : {}

    const rowLinks: LinkItem[] = []
    anchors.forEach(anchor => {
      if (!isElementVisible(anchor)) {
        return
      }

      const href = anchor.href
      if (!href) {
        return
      }

      if (!dedupe.has(href)) {
        const title = pickTitleFromFallback(anchor, rowTitle, extract)
        dedupe.set(href, buildLinkItem(href, title, sourceHost, rowExtra))
      }

      const link = dedupe.get(href)
      if (link) {
        rowLinks.push(link)
      }
    })

    if (!rowLinks.length) {
      return
    }

    groups.push({ element: row, index, links: rowLinks })
  })

  return { links: Array.from(dedupe.values()), groups }
}

export function collectLinksFromDocument(params: {
  doc: Document
  sourceHost: string
  linkSelector: string
  titleSelector?: string
  extract?: SiteRuleDefinition['extract']
}): LinkItem[] {
  const { doc, sourceHost, linkSelector, titleSelector, extract } = params

  const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>(linkSelector))
  const dedupe = new Map<string, LinkItem>()

  const rowTitle = titleSelector ? normalizeText(doc.querySelector<HTMLElement>(titleSelector)?.textContent) : null

  anchors.forEach(anchor => {
    if (!isElementVisible(anchor)) {
      return
    }
    const href = anchor.href
    if (!href || dedupe.has(href)) {
      return
    }

    const title = pickTitleFromFallback(anchor, rowTitle, extract)
    dedupe.set(href, buildLinkItem(href, title, sourceHost))
  })

  return Array.from(dedupe.values())
}

