import type { LinkItem } from '../../shared/types'
import { normalizeTitleValue } from '../piratebay-helpers'

export const LINK_SELECTORS = 'a[href^="magnet:"],a[href$=".torrent"]'

export function isElementVisible(element: Element | null): boolean {
  if (!element || !(element instanceof HTMLElement)) {
    return false
  }

  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function getMagnetDisplayName(href: string): string | null {
  if (!href.startsWith('magnet:')) {
    return null
  }
  try {
    const magnetUrl = new URL(href)
    const dn = magnetUrl.searchParams.get('dn')
    return dn ? decodeURIComponent(dn) : null
  } catch {
    return null
  }
}

export function extractPirateDisplayTitle(anchor: HTMLAnchorElement): string | null {
  const row = anchor.closest('tr')
  if (!row) {
    return null
  }
  const detName = row.querySelector('.detName a')
  const text = detName?.textContent?.trim()
  if (text) {
    return text
  }
  return null
}

export function extractTitleFromAnchor(
  anchor: HTMLAnchorElement,
  options: { rowTitle?: string | null } = {}
): string {
  const magnetName = getMagnetDisplayName(anchor.href)
  if (magnetName) {
    return magnetName
  }

  if (options.rowTitle) {
    return options.rowTitle
  }

  const text = anchor.textContent?.trim()
  if (text) {
    return text
  }

  const parentText = anchor.closest('tr, li, div')?.textContent?.trim()
  if (parentText) {
    return parentText.replace(/\s+/g, ' ')
  }

  return anchor.href
}

export function extractPirateBayStatsFromRow(
  row: Element | null
): { seeders?: number; leechers?: number } {
  if (!row) {
    return {}
  }

  const parseValue = (selectors: string[]) => {
    for (const selector of selectors) {
      const cell = row.querySelector<HTMLElement>(selector)
      if (!cell) {
        continue
      }
      const value = parseInt(cell.textContent?.trim() ?? '', 10)
      if (Number.isFinite(value)) {
        return value
      }
    }
    return undefined
  }

  const seeders = parseValue(['.item-seed', 'td:nth-of-type(4)', 'td[align="right"]:nth-of-type(1)'])
  const leechers = parseValue(['.item-leech', 'td:nth-of-type(5)', 'td[align="right"]:nth-of-type(2)'])

  return { seeders, leechers }
}

export function buildLinkItem(
  href: string,
  title: string,
  sourceHost: string,
  extra: Partial<LinkItem> = {}
): LinkItem {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    url: href,
    title,
    sourceHost,
    normalizedTitle: normalizeTitleValue(title),
    ...extra
  }
}
