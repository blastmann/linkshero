import { SCAN_MESSAGE } from '../shared/messages'
import type { LinkItem, SiteRuleDefinition } from '../shared/types'
import { resolveRule } from './scanner/rules'
import { scanByFollowingDetailPages } from './scanner/scan-follow'

declare global {
  interface Window {
    __linksHeroContentLoaded?: boolean
    __linksHeroScannerInjected?: boolean
  }
}

(() => {
  if ((window as Window).__linksHeroContentLoaded) {
    console.debug('[Links Hero] content script already loaded, skip duplicate injection')
    return
  }
  ;(window as Window).__linksHeroContentLoaded = true

const SCAN_FLAG = '__linksHeroScannerInjected'

  function logDebug(...args: unknown[]) {
    if (typeof console !== 'undefined') {
      console.debug('[Links Hero]', ...args)
    }
  }

async function scanDefaultLinks(rules: SiteRuleDefinition[] = []): Promise<LinkItem[]> {
  const context = { host: window.location.hostname, url: window.location.href }
  const rule = resolveRule(context, rules)
  logDebug('scanDefaultLinks:start', { sourceHost: context.host, rule: rule.id })

  let links: LinkItem[]
  if (rule.sourceDefinition?.follow) {
    links = await scanByFollowingDetailPages({
      doc: document,
      context,
      follow: rule.sourceDefinition.follow
    })
  } else {
    links = rule.scan(document, context)
  }
  if (rule.aggregate) {
    links = rule.aggregate(links)
  }

  logDebug('scanDefaultLinks:end', { uniqueCount: links.length, rule: rule.id })
  return links
}

function setupListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === SCAN_MESSAGE) {
      void (async () => {
        try {
          const links = await scanDefaultLinks((message as { rules?: SiteRuleDefinition[] }).rules ?? [])
          sendResponse({ success: true, links })
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })()
      return true
    }

    return undefined
  })
}

if (!(window as Window)[SCAN_FLAG]) {
  ;(window as Window)[SCAN_FLAG] = true
  setupListener()
}

})()

