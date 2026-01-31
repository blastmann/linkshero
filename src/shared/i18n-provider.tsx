import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getGeneralConfig, saveGeneralConfig } from './storage'
import { fetchLocaleMessages, resolveLanguage, setGlobalMessages, t as i18nT } from './i18n'
import type { AppLanguage } from './types'

interface I18nContextType {
    t: (key: string, substitutions?: string | string[]) => string
    language: AppLanguage
    setLanguage: (lang: AppLanguage) => Promise<void>
    ready: boolean
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
    const [language, setInternalLanguage] = useState<AppLanguage>('auto')
    const [ready, setReady] = useState(false)

    // Load initial config
    useEffect(() => {
        getGeneralConfig().then(async config => {
            setInternalLanguage(config.language) // Triggers re-render but we wait for messages

            if (config.language !== 'auto') {
                const msgs = await fetchLocaleMessages(resolveLanguage(config.language))
                setGlobalMessages(msgs)
            } else {
                setGlobalMessages(null)
            }
            setReady(true)
        })
    }, [])

    const setLanguage = async (newLang: AppLanguage) => {
        setReady(false)
        setInternalLanguage(newLang)

        await saveGeneralConfig({ language: newLang })

        if (newLang === 'auto') {
            setGlobalMessages(null)
        } else {
            const msgs = await fetchLocaleMessages(resolveLanguage(newLang))
            setGlobalMessages(msgs)
        }
        setReady(true)
    }

    // Wrapper for t that just calls the global t (which now references globalMessages)
    const t = (key: string, substitutions?: string | string[]): string => {
        return i18nT(key, substitutions)
    }

    return (
        <I18nContext.Provider value={{ t, language, setLanguage, ready }}>
            {children}
        </I18nContext.Provider>
    )
}

export function useTranslation() {
    const context = useContext(I18nContext)
    if (!context) {
        throw new Error('useTranslation must be used within I18nProvider')
    }
    return context
}
