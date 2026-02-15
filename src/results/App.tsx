import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
import { PUSH_MESSAGE } from '../shared/messages'
import { STORAGE_KEYS } from '../shared/constants'
import type { Aria2Config, LinkItem, PushOutcome } from '../shared/types'
import { parseLastScanResult, type LastScanResult } from './scan-result'
import { getLinkKind, type LinkKind } from '../shared/link-kind'
import { KeywordTagInput } from '../shared/KeywordTagInput'
import { addKeywords, splitKeywords } from '../shared/keyword-tags'
import { IconBolt, IconFilter, IconList, IconWand } from '../shared/icons'
import { ToastViewport, useToasts } from '../shared/toast'
import { useTranslation } from '../shared/i18n-provider'

type LinkWithSelection = LinkItem & { selected: boolean }

type Status =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'info'; text: string }
  | null

const chromeReady = typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.runtime
function buildSearchText(link: LinkItem): string {
  return `${link.title ?? ''} ${link.url ?? ''} ${link.sourceHost ?? ''} ${link.normalizedTitle ?? ''}`.toLowerCase()
}

function matchesAllKeywords(haystack: string, keywords: string[]): boolean {
  if (!keywords.length) {
    return true
  }
  return keywords.every(keyword => haystack.includes(keyword))
}

function matchesAnyKeyword(haystack: string, keywords: string[]): boolean {
  if (!keywords.length) {
    return true
  }
  return keywords.some(keyword => haystack.includes(keyword))
}

function formatLinksText(links: LinkItem[]) {
  return links.map(link => link.url).join('\n')
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

function getTestScanResult(): LastScanResult | null {
  const anyWindow = window as unknown as { __linksHeroTestData?: { scanResult?: unknown } }
  return parseLastScanResult(anyWindow.__linksHeroTestData?.scanResult)
}

async function loadLastScanResult(): Promise<LastScanResult | null> {
  if (!chromeReady || !chrome.storage.session) {
    return getTestScanResult()
  }
  const raw = await new Promise<Record<string, unknown>>(resolve => {
    chrome.storage.session.get([STORAGE_KEYS.lastScanResult], resolve)
  })
  return parseLastScanResult(raw[STORAGE_KEYS.lastScanResult])
}

async function loadAria2Config(): Promise<Aria2Config> {
  // Avoid calling shared storage helpers in non-extension contexts (e2e tests / static html),
  // because referencing a missing global `chrome` can throw at runtime.
  if (typeof chrome === 'undefined' || !chrome?.storage?.sync) {
    return { endpoint: DEFAULT_ARIA2_ENDPOINT }
  }
  const mod = await import('../shared/storage')
  return await mod.getAria2Config()
}

const App = () => {
  const { t } = useTranslation()
  const toast = useToasts()
  const [rawLinks, setRawLinks] = useState<LinkWithSelection[]>([])
  const [scanInfo, setScanInfo] = useState<LastScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Status>(null)
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
    void (async () => {
      try {
        const [config, scanResult] = await Promise.all([loadAria2Config(), loadLastScanResult()])
        setAriaConfig(config)
        setScanInfo(scanResult)
        const next = (scanResult?.links ?? []).map(link => ({
          ...link,
          selected: typeof link.selected === 'boolean' ? link.selected : true
        }))
        setRawLinks(next)
        if (!next.length) {
          setStatus({ kind: 'info', text: t('resultsEmpty') })
        } else {
          setStatus({ kind: 'success', text: t('resultsLoaded', [String(next.length)]) })
        }
      } catch (error) {
        setStatus({ kind: 'error', text: error instanceof Error ? error.message : t('resultsLoadFailed') })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

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
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : t('copyFailed') })
      toast.error(error instanceof Error ? error.message : t('copyFailed'))
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
    URL.revokeObjectURL(url)
    setStatus({ kind: 'success', text: t('exportSuccess') })
    toast.success(t('exportSuccessToast'))
  }

  const handlePush = async () => {
    if (!chromeReady) {
      setStatus({ kind: 'error', text: t('errorInExtension') })
      return
    }
    if (!selectedLinks.length) {
      setStatus({ kind: 'error', text: t('errorSelectOne') })
      return
    }
    setStatus({ kind: 'info', text: t('statusPushing') })
    try {
      const response = await pushToBackground({ links: selectedLinks, config: ariaConfig })
      if (!response.ok || !response.result) {
        throw new Error(response.error ?? t('errorPushFailed'))
      }
      const { succeeded, failed } = response.result
      if (failed.length) {
        setStatus({ kind: 'error', text: t('pushPartial', [String(succeeded), String(failed.length)]) })
        toast.error(t('pushPartialToast', [String(failed.length), String(succeeded)]))
      } else {
        setStatus({ kind: 'success', text: t('pushSuccess', [String(succeeded)]) })
        toast.success(t('pushSuccessToast', [String(succeeded)]))
      }
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : t('pushFailedGeneric') })
      toast.error(error instanceof Error ? error.message : t('pushFailedGeneric'))
    }
  }

  const openSettingsPage = () => {
    if (!chromeReady) {
      return
    }
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage()
      return
    }
    const url = chrome.runtime.getURL('options.html')
    window.open(url, '_blank')
  }

  return (
    <div className="results">
      <ToastViewport toasts={toast.toasts} onDismiss={toast.dismiss} />
      <header className="header">
        <div>
          <h1 className="title">
            <IconWand className="title-icon" />
            {t('resultsTitle')}
          </h1>
          <p className="subhead">
            {loading ? t('headerLoading') : t('headerCaptured', [String(rawLinks.length)])}
            {scanInfo?.tabUrl ? ` · ${scanInfo.tabUrl}` : ''}
            {ariaConfig.endpoint ? ` · aria2: ${ariaConfig.endpoint}` : ''}
          </p>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={openSettingsPage} title={t('openConfig')} aria-label={t('openConfig')}>
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
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
              <button onClick={handleExport} disabled={!selectedLinks.length}>
                {t('btnExport')}
              </button>
              <button className="primary" onClick={handlePush} disabled={!selectedLinks.length}>
                {t('btnPush')}
              </button>
            </div>
            <p className="summary">
              {t('summaryStats', [String(filteredLinks.length), String(rawLinks.length), String(selectedLinks.length), ''])}
            </p>
          </section>

          <section className="filters">
            <h2 className="section-title">
              <IconFilter className="section-icon" />
              {t('sectFilter')}
            </h2>
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
          </section>

          {status && <p className={`status ${status.kind}`}>{status.text}</p>}
        </aside>

        <main className="main">
          <section className="list">
            <h2 className="section-title">
              <IconList className="section-icon" />
              {t('sectList')}
            </h2>
            {filteredLinks.length === 0 ? (
              <p className="empty">{rawLinks.length === 0 ? t('resultsNoData') : t('listEmptyFilter')}</p>
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
        </main>
      </div>
    </div>
  )
}

export default App

