import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
 import { PUSH_MESSAGE } from '../shared/messages'
import { getSiteRules } from '../shared/site-rules'
import { getAria2Config } from '../shared/storage'
import { injectScanner, isInjectableUrl, queryActiveTab, requestScan } from '../shared/scan-trigger'
import { getLinkKind, type LinkKind } from '../shared/link-kind'
import { KeywordTagInput } from '../shared/KeywordTagInput'
import { addKeywords, splitKeywords } from '../shared/keyword-tags'
import { IconBolt, IconFilter, IconList, IconWand } from '../shared/icons'
import { ToastViewport, useToasts } from '../shared/toast'
import type { Aria2Config, LinkItem, PushOutcome } from '../shared/types'

type LinkWithSelection = LinkItem & { selected: boolean }

type Status =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'info'; text: string }
  | null

const chromeReady = typeof chrome !== 'undefined' && !!chrome.tabs
function buildSearchText(link: LinkItem): string {
  return `${link.title ?? ''} ${link.url ?? ''} ${link.sourceHost ?? ''} ${link.normalizedTitle ?? ''}`.toLowerCase()
}

function matchesAnyKeyword(haystack: string, keywords: string[]): boolean {
  if (!keywords.length) {
    return true
  }
  return keywords.some(keyword => haystack.includes(keyword))
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
  const toast = useToasts()
  const [rawLinks, setRawLinks] = useState<LinkWithSelection[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [autoTriggered, setAutoTriggered] = useState(false)
  const [ariaConfig, setAriaConfig] = useState<Aria2Config>({
    endpoint: DEFAULT_ARIA2_ENDPOINT
  })
  const [includeTags, setIncludeTags] = useState<string[]>([])
  const [excludeTags, setExcludeTags] = useState<string[]>([])
  const [includeDraft, setIncludeDraft] = useState('')
  const [excludeDraft, setExcludeDraft] = useState('')
  const [sortBy, setSortBy] = useState<'none' | 'title-asc' | 'title-desc'>('none')
  const [kindFilters, setKindFilters] = useState<LinkKind[]>([])

  const selectedLinks = useMemo(() => rawLinks.filter(link => link.selected), [rawLinks])

  const filteredLinks = useMemo(() => {
    let result = [...rawLinks]

    const includes = [...includeTags, ...splitKeywords(includeDraft)]
    const excludes = [...excludeTags, ...splitKeywords(excludeDraft)]

    if (includes.length) {
      result = result.filter(link => matchesAnyKeyword(buildSearchText(link), includes))
    }

    if (excludes.length) {
      result = result.filter(link => !matchesAnyKeyword(buildSearchText(link), excludes))
    }

    if (kindFilters.length) {
      const allowed = new Set(kindFilters)
      result = result.filter(link => allowed.has(getLinkKind(link.url)))
    }

    if (sortBy === 'title-asc') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortBy === 'title-desc') {
      result = [...result].sort((a, b) => b.title.localeCompare(a.title))
    }

    return result
  }, [rawLinks, includeTags, excludeTags, includeDraft, excludeDraft, sortBy, kindFilters])

  const kindCounts = useMemo(() => {
    const counts: Record<LinkKind, number> = { magnet: 0, torrent: 0, http: 0, other: 0 }
    rawLinks.forEach(link => {
      counts[getLinkKind(link.url)] += 1
    })
    return counts
  }, [rawLinks])

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

  useEffect(() => {
    if (!chromeReady) {
      return
    }

    const isDevtoolsLikelyOpen = () => {
      // Heuristic: DevTools docked changes window outer/inner sizes.
      // (Undocked devtools won't affect this, but also typically doesn't trigger the same blur behavior.)
      const widthGap = Math.abs(window.outerWidth - window.innerWidth)
      const heightGap = Math.abs(window.outerHeight - window.innerHeight)
      return widthGap > 140 || heightGap > 140
    }

    const closePopup = () => {
      try {
        window.close()
      } catch {
        // ignore
      }
    }

    const handleVisibility = () => {
      if (document.hidden) {
        closePopup()
      }
    }

    const handleBlur = () => {
      // Defer to allow Chrome to update focus/visibility state.
      window.setTimeout(() => {
        if (document.hidden) {
          closePopup()
          return
        }

        // If DevTools is opening/docked, blur can happen but popup should stay.
        if (!document.hasFocus() && !isDevtoolsLikelyOpen()) {
          closePopup()
        }
      }, 0)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePopup()
      }
    }

    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('keydown', handleKeyDown)
    }
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
      toast.success(`扫描完成：${next.length} 条`)
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '未知错误'
      })
      toast.error(error instanceof Error ? error.message : '扫描失败')
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
      toast.success(`已复制 ${selectedLinks.length} 条`)
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '复制失败'
      })
      toast.error(error instanceof Error ? error.message : '复制失败')
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
    toast.success('已导出 .txt')
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
        toast.error(`推送失败 ${failed.length} 条（成功 ${succeeded}）`)
      } else {
        setStatus({
          kind: 'success',
          text: `已成功推送 ${succeeded} 条链接`
        })
        toast.success(`推送成功：${succeeded} 条`)
      }
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '推送失败'
      })
      toast.error(error instanceof Error ? error.message : '推送失败')
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
      <ToastViewport toasts={toast.toasts} onDismiss={toast.dismiss} />
      <header className="header">
        <div>
          <h1 className="title">
            <IconWand className="title-icon" />
            Links Hero
          </h1>
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
        <h2 className="section-title">
          <IconBolt className="section-icon" />
          批量操作
        </h2>
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
        <h2 className="section-title">
          <IconFilter className="section-icon" />
          快速过滤
        </h2>
        <div className="chips" role="group" aria-label="快捷筛选">
          {(
            [
              { kind: 'magnet', label: '磁链' },
              { kind: 'torrent', label: '种子' },
              { kind: 'http', label: '直链' }
            ] as const
          ).map(item => {
            const active = kindFilters.includes(item.kind)
            return (
              <button
                key={item.kind}
                type="button"
                className={`chip ${active ? 'active' : ''}`}
                onClick={() => {
                  setKindFilters(prev =>
                    prev.includes(item.kind) ? prev.filter(k => k !== item.kind) : [...prev, item.kind]
                  )
                }}
                aria-pressed={active}
                title={`${item.label}：${kindCounts[item.kind]} 条`}
              >
                {item.label}
                <span className="chip-count">{kindCounts[item.kind]}</span>
              </button>
            )
          })}
          <span className="chips-meta">
            命中 {filteredLinks.length} / {rawLinks.length}
          </span>
        </div>
        <KeywordTagInput
          label="包含关键词"
          placeholder="输入后按 Enter"
          tags={includeTags}
          value={includeDraft}
          onChangeTags={setIncludeTags}
          onChangeValue={value => {
            if (value.includes(',') || value.includes('，')) {
              setIncludeTags(prev => addKeywords(prev, value))
              setIncludeDraft('')
              return
            }
            setIncludeDraft(value)
          }}
        />
        <KeywordTagInput
          label="排除关键词"
          placeholder="输入后按 Enter"
          tags={excludeTags}
          value={excludeDraft}
          onChangeTags={setExcludeTags}
          onChangeValue={value => {
            if (value.includes(',') || value.includes('，')) {
              setExcludeTags(prev => addKeywords(prev, value))
              setExcludeDraft('')
              return
            }
            setExcludeDraft(value)
          }}
        />
        <div className="filter-row">
          <div className="field">
            <span className="field-label">排序</span>
            <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}>
              <option value="none">默认</option>
              <option value="title-asc">标题 A→Z</option>
              <option value="title-desc">标题 Z→A</option>
            </select>
          </div>
          <button
            className="secondary"
            onClick={() => {
              setIncludeTags([])
              setExcludeTags([])
              setIncludeDraft('')
              setExcludeDraft('')
              setSortBy('none')
              setKindFilters([])
            }}
          >
            清空过滤
          </button>
        </div>
      </section>

      <section className="list">
        <h2 className="section-title">
          <IconList className="section-icon" />
          链接列表
        </h2>
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

