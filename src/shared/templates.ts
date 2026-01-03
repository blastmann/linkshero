import type { TemplateDefinition } from './types'

const TEMPLATE_KEY = 'linksHero.templates'

export async function getTemplates(): Promise<TemplateDefinition[]> {
  if (!chrome?.storage?.sync) {
    return []
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get([TEMPLATE_KEY], result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve((result[TEMPLATE_KEY] as TemplateDefinition[]) ?? [])
      })
    } catch (error) {
      reject(error)
    }
  })
}

export async function saveTemplate(template: TemplateDefinition): Promise<void> {
  if (!chrome?.storage?.sync) {
    return
  }

  const templates = await getTemplates()
  const existingIndex = templates.findIndex(item => item.id === template.id)

  if (existingIndex >= 0) {
    templates[existingIndex] = template
  } else {
    templates.push(template)
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set({ [TEMPLATE_KEY]: templates }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve()
      })
    } catch (error) {
      reject(error)
    }
  })
}

export async function deleteTemplate(id: string): Promise<void> {
  if (!chrome?.storage?.sync) {
    return
  }

  const templates = await getTemplates()
  const next = templates.filter(template => template.id !== id)

  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set({ [TEMPLATE_KEY]: next }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve()
      })
    } catch (error) {
      reject(error)
    }
  })
}

