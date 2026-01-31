import { STORAGE_KEYS } from '../shared/constants'
import { getSiteRules } from '../shared/site-rules'
import { injectScanner, isInjectableUrl, queryActiveTab, requestScan } from '../shared/scan-trigger'
import { fetchLocaleMessages, resolveLanguage } from '../shared/i18n'
import { getGeneralConfig } from '../shared/storage'

export const CONTEXT_MENU_ID = 'links-hero/scan-valid-links'

let cachedMessages: Record<string, { message: string }> | null = null

async function updateI18nState() {
  const config = await getGeneralConfig()
  if (config.language !== 'auto') {
    cachedMessages = await fetchLocaleMessages(resolveLanguage(config.language))
  } else {
    cachedMessages = null
  }
}

// Simple translation helper for background script
function tBg(key: string): string {
  if (cachedMessages && cachedMessages[key]) {
    return cachedMessages[key].message
  }
  return chrome.i18n.getMessage(key)
}


export interface ContextMenuDeps {
  chrome: Pick<typeof chrome, 'contextMenus' | 'runtime' | 'tabs' | 'storage' | 'notifications'>
  getSiteRulesFn?: typeof getSiteRules
  injectScannerFn?: typeof injectScanner
  requestScanFn?: typeof requestScan
  queryActiveTabFn?: typeof queryActiveTab
  isInjectableUrlFn?: typeof isInjectableUrl
}

function getDeps(partial?: ContextMenuDeps): Required<ContextMenuDeps> {
  return {
    chrome: (partial?.chrome ?? chrome) as any,
    getSiteRulesFn: partial?.getSiteRulesFn ?? getSiteRules,
    injectScannerFn: partial?.injectScannerFn ?? injectScanner,
    requestScanFn: partial?.requestScanFn ?? requestScan,
    queryActiveTabFn: partial?.queryActiveTabFn ?? queryActiveTab,
    isInjectableUrlFn: partial?.isInjectableUrlFn ?? isInjectableUrl
  }
}

export function ensureContextMenu(deps?: ContextMenuDeps) {
  const { chrome: chromeApi } = getDeps(deps)

  // Ensure state is loaded
  updateI18nState().then(() => {
    chromeApi.contextMenus.removeAll(() => {
      chromeApi.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: tBg('ctxMenuTitle'),
        contexts: ['page', 'frame', 'selection', 'link']
      })
    })
  })

  // Basic listener for updates (simplified)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[STORAGE_KEYS.generalConfig]) {
      updateI18nState().then(() => {
        chromeApi.contextMenus.update(CONTEXT_MENU_ID, {
          title: tBg('ctxMenuTitle')
        })
      })
    }
  })
}

export async function runScanFromContextMenu(
  tabId?: number,
  tabUrl?: string,
  deps?: ContextMenuDeps
) {
  const {
    chrome: chromeApi,
    getSiteRulesFn,
    injectScannerFn,
    requestScanFn,
    queryActiveTabFn,
    isInjectableUrlFn
  } = getDeps(deps)

  if (tabId === undefined) {
    const tab = await queryActiveTabFn()
    tabId = tab.id
    tabUrl = tab.url
  }
  if (!isInjectableUrlFn(tabUrl)) {
    throw new Error(tBg('errorInject'))
  }

  const rules = await getSiteRulesFn().catch(() => [])
  await injectScannerFn(tabId)
  const links = await requestScanFn(tabId, rules)
  if (!links.length) {
    throw new Error(tBg('errorNoLinks'))
  }

  await chromeApi.storage.session.set({
    [STORAGE_KEYS.lastScanResult]: {
      createdAt: Date.now(),
      tabId,
      tabUrl,
      count: links.length,
      links
    }
  })

  await chromeApi.tabs.create({ url: chromeApi.runtime.getURL('results.html') })
}

export function handleContextMenuClick(deps?: ContextMenuDeps) {
  const { chrome: chromeApi } = getDeps(deps)

  chromeApi.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) {
      return
    }
    void runScanFromContextMenu(tab?.id, tab?.url, deps).catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[Links Hero] context menu scan failed:', message)
      chromeApi.notifications?.create?.({
        type: 'basic',
        iconUrl: 'vite.svg',
        title: 'Links Hero',
        message
      })
    })
  })
}

