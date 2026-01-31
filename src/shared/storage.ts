import { DEFAULT_ARIA2_ENDPOINT, STORAGE_KEYS } from './constants'
import type { Aria2Config, GeneralConfig } from './types'

const defaultConfig: Aria2Config = {
  endpoint: DEFAULT_ARIA2_ENDPOINT
}

const defaultGeneralConfig: GeneralConfig = {
  language: 'auto'
}

function withStorage<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return Promise.resolve(fn())
  } catch (error) {
    return Promise.reject(error)
  }
}

export async function getAria2Config(): Promise<Aria2Config> {
  if (!chrome?.storage?.sync) {
    return defaultConfig
  }

  return withStorage(
    () =>
      new Promise<Aria2Config>((resolve, reject) => {
        chrome.storage.sync.get([STORAGE_KEYS.aria2Config], result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve({ ...defaultConfig, ...(result[STORAGE_KEYS.aria2Config] ?? {}) })
        })
      })
  )
}

export async function saveAria2Config(config: Aria2Config): Promise<void> {
  if (!chrome?.storage?.sync) {
    return
  }

  const trimmed: Aria2Config = {
    endpoint: config.endpoint.trim() || defaultConfig.endpoint,
    token: config.token?.trim(),
    dir: config.dir?.trim() || undefined
  }

  return withStorage(
    () =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ [STORAGE_KEYS.aria2Config]: trimmed }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        })
      })
  )
}

export async function getGeneralConfig(): Promise<GeneralConfig> {
  if (!chrome?.storage?.sync) {
    return defaultGeneralConfig
  }

  return withStorage(
    () =>
      new Promise<GeneralConfig>((resolve, reject) => {
        chrome.storage.sync.get([STORAGE_KEYS.generalConfig], result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve({ ...defaultGeneralConfig, ...(result[STORAGE_KEYS.generalConfig] ?? {}) })
        })
      })
  )
}

export async function saveGeneralConfig(config: GeneralConfig): Promise<void> {
  if (!chrome?.storage?.sync) {
    return
  }

  return withStorage(
    () =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ [STORAGE_KEYS.generalConfig]: config }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        })
      })
  )
}
