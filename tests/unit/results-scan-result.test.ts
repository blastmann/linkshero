import { describe, expect, it } from 'vitest'
import { parseLastScanResult } from '../../src/results/scan-result'

describe('results parseLastScanResult', () => {
  it('returns null for invalid payloads', () => {
    expect(parseLastScanResult(null)).toBeNull()
    expect(parseLastScanResult({})).toBeNull()
    expect(parseLastScanResult({ links: 'nope' })).toBeNull()
  })

  it('normalizes partial payload and infers count', () => {
    const parsed = parseLastScanResult({
      createdAt: 123,
      tabId: 10,
      tabUrl: 'https://example.com/',
      links: [
        { id: '1', url: 'magnet:?a', title: 'A', sourceHost: 'example.com' },
        { id: '2', url: 'magnet:?b', title: 'B', sourceHost: 'example.com' }
      ]
    })!

    expect(parsed.createdAt).toBe(123)
    expect(parsed.tabId).toBe(10)
    expect(parsed.tabUrl).toBe('https://example.com/')
    expect(parsed.count).toBe(2)
    expect(parsed.links).toHaveLength(2)
  })
})

