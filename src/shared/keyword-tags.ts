const KEYWORD_SPLIT_REGEX = /[,，\n]/

export function splitKeywords(value: string): string[] {
  return value
    .split(KEYWORD_SPLIT_REGEX)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

export function addKeywords(existing: string[], input: string): string[] {
  const next = [...existing]
  const seen = new Set(existing.map(k => k.toLowerCase()))
  splitKeywords(input).forEach(keyword => {
    if (seen.has(keyword)) {
      return
    }
    seen.add(keyword)
    next.push(keyword)
  })
  return next
}

