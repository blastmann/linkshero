import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
import { APPLY_TEMPLATE_MESSAGE, CLEAR_TEMPLATE_MESSAGE } from '../shared/messages'
import { getLlmConfig, saveLlmConfig } from '../shared/llm-config'
import { deleteSiteRule, getPresetSiteRules, getSiteRules, saveSiteRule } from '../shared/site-rules'
import { getAria2Config, saveAria2Config } from '../shared/storage'
import { deleteTemplate, getTemplates, saveTemplate } from '../shared/templates'
import type { Aria2Config, LlmConfig, SiteRuleDefinition, TemplateDefinition } from '../shared/types'

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
  const [siteRules, setSiteRules] = useState<SiteRuleDefinition[]>([])
  const [ruleForm, setRuleForm] = useState({
    name: '',
    hostSuffix: '',
    pathRegex: '',
    mode: 'row' as SiteRuleDefinition['mode'],
    row: '',
    link: '',
    title: ''
  })
  const [savingRule, setSavingRule] = useState(false)
  const [llmConfig, setLlmConfig] = useState<LlmConfig>({
    enabled: false,
    provider: 'openai-compatible',
    baseUrl: '',
    model: '',
    apiKey: '',
    temperature: 0.2,
    maxItems: 120,
    batchSize: 40
  })
  const [savingLlmConfig, setSavingLlmConfig] = useState(false)

  useEffect(() => {
    async function bootstrap() {
      try {
        const [config, storedTemplates, storedRules, storedLlmConfig] = await Promise.all([
          getAria2Config(),
          getTemplates(),
          getSiteRules(),
          getLlmConfig()
        ])
        setAriaConfig(config)
        setTemplates(storedTemplates)
        setSiteRules(storedRules)
        setLlmConfig(storedLlmConfig)
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

  const createRuleId = () =>
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

  const handleAddRule = async () => {
    if (!ruleForm.link || (ruleForm.mode === 'row' && !ruleForm.row)) {
      setStatus({ kind: 'error', text: '请填写链接选择器，行模式需填写行选择器' })
      return
    }

    const newRule: SiteRuleDefinition = {
      id: createRuleId(),
      name: ruleForm.name || `规则 ${siteRules.length + 1}`,
      enabled: true,
      mode: ruleForm.mode,
      match: {
        hostSuffix: ruleForm.hostSuffix
          .split(',')
          .map(item => item.trim())
          .filter(Boolean),
        pathRegex: ruleForm.pathRegex || undefined
      },
      selectors: {
        row: ruleForm.mode === 'row' ? ruleForm.row : undefined,
        link: ruleForm.link,
        title: ruleForm.title || undefined
      }
    }

    setSavingRule(true)
    try {
      await saveSiteRule(newRule)
      setSiteRules(prev => [...prev, newRule])
      setRuleForm({
        name: '',
        hostSuffix: '',
        pathRegex: '',
        mode: 'row',
        row: '',
        link: '',
        title: ''
      })
      setStatus({ kind: 'success', text: '站点规则已保存' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '保存站点规则失败'
      })
    } finally {
      setSavingRule(false)
    }
  }

  const handleDeleteRule = async (id: string) => {
    try {
      await deleteSiteRule(id)
      setSiteRules(prev => prev.filter(rule => rule.id !== id))
      setStatus({ kind: 'success', text: '站点规则已删除' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '删除站点规则失败'
      })
    }
  }

  const toggleRuleEnabled = async (rule: SiteRuleDefinition) => {
    const nextRule = { ...rule, enabled: !rule.enabled }
    try {
      await saveSiteRule(nextRule)
      setSiteRules(prev => prev.map(item => (item.id === rule.id ? nextRule : item)))
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '更新站点规则失败'
      })
    }
  }

  const handleImportPresets = async () => {
    const presets = getPresetSiteRules()
    const existingIds = new Set(siteRules.map(rule => rule.id))
    const next = presets.filter(rule => !existingIds.has(rule.id))
    if (next.length === 0) {
      setStatus({ kind: 'info', text: '示例规则已全部导入' })
      return
    }
    try {
      for (const rule of next) {
        await saveSiteRule(rule)
      }
      setSiteRules(prev => [...prev, ...next])
      setStatus({ kind: 'success', text: `已导入 ${next.length} 条示例规则` })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '导入示例规则失败'
      })
    }
  }

  const handleSaveLlmConfig = async () => {
    setSavingLlmConfig(true)
    try {
      if (llmConfig.enabled && llmConfig.baseUrl && chrome?.permissions?.request) {
        let origin = ''
        try {
          origin = `${new URL(llmConfig.baseUrl).origin}/*`
        } catch {
          throw new Error('LLM API Base URL 无效')
        }
        const granted = await chrome.permissions.request({ origins: [origin] })
        if (!granted) {
          throw new Error('未授予 LLM API 域名访问权限')
        }
      }
      await saveLlmConfig(llmConfig)
      setStatus({ kind: 'success', text: 'LLM 配置已保存' })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '保存 LLM 配置失败'
      })
    } finally {
      setSavingLlmConfig(false)
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
          target: { tabId, allFrames: true },
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

  const listFrameIds = async (tabId: number): Promise<number[]> => {
    const framesResult = await chrome.webNavigation
      .getAllFrames({ tabId })
      .catch(() => undefined as chrome.webNavigation.GetAllFrameDetails[] | undefined)
    const frames = Array.isArray(framesResult) ? framesResult : []
    return frames.length
      ? frames.map(frame => (frame as chrome.webNavigation.GetAllFrameDetails & { frameId?: number }).frameId ?? 0)
      : [0]
  }

  const sendMessage = async <T,>(tabId: number, message: unknown, frameId?: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      const callback = (response: unknown) => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message))
          return
        }
        resolve(response as T)
      }
      if (frameId !== undefined) {
        chrome.tabs.sendMessage(tabId, message, { frameId }, callback)
        return
      }
      chrome.tabs.sendMessage(tabId, message, callback)
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
      const frameIds = await listFrameIds(tab.id)
      const results = await Promise.allSettled(
        frameIds.map(frameId =>
          sendMessage<{ ok: boolean; error?: string }>(tab.id, {
            type: APPLY_TEMPLATE_MESSAGE,
            template: selectedTemplate
          }, frameId)
        )
      )
      const okResult = results.find(
        result => result.status === 'fulfilled' && result.value.ok
      ) as PromiseFulfilledResult<{ ok: boolean; error?: string }> | undefined
      if (okResult?.value.ok) {
        setStatus({ kind: 'success', text: '模板已应用到当前页面' })
        return
      }
      const errorResult = results.find(
        result => result.status === 'fulfilled' && !result.value.ok
      ) as PromiseFulfilledResult<{ ok: boolean; error?: string }> | undefined
      if (errorResult?.value.error) {
        throw new Error(errorResult.value.error)
      }
      const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined
      if (rejected?.reason) {
        throw rejected.reason
      }
      throw new Error('模板未能应用到当前页面')
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
      const frameIds = await listFrameIds(tab.id)
      const results = await Promise.allSettled(
        frameIds.map(frameId =>
          sendMessage<{ ok: boolean; error?: string }>(
            tab.id,
            { type: CLEAR_TEMPLATE_MESSAGE },
            frameId
          )
        )
      )
      const okResult = results.find(
        result => result.status === 'fulfilled' && result.value.ok
      ) as PromiseFulfilledResult<{ ok: boolean; error?: string }> | undefined
      if (okResult?.value.ok) {
        setStatus({ kind: 'success', text: '已移除页面上的模板 UI' })
        return
      }
      const errorResult = results.find(
        result => result.status === 'fulfilled' && !result.value.ok
      ) as PromiseFulfilledResult<{ ok: boolean; error?: string }> | undefined
      if (errorResult?.value.error) {
        throw new Error(errorResult.value.error)
      }
      const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult | undefined
      if (rejected?.reason) {
        throw rejected.reason
      }
      throw new Error('未能移除模板 UI')
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
          <p>管理 aria2 配置、站点规则/模板与 LLM 聚合行为。</p>
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
            <h2>LLM 聚合</h2>
            <label>
              启用 LLM 聚合
              <input
                type="checkbox"
                checked={llmConfig.enabled}
                onChange={event => setLlmConfig({ ...llmConfig, enabled: event.target.checked })}
              />
            </label>
            <label>
              API Base URL（OpenAI 兼容）
              <input
                type="url"
                value={llmConfig.baseUrl}
                onChange={event => setLlmConfig({ ...llmConfig, baseUrl: event.target.value })}
              />
            </label>
            <label>
              模型名称
              <input
                type="text"
                value={llmConfig.model}
                onChange={event => setLlmConfig({ ...llmConfig, model: event.target.value })}
              />
            </label>
            <label>
              API Key
              <input
                type="password"
                value={llmConfig.apiKey ?? ''}
                onChange={event => setLlmConfig({ ...llmConfig, apiKey: event.target.value })}
              />
            </label>
            <div className="inline-fields">
              <label>
                Temperature
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={llmConfig.temperature}
                  onChange={event =>
                    setLlmConfig({ ...llmConfig, temperature: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                最大条目数
                <input
                  type="number"
                  min="10"
                  value={llmConfig.maxItems}
                  onChange={event =>
                    setLlmConfig({ ...llmConfig, maxItems: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                每批条目数
                <input
                  type="number"
                  min="5"
                  value={llmConfig.batchSize}
                  onChange={event =>
                    setLlmConfig({ ...llmConfig, batchSize: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <p className="helper">
              提示：LLM 会接收链接标题与 URL 进行聚合，请确认可接受数据出域。
            </p>
            <button onClick={handleSaveLlmConfig} disabled={savingLlmConfig}>
              {savingLlmConfig ? '保存中…' : '保存 LLM 配置'}
            </button>
          </section>

          <section>
            <h2>站点规则（用于扫描）</h2>
            {siteRules.length === 0 ? (
              <p>暂无规则，可手动添加或导入示例规则。</p>
            ) : (
              <ul className="rule-list">
                {siteRules.map(rule => (
                  <li key={rule.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => toggleRuleEnabled(rule)}
                      />
                      <div>
                        <span className="name">{rule.name}</span>
                        <span className="meta">
                          {rule.match.hostSuffix?.join(', ') || '*'} / {rule.match.pathRegex || '.*'}
                        </span>
                        <span className="meta">
                          {rule.mode} | link: {rule.selectors.link}
                        </span>
                      </div>
                    </label>
                    <button onClick={() => handleDeleteRule(rule.id)}>删除</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="template-actions">
              <button onClick={handleImportPresets}>导入示例规则</button>
            </div>

            <div className="template-form">
              <h3>新建站点规则</h3>
              <label>
                名称
                <input
                  type="text"
                  value={ruleForm.name}
                  onChange={event => setRuleForm(prev => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label>
                Host 后缀（逗号分隔）
                <input
                  type="text"
                  value={ruleForm.hostSuffix}
                  onChange={event =>
                    setRuleForm(prev => ({ ...prev, hostSuffix: event.target.value }))
                  }
                />
              </label>
              <label>
                Path 正则
                <input
                  type="text"
                  value={ruleForm.pathRegex}
                  onChange={event =>
                    setRuleForm(prev => ({ ...prev, pathRegex: event.target.value }))
                  }
                />
              </label>
              <label>
                模式
                <select
                  value={ruleForm.mode}
                  onChange={event =>
                    setRuleForm(prev => ({
                      ...prev,
                      mode: event.target.value as SiteRuleDefinition['mode']
                    }))
                  }
                >
                  <option value="row">行模式</option>
                  <option value="page">页面模式</option>
                </select>
              </label>
              {ruleForm.mode === 'row' && (
                <label>
                  行选择器
                  <input
                    type="text"
                    value={ruleForm.row}
                    onChange={event => setRuleForm(prev => ({ ...prev, row: event.target.value }))}
                  />
                </label>
              )}
              <label>
                链接选择器
                <input
                  type="text"
                  value={ruleForm.link}
                  onChange={event => setRuleForm(prev => ({ ...prev, link: event.target.value }))}
                />
              </label>
              <label>
                标题选择器（可选）
                <input
                  type="text"
                  value={ruleForm.title}
                  onChange={event => setRuleForm(prev => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <button onClick={handleAddRule} disabled={savingRule}>
                {savingRule ? '保存中…' : '添加站点规则'}
              </button>
            </div>
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

