import type { LinkItem, LlmConfig } from '../shared/types'
import { getLlmConfig } from '../shared/llm-config'

type LlmItem = {
  url: string
  title?: string
  series?: string
  episode?: string
  valid?: boolean
  confidence?: number
}

type LlmResponse = {
  items: LlmItem[]
}

function buildPrompt(links: LinkItem[], context: { host: string; url: string }): string {
  const lines = links.map(link => ({
    url: link.url,
    title: link.title,
    source: link.sourceHost,
    seeders: link.seeders,
    leechers: link.leechers
  }))

  return [
    '请基于以下链接列表做两件事：',
    '1) 识别是否为有效下载链接（valid 字段）',
    '2) 将剧集/系列按标题聚合，输出 series 与 episode（如果能解析）',
    '输出严格 JSON：{"items":[...]}，items 中每个对象包含 url、title、series、episode、valid、confidence。',
    `页面：${context.url || ''}`,
    `站点：${context.host || ''}`,
    '链接列表：',
    JSON.stringify(lines)
  ].join('\n')
}

function parseJsonPayload(text: string): LlmResponse | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as LlmResponse
  } catch {
    return null
  }
}

async function callOpenAiCompatible(config: LlmConfig, prompt: string): Promise<string> {
  const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey ?? ''}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      messages: [
        {
          role: 'system',
          content: '你是一个负责整理下载链接的助手，只输出 JSON，不要额外文本。'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM 请求失败: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('LLM 返回为空')
  }
  return content
}

function toLinkItems(items: LlmItem[], source: Map<string, LinkItem>): LinkItem[] {
  const result: LinkItem[] = []
  items.forEach(item => {
    if (!item.url) {
      return
    }
    if (item.valid === false) {
      return
    }
    const base = source.get(item.url)
    if (!base) {
      return
    }
    const title =
      item.title ||
      [item.series, item.episode].filter(Boolean).join(' ') ||
      base.title ||
      base.url
    result.push({
      ...base,
      title
    })
  })
  return result
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items]
  }
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function aggregateLinksWithLlm(
  links: LinkItem[],
  context: { host: string; url: string }
): Promise<{ ok: boolean; links?: LinkItem[]; error?: string }> {
  const config = await getLlmConfig()
  if (!config.enabled) {
    return { ok: true, links }
  }
  if (!config.baseUrl || !config.model || !config.apiKey) {
    return { ok: false, error: 'LLM 配置不完整' }
  }

  const limited = links.slice(0, Math.max(1, config.maxItems))
  const batches = chunk(limited, Math.max(1, config.batchSize))
  const linkMap = new Map(limited.map(link => [link.url, link]))
  const aggregated: LinkItem[] = []
  const dedupe = new Set<string>()

  for (const batch of batches) {
    const prompt = buildPrompt(batch, context)
    const raw = await callOpenAiCompatible(config, prompt)
    const parsed = parseJsonPayload(raw)
    if (!parsed?.items?.length) {
      continue
    }
    const items = toLinkItems(parsed.items, linkMap)
    items.forEach(item => {
      if (dedupe.has(item.url)) {
        return
      }
      dedupe.add(item.url)
      aggregated.push(item)
    })
  }

  return { ok: true, links: aggregated.length ? aggregated : limited }
}
