import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_ARIA2_ENDPOINT } from '../shared/constants'
import { getSiteRules } from '../shared/site-rules'
import { getAria2Config, saveAria2Config } from '../shared/storage'
import type { Aria2Config, SiteRuleDefinition } from '../shared/types'
import { IconGear, IconList } from '../shared/icons'
import { useTranslation } from '../shared/i18n-provider'

type Status = { kind: 'success' | 'error' | 'info'; text: string } | null

const App = () => {
  const { t, language, setLanguage, ready } = useTranslation()
  const [ariaConfig, setAriaConfig] = useState<Aria2Config>({
    endpoint: DEFAULT_ARIA2_ENDPOINT
  })
  const [status, setStatus] = useState<Status>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [siteRules, setSiteRules] = useState<SiteRuleDefinition[]>([])

  const visibleRules = useMemo(() => {
    // 调试模式下显示所有规则，生产模式下隐藏内置规则
    if (import.meta.env.DEV) {
      return siteRules
    }
    return siteRules.filter(rule => !rule.id.startsWith('preset-'))
  }, [siteRules])

  const showRulesSection = import.meta.env.DEV || visibleRules.length > 0

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
          text: error instanceof Error ? error.message : t('optErrorLoad')
        })
      } finally {
        // loaded
      }
    }

    void bootstrap()
  }, [])

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await saveAria2Config(ariaConfig)
      setStatus({ kind: 'success', text: t('optSaved') })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : t('optErrorSave')
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
            <img className="app-logo" src="/icons/128x128.png" alt="" />
            {t('optTitle')}
          </h1>
          <p>{t('optDesc')}</p>
        </div>
        <div className="header-actions">
          <select
            value={language}
            onChange={e => setLanguage(e.target.value as any)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
          >
            <option value="auto">Auto</option>
            <option value="zh_CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </header>

      {!ready ? (
        <p>{t('optLoading')}</p>
      ) : (
        <>
          <section>
            <h2 className="section-title">
              <IconGear className="section-icon" />
              {t('sectAria')}
            </h2>
            <label>
              {t('lblRpc')}
              <input
                type="url"
                value={ariaConfig.endpoint}
                onChange={event => setAriaConfig({ ...ariaConfig, endpoint: event.target.value })}
              />
            </label>
            <label>
              {t('lblToken')}
              <input
                type="text"
                value={ariaConfig.token ?? ''}
                onChange={event => setAriaConfig({ ...ariaConfig, token: event.target.value })}
              />
            </label>
            <label>
              {t('lblDir')}
              <input
                type="text"
                value={ariaConfig.dir ?? ''}
                onChange={event => setAriaConfig({ ...ariaConfig, dir: event.target.value })}
              />
            </label>
            <button onClick={handleSaveConfig} disabled={savingConfig}>
              {savingConfig ? t('btnSaving') : t('btnSave')}
            </button>
          </section>

          {showRulesSection && (
            <section>
              <h2 className="section-title">
                <IconList className="section-icon" />
                {t('sectRules')}
              </h2>
              {visibleRules.length === 0 ? (
                <p>{t('noRules')}</p>
              ) : (
                <ul className="rule-list">
                  {visibleRules.map(rule => (
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
          )}
        </>
      )}

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </div>
  )
}

export default App

