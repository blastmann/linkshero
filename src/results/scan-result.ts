import type { LinkItem } from '../shared/types'

export interface LastScanResult {
  createdAt: number
  tabId?: number
  tabUrl?: string
  count?: number
  links: LinkItem[]
}

export function parseLastScanResult(value: unknown): LastScanResult | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const v = value as Partial<LastScanResult>
  if (!Array.isArray(v.links)) {
    return null
  }
  const createdAt = typeof v.createdAt === 'number' ? v.createdAt : Date.now()
  const links = v.links.filter(
    item =>
      item &&
      typeof item === 'object' &&
      typeof (item as LinkItem).url === 'string' &&
      typeof (item as LinkItem).title === 'string'
  ) as LinkItem[]

  return {
    createdAt,
    tabId: typeof v.tabId === 'number' ? v.tabId : undefined,
    tabUrl: typeof v.tabUrl === 'string' ? v.tabUrl : undefined,
    count: typeof v.count === 'number' ? v.count : links.length,
    links
  }
}

