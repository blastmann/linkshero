export interface LinkItem {
  id: string
  url: string
  title: string
  sourceHost: string
  selected?: boolean
  normalizedTitle?: string
  seeders?: number
  leechers?: number
  size?: string
}

export interface ScanResponse {
  success: boolean
  links?: LinkItem[]
  error?: string
}

export interface Aria2Config {
  endpoint: string
  token?: string
  dir?: string
}

export interface PushRequestPayload {
  links: LinkItem[]
  config: Aria2Config
}

export interface PushOutcome {
  succeeded: number
  failed: Array<{ url: string; reason: string }>
}

export interface TemplateMatch {
  hostSuffix?: string[]
  pathRegex?: string
}

export type SiteRuleMode = 'page' | 'row'

export interface SiteRuleSelectors {
  row?: string
  link: string
  title?: string
  seeders?: string
  leechers?: string
  size?: string
}

export interface SiteRuleDefinition {
  id: string
  name: string
  enabled: boolean
  mode: SiteRuleMode
  match: TemplateMatch
  selectors: SiteRuleSelectors
  extract?: {
    titleAttr?: string
    titleFallback?: Array<'magnetDn' | 'anchorText' | 'rowText' | 'href'>
  }
  follow?: {
    hrefSelector: string
    limit?: number
    detailRule: Pick<SiteRuleDefinition, 'mode' | 'selectors' | 'extract'>
  }
}

export type LlmProvider = 'openai-compatible'

export interface LlmConfig {
  enabled: boolean
  provider: LlmProvider
  baseUrl: string
  model: string
  apiKey?: string
  temperature: number
  maxItems: number
  batchSize: number
}

