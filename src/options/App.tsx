import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
import { APPLY_TEMPLATE_MESSAGE, CLEAR_TEMPLATE_MESSAGE } from '../shared/messages'
import { getAria2Config, saveAria2Config } from '../shared/storage'
import { deleteTemplate, getTemplates, saveTemplate } from '../shared/templates'
import type { Aria2Config, TemplateDefinition } from '../shared/types'

type Status = { kind: 'success' | 'error' | 'info'; text: string } | null

const chromeReady = typeof chrome !== 'undefined' && !!chrome.tabs

const App = () => {
  const [ariaConfig, setAriaConfig] = useState<Aria2Config>({
    endpoint: DEFAULT_ARIA2_ENDPOINT
  })
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
  const [status, setStatus] = useState<Status>(null)
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)

  useEffect(() => {
    async function bootstrap() {
      try {
        const [config, storedTemplates] = await Promise.all([getAria2Config(), getTemplates()])
        setAriaConfig(config)
        setTemplates(storedTemplates)
      } catch (error) {
        setStatus({
          kind: 'error',
          text: error instanceof Error ? error.message : '加载配置失败'
        })
      } finally {
        setLoading(false)
      }
    }

    void bootstrap()
  }, [])

  const selectedTemplate = useMemo(
    () => templates.find(item => item.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  )

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await saveAria2Config(ariaConfig)
      setStatus({ kind: 'success', text: '配置已保存' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '保存配置失败'
      })
    } finally {
      setSavingConfig(false)
    }
  }

  const createTemplateId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`

  const handleAddTemplate = async () => {
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

    setSavingTemplate(true)
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
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
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
        text: error instanceof Error ? error.message : '删除模板失败'
      })
    }
  }

  interface ActiveTab {
    id: number
    url?: string
  }

  const isInjectableUrl = (url?: string | null) => {
    if (!url) {
      return true
    }
    return /^(https?|file|ftp):/i.test(url)
  }

  const queryActiveTab = async (): Promise<ActiveTab> => {
    if (!chromeReady) {
      throw new Error('扩展上下文不可用')
    }
    return new Promise<ActiveTab>((resolve, reject) => {
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

  const injectScanner = async (tabId: number) => {
    await new Promise<void>((resolve, reject) => {
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

  const sendMessage = async <T,>(tabId: number, message: unknown): Promise<T> => {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, response => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message))
          return
        }
        resolve(response as T)
      })
    })
  }

  const applyTemplateToCurrentPage = async () => {
    if (!selectedTemplate) {
      setStatus({ kind: 'error', text: '请先选择模板' })
      return
    }

    try {
      const tab = await queryActiveTab()
      if (!isInjectableUrl(tab.url)) {
        setStatus({ kind: 'error', text: '当前页面无法注入，请切换到普通网页后再试' })
        return
      }
      await injectScanner(tab.id)
      await sendMessage<{ ok: boolean; error?: string }>(tab.id, {
        type: APPLY_TEMPLATE_MESSAGE,
        template: selectedTemplate
      })
      setStatus({ kind: 'success', text: '模板已应用到当前页面' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '应用模板失败'
      })
    }
  }

  const clearTemplateUI = async () => {
    try {
      const tab = await queryActiveTab()
      if (!isInjectableUrl(tab.url)) {
        setStatus({ kind: 'error', text: '当前页面无法注入，请切换到普通网页后再试' })
        return
      }
      await injectScanner(tab.id)
      await sendMessage<{ ok: boolean; error?: string }>(tab.id, {
        type: CLEAR_TEMPLATE_MESSAGE
      })
      setStatus({ kind: 'success', text: '已移除页面上的模板 UI' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '移除模板失败'
      })
    }
  }

  return (
    <div className="options-page">
      <header>
        <div>
          <h1>Links Hero 设置</h1>
          <p>管理 aria2 配置、站点模板与页面注入行为。</p>
        </div>
      </header>

      {loading ? (
        <p>加载中…</p>
      ) : (
        <>
          <section>
            <h2>aria2 配置</h2>
            <label>
              RPC 地址
              <input
                type="url"
                value={ariaConfig.endpoint}
                onChange={event => setAriaConfig({ ...ariaConfig, endpoint: event.target.value })}
              />
            </label>
            <label>
              Token（可选）
              <input
                type="text"
                value={ariaConfig.token ?? ''}
                onChange={event => setAriaConfig({ ...ariaConfig, token: event.target.value })}
              />
            </label>
            <label>
              下载目录（可选）
              <input
                type="text"
                value={ariaConfig.dir ?? ''}
                onChange={event => setAriaConfig({ ...ariaConfig, dir: event.target.value })}
              />
            </label>
            <button onClick={handleSaveConfig} disabled={savingConfig}>
              {savingConfig ? '保存中…' : '保存配置'}
            </button>
          </section>

          <section>
            <h2>站点模板</h2>
            {templates.length === 0 ? (
              <p>暂无模板，创建后可以快速批量选择。</p>
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
                        <span className="name">{template.name}</span>
                        <span className="meta">
                          {template.match.hostSuffix?.join(', ') || '*'} /{' '}
                          {template.match.pathRegex || '.*'}
                        </span>
                        <span className="meta">
                          row: {template.selectors.row} | link: {template.selectors.link}
                        </span>
                      </div>
                    </label>
                    <button onClick={() => handleDeleteTemplate(template.id)}>删除</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="template-actions">
              <button onClick={applyTemplateToCurrentPage} disabled={!selectedTemplate}>
                应用到当前页
              </button>
              <button onClick={clearTemplateUI}>移除模板 UI</button>
            </div>

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
                  onChange={event =>
                    setTemplateForm(prev => ({ ...prev, link: event.target.value }))
                  }
                  placeholder="a[href^='magnet:']"
                />
              </label>
              <label>
                标题选择器（可选）
                <input
                  type="text"
                  value={templateForm.title}
                  onChange={event =>
                    setTemplateForm(prev => ({ ...prev, title: event.target.value }))
                  }
                />
              </label>
              <button onClick={handleAddTemplate} disabled={savingTemplate}>
                {savingTemplate ? '保存中…' : '添加模板'}
              </button>
            </div>
          </section>
        </>
      )}

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </div>
  )
}

export default App

