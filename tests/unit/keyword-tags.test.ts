import { describe, expect, it } from 'vitest'
import { addKeywords, splitKeywords } from '../../src/shared/keyword-tags'

describe('keyword-tags', () => {
  it('splitKeywords supports comma and Chinese comma', () => {
    expect(splitKeywords('A, b，C')).toEqual(['a', 'b', 'c'])
  })

  it('addKeywords dedupes and lowercases', () => {
    expect(addKeywords(['a'], 'A,b')).toEqual(['a', 'b'])
  })
})

