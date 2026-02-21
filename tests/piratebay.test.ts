import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { dedupePirateBayLinks, normalizeTitleValue } from '../src/content/piratebay-helpers'

type TestLink = {
  id: string
  title: string
  url: string
  sourceHost: string
  normalizedTitle?: string
  seeders?: number
  leechers?: number
}

function parseFixture(): TestLink[] {
  const filePath = path.resolve(__dirname, './fixtures/piratebay-titles.txt')
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const records: TestLink[] = []
  for (let i = 0; i < lines.length; i += 3) {
    const title = lines[i + 1]
    const stats = lines[i + 2]
    if (!title || !stats) {
      continue
    }

    const parts = stats.split(/\s+/)
    const seeders = parseInt(parts[parts.length - 3], 10)
    const leechers = parseInt(parts[parts.length - 2], 10)

    records.push({
      id: `${title}-${i}`,
      title,
      url: `magnet:?xt=${i}`,
      sourceHost: 'thepiratebay.org',
      normalizedTitle: normalizeTitleValue(title),
      seeders: Number.isFinite(seeders) ? seeders : undefined,
      leechers: Number.isFinite(leechers) ? leechers : undefined
    })
  }

  return records
}

describe('Pirate Bay dedupe prioritization', () => {
  const dataset = parseFixture()

  it('reduces dataset to unique normalized titles', () => {
    const deduped = dedupePirateBayLinks(dataset)
    const uniqueTitles = new Set(
      dataset.map(item => item.normalizedTitle ?? normalizeTitleValue(item.title))
    )
    expect(deduped.length).toBe(uniqueTitles.size)
  })

  it('keeps entry with highest seeds (and lowest leechers) per title', () => {
    const grouped = new Map<string, { seeders: number; leechers: number }>()
    dataset.forEach(link => {
      const key = link.normalizedTitle ?? normalizeTitleValue(link.title)
      const existing = grouped.get(key)
      const seeds = link.seeders ?? -1
      const leechers = link.leechers ?? Number.MAX_SAFE_INTEGER
      if (
        !existing ||
        seeds > existing.seeders ||
        (seeds === existing.seeders && leechers < existing.leechers)
      ) {
        grouped.set(key, { seeders: seeds, leechers })
      }
    })

    const deduped = dedupePirateBayLinks(dataset)
    deduped.forEach(link => {
      const key = link.normalizedTitle ?? normalizeTitleValue(link.title)
      const expectation = grouped.get(key)
      expect(expectation).toBeTruthy()
      expect(link.seeders ?? -1).toBe(expectation!.seeders)
      expect(link.leechers ?? Number.MAX_SAFE_INTEGER).toBe(expectation!.leechers)
    })
  })
})

