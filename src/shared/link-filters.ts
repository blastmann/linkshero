import type { LinkItem } from './types'

export function buildSearchText(link: LinkItem): string {
  return `${link.title ?? ''} ${link.url ?? ''} ${link.sourceHost ?? ''} ${link.normalizedTitle ?? ''}`.toLowerCase()
}

export function matchesAllKeywords(haystack: string, keywords: string[]): boolean {
  if (!keywords.length) {
    return true
  }
  return keywords.every(keyword => haystack.includes(keyword))
}

export function matchesAnyKeyword(haystack: string, keywords: string[]): boolean {
  if (!keywords.length) {
    return true
  }
  return keywords.some(keyword => haystack.includes(keyword))
}
