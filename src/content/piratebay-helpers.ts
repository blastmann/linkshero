export const PIRATE_BAY_HOST_REGEX = /(?:thepiratebay|piratebay|tpb)/i

export type PirateComparable = {
  title: string
  normalizedTitle?: string
  seeders?: number
  leechers?: number
}

const RELEASE_TAG_REGEX =
  /\b(480p|720p|1080p|2160p|4k|hevc|x265|x264|h\.?264|av1|10bit|webrip|webdl|web-dl|bluray|brrip|hdrip|hdr|remux|aac|ddp\d+|dolby|hdr10)\b/g

export function normalizeTitleValue(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\[\](){}]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(RELEASE_TAG_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isPirateBayHost(host = window.location.hostname): boolean {
  return PIRATE_BAY_HOST_REGEX.test(host)
}

export function shouldPrioritizePirateLink<T extends PirateComparable>(
  existing: T,
  candidate: T
): boolean {
  const existingSeeds = existing.seeders ?? -1
  const candidateSeeds = candidate.seeders ?? -1
  if (candidateSeeds !== existingSeeds) {
    return candidateSeeds > existingSeeds
  }

  const existingLeech = existing.leechers ?? Number.MAX_SAFE_INTEGER
  const candidateLeech = candidate.leechers ?? Number.MAX_SAFE_INTEGER
  if (candidateLeech !== existingLeech) {
    return candidateLeech < existingLeech
  }

  return candidate.title.length < existing.title.length
}

export function sortPirateLinks<T extends PirateComparable>(links: T[]): T[] {
  return [...links].sort((a, b) => {
    const seedA = a.seeders ?? -1
    const seedB = b.seeders ?? -1
    if (seedB !== seedA) {
      return seedB - seedA
    }
    const leechA = a.leechers ?? Number.MAX_SAFE_INTEGER
    const leechB = b.leechers ?? Number.MAX_SAFE_INTEGER
    if (leechA !== leechB) {
      return leechA - leechB
    }
    return a.title.localeCompare(b.title)
  })
}

export function dedupePirateBayLinks<T extends PirateComparable>(links: T[]): T[] {
  const grouped = new Map<string, T>()
  const withoutKey: T[] = []

  links.forEach(link => {
    const key = link.normalizedTitle
    if (!key) {
      withoutKey.push(link)
      return
    }

    const existing = grouped.get(key)
    if (!existing || shouldPrioritizePirateLink(existing, link)) {
      grouped.set(key, link)
    }
  })

  const prioritized = sortPirateLinks(Array.from(grouped.values()))
  return [...prioritized, ...withoutKey]
}

