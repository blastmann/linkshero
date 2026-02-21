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

function getChromeApi(): typeof chrome | undefined {
  return (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
}

export async function getAria2Config(): Promise<Aria2Config> {
  const chromeApi = getChromeApi()
  if (!chromeApi?.storage?.sync) {
    return defaultConfig
  }

  return withStorage(
    () =>
      new Promise<Aria2Config>((resolve, reject) => {
        chromeApi.storage.sync.get([STORAGE_KEYS.aria2Config], result => {
          if (chromeApi.runtime.lastError) {
            reject(new Error(chromeApi.runtime.lastError.message))
            return
          }
          resolve({ ...defaultConfig, ...(result[STORAGE_KEYS.aria2Config] ?? {}) })
        })
      })
  )
}

export async function saveAria2Config(config: Aria2Config): Promise<void> {
  const chromeApi = getChromeApi()
  if (!chromeApi?.storage?.sync) {
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
        chromeApi.storage.sync.set({ [STORAGE_KEYS.aria2Config]: trimmed }, () => {
          if (chromeApi.runtime.lastError) {
            reject(new Error(chromeApi.runtime.lastError.message))
            return
          }
          resolve()
        })
      })
  )
}

export async function getGeneralConfig(): Promise<GeneralConfig> {
  const chromeApi = getChromeApi()
  if (!chromeApi?.storage?.sync) {
    return defaultGeneralConfig
  }

  return withStorage(
    () =>
      new Promise<GeneralConfig>((resolve, reject) => {
        chromeApi.storage.sync.get([STORAGE_KEYS.generalConfig], result => {
          if (chromeApi.runtime.lastError) {
            reject(new Error(chromeApi.runtime.lastError.message))
            return
          }
          resolve({ ...defaultGeneralConfig, ...(result[STORAGE_KEYS.generalConfig] ?? {}) })
        })
      })
  )
}

export async function saveGeneralConfig(config: GeneralConfig): Promise<void> {
  const chromeApi = getChromeApi()
  if (!chromeApi?.storage?.sync) {
    return
  }

  return withStorage(
    () =>
      new Promise<void>((resolve, reject) => {
        chromeApi.storage.sync.set({ [STORAGE_KEYS.generalConfig]: config }, () => {
          if (chromeApi.runtime.lastError) {
            reject(new Error(chromeApi.runtime.lastError.message))
            return
          }
          resolve()
        })
      })
  )
}
