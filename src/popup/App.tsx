import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
import { PUSH_MESSAGE } from '../shared/messages'
import { getSiteRules } from '../shared/site-rules'
import { getAria2Config } from '../shared/storage'
import { injectScanner, isInjectableUrl, queryActiveTab, requestScan } from '../shared/scan-trigger'
import { getLinkKind, type LinkKind } from '../shared/link-kind'
import { extractLinksFromClipboardText } from '../shared/clipboard-links'
import { KeywordTagInput } from '../shared/KeywordTagInput'
import { addKeywords, splitKeywords } from '../shared/keyword-tags'
import { buildSearchText, matchesAllKeywords, matchesAnyKeyword } from '../shared/link-filters'
import { IconBolt, IconFilter, IconList } from '../shared/icons'
import { ToastViewport, useToasts } from '../shared/toast'
import { useTranslation } from '../shared/i18n-provider'
import type { Aria2Config, LinkItem, PushOutcome } from '../shared/types'

type LinkWithSelection = LinkItem & { selected: boolean }

type Status =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'info'; text: string }
  | null

const chromeReady = typeof chrome !== 'undefined' && !!chrome.tabs

function toOriginPattern(url?: string | null): string | null {
  if (!url) {
    return null
  }
  try {
    const parsed = new URL(url)
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null
    }
    return `${parsed.origin}/*`
  } catch {
    return null
  }
}

async function containsOriginPermission(originPattern: string): Promise<boolean> {
  return new Promise(resolve => {
    chrome.permissions.contains({ origins: [originPattern] }, granted => resolve(Boolean(granted)))
  })
}

async function requestOriginPermission(originPattern: string): Promise<boolean> {
  return new Promise(resolve => {
    chrome.permissions.request({ origins: [originPattern] }, granted => resolve(Boolean(granted)))
  })
}

async function ensureOriginPermission(url: string | undefined, prompt: boolean): Promise<boolean> {
  if (!chrome.permissions) {
    return true
  }
  const originPattern = toOriginPattern(url)
  if (!originPattern) {
    return true
  }
  const granted = await containsOriginPermission(originPattern)
  if (granted || !prompt) {
    return granted
  }
  return requestOriginPermission(originPattern)
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
  const { t } = useTranslation()
  const toast = useToasts()


  const [rawLinks, setRawLinks] = useState<LinkWithSelection[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [ariaConfig, setAriaConfig] = useState<Aria2Config>({
    endpoint: DEFAULT_ARIA2_ENDPOINT
  })
  const [includeTags, setIncludeTags] = useState<string[]>([])
  const [excludeTags, setExcludeTags] = useState<string[]>([])
  const [includeDraft, setIncludeDraft] = useState('')
  const [excludeDraft, setExcludeDraft] = useState('')
  const [filtersCollapsed, setFiltersCollapsed] = useState(true)
  const [sortBy, setSortBy] = useState<'none' | 'title-asc' | 'title-desc'>('none')
  const [kindFilters, setKindFilters] = useState<LinkKind[]>([])
  const scanInFlightRef = useRef(false)
  const scheduledScanRef = useRef<number | null>(null)

  const selectedLinks = useMemo(() => rawLinks.filter(link => link.selected), [rawLinks])

  const filteredLinks = useMemo(() => {
    let result = [...rawLinks]

    const includes = [...includeTags, ...splitKeywords(includeDraft)]
    const excludes = [...excludeTags, ...splitKeywords(excludeDraft)]

    if (includes.length) {
      result = result.filter(link => matchesAllKeywords(buildSearchText(link), includes))
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
      setStatus({ kind: 'error', text: t('popupErrorEnv') })
      return
    }

    Promise.all([getAria2Config()])
      .then(([config]) => {
        setAriaConfig(config)
      })
      .catch(error => setStatus({ kind: 'error', text: error.message }))
  }, [])

  const handleScan = useCallback(async (options?: { promptPermission?: boolean }) => {
    if (!chromeReady) {
      return
    }
    if (scanInFlightRef.current) {
      return
    }
    scanInFlightRef.current = true

    setLoading(true)
    setStatus({ kind: 'info', text: t('popupScanning') })

    try {
      const [tab, siteRules] = await Promise.all([
        queryActiveTab(),
        getSiteRules().catch(() => [])
      ])
      if (!isInjectableUrl(tab.url)) {
        setStatus({
          kind: 'error',
          text: t('errorInject')
        })
        return
      }
      const hasPermission = await ensureOriginPermission(tab.url, Boolean(options?.promptPermission))
      if (!hasPermission) {
        throw new Error(t('errorHostPermission'))
      }
      await injectScanner(tab.id)
      let responseLinks = await requestScan(tab.id, siteRules)
      if (!responseLinks.length) {
        throw new Error(t('errorNoLinks'))
      }

      const next = responseLinks.map(link => ({
        ...link,
        selected: typeof link.selected === 'boolean' ? link.selected : true
      }))
      setRawLinks(next)
      setStatus({ kind: 'success', text: t('scanSuccess', [String(next.length)]) })
      toast.success(t('scanSuccessToast', [String(next.length)]))
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : t('errorUnknown')
      })
      toast.error(error instanceof Error ? error.message : t('errorScanFailed'))
    } finally {
      scanInFlightRef.current = false
      setLoading(false)
    }
  }, [])

  const scheduleAutoScan = useCallback(
    (delayMs = 180) => {
      if (!chromeReady) {
        return
      }

      if (scheduledScanRef.current !== null) {
        window.clearTimeout(scheduledScanRef.current)
      }

      scheduledScanRef.current = window.setTimeout(() => {
        scheduledScanRef.current = null
        void handleScan({ promptPermission: false })
      }, delayMs)
    },
    [handleScan]
  )

  useEffect(() => {
    if (!chromeReady) {
      return
    }

    scheduleAutoScan(0)
  }, [scheduleAutoScan])

  useEffect(() => {
    if (!chromeReady) {
      return
    }

    const handleTabActivated = (_activeInfo: chrome.tabs.TabActiveInfo) => {
      scheduleAutoScan()
    }

    const handleTabUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (changeInfo.status !== 'complete' || !tab.active) {
        return
      }
      scheduleAutoScan()
    }

    chrome.tabs.onActivated.addListener(handleTabActivated)
    chrome.tabs.onUpdated.addListener(handleTabUpdated)

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated)
      chrome.tabs.onUpdated.removeListener(handleTabUpdated)
    }
  }, [scheduleAutoScan])

  useEffect(
    () => () => {
      if (scheduledScanRef.current !== null) {
        window.clearTimeout(scheduledScanRef.current)
      }
    },
    []
  )

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
      setStatus({ kind: 'success', text: t('copySuccess', [String(selectedLinks.length)]) })
      toast.success(t('copySuccessToast', [String(selectedLinks.length)]))
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : t('copyFailed')
      })
      toast.error(error instanceof Error ? error.message : t('copyFailed'))
    }
  }

  const handleImportClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setStatus({ kind: 'error', text: t('clipboardEmpty') })
        return
      }

      let sourceHost = 'clipboard'
      try {
        const tab = await queryActiveTab()
        if (tab.url) {
          sourceHost = new URL(tab.url).hostname || sourceHost
        }
      } catch {
        // ignore and keep fallback host
      }

      const links = extractLinksFromClipboardText(text, sourceHost)
      if (!links.length) {
        setStatus({ kind: 'error', text: t('clipboardNoLinks') })
        return
      }

      const next = links.map(link => ({ ...link, selected: true }))
      setRawLinks(next)
      setStatus({ kind: 'success', text: t('clipboardImportSuccess', [String(next.length)]) })
      toast.success(t('clipboardImportSuccessToast', [String(next.length)]))
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? `${t('clipboardReadFailed')}: ${error.message}` : t('clipboardReadFailed')
      })
      toast.error(t('clipboardReadFailed'))
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
    setStatus({ kind: 'success', text: t('exportSuccess') })
    toast.success(t('exportSuccessToast'))
  }

  const handlePush = async () => {
    if (!selectedLinks.length) {
      setStatus({ kind: 'error', text: t('pushSelectNone') })
      return
    }

    setStatus({ kind: 'info', text: t('pushing') })
    try {
      const response = await pushToBackground({
        links: selectedLinks,
        config: ariaConfig
      })

      if (!response.ok || !response.result) {
        throw new Error(response.error ?? t('pushFailedGeneric'))
      }

      const { succeeded, failed } = response.result
      if (failed.length) {
        setStatus({
          kind: 'error',
          text: t('pushPartial', [String(succeeded), String(failed.length)])
        })
        toast.error(t('pushPartialToast', [String(failed.length), String(succeeded)]))
      } else {
        setStatus({
          kind: 'success',
          text: t('pushSuccess', [String(succeeded)])
        })
        toast.success(t('pushSuccessToast', [String(succeeded)]))
      }
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : t('pushFailedGeneric')
      })
      toast.error(error instanceof Error ? error.message : t('pushFailedGeneric'))
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
            <img src="/icons/48x48.png" alt="" style={{ width: 24, height: 24 }} />
            {t('actionTitle')}
          </h1>
          <p className="subhead">
            {loading ? t('headerLoading') : t('headerCaptured', [String(rawLinks.length)])}
            {ariaConfig.endpoint ? ` · aria2: ${ariaConfig.endpoint}` : ''}
          </p>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={openSettingsPage}
            title={t('btnSettings')}
            aria-label={t('btnSettings')}
          >
            <span aria-hidden="true">⚙</span>
          </button>
          <button
            className="icon-button"
            onClick={() => {
              void handleScan({ promptPermission: true })
            }}
            disabled={loading || !chromeReady}
            title={t('btnRescan')}
            aria-label={t('btnRescan')}
          >
            <span aria-hidden="true">{loading ? '⏳' : '↻'}</span>
          </button>
        </div>
      </header>

      <section className="actions">
        <h2 className="section-title">
          <IconBolt className="section-icon" />
          {t('sectBatch')}
        </h2>
        <div className="action-row">
          <button onClick={() => toggleAll(true)} disabled={!filteredLinks.length}>
            {t('btnSelectAll')}
          </button>
          <button onClick={() => toggleAll(false)} disabled={!filteredLinks.length}>
            {t('btnSelectNone')}
          </button>
          <button onClick={handleCopy} disabled={!selectedLinks.length}>
            {t('btnCopy')}
          </button>
          <button onClick={handleImportClipboard}>
            {t('btnImportClipboard')}
          </button>
          <button onClick={handleExport} disabled={!selectedLinks.length}>
            {t('btnExport')}
          </button>
          <button className="primary" onClick={handlePush} disabled={!selectedLinks.length}>
            {t('btnPush')}
          </button>
        </div>
        <p className="summary">
          {t('summaryStats', [String(filteredLinks.length), String(rawLinks.length), String(selectedLinks.length), rawLinks[0]?.sourceHost ?? '—'])}
        </p>
      </section>

      <section className="filters">
        <div className="section-title-row">
          <h2 className="section-title">
            <IconFilter className="section-icon" />
            {t('sectFilter')}
          </h2>
          <button
            type="button"
            className="filter-toggle"
            onClick={() => setFiltersCollapsed(prev => !prev)}
            aria-expanded={!filtersCollapsed}
          >
            {filtersCollapsed ? t('filterExpand') : t('filterCollapse')}
          </button>
        </div>
        <div className="chips" role="group" aria-label={t('sectFilter')}>
          {(
            [
              { kind: 'magnet', label: t('kindMagnet') },
              { kind: 'torrent', label: t('kindTorrent') },
              { kind: 'http', label: t('kindHttp') }
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
                title={t('chipTitle', [item.label, String(kindCounts[item.kind])])}
              >
                {item.label}
                <span className="chip-count">{kindCounts[item.kind]}</span>
              </button>
            )
          })}
          <span className="chips-meta">
            {t('filterHit', [String(filteredLinks.length), String(rawLinks.length)])}
          </span>
        </div>
        {!filtersCollapsed && (
          <>
            <KeywordTagInput
              label={t('inputInclude')}
              placeholder={t('inputPlaceholder')}
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
              label={t('inputExclude')}
              placeholder={t('inputPlaceholder')}
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
                <span className="field-label">{t('labelSort')}</span>
                <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)}>
                  <option value="none">{t('sortDefault')}</option>
                  <option value="title-asc">{t('sortAsc')}</option>
                  <option value="title-desc">{t('sortDesc')}</option>
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
                {t('btnClearFilter')}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="list">
        <h2 className="section-title">
          <IconList className="section-icon" />
          {t('sectList')}
        </h2>
        {filteredLinks.length === 0 ? (
          <p className="empty">
            {rawLinks.length === 0 ? t('listEmptyInit') : t('listEmptyFilter')}
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

