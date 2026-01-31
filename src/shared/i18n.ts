import type { AppLanguage } from './types'

let globalMessages: Record<string, { message: string, placeholders?: Record<string, { content: string }> }> | null = null

export function setGlobalMessages(messages: Record<string, { message: string, placeholders?: Record<string, { content: string }> }> | null) {
    globalMessages = messages
}

export function replacePlaceholders(msgEntry: { message: string, placeholders?: Record<string, { content: string }> }, substitutions?: string | string[]): string {
    let text = msgEntry.message
    if (!substitutions) return text

    const subs = Array.isArray(substitutions) ? substitutions : [substitutions]

    if (msgEntry.placeholders) {
        for (const [name, config] of Object.entries(msgEntry.placeholders)) {
            const indexStr = config.content.replace('$', '')
            const index = parseInt(indexStr, 10) - 1
            if (!isNaN(index) && index >= 0 && index < subs.length) {
                const regex = new RegExp(`\\$${name}\\$`, 'gi')
                text = text.replace(regex, subs[index])
            }
        }
    } else {
        // Fallback for direct $1, $2.. replacements if no placeholders map is defined
        subs.forEach((sub, i) => {
            text = text.replace(`$${i + 1}`, sub)
        })
    }
    return text
}

export function t(key: string, substitutions?: string | string[]): string {
    if (globalMessages && globalMessages[key]) {
        return replacePlaceholders(globalMessages[key], substitutions)
    }
    return chrome.i18n.getMessage(key, substitutions)
}

export function currentLocale(): string {
    return chrome.i18n.getUILanguage()
}

export function resolveLanguage(lang: AppLanguage): string {
    if (lang === 'auto') {
        return currentLocale()
    }
    return lang
}

export async function fetchLocaleMessages(lang: string): Promise<Record<string, { message: string }>> {
    try {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`)
        const res = await fetch(url)
        return await res.json()
    } catch (error) {
        console.error(`Failed to fetch locale messages for ${lang}`, error)
        return {}
    }
}
