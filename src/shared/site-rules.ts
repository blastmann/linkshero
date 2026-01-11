import { STORAGE_KEYS } from './constants'
import type { SiteRuleDefinition } from './types'

const presetRules: SiteRuleDefinition[] = [
  {
    id: 'preset-mikan',
    name: 'Mikan Project (列表页)',
    enabled: true,
    mode: 'row',
    match: {
      hostSuffix: ['mikanani.me'],
      pathRegex: '^/'
    },
    selectors: {
      row: 'table tbody tr, .mikan-table tbody tr',
      link: 'a[href^="magnet:"],a[href$=".torrent"]',
      title: 'td:nth-child(2) a, a.magnet, a[href$=".torrent"]'
    }
  },
  {
    id: 'preset-dmhy',
    name: '动漫花园 DMHY (列表页)',
    enabled: true,
    mode: 'row',
    match: {
      hostSuffix: ['dmhy.org'],
      pathRegex: '^/'
    },
    selectors: {
      row: '#topic_list tbody tr',
      link: 'a.download-arrow.arrow-magnet[href^="magnet:"]',
      // 注意：td.title 里第一个 <a> 通常是字幕组/团队链接；这里要精确选资源标题链接
      title: 'td.title > a[href^="/topics/view/"]',
      // 列顺序：日期/分类/标题/磁链/大小/種子/下載/完成/發佈人
      size: 'td:nth-child(5)',
      seeders: 'td:nth-child(6)'
    }
  },
  {
    id: 'preset-dmhy-share',
    name: '动漫花园分享 (列表页)',
    enabled: true,
    mode: 'row',
    match: {
      hostSuffix: ['share.dmhy.org'],
      pathRegex: '^/'
    },
    selectors: {
      row: '#topic_list tbody tr',
      link: 'a.download-arrow.arrow-magnet[href^="magnet:"]',
      title: 'td.title > a[href^="/topics/view/"]',
      size: 'td:nth-child(5)',
      seeders: 'td:nth-child(6)'
    }
  },
  {
    id: 'preset-bangumi-moe',
    name: 'Bangumi.moe (页面兜底)',
    enabled: true,
    mode: 'page',
    match: {
      hostSuffix: ['bangumi.moe'],
      pathRegex: '^/'
    },
    selectors: {
      link: 'a[href^="magnet:"],a[href$=".torrent"]',
      title: 'h1'
    }
  },
  {
    id: 'preset-acg-rip',
    name: 'ACG.RIP (列表页)',
    enabled: true,
    mode: 'row',
    match: {
      hostSuffix: ['acg.rip'],
      pathRegex: '^/'
    },
    selectors: {
      row: 'table tbody tr, .table tbody tr',
      link: 'a[href^="magnet:"],a[href$=".torrent"]',
      title: 'td.title a, td:nth-child(2) a, a[href$=".torrent"]'
    }
  },
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
      hostSuffix: ['eztv.re', 'eztv.wf', 'eztv.yt'],
      pathRegex: '^/'
    },
    selectors: {
      row: 'table tr.forum_header_border',
      link: 'a[href^="magnet:"]',
      title: 'td:nth-child(2) a'
    }
  },
  {
    id: 'preset-eztv-home-follow',
    name: 'EZTV (home 列表页跟进详情)',
    enabled: true,
    mode: 'page',
    match: {
      hostSuffix: ['eztv.re', 'eztv.wf', 'eztv.yt'],
      pathRegex: '^/(home)?/?$'
    },
    selectors: {
      // home 列表页通常不直接含 magnet；保留宽泛 selector 以兼容未来变化
      link: 'a[href^="magnet:"],a[href$=".torrent"]'
    },
    follow: {
      hrefSelector: 'a.epinfo[href^="/ep/"]',
      limit: 30,
      detailRule: {
        mode: 'page',
        selectors: {
          link: 'a[href^="magnet:"],a[href$=".torrent"]',
          title: 'h1'
        },
        extract: {
          titleFallback: ['magnetDn', 'anchorText', 'rowText', 'href']
        }
      }
    }
  },
  {
    id: 'preset-1337x',
    name: '1337x (详情页)',
    enabled: true,
    mode: 'page',
    match: {
      hostSuffix: ['1337x.to', '1377x.to'],
      pathRegex: '^/torrent/'
    },
    selectors: {
      link: 'a[href^="magnet:"],a[href$=".torrent"]',
      title: 'h1'
    }
  },
  {
    id: 'preset-1337x-popular-movies',
    name: '1337x/1377x (popular-movies 列表页跟进详情)',
    enabled: true,
    mode: 'page',
    match: {
      hostSuffix: ['1337x.to', '1377x.to'],
      pathRegex: '^/popular-movies/?$'
    },
    selectors: {
      // 本页不直接含 magnet；保留一个宽泛 selector 以兼容未来页面变化
      link: 'a[href^="magnet:"],a[href$=".torrent"]'
    },
    follow: {
      hrefSelector: 'table.table-list a[href^="/torrent/"]',
      limit: 30,
      detailRule: {
        mode: 'page',
        selectors: {
          link: 'a[href^="magnet:"],a[href$=".torrent"]',
          title: 'h1'
        },
        extract: {
          titleFallback: ['magnetDn', 'anchorText', 'rowText', 'href']
        }
      }
    }
  },
  {
    id: 'preset-torrentgalaxy',
    name: 'TorrentGalaxy (详情页)',
    enabled: true,
    mode: 'page',
    match: {
      hostSuffix: ['torrentgalaxy.to'],
      pathRegex: '^/torrent/'
    },
    selectors: {
      link: 'a[href^="magnet:"],a[href$=".torrent"]',
      title: 'h1'
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
