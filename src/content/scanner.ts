import { APPLY_TEMPLATE_MESSAGE, CLEAR_TEMPLATE_MESSAGE, PUSH_MESSAGE, SCAN_MESSAGE } from '../shared/messages'
import { DEFAULT_ARIA2_ENDPOINT, STORAGE_KEYS } from '../shared/constants'
import type { Aria2Config, LinkItem, SiteRuleDefinition, TemplateDefinition } from '../shared/types'
import { isElementVisible } from './scanner/extractors'
import { resolveRule } from './scanner/rules'
import { collectLinksFromRows } from './scanner/scan-core'
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

  const defaultConfig: Aria2Config = {
    endpoint: DEFAULT_ARIA2_ENDPOINT
  }

  async function getAria2Config(): Promise<Aria2Config> {
    if (!chrome?.storage?.sync) {
      return defaultConfig
    }

    return new Promise<Aria2Config>((resolve, reject) => {
      chrome.storage.sync.get([STORAGE_KEYS.aria2Config], result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        const stored = (result[STORAGE_KEYS.aria2Config] as Aria2Config | undefined) ?? defaultConfig

        resolve({
          endpoint: stored.endpoint?.trim() || defaultConfig.endpoint,
          token: stored.token?.trim(),
          dir: stored.dir?.trim()
        })
      })
    })
  }

const SCAN_FLAG = '__linksHeroScannerInjected'
const STYLE_ID = 'links-hero-style'

  function logDebug(...args: unknown[]) {
    if (typeof console !== 'undefined') {
      console.debug('[Links Hero]', ...args)
    }
  }

  interface RowState {
    element: HTMLElement
    checkbox: HTMLInputElement
    links: LinkItem[]
    index: number
  }

  interface TemplateRuntime {
    template: TemplateDefinition
    rows: RowState[]
    selected: Set<string>
    toolbar: HTMLDivElement
    links: LinkItem[]
    lastIndex: number | null
    toast?: HTMLDivElement
  }

  let templateRuntime: TemplateRuntime | null = null
  let fallbackToast: HTMLDivElement | null = null
  let toastTimer: number | null = null

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .links-hero-row {
      position: relative;
      padding-left: 32px !important;
    }
    .links-hero-row.links-hero-selected {
      background: rgba(37, 99, 235, 0.08);
    }
    .links-hero-checkbox-container {
      position: absolute;
      left: 8px;
      top: 10px;
      z-index: 2147483646;
    }
    .links-hero-checkbox {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    .links-hero-toolbar {
      position: fixed;
      right: 16px;
      bottom: 24px;
      background: #0f172a;
      color: #fff;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.35);
      font-size: 14px;
      z-index: 2147483647;
      min-width: 240px;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .links-hero-toolbar strong {
      font-size: 16px;
    }
    .links-hero-toolbar-actions {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .links-hero-toolbar button {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .links-hero-toolbar button[data-action="push"] {
      background: #22c55e;
      color: #0f172a;
    }
    .links-hero-toolbar button[data-action="basket"] {
      background: #fbbf24;
      color: #0f172a;
    }
    .links-hero-toast {
      position: fixed;
      right: 16px;
      bottom: 92px;
      background: #fff;
      color: #0f172a;
      padding: 8px 12px;
      border-radius: 6px;
      box-shadow: 0 8px 20px rgba(15,23,42,0.2);
      font-size: 13px;
      z-index: 2147483647;
    }
  `

  document.head.appendChild(style)
}

function matchTemplate(template: TemplateDefinition) {
  const host = window.location.hostname
  const path = window.location.pathname
  const hostMatched =
    !template.match.hostSuffix?.length ||
    template.match.hostSuffix.some(suffix => host.endsWith(suffix))
  const pathMatched = template.match.pathRegex
    ? new RegExp(template.match.pathRegex).test(path)
    : true
  return hostMatched && pathMatched
}

function buildTemplateRows(template: TemplateDefinition): { rows: RowState[]; links: LinkItem[] } {
  const sourceHost = window.location.hostname
  const rowElements = Array.from(document.querySelectorAll<HTMLElement>(template.selectors.row))

  const { links, groups } = collectLinksFromRows({
    rows: rowElements,
    sourceHost,
    linkSelector: template.selectors.link,
    titleSelector: template.selectors.title
  })

  const rows: RowState[] = []
  groups.forEach(group => {
    const element = group.element
    if (!isElementVisible(element)) {
      return
    }

    const checkboxContainer = document.createElement('span')
    checkboxContainer.className = 'links-hero-checkbox-container'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'links-hero-checkbox'
    checkboxContainer.appendChild(checkbox)

    element.classList.add('links-hero-row')
    element.insertBefore(checkboxContainer, element.firstChild)

    rows.push({
      element,
      checkbox,
      links: group.links,
      index: group.index
    })
  })

  return { rows, links }
}

function updateToolbar() {
  if (!templateRuntime) {
    return
  }

  const count = templateRuntime.selected.size
  const total = templateRuntime.links.length
  templateRuntime.toolbar.querySelector('strong')!.textContent = String(count)
  templateRuntime.toolbar.querySelector('.links-hero-count span')!.textContent = ` / ${total}`
}

function setRowSelection(row: RowState, checked: boolean) {
  if (!templateRuntime) {
    return
  }

  row.checkbox.checked = checked
  row.links.forEach(link => {
    if (checked) {
      templateRuntime?.selected.add(link.id)
    } else {
      templateRuntime?.selected.delete(link.id)
    }
  })
  row.element.classList.toggle('links-hero-selected', checked)
}

function showToast(text: string) {
  const target =
    templateRuntime?.toast ??
    fallbackToast ??
    (() => {
      const toast = document.createElement('div')
      toast.className = 'links-hero-toast'
      document.body.appendChild(toast)
      if (templateRuntime) {
        templateRuntime.toast = toast
      } else {
        fallbackToast = toast
      }
      return toast
    })()

  target.textContent = text
  target.style.opacity = '1'

  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastTimer = window.setTimeout(() => {
    target.style.opacity = '0'
  }, 2000)
}

function handleRowInteraction(row: RowState, shiftKey: boolean) {
  if (!templateRuntime) {
    return
  }

  if (shiftKey && templateRuntime.lastIndex !== null) {
    const [start, end] =
      row.index > templateRuntime.lastIndex
        ? [templateRuntime.lastIndex, row.index]
        : [row.index, templateRuntime.lastIndex]

    for (let i = start; i <= end; i += 1) {
      const target = templateRuntime.rows[i]
      setRowSelection(target, row.checkbox.checked)
    }
  } else {
    setRowSelection(row, row.checkbox.checked)
  }

  templateRuntime.lastIndex = row.index
  updateToolbar()
}

function sendPushRequest(links: LinkItem[], config: Awaited<ReturnType<typeof getAria2Config>>) {
  return new Promise<void>((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: PUSH_MESSAGE,
        payload: {
          links,
          config
        }
      },
      response => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message))
          return
        }
        if (!response?.ok) {
          reject(new Error(response?.error ?? '推送失败'))
          return
        }
        resolve()
      }
    )
  })
}

async function pushSelectedFromToolbar() {
  if (!templateRuntime || !templateRuntime.selected.size) {
    showToast('请先选择条目')
    return
  }

  try {
    const config = await getAria2Config()
    const links = templateRuntime.links.filter(link => templateRuntime?.selected.has(link.id))
    await sendPushRequest(links, config)
    showToast(`已推送 ${links.length} 条`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '推送失败')
  }
}

function createToolbar(): HTMLDivElement {
  const toolbar = document.createElement('div')
  toolbar.className = 'links-hero-toolbar'
  toolbar.innerHTML = `
    <div class="links-hero-count">已选 <strong>0</strong><span> / 0</span></div>
    <div class="links-hero-toolbar-actions">
      <button data-action="select-all">全选本页</button>
      <button data-action="clear">清空</button>
      <button data-action="basket">加入篮子</button>
      <button data-action="push">推送 aria2</button>
    </div>
  `

  toolbar.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest('button')
    if (!target || !templateRuntime) {
      return
    }

    const action = target.getAttribute('data-action')
    if (action === 'select-all') {
      templateRuntime.rows.forEach(row => setRowSelection(row, true))
      templateRuntime.selected = new Set(templateRuntime.links.map(link => link.id))
      updateToolbar()
    } else if (action === 'clear') {
      templateRuntime.rows.forEach(row => setRowSelection(row, false))
      templateRuntime.selected.clear()
      updateToolbar()
    } else if (action === 'basket') {
      showToast('已加入篮子')
    } else if (action === 'push') {
      void pushSelectedFromToolbar()
    }
  })

  return toolbar
}

function applyTemplate(template: TemplateDefinition) {
  if (!matchTemplate(template)) {
    showToast('模板与当前页面不匹配')
    throw new Error('模板与当前页面不匹配')
  }

  teardownTemplate()
  ensureStyles()

  const { rows, links } = buildTemplateRows(template)
  if (!rows.length) {
    showToast('模板未命中任何行')
    throw new Error('模板未命中任何行')
  }

  rows.forEach(row => {
    row.checkbox.addEventListener('click', event => {
      handleRowInteraction(row, (event as MouseEvent).shiftKey)
    })
  })

  const toolbar = createToolbar()
  document.body.appendChild(toolbar)

  templateRuntime = {
    template,
    rows,
    selected: new Set(),
    toolbar,
    links,
    lastIndex: null
  }

  updateToolbar()
}

function teardownTemplate() {
  if (!templateRuntime) {
    return
  }

  templateRuntime.rows.forEach(row => {
    row.checkbox.parentElement?.remove()
    row.element.classList.remove('links-hero-row', 'links-hero-selected')
  })

  templateRuntime.toolbar.remove()
  templateRuntime.toast?.remove()
  templateRuntime = null
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

async function scanLinks(rules: SiteRuleDefinition[] = []): Promise<LinkItem[]> {
  if (templateRuntime) {
    return templateRuntime.links.map(link => ({
      ...link,
      selected: templateRuntime?.selected.has(link.id)
    }))
  }

  return scanDefaultLinks(rules)
}

function setupListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === SCAN_MESSAGE) {
      void (async () => {
        try {
          const links = await scanLinks((message as { rules?: SiteRuleDefinition[] }).rules ?? [])
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

    if (message?.type === APPLY_TEMPLATE_MESSAGE) {
      try {
        applyTemplate(message.template)
        sendResponse({ ok: true })
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      }
      return true
    }

    if (message?.type === CLEAR_TEMPLATE_MESSAGE) {
      teardownTemplate()
      sendResponse({ ok: true })
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

