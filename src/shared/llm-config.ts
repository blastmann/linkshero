import { STORAGE_KEYS } from './constants'
import type { LlmConfig } from './types'

const defaultLlmConfig: LlmConfig = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: '',
  model: '',
  apiKey: '',
  temperature: 0.2,
  maxItems: 120,
  batchSize: 40
}

function withStorage<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return Promise.resolve(fn())
  } catch (error) {
    return Promise.reject(error)
  }
}

export async function getLlmConfig(): Promise<LlmConfig> {
  if (!chrome?.storage?.sync) {
    return defaultLlmConfig
  }

  return withStorage(
    () =>
      new Promise<LlmConfig>((resolve, reject) => {
        chrome.storage.sync.get([STORAGE_KEYS.llmConfig], result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve({ ...defaultLlmConfig, ...(result[STORAGE_KEYS.llmConfig] ?? {}) })
        })
      })
  )
}

export async function saveLlmConfig(config: LlmConfig): Promise<void> {
  if (!chrome?.storage?.sync) {
    return
  }

  const trimmed: LlmConfig = {
    ...defaultLlmConfig,
    ...config,
    baseUrl: config.baseUrl.trim(),
    model: config.model.trim(),
    apiKey: config.apiKey?.trim()
  }

  return withStorage(
    () =>
      new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ [STORAGE_KEYS.llmConfig]: trimmed }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        })
      })
  )
}
