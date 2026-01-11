import { describe, expect, it } from 'vitest'
import { getLinkKind } from '../../src/shared/link-kind'

describe('getLinkKind', () => {
  it('detects magnet', () => {
    expect(getLinkKind('magnet:?xt=urn:btih:aaa')).toBe('magnet')
  })

  it('detects torrent url', () => {
    expect(getLinkKind('https://example.com/a.torrent')).toBe('torrent')
  })

  it('detects http', () => {
    expect(getLinkKind('https://example.com/file.mp4')).toBe('http')
  })

  it('detects other', () => {
    expect(getLinkKind('javascript:alert(1)')).toBe('other')
  })
})

