import { DEFAULT_ARIA2_ENDPOINT, STORAGE_KEYS } from './constants'
import type { Aria2Config } from './types'

const defaultConfig: Aria2Config = {
  endpoint: DEFAULT_ARIA2_ENDPOINT
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

