import type { LinkItem } from './types'

const DOWNLOAD_EXTENSIONS = [
  '.torrent',
  '.zip',
  '.rar',
  '.7z',
  '.gz',
  '.bz2',
  '.xz',
  '.iso',
  '.apk',
  '.exe',
  '.dmg',
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.mp3',
  '.flac',
  '.pdf',
  '.epub',
  '.srt',
  '.ass'
]

const DOWNLOAD_QUERY_KEYS = ['download', 'dl', 'file', 'filename', 'attachment']
const TRAILING_NOISE_RE = /[),.;!?'"`]+$/
const URL_RE = /https?:\/\/[^\s<>"']+/gi
const MAGNET_RE = /magnet:\?[^\s<>"']+/gi

function trimNoise(input: string): string {
  return input.trim().replace(TRAILING_NOISE_RE, '')
}

function toHost(inputUrl: string): string {
  try {
    return new URL(inputUrl).hostname || 'clipboard'
  } catch {
    return 'clipboard'
  }
}

function getMagnetName(url: string): string | null {
  if (!url.startsWith('magnet:')) {
    return null
  }
  try {
    const value = new URL(url).searchParams.get('dn')
    return value ? decodeURIComponent(value) : null
  } catch {
    return null
  }
}

function isLikelyDownloadHttpUrl(input: string): boolean {
  try {
    const url = new URL(input)
    const path = url.pathname.toLowerCase()
    if (DOWNLOAD_EXTENSIONS.some(ext => path.endsWith(ext))) {
      return true
    }
    return DOWNLOAD_QUERY_KEYS.some(key => url.searchParams.has(key))
  } catch {
    return false
  }
}

function buildTitle(url: string): string {
  const magnetName = getMagnetName(url)
  if (magnetName) {
    return magnetName
  }
  try {
    const parsed = new URL(url)
    const lastSegment = parsed.pathname.split('/').filter(Boolean).at(-1)
    if (lastSegment) {
      return decodeURIComponent(lastSegment)
    }
    return parsed.hostname || url
  } catch {
    return url
  }
}

export function extractLinksFromClipboardText(input: string, sourceHost?: string): LinkItem[] {
  if (!input?.trim()) {
    return []
  }

  const candidates = new Set<string>()
  const magnets = input.match(MAGNET_RE) ?? []
  const urls = input.match(URL_RE) ?? []

  magnets.map(trimNoise).filter(Boolean).forEach(url => candidates.add(url))
  urls
    .map(trimNoise)
    .filter(url => isLikelyDownloadHttpUrl(url))
    .forEach(url => candidates.add(url))

  return Array.from(candidates).map(url => ({
    id: crypto.randomUUID(),
    url,
    title: buildTitle(url),
    sourceHost: sourceHost || toHost(url),
    selected: true
  }))
}
