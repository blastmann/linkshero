import { useEffect, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
import { getSiteRules } from '../shared/site-rules'
import { getAria2Config, saveAria2Config } from '../shared/storage'
import type { Aria2Config, SiteRuleDefinition } from '../shared/types'
import { IconGear, IconList } from '../shared/icons'

type Status = { kind: 'success' | 'error' | 'info'; text: string } | null

const App = () => {
  const [ariaConfig, setAriaConfig] = useState<Aria2Config>({
    endpoint: DEFAULT_ARIA2_ENDPOINT
  })
  const [status, setStatus] = useState<Status>(null)
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [siteRules, setSiteRules] = useState<SiteRuleDefinition[]>([])

  useEffect(() => {
    async function bootstrap() {
      try {
        const [config, storedRules] = await Promise.all([
          getAria2Config(),
          getSiteRules()
        ])
        setAriaConfig(config)
        setSiteRules(storedRules)
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

  // NOTE: 之前模板功能需要注入 content script 并对当前标签页发消息；模板移除后，这里只保留 Options 侧配置能力。

  return (
    <div className="options-page">
      <header>
        <div>
          <h1 className="title">
            <IconGear className="title-icon" />
            Links Hero 设置
          </h1>
          <p>管理 aria2 配置。</p>
        </div>
      </header>

      {loading ? (
        <p>加载中…</p>
      ) : (
        <>
          <section>
            <h2 className="section-title">
              <IconGear className="section-icon" />
              aria2 配置
            </h2>
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
            <h2 className="section-title">
              <IconList className="section-icon" />
              站点规则（用于扫描）
            </h2>
            {siteRules.length === 0 ? (
              <p>暂无站点规则，将使用通用扫描规则。</p>
            ) : (
              <ul className="rule-list">
                {siteRules.map(rule => (
                  <li key={rule.id}>
                    <div>
                      <span className="name">{rule.name}</span>
                      <span className="meta">
                        {rule.match.hostSuffix?.join(', ') || '*'} / {rule.match.pathRegex || '.*'}
                      </span>
                      <span className="meta">
                        {rule.mode} | link: {rule.selectors.link}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </div>
  )
}

export default App

