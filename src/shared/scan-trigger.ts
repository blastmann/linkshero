import type { LinkItem, ScanResponse, SiteRuleDefinition } from './types'
import { SCAN_MESSAGE } from './messages'

export interface ActiveTabInfo {
  id: number
  url?: string
}

export interface ChromeScanDeps {
  tabs: Pick<typeof chrome.tabs, 'query' | 'sendMessage'>
  scripting: Pick<typeof chrome.scripting, 'executeScript'>
  webNavigation: Pick<typeof chrome.webNavigation, 'getAllFrames'>
  runtime: Pick<typeof chrome.runtime, 'getURL' | 'lastError'>
}

const DEFAULT_DEPS: ChromeScanDeps | null =
  typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting && chrome.webNavigation && chrome.runtime
    ? {
        tabs: chrome.tabs,
        scripting: chrome.scripting,
        webNavigation: chrome.webNavigation,
        runtime: chrome.runtime
      }
    : null

export function isInjectableUrl(url?: string | null): boolean {
  if (!url) {
    return true
  }
  return /^(https?|file|ftp):/i.test(url)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export async function queryActiveTab(deps: ChromeScanDeps = DEFAULT_DEPS as ChromeScanDeps): Promise<ActiveTabInfo> {
  return new Promise((resolve, reject) => {
    deps.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0]
      if (tab?.id !== undefined) {
        resolve({ id: tab.id, url: tab.url })
        return
      }
      reject(new Error('无法获取当前标签页'))
    })
  })
}

export async function injectScanner(
  tabId: number,
  frameIds?: number[],
  deps: ChromeScanDeps = DEFAULT_DEPS as ChromeScanDeps
): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = frameIds && frameIds.length ? { tabId, frameIds } : { tabId, allFrames: true }
    deps.scripting.executeScript(
      {
        target,
        world: 'ISOLATED',
        injectImmediately: true,
        func: async () => {
          const url = chrome.runtime.getURL('content.js')
          await import(url)
          return true
        }
      },
      () => {
        const err = deps.runtime.lastError
        if (err && !err.message?.includes('Cannot access a chrome:// URL')) {
          reject(new Error(err.message))
          return
        }
        resolve()
      }
    )
  })
}

async function sendScanMessage(
  tabId: number,
  frameId: number,
  rules: SiteRuleDefinition[],
  deps: ChromeScanDeps
): Promise<ScanResponse> {
  return new Promise((resolve, reject) => {
    deps.tabs.sendMessage(tabId, { type: SCAN_MESSAGE, rules }, { frameId }, response => {
      const err = deps.runtime.lastError
      if (err) {
        reject(new Error(err.message))
        return
      }
      resolve(response as ScanResponse)
    })
  })
}

export async function requestScan(
  tabId: number,
  rules: SiteRuleDefinition[],
  deps: ChromeScanDeps = DEFAULT_DEPS as ChromeScanDeps
): Promise<LinkItem[]> {
  const framesResult = await deps.webNavigation
    .getAllFrames({ tabId })
    .catch(() => undefined as chrome.webNavigation.GetAllFrameDetails[] | undefined)
  const frames = Array.isArray(framesResult) ? framesResult : []
  const targets = frames.length
    ? frames.map(frame => (frame as chrome.webNavigation.GetAllFrameDetails & { frameId?: number }).frameId ?? 0)
    : [0]

  const results = await Promise.allSettled(
    targets.map(frameId =>
      sendScanMessage(tabId, frameId, rules, deps).catch(async error => {
        const message = getErrorMessage(error)
        if (message.includes('Receiving end does not exist')) {
          await injectScanner(tabId, [frameId], deps)
          return sendScanMessage(tabId, frameId, rules, deps)
        }
        throw error
      })
    )
  )

  const dedupe = new Set<string>()
  const links: LinkItem[] = []

  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value.success && result.value.links) {
      result.value.links.forEach(link => {
        if (!dedupe.has(link.url)) {
          dedupe.add(link.url)
          links.push(link)
        }
      })
    }
  })

  if (!links.length) {
    const rejected = results.find(r => r.status === 'rejected')
    if (rejected && rejected.status === 'rejected') {
      throw rejected.reason
    }
  }

  return links
}

