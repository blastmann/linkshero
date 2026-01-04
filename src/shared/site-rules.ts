import { STORAGE_KEYS } from './constants'
import type { SiteRuleDefinition } from './types'

const presetRules: SiteRuleDefinition[] = [
  {
    id: 'preset-nyaa',
    name: 'Nyaa (列表页)',
    enabled: true,
    mode: 'row',
    match: {
      hostSuffix: ['nyaa.si'],
      pathRegex: '^/'
    },
    selectors: {
      row: 'table tbody tr',
      link: 'a[href^="magnet:"]',
      title: 'td:nth-child(2) a'
    }
  },
  {
    id: 'preset-yts',
    name: 'YTS (详情页)',
    enabled: true,
    mode: 'page',
    match: {
      hostSuffix: ['yts.mx', 'yts.lt'],
      pathRegex: '/movies/'
    },
    selectors: {
      link: 'a[href^="magnet:"]',
      title: 'h1'
    }
  },
  {
    id: 'preset-eztv',
    name: 'EZTV (列表页)',
    enabled: true,
    mode: 'row',
    match: {
      hostSuffix: ['eztv.re', 'eztv.wf'],
      pathRegex: '^/'
    },
    selectors: {
      row: 'table tr.forum_header_border',
      link: 'a[href^="magnet:"]',
      title: 'td:nth-child(2) a'
    }
  }
]

function withStorage<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return Promise.resolve(fn())
  } catch (error) {
    return Promise.reject(error)
  }
}

export async function getSiteRules(): Promise<SiteRuleDefinition[]> {
  if (!chrome?.storage?.sync) {
    return []
  }

  return withStorage(
    () =>
      new Promise<SiteRuleDefinition[]>((resolve, reject) => {
        chrome.storage.sync.get([STORAGE_KEYS.siteRules], result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve((result[STORAGE_KEYS.siteRules] as SiteRuleDefinition[]) ?? [])
        })
      })
  )
}

export async function saveSiteRule(rule: SiteRuleDefinition): Promise<void> {
  if (!chrome?.storage?.sync) {
    return
  }

  const rules = await getSiteRules()
  const existingIndex = rules.findIndex(item => item.id === rule.id)
  if (existingIndex >= 0) {
    rules[existingIndex] = rule
  } else {
    rules.push(rule)
  }

  return withStorage(
    () =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ [STORAGE_KEYS.siteRules]: rules }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        })
      })
  )
}

export async function deleteSiteRule(id: string): Promise<void> {
  if (!chrome?.storage?.sync) {
    return
  }

  const rules = await getSiteRules()
  const next = rules.filter(rule => rule.id !== id)

  return withStorage(
    () =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ [STORAGE_KEYS.siteRules]: next }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        })
      })
  )
}

export function getPresetSiteRules(): SiteRuleDefinition[] {
  return presetRules.map(rule => ({ ...rule, selectors: { ...rule.selectors } }))
}
