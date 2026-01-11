export type LinkKind = 'magnet' | 'torrent' | 'http' | 'other'

export function getLinkKind(url: string): LinkKind {
  const value = (url || '').trim().toLowerCase()
  if (value.startsWith('magnet:')) {
    return 'magnet'
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    if (value.includes('.torrent') || value.endsWith('.torrent')) {
      return 'torrent'
    }
    return 'http'
  }
  return 'other'
}

