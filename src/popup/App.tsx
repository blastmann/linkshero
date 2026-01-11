import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
import { SCAN_MESSAGE, PUSH_MESSAGE } from '../shared/messages'
import { getSiteRules } from '../shared/site-rules'
import { getAria2Config } from '../shared/storage'
import type { Aria2Config, LinkItem, PushOutcome, ScanResponse, SiteRuleDefinition } from '../shared/types'

type LinkWithSelection = LinkItem & { selected: boolean }

type Status =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'info'; text: string }
  | null

const chromeReady = typeof chrome !== 'undefined' && !!chrome.tabs
const KEYWORD_SPLIT_REGEX = /[,，]/

function parseKeywords(value: string): string[] {
  return value
    .split(KEYWORD_SPLIT_REGEX)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

function buildSearchText(link: LinkItem): string {
  return `${link.title ?? ''} ${link.url ?? ''} ${link.sourceHost ?? ''} ${link.normalizedTitle ?? ''}`.toLowerCase()
}

function matchesAnyKeyword(haystack: string, keywords: string[]): boolean {
  if (!keywords.length) {
    return true
  }
  return keywords.some(keyword => haystack.includes(keyword))
}

interface ActiveTab {
  id: number
  url?: string
}

function isInjectableUrl(url?: string | null): boolean {
  if (!url) {
    return true
  }
  return /^(https?|file|ftp):/i.test(url)
}

async function queryActiveTab(): Promise<ActiveTab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0]
      if (tab?.id !== undefined) {
        resolve({ id: tab.id, url: tab.url })
        return
      }

      reject(new Error('无法获取当前标签页'))
    })
  })
}

async function injectScanner(tabId: number, frameIds?: number[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = frameIds && frameIds.length ? { tabId, frameIds } : { tabId, allFrames: true }
    chrome.scripting.executeScript(
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
        const err = chrome.runtime.lastError
        if (err && !err.message?.includes('Cannot access a chrome:// URL')) {
          reject(new Error(err.message))
          return
        }
        resolve()
      }
    )
  })
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

async function sendScanMessage(
  tabId: number,
  frameId: number,
  rules: SiteRuleDefinition[]
): Promise<ScanResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: SCAN_MESSAGE, rules }, { frameId }, response => {
      const err = chrome.runtime.lastError
      if (err) {
        reject(new Error(err.message))
        return
      }
      resolve(response as ScanResponse)
    })
  })
}

async function requestScan(tabId: number, rules: SiteRuleDefinition[]): Promise<LinkItem[]> {
  const framesResult = await chrome.webNavigation
    .getAllFrames({ tabId })
    .catch(() => undefined as chrome.webNavigation.GetAllFrameDetails[] | undefined)
  const frames = Array.isArray(framesResult) ? framesResult : []
  const targets = frames.length
    ? frames.map(frame => (frame as chrome.webNavigation.GetAllFrameDetails & { frameId?: number }).frameId ?? 0)
    : [0]

  const results = await Promise.allSettled(
    targets.map(frameId =>
      sendScanMessage(tabId, frameId, rules).catch(async error => {
        const message = getErrorMessage(error)
        if (message.includes('Receiving end does not exist')) {
          await injectScanner(tabId, [frameId])
          return sendScanMessage(tabId, frameId, rules)
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

async function pushToBackground(payload: { links: LinkItem[]; config: Aria2Config }) {
  return new Promise<{ ok: boolean; result?: PushOutcome; error?: string }>((resolve, reject) => {
    chrome.runtime.sendMessage({ type: PUSH_MESSAGE, payload }, response => {
      const err = chrome.runtime.lastError
      if (err) {
        reject(new Error(err.message))
        return
      }
      resolve(response as { ok: boolean; result?: PushOutcome; error?: string })
    })
  })
}

function formatLinksText(links: LinkItem[]) {
  return links.map(link => link.url).join('\n')
}

const App = () => {
  const [rawLinks, setRawLinks] = useState<LinkWithSelection[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [autoTriggered, setAutoTriggered] = useState(false)
  const [ariaConfig, setAriaConfig] = useState<Aria2Config>({
    endpoint: DEFAULT_ARIA2_ENDPOINT
  })
  const [includeFilter, setIncludeFilter] = useState('')
  const [excludeFilter, setExcludeFilter] = useState('')
  const [sortBy, setSortBy] = useState<'none' | 'title-asc' | 'title-desc'>('none')

  const selectedLinks = useMemo(() => rawLinks.filter(link => link.selected), [rawLinks])

  const filteredLinks = useMemo(() => {
    let result = [...rawLinks]

    const includes = parseKeywords(includeFilter)
    const excludes = parseKeywords(excludeFilter)

    if (includes.length) {
      result = result.filter(link => matchesAnyKeyword(buildSearchText(link), includes))
    }

    if (excludes.length) {
      result = result.filter(link => !matchesAnyKeyword(buildSearchText(link), excludes))
    }

    if (sortBy === 'title-asc') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortBy === 'title-desc') {
      result = [...result].sort((a, b) => b.title.localeCompare(a.title))
    }

    return result
  }, [rawLinks, includeFilter, excludeFilter, sortBy])

  useEffect(() => {
    if (!chromeReady) {
      setStatus({ kind: 'error', text: '请在扩展环境中打开 Popup' })
      return
    }

    Promise.all([getAria2Config()])
      .then(([config]) => {
        setAriaConfig(config)
      })
      .catch(error => setStatus({ kind: 'error', text: error.message }))
  }, [])

  const handleScan = useCallback(async () => {
    if (!chromeReady) {
      return
    }

    setLoading(true)
    setStatus({ kind: 'info', text: '正在扫描当前页面…' })

    try {
      const [tab, siteRules] = await Promise.all([
        queryActiveTab(),
        getSiteRules().catch(() => [])
      ])
      if (!isInjectableUrl(tab.url)) {
        setStatus({
          kind: 'error',
          text: '当前页面无法注入（如 chrome://），请切换到普通网页后再试'
        })
        return
      }
      await injectScanner(tab.id)
      let responseLinks = await requestScan(tab.id, siteRules)
      if (!responseLinks.length) {
        throw new Error('未能在页面中找到可用链接')
      }

      const next = responseLinks.map(link => ({
        ...link,
        selected: typeof link.selected === 'boolean' ? link.selected : true
      }))
      setRawLinks(next)
      setStatus({ kind: 'success', text: `扫描完成，共 ${next.length} 条链接` })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '未知错误'
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!chromeReady || autoTriggered) {
      return
    }
    setAutoTriggered(true)
    void handleScan()
  }, [autoTriggered, handleScan])

  const updateSelection = (id: string, selected: boolean) => {
    setRawLinks(prev => prev.map(link => (link.id === id ? { ...link, selected } : link)))
  }

  const toggleAll = (selectAll: boolean) => {
    const targetIds = new Set(filteredLinks.map(link => link.id))
    if (!targetIds.size) {
      return
    }

    setRawLinks(prev =>
      prev.map(link => (targetIds.has(link.id) ? { ...link, selected: selectAll } : link))
    )
  }

  const handleCopy = async () => {
    if (!selectedLinks.length) {
      return
    }

    const text = formatLinksText(selectedLinks)
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ kind: 'success', text: `已复制 ${selectedLinks.length} 条链接` })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '复制失败'
      })
    }
  }

  const handleExport = () => {
    if (!selectedLinks.length) {
      return
    }

    const blob = new Blob([formatLinksText(selectedLinks)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `links-${Date.now()}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
    setStatus({ kind: 'success', text: '已导出所选链接' })
  }

  const handlePush = async () => {
    if (!selectedLinks.length) {
      setStatus({ kind: 'error', text: '请至少选择一条链接' })
      return
    }

    setStatus({ kind: 'info', text: '正在推送到 aria2…' })
    try {
      const response = await pushToBackground({
        links: selectedLinks,
        config: ariaConfig
      })

      if (!response.ok || !response.result) {
        throw new Error(response.error ?? '推送失败')
      }

      const { succeeded, failed } = response.result
      if (failed.length) {
        setStatus({
          kind: 'error',
          text: `成功 ${succeeded} 条，失败 ${failed.length} 条`
        })
      } else {
        setStatus({
          kind: 'success',
          text: `已成功推送 ${succeeded} 条链接`
        })
      }
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '推送失败'
      })
    }
  }

  const openSettingsPage = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage()
      return
    }
    const url = chrome.runtime.getURL('options.html')
    window.open(url, '_blank')
  }

  return (
    <div className="popup">
      <header className="header">
        <div>
          <h1>Links Hero</h1>
          <p className="subhead">
            {loading ? '正在扫描…' : `已捕获 ${rawLinks.length} 条链接`}
            {ariaConfig.endpoint ? ` · aria2: ${ariaConfig.endpoint}` : ''}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={openSettingsPage}
            title="打开配置页"
            aria-label="打开配置页"
          >
            <span aria-hidden="true">⚙</span>
          </button>
          <button
            className="icon-button"
            onClick={() => {
              void handleScan()
            }}
            disabled={loading || !chromeReady}
            title="重新扫描"
            aria-label="重新扫描"
          >
            <span aria-hidden="true">{loading ? '⏳' : '↻'}</span>
          </button>
        </div>
      </header>

      <section className="actions">
        <h2>批量操作</h2>
        <div className="action-row">
          <button onClick={() => toggleAll(true)} disabled={!filteredLinks.length}>
            全选
          </button>
          <button onClick={() => toggleAll(false)} disabled={!filteredLinks.length}>
            全不选
          </button>
          <button onClick={handleCopy} disabled={!selectedLinks.length}>
            复制所选
          </button>
          <button onClick={handleExport} disabled={!selectedLinks.length}>
            导出 .txt
          </button>
          <button className="primary" onClick={handlePush} disabled={!selectedLinks.length}>
            推送 aria2
          </button>
        </div>
        <p className="summary">
          显示 {filteredLinks.length} / 共 {rawLinks.length} 条，已选 {selectedLinks.length} 条（来源：
          {rawLinks[0]?.sourceHost ?? '—'}）
        </p>
      </section>

      <section className="filters">
        <h2>快速过滤</h2>
        <label>
          包含关键词（逗号分隔）
          <input
            type="text"
            value={includeFilter}
            onChange={event => setIncludeFilter(event.target.value)}
          />
        </label>
        <label>
          排除关键词（逗号分隔）
          <input
            type="text"
            value={excludeFilter}
            onChange={event => setExcludeFilter(event.target.value)}
          />
        </label>
        <div className="filter-row">
          <label>
            排序
            <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}>
              <option value="none">默认</option>
              <option value="title-asc">标题 A→Z</option>
              <option value="title-desc">标题 Z→A</option>
            </select>
          </label>
          <button
            onClick={() => {
              setIncludeFilter('')
              setExcludeFilter('')
              setSortBy('none')
            }}
          >
            清空过滤
          </button>
        </div>
      </section>

      <section className="list">
        <h2>链接列表</h2>
        {filteredLinks.length === 0 ? (
          <p className="empty">
            {rawLinks.length === 0 ? '暂无数据，点击“扫描当前页”开始。' : '过滤条件下没有匹配结果。'}
          </p>
        ) : (
          <div className="table">
            {filteredLinks.map(link => (
              <label key={link.id} className="row">
                <input
                  type="checkbox"
                  checked={link.selected}
                  onChange={event => updateSelection(link.id, event.target.checked)}
                />
                <div className="details">
                  <span className="title">{link.title}</span>
                  <span className="url" title={link.url}>
                    {link.url}
                  </span>
                  <span className="host">{link.sourceHost}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </div>
  )
}

export default App

