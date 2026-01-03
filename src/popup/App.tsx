import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
import {
  APPLY_TEMPLATE_MESSAGE,
  CLEAR_TEMPLATE_MESSAGE,
  SCAN_MESSAGE,
  PUSH_MESSAGE
} from '../shared/messages'
import { getAria2Config, saveAria2Config } from '../shared/storage'
import { deleteTemplate, getTemplates, saveTemplate } from '../shared/templates'
import type {
  Aria2Config,
  LinkItem,
  PushOutcome,
  ScanResponse,
  TemplateDefinition
} from '../shared/types'

type LinkWithSelection = LinkItem & { selected: boolean }

type Status =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'info'; text: string }
  | null

const chromeReady = typeof chrome !== 'undefined' && !!chrome.tabs

async function queryActiveTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tabId = tabs[0]?.id

      if (typeof tabId === 'number') {
        resolve(tabId)
        return
      }

      reject(new Error('无法获取当前标签页'))
    })
  })
}

async function injectScanner(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ['content.js']
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

async function requestScan(tabId: number): Promise<ScanResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: SCAN_MESSAGE }, response => {
      const err = chrome.runtime.lastError
      if (err) {
        reject(new Error(err.message))
        return
      }

      resolve(response as ScanResponse)
    })
  })
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

function createTemplateId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

const App = () => {
  const [rawLinks, setRawLinks] = useState<LinkWithSelection[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [ariaConfig, setAriaConfig] = useState<Aria2Config>({
    endpoint: DEFAULT_ARIA2_ENDPOINT
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [templates, setTemplates] = useState<TemplateDefinition[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    hostSuffix: '',
    pathRegex: '',
    row: '',
    link: '',
    title: ''
  })
  const [includeFilter, setIncludeFilter] = useState('')
  const [excludeFilter, setExcludeFilter] = useState('')
  const [sortBy, setSortBy] = useState<'none' | 'title-asc' | 'title-desc'>('none')

  const selectedLinks = useMemo(() => rawLinks.filter(link => link.selected), [rawLinks])

  const filteredLinks = useMemo(() => {
    let result = [...rawLinks]

    const toKeywords = (value: string) =>
      value
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(Boolean)

    const includes = toKeywords(includeFilter)
    const excludes = toKeywords(excludeFilter)

    if (includes.length) {
      result = result.filter(link => {
        const haystack = `${link.title} ${link.url}`.toLowerCase()
        return includes.some(keyword => haystack.includes(keyword))
      })
    }

    if (excludes.length) {
      result = result.filter(link => {
        const haystack = `${link.title} ${link.url}`.toLowerCase()
        return !excludes.some(keyword => haystack.includes(keyword))
      })
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

    getAria2Config()
      .then(config => setAriaConfig(config))
      .catch(error => setStatus({ kind: 'error', text: error.message }))

    getTemplates()
      .then(list => setTemplates(list))
      .catch(error => setStatus({ kind: 'error', text: error.message }))
  }, [])

  const handleScan = async () => {
    if (!chromeReady) {
      return
    }

    setLoading(true)
    setStatus({ kind: 'info', text: '正在扫描当前页面…' })

    try {
      const tabId = await queryActiveTabId()
      await injectScanner(tabId)
      const response = await requestScan(tabId)

      if (!response.success || !response.links) {
        throw new Error(response.error ?? '扫描失败')
      }

      const next = response.links.map(link => ({
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
  }

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

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await saveAria2Config(ariaConfig)
      setStatus({ kind: 'success', text: '配置已保存' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '保存失败'
      })
    } finally {
      setSavingConfig(false)
    }
  }

  const selectedTemplate = templates.find(template => template.id === selectedTemplateId) ?? null

  const handleTemplateCreate = async () => {
    if (!templateForm.row || !templateForm.link) {
      setStatus({ kind: 'error', text: '请填写行与链接选择器' })
      return
    }

    const newTemplate: TemplateDefinition = {
      id: createTemplateId(),
      name: templateForm.name || `模板 ${templates.length + 1}`,
      match: {
        hostSuffix: templateForm.hostSuffix
          .split(',')
          .map(item => item.trim())
          .filter(Boolean),
        pathRegex: templateForm.pathRegex || undefined
      },
      selectors: {
        row: templateForm.row,
        link: templateForm.link,
        title: templateForm.title || undefined
      }
    }

    try {
      await saveTemplate(newTemplate)
      setTemplates(prev => [...prev, newTemplate])
      setSelectedTemplateId(newTemplate.id)
      setTemplateForm({
        name: '',
        hostSuffix: '',
        pathRegex: '',
        row: '',
        link: '',
        title: ''
      })
      setStatus({ kind: 'success', text: '模板已保存' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '保存模板失败'
      })
    }
  }

  const handleTemplateDelete = async (id: string) => {
    try {
      await deleteTemplate(id)
      setTemplates(prev => prev.filter(item => item.id !== id))
      if (selectedTemplateId === id) {
        setSelectedTemplateId(null)
      }
      setStatus({ kind: 'success', text: '模板已删除' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '删除失败'
      })
    }
  }

  const applyTemplateToPage = async () => {
    if (!chromeReady) {
      setStatus({ kind: 'error', text: '扩展上下文不可用' })
      return
    }
    if (!selectedTemplate) {
      setStatus({ kind: 'error', text: '请选择模板' })
      return
    }
    setStatus({ kind: 'info', text: `正在应用模板：${selectedTemplate.name}` })
    try {
      const tabId = await queryActiveTabId()
      await injectScanner(tabId)
      await new Promise<void>((resolve, reject) => {
        chrome.tabs.sendMessage(
          tabId,
          { type: APPLY_TEMPLATE_MESSAGE, template: selectedTemplate },
          response => {
            const err = chrome.runtime.lastError
            if (err) {
              reject(new Error(err.message))
              return
            }
            if (!response?.ok) {
              reject(new Error(response?.error ?? '应用模板失败'))
              return
            }
            resolve()
          }
        )
      })
      setStatus({ kind: 'success', text: '模板已应用' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '应用模板失败'
      })
    }
  }

  const clearTemplateFromPage = async () => {
    if (!chromeReady) {
      setStatus({ kind: 'error', text: '扩展上下文不可用' })
      return
    }
    try {
      const tabId = await queryActiveTabId()
      await injectScanner(tabId)
      await new Promise<void>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: CLEAR_TEMPLATE_MESSAGE }, response => {
          const err = chrome.runtime.lastError
          if (err) {
            reject(new Error(err.message))
            return
          }
          if (!response?.ok) {
            reject(new Error(response?.error ?? '清理模板失败'))
            return
          }
          resolve()
        })
      })
      setStatus({ kind: 'success', text: '已移除页面模板 UI' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '移除模板失败'
      })
    }
  }

  return (
    <div className="popup">
      <header className="header">
        <h1>Links Hero</h1>
        <button onClick={handleScan} disabled={loading || !chromeReady}>
          {loading ? '扫描中…' : '扫描当前页'}
        </button>
      </header>

      <section className="config">
        <h2>aria2 配置</h2>
        <label>
          RPC 地址
          <input
            type="url"
            value={ariaConfig.endpoint}
            onChange={event => setAriaConfig({ ...ariaConfig, endpoint: event.target.value })}
            placeholder="http://127.0.0.1:6800/jsonrpc"
          />
        </label>
        <label>
          Token（可选）
          <input
            type="text"
            value={ariaConfig.token ?? ''}
            onChange={event => setAriaConfig({ ...ariaConfig, token: event.target.value })}
            placeholder="token:xxxx"
          />
        </label>
        <label>
          下载目录（可选）
          <input
            type="text"
            value={ariaConfig.dir ?? ''}
            onChange={event => setAriaConfig({ ...ariaConfig, dir: event.target.value })}
            placeholder="/data/downloads"
          />
        </label>
        <button onClick={handleSaveConfig} disabled={savingConfig}>
          {savingConfig ? '保存中…' : '保存配置'}
        </button>
      </section>

      <section className="templates">
        <h2>站点模板</h2>
        <div className="template-actions">
          <button onClick={applyTemplateToPage} disabled={!selectedTemplate}>
            启用模板
          </button>
          <button onClick={clearTemplateFromPage}>移除页面 UI</button>
        </div>
        {templates.length === 0 ? (
          <p className="empty">暂无模板，先创建一个。</p>
        ) : (
          <ul className="template-list">
            {templates.map(template => (
              <li key={template.id}>
                <label>
                  <input
                    type="radio"
                    name="template"
                    value={template.id}
                    checked={selectedTemplateId === template.id}
                    onChange={() => setSelectedTemplateId(template.id)}
                  />
                  <div>
                    <span className="template-name">{template.name}</span>
                    <span className="template-meta">
                      {template.match.hostSuffix?.join(', ') || '*'} /{' '}
                      {template.match.pathRegex || '.*'}
                    </span>
                    <span className="template-meta">
                      row: {template.selectors.row} | link: {template.selectors.link}
                    </span>
                  </div>
                </label>
                <button onClick={() => handleTemplateDelete(template.id)}>删除</button>
              </li>
            ))}
          </ul>
        )}

        <div className="template-form">
          <h3>新建模板</h3>
          <label>
            名称
            <input
              type="text"
              value={templateForm.name}
              onChange={event => setTemplateForm(prev => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Host 后缀（逗号分隔）
            <input
              type="text"
              value={templateForm.hostSuffix}
              onChange={event =>
                setTemplateForm(prev => ({ ...prev, hostSuffix: event.target.value }))
              }
            />
          </label>
          <label>
            Path 正则
            <input
              type="text"
              value={templateForm.pathRegex}
              onChange={event =>
                setTemplateForm(prev => ({ ...prev, pathRegex: event.target.value }))
              }
            />
          </label>
          <label>
            行选择器
            <input
              type="text"
              value={templateForm.row}
              onChange={event => setTemplateForm(prev => ({ ...prev, row: event.target.value }))}
              placeholder="table tr"
            />
          </label>
          <label>
            链接选择器
            <input
              type="text"
              value={templateForm.link}
              onChange={event => setTemplateForm(prev => ({ ...prev, link: event.target.value }))}
              placeholder="a[href^='magnet:']"
            />
          </label>
          <label>
            标题选择器（可选）
            <input
              type="text"
              value={templateForm.title}
              onChange={event => setTemplateForm(prev => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <button onClick={handleTemplateCreate}>添加模板</button>
        </div>
      </section>

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
        <h2>过滤与整理</h2>
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

